// src/comandos/comandos/OcuparPolizaCallback.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber } = require('../../controllers/policyController');
const { Markup } = require('telegraf');
const flowStateManager = require('../../utils/FlowStateManager');

class OcuparPolizaCallback extends BaseCommand {
    constructor(handler) {
        super(handler);
        this.awaitingPhoneNumber = handler.awaitingPhoneNumber;
        this.awaitingOrigenDestino = handler.awaitingOrigenDestino;
        
        // Nuevos mapas para el flujo mejorado
        this.pendingLeyendas = new Map();
        this.polizaCache = new Map(); // Para guardar la póliza en proceso
        this.messageIds = new Map(); // Para guardar los IDs de mensajes con botones
        
        // Nuevos mapas para asignación de servicio
        this.awaitingContactTime = new Map(); // Para esperar la hora de contacto
        this.scheduledServiceInfo = new Map(); // Para guardar info del servicio a programar
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
                
                // Get the policy to check if phone number exists
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
                
                // Cache the current policy for later use
                this.polizaCache.set(chatId, {
                    numeroPoliza,
                    policy
                });
                
                // Check if phone number already exists
                if (policy.telefono) {
                    // Show options to continue with existing number or change it
                    await ctx.reply(
                        `📱 Esta póliza ya cuenta con un número telefónico registrado en el sistema: ${policy.telefono}\n` +
                        `Si deseas cambiar el número telefónico, por favor ingrésalo a continuación.\n` +
                        `De lo contrario, presiona OK para continuar.`,
                        Markup.inlineKeyboard([
                            Markup.button.callback('✅ OK (Mantener número)', `keepPhone:${numeroPoliza}`)
                        ])
                    );
                    
                    // Set state to awaiting phone number (even if already exists)
                    // This allows direct typing of a new number
                    this.awaitingPhoneNumber.set(chatId, numeroPoliza);
                } else {
                    // No phone number exists, request it
                    this.awaitingPhoneNumber.set(chatId, numeroPoliza);
                    await ctx.reply(
                        `📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                        `⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.`,
                        { parse_mode: 'Markdown' }
                    );
                }
                
                this.logInfo(`Esperando teléfono para póliza ${numeroPoliza}`, { chatId: ctx.chat.id });
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
                
                // Get the policy to get the phone number
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
                
                // Clean up the phone number waiting state
                this.awaitingPhoneNumber.delete(chatId);
                
                // Ask for origin-destination directly
                this.awaitingOrigenDestino.set(chatId, numeroPoliza);
                
                await ctx.reply(
                    `✅ Se mantendrá el número: ${policy.telefono}\n\n` +
                    `🚗 Ahora ingresa *origen y destino* (ej: "Neza - Tecamac") en una sola línea.`,
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
                
                // Get the leyenda from the map
                const leyenda = this.pendingLeyendas.get(chatId);
                if (!leyenda) {
                    return await ctx.reply('❌ No se encontró la leyenda para enviar. Inténtalo nuevamente.');
                }
                
                // Send the leyenda to the predefined group
                const targetGroupId = -1002212807945; // ID fijo del grupo
                
                try {
                    await ctx.telegram.sendMessage(targetGroupId, leyenda);
                    this.logInfo(`Leyenda enviada al grupo: ${targetGroupId}`, { numeroPoliza });
                    
                    // Get the message ID to edit
                    const messageId = this.messageIds.get(chatId);
                    if (messageId) {
                        // Edit the original message to show new buttons
                        await ctx.telegram.editMessageText(
                            chatId,
                            messageId,
                            undefined,
                            `✅ Origen-destino asignado.\n\n` +
                            `📋 Leyenda del servicio:\n\`\`\`${leyenda}\`\`\`\n\n` +
                            `✅ Leyenda enviada al grupo de servicios.\n\n` +
                            `¿El servicio fue asignado?`,
                            { 
                                parse_mode: 'Markdown',
                                ...Markup.inlineKeyboard([
                                    [
                                        Markup.button.callback('✅ Asignado', `assignedService:${numeroPoliza}`),
                                        Markup.button.callback('❌ No asignado', `unassignedService:${numeroPoliza}`)
                                    ]
                                ])
                            }
                        );
                    } else {
                        // Fallback if message ID not found
                        await ctx.reply(
                            '✅ Leyenda enviada exitosamente al grupo de servicios.\n\n' +
                            '¿El servicio fue asignado?',
                            Markup.inlineKeyboard([
                                [
                                    Markup.button.callback('✅ Asignado', `assignedService:${numeroPoliza}`),
                                    Markup.button.callback('❌ No asignado', `unassignedService:${numeroPoliza}`)
                                ]
                            ])
                        );
                    }
                } catch (sendError) {
                    this.logError('Error al enviar leyenda al grupo o editar mensaje:', sendError);
                    await ctx.reply('❌ No se pudo enviar la leyenda al grupo. Verifica que el bot esté en el grupo.');
                    // Clean up states on error
                    this.pendingLeyendas.delete(chatId);
                    return;
                }
                
