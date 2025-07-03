// src/comandos/comandos/OcuparPolizaCallback.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber } = require('../../controllers/policyController');
const { Markup } = require('telegraf');
const flowStateManager = require('../../utils/FlowStateManager');
const StateKeyManager = require('../../utils/StateKeyManager');
const HereMapsService = require('../../services/HereMapsService');


class OcuparPolizaCallback extends BaseCommand {
    constructor(handler) {
        super(handler);
        // Usamos los mapas thread-safe del handler
        this.awaitingPhoneNumber = handler.awaitingPhoneNumber;
        this.awaitingOrigenDestino = handler.awaitingOrigenDestino;
        this.awaitingOrigen = handler.awaitingOrigen;
        this.awaitingDestino = handler.awaitingDestino;

        // Crear mapas thread-safe para estados propios
        this.pendingLeyendas = StateKeyManager.createThreadSafeStateMap();
        this.polizaCache = StateKeyManager.createThreadSafeStateMap();
        this.messageIds = StateKeyManager.createThreadSafeStateMap();

        // Para asignación de servicio
        this.awaitingContactTime = StateKeyManager.createThreadSafeStateMap();
        this.scheduledServiceInfo = StateKeyManager.createThreadSafeStateMap();

        // Initialize HERE Maps service
        this.hereMapsService = new HereMapsService();
    }

    getCommandName() {
        return 'ocuparPoliza';
    }

    getDescription() {
        return 'Manejador para ocupar una póliza (asignar teléfono y origen-destino)';
    }

    register() {
        // Register the callback for "ocuparPoliza" button
        this.handler.registry.registerCallback(/ocuparPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx); // Obtiene el threadId
                this.logInfo(`[keepPhone] Iniciando callback para póliza ${numeroPoliza}`, { chatId, threadId }); // Log inicio

                // Get the policy to get the phone number
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }

                // Cache the current policy for later use
                this.polizaCache.set(chatId, {
                    numeroPoliza,
                    policy
                }, threadId);

