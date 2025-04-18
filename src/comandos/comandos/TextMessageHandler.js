// src/comandos/comandos/TextMessageHandler.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber, markPolicyAsDeleted } = require('../../controllers/policyController');
const { Markup } = require('telegraf');

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

                // 2) If we're waiting for a policy number for 'accion:consultar'
                if (this.handler.awaitingGetPolicyNumber.get(chatId)) {
                    // Directly call the handler's method, which now contains the logic
                    await this.handler.handleGetPolicyFlow(ctx, messageText);
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

                // (A.0) If user is deciding whether to update the phone number (awaitingPhoneDecision)
                if (this.ocuparPolizaCallback && this.ocuparPolizaCallback.awaitingPhoneDecision && this.ocuparPolizaCallback.awaitingPhoneDecision.get(chatId)) {
                    if (typeof this.ocuparPolizaCallback.handlePhoneNumber === 'function') {
                        await this.ocuparPolizaCallback.handlePhoneNumber(ctx, messageText);
                        return;
                    }
                }
                // (A) If we're waiting for a phone number (part of 'ocuparPoliza' flow)
                if (this.handler.awaitingPhoneNumber && this.handler.awaitingPhoneNumber.get(chatId)) {
                    // Delegate entirely to OcuparPolizaCallback or a dedicated handler method
                    // Lazy load the ocuparPolizaCallback if needed (already done above)
                    if (this.ocuparPolizaCallback && typeof this.ocuparPolizaCallback.handlePhoneNumber === 'function') {
                        await this.ocuparPolizaCallback.handlePhoneNumber(ctx, messageText);
                    } else {
                        this.logWarn('OcuparPolizaCallback or handlePhoneNumber not found, cannot process phone number.');
                        // Avoid replying here, let the flow handle errors or timeouts
                    }
                    return; // Let the specific handler manage state and replies
                }

                // (B) If we're waiting for origin-destination (part of 'ocuparPoliza' flow)
                if (this.handler.awaitingOrigenDestino && this.handler.awaitingOrigenDestino.get(chatId)) {
                     // Delegate entirely to OcuparPolizaCallback or a dedicated handler method
                    if (this.ocuparPolizaCallback && typeof this.ocuparPolizaCallback.handleOrigenDestino === 'function') {
                        await this.ocuparPolizaCallback.handleOrigenDestino(ctx, messageText);
                    } else {
                        this.logWarn('OcuparPolizaCallback or handleOrigenDestino not found, cannot process origin/destination.');
                         // Avoid replying here
                    }
                    return; // Let the specific handler manage state and replies
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
                                
                                // Mostrar mensaje de error específico para esta póliza
                                let mensajeError = `❌ No se pudo eliminar la póliza ${numeroPoliza}`;
                                
                                // Extraer mensaje de error en lenguaje claro
                                if (error.name === 'ValidationError') {
                                    // Errores de validación de Mongoose
                                    const camposFaltantes = Object.keys(error.errors || {})
                                        .map(campo => `\`${campo}\``)
                                        .join(', ');
                                    
                                    if (camposFaltantes) {
                                        mensajeError += `: falta(n) el/los campo(s) obligatorio(s) ${camposFaltantes}.`;
                                    } else {
                                        mensajeError += `: error de validación.`;
                                    }
                                } else {
                                    // Otros tipos de errores
                                    mensajeError += '.';
                                }
                                
                                // Enviar mensaje de error específico para esta póliza
                                await ctx.reply(mensajeError);
                                
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
                        
                        // Add "Volver al Menú" button
                        await ctx.replyWithMarkdown(mensajeResultado, Markup.inlineKeyboard([
                            Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ]));
                        
                    } catch (error) {
                        this.logError('Error general al marcar pólizas como eliminadas:', error);
                        // Add "Volver al Menú" button even on error
                        await ctx.reply('❌ Hubo un error al marcar las pólizas como eliminadas. Intenta nuevamente.', Markup.inlineKeyboard([
                            Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ]));
                    } finally {
                        // Clean up the waiting state
                        this.handler.awaitingDeleteReason.delete(chatId); // Clean state regardless of success/error
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
