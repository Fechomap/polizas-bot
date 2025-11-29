// src/comandos/comandos/VehicleVisionHandler.ts
// Handler simplificado para registro de vehiculos con IA Vision
// Flujo: Fotos -> Clasificar -> Extraer datos -> Confirmar -> Guardar

import { getVehicleVisionService, IDatosVehiculo } from '../../services/VehicleVisionService';
import { getInstance as getCloudflareStorage } from '../../services/CloudflareStorage';
import { VehicleController } from '../../controllers/vehicleController';
import { generarDatosMexicanosReales } from '../../utils/mexicanDataGenerator';
import StateKeyManager from '../../utils/StateKeyManager';
import logger from '../../utils/logger';
import stateCleanupService from '../../utils/StateCleanupService';
import type { Telegraf } from 'telegraf';

// Estados simples
export const ESTADOS = {
    ESPERANDO_FOTOS: 'esperando_fotos',
    PROCESANDO: 'procesando',
    CONFIRMANDO: 'confirmando',
    CORRIGIENDO: 'corrigiendo',
    REINTENTANDO_TARJETA: 'reintentando_tarjeta',
    COMPLETADO: 'completado'
} as const;

type Estado = (typeof ESTADOS)[keyof typeof ESTADOS];

// Campos del vehiculo
const CAMPOS = ['serie', 'marca', 'submarca', 'año', 'color', 'placas'] as const;
type Campo = (typeof CAMPOS)[number];

// Configuración de tiempos (en ms)
const TIMEOUTS = {
    BATCH_PROCESS: 3000, // Tiempo de espera para agrupar fotos antes de procesar
    SESSION_EXPIRE: 10 * 60 * 1000 // Expiración de sesión (10 minutos)
} as const;

// Discrepancia detectada entre intentos
interface IDiscrepancia {
    campo: string;
    valorAnterior: string;
    valorNuevo: string;
}

// Registro en proceso
interface IRegistro {
    estado: Estado;
    chatId: number;
    threadId: string | null;
    datos: IDatosVehiculo;
    fotos: Array<{ url: string; key: string }>;
    placasValidadas: boolean;
    campoEditando?: Campo;
    timeout?: NodeJS.Timeout;
    fotosBuffer: Buffer[];
    mensajeId?: number;
    // Nuevos campos para tracking
    placasDeVehiculo: string | null; // Placas extraidas de fotos del auto
    placasDeTarjeta: boolean; // Si las placas vinieron de tarjeta
    discrepancias: IDiscrepancia[]; // Discrepancias detectadas
}

// Almacen de registros
export const registros = StateKeyManager.createThreadSafeStateMap<IRegistro>();

