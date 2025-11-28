// src/comandos/comandos/VehicleOCRHandler.ts
// Handler para registro de vehículos usando OCR de tarjeta de circulación

import {
    getInstance as getMistralVision,
    IDatosTarjetaCirculacion
} from '../../services/MistralVisionService';
import { getInstance as getPlacasValidator } from '../../services/PlacasValidator';
import { getInstance as getCloudflareStorage } from '../../services/CloudflareStorage';
import { VehicleController } from '../../controllers/vehicleController';
import { generarDatosMexicanosReales } from '../../utils/mexicanDataGenerator';
import StateKeyManager from '../../utils/StateKeyManager';
// No usamos getMainKeyboard directamente aquí para evitar problemas de tipos
import logger from '../../utils/logger';
import type { Telegraf } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';

/**
 * Estados del flujo de registro con OCR
 */
export const ESTADOS_OCR_VEHICULO = {
    ESPERANDO_TARJETA: 'esperando_tarjeta', // Esperando foto de tarjeta de circulación
    CONFIRMANDO_DATOS: 'confirmando_datos', // Usuario revisa datos extraídos
    ESPERANDO_DATO_FALTANTE: 'esperando_dato', // Pidiendo dato que no se pudo extraer
    ESPERANDO_FOTOS_VEHICULO: 'esperando_fotos', // Esperando fotos del vehículo
    VALIDANDO_PLACAS: 'validando_placas', // Validando placas en fotos
    COMPLETADO: 'completado'
} as const;

export type EstadoOCRVehiculo = (typeof ESTADOS_OCR_VEHICULO)[keyof typeof ESTADOS_OCR_VEHICULO];

/**
 * Datos del registro OCR en proceso
 */
interface IRegistroOCR {
    estado: EstadoOCRVehiculo;
    chatId: number;
    threadId: string | null;
    // Datos de la tarjeta de circulación
    datosOCR: Partial<IDatosTarjetaCirculacion>;
    // Datos corregidos/completados por el usuario
    datosConfirmados: {
        serie?: string;
        marca?: string;
        submarca?: string;
        año?: number;
        color?: string;
        placas?: string;
    };
    // Fotos del vehículo
    fotos: Array<{
        url: string;
        key: string;
        originalname: string;
        size: number;
        uploadedAt: Date;
    }>;
    // Campo actual que se está pidiendo
    campoActual?: string;
    // Lista de campos faltantes por pedir
    camposFaltantes: string[];
    // Datos generados para el titular
    datosGenerados?: any;
    // ID del mensaje de estado (para editar)
    mensajeEstadoId: number | null;
    // Timestamp de inicio
    iniciado: Date;
    // Validación de placas
    placasValidadas: boolean;
    resultadoValidacionPlacas?: string;
}

interface ISendOptions {
    parse_mode?: 'Markdown' | 'HTML';
    message_thread_id?: number;
    reply_markup?: any;
}

/**
 * Almacena registros OCR en proceso
 */
export const registrosOCR = StateKeyManager.createThreadSafeStateMap<IRegistroOCR>();

/**
 * Campos esenciales que deben estar presentes
 */
const CAMPOS_ESENCIALES = ['serie', 'marca', 'submarca', 'año', 'color', 'placas'];

/**
 * Nombres amigables para los campos
 */
const NOMBRES_CAMPOS: Record<string, string> = {
    serie: 'Número de Serie (VIN)',
    marca: 'Marca',
    submarca: 'Modelo',
    año: 'Año',
    color: 'Color',
    placas: 'Placas'
};

/**
 * Handler para registro de vehículos con OCR de tarjeta de circulación
 */
