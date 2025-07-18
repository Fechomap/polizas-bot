const VehicleController = require('../../controllers/vehicleController');
const { getMainKeyboard } = require('../teclados');
const StateKeyManager = require('../../utils/StateKeyManager');

/**
 * Estados del flujo de registro de vehículos
 */
const ESTADOS_REGISTRO = {
    ESPERANDO_SERIE: 'esperando_serie',
    ESPERANDO_MARCA: 'esperando_marca',
    ESPERANDO_SUBMARCA: 'esperando_submarca',
    ESPERANDO_AÑO: 'esperando_año',
    ESPERANDO_COLOR: 'esperando_color',
    ESPERANDO_PLACAS: 'esperando_placas',
    ESPERANDO_FOTOS: 'esperando_fotos',
    COMPLETADO: 'completado'
};

/**
 * Almacena temporalmente los datos del vehículo en proceso
 * Usa StateKeyManager para thread-safety
 */
const vehiculosEnProceso = StateKeyManager.createThreadSafeStateMap();

/**
 * Handler para el registro de vehículos OBD
 */
class VehicleRegistrationHandler {
    /**
     * Inicia el proceso de registro de un nuevo vehículo
     */
    static async iniciarRegistro(bot, chatId, userId, threadId = null) {
        try {
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;

            // Limpiar cualquier registro previo para este usuario en este contexto
            vehiculosEnProceso.delete(stateKey);

            const mensaje =
                '🚗 *REGISTRO DE AUTO*\n\n' +
                '*1/6:* Número de serie (VIN) - 17 caracteres\n' +
                'Ejemplo: 3FADP4EJ2FM123456';

            const sendOptions = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]]
                }
            };

            // Enviar al hilo correcto si threadId está presente
            if (threadId) {
                sendOptions.message_thread_id = threadId;
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

            const errorSendOptions = {};
            if (threadId) {
                errorSendOptions.message_thread_id = threadId;
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
    static async procesarMensaje(bot, msg, userId) {
        const chatId = msg.chat.id;
        const threadId = msg.message_thread_id || null;
        const texto = msg.text?.trim();

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

            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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
    static async procesarSerie(bot, chatId, userId, serie, registro, stateKey) {
        if (!serie || serie.length !== 17) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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
            const sendOptions = { parse_mode: 'Markdown' };
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Ya existe un vehículo registrado con esta serie:\n\n' +
                    `🚗 *${busqueda.vehiculo.marca} ${busqueda.vehiculo.submarca}*\n` +
                    `📅 Año: ${busqueda.vehiculo.año}\n` +
                    `🎨 Color: ${busqueda.vehiculo.color}\n` +
                    `👤 Titular: ${busqueda.vehiculo.titular || busqueda.vehiculo.titularTemporal || 'Sin titular'}\n\n` +
                    'Ingresa una serie diferente:',
                sendOptions
            );
            return true;
        }

        registro.datos.serie = serie.toUpperCase();
        registro.estado = ESTADOS_REGISTRO.ESPERANDO_MARCA;
        vehiculosEnProceso.set(stateKey, registro);

        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = registro.threadId;
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
    static async procesarMarca(bot, chatId, userId, marca, registro, stateKey) {
        if (!marca || marca.length < 2) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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

        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = registro.threadId;
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
    static async procesarSubmarca(bot, chatId, userId, submarca, registro, stateKey) {
        if (!submarca || submarca.length < 2) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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

        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = registro.threadId;
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
    static async procesarAño(bot, chatId, userId, año, registro, stateKey) {
        const añoNum = parseInt(año);
        const añoActual = new Date().getFullYear();

        if (isNaN(añoNum) || añoNum < 1900 || añoNum > añoActual + 2) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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

        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = registro.threadId;
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
    static async procesarColor(bot, chatId, userId, color, registro, stateKey) {
        if (!color || color.length < 3) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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

        const sendOptions = { parse_mode: 'Markdown' };
        if (registro.threadId) {
            sendOptions.message_thread_id = registro.threadId;
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
    static async procesarPlacas(bot, chatId, userId, placas, registro, stateKey) {
        if (!placas || placas.length < 3) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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

        // Generar datos temporales sin guardar en BD aún
        const mexicanDataGenerator = require('../../utils/mexicanDataGenerator');
        const datosGenerados = await mexicanDataGenerator.generarDatosMexicanosCompletos();

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

        const sendOptions = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]]
            }
        };
        if (registro.threadId) {
            sendOptions.message_thread_id = registro.threadId;
        }

        await bot.telegram.sendMessage(chatId, resumen, sendOptions);

        return true;
    }

    /**
     * Procesa las fotos del vehículo
     */
    static async procesarFotos(bot, msg, userId, registro) {
        const chatId = msg.chat.id;

        // El comando de finalizar ahora se maneja via callback_data en BaseAutosCommand

        // Verificar si es una foto
        if (!msg.photo || !msg.photo.length) {
            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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
            const foto = msg.photo[msg.photo.length - 1];
            console.log('BD AUTOS - Foto recibida:', {
                file_id: foto.file_id,
                file_unique_id: foto.file_unique_id,
                width: foto.width,
                height: foto.height,
                file_size: foto.file_size
            });

            // Descargar inmediatamente usando getFileLink (igual que el PDF)
            console.log('BD AUTOS - Intentando descarga inmediata de la foto...');
            let buffer = null;
            try {
                const fileLink = await bot.telegram.getFileLink(foto.file_id);
                console.log('BD AUTOS - FileLink foto:', fileLink.href);

                const response = await require('node-fetch')(fileLink.href);
                if (!response.ok) {
                    throw new Error(`Error descargando foto: ${response.status}`);
                }
                buffer = await response.buffer();
                console.log('BD AUTOS - Foto descargada exitosamente, tamaño:', buffer.length);

                // Verificar que sea una imagen válida
                if (buffer.length < 100) {
                    console.error('BD AUTOS - Foto muy pequeña, posible error:', buffer.toString());
                    throw new Error('Foto demasiado pequeña, posible error de descarga');
                }
            } catch (downloadError) {
                console.error('BD AUTOS - Error descargando foto:', downloadError);

                const sendOptions = { parse_mode: 'Markdown' };
                if (registro.threadId) {
                    sendOptions.message_thread_id = registro.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al procesar la foto. Por favor, intenta enviarla nuevamente.',
                    sendOptions
                );
                return true;
            }

            // Usar el número de serie para nombrar las fotos en Cloudflare
            const serie = registro.datos.serie;
            const timestamp = Date.now();
            const fotoFile = {
                buffer: buffer,
                originalname: `vehiculo_${serie}_foto_${timestamp}.jpg`,
                mimetype: 'image/jpeg',
                size: buffer.length
            };

            // Subir INMEDIATAMENTE a Cloudflare con número de serie
            const { getInstance } = require('../../services/CloudflareStorage');
            const storage = getInstance();

            // Generar nombre de archivo para vehículos similar al formato de pólizas
            const fileName = `vehiculos/${serie}/${timestamp}_${fotoFile.originalname}`;

            const uploadResult = await storage.uploadFile(buffer, fileName, 'image/jpeg', {
                vehicleSerie: serie,
                type: 'vehiculo_foto',
                originalName: fotoFile.originalname
            });

            if (uploadResult.url) {
                // Guardar referencia de la foto con URL de Cloudflare
                registro.fotos.push({
                    url: uploadResult.url,
                    key: uploadResult.key,
                    originalname: fotoFile.originalname,
                    size: uploadResult.size || buffer.length, // Incluir el tamaño
                    uploadedAt: new Date()
                });

                // Crear mensaje con contador de fotos
                const mensaje =
                    `✅ Foto subida a Cloudflare\n📊 Total de fotos: ${registro.fotos.length}\n🔗 Serie: ${serie}\n\n` +
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
                    if (registro.threadId) {
                        keyboard.message_thread_id = registro.threadId;
                    }
                    const sentMessage = await bot.telegram.sendMessage(chatId, mensaje, keyboard);
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
                            // Si falla editar, enviar mensaje nuevo
                            console.warn(
                                'No se pudo editar mensaje de fotos, enviando nuevo:',
                                editError.message
                            );
                            if (registro.threadId) {
                                keyboard.message_thread_id = registro.threadId;
                            }
                            const sentMessage = await bot.telegram.sendMessage(
                                chatId,
                                mensaje,
                                keyboard
                            );
                            registro.mensajeFotosId = sentMessage.message_id;
                        }
                    } else {
                        // Fallback: enviar mensaje nuevo si no tenemos ID
                        if (registro.threadId) {
                            keyboard.message_thread_id = registro.threadId;
                        }
                        const sentMessage = await bot.telegram.sendMessage(
                            chatId,
                            mensaje,
                            keyboard
                        );
                        registro.mensajeFotosId = sentMessage.message_id;
                    }
                }
            } else {
                const sendOptions = {};
                if (registro.threadId) {
                    sendOptions.message_thread_id = registro.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al subir foto a Cloudflare. Intenta nuevamente.',
                    sendOptions
                );
            }
        } catch (error) {
            console.error('Error procesando foto:', error);

            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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
    static async finalizarRegistro(bot, chatId, userId, registro, stateKey) {
        try {
            // VALIDACIÓN OBLIGATORIA: Verificar que hay al menos 1 foto
            if (!registro.fotos || registro.fotos.length === 0) {
                const sendOptions = { parse_mode: 'Markdown' };
                if (registro.threadId) {
                    sendOptions.message_thread_id = registro.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ **ERROR:** No se puede finalizar el registro sin fotos.\n\n' +
                        '📸 Debes subir AL MENOS 1 foto del vehículo para continuar.',
                    sendOptions
                );
                return false;
            }

            // AHORA SÍ crear el vehículo en la base de datos
            // Combinar datos del vehículo con datos del titular generados
            const datosCompletos = {
                ...registro.datos,
                ...registro.datosGenerados
            };
            const resultado = await VehicleController.registrarVehiculo(datosCompletos, userId);

            if (!resultado.success) {
                const sendOptions = {};
                if (registro.threadId) {
                    sendOptions.message_thread_id = registro.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    `❌ Error al crear vehículo: ${resultado.error}`,
                    sendOptions
                );
                return false;
            }

            const vehicle = resultado.vehicle;

            // Si hay fotos ya subidas a Cloudflare, vincularlas al vehículo
            if (registro.fotos && registro.fotos.length > 0) {
                // Las fotos ya están en Cloudflare, solo guardamos las referencias
                const resultadoFotos = await VehicleController.vincularFotosCloudflare(
                    vehicle._id,
                    registro.fotos
                );
                if (!resultadoFotos.success) {
                    console.warn('Error al vincular fotos de Cloudflare:', resultadoFotos.error);
                    // No fallar el registro por fotos, solo advertir
                }
            }

            const mensaje =
                '🎉 *REGISTRO COMPLETADO*\n\n' +
                'El vehículo ha sido registrado exitosamente en la base de datos OBD.\n\n' +
                `🆔 ID: ${vehicle._id}\n` +
                `🚗 Vehículo: ${vehicle.marca} ${vehicle.submarca} ${vehicle.año}\n` +
                `👤 Titular: ${vehicle.titular || vehicle.titularTemporal || 'Sin titular'}\n` +
                `📊 Fotos: ${registro.fotos ? registro.fotos.length : 0}\n` +
                '📊 Estado: SIN PÓLIZA (listo para asegurar)\n\n' +
                '✅ El vehículo ya está disponible para que otra persona le asigne una póliza.';

            const sendOptions = {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            };
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
            }

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            // Limpiar el registro del proceso
            vehiculosEnProceso.delete(stateKey);

            return true;
        } catch (error) {
            console.error('Error finalizando registro:', error);

            const sendOptions = {};
            if (registro.threadId) {
                sendOptions.message_thread_id = registro.threadId;
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
     * Verifica si un usuario tiene un registro en proceso
     */
    static tieneRegistroEnProceso(userId, chatId, threadId = null) {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return vehiculosEnProceso.has(stateKey);
    }

    /**
     * Cancela un registro en proceso
     */
    static cancelarRegistro(userId, chatId, threadId = null) {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        vehiculosEnProceso.delete(stateKey);
    }

    /**
     * Obtiene estadísticas de registros activos
     */
    static getEstadisticasRegistros() {
        return {
            registrosActivos: vehiculosEnProceso.size,
            registros: Array.from(vehiculosEnProceso.entries()).map(([userId, registro]) => ({
                userId,
                estado: registro.estado,
                iniciado: registro.iniciado,
                marca: registro.datos.marca || 'Sin especificar'
            }))
        };
    }
}

module.exports = {
    VehicleRegistrationHandler,
    ESTADOS_REGISTRO,
    vehiculosEnProceso
};