// Registrar cleanup para estados huérfanos (evita fugas de memoria)
const visionCleanupProvider = {
    async cleanup(_cutoffTime: number): Promise<number> {
        let removed = 0;
        const internalMap = registros.getInternalMap();

        for (const [key, registro] of internalMap.entries()) {
            // Eliminar registros sin timeout activo (abandonados)
            if (!registro.timeout) {
                if (registro.timeout) clearTimeout(registro.timeout);
                internalMap.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            logger.info(`VehicleVisionHandler: ${removed} registros huérfanos limpiados`);
        }
        return removed;
    }
};
stateCleanupService.registerStateProvider(visionCleanupProvider, 'VehicleVisionHandler');

/**
 * Handler principal de Vision para vehiculos
 */
export class VehicleVisionHandler {
    /**
     * Inicia el flujo de registro
     */
    static async iniciar(
        bot: Telegraf,
        chatId: number,
        userId: number,
        threadId: string | null
    ): Promise<boolean> {
        const key = this.getKey(userId, chatId, threadId);

        const vision = getVehicleVisionService();
        if (!vision.isConfigured()) {
            await this.enviar(
                bot,
                chatId,
                threadId,
                '❌ Servicio de IA no disponible. Usa registro manual.'
            );
            return false;
        }

        // Limpiar registro previo
        registros.delete(key);

        // Crear nuevo registro
        registros.set(key, {
            estado: ESTADOS.ESPERANDO_FOTOS,
            chatId,
            threadId,
            datos: {
                serie: null,
                marca: null,
                submarca: null,
                año: null,
                color: null,
                placas: null
            },
            fotos: [],
            placasValidadas: false,
            fotosBuffer: [],
            placasDeVehiculo: null,
            placasDeTarjeta: false,
            discrepancias: []
        });

        await this.enviar(
            bot,
            chatId,
            threadId,
            '📸 *REGISTRO DE VEHICULO*\n\n' +
                'Envia las fotos:\n' +
                '• Tarjeta de Circulacion\n' +
                '• Fotos del auto\n\n' +
                '_Puedes enviar varias fotos juntas_',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Registro manual', callback_data: 'vision_manual' }],
                        [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                    ]
                }
            }
        );

        logger.info(`Vision: Registro iniciado para ${userId}`);
        return true;
    }

    /**
     * Procesa una foto recibida (silencioso - no muestra mensajes)
     */
    static async procesarFoto(
        bot: Telegraf,
        chatId: number,
        userId: number,
        threadId: string | null,
        fileId: string
    ): Promise<boolean> {
        const key = this.getKey(userId, chatId, threadId);
        const registro = registros.get(key);

        if (!registro) return false;

        // Solo aceptar fotos en estados validos
        if (
            registro.estado !== ESTADOS.ESPERANDO_FOTOS &&
            registro.estado !== ESTADOS.REINTENTANDO_TARJETA
        ) {
            return false;
        }

        try {
            // Descargar foto
            const fileLink = await bot.telegram.getFileLink(fileId);
            const response = await fetch(fileLink.href);
            const buffer = Buffer.from(await response.arrayBuffer());

            // Si es reintento de tarjeta, procesar inmediatamente
            if (registro.estado === ESTADOS.REINTENTANDO_TARJETA) {
                await this.procesarReintentoTarjeta(bot, key, buffer);
                return true;
            }

            // Flujo normal: agregar al buffer
            registro.fotosBuffer.push(buffer);

            // Cancelar timeout anterior
            if (registro.timeout) clearTimeout(registro.timeout);

            // Timeout configurable para agrupar fotos antes de procesar
            registro.timeout = setTimeout(() => {
                this.procesarBatch(bot, key).catch(err =>
                    logger.error('Error procesando batch:', err)
                );
            }, TIMEOUTS.BATCH_PROCESS);

            registros.set(key, registro);
            return true;
        } catch (error) {
            logger.error('Error procesando foto:', error);
            return true;
        }
    }

    /**
     * Procesa reintento de tarjeta (solo actualiza datos faltantes)
     */
    private static async procesarReintentoTarjeta(
        bot: Telegraf,
        key: string,
        buffer: Buffer
    ): Promise<void> {
        const registro = registros.get(key);
        if (!registro) return;

        const { chatId, threadId } = registro;

        await this.enviar(bot, chatId, threadId, '🔄 *Analizando tarjeta...*', {
            parse_mode: 'Markdown'
        });

        try {
            const vision = getVehicleVisionService();
            const storage = getCloudflareStorage();
            const resultado = await vision.analizarImagen(buffer);

            if (!resultado.success || resultado.tipo !== 'tarjeta' || !resultado.datos) {
                await this.enviar(
                    bot,
                    chatId,
                    threadId,
                    '❌ *No se pudo leer la tarjeta*\n\nIntenta con otra foto o corrige manual.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '📷 Intentar de nuevo',
                                        callback_data: 'vision_reintentar'
                                    }
                                ],
                                [{ text: '✏️ Corregir manual', callback_data: 'vision_corregir' }],
                                [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                            ]
                        }
                    }
                );
                return;
            }

            const datosNuevos = resultado.datos;
            let actualizados = 0;
            registro.discrepancias = [];

            // Procesar cada campo: actualizar vacios O detectar discrepancias
            const procesarCampo = (campo: Campo, valorNuevo: any) => {
                if (!valorNuevo) return;

                const valorActual = registro.datos[campo];

                // Si campo vacio -> actualizar
                if (!valorActual) {
                    registro.datos[campo] = valorNuevo;
                    actualizados++;
                    // Si es placas, marcar que vienen de tarjeta
                    if (campo === 'placas') {
                        registro.placasDeTarjeta = true;
                    }
                }
                // Si campo tiene valor diferente -> agregar discrepancia (NO reemplazar)
                else {
                    const actual = String(valorActual).toUpperCase().trim();
                    const nuevo = String(valorNuevo).toUpperCase().trim();
                    if (actual !== nuevo) {
                        registro.discrepancias.push({
                            campo,
                            valorAnterior: String(valorActual),
                            valorNuevo: String(valorNuevo)
                        });
                    }
                }
            };

            procesarCampo('serie', datosNuevos.serie);
            procesarCampo('marca', datosNuevos.marca);
            procesarCampo('submarca', datosNuevos.submarca);
            procesarCampo('año', datosNuevos.año);
            procesarCampo('color', datosNuevos.color);
            procesarCampo('placas', datosNuevos.placas);

            // Validar placas del vehiculo vs nueva tarjeta
            if (registro.placasDeVehiculo && datosNuevos.placas) {
                const placasVehiculo = registro.placasDeVehiculo.replace(/-/g, '').toUpperCase();
                const placasTarjeta = datosNuevos.placas.replace(/-/g, '').toUpperCase();
                if (placasVehiculo === placasTarjeta) {
                    registro.placasValidadas = true;
                    logger.info(`Placas validadas en reintento: ${placasTarjeta}`);
                }
            }

            // Guardar segunda tarjeta en Cloudflare
            const serie = registro.datos.serie ?? `temp_${Date.now()}`;
            const fileName = `vehiculos/${serie}/tarjeta2_${Date.now()}.jpg`;
            const upload = await storage.uploadFile(buffer, fileName, 'image/jpeg');
            if (upload.url) {
                registro.fotos.push({ url: upload.url, key: upload.key });
                logger.info(`Segunda tarjeta guardada: ${fileName}`);
            }

            registro.estado = ESTADOS.CONFIRMANDO;
            registros.set(key, registro);

            // Mensaje de actualizacion
            if (actualizados > 0) {
                await this.enviar(
                    bot,
                    chatId,
                    threadId,
                    `✅ *${actualizados} dato${actualizados > 1 ? 's' : ''} actualizado${actualizados > 1 ? 's' : ''}*`,
                    { parse_mode: 'Markdown' }
                );
            }

            // Enviar alertas de discrepancias (mensajes separados para facil copiar)
            if (registro.discrepancias.length > 0) {
                await this.enviarAlertas(bot, registro);
            }

            await this.mostrarConfirmacion(bot, registro);
        } catch (error) {
            logger.error('Error en reintento tarjeta:', error);
            await this.enviar(bot, chatId, threadId, '❌ Error procesando. Intenta de nuevo.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📷 Reintentar', callback_data: 'vision_reintentar' }],
                        [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                    ]
                }
            });
        }
    }

    /**
     * Envia alertas de discrepancias (mensajes separados para facil copiar/pegar)
     */
    private static async enviarAlertas(bot: Telegraf, registro: IRegistro): Promise<void> {
        const { chatId, threadId, discrepancias } = registro;

        const nombresAmigables: Record<string, string> = {
            serie: 'SERIE (VIN)',
            marca: 'MARCA',
            submarca: 'MODELO',
            año: 'AÑO',
            color: 'COLOR',
            placas: 'PLACAS'
        };

        for (const disc of discrepancias) {
            const nombre = nombresAmigables[disc.campo] ?? disc.campo.toUpperCase();

            // Mensaje 1: Alerta
            await this.enviar(bot, chatId, threadId, `⚠️ *ALERTA: ${nombre} detectado diferente*`, {
                parse_mode: 'Markdown'
            });

            // Mensaje 2: Valores separados para facil copiar
            await this.enviar(
                bot,
                chatId,
                threadId,
                `Actual: \`${disc.valorAnterior}\`\nDetectado: \`${disc.valorNuevo}\``,
                { parse_mode: 'Markdown' }
            );
        }

        // Limpiar discrepancias despues de mostrar
        registro.discrepancias = [];
    }

    /**
     * Fuerza el procesamiento del batch
     */
    static async forzarProcesar(bot: Telegraf, key: string): Promise<void> {
        const registro = registros.get(key);
        if (registro?.timeout) {
            clearTimeout(registro.timeout);
            registro.timeout = undefined;
        }
        await this.procesarBatch(bot, key);
    }

    /**
     * Procesa el batch de fotos
     */
    private static async procesarBatch(bot: Telegraf, key: string): Promise<void> {
        const registro = registros.get(key);
        if (!registro || registro.fotosBuffer.length === 0) return;

        const { chatId, threadId } = registro;
        registro.estado = ESTADOS.PROCESANDO;
        registro.timeout = undefined;
        registros.set(key, registro);

        // Mensaje de procesando
        await this.enviar(
            bot,
            chatId,
            threadId,
            `🔄 *Procesando ${registro.fotosBuffer.length} fotos...*`,
            { parse_mode: 'Markdown' }
        );

        try {
            const vision = getVehicleVisionService();
            const storage = getCloudflareStorage();

            let tarjetaEncontrada = false;
            let tarjetaBuffer: Buffer | null = null;

            // Analizar cada foto
            for (const buffer of registro.fotosBuffer) {
                const resultado = await vision.analizarImagen(buffer);

                if (!resultado.success) continue;

                if (resultado.tipo === 'tarjeta' && resultado.datos) {
                    // Guardar datos de tarjeta
                    tarjetaEncontrada = true;
                    tarjetaBuffer = buffer;
                    Object.entries(resultado.datos).forEach(([campo, valor]) => {
                        if (valor && !registro.datos[campo as Campo]) {
                            registro.datos[campo as Campo] = valor;
                            // Marcar si placas vienen de tarjeta
                            if (campo === 'placas') {
                                registro.placasDeTarjeta = true;
                            }
                        }
                    });
                }

                if (resultado.tipo === 'vehiculo') {
                    // Color del auto
                    if (resultado.colorDetectado && !registro.datos.color) {
                        registro.datos.color = resultado.colorDetectado;
                    }

                    // Extraer placas del vehiculo
                    if (resultado.placasDetectadas?.length) {
                        const primeraPlaca = resultado.placasDetectadas[0];

                        // Si NO hay placas de tarjeta, usar las del vehiculo como respaldo
                        if (!registro.datos.placas) {
                            registro.datos.placas = primeraPlaca;
                            registro.placasDeVehiculo = primeraPlaca;
                            registro.placasDeTarjeta = false;
                            logger.info(`Placas extraidas del vehiculo: ${primeraPlaca}`);
                        }
                        // Si SÍ hay placas de tarjeta, validar coincidencia
                        else {
                            const placasNorm = registro.datos.placas
                                .replace(/-/g, '')
                                .toUpperCase();
                            for (const detectada of resultado.placasDetectadas) {
                                if (detectada.replace(/-/g, '').toUpperCase() === placasNorm) {
                                    registro.placasValidadas = true;
                                    break;
                                }
                            }
                        }
                    }

                    // Subir foto de vehiculo
                    const serie = registro.datos.serie ?? `temp_${Date.now()}`;
                    const fileName = `vehiculos/${serie}/${Date.now()}.jpg`;
                    const upload = await storage.uploadFile(buffer, fileName, 'image/jpeg');
                    if (upload.url) {
                        registro.fotos.push({ url: upload.url, key: upload.key });
                    }
                }
            }

            // Subir foto de tarjeta a Cloudflare
            if (tarjetaBuffer) {
                const serie = registro.datos.serie ?? `temp_${Date.now()}`;
                const fileName = `vehiculos/${serie}/tarjeta_${Date.now()}.jpg`;
                const upload = await storage.uploadFile(tarjetaBuffer, fileName, 'image/jpeg');
                if (upload.url) {
                    registro.fotos.push({ url: upload.url, key: upload.key });
                    logger.info(`Tarjeta guardada: ${fileName}`);
                }
            }

            // Limpiar buffer
            registro.fotosBuffer = [];

            if (!tarjetaEncontrada) {
                registro.estado = ESTADOS.ESPERANDO_FOTOS;
                registros.set(key, registro);

                await this.enviar(
                    bot,
                    chatId,
                    threadId,
                    '❌ *No se detecto tarjeta de circulacion*\n\n' +
                        'Envia una foto clara de la tarjeta.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Registro manual', callback_data: 'vision_manual' }],
                                [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                            ]
                        }
                    }
                );
                return;
            }

            // Mostrar datos para confirmar
            registro.estado = ESTADOS.CONFIRMANDO;
            registros.set(key, registro);

            await this.mostrarConfirmacion(bot, registro);
        } catch (error) {
            logger.error('Error en procesarBatch:', error);
            registro.estado = ESTADOS.ESPERANDO_FOTOS;
            registro.fotosBuffer = [];
            registros.set(key, registro);

            await this.enviar(
                bot,
                chatId,
                threadId,
                '❌ Error procesando fotos. Intenta de nuevo.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                        ]
                    }
                }
            );
        }
    }

    /**
     * Muestra datos para confirmacion
     */
    private static async mostrarConfirmacion(bot: Telegraf, registro: IRegistro): Promise<void> {
        const { datos, fotos, placasValidadas, placasDeTarjeta, chatId, threadId } = registro;

        // Determinar texto de placas segun fuente
        let placasTexto = '❌ Placas: _falta_\n';
        if (datos.placas) {
            if (placasValidadas) {
                placasTexto = `✅ Placas: ${datos.placas} ✓ _(validadas en foto)_\n`;
            } else if (!placasDeTarjeta) {
                placasTexto = `✅ Placas: ${datos.placas} _(detectadas en foto del auto)_\n`;
            } else {
                placasTexto = `✅ Placas: ${datos.placas}\n`;
            }
        }

        let msg = '📋 *DATOS EXTRAIDOS*\n\n';
        msg += datos.serie ? `✅ Serie: \`${datos.serie}\`\n` : '❌ Serie: _falta_\n';
        msg += datos.marca ? `✅ Marca: ${datos.marca}\n` : '❌ Marca: _falta_\n';
        msg += datos.submarca ? `✅ Modelo: ${datos.submarca}\n` : '❌ Modelo: _falta_\n';
        msg += datos.año ? `✅ Año: ${datos.año}\n` : '❌ Año: _falta_\n';
        msg += datos.color ? `✅ Color: ${datos.color}\n` : '❌ Color: _falta_\n';
        msg += placasTexto;

        if (fotos.length > 0) {
            msg += `\n📷 ${fotos.length} fotos guardadas`;
        }

        msg += '\n\n¿Los datos son correctos?';

        // Verificar si faltan campos obligatorios
        const faltantes = CAMPOS.filter(c => !datos[c]);

        if (faltantes.length > 0) {
            msg = '📋 *DATOS EXTRAIDOS* (faltan algunos)\n\n';
            msg += datos.serie ? `✅ Serie: \`${datos.serie}\`\n` : '❌ Serie: _falta_\n';
            msg += datos.marca ? `✅ Marca: ${datos.marca}\n` : '❌ Marca: _falta_\n';
            msg += datos.submarca ? `✅ Modelo: ${datos.submarca}\n` : '❌ Modelo: _falta_\n';
            msg += datos.año ? `✅ Año: ${datos.año}\n` : '❌ Año: _falta_\n';
            msg += datos.color ? `✅ Color: ${datos.color}\n` : '❌ Color: _falta_\n';
            msg += placasTexto;
            msg += '\n⚠️ *Faltan datos - elige una opcion:*';
        }

        await this.enviar(bot, chatId, threadId, msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard:
                    faltantes.length > 0
                        ? [
                              [{ text: '📷 Reenviar tarjeta', callback_data: 'vision_reintentar' }],
                              [{ text: '✏️ Corregir manual', callback_data: 'vision_corregir' }],
                              [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                          ]
                        : [
                              [{ text: '✅ Confirmar', callback_data: 'vision_confirmar' }],
                              [{ text: '✏️ Corregir', callback_data: 'vision_corregir' }],
                              [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                          ]
            }
        });
    }

    /**
     * Inicia reintento de tarjeta (para completar datos faltantes)
     */
    static async iniciarReintentoTarjeta(bot: Telegraf, key: string): Promise<void> {
        const registro = registros.get(key);
        if (!registro) return;

        registro.estado = ESTADOS.REINTENTANDO_TARJETA;
        registro.fotosBuffer = [];
        registros.set(key, registro);

        await this.enviar(
            bot,
            registro.chatId,
            registro.threadId,
            '📷 *REENVIAR TARJETA*\n\n' +
                'Envia otra foto de la tarjeta de circulacion.\n' +
                '_Solo se actualizaran los datos faltantes_',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Volver', callback_data: 'vision_volver' }],
                        [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                    ]
                }
            }
        );
    }

    /**
     * Muestra menu de correccion
     */
    static async mostrarMenuCorreccion(bot: Telegraf, key: string): Promise<void> {
        const registro = registros.get(key);
        if (!registro) return;

        const { datos, chatId, threadId } = registro;
        registro.estado = ESTADOS.CORRIGIENDO;
        registros.set(key, registro);

        let msg = '✏️ *SELECCIONA EL CAMPO A CORREGIR*\n\n';
        msg += `Serie: ${datos.serie ?? '_sin dato_'}\n`;
        msg += `Marca: ${datos.marca ?? '_sin dato_'}\n`;
        msg += `Modelo: ${datos.submarca ?? '_sin dato_'}\n`;
        msg += `Año: ${datos.año ?? '_sin dato_'}\n`;
        msg += `Color: ${datos.color ?? '_sin dato_'}\n`;
        msg += `Placas: ${datos.placas ?? '_sin dato_'}`;

        await this.enviar(bot, chatId, threadId, msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔢 Serie', callback_data: 'vision_editar:serie' },
                        { text: '🚗 Marca', callback_data: 'vision_editar:marca' }
                    ],
                    [
                        { text: '📋 Modelo', callback_data: 'vision_editar:submarca' },
                        { text: '📅 Año', callback_data: 'vision_editar:año' }
                    ],
                    [
                        { text: '🎨 Color', callback_data: 'vision_editar:color' },
                        { text: '🔖 Placas', callback_data: 'vision_editar:placas' }
                    ],
                    [{ text: '⬅️ Volver', callback_data: 'vision_volver' }]
                ]
            }
        });
    }

    /**
     * Inicia edicion de un campo
     */
    static async iniciarEdicion(bot: Telegraf, key: string, campo: Campo): Promise<void> {
        const registro = registros.get(key);
        if (!registro) return;

        registro.campoEditando = campo;
        registros.set(key, registro);

        const nombres: Record<Campo, string> = {
            serie: 'Serie (VIN)',
            marca: 'Marca',
            submarca: 'Modelo',
            año: 'Año',
            color: 'Color',
            placas: 'Placas'
        };

        await this.enviar(
            bot,
            registro.chatId,
            registro.threadId,
            `✏️ *Editando ${nombres[campo]}*\n\n` +
                `Valor actual: ${registro.datos[campo] ?? '_sin dato_'}\n\n` +
                `Escribe el nuevo valor:`,
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Procesa texto ingresado (para edicion)
     */
    static async procesarTexto(
        bot: Telegraf,
        chatId: number,
        userId: number,
        threadId: string | null,
        texto: string
    ): Promise<boolean> {
        const key = this.getKey(userId, chatId, threadId);
        const registro = registros.get(key);

        if (!registro || registro.estado !== ESTADOS.CORRIGIENDO || !registro.campoEditando) {
            return false;
        }

        const campo = registro.campoEditando;
        const valor = texto.trim();

        // Validar segun campo
        let valido = true;
        let valorFinal: any = valor;
        let error = '';

        switch (campo) {
            case 'serie':
                const serieClean = valor.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                if (serieClean.length !== 17) {
                    valido = false;
                    error = 'La serie debe tener 17 caracteres';
                } else {
                    valorFinal = serieClean;
                }
                break;
            case 'año':
                const num = parseInt(valor);
                if (isNaN(num) || num < 1990 || num > new Date().getFullYear() + 1) {
                    valido = false;
                    error = 'Año invalido (1990-actual)';
                } else {
                    valorFinal = num;
                }
                break;
            default:
                valorFinal = valor.toUpperCase();
        }

        if (!valido) {
            await this.enviar(bot, chatId, threadId, `❌ ${error}\n\nIntenta de nuevo:`);
            return true;
        }

        // Guardar valor
        registro.datos[campo] = valorFinal;
        registro.campoEditando = undefined;
        registro.estado = ESTADOS.CONFIRMANDO;
        registros.set(key, registro);

        await this.enviar(bot, chatId, threadId, `✅ ${campo} actualizado`);
        await this.mostrarConfirmacion(bot, registro);
        return true;
    }

    /**
     * Vuelve a confirmacion desde edicion
     */
    static async volverConfirmacion(bot: Telegraf, key: string): Promise<void> {
        const registro = registros.get(key);
        if (!registro) return;

        registro.estado = ESTADOS.CONFIRMANDO;
        registro.campoEditando = undefined;
        registros.set(key, registro);

        await this.mostrarConfirmacion(bot, registro);
    }

    /**
     * Confirma y guarda el vehiculo
     */
    static async confirmar(bot: Telegraf, key: string, userId: string): Promise<void> {
        const registro = registros.get(key);
        if (!registro) return;

        const { datos, fotos, placasValidadas, chatId, threadId } = registro;

        // Verificar campos obligatorios
        const faltantes = CAMPOS.filter(c => !datos[c]);
        if (faltantes.length > 0) {
            await this.enviar(
                bot,
                chatId,
                threadId,
                `❌ Faltan datos: ${faltantes.join(', ')}\n\nCorrige los campos faltantes.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✏️ Corregir', callback_data: 'vision_corregir' }]
                        ]
                    }
                }
            );
            return;
        }

        // Verificar minimo 1 foto
        if (fotos.length === 0) {
            await this.enviar(
                bot,
                chatId,
                threadId,
                '❌ Se requiere al menos 1 foto del vehiculo.\n\n' + 'Envia fotos del auto.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                        ]
                    }
                }
            );
            registro.estado = ESTADOS.ESPERANDO_FOTOS;
            registros.set(key, registro);
            return;
        }

        try {
            // Generar datos del titular
            const datosGenerados = await generarDatosMexicanosReales();

            const vehicleData = {
                serie: datos.serie!,
                marca: datos.marca!,
                submarca: datos.submarca!,
                año: datos.año!,
                color: datos.color!,
                placas: datos.placas!,
                ...datosGenerados
            };

            const resultado = await VehicleController.registrarVehiculo(vehicleData, userId);

            if (!resultado.success || !resultado.vehicle) {
                throw new Error(resultado.error ?? 'Error desconocido');
            }

            // Vincular fotos
            if (fotos.length > 0) {
                await VehicleController.vincularFotosCloudflare(
                    String(resultado.vehicle._id),
                    fotos.map(f => ({
                        ...f,
                        originalname: 'foto.jpg',
                        size: 0,
                        uploadedAt: new Date()
                    }))
                );
            }

            // Mensaje de exito
            let msg = '🎉 *VEHICULO REGISTRADO*\n\n';
            msg += `🚗 ${datos.marca} ${datos.submarca} ${datos.año}\n`;
            msg += `🔢 Serie: \`${datos.serie}\`\n`;
            msg += `🔖 Placas: ${datos.placas}\n`;
            msg += `👤 ${datosGenerados.titular}\n`;
            msg += `📷 ${fotos.length} fotos\n`;
            msg += placasValidadas ? '✅ Placas validadas' : '⚠️ Placas no validadas';

            await this.enviar(bot, chatId, threadId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏠 Menu Principal', callback_data: 'accion:volver_menu' }]
                    ]
                }
            });

            // Limpiar registro
            registros.delete(key);
            logger.info(`Vision: Vehiculo registrado ${datos.serie}`);
        } catch (error: any) {
            logger.error('Error guardando vehiculo:', error);
            await this.enviar(
                bot,
                chatId,
                threadId,
                `❌ Error: ${error.message ?? 'No se pudo guardar'}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Reintentar', callback_data: 'vision_confirmar' }],
                            [{ text: '❌ Cancelar', callback_data: 'vision_cancelar' }]
                        ]
                    }
                }
            );
        }
    }

    /**
     * Cancela el registro
     */
    static cancelar(userId: number, chatId: number, threadId: string | null): void {
        const key = this.getKey(userId, chatId, threadId);
        const registro = registros.get(key);
        if (registro?.timeout) clearTimeout(registro.timeout);
        registros.delete(key);
    }

    /**
     * Verifica si hay registro activo
     */
    static tieneRegistro(userId: number, chatId: number, threadId: string | null): boolean {
        return registros.has(this.getKey(userId, chatId, threadId));
    }

    /**
     * Obtiene el registro
     */
    static getRegistro(
        userId: number,
        chatId: number,
        threadId: string | null
    ): IRegistro | undefined {
        return registros.get(this.getKey(userId, chatId, threadId));
    }

    // Helpers
    private static getKey(userId: number, chatId: number, threadId: string | null): string {
        return `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
    }

    static getKeyFromIds(userId: number | string, chatId: number, threadId: string | null): string {
        return `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
    }

    private static async enviar(
        bot: Telegraf,
        chatId: number,
        threadId: string | null,
        texto: string,
        options: any = {}
    ): Promise<any> {
        const opts = { ...options };
        if (threadId) opts.message_thread_id = parseInt(threadId);
        return await bot.telegram.sendMessage(chatId, texto, opts);
    }
}

export default VehicleVisionHandler;
