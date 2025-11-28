// src/comandos/comandos/VehicleRegistrationHandler.ts
/**
 * Handler refactorizado para registro de vehículos
 * Delegación a servicios especializados siguiendo SRP
 */

import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import { getInstance as getCloudflareStorage } from '../../services/CloudflareStorage';
import { getVehicleValidationService } from '../../services/VehicleValidationService';
import { getVehicleCreationService } from '../../services/VehicleCreationService';
import {
    ESTADOS_REGISTRO_VEHICULO,
    type IVehicleBot,
    type IRegistroVehiculoEnProceso,
    type IFotoVehiculo
} from '../../types/vehicle-registration';
import logger from '../../utils/logger';

// Re-exportar para compatibilidad con código existente
export const ESTADOS_REGISTRO = ESTADOS_REGISTRO_VEHICULO;
export type EstadoRegistro = (typeof ESTADOS_REGISTRO)[keyof typeof ESTADOS_REGISTRO];

// Almacenamiento de registros en proceso (thread-safe)
export const vehiculosEnProceso =
    StateKeyManager.createThreadSafeStateMap<IRegistroVehiculoEnProceso>();

// Servicios singleton
const validationService = getVehicleValidationService();
const creationService = getVehicleCreationService();

/**
 * Handler para el registro de vehículos - Refactorizado
 */
