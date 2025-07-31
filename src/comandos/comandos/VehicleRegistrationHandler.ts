// src/comandos/comandos/VehicleRegistrationHandler.ts
import { VehicleController } from '../../controllers/vehicleController';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import { getInstance } from '../../services/CloudflareStorage';
import { generarDatosMexicanosReales } from '../../utils/mexicanDataGenerator';
import Policy from '../../models/policy';
import Vehicle from '../../models/vehicle';
import mongoose from 'mongoose';
import logger from '../../utils/logger';
import type { Telegraf } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';
import type { IUploadResult, IR2File, IPolicy } from '../../../types/index';

/**
 * Estados del flujo de registro de vehículos
 */
export const ESTADOS_REGISTRO = {
    ESPERANDO_SERIE: 'esperando_serie',
    ESPERANDO_MARCA: 'esperando_marca',
    ESPERANDO_SUBMARCA: 'esperando_submarca',
    ESPERANDO_AÑO: 'esperando_año',
    ESPERANDO_COLOR: 'esperando_color',
    ESPERANDO_PLACAS: 'esperando_placas',
    ESPERANDO_FOTOS: 'esperando_fotos',
    COMPLETADO: 'completado'
} as const;

export type EstadoRegistro = (typeof ESTADOS_REGISTRO)[keyof typeof ESTADOS_REGISTRO];

interface IVehiclePhotoData {
    url: string;
    key: string;
    originalname: string;
    size: number;
    uploadedAt: Date;
}

interface IVehicleRegistrationData {
    estado: EstadoRegistro;
    chatId: number;
    threadId: string | null;
    datos: {
        serie?: string;
        marca?: string;
        submarca?: string;
        año?: number;
        color?: string;
        placas?: string;
    };
    fotos: IVehiclePhotoData[];
    mensajeFotosId: number | null;
    iniciado: Date;
    datosGenerados?: any;
}

interface ISendOptions {
    parse_mode?: 'Markdown' | 'HTML';
    message_thread_id?: number;
    reply_markup?: any;
}

/**
 * Almacena temporalmente los datos del vehículo en proceso
 * Usa StateKeyManager para thread-safety
 */
export const vehiculosEnProceso =
    StateKeyManager.createThreadSafeStateMap<IVehicleRegistrationData>();

/**
 * Handler para el registro de vehículos OBD
 */
