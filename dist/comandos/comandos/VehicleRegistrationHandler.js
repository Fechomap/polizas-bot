"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehicleRegistrationHandler = exports.vehiculosEnProceso = exports.ESTADOS_REGISTRO = void 0;
const VehicleController = __importStar(require("../../controllers/vehicleController"));
const teclados_1 = require("../teclados");
const StateKeyManager_1 = require("../../utils/StateKeyManager");
const CloudflareStorage_1 = require("../../services/CloudflareStorage");
const mexicanDataGenerator = __importStar(require("../../utils/mexicanDataGenerator"));
exports.ESTADOS_REGISTRO = {
    ESPERANDO_SERIE: 'esperando_serie',
    ESPERANDO_MARCA: 'esperando_marca',
    ESPERANDO_SUBMARCA: 'esperando_submarca',
    ESPERANDO_AÑO: 'esperando_año',
    ESPERANDO_COLOR: 'esperando_color',
    ESPERANDO_PLACAS: 'esperando_placas',
    ESPERANDO_FOTOS: 'esperando_fotos',
    COMPLETADO: 'completado'
};
exports.vehiculosEnProceso = StateKeyManager_1.StateKeyManager.createThreadSafeStateMap();
class VehicleRegistrationHandler {
    static async iniciarRegistro(bot, chatId, userId, threadId = null) {
        try {
            const stateKey = `${userId}:${StateKeyManager_1.StateKeyManager.getContextKey(chatId, threadId)}`;
            exports.vehiculosEnProceso.delete(stateKey);
            const mensaje = '🚗 *REGISTRO DE AUTO*\n\n' +
                '*1/6:* Número de serie (VIN) - 17 caracteres\n' +
                'Ejemplo: 3FADP4EJ2FM123456';
            const sendOptions = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]]
                }
            };
            if (threadId) {
                sendOptions.message_thread_id = parseInt(threadId);
            }
            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
            exports.vehiculosEnProceso.set(stateKey, {
                estado: exports.ESTADOS_REGISTRO.ESPERANDO_SERIE,
                chatId: chatId,
                threadId: threadId,
                datos: {},
                fotos: [],
                mensajeFotosId: null,
                iniciado: new Date()
            });
            return true;
        }
        catch (error) {
            console.error('Error al iniciar registro de vehículo:', error);
            const errorSendOptions = {};
            if (threadId) {
                errorSendOptions.message_thread_id = parseInt(threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ Error al iniciar el registro. Intenta nuevamente.', errorSendOptions);
            return false;
        }
    }
    static async procesarMensaje(bot, msg, userId) {
        const chatId = msg.chat.id;
        const threadId = msg.message_thread_id || null;
        const texto = msg.text?.trim();
        const stateKey = `${userId}:${StateKeyManager_1.StateKeyManager.getContextKey(chatId, threadId)}`;
        const registro = exports.vehiculosEnProceso.get(stateKey);
        if (!registro) {
            return false;
        }
        try {
            switch (registro.estado) {
                case exports.ESTADOS_REGISTRO.ESPERANDO_SERIE:
                    return await this.procesarSerie(bot, chatId, userId, texto, registro, stateKey);
                case exports.ESTADOS_REGISTRO.ESPERANDO_MARCA:
                    return await this.procesarMarca(bot, chatId, userId, texto, registro, stateKey);
                case exports.ESTADOS_REGISTRO.ESPERANDO_SUBMARCA:
                    return await this.procesarSubmarca(bot, chatId, userId, texto, registro, stateKey);
                case exports.ESTADOS_REGISTRO.ESPERANDO_AÑO:
                    return await this.procesarAño(bot, chatId, userId, texto, registro, stateKey);
                case exports.ESTADOS_REGISTRO.ESPERANDO_COLOR:
                    return await this.procesarColor(bot, chatId, userId, texto, registro, stateKey);
                case exports.ESTADOS_REGISTRO.ESPERANDO_PLACAS:
                    return await this.procesarPlacas(bot, chatId, userId, texto, registro, stateKey);
                case exports.ESTADOS_REGISTRO.ESPERANDO_FOTOS:
                    return await this.procesarFotos(bot, msg, userId, registro);
                default:
                    return false;
            }
        }
        catch (error) {
            console.error('Error procesando mensaje de registro:', error);
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ Error en el registro. Intenta nuevamente.', sendOptions);
            return true;
        }
    }
    static async procesarSerie(bot, chatId, userId, serie, registro, stateKey) {
        if (!serie || serie.length !== 17) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ El número de serie debe tener exactamente 17 caracteres.\nIntenta nuevamente:', sendOptions);
            return true;
        }
        const busqueda = await VehicleController.buscarVehiculo(serie);
        if (busqueda.success && busqueda.vehiculo) {
            const sendOptions = { parse_mode: 'Markdown' };
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ Ya existe un vehículo registrado con esta serie:\n\n' +
                `🚗 *${busqueda.vehiculo.marca} ${busqueda.vehiculo.submarca}*\n` +
                `📅 Año: ${busqueda.vehiculo.año}\n` +
                `🎨 Color: ${busqueda.vehiculo.color}\n` +
                `👤 Titular: ${busqueda.vehiculo.titular || busqueda.vehiculo.titularTemporal || 'Sin titular'}\n\n` +
                'Ingresa una serie diferente:', sendOptions);
            return true;
        }
        registro.datos.serie = serie.toUpperCase();
        registro.estado = exports.ESTADOS_REGISTRO.ESPERANDO_MARCA;
        exports.vehiculosEnProceso.set(stateKey, registro);
        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }
        await bot.telegram.sendMessage(chatId, `✅ Serie: *${serie.toUpperCase()}*\n\n` +
            '*2/6:* Marca\nEjemplo: Ford, Toyota, Nissan', sendOptions);
        return true;
    }
    static async procesarMarca(bot, chatId, userId, marca, registro, stateKey) {
        if (!marca || marca.length < 2) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ La marca debe tener al menos 2 caracteres.\nIntenta nuevamente:', sendOptions);
            return true;
        }
        registro.datos.marca = marca;
        registro.estado = exports.ESTADOS_REGISTRO.ESPERANDO_SUBMARCA;
        exports.vehiculosEnProceso.set(stateKey, registro);
        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }
        await bot.telegram.sendMessage(chatId, `✅ Marca: *${marca}*\n\n` + '*3/6:* Modelo\nEjemplo: Focus, Corolla, Sentra', sendOptions);
        return true;
    }
    static async procesarSubmarca(bot, chatId, userId, submarca, registro, stateKey) {
        if (!submarca || submarca.length < 2) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ La submarca debe tener al menos 2 caracteres.\nIntenta nuevamente:', sendOptions);
            return true;
        }
        registro.datos.submarca = submarca;
        registro.estado = exports.ESTADOS_REGISTRO.ESPERANDO_AÑO;
        exports.vehiculosEnProceso.set(stateKey, registro);
        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }
        await bot.telegram.sendMessage(chatId, `✅ Modelo: *${submarca}*\n\n` + '*4/6:* Año\nEjemplo: 2023, 2022, 2021', sendOptions);
        return true;
    }
    static async procesarAño(bot, chatId, userId, año, registro, stateKey) {
        const añoNum = parseInt(año);
        const añoActual = new Date().getFullYear();
        if (isNaN(añoNum) || añoNum < 1900 || añoNum > añoActual + 2) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, `❌ El año debe ser un número válido entre 1900 y ${añoActual + 2}.\nIntenta nuevamente:`, sendOptions);
            return true;
        }
        registro.datos.año = añoNum;
        registro.estado = exports.ESTADOS_REGISTRO.ESPERANDO_COLOR;
        exports.vehiculosEnProceso.set(stateKey, registro);
        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }
        await bot.telegram.sendMessage(chatId, `✅ Año: *${añoNum}*\n\n` + '*5/6:* Color\nEjemplo: Blanco, Negro, Rojo', sendOptions);
        return true;
    }
    static async procesarColor(bot, chatId, userId, color, registro, stateKey) {
        if (!color || color.length < 3) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ El color debe tener al menos 3 caracteres.\nIntenta nuevamente:', sendOptions);
            return true;
        }
        registro.datos.color = color;
        registro.estado = exports.ESTADOS_REGISTRO.ESPERANDO_PLACAS;
        exports.vehiculosEnProceso.set(stateKey, registro);
        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = parseInt(registro.threadId);
        }
        await bot.telegram.sendMessage(chatId, `✅ Color: *${color}*\n\n` +
            '*6/6:* Placas\nEjemplo: ABC-123-D\nSi no tiene: SIN PLACAS', sendOptions);
        return true;
    }
    static async procesarPlacas(bot, chatId, userId, placas, registro, stateKey) {
        if (!placas || placas.length < 3) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ Las placas deben tener al menos 3 caracteres.\nIntenta nuevamente:', sendOptions);
            return true;
        }
        registro.datos.placas = placas.toUpperCase() === 'SIN PLACAS' ? '' : placas;
        registro.estado = exports.ESTADOS_REGISTRO.ESPERANDO_FOTOS;
        exports.vehiculosEnProceso.set(stateKey, registro);
        const datosGenerados = await mexicanDataGenerator.generarDatosMexicanosCompletos();
        registro.datosGenerados = datosGenerados;
        registro.fotos = [];
        registro.mensajeFotosId = null;
        const resumen = '✅ *DATOS RECOPILADOS*\n\n' +
            `🚗 ${registro.datos.marca} ${registro.datos.submarca} ${registro.datos.año}\n` +
            `Color: ${registro.datos.color}\n` +
            `Placas: ${registro.datos.placas || 'Sin placas'}\n\n` +
            `👤 Titular: ${datosGenerados.titular}\n` +
            `📱 ${datosGenerados.telefono}\n\n` +
            '📸 **OBLIGATORIO:** Envía AL MENOS 1 foto del auto para continuar';
        const sendOptions = {
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
    static async procesarFotos(bot, msg, userId, registro) {
        const chatId = msg.chat.id;
        if (!msg.photo || !msg.photo.length) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '📸 Por favor envía una foto del vehículo o presiona "✅ Finalizar Registro" para completar.', sendOptions);
            return true;
        }
        try {
            const foto = msg.photo[msg.photo.length - 1];
            console.log('BD AUTOS - Foto recibida:', {
                file_id: foto.file_id,
                file_unique_id: foto.file_unique_id,
                width: foto.width,
                height: foto.height,
                file_size: foto.file_size
            });
            console.log('BD AUTOS - Intentando descarga inmediata de la foto...');
            let buffer = null;
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
                if (buffer.length < 100) {
                    console.error('BD AUTOS - Foto muy pequeña, posible error:', buffer.toString());
                    throw new Error('Foto demasiado pequeña, posible error de descarga');
                }
            }
            catch (downloadError) {
                console.error('BD AUTOS - Error descargando foto:', downloadError);
                const sendOptions = { parse_mode: 'Markdown' };
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }
                await bot.telegram.sendMessage(chatId, '❌ Error al procesar la foto. Por favor, intenta enviarla nuevamente.', sendOptions);
                return true;
            }
            const serie = registro.datos.serie;
            const timestamp = Date.now();
            const fotoFile = {
                buffer: buffer,
                originalname: `vehiculo_${serie}_foto_${timestamp}.jpg`,
                mimetype: 'image/jpeg',
                size: buffer.length
            };
            const storage = (0, CloudflareStorage_1.getInstance)();
            const fileName = `vehiculos/${serie}/${timestamp}_${fotoFile.originalname}`;
            const uploadResult = await storage.uploadFile(buffer, fileName, 'image/jpeg', {
                vehicleSerie: serie,
                type: 'vehiculo_foto',
                originalName: fotoFile.originalname
            });
            if (uploadResult.url) {
                registro.fotos.push({
                    url: uploadResult.url,
                    key: uploadResult.key,
                    originalname: fotoFile.originalname,
                    size: uploadResult.size || buffer.length,
                    uploadedAt: new Date()
                });
                const mensaje = `✅ Foto subida a Cloudflare\n📊 Total de fotos: ${registro.fotos.length}\n🔗 Serie: ${serie}\n\n` +
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
                    const sendOptions = { ...keyboard };
                    if (registro.threadId) {
                        sendOptions.message_thread_id = parseInt(registro.threadId);
                    }
                    const sentMessage = await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
                    registro.mensajeFotosId = sentMessage.message_id;
                }
                else {
                    if (registro.mensajeFotosId) {
                        try {
                            await bot.telegram.editMessageText(chatId, registro.mensajeFotosId, undefined, mensaje, keyboard);
                        }
                        catch (editError) {
                            console.warn('No se pudo editar mensaje de fotos, enviando nuevo:', editError.message);
                            const sendOptions = { ...keyboard };
                            if (registro.threadId) {
                                sendOptions.message_thread_id = parseInt(registro.threadId);
                            }
                            const sentMessage = await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
                            registro.mensajeFotosId = sentMessage.message_id;
                        }
                    }
                    else {
                        const sendOptions = { ...keyboard };
                        if (registro.threadId) {
                            sendOptions.message_thread_id = parseInt(registro.threadId);
                        }
                        const sentMessage = await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
                        registro.mensajeFotosId = sentMessage.message_id;
                    }
                }
            }
            else {
                const sendOptions = {};
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }
                await bot.telegram.sendMessage(chatId, '❌ Error al subir foto a Cloudflare. Intenta nuevamente.', sendOptions);
            }
        }
        catch (error) {
            console.error('Error procesando foto:', error);
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ Error al procesar la foto. Intenta nuevamente.', sendOptions);
        }
        return true;
    }
    static async finalizarRegistro(bot, chatId, userId, registro, stateKey) {
        try {
            if (!registro.fotos || registro.fotos.length === 0) {
                const sendOptions = { parse_mode: 'Markdown' };
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }
                await bot.telegram.sendMessage(chatId, '❌ **ERROR:** No se puede finalizar el registro sin fotos.\n\n' +
                    '📸 Debes subir AL MENOS 1 foto del vehículo para continuar.', sendOptions);
                return false;
            }
            const datosCompletos = {
                ...registro.datos,
                ...registro.datosGenerados
            };
            const resultado = await VehicleController.registrarVehiculo(datosCompletos, userId);
            if (!resultado.success) {
                const sendOptions = {};
                if (registro.threadId) {
                    sendOptions.message_thread_id = parseInt(registro.threadId);
                }
                await bot.telegram.sendMessage(chatId, `❌ Error al crear vehículo: ${resultado.error}`, sendOptions);
                return false;
            }
            const vehicle = resultado.vehicle;
            if (registro.fotos && registro.fotos.length > 0) {
                const resultadoFotos = await VehicleController.vincularFotosCloudflare(vehicle._id, registro.fotos);
                if (!resultadoFotos.success) {
                    console.warn('Error al vincular fotos de Cloudflare:', resultadoFotos.error);
                }
            }
            const mensaje = '🎉 *REGISTRO COMPLETADO*\n\n' +
                'El vehículo ha sido registrado exitosamente en la base de datos OBD.\n\n' +
                `🆔 ID: ${vehicle._id}\n` +
                `🚗 Vehículo: ${vehicle.marca} ${vehicle.submarca} ${vehicle.año}\n` +
                `👤 Titular: ${vehicle.titular || vehicle.titularTemporal || 'Sin titular'}\n` +
                `📊 Fotos: ${registro.fotos ? registro.fotos.length : 0}\n` +
                '📊 Estado: SIN PÓLIZA (listo para asegurar)\n\n' +
                '✅ El vehículo ya está disponible para que otra persona le asigne una póliza.';
            const sendOptions = {
                parse_mode: 'Markdown',
                reply_markup: (0, teclados_1.getMainKeyboard)()
            };
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
            exports.vehiculosEnProceso.delete(stateKey);
            return true;
        }
        catch (error) {
            console.error('Error finalizando registro:', error);
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = parseInt(registro.threadId);
            }
            await bot.telegram.sendMessage(chatId, '❌ Error al finalizar el registro.', sendOptions);
            return false;
        }
    }
    static tieneRegistroEnProceso(userId, chatId, threadId = null) {
        const stateKey = `${userId}:${StateKeyManager_1.StateKeyManager.getContextKey(chatId, threadId)}`;
        return exports.vehiculosEnProceso.has(stateKey);
    }
    static cancelarRegistro(userId, chatId, threadId = null) {
        const stateKey = `${userId}:${StateKeyManager_1.StateKeyManager.getContextKey(chatId, threadId)}`;
        exports.vehiculosEnProceso.delete(stateKey);
    }
    static getEstadisticasRegistros() {
        return {
            registrosActivos: exports.vehiculosEnProceso.size,
            registros: Array.from(exports.vehiculosEnProceso.entries()).map(([userId, registro]) => ({
                userId,
                estado: registro.estado,
                iniciado: registro.iniciado,
                marca: registro.datos.marca || 'Sin especificar'
            }))
        };
    }
}
exports.VehicleRegistrationHandler = VehicleRegistrationHandler;
