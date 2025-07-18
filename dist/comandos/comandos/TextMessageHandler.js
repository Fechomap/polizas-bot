"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextMessageHandler = void 0;
const BaseCommand_1 = require("./BaseCommand");
const policyController_1 = require("../../controllers/policyController");
const telegraf_1 = require("telegraf");
const StateKeyManager_1 = __importDefault(require("../../utils/StateKeyManager"));
class TextMessageHandler extends BaseCommand_1.BaseCommand {
    constructor(handler) {
        super(handler);
        this.ocuparPolizaCallback = null;
        this.handler = handler;
        this.ocuparPolizaCallback = null;
    }
    getCommandName() {
        return 'textHandler';
    }
    getDescription() {
        return 'Manejador de mensajes de texto que no son comandos';
    }
    register() {
        this.bot.on('location', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                this.logInfo('Procesando ubicación compartida de Telegram', {
                    chatId,
                    threadId: threadId || 'ninguno',
                    lat: ctx.message?.location?.latitude,
                    lng: ctx.message?.location?.longitude
                });
                if (!this.ocuparPolizaCallback && this.handler.registry) {
                    const commands = this.handler.registry.getAllCommands();
                    this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') || null;
                }
                if (this.handler.awaitingOrigen.has(chatId, threadId)) {
                    this.logInfo('Procesando ubicación como origen');
                    if (this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleOrigen === 'function') {
                        await this.ocuparPolizaCallback.handleOrigen(ctx, ctx.message, threadId);
                    }
                    else {
                        await ctx.reply('❌ Error al procesar la ubicación del origen.');
                    }
                    return;
                }
                if (this.handler.awaitingDestino.has(chatId, threadId)) {
                    this.logInfo('Procesando ubicación como destino');
                    if (this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleDestino === 'function') {
                        await this.ocuparPolizaCallback.handleDestino(ctx, ctx.message, threadId);
                    }
                    else {
                        await ctx.reply('❌ Error al procesar la ubicación del destino.');
                    }
                    return;
                }
                this.logInfo('Ubicación recibida pero no hay estado activo relevante');
            }
            catch (error) {
                this.logError('Error al procesar ubicación:', error);
                await ctx.reply('❌ Error al procesar la ubicación compartida.');
            }
        });
        this.bot.on('photo', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const userId = ctx.from.id.toString();
                this.logInfo('Procesando foto recibida', {
                    chatId,
                    userId,
                    photoCount: ctx.message?.photo ? ctx.message.photo.length : 0
                });
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');
                if (baseAutosCommand &&
                    typeof baseAutosCommand.procesarMensajeBaseAutos === 'function') {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarMensajeBaseAutos(ctx.message, userId);
                    if (procesadoPorBaseAutos) {
                        this.logInfo('[TextMsgHandler] Foto procesada por Base de Autos');
                        return;
                    }
                }
                this.logInfo('[TextMsgHandler] Foto recibida pero no hay flujo activo');
                await ctx.reply('📸 Foto recibida, pero no hay un registro de vehículo activo. Usa /base_autos para iniciar el registro.');
            }
            catch (error) {
                this.logError('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto. Intenta nuevamente.');
            }
        });
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const userId = ctx.from.id.toString();
                this.logInfo('Documento recibido', {
                    chatId,
                    userId,
                    fileName: ctx.message?.document?.file_name,
                    mimeType: ctx.message?.document?.mime_type,
                    size: ctx.message?.document?.file_size
                });
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');
                if (baseAutosCommand &&
                    typeof baseAutosCommand.procesarDocumentoBaseAutos === 'function') {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarDocumentoBaseAutos(ctx.message, userId);
                    if (procesadoPorBaseAutos) {
                        this.logInfo('[TextMsgHandler] Documento procesado por Base de Autos');
                        return;
                    }
                }
                this.logInfo('[TextMsgHandler] Documento recibido pero no hay flujo activo');
                await ctx.reply('📎 Documento recibido, pero no hay un proceso activo que lo requiera.');
            }
            catch (error) {
                this.logError('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento. Intenta nuevamente.');
            }
        });
        this.bot.on('text', async (ctx, next) => {
            if (!this.ocuparPolizaCallback && this.handler.registry) {
                const commands = this.handler.registry.getAllCommands();
                this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') || null;
            }
            try {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                const messageText = ctx.message.text.trim();
                this.logInfo(`Procesando mensaje de texto: "${messageText}"`, {
                    chatId,
                    threadId: threadId || 'ninguno'
                });
                if (messageText.startsWith('/')) {
                    this.logInfo('[TextMsgHandler] Ignorando comando, pasando a siguiente middleware.');
                    return next();
                }
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');
                if (baseAutosCommand &&
                    typeof baseAutosCommand.procesarMensajeBaseAutos === 'function') {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarMensajeBaseAutos(ctx.message, ctx.from.id.toString());
                    if (procesadoPorBaseAutos) {
                        this.logInfo('[TextMsgHandler] Mensaje procesado por Base de Autos');
                        return;
                    }
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingSaveData');
                if (this.handler.awaitingSaveData.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingSaveData activo. Llamando a handleSaveData.');
                    await this.handler.handleSaveData(ctx, messageText);
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingGetPolicyNumber');
                const esperaPoliza = this.handler.awaitingGetPolicyNumber.has(chatId, threadId);
                if (esperaPoliza) {
                    this.logInfo('[TextMsgHandler] Estado awaitingGetPolicyNumber activo. Llamando a handleGetPolicyFlow.');
                    try {
                        await this.handler.handleGetPolicyFlow(ctx, messageText);
                    }
                    catch (error) {
                        this.logError(`Error en handleGetPolicyFlow: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar el número de póliza. Por favor intenta nuevamente.');
                    }
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingUploadPolicyNumber');
                if (this.handler.awaitingUploadPolicyNumber.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingUploadPolicyNumber activo. Llamando a handleUploadFlow.');
                    await this.handler.handleUploadFlow(ctx, messageText);
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingDeletePolicyNumber');
                if (this.handler.awaitingDeletePolicyNumber.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingDeletePolicyNumber activo. Llamando a handleDeletePolicyFlow.');
                    await this.handler.handleDeletePolicyFlow(ctx, messageText);
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingPaymentPolicyNumber');
                if (this.handler.awaitingPaymentPolicyNumber.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingPaymentPolicyNumber activo. Llamando a handleAddPaymentPolicyNumber.');
                    await this.handler.handleAddPaymentPolicyNumber(ctx, messageText);
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingPaymentData');
                if (this.handler.awaitingPaymentData.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingPaymentData activo. Llamando a handlePaymentData.');
                    await this.handler.handlePaymentData(ctx, messageText);
                    return;
                }
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingContactTime con threadId=${threadId || 'ninguno'}`);
                let esperaHoraContacto = false;
                const ocuparPolizaCmd = this.handler.registry?.getCommand
                    ? this.handler.registry.getCommand('ocuparPoliza')
                    : null;
                if (ocuparPolizaCmd) {
                    const serviceInfo = ocuparPolizaCmd.scheduledServiceInfo.get(chatId, threadId);
                    this.logInfo(`[TextMsgHandler] Verificando serviceInfo para hora de contacto: ${JSON.stringify(serviceInfo)}`);
                    if (serviceInfo && serviceInfo.waitingForContactTime) {
                        this.logInfo('[TextMsgHandler] Encontrado serviceInfo con waitingForContactTime=true');
                        esperaHoraContacto = true;
                    }
                }
                if (!esperaHoraContacto &&
                    this.ocuparPolizaCallback &&
                    this.ocuparPolizaCallback.awaitingContactTime) {
                    if (typeof this.ocuparPolizaCallback.awaitingContactTime.has === 'function') {
                        esperaHoraContacto = this.ocuparPolizaCallback.awaitingContactTime.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingContactTime.has: ${esperaHoraContacto ? 'SÍ se espera' : 'NO se espera'}`);
                    }
                    else if (typeof this.ocuparPolizaCallback.awaitingContactTime.get === 'function') {
                        const valor = this.ocuparPolizaCallback.awaitingContactTime.get(chatId, threadId);
                        esperaHoraContacto = !!valor;
                        this.logInfo(`Verificación alternativa usando get: ${esperaHoraContacto ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`);
                    }
                }
                if (esperaHoraContacto) {
                    this.logInfo('[TextMsgHandler] Estado awaitingContactTime activo. Llamando a handleContactTime.');
                    this.logInfo('Delegando manejo de hora de contacto a OcuparPolizaCallback', {
                        chatId,
                        threadId,
                        hora: messageText
                    });
                    if (typeof this.ocuparPolizaCallback?.handleContactTime === 'function') {
                        await this.ocuparPolizaCallback.handleContactTime(ctx, messageText, threadId);
                    }
                    else {
                        this.logInfo('OcuparPolizaCallback or handleContactTime not found, cannot process contact time.');
                        await ctx.reply('❌ Error: No se puede procesar la hora de contacto. Por favor, inténtalo de nuevo desde el menú principal.');
                    }
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingServicePolicyNumber');
                if (this.handler.awaitingServicePolicyNumber.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingServicePolicyNumber activo. Llamando a handleAddServicePolicyNumber.');
                    await this.handler.handleAddServicePolicyNumber(ctx, messageText);
                    return;
                }
                this.logInfo(`[TextMsgHandler] Verificando estado: awaitingServiceData con threadId=${threadId || 'ninguno'}`);
                if (this.handler.awaitingServiceData.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingServiceData activo. Llamando a handleServiceData.');
                    const handleServiceData = require('../handleServiceData');
                    const serviceResult = await handleServiceData.call(this.handler, ctx, messageText);
                    if (!serviceResult) {
                        this.logError('[TextMsgHandler] handleServiceData falló o no devolvió datos.');
                        return;
                    }
                    const { expediente, origenDestino, costo, fechaJS } = serviceResult;
                    const ocuparPolizaCmd2 = this.handler.registry?.getCommand
                        ? this.handler.registry.getCommand('ocuparPoliza')
                        : null;
                    if (ocuparPolizaCmd2) {
                        this.logInfo(`[TextMsgHandler] Verificando flujo de notificación para chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                        const serviceInfo = ocuparPolizaCmd2.scheduledServiceInfo.get(chatId, threadId);
                        this.logInfo(`[TextMsgHandler] serviceInfo recuperado: ${JSON.stringify(serviceInfo)}`);
                        if (serviceInfo && serviceInfo.waitingForServiceData) {
                            this.logInfo('[TextMsgHandler] serviceInfo encontrado y waitingForServiceData=true. Llamando a handleServiceCompleted.');
                            const completed = await ocuparPolizaCmd2.handleServiceCompleted?.(ctx, {
                                expediente,
                                origenDestino,
                                costo,
                                fecha: fechaJS
                            });
                            if (completed) {
                                return;
                            }
                            else {
                                this.logError('[TextMsgHandler] handleServiceCompleted falló.');
                                this.handler.awaitingServiceData.delete(chatId, threadId);
                                return;
                            }
                        }
                        else {
                            this.logInfo(`[TextMsgHandler] Condición de notificación falló: serviceInfo=${!!serviceInfo}, waitingForServiceData=${serviceInfo?.waitingForServiceData}`);
                            this.handler.awaitingServiceData.delete(chatId, threadId);
                            this.logInfo('[TextMsgHandler] Estado awaitingServiceData limpiado (no era flujo de notificación).');
                        }
                    }
                    else {
                        this.logInfo('[TextMsgHandler] ocuparPolizaCmd no encontrado.');
                        this.handler.awaitingServiceData.delete(chatId, threadId);
                        this.logInfo('[TextMsgHandler] Estado awaitingServiceData limpiado (ocuparPolizaCmd no encontrado).');
                    }
                    this.logInfo('[TextMsgHandler] Flujo de datos de servicio completado (sin continuación de notificación).');
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingPhoneNumber');
                let esperaTelefono = false;
                if (!this.handler.awaitingPhoneNumber) {
                    this.logInfo('El mapa awaitingPhoneNumber no existe en el handler');
                }
                else {
                    if (typeof this.handler.awaitingPhoneNumber.has === 'function') {
                        esperaTelefono = this.handler.awaitingPhoneNumber.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingPhoneNumber.has: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}`);
                    }
                    else {
                        this.logInfo('El método has no está disponible en awaitingPhoneNumber');
                        if (typeof this.handler.awaitingPhoneNumber.get === 'function') {
                            const valor = this.handler.awaitingPhoneNumber.get(chatId, threadId);
                            esperaTelefono = !!valor;
                            this.logInfo(`Verificación alternativa usando get: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`);
                        }
                        else {
                            this.logError('Ni has ni get están disponibles en awaitingPhoneNumber');
                        }
                    }
                }
                if (esperaTelefono) {
                    this.logInfo(`Procesando número telefónico: ${messageText}`, {
                        chatId,
                        threadId: threadId || 'ninguno'
                    });
                    try {
                        if (!this.ocuparPolizaCallback) {
                            this.logInfo('Intentando cargar ocuparPolizaCallback dinámicamente');
                            const commands = this.handler.registry.getAllCommands();
                            this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') || null;
                        }
                        if (this.ocuparPolizaCallback &&
                            typeof this.ocuparPolizaCallback.handlePhoneNumber === 'function') {
                            this.logInfo('Delegando manejo de número telefónico a OcuparPolizaCallback', { chatId, threadId });
                            await this.ocuparPolizaCallback.handlePhoneNumber(ctx, messageText, threadId);
                        }
                        else {
                            this.logError('No se puede procesar el teléfono: OcuparPolizaCallback o handlePhoneNumber no encontrados');
                            await ctx.reply('❌ Error al procesar el número telefónico. Por favor, intenta desde el menú principal.');
                        }
                    }
                    catch (error) {
                        this.logError(`Error al procesar número telefónico: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar el número telefónico. Por favor, intenta nuevamente.');
                    }
                    this.logInfo('[TextMsgHandler] Estado awaitingPhoneNumber activo. Llamando a handlePhoneNumber.');
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingOrigen');
                if (this.handler.awaitingOrigen.has(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingOrigen activo. Llamando a handleOrigen.');
                    if (!this.ocuparPolizaCallback) {
                        const commands = this.handler.registry.getAllCommands();
                        this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') || null;
                    }
                    if (this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleOrigen === 'function') {
                        await this.ocuparPolizaCallback.handleOrigen(ctx, messageText, threadId);
                    }
                    else {
                        await ctx.reply('❌ Error al procesar la ubicación del origen.');
                    }
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingDestino');
                if (this.handler.awaitingDestino.has(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingDestino activo. Llamando a handleDestino.');
                    if (!this.ocuparPolizaCallback) {
                        const commands = this.handler.registry.getAllCommands();
                        this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') || null;
                    }
                    if (this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleDestino === 'function') {
                        await this.ocuparPolizaCallback.handleDestino(ctx, messageText, threadId);
                    }
                    else {
                        await ctx.reply('❌ Error al procesar la ubicación del destino.');
                    }
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingOrigenDestino');
                let esperaOrigenDestino = false;
                if (!this.handler.awaitingOrigenDestino) {
                    this.logInfo('El mapa awaitingOrigenDestino no existe en el handler');
                }
                else {
                    if (typeof this.handler.awaitingOrigenDestino.has === 'function') {
                        esperaOrigenDestino = this.handler.awaitingOrigenDestino.has(chatId, threadId);
                        this.logInfo(`Verificación de awaitingOrigenDestino.has: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}`);
                    }
                    else {
                        this.logInfo('El método has no está disponible en awaitingOrigenDestino');
                        if (typeof this.handler.awaitingOrigenDestino.get === 'function') {
                            const valor = this.handler.awaitingOrigenDestino.get(chatId, threadId);
                            esperaOrigenDestino = !!valor;
                            this.logInfo(`Verificación alternativa usando get: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`);
                        }
                        else {
                            this.logError('Ni has ni get están disponibles en awaitingOrigenDestino');
                        }
                    }
                }
                if (esperaOrigenDestino) {
                    this.logInfo(`Procesando origen-destino: ${messageText}`, {
                        chatId,
                        threadId: threadId || 'ninguno'
                    });
                    try {
                        if (!this.ocuparPolizaCallback) {
                            this.logInfo('Intentando cargar ocuparPolizaCallback dinámicamente');
                            const commands = this.handler.registry.getAllCommands();
                            this.ocuparPolizaCallback = commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') || null;
                        }
                        if (this.ocuparPolizaCallback &&
                            typeof this.ocuparPolizaCallback.handleOrigenDestino === 'function') {
                            this.logInfo('Delegando manejo de origen-destino a OcuparPolizaCallback', { chatId, threadId });
                            await this.ocuparPolizaCallback.handleOrigenDestino(ctx, messageText, threadId);
                        }
                        else {
                            this.logError('No se puede procesar origen-destino: OcuparPolizaCallback o handleOrigenDestino no encontrados');
                            await ctx.reply('❌ Error al procesar origen-destino. Por favor, intenta desde el menú principal.');
                        }
                    }
                    catch (error) {
                        this.logError(`Error al procesar origen-destino: ${error.message}`, error);
                        await ctx.reply('❌ Error al procesar origen-destino. Por favor, intenta nuevamente.');
                    }
                    this.logInfo('[TextMsgHandler] Estado awaitingOrigenDestino activo. Llamando a handleOrigenDestino.');
                    return;
                }
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingDeleteReason');
                if (this.handler.awaitingDeleteReason &&
                    this.handler.awaitingDeleteReason.get(chatId, threadId)) {
                    this.logInfo('[TextMsgHandler] Estado awaitingDeleteReason activo. Procesando motivo.');
                    const numeroPolizas = this.handler.awaitingDeleteReason.get(chatId, threadId);
                    const motivo = messageText.trim() === 'ninguno' ? '' : messageText.trim();
                    if (!numeroPolizas) {
                        this.logError('No se encontraron números de póliza para eliminar');
                        return;
                    }
                    try {
                        let eliminadas = 0;
                        let noEncontradas = 0;
                        let errores = 0;
                        const listadoNoEncontradas = [];
                        const msgInicial = await ctx.reply(`🔄 Procesando ${numeroPolizas.length} póliza(s)...`);
                        for (const numeroPoliza of numeroPolizas) {
                            try {
                                const deletedPolicy = await (0, policyController_1.markPolicyAsDeleted)(numeroPoliza, motivo);
                                if (!deletedPolicy) {
                                    noEncontradas++;
                                    listadoNoEncontradas.push(numeroPoliza);
                                }
                                else {
                                    eliminadas++;
                                }
                                if (numeroPolizas.length > 10 && eliminadas % 5 === 0) {
                                    await ctx.telegram.editMessageText(msgInicial.chat.id, msgInicial.message_id, undefined, `🔄 Procesando ${numeroPolizas.length} póliza(s)...\n` +
                                        `✅ Procesadas: ${eliminadas + noEncontradas + errores}/${numeroPolizas.length}\n` +
                                        '⏱️ Por favor espere...');
                                }
                            }
                            catch (error) {
                                this.logError(`Error al marcar póliza ${numeroPoliza} como eliminada:`, error);
                                let mensajeError = `❌ No se pudo eliminar la póliza ${numeroPoliza}`;
                                if (error.name === 'ValidationError') {
                                    const camposFaltantes = Object.keys(error.errors || {})
                                        .map(campo => `\`${campo}\``)
                                        .join(', ');
                                    if (camposFaltantes) {
                                        mensajeError += `: falta(n) el/los campo(s) obligatorio(s) ${camposFaltantes}.`;
                                    }
                                    else {
                                        mensajeError += ': error de validación.';
                                    }
                                }
                                else {
                                    mensajeError += '.';
                                }
                                await ctx.reply(mensajeError);
                                errores++;
                            }
                        }
                        await ctx.telegram.editMessageText(msgInicial.chat.id, msgInicial.message_id, undefined, '✅ Proceso completado');
                        let mensajeResultado = '📊 *Resultados del proceso:*\n' +
                            `✅ Pólizas eliminadas correctamente: ${eliminadas}\n`;
                        if (noEncontradas > 0) {
                            mensajeResultado += `⚠️ Pólizas no encontradas o ya eliminadas: ${noEncontradas}\n`;
                            if (noEncontradas <= 10) {
                                mensajeResultado += `📋 No encontradas:\n${listadoNoEncontradas.map(p => `- ${p}`).join('\n')}\n`;
                            }
                        }
                        if (errores > 0) {
                            mensajeResultado += `❌ Errores al procesar: ${errores}\n`;
                        }
                        await ctx.replyWithMarkdown(mensajeResultado, telegraf_1.Markup.inlineKeyboard([
                            telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ]));
                    }
                    catch (error) {
                        this.logError('Error general al marcar pólizas como eliminadas:', error);
                        await ctx.reply('❌ Hubo un error al marcar las pólizas como eliminadas. Intenta nuevamente.', telegraf_1.Markup.inlineKeyboard([
                            telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ]));
                    }
                    finally {
                        this.handler.awaitingDeleteReason?.delete(chatId, threadId);
                    }
                    return;
                }
                this.logInfo('[TextMsgHandler] Ningún estado activo coincidió con el mensaje.');
                return next();
            }
            catch (error) {
                this.logError('Error general al procesar mensaje de texto:', error);
                await ctx.reply('❌ Error al procesar el mensaje. Intenta nuevamente.');
            }
        });
    }
}
exports.TextMessageHandler = TextMessageHandler;
exports.default = TextMessageHandler;