export class VehicleOCRHandler {
    /**
     * Inicia el flujo de registro con OCR
     */
    static async iniciarRegistroOCR(
        bot: Telegraf,
        chatId: number,
        userId: number,
        threadId: string | null = null
    ): Promise<boolean> {
        try {
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;

            // Verificar si Mistral Vision está configurado
            const mistralVision = getMistralVision();
            if (!mistralVision.isConfigured()) {
                const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
                if (threadId) sendOptions.message_thread_id = parseInt(threadId);

                await bot.telegram.sendMessage(
                    chatId,
                    '⚠️ *El servicio de OCR no está disponible.*\n\n' +
                        'Por favor, usa el registro manual.',
                    sendOptions
                );
                return false;
            }

            // Limpiar registro previo
            registrosOCR.delete(stateKey);

            // Mensaje inicial pidiendo la tarjeta de circulación
            const mensaje =
                '📸 *REGISTRO DE AUTO CON OCR*\n\n' +
                '1️⃣ Envía una *foto clara* de la *Tarjeta de Circulación*\n\n' +
                '💡 *Tips para mejor resultado:*\n' +
                '• Buena iluminación\n' +
                '• Imagen nítida y enfocada\n' +
                '• Que se lean todos los datos\n\n' +
                '_Extraeré automáticamente los datos del vehículo_';

            const sendOptions: ISendOptions = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📝 Mejor registro manual',
                                callback_data: 'vehiculo_ocr_manual'
                            }
                        ],
                        [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
                    ]
                }
            };
            if (threadId) sendOptions.message_thread_id = parseInt(threadId);

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            // Inicializar estado
            registrosOCR.set(stateKey, {
                estado: ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA,
                chatId,
                threadId,
                datosOCR: {},
                datosConfirmados: {},
                fotos: [],
                camposFaltantes: [],
                mensajeEstadoId: null,
                iniciado: new Date(),
                placasValidadas: false
            });

            logger.info(`Registro OCR iniciado para usuario ${userId}`);
            return true;
        } catch (error) {
            logger.error('Error iniciando registro OCR:', error);
            return false;
        }
    }

    /**
     * Procesa una imagen recibida (tarjeta o foto de vehículo)
     */
    static async procesarImagen(bot: Telegraf, msg: Message, userId: number): Promise<boolean> {
        const chatId = msg.chat.id;
        const threadId = (msg as any).message_thread_id || null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;

        const registro = registrosOCR.get(stateKey);
        if (!registro) return false;

        // Verificar que es una foto
        const photo = (msg as any).photo;
        if (!photo?.length) return false;

        try {
            // Obtener la foto de mejor calidad
            const mejorFoto = photo[photo.length - 1];

            // Descargar la imagen
            const fileLink = await bot.telegram.getFileLink(mejorFoto.file_id);
            const response = await fetch(fileLink.href);
            if (!response.ok) throw new Error(`Error descargando imagen: ${response.status}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Procesar según el estado actual
            switch (registro.estado) {
                case ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA:
                    return await this.procesarTarjetaCirculacion(
                        bot,
                        chatId,
                        userId,
                        buffer,
                        registro,
                        stateKey
                    );

                case ESTADOS_OCR_VEHICULO.ESPERANDO_FOTOS_VEHICULO:
                    return await this.procesarFotoVehiculo(
                        bot,
                        chatId,
                        userId,
                        buffer,
                        registro,
                        stateKey
                    );

                default:
                    return false;
            }
        } catch (error) {
            logger.error('Error procesando imagen:', error);

            const sendOptions: ISendOptions = {};
            if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al procesar la imagen. Por favor, intenta nuevamente.',
                sendOptions
            );
            return true;
        }
    }

    /**
     * Procesa la imagen de la tarjeta de circulación con OCR
     */
    private static async procesarTarjetaCirculacion(
        bot: Telegraf,
        chatId: number,
        userId: number,
        imageBuffer: Buffer,
        registro: IRegistroOCR,
        stateKey: string
    ): Promise<boolean> {
        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        // Mensaje de procesamiento
        const msgProcesando = await bot.telegram.sendMessage(
            chatId,
            '🔍 *Analizando tarjeta de circulación...*\n\n' + '⏳ Esto puede tomar unos segundos',
            sendOptions
        );

        try {
            // Llamar al servicio de OCR de visión
            const mistralVision = getMistralVision();
            const resultado = await mistralVision.extraerDatosTarjetaCirculacion(imageBuffer);

            // Eliminar mensaje de procesamiento
            try {
                await bot.telegram.deleteMessage(chatId, msgProcesando.message_id);
            } catch {}

            if (!resultado.success || !resultado.datos) {
                await bot.telegram.sendMessage(
                    chatId,
                    '❌ *No se pudieron extraer los datos*\n\n' +
                        'Por favor, intenta con otra foto más clara o usa el registro manual.',
                    {
                        ...sendOptions,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '📷 Enviar otra foto',
                                        callback_data: 'vehiculo_ocr_reintentar'
                                    }
                                ],
                                [
                                    {
                                        text: '📝 Registro manual',
                                        callback_data: 'vehiculo_ocr_manual'
                                    }
                                ],
                                [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
                            ]
                        }
                    }
                );
                return true;
            }

            // Guardar datos extraídos
            registro.datosOCR = resultado.datos;
            registro.datosConfirmados = {
                serie: resultado.datos.serie || undefined,
                marca: resultado.datos.marca || undefined,
                submarca: resultado.datos.submarca || undefined,
                año: resultado.datos.año || undefined,
                color: resultado.datos.color || undefined,
                placas: resultado.datos.placas || undefined
            };

            // Determinar campos faltantes
            registro.camposFaltantes = CAMPOS_ESENCIALES.filter(
                campo => !resultado.datos![campo as keyof IDatosTarjetaCirculacion]
            );

            logger.info(
                `OCR tarjeta: ${resultado.datos.datosEncontrados.length} datos encontrados, ` +
                    `${registro.camposFaltantes.length} faltantes`
            );

            // Si hay campos faltantes, pedirlos
            if (registro.camposFaltantes.length > 0) {
                registro.estado = ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE;
                registro.campoActual = registro.camposFaltantes[0];
                registrosOCR.set(stateKey, registro);

                await this.mostrarResumenYPedirFaltante(bot, chatId, registro);
                return true;
            }

            // Si todos los datos están completos, pedir confirmación
            registro.estado = ESTADOS_OCR_VEHICULO.CONFIRMANDO_DATOS;
            registrosOCR.set(stateKey, registro);

            await this.pedirConfirmacionDatos(bot, chatId, registro);
            return true;
        } catch (error) {
            logger.error('Error en OCR de tarjeta:', error);

            try {
                await bot.telegram.deleteMessage(chatId, msgProcesando.message_id);
            } catch {}

            await bot.telegram.sendMessage(
                chatId,
                '❌ *Error al procesar la tarjeta*\n\n' +
                    'Por favor, intenta nuevamente o usa el registro manual.',
                {
                    ...sendOptions,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📷 Reintentar', callback_data: 'vehiculo_ocr_reintentar' }],
                            [{ text: '📝 Registro manual', callback_data: 'vehiculo_ocr_manual' }]
                        ]
                    }
                }
            );
            return true;
        }
    }

    /**
     * Muestra resumen de datos y pide el primer dato faltante
     */
    private static async mostrarResumenYPedirFaltante(
        bot: Telegraf,
        chatId: number,
        registro: IRegistroOCR
    ): Promise<void> {
        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        const datos = registro.datosConfirmados;
        const campoFaltante = registro.campoActual!;
        const nombreCampo = NOMBRES_CAMPOS[campoFaltante];

        // Construir resumen de datos encontrados
        let resumen = '📋 *DATOS EXTRAÍDOS:*\n\n';

        if (datos.serie) resumen += `✅ Serie: \`${datos.serie}\`\n`;
        else resumen += '❌ Serie: _falta_\n';

        if (datos.marca) resumen += `✅ Marca: ${datos.marca}\n`;
        else resumen += '❌ Marca: _falta_\n';

        if (datos.submarca) resumen += `✅ Modelo: ${datos.submarca}\n`;
        else resumen += '❌ Modelo: _falta_\n';

        if (datos.año) resumen += `✅ Año: ${datos.año}\n`;
        else resumen += '❌ Año: _falta_\n';

        if (datos.color) resumen += `✅ Color: ${datos.color}\n`;
        else resumen += '❌ Color: _falta_\n';

        if (datos.placas) resumen += `✅ Placas: ${datos.placas}\n`;
        else resumen += '❌ Placas: _falta_\n';

        resumen += `\n📝 *Por favor, ingresa ${nombreCampo}:*`;

        await bot.telegram.sendMessage(chatId, resumen, {
            ...sendOptions,
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]]
            }
        });
    }

    /**
     * Pide confirmación de todos los datos
     */
    private static async pedirConfirmacionDatos(
        bot: Telegraf,
        chatId: number,
        registro: IRegistroOCR
    ): Promise<void> {
        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        const datos = registro.datosConfirmados;

        const mensaje =
            '✅ *DATOS COMPLETOS*\n\n' +
            `🔢 *Serie:* \`${datos.serie}\`\n` +
            `🚗 *Marca:* ${datos.marca}\n` +
            `📋 *Modelo:* ${datos.submarca}\n` +
            `📅 *Año:* ${datos.año}\n` +
            `🎨 *Color:* ${datos.color}\n` +
            `🔖 *Placas:* ${datos.placas}\n\n` +
            '¿Los datos son correctos?';

        await bot.telegram.sendMessage(chatId, mensaje, {
            ...sendOptions,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Confirmar', callback_data: 'vehiculo_ocr_confirmar' },
                        { text: '✏️ Corregir', callback_data: 'vehiculo_ocr_corregir' }
                    ],
                    [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
                ]
            }
        });
    }

    /**
     * Procesa respuesta de texto (para datos faltantes)
     */
    static async procesarTexto(bot: Telegraf, msg: Message, userId: number): Promise<boolean> {
        const chatId = msg.chat.id;
        const threadId = (msg as any).message_thread_id || null;
        const texto = (msg as any).text?.trim();

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const registro = registrosOCR.get(stateKey);

        if (!registro || registro.estado !== ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE) {
            return false;
        }

        if (!texto) return false;

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        const campoActual = registro.campoActual!;

        // Validar el dato según el campo
        const validacion = this.validarDato(campoActual, texto);
        if (!validacion.valido) {
            await bot.telegram.sendMessage(
                chatId,
                `❌ ${validacion.error}\n\nPor favor, ingresa ${NOMBRES_CAMPOS[campoActual]} nuevamente:`,
                sendOptions
            );
            return true;
        }

        // Guardar el dato
        (registro.datosConfirmados as any)[campoActual] = validacion.valor;

        // Quitar de la lista de faltantes
        registro.camposFaltantes = registro.camposFaltantes.filter(c => c !== campoActual);

        // Si hay más campos faltantes, pedir el siguiente
        if (registro.camposFaltantes.length > 0) {
            registro.campoActual = registro.camposFaltantes[0];
            registrosOCR.set(stateKey, registro);

            await bot.telegram.sendMessage(
                chatId,
                `✅ ${NOMBRES_CAMPOS[campoActual]}: *${validacion.valor}*\n\n` +
                    `📝 Ahora ingresa ${NOMBRES_CAMPOS[registro.campoActual]}:`,
                sendOptions
            );
            return true;
        }

        // Todos los datos completos, pedir confirmación
        registro.estado = ESTADOS_OCR_VEHICULO.CONFIRMANDO_DATOS;
        registrosOCR.set(stateKey, registro);

        await this.pedirConfirmacionDatos(bot, chatId, registro);
        return true;
    }

    /**
     * Valida un dato según el campo
     */
    private static validarDato(
        campo: string,
        valor: string
    ): { valido: boolean; error?: string; valor?: any } {
        switch (campo) {
            case 'serie':
                const serie = valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (serie.length !== 17) {
                    return {
                        valido: false,
                        error: 'El número de serie debe tener exactamente 17 caracteres.'
                    };
                }
                return { valido: true, valor: serie };

            case 'marca':
                if (valor.length < 2) {
                    return { valido: false, error: 'La marca debe tener al menos 2 caracteres.' };
                }
                return { valido: true, valor: valor.toUpperCase() };

            case 'submarca':
                if (valor.length < 2) {
                    return { valido: false, error: 'El modelo debe tener al menos 2 caracteres.' };
                }
                return { valido: true, valor: valor.toUpperCase() };

            case 'año':
                const año = parseInt(valor);
                const añoActual = new Date().getFullYear();
                if (isNaN(año) || año < 1900 || año > añoActual + 2) {
                    return {
                        valido: false,
                        error: `El año debe ser un número entre 1900 y ${añoActual + 2}.`
                    };
                }
                return { valido: true, valor: año };

            case 'color':
                if (valor.length < 3) {
                    return { valido: false, error: 'El color debe tener al menos 3 caracteres.' };
                }
                return { valido: true, valor: valor.toUpperCase() };

            case 'placas':
                const placas = valor.toUpperCase().replace(/\s+/g, '');
                if (placas.length < 3) {
                    return {
                        valido: false,
                        error: 'Las placas deben tener al menos 3 caracteres.'
                    };
                }
                return { valido: true, valor: placas };

            default:
                return { valido: true, valor };
        }
    }

    /**
     * Confirma los datos y pasa a pedir fotos del vehículo
     */
    static async confirmarDatos(
        bot: Telegraf,
        chatId: number,
        userId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId ? String(threadId) : null)}`;
        const registro = registrosOCR.get(stateKey);

        if (!registro) return false;

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        // Generar datos del titular
        registro.datosGenerados = await generarDatosMexicanosReales();

        // Cambiar estado a esperando fotos
        registro.estado = ESTADOS_OCR_VEHICULO.ESPERANDO_FOTOS_VEHICULO;
        registrosOCR.set(stateKey, registro);

        const mensaje =
            '✅ *DATOS CONFIRMADOS*\n\n' +
            `👤 *Titular generado:* ${registro.datosGenerados.titular}\n` +
            `📱 *Teléfono:* ${registro.datosGenerados.telefono}\n\n` +
            '📸 *AHORA:* Envía fotos del vehículo\n\n' +
            '💡 *Tip:* Si la foto muestra las placas, validaré que coincidan con *' +
            registro.datosConfirmados.placas +
            '*';

        await bot.telegram.sendMessage(chatId, mensaje, {
            ...sendOptions,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⏭️ Omitir fotos', callback_data: 'vehiculo_ocr_omitir_fotos' }],
                    [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
                ]
            }
        });

        return true;
    }

    /**
     * Procesa una foto del vehículo
     */
    private static async procesarFotoVehiculo(
        bot: Telegraf,
        chatId: number,
        userId: number,
        imageBuffer: Buffer,
        registro: IRegistroOCR,
        stateKey: string
    ): Promise<boolean> {
        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        try {
            // Subir foto a Cloudflare R2
            const storage = getCloudflareStorage();
            const serie = registro.datosConfirmados.serie!;
            const timestamp = Date.now();
            const fileName = `vehiculos/${serie}/${timestamp}_foto_vehiculo.jpg`;

            const uploadResult = await storage.uploadFile(imageBuffer, fileName, 'image/jpeg', {
                vehicleSerie: serie,
                type: 'vehiculo_foto_ocr',
                originalName: `foto_${registro.fotos.length + 1}.jpg`
            });

            if (!uploadResult.url) {
                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al subir la foto. Intenta nuevamente.',
                    sendOptions
                );
                return true;
            }

            // Guardar referencia de la foto
            registro.fotos.push({
                url: uploadResult.url,
                key: uploadResult.key,
                originalname: `foto_${registro.fotos.length + 1}.jpg`,
                size: uploadResult.size || imageBuffer.length,
                uploadedAt: new Date()
            });

            // Intentar detectar y validar placas en la foto
            let mensajeValidacion = '';
            if (!registro.placasValidadas) {
                const validacionResult = await this.validarPlacasEnFoto(
                    imageBuffer,
                    registro.datosConfirmados.placas!
                );

                if (validacionResult.detectadas) {
                    registro.placasValidadas = validacionResult.coinciden;
                    registro.resultadoValidacionPlacas = validacionResult.mensaje;
                    mensajeValidacion = `\n\n${validacionResult.mensaje}`;

                    if (validacionResult.coinciden) {
                        logger.info(
                            `Placas validadas exitosamente: ${registro.datosConfirmados.placas}`
                        );
                    }
                }
            }

            registrosOCR.set(stateKey, registro);

            // Mensaje de confirmación
            const mensaje =
                `✅ *Foto ${registro.fotos.length} subida*` +
                mensajeValidacion +
                '\n\nPuedes enviar más fotos o finalizar el registro.';

            await bot.telegram.sendMessage(chatId, mensaje, {
                ...sendOptions,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: `✅ Finalizar (${registro.fotos.length} fotos)`,
                                callback_data: 'vehiculo_ocr_finalizar'
                            }
                        ],
                        [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
                    ]
                }
            });

            return true;
        } catch (error) {
            logger.error('Error procesando foto de vehículo:', error);
            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al procesar la foto. Intenta nuevamente.',
                sendOptions
            );
            return true;
        }
    }

    /**
     * Valida placas detectadas en una foto contra las de referencia
     */
    private static async validarPlacasEnFoto(
        imageBuffer: Buffer,
        placasReferencia: string
    ): Promise<{ detectadas: boolean; coinciden: boolean; mensaje: string }> {
        try {
            const mistralVision = getMistralVision();
            const resultadoDeteccion = await mistralVision.detectarPlacasEnFoto(imageBuffer);

            if (!resultadoDeteccion.success || resultadoDeteccion.placasDetectadas.length === 0) {
                return {
                    detectadas: false,
                    coinciden: false,
                    mensaje: '📷 _No se detectaron placas en esta foto_'
                };
            }

            // Comparar con placas de referencia
            const validator = getPlacasValidator();
            const comparacion = validator.compararConReferencia(
                placasReferencia,
                resultadoDeteccion.placasDetectadas
            );

            return {
                detectadas: true,
                coinciden: comparacion.coinciden,
                mensaje: comparacion.detalles
            };
        } catch (error) {
            logger.error('Error validando placas:', error);
            return {
                detectadas: false,
                coinciden: false,
                mensaje: '⚠️ _No se pudo validar placas_'
            };
        }
    }

    /**
     * Finaliza el registro y guarda el vehículo
     */
    static async finalizarRegistro(
        bot: Telegraf,
        chatId: number,
        userId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId ? String(threadId) : null)}`;
        const registro = registrosOCR.get(stateKey);

        if (!registro) return false;

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        // Validar que haya al menos 1 foto
        if (registro.fotos.length === 0) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ *Debes enviar al menos 1 foto del vehículo*\n\n' +
                    'Envía una foto o presiona "Omitir fotos" si no tienes.',
                sendOptions
            );
            return false;
        }

        try {
            // Combinar datos del vehículo con datos del titular
            const datosCompletos = {
                ...registro.datosConfirmados,
                ...registro.datosGenerados
            };

            // Crear el vehículo
            const resultado = await VehicleController.registrarVehiculo(datosCompletos, userId);

            if (!resultado.success || !resultado.vehicle) {
                await bot.telegram.sendMessage(
                    chatId,
                    `❌ Error al crear vehículo: ${resultado.error}`,
                    sendOptions
                );
                return false;
            }

            // Vincular fotos al vehículo
            if (registro.fotos.length > 0) {
                await VehicleController.vincularFotosCloudflare(
                    String(resultado.vehicle._id),
                    registro.fotos
                );
            }

            // Mensaje de éxito
            const placasInfo = registro.placasValidadas
                ? '✅ Placas validadas en fotos'
                : '⚠️ Placas no validadas (no visibles en fotos)';

            const mensaje =
                '🎉 *REGISTRO COMPLETADO*\n\n' +
                `🚗 *${registro.datosConfirmados.marca} ${registro.datosConfirmados.submarca} ${registro.datosConfirmados.año}*\n` +
                `🔢 Serie: \`${registro.datosConfirmados.serie}\`\n` +
                `🔖 Placas: ${registro.datosConfirmados.placas}\n` +
                `👤 ${registro.datosGenerados.titular}\n` +
                `📷 Fotos: ${registro.fotos.length}\n\n` +
                `${placasInfo}\n\n` +
                '✅ Vehículo listo para asignar póliza';

            await bot.telegram.sendMessage(chatId, mensaje, {
                ...sendOptions,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏠 Menú Principal', callback_data: 'accion:volver_menu' }]
                    ]
                }
            });

            // Limpiar registro
            registrosOCR.delete(stateKey);

            logger.info(`Vehículo registrado con OCR: ${registro.datosConfirmados.serie}`);
            return true;
        } catch (error) {
            logger.error('Error finalizando registro OCR:', error);
            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al guardar el vehículo. Intenta nuevamente.',
                sendOptions
            );
            return false;
        }
    }

    /**
     * Verifica si hay un registro OCR en proceso
     */
    static tieneRegistroEnProceso(
        userId: number | string,
        chatId: number,
        threadId: string | number | null = null
    ): boolean {
        const threadIdStr = threadId ? String(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdStr)}`;
        return registrosOCR.has(stateKey);
    }

    /**
     * Obtiene el registro en proceso
     */
    static obtenerRegistro(
        userId: number | string,
        chatId: number,
        threadId: string | number | null = null
    ): IRegistroOCR | undefined {
        const threadIdStr = threadId ? String(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdStr)}`;
        return registrosOCR.get(stateKey);
    }

    /**
     * Cancela el registro en proceso
     */
    static cancelarRegistro(
        userId: number | string,
        chatId: number,
        threadId: string | number | null = null
    ): void {
        const threadIdStr = threadId ? String(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdStr)}`;
        registrosOCR.delete(stateKey);
    }

    /**
     * Reinicia el proceso para nueva foto de tarjeta
     */
    static async reiniciarParaNuevaFoto(
        bot: Telegraf,
        chatId: number,
        userId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId ? String(threadId) : null)}`;
        const registro = registrosOCR.get(stateKey);

        if (!registro) return false;

        // Resetear a estado inicial
        registro.estado = ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA;
        registro.datosOCR = {};
        registro.datosConfirmados = {};
        registro.camposFaltantes = [];
        registrosOCR.set(stateKey, registro);

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) sendOptions.message_thread_id = parseInt(registro.threadId);

        await bot.telegram.sendMessage(
            chatId,
            '📸 *Envía otra foto de la tarjeta de circulación*\n\n' +
                'Asegúrate de que la imagen sea clara y legible.',
            {
                ...sendOptions,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Registro manual', callback_data: 'vehiculo_ocr_manual' }],
                        [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
                    ]
                }
            }
        );

        return true;
    }
}

export default VehicleOCRHandler;