                // Check if phone number already exists
                if (policy.telefono) {
                    // Show options to continue with existing number or change it
                    await ctx.reply(
                        `📱 Esta póliza ya cuenta con un número telefónico registrado en el sistema: ${policy.telefono}\n` +
                        'Si deseas cambiar el número telefónico, por favor ingrésalo a continuación.\n' +
                        'De lo contrario, presiona OK para continuar.',
                        Markup.inlineKeyboard([
                            Markup.button.callback('✅ OK (Mantener número)', `keepPhone:${numeroPoliza}`)
                        ])
                    );

                    // Set state to awaiting phone number (even if already exists)
                    // This allows direct typing of a new number
                    const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                    this.logInfo(`Estado de espera de teléfono guardado para teléfono existente: ${phoneSetResult ? 'OK' : 'FALLO'}`, {
                        chatId,
                        threadId
                    });
                    const phoneHasResult = this.awaitingPhoneNumber.has(chatId, threadId);
                    this.logInfo(`Verificación inmediata de estado teléfono (existente): ${phoneHasResult ? 'OK' : 'FALLO'}`);
                } else {
                    // No phone number exists, request it
                    const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                    this.logInfo(`Estado de espera de teléfono guardado para nuevo teléfono: ${phoneSetResult ? 'OK' : 'FALLO'}`, {
                        chatId,
                        threadId
                    });
                    const phoneHasResult = this.awaitingPhoneNumber.has(chatId, threadId);
                    this.logInfo(`Verificación inmediata de estado teléfono (nuevo): ${phoneHasResult ? 'OK' : 'FALLO'}`);
                    await ctx.reply(
                        `📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                        '⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.',
                        { parse_mode: 'Markdown' }
                    );
                }

                this.logInfo(`Esperando teléfono para póliza ${numeroPoliza}`, {
                    chatId: ctx.chat.id,
                    threadId
                });
            } catch (error) {
                this.logError('Error en callback ocuparPoliza:', error);
                await ctx.reply('❌ Error al procesar ocupación de póliza.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for keeping existing phone number
        this.handler.registry.registerCallback(/keepPhone:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // Get the policy to get the phone number
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }

                // Clean up the phone number waiting state
                this.logInfo('[keepPhone] Intentando eliminar estado awaitingPhoneNumber', { chatId, threadId });
                const deleteResult = this.awaitingPhoneNumber.delete(chatId, threadId); // Intenta eliminar estado de espera de teléfono
                this.logInfo(`[keepPhone] Resultado de delete awaitingPhoneNumber: ${deleteResult}`, { chatId, threadId });
                const hasAfterDelete = this.awaitingPhoneNumber.has(chatId, threadId);
                this.logInfo(`[keepPhone] Verificación inmediata awaitingPhoneNumber.has: ${hasAfterDelete}`, { chatId, threadId });

                // Ask for origin location first (new flow)
                this.logInfo('[keepPhone] Intentando establecer estado awaitingOrigen', { chatId, threadId });
                const setResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
                this.logInfo(`[keepPhone] Resultado de set awaitingOrigen: ${setResult}`, { chatId, threadId });
                const hasAfterSet = this.awaitingOrigen.has(chatId, threadId);
                this.logInfo(`[keepPhone] Verificación inmediata awaitingOrigen.has: ${hasAfterSet}`, { chatId, threadId });

                await ctx.reply(
                    `✅ Se mantendrá el número: ${policy.telefono}\n\n` +
                    '📍 *Paso 1/2: Envía la ubicación del ORIGEN*\n\n' +
                    '🔹 Opción 1: Envía coordenadas (ej: "19.1234,-99.5678")\n' +
                    '🔹 Opción 2: Envía URL de Google Maps\n' +
                    '🔹 Opción 3: En chat privado puedes compartir ubicación',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                this.logError('Error en callback keepPhone:', error);
                await ctx.reply('❌ Error al procesar la acción.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for sending the leyenda
        this.handler.registry.registerCallback(/sendLeyenda:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`Iniciando envío de leyenda para póliza ${numeroPoliza}`, { chatId, threadId });

                // Get the leyenda from the map
                const leyenda = this.pendingLeyendas.get(chatId, threadId);
                if (!leyenda) {
                    this.logError(`No se encontró leyenda para enviar. chatId=${chatId}, threadId=${threadId}`);
                    return await ctx.reply('❌ No se encontró la leyenda para enviar. Inténtalo nuevamente.');
                }

                this.logInfo(`Leyenda recuperada: ${leyenda}`);

                // Send the leyenda to the predefined group
                const targetGroupId = -1002212807945; // ID fijo del grupo

                try {
                    this.logInfo(`Intentando enviar leyenda al grupo ${targetGroupId}`);
                    const sentMsg = await ctx.telegram.sendMessage(targetGroupId, leyenda);
                    this.logInfo(`Leyenda enviada al grupo: ${targetGroupId}, messageId=${sentMsg.message_id}`);

                    // Get the message ID to edit
                    const messageId = this.messageIds.get(chatId, threadId);
                    if (messageId) {
                        this.logInfo(`Editando mensaje original ${messageId}`);
                        // Edit the original message to show new buttons
                        await ctx.telegram.editMessageText(
                            chatId,
                            messageId,
                            undefined,
                            '✅ Origen-destino asignado.\n\n' +
                            `📋 Leyenda del servicio:\n\`\`\`${leyenda}\`\`\`\n\n` +
                            '✅ Leyenda enviada al grupo de servicios.\n\n' +
                            '¿El servicio fue asignado?',
                            {
                                parse_mode: 'Markdown',
                                ...Markup.inlineKeyboard([
                                    [
                                        Markup.button.callback('✅ Asignado', `asig_yes_${numeroPoliza}`),
                                        Markup.button.callback('❌ No asignado', `asig_no_${numeroPoliza}`)
                                    ]
                                ])
                            }
                        );
                        this.logInfo('Mensaje editado correctamente');
                    } else {
                        this.logInfo('No se encontró ID del mensaje para editar, enviando mensaje nuevo');
                        // Fallback if message ID not found
                        await ctx.reply(
                            '✅ Leyenda enviada exitosamente al grupo de servicios.\n\n' +
                            '¿El servicio fue asignado?',
                            Markup.inlineKeyboard([
                                [
                                    Markup.button.callback('✅ Asignado', `asig_yes_${numeroPoliza}`),
                                    Markup.button.callback('❌ No asignado', `asig_no_${numeroPoliza}`)
                                ]
                            ])
                        );
                    }
                } catch (sendError) {
                    this.logError('Error al enviar leyenda al grupo o editar mensaje:', sendError);
                    await ctx.reply('❌ No se pudo enviar la leyenda al grupo. Verifica que el bot esté en el grupo.');
                    // Clean up states on error
                    this.pendingLeyendas.delete(chatId, threadId);
                    return;
                }

                // Don't clean up everything yet, as we need to continue the flow
                // Just clean up the leyenda as we don't need it anymore
                this.pendingLeyendas.delete(chatId, threadId);
            } catch (error) {
                this.logError('Error en callback sendLeyenda:', error);
                await ctx.reply('❌ Error al enviar la leyenda.');
                // Clean up on error
                const threadId = StateKeyManager.getThreadId(ctx);
                this.cleanupAllStates(ctx.chat.id, threadId);
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for "Asignado" button
        // En OcuparPolizaCallback.js - Callback para "Asignado" button
        this.handler.registry.registerCallback(/asig_yes_(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`Servicio marcado como asignado para póliza: ${numeroPoliza}`, { chatId, threadId });

                // Guardar datos para uso posterior (igual que antes)
                let policy;
                const cachedData = this.polizaCache.get(chatId, threadId);

                if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                    policy = cachedData.policy;
                    this.logInfo(`Usando política en caché para ${numeroPoliza} (asig_yes)`);
                } else {
                    // ... resto de código igual
                }

                // CAMBIO: En lugar de solicitar hora de contacto, solicitar datos del servicio
                // Get the message ID to edit
                const messageId = this.messageIds.get(chatId, threadId);
                if (messageId) {
                    this.logInfo(`Editando mensaje ${messageId} para solicitar datos del servicio`);
                    // Modificar el mensaje para pedir solo el número de expediente
                    await ctx.telegram.editMessageText(
                        chatId,
                        messageId,
                        undefined,
                        `✅ Servicio marcado como asignado para póliza *${numeroPoliza}*.\n\n` +
                        '🚗 *Ingresa el número de expediente:*\n' +
                        '📝 Ejemplo: EXP-2025-001\n\n' +
                        '✅ Los demás datos se calculan automáticamente:\n' +
                        '• Fecha: Se asigna automáticamente\n' +
                        '• Costo: Se calcula según distancia\n' +
                        '• Origen/Destino: Se toman de la ruta calculada',
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    // Fallback si no se encuentra el ID del mensaje
                    await ctx.reply(
                        `✅ Servicio marcado como asignado para póliza *${numeroPoliza}*.\n\n` +
                        '🚗 *Ingresa el número de expediente:*\n' +
                        '📝 Ejemplo: EXP-2025-001\n\n' +
                        '✅ Los demás datos se calculan automáticamente:\n' +
                        '• Fecha: Se asigna automáticamente\n' +
                        '• Costo: Se calcula según distancia\n' +
                        '• Origen/Destino: Se toman de la ruta calculada',
                        { parse_mode: 'Markdown' }
                    );
                }

                // CAMBIO: Establecer el estado para esperar datos del servicio en vez de hora de contacto
                this.handler.awaitingServiceData.set(chatId, numeroPoliza, threadId);
                this.logInfo(`Estado establecido para esperar datos del servicio para ${numeroPoliza}`);

                // Guardar que estamos en flujo de notificación después de servicio
                this.scheduledServiceInfo.set(chatId, {
                    numeroPoliza,
                    policy,
                    waitingForServiceData: true
                }, threadId);
            } catch (error) {
                this.logError('Error en callback assignedService:', error);
                await ctx.reply('❌ Error al procesar la asignación del servicio.');
                const threadId = StateKeyManager.getThreadId(ctx);
                this.cleanupAllStates(ctx.chat.id, threadId);
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for "No asignado" button
        this.handler.registry.registerCallback(/asig_no_(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`[asig_no_] Servicio marcado como NO asignado para póliza: ${numeroPoliza}`, { chatId }); // Added prefix for clarity

                // Get the message ID to edit
                const messageId = this.messageIds.get(chatId);
                if (messageId) {
                    this.logInfo(`[asig_no_] Intentando editar mensaje ID: ${messageId} para chatId: ${chatId}`, { numeroPoliza }); // Added log
                    // Edit the original message for clearer confirmation and remove buttons
                    await ctx.telegram.editMessageText(
                        chatId,
                        messageId,
                        undefined,
                        `*🚫 Servicio NO Asignado*\n\nPóliza: ${numeroPoliza}\nEl flujo ha finalizado. Ya no se requieren más acciones para esta póliza en este momento.`, // Enhanced message
                        { parse_mode: 'Markdown' } // No buttons specified, so they are removed
                    );
                    this.logInfo(`[asig_no_] Mensaje ${messageId} editado correctamente.`, { numeroPoliza }); // Added success log
                } else {
                    // Fallback - Log this case as it indicates an issue with messageId tracking
                    this.logInfo(`[asig_no_] No se encontró messageId para chatId: ${chatId}. Enviando respuesta nueva.`, { numeroPoliza });
                    await ctx.reply(`🚫 Servicio marcado como no asignado para póliza ${numeroPoliza}. Flujo finalizado.`); // Slightly improved fallback
                }

                // Clean up all states
                this.cleanupAllStates(chatId);
            } catch (error) {
                const numeroPoliza = ctx.match[1]; // Define it here for error context
                this.logError('Error en callback asig_no_:', error, { numeroPoliza }); // Updated log label and added context
                await ctx.reply('❌ Error al procesar la acción de "No asignado".'); // Slightly improved error message
                this.cleanupAllStates(ctx.chat.id); // Ensure cleanup even on error
            } finally {
                await ctx.answerCbQuery(); // Acknowledge the callback query
            }
        });

        // Register callback for "Añadir servicio"
        this.handler.registry.registerCallback(/addServiceFromTime:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`Iniciando flujo de añadir servicio para póliza: ${numeroPoliza}`, { chatId, threadId });

                // Limpiar estados pero conservar datos importantes en FlowStateManager
                this.cleanupAllStates(chatId, threadId);

                // Ejecutar el flujo estándar de 'accion:addservice'
                await ctx.answerCbQuery();

                // Iniciar el flujo de añadir servicio con la póliza ya seleccionada
                try {
                    // Obtener info de servicio guardada
                    const flowStateManager = require('../../utils/FlowStateManager');
                    const savedState = flowStateManager.getState(chatId, numeroPoliza, threadId);

                    if (savedState) {
                        this.logInfo(`Estado recuperado para addServiceFromTime: origen=${savedState.origin}, destino=${savedState.destination}, time=${savedState.time}`);
                    }

                    // Verificar si existe handler específico para añadir servicio
                    if (this.handler && typeof this.handler.handleAddServicePolicyNumber === 'function') {
                        // Pasar la póliza directamente
                        this.logInfo(`Llamando directamente a handleAddServicePolicyNumber con ${numeroPoliza}`);
                        await this.handler.handleAddServicePolicyNumber(ctx, numeroPoliza);
                    } else {
                        this.logInfo('No se encontró handler específico, simulando accion:addservice estándar');
                        // Falback - Simular accion:addservice
                        this.handler.awaitingServicePolicyNumber.set(chatId, true, threadId);
                        await ctx.reply('🚗 Introduce el número de póliza para añadir el servicio:');
                    }
                } catch (flowError) {
                    this.logError('Error al iniciar flujo de addservice:', flowError);
                    await ctx.reply(`❌ Error al iniciar el proceso. Intente usando "Añadir Servicio" desde el menú principal con póliza ${numeroPoliza}`);
                }
            } catch (error) {
                this.logError('Error al iniciar flujo addService:', error);
                await ctx.reply('❌ Error al iniciar el proceso de añadir servicio.');
                const threadId = StateKeyManager.getThreadId(ctx);
                this.cleanupAllStates(ctx.chat.id, threadId);
            }
        });

        // Register callback for canceling the leyenda
        this.handler.registry.registerCallback(/cancelLeyenda:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;

                // Get the message ID to edit
                const messageId = this.messageIds.get(chatId);
                if (messageId) {
                    // Edit the original message to disable buttons
                    await ctx.telegram.editMessageText(
                        chatId,
                        messageId,
                        undefined,
                        `❌ Operación cancelada para la póliza ${numeroPoliza}.`,
                        { parse_mode: 'Markdown' }
                        // Sin botones
                    );
                } else {
                    // Fallback if message ID not found
                    await ctx.reply(`❌ Operación cancelada para la póliza ${numeroPoliza}.`);
                }

                // Clean up all states
                this.cleanupAllStates(chatId);
            } catch (error) {
                this.logError('Error en callback cancelLeyenda:', error);
                await ctx.reply('❌ Error al cancelar la operación.');
                this.cleanupAllStates(ctx.chat.id);
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Callback para procesar la selección de día
        // En el callback para procesar la selección de día (alrededor de la línea 430)
        this.handler.registry.registerCallback(/selectDay:(\d+):(.+)/, async (ctx) => {
            try {
                const daysOffset = parseInt(ctx.match[1], 10);
                const numeroPoliza = ctx.match[2];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`Selección de día: offset=${daysOffset}, póliza=${numeroPoliza}`, { chatId, threadId });

                await ctx.answerCbQuery();

                // Obtener información del servicio
                const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
                if (!serviceInfo || !serviceInfo.contactTime) {
                    this.logError('No se encontró info de servicio o falta hora de contacto');
                    return await ctx.reply('❌ Error: No se encontró la información de la hora de contacto.');
                }

                this.logInfo(`Recuperada info de servicio: contactTime=${serviceInfo.contactTime}, origen=${serviceInfo.origen}, destino=${serviceInfo.destino}`);

                // Calcular la fecha programada completa usando moment-timezone
                const moment = require('moment-timezone');
                const today = moment().tz('America/Mexico_City');
                const scheduledMoment = today.clone().add(daysOffset, 'days');

                // Asignar la hora al día seleccionado
                const [hours, minutes] = serviceInfo.contactTime.split(':').map(Number);
                scheduledMoment.hour(hours).minute(minutes).second(0).millisecond(0);

                // Convertir a Date object para compatibilidad
                const scheduledDateJS = scheduledMoment.toDate();

                // Actualizar el serviceInfo con la fecha completa
                serviceInfo.scheduledDate = scheduledDateJS;
                const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);

                this.logInfo(`Info de servicio actualizada con fecha=${scheduledMoment.format()}: ${serviceStore ? 'OK' : 'FALLO'}`);

                // Guardar en FlowStateManager para uso posterior
                const flowStateManager = require('../../utils/FlowStateManager');
                flowStateManager.saveState(chatId, numeroPoliza, {
                    time: serviceInfo.contactTime,
                    date: scheduledDateJS.toISOString(),
                    origin: serviceInfo.origen,
                    destination: serviceInfo.destino
                }, threadId);

                // Formatear la fecha para mostrar
                const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                // CAMBIO: Usar moment para obtener el día de la semana
                const dayName = dayNames[scheduledMoment.day()];
                const dateStr = scheduledMoment.format('DD/MM/YYYY');

                // PROGRAMAR LA ALERTA EN EL SISTEMA DE NOTIFICACIONES
                try {
                    // Obtener el NotificationManager
                    const { getInstance: getNotificationManager } = require('../../services/NotificationManager');
                    const notificationManager = getNotificationManager(this.bot);

                    if (!notificationManager || !notificationManager.isInitialized) {
                        this.logInfo('NotificationManager no está inicializado, la notificación será solo visual');
                    } else {
                        // CAMBIO: Usar el expediente guardado durante el servicio
                        const savedState = flowStateManager.getState(chatId, numeroPoliza, threadId);
                        const expedienteNum = serviceInfo.expediente ||
                            (savedState && savedState.expedienteNum
                                ? savedState.expedienteNum
                                : `EXP-${new Date().toISOString().slice(0,10)}`);
                        this.logInfo(`Usando número de expediente: ${expedienteNum} para notificación`);

                        // Programar la notificación en el sistema
                        const notification = await notificationManager.scheduleNotification({
                            numeroPoliza: numeroPoliza,
                            targetGroupId: -1002212807945,
                            contactTime: serviceInfo.contactTime,
                            expedienteNum: expedienteNum,
                            origenDestino: serviceInfo.origenDestino || `${serviceInfo.origen} - ${serviceInfo.destino}`,
                            marcaModelo: `${serviceInfo.policy.marca} ${serviceInfo.policy.submarca} (${serviceInfo.policy.año})`,
                            colorVehiculo: serviceInfo.policy.color,
                            placas: serviceInfo.policy.placas,
                            telefono: serviceInfo.policy.telefono,
                            scheduledDate: scheduledDateJS // Usar el objeto Date directamente
                        });

                        this.logInfo(`Notificación programada ID: ${notification._id}, para: ${scheduledMoment.format('YYYY-MM-DD HH:mm:ss z')}`);
                    }
                } catch (notifyError) {
                    this.logError('Error al programar notificación:', notifyError);
                    // Continuar a pesar del error, no es crítico
                }

                // Mostrar solo confirmación sin botón adicional
                await ctx.editMessageText(
                    `✅ Alerta programada para: *${dayName}, ${dateStr} a las ${serviceInfo.contactTime}*\n\n` +
                    'El servicio ha sido registrado correctamente. No se requieren más acciones.',
                    {
                        parse_mode: 'Markdown'
                        // Sin botones adicionales
                    }
                );

                // Cleanup estado de espera de hora de contacto y otros estados del flujo
                this.logInfo(`Limpiando estados para chatId=${chatId}, threadId=${threadId} después de completar flujo.`);
                this.cleanupAllStates(chatId, threadId); // Asegurarse de pasar threadId aquí

            } catch (error) {
                this.logError('Error al procesar selección de día:', error);
                await ctx.reply('❌ Error al procesar la selección de día. Operación cancelada.');
                // Asegurarse de obtener threadId para la limpieza
                const threadId = StateKeyManager.getThreadId(ctx);
                this.cleanupAllStates(ctx.chat.id, threadId);
            }
        });

        // Callback para cancelar la selección de día
        this.handler.registry.registerCallback(/cancelSelectDay:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;

                await ctx.answerCbQuery('Operación cancelada');
                await ctx.editMessageText('❌ Programación de alerta cancelada.');

                // Limpiar estados
                this.awaitingContactTime.delete(chatId);
                this.cleanupAllStates(chatId);

            } catch (error) {
                this.logError('Error al cancelar selección de día:', error);
                await ctx.reply('❌ Error al cancelar. Intente nuevamente.');
            }
        });
    }

    // Helper method to generate enhanced legend with geocoding
    async generateEnhancedLegend(policy, origenCoords, destinoCoords, rutaInfo) {
        try {
            // Realizar geocoding reverso para origen y destino
            const [origenGeo, destinoGeo] = await Promise.all([
                this.hereMapsService.reverseGeocode(origenCoords.lat, origenCoords.lng),
                this.hereMapsService.reverseGeocode(destinoCoords.lat, destinoCoords.lng)
            ]);

            // Generar URL de Google Maps
            const googleMapsUrl = this.hereMapsService.generateGoogleMapsUrl(origenCoords, destinoCoords);

            // Formato de ubicación simplificado: "Colonia - Municipio"
            const origenTexto = origenGeo.ubicacionCorta.toUpperCase();
            const destinoTexto = destinoGeo.ubicacionCorta.toUpperCase();

            // Nuevo formato de leyenda según especificaciones
            const leyenda = `⚠️ ${policy.aseguradora} ⚠️\n` +
                `${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
                `${origenTexto} - ${destinoTexto}\n` +
                `${googleMapsUrl}`;

            this.logInfo(`Nueva leyenda generada: ${leyenda}`);

            return {
                leyenda,
                origenGeo,
                destinoGeo,
                googleMapsUrl
            };
        } catch (error) {
            this.logError('Error generando leyenda mejorada:', error);

            // Fallback: usar coordenadas directas
            const googleMapsUrl = this.hereMapsService.generateGoogleMapsUrl(origenCoords, destinoCoords);
            const leyenda = `⚠️ ${policy.aseguradora} ⚠️\n` +
                `${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
                `${origenCoords.lat.toFixed(4)}, ${origenCoords.lng.toFixed(4)} - ${destinoCoords.lat.toFixed(4)}, ${destinoCoords.lng.toFixed(4)}\n` +
                `${googleMapsUrl}`;

            return {
                leyenda,
                origenGeo: { ubicacionCorta: `${origenCoords.lat.toFixed(4)}, ${origenCoords.lng.toFixed(4)}`, fallback: true },
                destinoGeo: { ubicacionCorta: `${destinoCoords.lat.toFixed(4)}, ${destinoCoords.lng.toFixed(4)}`, fallback: true },
                googleMapsUrl
            };
        }
    }

    // Helper method to clean up all states
    cleanupAllStates(chatId, threadId = null) {
        if (threadId) {
            // Limpiar solo el estado del hilo específico
            this.pendingLeyendas.delete(chatId, threadId);
            this.polizaCache.delete(chatId, threadId);
            this.messageIds.delete(chatId, threadId);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            this.awaitingOrigenDestino.delete(chatId, threadId);
            this.awaitingContactTime.delete(chatId, threadId);
            this.scheduledServiceInfo.delete(chatId, threadId);

            // También limpiar en FlowStateManager
            const flowStateManager = require('../../utils/FlowStateManager');
            flowStateManager.clearAllStates(chatId, threadId);

            // IMPORTANTE: Llamar también a la limpieza general del CommandHandler
            if (this.handler && typeof this.handler.clearChatState === 'function') {
                this.logInfo('Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates', { chatId, threadId });
                this.handler.clearChatState(chatId, threadId);
            } else {
                this.logWarn('No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback');
            }
        } else {
            // Limpiar todos los estados para este chat
            this.pendingLeyendas.deleteAll(chatId);
            this.polizaCache.deleteAll(chatId);
            this.messageIds.deleteAll(chatId);
            this.awaitingPhoneNumber.deleteAll(chatId);
            this.awaitingOrigenDestino.deleteAll(chatId);
            this.awaitingContactTime.deleteAll(chatId);
            this.scheduledServiceInfo.deleteAll(chatId);

            // También limpiar en FlowStateManager
            const flowStateManager = require('../../utils/FlowStateManager');
            flowStateManager.clearAllStates(chatId); // Limpia todos los hilos si threadId es null

            // IMPORTANTE: Llamar también a la limpieza general del CommandHandler
            if (this.handler && typeof this.handler.clearChatState === 'function') {
                this.logInfo('Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates (sin threadId)', { chatId });
                this.handler.clearChatState(chatId, null); // Asegurarse de pasar null para limpiar todo el chat
            } else {
                this.logWarn('No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback (sin threadId)');
            }
        }
    }

    // Method to schedule a contact message to be sent at the specified time
    scheduleContactMessage(ctx, numeroPoliza, contactTime, expedienteNum) {
        try {
            // Parse the contact time (HH:mm)
            const [hours, minutes] = contactTime.split(':').map(Number);

            // Create a Date object for today with the specified time
            const now = new Date();
            const scheduledTime = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                hours,
                minutes,
                0
            );

            // If the time is already past for today, don't schedule
            if (scheduledTime < now) {
                this.logError('Hora de contacto ya pasó para hoy:', {
                    numeroPoliza,
                    contactTime,
                    now: now.toISOString()
                });
                return;
            }

            // Calculate milliseconds until the scheduled time
            const timeToWait = scheduledTime.getTime() - now.getTime();

            // Log scheduling info
            this.logInfo('Programando mensaje de contacto:', {
                numeroPoliza,
                expedienteNum,
                contactTime,
                scheduledTime: scheduledTime.toISOString(),
                timeToWaitMs: timeToWait
            });

            // Schedule the message using setTimeout
            setTimeout(async () => {
                try {
                    // Prepare the contact message
                    const contactMessage =
                        '🕒 **Servicio en contacto**\n' +
                        `📄 Expediente: ${expedienteNum}\n` +
                        `🗓 Hora de contacto: ${contactTime}\n` +
                        '✅ Favor de dar seguimiento en este chat.';

                    // Send the message to the group
                    const targetGroupId = -1002212807945; // ID fijo del grupo
                    await ctx.telegram.sendMessage(targetGroupId, contactMessage, {
                        parse_mode: 'Markdown'
                    });

                    this.logInfo('Mensaje de contacto enviado exitosamente:', {
                        numeroPoliza,
                        expedienteNum,
                        contactTime
                    });
                } catch (error) {
                    this.logError('Error al enviar mensaje de contacto programado:', error);
                }
            }, timeToWait);

            return true;
        } catch (error) {
            this.logError('Error al programar mensaje de contacto:', error);
            return false;
        }
    }

    // Method to handle phone number input (called from TextMessageHandler)
    async handlePhoneNumber(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingPhoneNumber.get(chatId, threadId);

        // Verificar que el mensaje corresponde al threadId activo
        const flowStateManager = require('../../utils/FlowStateManager');
        const activeFlows = flowStateManager.getActiveFlows(chatId, threadId);
        // Si llega un mensaje sin threadId mientras hay flujos activos en otros hilos, lo ignoramos
        if (!threadId && activeFlows.some(flow => flow.threadId && flow.threadId !== threadId)) {
            this.logInfo('Ignorando mensaje sin threadId mientras hay flujos activos en otros hilos');
            return false;
        }

        // Validate that it's 10 digits
        const regexTel = /^\d{10}$/;
        if (!regexTel.test(messageText)) {
            // Invalid phone => cancel
            this.awaitingPhoneNumber.delete(chatId, threadId);
            return await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelada.');
        }

        try {
            // Get policy from cache or directly from DB
            let policy;
            const cachedData = this.polizaCache.get(chatId, threadId);

            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
            } else {
                policy = await getPolicyByNumber(numeroPoliza);
            }

            if (!policy) {
                this.logError(`Póliza no encontrada en handlePhoneNumber: ${numeroPoliza}`);
                this.awaitingPhoneNumber.delete(chatId, threadId);
                return await ctx.reply(`❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`);
            }

            // Save to policy.telefono
            policy.telefono = messageText;
            await policy.save();

            // Update cache if exists
            if (cachedData) {
                cachedData.policy = policy;
                this.polizaCache.set(chatId, cachedData, threadId);
            }

            await ctx.reply(
                `✅ Teléfono ${messageText} asignado a la póliza ${numeroPoliza}.\n\n` +
                '📍 *Paso 1/2: Envía la ubicación del ORIGEN*\n\n' +
                '🔹 Opción 1: Envía coordenadas (ej: "19.1234,-99.5678")\n' +
                '🔹 Opción 2: Envía URL de Google Maps\n' +
                '🔹 Opción 3: En chat privado puedes compartir ubicación',
                { parse_mode: 'Markdown' }
            );

            // Move to "awaitingOrigen" with explicit verification
            this.awaitingPhoneNumber.delete(chatId, threadId);

            // Set the origin state with logging
            const origenResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
            this.logInfo(`Estado de espera de origen guardado: ${origenResult ? 'OK' : 'FALLO'}`, {
                chatId,
                threadId: threadId || 'ninguno'
            });

            // Immediate verification
            const origenHasResult = this.awaitingOrigen.has(chatId, threadId);
            this.logInfo(`Verificación inmediata de estado origen-destino: ${origenHasResult ? 'OK' : 'FALLO'}`);

            return true;
        } catch (error) {
            this.logError(`Error guardando teléfono para póliza ${numeroPoliza}:`, error);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await ctx.reply('❌ Error al guardar el teléfono. Operación cancelada.');
            return true;
        }
    }

    // Method to handle origin-destination input (called from TextMessageHandler)
    async handleOrigenDestino(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingOrigenDestino.get(chatId, threadId);

        this.logInfo(`Procesando origen-destino para póliza ${numeroPoliza}: ${messageText}`, {
            chatId,
            threadId: threadId || 'ninguno'
        });

        try {
            // Get policy from cache or directly from DB
            let policy;
            const cachedData = this.polizaCache.get(chatId, threadId);

            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
                this.logInfo(`Usando política en caché para ${numeroPoliza}`);
            } else {
                this.logInfo(`Buscando política en BD para ${numeroPoliza}`);
                policy = await getPolicyByNumber(numeroPoliza);
            }

            if (!policy) {
                this.logError(`Póliza no encontrada en handleOrigenDestino: ${numeroPoliza}`);
                this.awaitingOrigenDestino.delete(chatId, threadId);
                return await ctx.reply(`❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`);
            }

            // New enhanced parsing that handles coordinates and Google Maps URLs
            const result = await this.parseOrigenDestinoInput(messageText);

            if (result.error) {
                this.logError(`Error parsing origen-destino: ${result.error}`);
                await ctx.reply(
                    `❌ ${result.error}\n\n` +
                    '📍 *Formatos aceptados:*\n' +
                    '• Texto: "Neza - Tecamac"\n' +
                    '• Coordenadas: "19.1234,-99.5678 - 19.5678,-99.1234"\n' +
                    '• Google Maps URLs (origen y destino separados por guión)\n' +
                    '• Comparte tu ubicación usando el botón 📍',
                    { parse_mode: 'Markdown' }
                );
                return true;
            }

            const { origen, destino, coordenadas, rutaInfo } = result;

            // Guardar en FlowStateManager para uso posterior
            const flowStateManager = require('../../utils/FlowStateManager');
            const saveData = {
                origin: origen,
                destination: destino,
                origenDestino: messageText.trim(),
                coordenadas: coordenadas || null,
                rutaInfo: rutaInfo || null
            };

            // Add geocoding info if available
            if (enhancedData && enhancedData.origenGeo && enhancedData.destinoGeo) {
                saveData.geocoding = {
                    origen: enhancedData.origenGeo,
                    destino: enhancedData.destinoGeo
                };
                saveData.googleMapsUrl = enhancedData.googleMapsUrl;
                // Update origenDestino with readable names
                saveData.origenDestino = `${enhancedData.origenGeo.ubicacionCorta} - ${enhancedData.destinoGeo.ubicacionCorta}`;
            }

            flowStateManager.saveState(chatId, numeroPoliza, saveData, threadId);

            // Update policy cache with origen and destino
            if (cachedData) {
                cachedData.origen = origen;
                cachedData.destino = destino;
                cachedData.coordenadas = coordenadas;
                cachedData.rutaInfo = rutaInfo;
                this.polizaCache.set(chatId, cachedData, threadId);
                this.logInfo(`Caché de póliza actualizada con origen=${origen}, destino=${destino}`);
            }

            // Create enhanced legend with geocoding (new format)
            // First, parse coordinates if they exist in the input
            const origenCoords = this.hereMapsService.parseCoordinates(origen);
            const destinoCoords = this.hereMapsService.parseCoordinates(destino);

            let leyenda;
            let enhancedData = null;

            if (origenCoords && destinoCoords) {
                // Use new format with geocoding
                enhancedData = await this.generateEnhancedLegend(policy, origenCoords, destinoCoords, rutaInfo);
                leyenda = enhancedData.leyenda;
            } else {
                // Fallback to old format if coordinates not available
                leyenda = `🚗 Pendiente servicio "${policy.aseguradora}"\n` +
                    `🚙 Auto: ${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
                    `📞 Teléfono: ${policy.telefono}\n` +
                    `📍 Origen-Destino: ${origen} - ${destino}`;

                // Add route information if available
                if (rutaInfo) {
                    leyenda += `\n🗺️ Distancia: ${rutaInfo.distanciaKm} km`;
                    leyenda += `\n⏱️ Tiempo estimado: ${rutaInfo.tiempoMinutos} min`;
                    if (rutaInfo.aproximado) {
                        leyenda += ' (aprox.)';
                    }
                }
            }

            // Log the generated leyenda
            this.logInfo(`Leyenda generada: ${leyenda}`);

            // Store the leyenda for the send action
            const leyendaStoreResult = this.pendingLeyendas.set(chatId, leyenda, threadId);
            this.logInfo(`Leyenda almacenada: ${leyendaStoreResult ? 'OK' : 'FALLO'}`);

            // Create response message with route info
            let responseMessage = `✅ Origen-destino asignado: *${origen} - ${destino}*\n\n`;

            if (rutaInfo) {
                responseMessage += '🗺️ *Información de ruta:*\n' +
                    `📏 Distancia: ${rutaInfo.distanciaKm} km\n` +
                    `⏱️ Tiempo estimado: ${rutaInfo.tiempoMinutos} minutos`;
                if (rutaInfo.aproximado) {
                    responseMessage += ' (aproximado)';
                }
                responseMessage += `\n🔗 [Ver ruta en Google Maps](${rutaInfo.googleMapsUrl})\n\n`;
            }

            responseMessage += `📋 Aquí la leyenda del servicio:\n\`\`\`${leyenda}\`\`\`\n\n` +
                '¿Qué deseas hacer con esta leyenda?';

            // Send the message with buttons and store the message ID
            const sentMessage = await ctx.reply(
                responseMessage,
                {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('📤 Enviar', `sendLeyenda:${numeroPoliza}`),
                            Markup.button.callback('❌ Cancelar', `cancelLeyenda:${numeroPoliza}`)
                        ]
                    ])
                }
            );

            // Verificar mensaje enviado
            if (sentMessage) {
                // Store the message ID for later editing
                this.messageIds.set(chatId, sentMessage.message_id, threadId);
                this.logInfo(`ID del mensaje guardado: ${sentMessage.message_id}`);
            } else {
                this.logError('No se recibió respuesta al enviar mensaje con botones');
            }

            // Clean up the origin-destination waiting state
            this.awaitingOrigenDestino.delete(chatId, threadId);
            return true; // Indicate that we handled this message
        } catch (error) {
            this.logError(`Error procesando origen-destino para póliza ${numeroPoliza}:`, error);
            this.awaitingOrigenDestino.delete(chatId, threadId);
            await ctx.reply('❌ Error al procesar origen-destino. Operación cancelada.');
            return true;
        }
    }

    // Method to handle origin location input (Step 1/2)
    async handleOrigen(ctx, input, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingOrigen.get(chatId, threadId);

        if (!numeroPoliza) {
            this.logError('No se encontró número de póliza para origen');
            return false;
        }

        this.logInfo(`Procesando ubicación de origen para póliza ${numeroPoliza}`, {
            chatId,
            threadId: threadId || 'ninguno',
            inputType: typeof input === 'object' ? 'location' : 'text'
        });

        try {
            let coordenadas = null;

            // Check if it's a Telegram location
            if (input && input.location) {
                coordenadas = {
                    lat: input.location.latitude,
                    lng: input.location.longitude
                };
                this.logInfo('Coordenadas de origen extraídas de ubicación de Telegram', coordenadas);
            } else if (typeof input === 'string') {
                // Parse text input (coordinates or Google Maps URL)
                coordenadas = this.hereMapsService.parseCoordinates(input);
                if (!coordenadas) {
                    await ctx.reply(
                        '❌ No se pudieron extraer coordenadas válidas del origen.\n\n' +
                        '📍 *Formatos aceptados:*\n' +
                        '• Coordenadas: "19.1234,-99.5678"\n' +
                        '• URL de Google Maps\n' +
                        '• En chat privado: compartir ubicación',
                        { parse_mode: 'Markdown' }
                    );
                    return false;
                }
                this.logInfo('Coordenadas de origen extraídas de texto', coordenadas);
            } else {
                await ctx.reply('❌ Formato de entrada no válido para el origen.');
                return false;
            }

            // Save origin coordinates in FlowStateManager
            const flowStateManager = require('../../utils/FlowStateManager');
            flowStateManager.saveState(chatId, numeroPoliza, {
                origenCoords: coordenadas
            }, threadId);

            // Update policy cache
            const cachedData = this.polizaCache.get(chatId, threadId);
            if (cachedData) {
                cachedData.origenCoords = coordenadas;
                this.polizaCache.set(chatId, cachedData, threadId);
            }

            // Clear origin state and set destination state
            this.awaitingOrigen.delete(chatId, threadId);
            this.awaitingDestino.set(chatId, numeroPoliza, threadId);

            // Ask for destination
            await ctx.reply(
                `✅ Origen registrado: ${coordenadas.lat}, ${coordenadas.lng}\n\n` +
                '📍 *Paso 2/2: Envía la ubicación del DESTINO*\n\n' +
                '🔹 Opción 1: Envía coordenadas (ej: "19.1234,-99.5678")\n' +
                '🔹 Opción 2: Envía URL de Google Maps\n' +
                '🔹 Opción 3: En chat privado puedes compartir ubicación',
                { parse_mode: 'Markdown' }
            );

            return true;
        } catch (error) {
            this.logError('Error procesando origen:', error);
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
            return false;
        }
    }

    // Method to handle destination location input (Step 2/2)
    async handleDestino(ctx, input, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingDestino.get(chatId, threadId);

        if (!numeroPoliza) {
            this.logError('No se encontró número de póliza para destino');
            return false;
        }

        this.logInfo(`Procesando ubicación de destino para póliza ${numeroPoliza}`, {
            chatId,
            threadId: threadId || 'ninguno',
            inputType: typeof input === 'object' ? 'location' : 'text'
        });

        try {
            let coordenadas = null;

            // Check if it's a Telegram location
            if (input && input.location) {
                coordenadas = {
                    lat: input.location.latitude,
                    lng: input.location.longitude
                };
                this.logInfo('Coordenadas de destino extraídas de ubicación de Telegram', coordenadas);
            } else if (typeof input === 'string') {
                // Parse text input (coordinates or Google Maps URL)
                coordenadas = this.hereMapsService.parseCoordinates(input);
                if (!coordenadas) {
                    await ctx.reply(
                        '❌ No se pudieron extraer coordenadas válidas del destino.\n\n' +
                        '📍 *Formatos aceptados:*\n' +
                        '• Coordenadas: "19.1234,-99.5678"\n' +
                        '• URL de Google Maps\n' +
                        '• En chat privado: compartir ubicación',
                        { parse_mode: 'Markdown' }
                    );
                    return false;
                }
                this.logInfo('Coordenadas de destino extraídas de texto', coordenadas);
            } else {
                await ctx.reply('❌ Formato de entrada no válido para el destino.');
                return false;
            }

            // Get origin coordinates from FlowStateManager
            const flowStateManager = require('../../utils/FlowStateManager');
            const savedState = flowStateManager.getState(chatId, numeroPoliza, threadId);
            const origenCoords = savedState?.origenCoords;

            if (!origenCoords) {
                this.logError('No se encontraron coordenadas de origen guardadas');
                await ctx.reply('❌ Error: No se encontraron las coordenadas del origen. Reinicia el proceso.');
                this.awaitingDestino.delete(chatId, threadId);
                return false;
            }

            // Calculate route with HERE Maps API
            this.logInfo('Calculando ruta con HERE Maps API');
            const rutaInfo = await this.hereMapsService.calculateRoute(origenCoords, coordenadas);

            // Get policy cache and retrieve policy
            const policyCacheData = this.polizaCache.get(chatId, threadId);
            const policy = policyCacheData?.policy || await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply('❌ Error: Póliza no encontrada.');
                this.awaitingDestino.delete(chatId, threadId);
                return false;
            }

            // Generate enhanced legend with geocoding (new format)
            const enhancedData = await this.generateEnhancedLegend(policy, origenCoords, coordenadas, rutaInfo);
            const leyenda = enhancedData.leyenda;

            // Save complete data in FlowStateManager including geocoding info
            const saveData = {
                origenCoords,
                destinoCoords: coordenadas,
                coordenadas: {
                    origen: origenCoords,
                    destino: coordenadas
                },
                rutaInfo,
                origenDestino: `${origenCoords.lat},${origenCoords.lng} - ${coordenadas.lat},${coordenadas.lng}`
            };

            // Add geocoding info if available
            if (enhancedData) {
                saveData.geocoding = {
                    origen: enhancedData.origenGeo,
                    destino: enhancedData.destinoGeo
                };
                saveData.googleMapsUrl = enhancedData.googleMapsUrl;
                // Update origenDestino with readable names
                saveData.origenDestino = `${enhancedData.origenGeo.ubicacionCorta} - ${enhancedData.destinoGeo.ubicacionCorta}`;
            }

            flowStateManager.saveState(chatId, numeroPoliza, saveData, threadId);

            // Update policy cache
            if (policyCacheData) {
                policyCacheData.destinoCoords = coordenadas;
                policyCacheData.coordenadas = { origen: origenCoords, destino: coordenadas };
                policyCacheData.rutaInfo = rutaInfo;
                this.polizaCache.set(chatId, policyCacheData, threadId);
            }

            // Store the leyenda for the send action
            this.pendingLeyendas.set(chatId, leyenda, threadId);

            // Create response message with route info
            let responseMessage = `✅ Destino registrado: ${coordenadas.lat}, ${coordenadas.lng}\n\n`;

            if (rutaInfo) {
                responseMessage += '🗺️ *Información de ruta:*\n' +
                    `📏 Distancia: ${rutaInfo.distanciaKm} km\n` +
                    `⏱️ Tiempo estimado: ${rutaInfo.tiempoMinutos} minutos`;
                if (rutaInfo.aproximado) {
                    responseMessage += ' (aproximado)';
                }
                responseMessage += `\n🔗 [Ver ruta en Google Maps](${rutaInfo.googleMapsUrl})\n\n`;
            }

            responseMessage += `📋 Aquí la leyenda del servicio:\n\`\`\`${leyenda}\`\`\`\n\n` +
                '¿Qué deseas hacer con esta leyenda?';

            // Send the message with buttons and store the message ID
            const sentMessage = await ctx.reply(
                responseMessage,
                {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: {
                        remove_keyboard: true,
                        inline_keyboard: [
                            [
                                { text: '📤 Enviar', callback_data: `sendLeyenda:${numeroPoliza}` },
                                { text: '❌ Cancelar', callback_data: `cancelLeyenda:${numeroPoliza}` }
                            ]
                        ]
                    }
                }
            );

            // Store the message ID for later editing
            if (sentMessage) {
                this.messageIds.set(chatId, sentMessage.message_id, threadId);
            }

            // Clear destination state
            this.awaitingDestino.delete(chatId, threadId);
            return true;

        } catch (error) {
            this.logError('Error procesando destino:', error);
            await ctx.reply('❌ Error al procesar la ubicación del destino.');
            this.awaitingDestino.delete(chatId, threadId);
            return false;
        }
    }

    // Helper method to parse different types of origin-destination input
    async parseOrigenDestinoInput(messageText) {
        const trimmedText = messageText.trim();

        // Check if it's a traditional text-based format "Origin - Destination"
        if (trimmedText.includes(' - ')) {
            const parts = trimmedText.split(' - ').map(part => part.trim());
            if (parts.length >= 2) {
                const origen = parts[0];
                const destino = parts[1];

                // Try to parse as coordinates if they look like coordinate pairs
                const origenCoords = this.hereMapsService.parseCoordinates(origen);
                const destinoCoords = this.hereMapsService.parseCoordinates(destino);

                if (origenCoords && destinoCoords) {
                    // Both are coordinates - calculate route
                    try {
                        const rutaInfo = await this.hereMapsService.calculateRoute(origenCoords, destinoCoords);
                        return {
                            origen: `${origenCoords.lat},${origenCoords.lng}`,
                            destino: `${destinoCoords.lat},${destinoCoords.lng}`,
                            coordenadas: {
                                origen: origenCoords,
                                destino: destinoCoords
                            },
                            rutaInfo
                        };
                    } catch (error) {
                        this.logError('Error calculating route for coordinates:', error);
                        return {
                            origen,
                            destino,
                            coordenadas: {
                                origen: origenCoords,
                                destino: destinoCoords
                            },
                            rutaInfo: null
                        };
                    }
                } else {
                    // Traditional text format
                    return {
                        origen,
                        destino
                    };
                }
            }
        }

        // Check if it's a Google Maps URL or coordinates
        const coordinates = this.hereMapsService.parseCoordinates(trimmedText);
        if (coordinates) {
            return {
                error: 'Para usar coordenadas, proporciona origen y destino separados por " - ".\n' +
                       'Ejemplo: "19.1234,-99.5678 - 19.5678,-99.1234"'
            };
        }

        // If we get here, it's not a recognized format
        return {
            error: 'Formato no reconocido. Usa "Origen - Destino" o coordenadas separadas por " - ".'
        };
    }

    // Añadir este método para manejar finalización de servicio
    async handleServiceCompleted(ctx, serviceData) {
        try {
            const chatId = ctx.chat.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            // Recuperar información del servicio programado
            const cachedInfo = this.scheduledServiceInfo.get(chatId, threadId);
            if (!cachedInfo || !cachedInfo.numeroPoliza) {
                this.logError('No se encontró información del servicio para programar notificación');
                return false;
            }

            const numeroPoliza = cachedInfo.numeroPoliza;

            // Actualizar datos de scheduledServiceInfo con la información del servicio
            cachedInfo.expediente = serviceData.expediente;
            cachedInfo.origenDestino = serviceData.origenDestino;
            cachedInfo.waitingForContactTime = true; // Cambiar estado
            cachedInfo.waitingForServiceData = false;

            this.scheduledServiceInfo.set(chatId, cachedInfo, threadId);

            // Ahora pedir la hora de contacto
            await ctx.reply(
                `✅ Servicio registrado correctamente para póliza *${numeroPoliza}*.\n\n` +
                '📝 Ahora necesitamos programar la notificación de contacto.\n' +
                'Por favor, ingresa la *hora de contacto* en formato HH:mm\n' +
                '⏰ Ejemplo: 15:30 (para las 3:30 PM, hora CDMX)',
                { parse_mode: 'Markdown' }
            );

            // Establecer estado para esperar hora de contacto
            this.awaitingContactTime.set(chatId, numeroPoliza, threadId);

            return true;
        } catch (error) {
            this.logError('Error al manejar finalización de servicio:', error);
            return false;
        }
    }

    // Method to handle contact time input (called from TextMessageHandler)
    async handleContactTime(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingContactTime.get(chatId, threadId);

        this.logInfo(`Procesando hora de contacto: ${messageText} para póliza: ${numeroPoliza}`, { chatId, threadId });

        // Validate time format (HH:mm)
        const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
        if (!timeRegex.test(messageText)) {
            return await ctx.reply(
                '⚠️ Formato de hora inválido. Debe ser HH:mm (24 horas).\n' +
                'Ejemplos válidos: 09:30, 14:45, 23:15'
            );
        }

        try {

            // Get service info with verification
            const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
            if (!serviceInfo) {
                this.logError(`No se encontró info de servicio para póliza: ${numeroPoliza}`);
                this.awaitingContactTime.delete(chatId, threadId);
                return await ctx.reply('❌ Error al procesar la hora. Operación cancelada.');
            }
            // CAMBIO: asegurarse de que existe expediente; si no, usar uno genérico
            if (!serviceInfo.expediente) {
                this.logInfo('No se encontró expediente para la notificación, generando uno genérico');
                serviceInfo.expediente = `EXP-${new Date().toISOString().slice(0, 10)}`;
            }

            this.logInfo(`Info de servicio recuperada: numeroPoliza=${serviceInfo.numeroPoliza}, origen=${serviceInfo.origen}, destino=${serviceInfo.destino}`);

            // Update service info with contact time
            serviceInfo.contactTime = messageText;
            const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);
            this.logInfo(`Info de servicio actualizada con hora=${messageText}: ${serviceStore ? 'OK' : 'FALLO'}`);

            // CAMBIO: En lugar de continuar directamente, preguntar por el día

            // Preparar opciones de días
            const today = new Date();

            // Crear los botones para días
            const dayButtons = [];

            // Añadir Hoy y Mañana en la primera fila
            dayButtons.push([
                Markup.button.callback('Hoy', `selectDay:0:${numeroPoliza}`),
                Markup.button.callback('Mañana', `selectDay:1:${numeroPoliza}`)
            ]);

            // Añadir los próximos 5 días, agrupados de 2 en 2
            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

            let nextDaysRow = [];
            for (let i = 2; i <= 6; i++) {
                const futureDate = new Date(today);
                futureDate.setDate(futureDate.getDate() + i);
                const dayName = dayNames[futureDate.getDay()];
                const dateStr = `${futureDate.getDate()}/${futureDate.getMonth() + 1}`;

                nextDaysRow.push(Markup.button.callback(`${dayName} ${dateStr}`, `selectDay:${i}:${numeroPoliza}`));

                // Agrupar en filas de 2 botones
                if (nextDaysRow.length === 2 || i === 6) {
                    dayButtons.push([...nextDaysRow]);
                    nextDaysRow = [];
                }
            }

            // Añadir botón para cancelar
            dayButtons.push([
                Markup.button.callback('❌ Cancelar', `cancelSelectDay:${numeroPoliza}`)
            ]);

            // Enviar mensaje con los botones de selección de día
            await ctx.reply(
                `✅ Hora registrada: *${messageText}*\n\n` +
                '📅 ¿Para qué día programar la alerta de contacto?',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(dayButtons)
                }
            );

            // No limpiar el estado de awaitingContactTime todavía
            // Lo haremos después de que seleccionen el día
            return true;
        } catch (error) {
            this.logError(`Error al procesar hora de contacto para póliza ${numeroPoliza}:`, error);
            this.awaitingContactTime.delete(chatId, threadId);
            await ctx.reply('❌ Error al procesar la hora de contacto. Operación cancelada.');
            return true;
        }
    }
}

module.exports = OcuparPolizaCallback;
