// src/comandos/comandos/OcuparPolizaCallback.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber } = require('../../controllers/policyController');
const { Markup } = require('telegraf');

class OcuparPolizaCallback extends BaseCommand {
    constructor(handler) {
        super(handler);
        this.awaitingPhoneNumber = handler.awaitingPhoneNumber;
        this.awaitingOrigenDestino = handler.awaitingOrigenDestino;
        
        // Nuevos mapas para el flujo mejorado
        this.pendingLeyendas = new Map();
        this.polizaCache = new Map(); // Para guardar la póliza en proceso
        this.messageIds = new Map(); // Para guardar los IDs de mensajes con botones
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
                const targetGroupId = -1002212807945; // ID fijo del grupo actualizado
                
                try {
                    await ctx.telegram.sendMessage(targetGroupId, leyenda);
                    
                    // Get the message ID to edit
                    const messageId = this.messageIds.get(chatId);
                    if (messageId) {
                        // Edit the original message to disable buttons
                        await ctx.telegram.editMessageText(
                            chatId,
                            messageId,
                            undefined,
                            `✅ Origen-destino asignado.\n\n` +
                            `📋 Leyenda del servicio:\n\`\`\`${leyenda}\`\`\`\n\n` +
                            `✅ Leyenda enviada exitosamente al grupo de servicios.`,
                            { 
                                parse_mode: 'Markdown'
                                // Sin botones
                            }
                        );
                    } else {
                        // Fallback if message ID not found
                        await ctx.reply('✅ Leyenda enviada exitosamente al grupo de servicios.');
                    }
                } catch (sendError) {
                    this.logError('Error al enviar leyenda al grupo o editar mensaje:', sendError);
                    await ctx.reply('❌ No se pudo enviar la leyenda al grupo. Verifica que el bot esté en el grupo.');
                }
                
                // Clean up all states
                this.pendingLeyendas.delete(chatId);
                this.polizaCache.delete(chatId);
                this.messageIds.delete(chatId);
            } catch (error) {
                this.logError('Error en callback sendLeyenda:', error);
                await ctx.reply('❌ Error al enviar la leyenda.');
            } finally {
                await ctx.answerCbQuery();
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
                this.pendingLeyendas.delete(chatId);
                this.polizaCache.delete(chatId);
                this.messageIds.delete(chatId);
            } catch (error) {
                this.logError('Error en callback cancelLeyenda:', error);
                await ctx.reply('❌ Error al cancelar la operación.');
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    // Method to handle phone number input (called from TextMessageHandler)
    async handlePhoneNumber(ctx, messageText) {
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
    async handleOrigenDestino(ctx, messageText) {
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
}

module.exports = OcuparPolizaCallback;