export class VehicleRegistrationHandler {
    /**
     * Inicia el proceso de registro de vehículo
     */
    static async iniciarRegistro(
        bot: IVehicleBot,
        chatId: number,
        userId: number | string,
        threadId: string | number | null = null
    ): Promise<boolean> {
        try {
            const threadIdNorm = threadId ? Number(threadId) : null;
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdNorm)}`;

            // Limpiar registro previo
            vehiculosEnProceso.delete(stateKey);

            const mensaje =
                '🚗 *REGISTRO DE NUEVO VEHÍCULO*\n\n' +
                'Ingresa los datos del vehículo paso a paso.\n\n' +
                '*Paso 1/6:* Ingresa el *NÚMERO DE SERIE* (VIN)\n' +
                '📝 17 caracteres alfanuméricos\n' +
                '📍 Ubicación: Marco de la puerta del conductor o tablero';

            await this.enviarMensaje(bot, chatId, threadIdNorm, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]]
                }
            });

            // Inicializar estado
            vehiculosEnProceso.set(stateKey, {
                estado: ESTADOS_REGISTRO_VEHICULO.ESPERANDO_SERIE,
                chatId,
                threadId: threadIdNorm,
                datosVehiculo: {},
                fotosRecibidas: 0,
                iniciado: new Date()
            });

            return true;
        } catch (error) {
            logger.error('[VehicleRegistrationHandler] Error iniciando registro:', error);
            const threadIdNorm = threadId ? Number(threadId) : null;
            await this.enviarMensaje(bot, chatId, threadIdNorm, '❌ Error al iniciar el registro.');
            return false;
        }
    }

    /**
     * Procesa mensajes durante el flujo de registro
     */
    static async procesarMensaje(
        bot: IVehicleBot,
        msg: any,
        userId: string | number
    ): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id || null;
        const texto: string | undefined = msg.text?.trim();

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const registro = vehiculosEnProceso.get(stateKey);

        if (!registro) return false;

        try {
            const handlers: Record<string, () => Promise<boolean>> = {
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_SERIE]: () =>
                    this.procesarSerie(bot, chatId, threadId, texto, registro, stateKey),
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_MARCA]: () =>
                    this.procesarMarca(bot, chatId, threadId, texto, registro, stateKey),
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_SUBMARCA]: () =>
                    this.procesarSubmarca(bot, chatId, threadId, texto, registro, stateKey),
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_AÑO]: () =>
                    this.procesarAño(bot, chatId, threadId, texto, registro, stateKey),
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_COLOR]: () =>
                    this.procesarColor(bot, chatId, threadId, texto, registro, stateKey),
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_PLACAS]: () =>
                    this.procesarPlacas(bot, chatId, threadId, texto, registro, stateKey),
                [ESTADOS_REGISTRO_VEHICULO.ESPERANDO_FOTOS]: () =>
                    this.procesarFotos(bot, msg, String(userId), registro, stateKey)
            };

            const handler = handlers[registro.estado];
            return handler ? await handler() : false;
        } catch (error) {
            logger.error('[VehicleRegistrationHandler] Error procesando mensaje:', error);
            await this.enviarMensaje(bot, chatId, threadId, '❌ Error procesando el mensaje.');
            return true;
        }
    }

    /**
     * Procesa el número de serie
     */
    private static async procesarSerie(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        serie: string | undefined,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarSerie(serie);
        if (!validacion.valida) {
            await this.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        registro.datosVehiculo.serie = validacion.serieNormalizada;
        registro.estado = ESTADOS_REGISTRO_VEHICULO.ESPERANDO_MARCA;
        vehiculosEnProceso.set(stateKey, registro);

        const tipoSerie = validacion.esVIN ? '(VIN válido)' : '(Serie corta)';
        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Serie: *${validacion.serieNormalizada}* ${tipoSerie}\n\n` +
                '*Paso 2/6:* Ingresa la *MARCA*\n📝 Ejemplo: Toyota, Nissan, Volkswagen',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa la marca
     */
    private static async procesarMarca(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        marca: string | undefined,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarMarca(marca);
        if (!validacion.valida) {
            await this.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        registro.datosVehiculo.marca = validacion.valor;
        registro.estado = ESTADOS_REGISTRO_VEHICULO.ESPERANDO_SUBMARCA;
        vehiculosEnProceso.set(stateKey, registro);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Marca: *${validacion.valor}*\n\n` +
                '*Paso 3/6:* Ingresa la *SUBMARCA/MODELO*\n📝 Ejemplo: Corolla, Sentra, Jetta',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa la submarca
     */
    private static async procesarSubmarca(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        submarca: string | undefined,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarSubmarca(submarca);
        if (!validacion.valida) {
            await this.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        registro.datosVehiculo.submarca = validacion.valor;
        registro.estado = ESTADOS_REGISTRO_VEHICULO.ESPERANDO_AÑO;
        vehiculosEnProceso.set(stateKey, registro);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Submarca: *${validacion.valor}*\n\n` +
                '*Paso 4/6:* Ingresa el *AÑO*\n📝 Ejemplo: 2022, 2023, 2024',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el año
     */
    private static async procesarAño(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        año: string | undefined,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarAño(año);
        if (!validacion.valida) {
            await this.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        registro.datosVehiculo.año = validacion.valor;
        registro.estado = ESTADOS_REGISTRO_VEHICULO.ESPERANDO_COLOR;
        vehiculosEnProceso.set(stateKey, registro);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Año: *${validacion.valor}*\n\n` +
                '*Paso 5/6:* Ingresa el *COLOR*\n📝 Ejemplo: Blanco, Negro, Rojo, Gris',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el color
     */
    private static async procesarColor(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        color: string | undefined,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarColor(color);
        if (!validacion.valida) {
            await this.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        registro.datosVehiculo.color = validacion.valor;
        registro.estado = ESTADOS_REGISTRO_VEHICULO.ESPERANDO_PLACAS;
        vehiculosEnProceso.set(stateKey, registro);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Color: *${validacion.valor}*\n\n` +
                '*Paso 6/6:* Ingresa las *PLACAS*\n📝 Formato: ABC-1234 o N/A si no tiene',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa las placas
     */
    private static async procesarPlacas(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        placas: string | undefined,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = await validationService.validarPlacas(placas);
        if (!validacion.valida) {
            await this.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        registro.datosVehiculo.placas = validacion.placasNormalizadas;
        registro.estado = ESTADOS_REGISTRO_VEHICULO.ESPERANDO_FOTOS;
        registro.datosVehiculo.fotos = [];
        vehiculosEnProceso.set(stateKey, registro);

        const estadoInfo = validacion.estado ? ` (${validacion.estado})` : '';
        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Placas: *${validacion.placasNormalizadas}*${estadoInfo}\n\n` +
                '📷 *FOTOS DEL VEHÍCULO*\n\n' +
                'Envía fotos del vehículo (opcional):\n' +
                '• Foto frontal\n' +
                '• Foto lateral\n' +
                '• Foto del VIN\n\n' +
                'Cuando termines, presiona *Finalizar*',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Finalizar Registro', callback_data: 'vehiculo_finalizar' }],
                        [{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]
                    ]
                }
            }
        );

        return true;
    }

    /**
     * Procesa las fotos del vehículo
     */
    private static async procesarFotos(
        bot: IVehicleBot,
        msg: any,
        _userId: string,
        registro: IRegistroVehiculoEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const chatId = msg.chat.id;
        const threadId = msg.message_thread_id || null;

        // Si no es foto, ignorar
        const validacion = validationService.validarFoto(msg);
        if (!validacion.valida) {
            if (msg.text && msg.text.toLowerCase() !== 'finalizar') {
                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '📷 Envía una foto o presiona *Finalizar* para terminar.',
                    { parse_mode: 'Markdown' }
                );
            }
            return true;
        }

        try {
            // Descargar foto
            const fileLink = await bot.telegram.getFileLink(validacion.fileId!);
            const fetch = require('node-fetch');
            const response = await fetch(fileLink.href);
            const buffer = await response.buffer();

            // Agregar a la lista
            if (!registro.datosVehiculo.fotos) {
                registro.datosVehiculo.fotos = [];
            }

            registro.datosVehiculo.fotos.push({
                fileId: validacion.fileId!,
                fileName: validacion.fileName!,
                mimeType: 'image/jpeg',
                fileSize: buffer.length,
                buffer
            });

            registro.fotosRecibidas++;
            vehiculosEnProceso.set(stateKey, registro);

            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                `✅ Foto ${registro.fotosRecibidas} guardada.\n\n` +
                    'Envía más fotos o presiona *Finalizar*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Finalizar Registro', callback_data: 'vehiculo_finalizar' }]
                        ]
                    }
                }
            );

            return true;
        } catch (error) {
            logger.error('[VehicleRegistrationHandler] Error procesando foto:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '⚠️ Error guardando foto. Intenta nuevamente.'
            );
            return true;
        }
    }

    /**
     * Finaliza el registro del vehículo
     */
    static async finalizarRegistro(
        bot: IVehicleBot,
        chatId: number,
        userId: string | number,
        threadId: string | number | null = null
    ): Promise<boolean> {
        const threadIdNorm = threadId ? Number(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdNorm)}`;
        const registro = vehiculosEnProceso.get(stateKey);

        if (!registro || registro.estado !== ESTADOS_REGISTRO_VEHICULO.ESPERANDO_FOTOS) {
            await this.enviarMensaje(
                bot,
                chatId,
                threadIdNorm,
                '❌ No hay registro en proceso para finalizar.'
            );
            return false;
        }

        try {
            await this.enviarMensaje(bot, chatId, threadIdNorm, '🔄 *Procesando registro...*', {
                parse_mode: 'Markdown'
            });

            // Crear vehículo
            const resultado = await creationService.crearVehiculo(registro.datosVehiculo);

            if (!resultado.success) {
                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadIdNorm,
                    `❌ ${resultado.esDuplicado ? 'Este vehículo ya existe.' : resultado.error}`,
                    { parse_mode: 'Markdown' }
                );
                vehiculosEnProceso.delete(stateKey);
                return true;
            }

            const vehiculo = resultado.vehiculo;

            // Subir fotos a R2 si hay
            if (registro.datosVehiculo.fotos && registro.datosVehiculo.fotos.length > 0) {
                await this.subirFotosR2(vehiculo._id.toString(), registro.datosVehiculo.fotos);
            }

            // Mensaje de éxito
            const mensaje = this.generarMensajeExito(registro, vehiculo._id.toString());
            await this.enviarMensaje(bot, chatId, threadIdNorm, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            });

            vehiculosEnProceso.delete(stateKey);
            return true;
        } catch (error) {
            logger.error('[VehicleRegistrationHandler] Error finalizando registro:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                threadIdNorm,
                '❌ Error al finalizar el registro.'
            );
            vehiculosEnProceso.delete(stateKey);
            return true;
        }
    }

    /**
     * Sube fotos a Cloudflare R2
     */
    private static async subirFotosR2(vehiculoId: string, fotos: IFotoVehiculo[]): Promise<void> {
        try {
            const storage = getCloudflareStorage();
            const fotosSubidas: Array<{
                url: string;
                key: string;
                size: number;
                contentType: string;
            }> = [];

            for (let i = 0; i < fotos.length; i++) {
                const foto = fotos[i];
                if (!foto.buffer) continue;

                const fileName = `vehiculos/${vehiculoId}/foto_${i + 1}_${Date.now()}.jpg`;
                const result = await storage.uploadFile(foto.buffer, fileName, 'image/jpeg');

                if (result?.url) {
                    fotosSubidas.push({
                        url: result.url,
                        key: result.key,
                        size: result.size,
                        contentType: 'image/jpeg'
                    });
                }
            }

            if (fotosSubidas.length > 0) {
                await creationService.actualizarFotos(vehiculoId, fotosSubidas);
            }
        } catch (error) {
            logger.error('[VehicleRegistrationHandler] Error subiendo fotos a R2:', error);
        }
    }

    /**
     * Genera mensaje de éxito
     */
    private static generarMensajeExito(
        registro: IRegistroVehiculoEnProceso,
        vehiculoId: string
    ): string {
        const datos = registro.datosVehiculo;
        return (
            '🎉 *VEHÍCULO REGISTRADO EXITOSAMENTE*\n\n' +
            '🚗 *Datos del vehículo:*\n' +
            `• Serie: ${datos.serie}\n` +
            `• Marca: ${datos.marca}\n` +
            `• Modelo: ${datos.submarca}\n` +
            `• Año: ${datos.año}\n` +
            `• Color: ${datos.color}\n` +
            `• Placas: ${datos.placas}\n\n` +
            `📷 Fotos guardadas: ${registro.fotosRecibidas}\n\n` +
            `🆔 ID: ${vehiculoId}\n\n` +
            '✅ Estado: *SIN PÓLIZA*\n' +
            'Ya puedes asignarle una póliza desde el menú.'
        );
    }

    /**
     * Envía mensaje al chat
     */
    private static async enviarMensaje(
        bot: IVehicleBot,
        chatId: number,
        threadId: number | null,
        texto: string,
        options: any = {}
    ): Promise<void> {
        const sendOptions = { ...options };
        if (threadId) {
            sendOptions.message_thread_id = threadId;
        }
        await bot.telegram.sendMessage(chatId, texto, sendOptions);
    }

    // ==================== MÉTODOS DE UTILIDAD ====================

    static tieneRegistroEnProceso(
        userId: string | number,
        chatId: number,
        threadId: string | number | null = null
    ): boolean {
        const threadIdNorm = threadId ? Number(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdNorm)}`;
        return vehiculosEnProceso.has(stateKey);
    }

    static obtenerRegistro(
        userId: string | number,
        chatId: number,
        threadId: string | number | null = null
    ): IRegistroVehiculoEnProceso | undefined {
        const threadIdNorm = threadId ? Number(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdNorm)}`;
        return vehiculosEnProceso.get(stateKey);
    }

    static cancelarRegistro(
        userId: string | number,
        chatId: number,
        threadId: string | number | null = null
    ): void {
        const threadIdNorm = threadId ? Number(threadId) : null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadIdNorm)}`;
        vehiculosEnProceso.delete(stateKey);
    }
}

export default VehicleRegistrationHandler;