                // Don't clean up everything yet, as we need to continue the flow
                // Just clean up the leyenda as we don't need it anymore
                this.pendingLeyendas.delete(chatId);
            } catch (error) {
                this.logError('Error en callback sendLeyenda:', error);
                await ctx.reply('❌ Error al enviar la leyenda.');
                // Clean up on error
                this.cleanupAllStates(ctx.chat.id);
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for "Asignado" button
        this.handler.registry.registerCallback(/assignedService:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                
                this.logInfo(`Servicio marcado como asignado para póliza: ${numeroPoliza}`, { chatId });
                
                // First get the cached policy or fetch it again
                let policy;
                const cachedData = this.polizaCache.get(chatId);
                
                if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                    policy = cachedData.policy;
                } else {
                    policy = await getPolicyByNumber(numeroPoliza);
                    if (!policy) {
                        return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                    }
                }
                
                // Store the service info for later use
                this.scheduledServiceInfo.set(chatId, {
                    numeroPoliza,
                    policy,
                    origen: cachedData?.origen || '',  // Get the origen if available
                    destino: cachedData?.destino || '' // Get the destino if available
                });
                
                // Set state to awaiting contact time
                this.awaitingContactTime.set(chatId, numeroPoliza);
                
                // Get the message ID to edit
                const messageId = this.messageIds.get(chatId);
                if (messageId) {
                    // Edit the original message
                    await ctx.telegram.editMessageText(
                        chatId,
                        messageId,
                        undefined,
                        `✅ Servicio marcado como asignado.\n\n` +
                        `📝 Por favor, ingresa la *hora de contacto* en formato HH:mm\n` +
                        `⏰ Ejemplo: 15:30 (para las 3:30 PM, hora CDMX)`,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    // Fallback
                    await ctx.reply(
                        `✅ Servicio marcado como asignado.\n\n` +
                        `📝 Por favor, ingresa la *hora de contacto* en formato HH:mm\n` +
                        `⏰ Ejemplo: 15:30 (para las 3:30 PM, hora CDMX)`,
                        { parse_mode: 'Markdown' }
                    );
                }
            } catch (error) {
                this.logError('Error en callback assignedService:', error);
                await ctx.reply('❌ Error al procesar la asignación del servicio.');
                this.cleanupAllStates(ctx.chat.id);
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for "No asignado" button
        this.handler.registry.registerCallback(/unassignedService:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                
                // Get the message ID to edit
                const messageId = this.messageIds.get(chatId);
                if (messageId) {
                    // Edit the original message
                    await ctx.telegram.editMessageText(
                        chatId,
                        messageId,
                        undefined,
                        `🚫 Servicio marcado como no asignado. Flujo finalizado.`,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    // Fallback
                    await ctx.reply('🚫 Servicio marcado como no asignado. Flujo finalizado.');
                }
                
                // Clean up all states
                this.cleanupAllStates(chatId);
            } catch (error) {
                this.logError('Error en callback unassignedService:', error);
                await ctx.reply('❌ Error al procesar la acción.');
                this.cleanupAllStates(ctx.chat.id);
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for "Añadir servicio" 
        this.handler.registry.registerCallback(/addServiceFromTime:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                
                this.logInfo(`Iniciando flujo de añadir servicio para póliza: ${numeroPoliza}`, { chatId });
                
                // Activar el estado para el flujo de añadir servicio
                this.cleanupAllStates(chatId);
                
                // Ejecutar el flujo estándar de 'accion:addservice'
                await ctx.answerCbQuery();
                
                // Iniciar el flujo de añadir servicio usando el handler existente
                if (this.handler && typeof this.handler.handleAddServiceStart === 'function') {
                    // Si existe un método específico, usarlo
                    await this.handler.handleAddServiceStart(ctx, numeroPoliza);
                } else {
                    // Si no, simular accion:addservice
                    this.handler.awaitingServicePolicyNumber.set(chatId, true);
                    await ctx.reply('🚗 Introduce el número de póliza para añadir el servicio:');
                }
            } catch (error) {
                this.logError('Error al iniciar flujo addService:', error);
                await ctx.reply('❌ Error al iniciar el proceso de añadir servicio.');
                this.cleanupAllStates(ctx.chat.id);
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
        this.handler.registry.registerCallback(/selectDay:(\d+):(.+)/, async (ctx) => {
            try {
                const daysOffset = parseInt(ctx.match[1], 10);
                const numeroPoliza = ctx.match[2];
                const chatId = ctx.chat.id;
                const threadId = ctx.callbackQuery?.message?.message_thread_id || null;
                
                await ctx.answerCbQuery();
                
                // Obtener información del servicio
                const serviceInfo = this.scheduledServiceInfo.get(chatId);
                if (!serviceInfo || !serviceInfo.contactTime) {
                    return await ctx.reply('❌ Error: No se encontró la información de la hora de contacto.');
                }
                
                // Calcular la fecha programada completa
                const today = new Date();
                const scheduledDate = new Date(today);
                scheduledDate.setDate(scheduledDate.getDate() + daysOffset);
                
                // Asignar la hora al día seleccionado
                const [hours, minutes] = serviceInfo.contactTime.split(':').map(Number);
                scheduledDate.setHours(hours, minutes, 0, 0);
                
                // Actualizar el serviceInfo con la fecha completa
                serviceInfo.scheduledDate = scheduledDate;
                this.scheduledServiceInfo.set(chatId, serviceInfo);
                
                // Guardar en FlowStateManager para uso posterior
                flowStateManager.saveState(chatId, numeroPoliza, {
                    time: serviceInfo.contactTime,
                    date: scheduledDate.toISOString(),
                    origin: serviceInfo.origen,
                    destination: serviceInfo.destino
                }, threadId);
                
                // Formatear la fecha para mostrar
                const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                const dayName = dayNames[scheduledDate.getDay()];
                const dateStr = `${scheduledDate.getDate()}/${scheduledDate.getMonth() + 1}/${scheduledDate.getFullYear()}`;
                
                // Mostrar confirmación y botón para continuar
                await ctx.editMessageText(
                    `✅ Alerta programada para: *${dayName}, ${dateStr} a las ${serviceInfo.contactTime}*\n\n` +
                    `Para guardar el servicio en la base de datos y programar la notificación automática, presiona el botón:`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('➕ Añadir servicio', `accion:addservice`)]
                        ])
                    }
                );
                
                // No limpiar estado de espera de hora de contacto aquí
                // Lo haremos después de que se añada el servicio
                
            } catch (error) {
                this.logError(`Error al procesar selección de día:`, error);
                await ctx.reply('❌ Error al procesar la selección de día. Operación cancelada.');
                this.cleanupAllStates(ctx.chat.id);
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
                this.logError(`Error al cancelar selección de día:`, error);
                await ctx.reply('❌ Error al cancelar. Intente nuevamente.');
            }
        });
    }

    // Helper method to clean up all states
    cleanupAllStates(chatId, threadId = null) {
        this.pendingLeyendas.delete(chatId);
        this.polizaCache.delete(chatId);
        this.messageIds.delete(chatId);
        this.awaitingPhoneNumber.delete(chatId);
        this.awaitingOrigenDestino.delete(chatId);
        this.awaitingContactTime.delete(chatId);
        this.scheduledServiceInfo.delete(chatId);
        
        // También limpiar cualquier estado en el FlowStateManager
        flowStateManager.clearAllStates(chatId, threadId);
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
                        `🕒 **Servicio en contacto**\n` +
                        `📄 Expediente: ${expedienteNum}\n` +
                        `🗓 Hora de contacto: ${contactTime}\n` +
                        `✅ Favor de dar seguimiento en este chat.`;
                    
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
        const numeroPoliza = this.awaitingPhoneNumber.get(chatId);

        // Validate that it's 10 digits
        const regexTel = /^\d{10}$/;
        if (!regexTel.test(messageText)) {
            // Invalid phone => cancel
            this.awaitingPhoneNumber.delete(chatId);
            return await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelado.');
        }

        try {
            // Get policy from cache or directly from DB
            let policy;
            const cachedData = this.polizaCache.get(chatId);
            
            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
            } else {
                policy = await getPolicyByNumber(numeroPoliza);
            }
            
            if (!policy) {
                this.logError(`Póliza no encontrada en handlePhoneNumber: ${numeroPoliza}`);
                this.awaitingPhoneNumber.delete(chatId);
                return await ctx.reply(`❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`);
            }

            // Save to policy.telefono
            policy.telefono = messageText;
            await policy.save();
            
            // Update cache if exists
            if (cachedData) {
                cachedData.policy = policy;
                this.polizaCache.set(chatId, cachedData);
            }
            
            await ctx.reply(
                `✅ Teléfono ${messageText} asignado a la póliza ${numeroPoliza}.\n\n` +
                `🚗 Ahora ingresa *origen y destino* (ej: "Neza - Tecamac") en una sola línea.`,
                { parse_mode: 'Markdown' }
            );

            // Move to "awaitingOrigenDestino"
            this.awaitingPhoneNumber.delete(chatId);
            this.awaitingOrigenDestino.set(chatId, numeroPoliza);
            return true; // Indicate that we handled this message
        } catch (error) {
            this.logError(`Error guardando teléfono para póliza ${numeroPoliza}:`, error);
            this.awaitingPhoneNumber.delete(chatId);
            await ctx.reply('❌ Error al guardar el teléfono. Operación cancelada.');
            return true;
        }
    }

    // Method to handle origin-destination input (called from TextMessageHandler)
    async handleOrigenDestino(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingOrigenDestino.get(chatId);
        
        try {
            // Get policy from cache or directly from DB
            let policy;
            const cachedData = this.polizaCache.get(chatId);
            
            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
            } else {
                policy = await getPolicyByNumber(numeroPoliza);
            }
            
            if (!policy) {
                this.logError(`Póliza no encontrada en handleOrigenDestino: ${numeroPoliza}`);
                this.awaitingOrigenDestino.delete(chatId);
                return await ctx.reply(`❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`);
            }

            // Parse origen and destino from input
            const parts = messageText.split('-').map(part => part.trim());
            let origen = '', destino = '';
            
            if (parts.length >= 2) {
                origen = parts[0];
                destino = parts[1];
            } else {
                origen = 'No especificado';
                destino = messageText;
            }
            
            // Update policy cache with origen and destino
            if (cachedData) {
                cachedData.origen = origen;
                cachedData.destino = destino;
                this.polizaCache.set(chatId, cachedData);
            }

            // Create the legend
            const leyenda = `🚗 Pendiente servicio "${policy.aseguradora}"\n` +
            `🚙 Auto: ${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
            `📞 Teléfono: ${policy.telefono}\n` +
            `📍 Origen-Destino: ${messageText}`;

            // Store the leyenda for the send action
            this.pendingLeyendas.set(chatId, leyenda);

            // Send the message with buttons and store the message ID
            const sentMessage = await ctx.reply(
                `✅ Origen-destino asignado: *${messageText}*\n\n` +
                `📋 Aquí la leyenda del servicio:\n\`\`\`${leyenda}\`\`\`\n\n` +
                `¿Qué deseas hacer con esta leyenda?`,
                { 
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('📤 Enviar', `sendLeyenda:${numeroPoliza}`),
                            Markup.button.callback('❌ Cancelar', `cancelLeyenda:${numeroPoliza}`)
                        ]
                    ])
                }
            );
            
            // Store the message ID for later editing
            this.messageIds.set(chatId, sentMessage.message_id);

            this.awaitingOrigenDestino.delete(chatId);
            return true; // Indicate that we handled this message
        } catch (error) {
            this.logError(`Error procesando origen-destino para póliza ${numeroPoliza}:`, error);
            this.awaitingOrigenDestino.delete(chatId);
            await ctx.reply('❌ Error al procesar origen-destino. Operación cancelada.');
            return true;
        }
    }

    // Method to handle contact time input (called from TextMessageHandler)
    async handleContactTime(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingContactTime.get(chatId);
        
        this.logInfo(`Procesando hora de contacto: ${messageText} para póliza: ${numeroPoliza}`, { chatId, threadId });
        
        try {
            // Validate time format (HH:mm)
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            if (!timeRegex.test(messageText)) {
                return await ctx.reply(
                    '⚠️ Formato de hora inválido. Debe ser HH:mm (24 horas).\n' +
                    'Ejemplos válidos: 09:30, 14:45, 23:15'
                );
            }
            
            // Get service info
            const serviceInfo = this.scheduledServiceInfo.get(chatId);
            if (!serviceInfo) {
                this.logError(`No se encontró info de servicio para póliza: ${numeroPoliza}`);
                this.awaitingContactTime.delete(chatId);
                return await ctx.reply('❌ Error al procesar la hora. Operación cancelada.');
            }
            
            // Update service info with contact time
            serviceInfo.contactTime = messageText;
            this.scheduledServiceInfo.set(chatId, serviceInfo);
            
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
                `📅 ¿Para qué día programar la alerta de contacto?`,
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
            this.awaitingContactTime.delete(chatId);
            await ctx.reply('❌ Error al procesar la hora de contacto. Operación cancelada.');
            return true;
        }
    }
}

module.exports = OcuparPolizaCallback;