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
                    this.logInfo('[TextMsgHandler] Ignorando comando.');
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingSaveData`);
                // 1) If we're in /save flow
                if (this.handler.awaitingSaveData.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingSaveData activo. Llamando a handleSaveData.'); // Log añadido
                    await this.handler.handleSaveData(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingGetPolicyNumber`);
                // 2) If we're waiting for a policy number for 'accion:consultar'
                // Verificación explícita con logs
                // this.logInfo(`Verificando si se espera número de póliza en chatId=${chatId}, threadId=${threadId || 'ninguno'}`); // Log redundante
                const esperaPoliza = this.handler.awaitingGetPolicyNumber.has(chatId, threadId);
                // this.logInfo(`Resultado de verificación: ${esperaPoliza ? 'SÍ se espera' : 'NO se espera'}`); // Log redundante

                if (esperaPoliza) {
                    this.logInfo('[TextMsgHandler] Estado awaitingGetPolicyNumber activo. Llamando a handleGetPolicyFlow.'); // Log añadido
                    // this.logInfo(`Procesando número de póliza: ${messageText}`, { chatId, threadId: threadId || 'ninguno' }); // Log redundante
                    try {
                        // Agregar captura de errores para depuración
                        await this.handler.handleGetPolicyFlow(ctx, messageText);
                    } catch (error) {
                        this.logError(`Error en handleGetPolicyFlow: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar el número de póliza. Por favor intenta nuevamente.');
                    }
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingUploadPolicyNumber`);
                // 3) If we're waiting for a policy number for /upload
                if (this.handler.awaitingUploadPolicyNumber.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingUploadPolicyNumber activo. Llamando a handleUploadFlow.'); // Log añadido
                    await this.handler.handleUploadFlow(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingDeletePolicyNumber`);
                // 4) If we're waiting for a policy number for /delete
                if (this.handler.awaitingDeletePolicyNumber.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingDeletePolicyNumber activo. Llamando a handleDeletePolicyFlow.'); // Log añadido
                    await this.handler.handleDeletePolicyFlow(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingPaymentPolicyNumber`);
                // 5) If we're waiting for a policy number for /addpayment
                if (this.handler.awaitingPaymentPolicyNumber.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingPaymentPolicyNumber activo. Llamando a handleAddPaymentPolicyNumber.'); // Log añadido
                    await this.handler.handleAddPaymentPolicyNumber(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingPaymentData`);
                // 6) If we're waiting for payment data (amount/date) for /addpayment
                if (this.handler.awaitingPaymentData.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingPaymentData activo. Llamando a handlePaymentData.'); // Log añadido
                    await this.handler.handlePaymentData(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingContactTime con threadId=${threadId || 'ninguno'}`);
                // (C) If we're waiting for contact time (part of 'ocuparPoliza' flow after service assignment)
                let esperaHoraContacto = false;
                
                // Verificar si existe serviceInfo con waitingForContactTime=true
                const ocuparPolizaCmd = this.handler.registry?.getCommand
                    ? this.handler.registry.getCommand('ocuparPoliza')
                    : null;
                
                if (ocuparPolizaCmd) {
                    const serviceInfo = ocuparPolizaCmd.scheduledServiceInfo.get(chatId, threadId);
                    this.logInfo(`[TextMsgHandler] Verificando serviceInfo para hora de contacto: ${JSON.stringify(serviceInfo)}`);
                    
                    if (serviceInfo && serviceInfo.waitingForContactTime) {
                        this.logInfo(`[TextMsgHandler] Encontrado serviceInfo con waitingForContactTime=true`);
                        esperaHoraContacto = true;
                    }
                }
                
                // Verificación tradicional como respaldo
                if (!esperaHoraContacto && this.ocuparPolizaCallback && this.ocuparPolizaCallback.awaitingContactTime) {
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
                    this.logInfo('[TextMsgHandler] Estado awaitingContactTime activo. Llamando a handleContactTime.'); // Log añadido
                    this.logInfo('Delegando manejo de hora de contacto a OcuparPolizaCallback', { chatId, threadId, hora: messageText });
                    if (typeof this.ocuparPolizaCallback.handleContactTime === 'function') {
                        await this.ocuparPolizaCallback.handleContactTime(ctx, messageText, threadId);
                    } else {
                        this.logInfo('OcuparPolizaCallback or handleContactTime not found, cannot process contact time.');
                        await ctx.reply('❌ Error: No se puede procesar la hora de contacto. Por favor, inténtalo de nuevo desde el menú principal.');
                    }
                    return; // Let the specific handler manage state and replies
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingServicePolicyNumber`);
                // 7) Waiting for a policy number for /addservice
                if (this.handler.awaitingServicePolicyNumber.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingServicePolicyNumber activo. Llamando a handleAddServicePolicyNumber.'); // Log añadido
                    await this.handler.handleAddServicePolicyNumber(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingServiceData con threadId=${threadId || 'ninguno'}`);
                // 8) Waiting for service data (cost, date, file number)
                if (this.handler.awaitingServiceData.get(chatId, threadId)) { // <-- AÑADIDO threadId
                    this.logInfo('[TextMsgHandler] Estado awaitingServiceData activo. Llamando a handleServiceData.'); // Log añadido
                    // Usar la versión corregida de handleServiceData
                    const handleServiceData = require('../handleServiceData');
                    const serviceResult = await handleServiceData.call(this.handler, ctx, messageText);

                    // Verificar si handleServiceData tuvo éxito
                    if (!serviceResult) {
                        // handleServiceData ya debería haber respondido con un error, pero por si acaso:
                        this.logError('[TextMsgHandler] handleServiceData falló o no devolvió datos.');
                        // No limpiamos estado aquí para permitir corrección
                        return;
                    }

                    // Extraer datos del resultado
                    const { expediente, origenDestino, costo, fechaJS } = serviceResult;

                    // NUEVO: Verificar si estamos en flujo de notificación después de servicio
                    const ocuparPolizaCmd = this.handler.registry?.getCommand
                        ? this.handler.registry.getCommand('ocuparPoliza')
                        : null;

                    if (ocuparPolizaCmd) {
                        // --- INICIO LOGGING AÑADIDO ---
                        this.logInfo(`[TextMsgHandler] Verificando flujo de notificación para chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                        const serviceInfo = ocuparPolizaCmd.scheduledServiceInfo.get(chatId, threadId);
                        this.logInfo(`[TextMsgHandler] serviceInfo recuperado: ${JSON.stringify(serviceInfo)}`);
                        // --- FIN LOGGING AÑADIDO ---

                        if (serviceInfo && serviceInfo.waitingForServiceData) {
                            // Estamos en el flujo de notificación ⇒ continuar solicitando hora
                            this.logInfo(`[TextMsgHandler] serviceInfo encontrado y waitingForServiceData=true. Llamando a handleServiceCompleted.`); // Log añadido
                            const completed = await ocuparPolizaCmd.handleServiceCompleted(ctx, { // Capturar resultado
                                expediente,
                                origenDestino,
                                costo,
                                fecha: fechaJS
                            });
                            // Si handleServiceCompleted tuvo éxito, el flujo continúa allí.
                            // Si falla, podríamos querer limpiar el estado aquí, pero por ahora lo dejamos.
                            if (completed) {
                                return; // El flujo continúa en OcuparPolizaCallback
                            } else {
                                this.logError('[TextMsgHandler] handleServiceCompleted falló.');
                                // Considerar limpiar estado aquí si handleServiceCompleted falla
                                this.handler.awaitingServiceData.delete(chatId, threadId);
                                return;
                            }
                        } else {
                           this.logInfo(`[TextMsgHandler] Condición de notificación falló: serviceInfo=${!!serviceInfo}, waitingForServiceData=${serviceInfo?.waitingForServiceData}`); // Log añadido
                           // Limpiar estado si no es flujo de notificación
                           this.handler.awaitingServiceData.delete(chatId, threadId);
                        }
                    } else {
                         this.logInfo(`[TextMsgHandler] ocuparPolizaCmd no encontrado.`); // Log añadido
                         // Limpiar estado si no se puede encontrar el comando
                         this.handler.awaitingServiceData.delete(chatId, threadId);
                    }

                    // Si llegamos aquí, significa que no continuamos con el flujo de notificación
                    // El estado ya debería haberse limpiado en los bloques 'else' anteriores.
                    // this.logInfo(`[TextMsgHandler] Flujo de datos de servicio completado (sin continuación de notificación).`); // Log ajustado
                    return; // Salir después de manejar los datos del servicio
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingPhoneNumber`);
                // (A) If we're waiting for a phone number (part of 'ocuparPoliza' flow)
                // Verificación detallada con logs para awaitingPhoneNumber
                // this.logInfo(`Verificando si se espera teléfono en chatId=${chatId}, threadId=${threadId || 'ninguno'}`); // Log redundante
                let esperaTelefono = false;

                // Verificar existencia del mapa
                if (!this.handler.awaitingPhoneNumber) {
                    this.logInfo('El mapa awaitingPhoneNumber no existe en el handler');
                } else {
                    // Verificar método has
                    if (typeof this.handler.awaitingPhoneNumber.has === 'function') {
                        esperaTelefono = this.handler.awaitingPhoneNumber.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingPhoneNumber.has: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}`);
                    } else {
                        this.logInfo('El método has no está disponible en awaitingPhoneNumber');
                        
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
                            this.logInfo('Intentando cargar ocuparPolizaCallback dinámicamente');
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
                    this.logInfo('[TextMsgHandler] Estado awaitingPhoneNumber activo. Llamando a handlePhoneNumber.'); // Log añadido
                    // ... (resto del bloque)
                    return; // Let the specific handler manage state and replies
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingOrigenDestino`);
                // (B) If we're waiting for origin-destination (part of 'ocuparPoliza' flow)
                // Verificación detallada con logs para awaitingOrigenDestino
                // this.logInfo(`Verificando si se espera origen-destino en chatId=${chatId}, threadId=${threadId || 'ninguno'}`); // Log redundante
                let esperaOrigenDestino = false;

                // Verificar existencia del mapa
                if (!this.handler.awaitingOrigenDestino) {
                    this.logInfo('El mapa awaitingOrigenDestino no existe en el handler');
                } else {
                    // Verificar método has
                    if (typeof this.handler.awaitingOrigenDestino.has === 'function') {
                        esperaOrigenDestino = this.handler.awaitingOrigenDestino.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingOrigenDestino.has: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}`);
                    } else {
                        this.logInfo('El método has no está disponible en awaitingOrigenDestino');
                        
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
                            this.logInfo('Intentando cargar ocuparPolizaCallback dinámicamente');
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
                    this.logInfo('[TextMsgHandler] Estado awaitingOrigenDestino activo. Llamando a handleOrigenDestino.'); // Log añadido
                    // ... (resto del bloque)
                    return; // Let the specific handler manage state and replies
                }

                // La verificación de awaitingContactTime ya se realiza al principio del método

                // --- LOGGING AÑADIDO ---
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingDeleteReason`);
                // Handle delete reason
                if (this.handler.awaitingDeleteReason && this.handler.awaitingDeleteReason.get(chatId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingDeleteReason activo. Procesando motivo.'); // Log añadido
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

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Ningún estado activo coincidió con el mensaje.');
                // If it gets here and isn't in any of the previous flows, ignore or respond generically
            } catch (error) {
                this.logError('Error general al procesar mensaje de texto:', error);
                await ctx.reply('❌ Error al procesar el mensaje. Intenta nuevamente.');
            }
        });
    }
}

module.exports = TextMessageHandler;
