// src/comandos/comandos/VehicleOCRHandler.ts
// Handler para registro de vehículos usando OCR de tarjeta de circulación

import {
    getInstance as getMistralVision,
    IDatosTarjetaCirculacion
} from '../../services/MistralVisionService';
import { getInstance as getPlacasValidator } from '../../services/PlacasValidator';
import { getInstance as getCloudflareStorage } from '../../services/CloudflareStorage';
import { getVehicleOCRUIService } from '../../services/VehicleOCRUIService';
import { getVehicleValidationService } from '../../services/VehicleValidationService';
import { VehicleController } from '../../controllers/vehicleController';
import { generarDatosMexicanosReales } from '../../utils/mexicanDataGenerator';
import StateKeyManager from '../../utils/StateKeyManager';
import logger from '../../utils/logger';
import type { Telegraf } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';

// Servicios
const uiService = getVehicleOCRUIService();
const validationService = getVehicleValidationService();

/**
 * Estados del flujo de registro con OCR
 */
export const ESTADOS_OCR_VEHICULO = {
    ESPERANDO_TARJETA: 'esperando_tarjeta',
    CONFIRMANDO_DATOS: 'confirmando_datos',
    ESPERANDO_DATO_FALTANTE: 'esperando_dato',
    ESPERANDO_FOTOS_VEHICULO: 'esperando_fotos',
    VALIDANDO_PLACAS: 'validando_placas',
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
    datosOCR: Partial<IDatosTarjetaCirculacion>;
    datosConfirmados: {
        serie?: string;
        marca?: string;
        submarca?: string;
        año?: number;
        color?: string;
        placas?: string;
    };
    fotos: Array<{
        url: string;
        key: string;
        originalname: string;
        size: number;
        uploadedAt: Date;
    }>;
    campoActual?: string;
    camposFaltantes: string[];
    datosGenerados?: any;
    mensajeEstadoId: number | null;
    iniciado: Date;
    placasValidadas: boolean;
    resultadoValidacionPlacas?: string;
    // Batch de fotos pendientes
    fotosEnBatch: number;
    batchTimeout?: NodeJS.Timeout;
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
                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '⚠️ *El servicio de OCR no está disponible.*\n\nPor favor, usa el registro manual.',
                    { parse_mode: 'Markdown' }
                );
                return false;
            }

            // Limpiar registro previo
            registrosOCR.delete(stateKey);

            // Mensaje inicial
            await uiService.enviarMensaje(bot, chatId, threadId, uiService.generarMensajeInicio(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarTecladoInicio() }
            });

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
                placasValidadas: false,
                fotosEnBatch: 0
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
        const threadId = (msg as any).message_thread_id ?? null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;

        const registro = registrosOCR.get(stateKey);
        if (!registro) return false;

        const photo = (msg as any).photo;
        if (!photo?.length) return false;

        try {
            const mejorFoto = photo[photo.length - 1];
            const fileLink = await bot.telegram.getFileLink(mejorFoto.file_id);
            const response = await fetch(fileLink.href);
            if (!response.ok) throw new Error(`Error descargando imagen: ${response.status}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            switch (registro.estado) {
                case ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA:
                    return await this.procesarTarjetaCirculacion(
                        bot,
                        chatId,
                        buffer,
                        registro,
                        stateKey
                    );

                case ESTADOS_OCR_VEHICULO.ESPERANDO_FOTOS_VEHICULO:
                    return await this.procesarFotoVehiculo(bot, chatId, buffer, registro, stateKey);

                default:
                    return false;
            }
        } catch (error) {
            logger.error('Error procesando imagen:', error);
            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                '❌ Error al procesar la imagen. Por favor, intenta nuevamente.'
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
        imageBuffer: Buffer,
        registro: IRegistroOCR,
        stateKey: string
    ): Promise<boolean> {
        const msgProcesando = await uiService.enviarMensaje(
            bot,
            chatId,
            registro.threadId,
            uiService.generarMensajeProcesando(),
            { parse_mode: 'Markdown' }
        );

        try {
            const mistralVision = getMistralVision();
            const resultado = await mistralVision.extraerDatosTarjetaCirculacion(imageBuffer);

            try {
                await bot.telegram.deleteMessage(chatId, msgProcesando.message_id);
            } catch {}

            if (!resultado.success || !resultado.datos) {
                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    registro.threadId,
                    uiService.generarMensajeErrorOCR(),
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: uiService.generarTecladoReintentar() }
                    }
                );
                return true;
            }

            // Guardar datos extraídos
            registro.datosOCR = resultado.datos;
            registro.datosConfirmados = {
                serie: resultado.datos.serie ?? undefined,
                marca: resultado.datos.marca ?? undefined,
                submarca: resultado.datos.submarca ?? undefined,
                año: resultado.datos.año ?? undefined,
                color: resultado.datos.color ?? undefined,
                placas: resultado.datos.placas ?? undefined
            };

            // Determinar campos faltantes
            registro.camposFaltantes = CAMPOS_ESENCIALES.filter(
                campo => !resultado.datos![campo as keyof IDatosTarjetaCirculacion]
            );

            logger.info(
                `OCR tarjeta: ${resultado.datos.datosEncontrados.length} datos encontrados, ` +
                    `${registro.camposFaltantes.length} faltantes`
            );

            if (registro.camposFaltantes.length > 0) {
                registro.estado = ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE;
                registro.campoActual = registro.camposFaltantes[0];
                registrosOCR.set(stateKey, registro);

                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    registro.threadId,
                    uiService.generarResumenConFaltante(
                        registro.datosConfirmados,
                        registro.campoActual
                    ),
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: uiService.generarTecladoCancelar() }
                    }
                );
                return true;
            }

            registro.estado = ESTADOS_OCR_VEHICULO.CONFIRMANDO_DATOS;
            registrosOCR.set(stateKey, registro);

            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                uiService.generarMensajeConfirmacion(registro.datosConfirmados),
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: uiService.generarTecladoConfirmacion() }
                }
            );
            return true;
        } catch (error) {
            logger.error('Error en OCR de tarjeta:', error);

            try {
                await bot.telegram.deleteMessage(chatId, msgProcesando.message_id);
            } catch {}

            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                '❌ *Error al procesar la tarjeta*\n\nPor favor, intenta nuevamente o usa el registro manual.',
                {
                    parse_mode: 'Markdown',
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
     * Procesa respuesta de texto (para datos faltantes)
     */
    static async procesarTexto(bot: Telegraf, msg: Message, userId: number): Promise<boolean> {
        const chatId = msg.chat.id;
        const threadId = (msg as any).message_thread_id ?? null;
        const texto = (msg as any).text?.trim();

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const registro = registrosOCR.get(stateKey);

        if (!registro || registro.estado !== ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE) {
            return false;
        }

        if (!texto) return false;

        const campoActual = registro.campoActual!;
        const validacion = validationService.validarCampoDinamico(campoActual, texto);

        if (!validacion.valido) {
            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                `❌ ${validacion.error}\n\nPor favor, ingresa ${uiService.getNombreCampo(campoActual)} nuevamente:`,
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        // Guardar el dato
        (registro.datosConfirmados as any)[campoActual] = validacion.valor;
        registro.camposFaltantes = registro.camposFaltantes.filter(c => c !== campoActual);

        if (registro.camposFaltantes.length > 0) {
            registro.campoActual = registro.camposFaltantes[0];
            registrosOCR.set(stateKey, registro);

            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                `✅ ${uiService.getNombreCampo(campoActual)}: *${validacion.valor}*\n\n` +
                    `📝 Ahora ingresa ${uiService.getNombreCampo(registro.campoActual)}:`,
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        registro.estado = ESTADOS_OCR_VEHICULO.CONFIRMANDO_DATOS;
        registrosOCR.set(stateKey, registro);

        await uiService.enviarMensaje(
            bot,
            chatId,
            registro.threadId,
            uiService.generarMensajeConfirmacion(registro.datosConfirmados),
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarTecladoConfirmacion() }
            }
        );
        return true;
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

        registro.datosGenerados = await generarDatosMexicanosReales();
        registro.estado = ESTADOS_OCR_VEHICULO.ESPERANDO_FOTOS_VEHICULO;
        registrosOCR.set(stateKey, registro);

        await uiService.enviarMensaje(
            bot,
            chatId,
            registro.threadId,
            uiService.generarMensajeSolicitarFotos(
                registro.datosGenerados,
                registro.datosConfirmados.placas!
            ),
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarTecladoFotos() }
            }
        );

        return true;
    }

    /**
     * Procesa una foto del vehículo (con sistema de batch)
     * Las fotos se acumulan y se envía UN solo mensaje después de 2 segundos
     */
    private static async procesarFotoVehiculo(
        bot: Telegraf,
        chatId: number,
        imageBuffer: Buffer,
        registro: IRegistroOCR,
        stateKey: string
    ): Promise<boolean> {
        try {
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
                logger.warn('Error al subir foto, continuando sin guardar');
                return true;
            }

            registro.fotos.push({
                url: uploadResult.url,
                key: uploadResult.key,
                originalname: `foto_${registro.fotos.length + 1}.jpg`,
                size: uploadResult.size ?? imageBuffer.length,
                uploadedAt: new Date()
            });

            // Intentar validar placas (silenciosamente)
            if (!registro.placasValidadas) {
                const validacionResult = await this.validarPlacasEnFoto(
                    imageBuffer,
                    registro.datosConfirmados.placas!
                );

                if (validacionResult.detectadas && validacionResult.coinciden) {
                    registro.placasValidadas = true;
                    registro.resultadoValidacionPlacas = validacionResult.mensaje;
                    logger.info(`Placas validadas: ${registro.datosConfirmados.placas}`);
                }
            }

            // Incrementar contador de batch
            registro.fotosEnBatch++;

            // Cancelar timeout anterior si existe
            if (registro.batchTimeout) {
                clearTimeout(registro.batchTimeout);
            }

            // Establecer nuevo timeout para enviar mensaje consolidado (2 segundos)
            registro.batchTimeout = setTimeout(async () => {
                try {
                    await this.enviarMensajeBatchFotos(bot, chatId, stateKey);
                } catch (error) {
                    logger.error('Error enviando mensaje batch de fotos:', error);
                }
            }, 2000);

            registrosOCR.set(stateKey, registro);
            return true;
        } catch (error) {
            logger.error('Error procesando foto de vehículo:', error);
            return true;
        }
    }

    /**
     * Envía mensaje consolidado después de recibir batch de fotos
     */
    private static async enviarMensajeBatchFotos(
        bot: Telegraf,
        chatId: number,
        stateKey: string
    ): Promise<void> {
        const registro = registrosOCR.get(stateKey);
        if (!registro) return;

        const fotosEnEsteBatch = registro.fotosEnBatch;
        const totalFotos = registro.fotos.length;

        // Construir mensaje de validación de placas
        let mensajeValidacion = '';
        if (registro.placasValidadas) {
            mensajeValidacion = `\n\n${registro.resultadoValidacionPlacas}`;
        } else if (totalFotos > 0) {
            mensajeValidacion = '\n\n📷 _No se detectaron placas coincidentes_';
        }

        // Resetear contador de batch
        registro.fotosEnBatch = 0;
        registro.batchTimeout = undefined;
        registrosOCR.set(stateKey, registro);

        // Generar mensaje personalizado para batch
        const mensajeFotos =
            fotosEnEsteBatch === 1
                ? `✅ *Foto ${totalFotos} subida*`
                : `✅ *${fotosEnEsteBatch} fotos subidas* (Total: ${totalFotos})`;

        await uiService.enviarMensaje(
            bot,
            chatId,
            registro.threadId,
            `${mensajeFotos}${mensajeValidacion}\n\nPuedes enviar más fotos o finalizar el registro.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: uiService.generarTecladoFotoSubida(totalFotos)
                }
            }
        );
    }

    /**
     * Valida placas detectadas en una foto
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

        if (registro.fotos.length === 0) {
            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                '❌ *Debes enviar al menos 1 foto del vehículo*\n\nEnvía una foto o presiona "Omitir fotos" si no tienes.',
                { parse_mode: 'Markdown' }
            );
            return false;
        }

        try {
            const datosCompletos = {
                ...registro.datosConfirmados,
                ...registro.datosGenerados
            };

            const resultado = await VehicleController.registrarVehiculo(datosCompletos, userId);

            if (!resultado.success || !resultado.vehicle) {
                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    registro.threadId,
                    `❌ Error al crear vehículo: ${resultado.error}`
                );
                return false;
            }

            if (registro.fotos.length > 0) {
                await VehicleController.vincularFotosCloudflare(
                    String(resultado.vehicle._id),
                    registro.fotos
                );
            }

            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                uiService.generarMensajeExito(
                    registro.datosConfirmados,
                    registro.datosGenerados,
                    registro.fotos.length,
                    registro.placasValidadas
                ),
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: uiService.generarTecladoFinal() }
                }
            );

            registrosOCR.delete(stateKey);
            logger.info(`Vehículo registrado con OCR: ${registro.datosConfirmados.serie}`);
            return true;
        } catch (error) {
            logger.error('Error finalizando registro OCR:', error);
            await uiService.enviarMensaje(
                bot,
                chatId,
                registro.threadId,
                '❌ Error al guardar el vehículo. Intenta nuevamente.'
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

        registro.estado = ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA;
        registro.datosOCR = {};
        registro.datosConfirmados = {};
        registro.camposFaltantes = [];
        registrosOCR.set(stateKey, registro);

        await uiService.enviarMensaje(
            bot,
            chatId,
            registro.threadId,
            uiService.generarMensajeReintentarTarjeta(),
            {
                parse_mode: 'Markdown',
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