export class VehicleRegistrationHandler {
    /**
     * Inicia el proceso de registro de un nuevo vehículo
     */
    static async iniciarRegistro(
        bot: Telegraf,
        chatId: number,
        userId: number,
        threadId: string | null = null
    ): Promise<boolean> {
        try {
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;

            // Limpiar cualquier registro previo para este usuario en este contexto
            vehiculosEnProceso.delete(stateKey);

            const mensaje =
                '🚗 *REGISTRO DE AUTO*\n\n' +
                '*1/6:* Número de serie (VIN) - 17 caracteres\n' +
                'Ejemplo: 3FADP4EJ2FM123456';

            const sendOptions: ISendOptions = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]]
                }
            };

            // Enviar al hilo correcto si threadId está presente
            if (threadId) {
                sendOptions.message_thread_id = parseInt(threadId);
            }

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            // Inicializar el estado del registro con thread-safety
            vehiculosEnProceso.set(stateKey, {
                estado: ESTADOS_REGISTRO.ESPERANDO_SERIE,
                chatId: chatId,
                threadId: threadId,
                datos: {},
                fotos: [], // Inicializar array de fotos desde el inicio
                mensajeFotosId: null, // ID del mensaje de contador de fotos
                iniciado: new Date()
            });

            return true;
        } catch (error) {
            console.error('Error al iniciar registro de vehículo:', error);

            const errorSendOptions: ISendOptions = {};
            if (threadId) {
                errorSendOptions.message_thread_id = parseInt(threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al iniciar el registro. Intenta nuevamente.',
                errorSendOptions
            );
            return false;
        }
    }

    /**
     * Procesa los mensajes durante el flujo de registro
     */
    static async procesarMensaje(bot: Telegraf, msg: Message, userId: number): Promise<boolean> {
        const chatId = msg.chat.id;
        const threadId = (msg as any).message_thread_id || null;
        const texto = (msg as any).text?.trim();

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const registro = vehiculosEnProceso.get(stateKey);
        if (!registro) {
            return false; // No hay registro en proceso para este usuario en este contexto
        }

        // La cancelación ahora se maneja via callback_data en BaseAutosCommand

        try {
            switch (registro.estado) {
                case ESTADOS_REGISTRO.ESPERANDO_SERIE:
                    return await this.procesarSerie(bot, chatId, userId, texto, registro, stateKey);

                case ESTADOS_REGISTRO.ESPERANDO_MARCA:
                    return await this.procesarMarca(bot, chatId, userId, texto, registro, stateKey);

                case ESTADOS_REGISTRO.ESPERANDO_SUBMARCA:
                    return await this.procesarSubmarca(
                        bot,
                        chatId,
                        userId,
                        texto,
                        registro,
                        stateKey
                    );

                case ESTADOS_REGISTRO.ESPERANDO_AÑO:
                    return await this.procesarAño(bot, chatId, userId, texto, registro, stateKey);

                case ESTADOS_REGISTRO.ESPERANDO_COLOR:
                    return await this.procesarColor(bot, chatId, userId, texto, registro, stateKey);

                case ESTADOS_REGISTRO.ESPERANDO_PLACAS:
                    return await this.procesarPlacas(
                        bot,
                        chatId,
                        userId,
                        texto,
                        registro,
                        stateKey
                    );

                case ESTADOS_REGISTRO.ESPERANDO_FOTOS:
                    return await this.procesarFotos(bot, msg, userId, registro);

                default:
                    return false;
            }
        } catch (error) {
            console.error('Error procesando mensaje de registro:', error);

            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error en el registro. Intenta nuevamente.',
                sendOptions
            );
            return true;
        }
    }

    /**
     * Procesa el número de serie (VIN)
     */
    private static async procesarSerie(
        bot: Telegraf,
        chatId: number,
        userId: number,
        serie: string,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        if (!serie || serie.length !== 17) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ El número de serie debe tener exactamente 17 caracteres.\nIntenta nuevamente:',
                sendOptions
            );
            return true;
        }

        // Verificar que no exista el vehículo
        const busqueda = await VehicleController.buscarVehiculo(serie);
        if (busqueda.success && busqueda.vehiculo) {
            const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Ya existe un vehículo registrado con esta serie:\n\n' +
                    `🚗 *${busqueda.vehiculo.marca} ${busqueda.vehiculo.submarca}*\n` +
                    `📅 Año: ${busqueda.vehiculo.año}\n` +
                    `🎨 Color: ${busqueda.vehiculo.color}\n` +
                    `👤 Titular: ${busqueda.vehiculo.titular || 'Sin titular'}\n\n` +
                    'Ingresa una serie diferente:',
                sendOptions
            );
            return true;
        }

        registro.datos.serie = serie.toUpperCase();
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_MARCA;
        vehiculosEnProceso.set(stateKey, registro);

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Serie: *${serie.toUpperCase()}*\n\n` +
                '*2/6:* Marca\nEjemplo: Ford, Toyota, Nissan',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa la marca del vehículo
     */
    private static async procesarMarca(
        bot: Telegraf,
        chatId: number,
        userId: number,
        marca: string,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        if (!marca || marca.length < 2) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ La marca debe tener al menos 2 caracteres.\nIntenta nuevamente:',
                sendOptions
            );
            return true;
        }

        registro.datos.marca = marca;
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_SUBMARCA;
        vehiculosEnProceso.set(stateKey, registro);

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Marca: *${marca}*\n\n` + '*3/6:* Modelo\nEjemplo: Focus, Corolla, Sentra',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa la submarca del vehículo
     */
    private static async procesarSubmarca(
        bot: Telegraf,
        chatId: number,
        userId: number,
        submarca: string,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        if (!submarca || submarca.length < 2) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ La submarca debe tener al menos 2 caracteres.\nIntenta nuevamente:',
                sendOptions
            );
            return true;
        }

        registro.datos.submarca = submarca;
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_AÑO;
        vehiculosEnProceso.set(stateKey, registro);

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Modelo: *${submarca}*\n\n` + '*4/6:* Año\nEjemplo: 2023, 2022, 2021',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa el año del vehículo
     */
    private static async procesarAño(
        bot: Telegraf,
        chatId: number,
        userId: number,
        año: string,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        const añoNum = parseInt(año);
        const añoActual = new Date().getFullYear();

        if (isNaN(añoNum) || añoNum < 1900 || añoNum > añoActual + 2) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                `❌ El año debe ser un número válido entre 1900 y ${añoActual + 2}.\nIntenta nuevamente:`,
                sendOptions
            );
            return true;
        }

        registro.datos.año = añoNum;
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_COLOR;
        vehiculosEnProceso.set(stateKey, registro);

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Año: *${añoNum}*\n\n` + '*5/6:* Color\nEjemplo: Blanco, Negro, Rojo',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa el color del vehículo
     */
    private static async procesarColor(
        bot: Telegraf,
        chatId: number,
        userId: number,
        color: string,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        if (!color || color.length < 3) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ El color debe tener al menos 3 caracteres.\nIntenta nuevamente:',
                sendOptions
            );
            return true;
        }

        registro.datos.color = color;
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_PLACAS;
        vehiculosEnProceso.set(stateKey, registro);

        const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Color: *${color}*\n\n` +
                '*6/6:* Placas\nEjemplo: ABC-123-D\nSi no tiene: SIN PLACAS',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa las placas del vehículo
     */
    private static async procesarPlacas(
        bot: Telegraf,
        chatId: number,
        userId: number,
        placas: string,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        if (!placas || placas.length < 3) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Las placas deben tener al menos 3 caracteres.\nIntenta nuevamente:',
                sendOptions
            );
            return true;
        }

        registro.datos.placas = placas.toUpperCase() === 'SIN PLACAS' ? '' : placas;
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_FOTOS;
        vehiculosEnProceso.set(stateKey, registro);

        // Generar datos temporales sin guardar en BD aún usando direcciones reales
        const datosGenerados = await generarDatosMexicanosReales();

        // Guardar los datos generados para usar al finalizar
        registro.datosGenerados = datosGenerados;
        registro.fotos = []; // Array para almacenar fotos temporalmente
        registro.mensajeFotosId = null; // Resetear ID del mensaje de fotos

        const resumen =
            '✅ *DATOS RECOPILADOS*\n\n' +
            `🚗 ${registro.datos.marca} ${registro.datos.submarca} ${registro.datos.año}\n` +
            `Color: ${registro.datos.color}\n` +
            `Placas: ${registro.datos.placas || 'Sin placas'}\n\n` +
            `👤 Titular: ${datosGenerados.titular}\n` +
            `📱 ${datosGenerados.telefono}\n\n` +
            '📸 **OBLIGATORIO:** Envía AL MENOS 1 foto del auto para continuar';

        const sendOptions: ISendOptions = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]]
            }
        };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }

        await bot.telegram.sendMessage(chatId, resumen, sendOptions);

        return true;
    }

    /**
     * Procesa las fotos del vehículo
     */
    private static async procesarFotos(
        bot: Telegraf,
        msg: Message,
        userId: number,
        registro: IVehicleRegistrationData
    ): Promise<boolean> {
        const chatId = msg.chat.id;

        // El comando de finalizar ahora se maneja via callback_data en BaseAutosCommand

        // Verificar si es una foto
        if (!(msg as any).photo?.length) {
            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '📸 Por favor envía una foto del vehículo o presiona "✅ Finalizar Registro" para completar.',
                sendOptions
            );
            return true;
        }

        try {
            // Obtener la foto de mejor calidad
            const foto = (msg as any).photo[(msg as any).photo.length - 1];
            console.log('BD AUTOS - Foto recibida:', {
                file_id: foto.file_id,
                file_unique_id: foto.file_unique_id,
                width: foto.width,
                height: foto.height,
                file_size: foto.file_size
            });

            // Descargar inmediatamente usando getFileLink
            console.log('BD AUTOS - Intentando descarga inmediata de la foto...');
            let buffer: Buffer | null = null;
            try {
                const fileLink = await bot.telegram.getFileLink(foto.file_id);
                console.log('BD AUTOS - FileLink foto:', fileLink.href);

                const response = await fetch(fileLink.href);
                if (!response.ok) {
                    throw new Error(`Error descargando foto: ${response.status}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
                console.log('BD AUTOS - Foto descargada exitosamente, tamaño:', buffer.length);

                // Verificar que sea una imagen válida
                if (buffer.length < 100) {
                    console.error('BD AUTOS - Foto muy pequeña, posible error:', buffer.toString());
                    throw new Error('Foto demasiado pequeña, posible error de descarga');
                }
            } catch (downloadError) {
                console.error('BD AUTOS - Error descargando foto:', downloadError);

                const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al procesar la foto. Por favor, intenta enviarla nuevamente.',
                    sendOptions
                );
                return true;
            }

            // Usar el número de serie para nombrar las fotos en Cloudflare
            const serie = registro.datos.serie!;
            const timestamp = Date.now();

            // ✅ DETECCIÓN NIV: Verificar si es vehículo NIV (2023-2026)
            const añoVehiculo = parseInt(String(registro.datos.año));
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;

            const fotoFile = {
                buffer: buffer,
                originalname: `${esVehiculoNIV ? 'niv' : 'vehiculo'}_${serie}_foto_${timestamp}.jpg`,
                mimetype: 'image/jpeg',
                size: buffer.length
            };

            // Subir INMEDIATAMENTE a Cloudflare con estructura correcta
            const storage = getInstance();

            // ✅ ESTRUCTURA INTELIGENTE: NIV va a policies/, regular a vehiculos/
            const fileName = esVehiculoNIV
                ? `policies/${serie}/fotos/${timestamp}_${fotoFile.originalname}`
                : `vehiculos/${serie}/${timestamp}_${fotoFile.originalname}`;

            // ✅ METADATOS CORRECTOS según el tipo (todos como strings para R2)
            const uploadMetadata = esVehiculoNIV
                ? {
                      policyNumber: serie,
                      type: 'policy_foto_niv',
                      originalName: fotoFile.originalname,
                      vehicleYear: String(añoVehiculo)
                  }
                : {
                      vehicleSerie: serie,
                      type: 'vehiculo_foto',
                      originalName: fotoFile.originalname
                  };

            const uploadResult: IUploadResult = await storage.uploadFile(
                buffer,
                fileName,
                'image/jpeg',
                uploadMetadata
            );

            if (uploadResult.url) {
                // Guardar referencia de la foto con URL de Cloudflare
                registro.fotos.push({
                    url: uploadResult.url,
                    key: uploadResult.key,
                    originalname: fotoFile.originalname,
                    size: uploadResult.size || buffer.length, // Incluir el tamaño
                    uploadedAt: new Date()
                });

                // Crear mensaje con contador de fotos y tipo de vehículo
                const tipoVehiculo = esVehiculoNIV ? '🆔 NIV (2023-2026)' : '🚗 Regular';
                const mensaje =
                    `✅ Foto subida a Cloudflare\n📊 Total de fotos: ${registro.fotos.length}\n🔗 Serie: ${serie}\n${tipoVehiculo}\n\n` +
                    'Puedes enviar más fotos o finalizar el registro';

                const keyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '✅ Finalizar Registro',
                                    callback_data: 'vehiculo_finalizar'
                                }
                            ],
                            [{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]
                        ]
                    }
                };

                if (registro.fotos.length === 1) {
                    // Primera foto: enviar mensaje nuevo y guardar su ID
                    const sendOptions: any = { ...keyboard };
                    if (registro.threadId) {
                        sendOptions.message_thread_id = parseInt(registro.threadId);
                    }
                    const sentMessage = await bot.telegram.sendMessage(
                        chatId,
                        mensaje,
                        sendOptions
                    );
                    registro.mensajeFotosId = sentMessage.message_id;
                } else {
                    // Fotos siguientes: editar mensaje existente
                    if (registro.mensajeFotosId) {
                        try {
                            await bot.telegram.editMessageText(
                                chatId,
                                registro.mensajeFotosId,
                                undefined,
                                mensaje,
                                keyboard
                            );
                        } catch (editError) {
                            // ✅ CORRECCIÓN: Limpiar mensaje anterior antes de crear nuevo
                            console.warn(
                                'No se pudo editar mensaje de fotos, enviando nuevo:',
                                (editError as Error).message
                            );

                            // Intentar eliminar el mensaje anterior para evitar duplicados
                            if (registro.mensajeFotosId) {
                                try {
                                    await bot.telegram.deleteMessage(
                                        chatId,
                                        registro.mensajeFotosId
                                    );
                                    logger.debug(
                                        'Mensaje anterior eliminado para evitar duplicados'
                                    );
                                } catch (deleteError) {
                                    // Ignorar error si el mensaje ya no existe
                                    logger.debug(
                                        'No se pudo eliminar mensaje anterior (posiblemente ya eliminado)'
                                    );
                                }
                            }

                            const sendOptions: any = { ...keyboard };
                            if (registro.threadId) {
                                sendOptions.message_thread_id = parseInt(registro.threadId);
                            }
                            const sentMessage = await bot.telegram.sendMessage(
                                chatId,
                                mensaje,
                                sendOptions
                            );
                            registro.mensajeFotosId = sentMessage.message_id;
                        }
                    } else {
                        // Fallback: enviar mensaje nuevo si no tenemos ID
                        const sendOptions: any = { ...keyboard };
                        if (registro.threadId) {
                            sendOptions.message_thread_id = parseInt(registro.threadId);
                        }
                        const sentMessage = await bot.telegram.sendMessage(
                            chatId,
                            mensaje,
                            sendOptions
                        );
                        registro.mensajeFotosId = sentMessage.message_id;
                    }
                }
            } else {
                const sendOptions: ISendOptions = {};
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al subir foto a Cloudflare. Intenta nuevamente.',
                    sendOptions
                );
            }
        } catch (error) {
            console.error('Error procesando foto:', error);

            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al procesar la foto. Intenta nuevamente.',
                sendOptions
            );
        }

        return true;
    }

    /**
     * Finaliza el registro del vehículo
     */
    static async finalizarRegistro(
        bot: Telegraf,
        chatId: number,
        userId: number,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        try {
            // VALIDACIÓN OBLIGATORIA: Verificar que hay al menos 1 foto
            if (!registro.fotos || registro.fotos.length === 0) {
                const sendOptions: ISendOptions = { parse_mode: 'Markdown' };
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ **ERROR:** No se puede finalizar el registro sin fotos.\n\n' +
                        '📸 Debes subir AL MENOS 1 foto del vehículo para continuar.',
                    sendOptions
                );
                return false;
            }

            // ✅ NUEVA LÓGICA: Detectar vehículos NIV (2023-2026)
            const añoVehiculo = parseInt(String(registro.datos.año));
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;

            if (esVehiculoNIV) {
                // FLUJO NIV: Conversión automática a póliza
                return await this.convertirANIV(bot, chatId, userId, registro, stateKey);
            } else {
                // FLUJO REGULAR: Crear vehículo normal
                // Combinar datos del vehículo con datos del titular generados
                const datosCompletos = {
                    ...registro.datos,
                    ...registro.datosGenerados
                };
                const resultado = await VehicleController.registrarVehiculo(
                    datosCompletos,
                    String(userId)
                );

                if (!resultado.success) {
                    const sendOptions: ISendOptions = {};
                    if (registro.threadId) {
                        sendOptions.message_thread_id = parseInt(registro.threadId);
                    }

                    await bot.telegram.sendMessage(
                        chatId,
                        `❌ Error al crear vehículo: ${resultado.error}`,
                        sendOptions
                    );
                    return false;
                }

                const vehicle = resultado.vehicle;
                if (!vehicle) {
                    throw new Error('Error: no se pudo obtener el vehículo registrado');
                }

                // Si hay fotos ya subidas a Cloudflare, vincularlas al vehículo
                if (registro.fotos && registro.fotos.length > 0) {
                    // Las fotos ya están en Cloudflare, solo guardamos las referencias
                    const resultadoFotos = await VehicleController.vincularFotosCloudflare(
                        String(vehicle._id),
                        registro.fotos
                    );
                    if (!resultadoFotos.success) {
                        console.warn(
                            'Error al vincular fotos de Cloudflare:',
                            resultadoFotos.error
                        );
                        // No fallar el registro por fotos, solo advertir
                    }
                }

                const mensaje =
                    '🎉 *REGISTRO COMPLETADO*\n\n' +
                    'El vehículo ha sido registrado exitosamente en la base de datos OBD.\n\n' +
                    `🆔 ID: ${vehicle._id}\n` +
                    `🚗 Vehículo: ${vehicle.marca} ${vehicle.submarca} ${vehicle.año}\n` +
                    `👤 Titular: ${vehicle.titular || 'Sin titular'}\n` +
                    `📊 Fotos: ${registro.fotos ? registro.fotos.length : 0}\n` +
                    '📊 Estado: SIN PÓLIZA (listo para asegurar)\n\n' +
                    '✅ El vehículo ya está disponible para que otra persona le asigne una póliza.';

                const sendOptions: ISendOptions = {
                    parse_mode: 'Markdown',
                    reply_markup: getMainKeyboard()
                };
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }

                await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

                // Limpiar el registro del proceso
                vehiculosEnProceso.delete(stateKey);

                return true;
            } // Cierre del bloque else (flujo regular)
        } catch (error) {
            console.error('Error finalizando registro:', error);

            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al finalizar el registro.',
                sendOptions
            );
            return false;
        }
    }

    /**
     * ⚡ NUEVO: Convierte vehículo 2023-2026 en NIV automático
     * Crea tanto el vehículo como la póliza NIV en una transacción atómica
     */
    private static async convertirANIV(
        bot: Telegraf,
        chatId: number,
        userId: number,
        registro: IVehicleRegistrationData,
        stateKey: string
    ): Promise<boolean> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            logger.info(
                `Iniciando conversión NIV para vehículo ${registro.datos.serie}, año ${registro.datos.año}`
            );

            // ✅ CORRECCIÓN: Validar serie duplicada DENTRO de la transacción
            const existeVehiculo = await Vehicle.findOne({
                serie: registro.datos.serie
            }).session(session);

            if (existeVehiculo) {
                throw new Error(
                    `Ya existe un vehículo registrado con la serie: ${registro.datos.serie}`
                );
            }

            // ✅ CORRECCIÓN: Crear vehículo DENTRO de la transacción
            const vehiculoData = {
                ...registro.datos,
                ...registro.datosGenerados,
                creadoPor: String(userId),
                creadoVia: 'TELEGRAM_BOT' as const,
                estado: 'CONVERTIDO_NIV' as const
            };

            const vehiculoCreado = await Vehicle.create([vehiculoData], { session });
            const vehiculo = vehiculoCreado[0];

            logger.info(`Vehículo NIV creado en transacción: ${vehiculo._id}`);

            // 2. Crear póliza NIV automáticamente
            const polizaNIV: Partial<IPolicy> = {
                // Datos del titular
                titular: registro.datosGenerados.titular,
                rfc: registro.datosGenerados.rfc,
                telefono: registro.datosGenerados.telefono,
                correo: registro.datosGenerados.correo,

                // Dirección
                calle: registro.datosGenerados.calle,
                colonia: registro.datosGenerados.colonia,
                municipio: registro.datosGenerados.municipio,
                estadoRegion: registro.datosGenerados.estadoRegion,
                cp: registro.datosGenerados.cp,

                // Datos del vehículo
                marca: String(registro.datos.marca),
                submarca: String(registro.datos.submarca),
                año: Number(registro.datos.año),
                color: String(registro.datos.color),
                serie: String(registro.datos.serie),
                placas: String(registro.datos.placas || 'SIN PLACAS'),

                // Datos de póliza NIV
                numeroPoliza: String(registro.datos.serie), // NIV = Serie del vehículo
                fechaEmision: new Date(),
                aseguradora: 'NIV_AUTOMATICO',
                agenteCotizador: 'SISTEMA_AUTOMATIZADO',

                // Sin pagos iniciales
                pagos: [],
                registros: [],
                servicios: [],

                // Contadores iniciales
                calificacion: 0,
                totalServicios: 0,
                servicioCounter: 0,
                registroCounter: 0,
                diasRestantesCobertura: 0,
                diasRestantesGracia: 0,

                // Marcadores especiales NIV
                creadoViaOBD: true,
                esNIV: true,
                tipoPoliza: 'NIV' as const,
                fechaConversionNIV: new Date(),
                vehicleId: vehiculo._id,

                // Estados
                estado: 'ACTIVO' as const,
                estadoPoliza: 'VIGENTE',

                // Archivos vacíos inicialmente
                archivos: {
                    fotos: [],
                    pdfs: [],
                    r2Files: {
                        fotos: [],
                        pdfs: []
                    }
                }
            };

            const polizaCreada = await Policy.create([polizaNIV], { session });
            logger.info(`Póliza NIV creada: ${polizaCreada[0].numeroPoliza}`);

            // ✅ CORRECCIÓN: Actualizar vehículo con referencia a póliza DENTRO de la transacción
            await Vehicle.findByIdAndUpdate(
                vehiculo._id,
                { policyId: polizaCreada[0]._id },
                { session }
            );

            // ✅ OPTIMIZACIÓN: Confirmar transacción ANTES de operaciones lentas
            await session.commitTransaction();

            logger.info(`Conversión NIV completada exitosamente: ${registro.datos.serie}`);

            // ✅ CORRECCIÓN: Vincular fotos directamente a la PÓLIZA NIV (no al vehículo)
            if (registro.fotos && registro.fotos.length > 0) {
                // Procesar fotos de manera síncrona para asegurar que se completen
                await this.procesarFotosPolizaNIVAsync(
                    polizaCreada[0]._id,
                    polizaCreada[0].numeroPoliza,
                    registro.fotos
                );
            }

            // ✅ OPTIMIZACIÓN: Mensaje de confirmación más conciso
            const mensaje =
                '🎉 *VEHÍCULO NIV REGISTRADO*\n\n' +
                '⚡ *CONVERSIÓN AUTOMÁTICA APLICADA*\n' +
                `${registro.datos.marca} ${registro.datos.submarca} ${registro.datos.año}\n\n` +
                `🆔 *NIV:* \`${registro.datos.serie}\`\n` +
                `👤 ${registro.datosGenerados.titular}\n\n` +
                '✅ *ACTIVO* - Disponible en reportes\n' +
                '🔄 Se elimina automáticamente al usarlo';

            const sendOptions: ISendOptions = {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            };
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            // Limpiar el registro del proceso
            vehiculosEnProceso.delete(stateKey);

            logger.info(`Conversión NIV completada exitosamente: ${registro.datos.serie}`);
            return true;
        } catch (error: any) {
            await session.abortTransaction();
            logger.error('Error en conversión NIV:', {
                error: error.message,
                serie: registro.datos.serie,
                año: registro.datos.año
            });

            const sendOptions: ISendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al crear NIV automático. Se intentará registro normal.',
                sendOptions
            );
            return false;
        } finally {
            session.endSession();
        }
    }

    /**
     * Verifica si un usuario tiene un registro en proceso
     */
    static tieneRegistroEnProceso(
        userId: number,
        chatId: number,
        threadId: string | null = null
    ): boolean {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return vehiculosEnProceso.has(stateKey);
    }

    /**
     * Cancela un registro en proceso
     */
    static cancelarRegistro(userId: number, chatId: number, threadId: string | null = null): void {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        vehiculosEnProceso.delete(stateKey);
    }

    /**
     * ✅ NUEVO: Procesamiento asíncrono de fotos para NIVs
     * No bloquea la respuesta principal, procesa en background
     */
    private static async procesarFotosNIVAsync(vehicleId: any, fotos: any[]): Promise<void> {
        try {
            logger.info(
                `Iniciando procesamiento asíncrono de fotos para vehículo NIV: ${vehicleId}`
            );

            const resultadoFotos = await VehicleController.vincularFotosCloudflare(
                String(vehicleId),
                fotos
            );

            if (resultadoFotos.success) {
                logger.info(`Fotos vinculadas exitosamente para vehículo NIV: ${vehicleId}`);
            } else {
                logger.warn(
                    `Error al vincular fotos para vehículo NIV ${vehicleId}:`,
                    resultadoFotos.error
                );
            }
        } catch (error: any) {
            logger.error(
                `Error crítico procesando fotos asíncronas para vehículo ${vehicleId}:`,
                error.message
            );
        }
    }

    /**
     * ✅ NUEVO: Procesar fotos para pólizas NIV
     */
    private static async procesarFotosPolizaNIVAsync(
        policyId: any,
        policyNumber: string,
        fotos: any[]
    ): Promise<void> {
        try {
            logger.info(`Iniciando procesamiento de fotos para póliza NIV: ${policyNumber}`);

            const Policy = require('../../models/policy').default;
            const fotosR2: any[] = [];

            // ✅ CORRECCIÓN: Las fotos ya están subidas a Cloudflare con estructura correcta
            // Solo necesitamos crear las referencias para la póliza
            for (const foto of fotos) {
                try {
                    fotosR2.push({
                        url: foto.url,
                        key: foto.key,
                        size: foto.size,
                        contentType: 'image/jpeg',
                        uploadDate: foto.uploadedAt || new Date(),
                        originalName: foto.originalname,
                        fuenteOriginal: '🆔 Foto NIV directa'
                    });

                    logger.info(`Foto NIV referenciada: ${foto.key}`);
                } catch (error: any) {
                    logger.error(
                        `Error procesando referencia foto NIV ${foto.originalname}:`,
                        error.message
                    );
                }
            }

            // Actualizar la póliza con las referencias de fotos
            if (fotosR2.length > 0) {
                await Policy.findByIdAndUpdate(policyId, {
                    $push: { 'archivos.r2Files.fotos': { $each: fotosR2 } }
                });

                logger.info(`${fotosR2.length} fotos referenciadas en póliza NIV: ${policyNumber}`);
            }
        } catch (error: any) {
            logger.error(
                `Error crítico procesando fotos póliza NIV ${policyNumber}:`,
                error.message
            );
        }
    }

    /**
     * Obtiene estadísticas de registros activos
     */
    static getEstadisticasRegistros(): {
        registrosActivos: number;
        registros: Array<{
            userId: string;
            estado: EstadoRegistro;
            iniciado: Date;
            marca: string;
        }>;
    } {
        return {
            registrosActivos: vehiculosEnProceso.size(),
            registros: Array.from(vehiculosEnProceso.getInternalMap().entries()).map(
                ([userId, registro]) => ({
                    userId,
                    estado: registro.estado,
                    iniciado: registro.iniciado,
                    marca: registro.datos.marca || 'Sin especificar'
                })
            )
        };
    }
}
