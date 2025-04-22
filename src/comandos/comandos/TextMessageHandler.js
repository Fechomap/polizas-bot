// src/comandos/comandos/TextMessageHandler.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber, markPolicyAsDeleted } = require('../../controllers/policyController');
const { Markup } = require('telegraf');
const StateKeyManager = require('../../utils/StateKeyManager');

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
                const threadId = ctx.message?.message_thread_id || null;
                const messageText = ctx.message.text.trim();

                // Log para depuración
                this.logInfo(`Procesando mensaje de texto: "${messageText}"`, { 
                    chatId, 
                    threadId: threadId || 'ninguno' 
                });

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
                // Verificación explícita con logs
                this.logInfo(`Verificando si se espera número de póliza en chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                const esperaPoliza = this.handler.awaitingGetPolicyNumber.has(chatId, threadId);
                this.logInfo(`Resultado de verificación: ${esperaPoliza ? 'SÍ se espera' : 'NO se espera'}`);

                if (esperaPoliza) {
                    this.logInfo(`Procesando número de póliza: ${messageText}`, { chatId, threadId: threadId || 'ninguno' });
                    try {
                        // Agregar captura de errores para depuración
                        await this.handler.handleGetPolicyFlow(ctx, messageText);
                    } catch (error) {
                        this.logError(`Error en handleGetPolicyFlow: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar el número de póliza. Por favor intenta nuevamente.');
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

                // (A) If we're waiting for a phone number (part of 'ocuparPoliza' flow)
                // Verificación detallada con logs para awaitingPhoneNumber
                this.logInfo(`Verificando si se espera teléfono en chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                let esperaTelefono = false;

                // Verificar existencia del mapa
                if (!this.handler.awaitingPhoneNumber) {
                    this.logWarn('El mapa awaitingPhoneNumber no existe en el handler');
                } else {
                    // Verificar método has
                    if (typeof this.handler.awaitingPhoneNumber.has === 'function') {
                        esperaTelefono = this.handler.awaitingPhoneNumber.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingPhoneNumber.has: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}`);
                    } else {
                        this.logWarn('El método has no está disponible en awaitingPhoneNumber');
                        
                        // Verificar método get como alternativa
                        if (typeof this.handler.awaitingPhoneNumber.get === 'function') {
                            const valor = this.handler.awaitingPhoneNumber.get(chatId, threadId);
                            esperaTelefono = !!valor;
                            this.logInfo(`Verificación alternativa usando get: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`);
                        } else {
                            this.logError('Ni has ni get están disponibles en awaitingPhoneNumber');
                        }
                    }
                }

                if (esperaTelefono) {
                    this.logInfo(`Procesando número telefónico: ${messageText}`, { chatId, threadId: threadId || 'ninguno' });
                    try {
                        // Verificar existe el callback y el método
                        if (!this.ocuparPolizaCallback) {
                            this.logWarn('Intentando cargar ocuparPolizaCallback dinámicamente');
                            const commands = this.handler.registry.getAllCommands();
                            this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza');
                        }
                        
                        if (this.ocuparPolizaCallback && typeof this.ocuparPolizaCallback.handlePhoneNumber === 'function') {
                            this.logInfo('Delegando manejo de número telefónico a OcuparPolizaCallback', { chatId, threadId });
                            await this.ocuparPolizaCallback.handlePhoneNumber(ctx, messageText, threadId);
                        } else {
                            this.logError('No se puede procesar el teléfono: OcuparPolizaCallback o handlePhoneNumber no encontrados');
                            await ctx.reply('❌ Error al procesar el número telefónico. Por favor, intenta desde el menú principal.');
                        }
                    } catch (error) {
                        this.logError(`Error al procesar número telefónico: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar el número telefónico. Por favor, intenta nuevamente.');
                    }
                    return; // Let the specific handler manage state and replies
                }

                // (B) If we're waiting for origin-destination (part of 'ocuparPoliza' flow)
                // Verificación detallada con logs para awaitingOrigenDestino
                this.logInfo(`Verificando si se espera origen-destino en chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                let esperaOrigenDestino = false;

                // Verificar existencia del mapa
                if (!this.handler.awaitingOrigenDestino) {
                    this.logWarn('El mapa awaitingOrigenDestino no existe en el handler');
                } else {
                    // Verificar método has
                    if (typeof this.handler.awaitingOrigenDestino.has === 'function') {
                        esperaOrigenDestino = this.handler.awaitingOrigenDestino.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingOrigenDestino.has: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}`);
                    } else {
                        this.logWarn('El método has no está disponible en awaitingOrigenDestino');
                        
                        // Verificar método get como alternativa
                        if (typeof this.handler.awaitingOrigenDestino.get === 'function') {
                            const valor = this.handler.awaitingOrigenDestino.get(chatId, threadId);
                            esperaOrigenDestino = !!valor;
                            this.logInfo(`Verificación alternativa usando get: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`);
                        } else {
                            this.logError('Ni has ni get están disponibles en awaitingOrigenDestino');
                        }
                    }
                }

                if (esperaOrigenDestino) {
                    this.logInfo(`Procesando origen-destino: ${messageText}`, { chatId, threadId: threadId || 'ninguno' });
                    try {
                        // Verificar existe el callback y el método
                        if (!this.ocuparPolizaCallback) {
                            this.logWarn('Intentando cargar ocuparPolizaCallback dinámicamente');
                            const commands = this.handler.registry.getAllCommands();
                            this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza');
                        }
                        
                        if (this.ocuparPolizaCallback && typeof this.ocuparPolizaCallback.handleOrigenDestino === 'function') {
                            this.logInfo('Delegando manejo de origen-destino a OcuparPolizaCallback', { chatId, threadId });
                            await this.ocuparPolizaCallback.handleOrigenDestino(ctx, messageText, threadId);
                        } else {
                            this.logError('No se puede procesar origen-destino: OcuparPolizaCallback o handleOrigenDestino no encontrados');
                            await ctx.reply('❌ Error al procesar origen-destino. Por favor, intenta desde el menú principal.');
                        }
                    } catch (error) {
                        this.logError(`Error al procesar origen-destino: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar origen-destino. Por favor, intenta nuevamente.');
                    }
                    return; // Let the specific handler manage state and replies
                }

                // (C) If we're waiting for contact time (part of 'ocuparPoliza' flow after service assignment)
                this.logInfo(`Verificando si se espera hora de contacto en chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                let esperaHoraContacto = false;
                
                if (this.ocuparPolizaCallback && this.ocuparPolizaCallback.awaitingContactTime) {
                    if (typeof this.ocuparPolizaCallback.awaitingContactTime.has === 'function') {
                        esperaHoraContacto = this.ocuparPolizaCallback.awaitingContactTime.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingContactTime.has: ${esperaHoraContacto ? 'SÍ se espera' : 'NO se espera'}`);
                    } else if (typeof this.ocuparPolizaCallback.awaitingContactTime.get === 'function') {
                        const valor = this.ocuparPolizaCallback.awaitingContactTime.get(chatId, threadId);
                        esperaHoraContacto = !!valor;
                        this.logInfo(`Verificación alternativa usando get: ${esperaHoraContacto ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`);
                    }
                }
                
                if (esperaHoraContacto) {
                    this.logInfo('Delegando manejo de hora de contacto a OcuparPolizaCallback', { chatId, threadId, hora: messageText });
                    if (typeof this.ocuparPolizaCallback.handleContactTime === 'function') {
                        await this.ocuparPolizaCallback.handleContactTime(ctx, messageText, threadId);
                    } else {
                        this.logWarn('OcuparPolizaCallback or handleContactTime not found, cannot process contact time.');
                        await ctx.reply('❌ Error: No se puede procesar la hora de contacto. Por favor, inténtalo de nuevo desde el menú principal.');
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
