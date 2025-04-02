// src/comandos/comandos/TextMessageHandler.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber, markPolicyAsDeleted } = require('../../controllers/policyController');

class TextMessageHandler extends BaseCommand {
    constructor(handler) {
        super(handler);
        this.handler = handler;
        
        // Get the OcuparPolizaCallback instance if it exists
        this.ocuparPolizaCallback = null;
    }

    getCommandName() {
        return 'textHandler';
    }

    getDescription() {
        return 'Manejador de mensajes de texto que no son comandos';
    }

    register() {
        // Get the OcuparPolizaCallback instance if it's registered later
        this.bot.on('text', async (ctx) => {
            // Lazy load the ocuparPolizaCallback if needed
            if (!this.ocuparPolizaCallback && this.handler.registry) {
                const commands = this.handler.registry.getAllCommands();
                this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza');
            }
            try {
                const chatId = ctx.chat.id;
                const messageText = ctx.message.text.trim();

                // Ignore commands
                if (messageText.startsWith('/')) {
                    return;
                }

                // 1) If we're in /save flow
                if (this.handler.awaitingSaveData.get(chatId)) {
                    await this.handler.handleSaveData(ctx, messageText);
                    return;
                }

                // 2) If we're waiting for a policy number for /get
                if (this.handler.awaitingGetPolicyNumber.get(chatId)) {
                    const getCommand = this.handler.registry.getCommand('get');
                    if (getCommand) {
                        await getCommand.handleGetPolicyFlow(ctx, messageText);
                    } else {
                        await this.handler.handleGetPolicyFlow(ctx, messageText);
                    }
                    return;
                }

                // 3) If we're waiting for a policy number for /upload
                if (this.handler.awaitingUploadPolicyNumber.get(chatId)) {
                    await this.handler.handleUploadFlow(ctx, messageText);
                    return;
                }

                // 4) If we're waiting for a policy number for /delete
                if (this.handler.awaitingDeletePolicyNumber.get(chatId)) {
                    await this.handler.handleDeletePolicyFlow(ctx, messageText);
                    return;
                }

                // 5) If we're waiting for a policy number for /addpayment
                if (this.handler.awaitingPaymentPolicyNumber.get(chatId)) {
                    await this.handler.handleAddPaymentPolicyNumber(ctx, messageText);
                    return;
                }

                // 6) If we're waiting for payment data (amount/date) for /addpayment
                if (this.handler.awaitingPaymentData.get(chatId)) {
                    await this.handler.handlePaymentData(ctx, messageText);
                    return;
                }

                // 7) Waiting for a policy number for /addservice
                if (this.handler.awaitingServicePolicyNumber.get(chatId)) {
                    await this.handler.handleAddServicePolicyNumber(ctx, messageText);
                    return;
                }

                // 8) Waiting for service data (cost, date, file number)
                if (this.handler.awaitingServiceData.get(chatId)) {
                    await this.handler.handleServiceData(ctx, messageText);
                    return;
                }

                // (A) If we're waiting for a phone number (after pressing "Ocupar Póliza" button)
                if (this.handler.awaitingPhoneNumber && this.handler.awaitingPhoneNumber.get(chatId)) {
                    // Use the OcuparPolizaCallback handler if available
                    if (this.ocuparPolizaCallback) {
                        const handled = await this.ocuparPolizaCallback.handlePhoneNumber(ctx, messageText);
                        if (handled) return;
                    } else {
                        const numeroPoliza = this.handler.awaitingPhoneNumber.get(chatId);

                        // Validate that it's 10 digits
                        const regexTel = /^\d{10}$/;
                        if (!regexTel.test(messageText)) {
                            // Invalid phone => cancel
                            this.handler.awaitingPhoneNumber.delete(chatId);
                            return await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelado.');
                        }

                        // If valid, save to the policy
                        const policy = await getPolicyByNumber(numeroPoliza);
                        if (!policy) {
                            this.handler.awaitingPhoneNumber.delete(chatId);
                            return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada. Cancelado.`);
                        }

                        // Save to policy.telefono
                        policy.telefono = messageText;
                        await policy.save();
                        await ctx.reply(
                            `✅ Teléfono asignado a la póliza ${numeroPoliza}.\n\n` +
                            `🚗 Ahora ingresa *origen y destino* (ej: "Neza - Tecamac") en una sola línea.`,
                            { parse_mode: 'Markdown' }
                        );

                        // Move to "awaitingOrigenDestino"
                        this.handler.awaitingPhoneNumber.delete(chatId);
                        this.handler.awaitingOrigenDestino.set(chatId, numeroPoliza);
                        return;
                    }
                }

                // (B) If we're waiting for origin-destination
                if (this.handler.awaitingOrigenDestino && this.handler.awaitingOrigenDestino.get(chatId)) {
                    // Use the OcuparPolizaCallback handler if available
                    if (this.ocuparPolizaCallback) {
                        const handled = await this.ocuparPolizaCallback.handleOrigenDestino(ctx, messageText);
                        if (handled) return;
                    } else {
                        const numeroPoliza = this.handler.awaitingOrigenDestino.get(chatId);
                        const policy = await getPolicyByNumber(numeroPoliza);
                        if (!policy) {
                            this.handler.awaitingOrigenDestino.delete(chatId);
                            return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada. Cancelado.`);
                        }

                        // Create the legend
                        const leyenda = `🚗 Pendiente servicio "${policy.aseguradora}"\n` +
                        `🚙 Auto: ${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
                        `📍 Origen-Destino: ${messageText}`;
                    
                        await ctx.reply(
                        `✅ Origen-destino asignado: *${messageText}*\n\n` +
                        `📋 Aquí la leyenda para copiar:\n\`\`\`${leyenda}\`\`\``,
                        { parse_mode: 'Markdown' }
                        );

                        this.handler.awaitingOrigenDestino.delete(chatId);
                        return;
                    }
                }

                // Handle delete reason
                if (this.handler.awaitingDeleteReason && this.handler.awaitingDeleteReason.get(chatId)) {
                    const numeroPolizas = this.handler.awaitingDeleteReason.get(chatId);
                    const motivo = messageText.trim() === 'ninguno' ? '' : messageText.trim();
                    
                    try {
                        let eliminadas = 0;
                        let noEncontradas = 0;
                        let errores = 0;
                        let listadoNoEncontradas = [];
                        
                        // Show initial message
                        const msgInicial = await ctx.reply(
                            `🔄 Procesando ${numeroPolizas.length} póliza(s)...`
                        );
                        
                        // Process each policy in the list
                        for (const numeroPoliza of numeroPolizas) {
                            try {
                                // Use markPolicyAsDeleted for each policy
                                const deletedPolicy = await markPolicyAsDeleted(numeroPoliza, motivo);
                                
                                if (!deletedPolicy) {
                                    noEncontradas++;
                                    listadoNoEncontradas.push(numeroPoliza);
                                } else {
                                    eliminadas++;
                                }
                                
                                // If there are many policies, update the message every 5 processed
                                if (numeroPolizas.length > 10 && eliminadas % 5 === 0) {
                                    await ctx.telegram.editMessageText(
                                        msgInicial.chat.id,
                                        msgInicial.message_id,
                                        undefined,
                                        `🔄 Procesando ${numeroPolizas.length} póliza(s)...\n` +
                                        `✅ Procesadas: ${eliminadas + noEncontradas + errores}/${numeroPolizas.length}\n` +
                                        `⏱️ Por favor espere...`
                                    );
                                }
                            } catch (error) {
                                this.logError(`Error al marcar póliza ${numeroPoliza} como eliminada:`, error);
                                errores++;
                            }
                        }
                        
                        // Edit the initial message to show the final result
                        await ctx.telegram.editMessageText(
                            msgInicial.chat.id,
                            msgInicial.message_id,
                            undefined,
                            `✅ Proceso completado`
                        );
                        
                        // Build the results message
                        let mensajeResultado = `📊 *Resultados del proceso:*\n` +
                            `✅ Pólizas eliminadas correctamente: ${eliminadas}\n`;
                        
                        if (noEncontradas > 0) {
                            mensajeResultado += `⚠️ Pólizas no encontradas o ya eliminadas: ${noEncontradas}\n`;
                            
                            // If there are few not found, list them
                            if (noEncontradas <= 10) {
                                mensajeResultado += `📋 No encontradas:\n${listadoNoEncontradas.map(p => `- ${p}`).join('\n')}\n`;
                            }
                        }
                        
                        if (errores > 0) {
                            mensajeResultado += `❌ Errores al procesar: ${errores}\n`;
                        }
                        
                        await ctx.replyWithMarkdown(mensajeResultado);
                        
                    } catch (error) {
                        this.logError('Error general al marcar pólizas como eliminadas:', error);
                        await ctx.reply('❌ Hubo un error al marcar las pólizas como eliminadas. Intenta nuevamente.');
                    } finally {
                        // Clean up the waiting state
                        this.handler.awaitingDeleteReason.delete(chatId);
                    }
                    return;
                }
        
                // If it gets here and isn't in any of the previous flows, ignore or respond generically
            } catch (error) {
                this.logError('Error general al procesar mensaje de texto:', error);
                await ctx.reply('❌ Error al procesar el mensaje. Intenta nuevamente.');
            }
        });
    }
}

module.exports = TextMessageHandler;
