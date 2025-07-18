"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const BaseCommand_1 = require("./BaseCommand");
const policyController_1 = require("../../controllers/policyController");
const StateKeyManager_1 = require("../../utils/StateKeyManager");
const HereMapsService_1 = require("../../services/HereMapsService");
class OcuparPolizaCallback extends BaseCommand_1.BaseCommand {
    constructor(handler) {
        super(handler);
        this.awaitingPhoneNumber = handler.awaitingPhoneNumber;
        this.awaitingOrigenDestino = handler.awaitingOrigenDestino;
        this.awaitingOrigen = handler.awaitingOrigen;
        this.awaitingDestino = handler.awaitingDestino;
        this.pendingLeyendas = StateKeyManager_1.StateKeyManager.createThreadSafeStateMap();
        this.polizaCache = StateKeyManager_1.StateKeyManager.createThreadSafeStateMap();
        this.messageIds = StateKeyManager_1.StateKeyManager.createThreadSafeStateMap();
        this.awaitingContactTime = StateKeyManager_1.StateKeyManager.createThreadSafeStateMap();
        this.scheduledServiceInfo = StateKeyManager_1.StateKeyManager.createThreadSafeStateMap();
        this.hereMapsService = new HereMapsService_1.HereMapsService();
    }
    getCommandName() {
        return 'ocuparPoliza';
    }
    getDescription() {
        return 'Manejador para ocupar una póliza (asignar teléfono y origen-destino)';
    }
    register() {
        this.handler.registry.registerCallback(/ocuparPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                this.logInfo(`[keepPhone] Iniciando callback para póliza ${numeroPoliza}`, {
                    chatId,
                    threadId
                });
                const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
                this.polizaCache.set(chatId, {
                    numeroPoliza,
                    policy
                }, threadId);
                if (policy.telefono) {
                    await ctx.reply(`📱 ${policy.telefono}`, telegraf_1.Markup.inlineKeyboard([
                        [telegraf_1.Markup.button.callback('🔄 CAMBIAR', `changePhone:${numeroPoliza}`)],
                        [telegraf_1.Markup.button.callback('✅ MANTENER', `keepPhone:${numeroPoliza}`)]
                    ]));
                    this.logInfo(`Mostrando opciones de teléfono para póliza ${numeroPoliza}`, {
                        chatId,
                        threadId,
                        telefonoActual: policy.telefono
                    });
                }
                else {
                    const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                    this.logInfo(`Estado de espera de teléfono guardado para nuevo teléfono: ${phoneSetResult ? 'OK' : 'FALLO'}`, {
                        chatId,
                        threadId
                    });
                    const phoneHasResult = this.awaitingPhoneNumber.has(chatId, threadId);
                    this.logInfo(`Verificación inmediata de estado teléfono (nuevo): ${phoneHasResult ? 'OK' : 'FALLO'}`);
                    await ctx.reply(`📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                        '⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.', { parse_mode: 'Markdown' });
                }
                this.logInfo(`Esperando teléfono para póliza ${numeroPoliza}`, {
                    chatId: ctx.chat.id,
                    threadId
                });
            }
            catch (error) {
                this.logError('Error en callback ocuparPoliza:', error);
                await ctx.reply('❌ Error al procesar ocupación de póliza.');
            }
            finally {
                await ctx.answerCbQuery();
            }
        });
        this.handler.registry.registerCallback(/keepPhone:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('[keepPhone] Botones removidos del mensaje original');
                }
                catch (editError) {
                    this.logInfo('[keepPhone] No se pudo editar mensaje original:', editError.message);
                }
                const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
                this.logInfo('[keepPhone] Intentando eliminar estado awaitingPhoneNumber', {
                    chatId,
                    threadId
                });
                const deleteResult = this.awaitingPhoneNumber.delete(chatId, threadId);
                this.logInfo(`[keepPhone] Resultado de delete awaitingPhoneNumber: ${deleteResult}`, { chatId, threadId });
                const hasAfterDelete = this.awaitingPhoneNumber.has(chatId, threadId);
                this.logInfo(`[keepPhone] Verificación inmediata awaitingPhoneNumber.has: ${hasAfterDelete}`, { chatId, threadId });
                this.logInfo('[keepPhone] Intentando establecer estado awaitingOrigen', {
                    chatId,
                    threadId
                });
                const setResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
                this.logInfo(`[keepPhone] Resultado de set awaitingOrigen: ${setResult}`, {
                    chatId,
                    threadId
                });
                const hasAfterSet = this.awaitingOrigen.has(chatId, threadId);
                this.logInfo(`[keepPhone] Verificación inmediata awaitingOrigen.has: ${hasAfterSet}`, { chatId, threadId });
                await ctx.reply(`✅ Se mantendrá el número: ${policy.telefono}\n\n` + '📍indica *ORIGEN*', { parse_mode: 'Markdown' });
            }
            catch (error) {
                this.logError('Error en callback keepPhone:', error);
                await ctx.reply('❌ Error al procesar la acción.');
            }
            finally {
                await ctx.answerCbQuery();
            }
        });
        this.registerChangePhoneCallback();
        this.registerServiceCallbacks();
        this.registerDaySelectionCallbacks();
    }
    registerChangePhoneCallback() {
        this.handler.registry.registerCallback(/changePhone:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('[changePhone] Botones removidos del mensaje original');
                }
                catch (editError) {
                    this.logInfo('[changePhone] No se pudo editar mensaje original:', editError.message);
                }
                this.logInfo(`[changePhone] Iniciando cambio de teléfono para póliza ${numeroPoliza}`, { chatId, threadId });
                const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                this.logInfo(`[changePhone] Estado de espera de teléfono guardado: ${phoneSetResult ? 'OK' : 'FALLO'}`, {
                    chatId,
                    threadId
                });
                await ctx.reply(`📱 Ingresa el *nuevo número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                    '⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.', { parse_mode: 'Markdown' });
                this.logInfo(`[changePhone] Esperando nuevo teléfono para póliza ${numeroPoliza}`, {
                    chatId,
                    threadId
                });
            }
            catch (error) {
                this.logError('Error en callback changePhone:', error);
                await ctx.reply('❌ Error al procesar el cambio de teléfono.');
            }
            finally {
                await ctx.answerCbQuery();
            }
        });
    }
    registerServiceCallbacks() {
        this.handler.registry.registerCallback(/registrar_servicio_(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                this.logInfo(`Iniciando registro de servicio para póliza: ${numeroPoliza}`, {
                    chatId,
                    threadId
                });
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('Botones removidos del mensaje original');
                }
                catch (editError) {
                    this.logInfo('No se pudo editar mensaje original (probablemente ya fue editado):', editError.message);
                }
                await ctx.reply('🚗 **INGRESA EL NÚMERO DE EXPEDIENTE:**', {
                    parse_mode: 'Markdown'
                });
                this.handler.awaitingServiceData.set(chatId, numeroPoliza, threadId);
                this.logInfo(`Estado establecido para esperar datos del servicio para ${numeroPoliza}`);
            }
            catch (error) {
                this.logError('Error en callback registrarServicio:', error);
                await ctx.reply('❌ Error al iniciar el registro del servicio.');
            }
            finally {
                await ctx.answerCbQuery();
            }
        });
        this.handler.registry.registerCallback(/no_registrar_(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                this.logInfo(`No registrar servicio para póliza: ${numeroPoliza}`, {
                    chatId,
                    threadId
                });
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('Botones removidos del mensaje original');
                }
                catch (editError) {
                    this.logInfo('No se pudo editar mensaje original (probablemente ya fue editado):', editError.message);
                }
                await ctx.reply(`✅ Proceso finalizado para póliza *${numeroPoliza}*.\n\n` +
                    '📝 Los datos de origen-destino y teléfono han sido guardados.\n' +
                    '🚫 No se registrará ningún servicio en este momento.', { parse_mode: 'Markdown' });
                this.cleanupAllStates(chatId, threadId);
            }
            catch (error) {
                this.logError('Error en callback noRegistrar:', error);
                await ctx.reply('❌ Error al finalizar el proceso.');
            }
            finally {
                await ctx.answerCbQuery();
            }
        });
    }
    registerDaySelectionCallbacks() {
        this.handler.registry.registerCallback(/selectDay:(\d+):(.+)/, async (ctx) => {
            try {
                const daysOffset = parseInt(ctx.match[1], 10);
                const numeroPoliza = ctx.match[2];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                this.logInfo(`Selección de día: offset=${daysOffset}, póliza=${numeroPoliza}`, {
                    chatId,
                    threadId
                });
                await ctx.answerCbQuery();
                const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
                if (!serviceInfo || !serviceInfo.contactTime) {
                    this.logError('No se encontró info de servicio o falta hora de contacto');
                    return await ctx.reply('❌ Error: No se encontró la información de la hora de contacto.');
                }
                this.logInfo(`Recuperada info de servicio: contactTime=${serviceInfo.contactTime}, origen=${serviceInfo.origin}, destino=${serviceInfo.destination}`);
                const moment = require('moment-timezone');
                const today = moment().tz('America/Mexico_City');
                const scheduledMoment = today.clone().add(daysOffset, 'days');
                const [hours, minutes] = serviceInfo.contactTime.split(':').map(Number);
                scheduledMoment.hour(hours).minute(minutes).second(0).millisecond(0);
                const scheduledDateJS = scheduledMoment.toDate();
                serviceInfo.scheduledDate = scheduledDateJS;
                const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);
                this.logInfo(`Info de servicio actualizada con fecha=${scheduledMoment.format()}: ${serviceStore ? 'OK' : 'FALLO'}`);
                const dayNames = [
                    'Domingo',
                    'Lunes',
                    'Martes',
                    'Miércoles',
                    'Jueves',
                    'Viernes',
                    'Sábado'
                ];
                const dayName = dayNames[scheduledMoment.day()];
                const dateStr = scheduledMoment.format('DD/MM/YYYY');
                await ctx.editMessageText(`✅ Alerta programada para: *${dayName}, ${dateStr} a las ${serviceInfo.contactTime}*\n\n` +
                    'El servicio ha sido registrado correctamente. No se requieren más acciones.', {
                    parse_mode: 'Markdown'
                });
                this.logInfo(`Limpiando estados para chatId=${chatId}, threadId=${threadId} después de completar flujo.`);
                this.cleanupAllStates(chatId, threadId);
            }
            catch (error) {
                this.logError('Error al procesar selección de día:', error);
                await ctx.reply('❌ Error al procesar la selección de día. Operación cancelada.');
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                this.cleanupAllStates(ctx.chat.id, threadId);
            }
        });
    }
    async handlePhoneNumber(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingPhoneNumber.get(chatId, threadId);
        const regexTel = /^\d{10}$/;
        if (!regexTel.test(messageText)) {
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelado.');
            return true;
        }
        try {
            let policy;
            const cachedData = this.polizaCache.get(chatId, threadId);
            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
            }
            else {
                policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
            }
            if (!policy) {
                this.logError(`Póliza no encontrada en handlePhoneNumber: ${numeroPoliza}`);
                this.awaitingPhoneNumber.delete(chatId, threadId);
                return await ctx.reply(`❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`);
            }
            policy.telefono = messageText;
            await policy.save();
            if (cachedData) {
                cachedData.policy = policy;
                this.polizaCache.set(chatId, cachedData, threadId);
            }
            await ctx.reply(`✅ Teléfono ${messageText} asignado a la póliza ${numeroPoliza}.\n\n` +
                '📍indica *ORIGEN*', { parse_mode: 'Markdown' });
            this.awaitingPhoneNumber.delete(chatId, threadId);
            const origenResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
            this.logInfo(`Estado de espera de origen guardado: ${origenResult ? 'OK' : 'FALLO'}`, {
                chatId,
                threadId: threadId || 'ninguno'
            });
            const origenHasResult = this.awaitingOrigen.has(chatId, threadId);
            this.logInfo(`Verificación inmediata de estado origen-destino: ${origenHasResult ? 'OK' : 'FALLO'}`);
            return true;
        }
        catch (error) {
            this.logError(`Error guardando teléfono para póliza ${numeroPoliza}:`, error);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await ctx.reply('❌ Error al guardar el teléfono. Operación cancelada.');
            return true;
        }
    }
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
            if (input && input.location) {
                coordenadas = {
                    lat: input.location.latitude,
                    lng: input.location.longitude
                };
                this.logInfo('Coordenadas de origen extraídas de ubicación de Telegram', coordenadas);
            }
            else if (typeof input === 'string') {
                coordenadas = this.hereMapsService.parseCoordinates(input);
                if (!coordenadas) {
                    await ctx.reply('❌ Formato inválido. 📍indica *ORIGEN*', {
                        parse_mode: 'Markdown'
                    });
                    return false;
                }
                this.logInfo('Coordenadas de origen extraídas de texto', coordenadas);
            }
            else {
                await ctx.reply('❌ Formato de entrada no válido para el origen.');
                return false;
            }
            this.awaitingOrigen.delete(chatId, threadId);
            this.awaitingDestino.set(chatId, numeroPoliza, threadId);
            await ctx.reply(`✅ Origen registrado: ${coordenadas.lat}, ${coordenadas.lng}\n\n` +
                '📍indica *DESTINO*', { parse_mode: 'Markdown' });
            return true;
        }
        catch (error) {
            this.logError('Error procesando origen:', error);
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
            return false;
        }
    }
    async handleDestino(ctx, input, threadId = null) {
        return true;
    }
    async handleContactTime(ctx, messageText, threadId = null) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingContactTime.get(chatId, threadId);
        this.logInfo(`Procesando hora de contacto: ${messageText} para póliza: ${numeroPoliza}`, {
            chatId,
            threadId
        });
        const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
        if (!timeRegex.test(messageText)) {
            return await ctx.reply('⚠️ Formato de hora inválido. Debe ser HH:mm (24 horas).\n' +
                'Ejemplos válidos: 09:30, 14:45, 23:15');
        }
        try {
            const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
            if (!serviceInfo) {
                this.logError(`No se encontró info de servicio para póliza: ${numeroPoliza}`);
                this.awaitingContactTime.delete(chatId, threadId);
                return await ctx.reply('❌ Error al procesar la hora. Operación cancelada.');
            }
            if (!serviceInfo.expediente) {
                this.logInfo('No se encontró expediente para la notificación, generando uno genérico');
                serviceInfo.expediente = `EXP-${new Date().toISOString().slice(0, 10)}`;
            }
            serviceInfo.contactTime = messageText;
            const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);
            this.logInfo(`Info de servicio actualizada con hora=${messageText}: ${serviceStore ? 'OK' : 'FALLO'}`);
            const today = new Date();
            const dayButtons = [];
            dayButtons.push([
                telegraf_1.Markup.button.callback('Hoy', `selectDay:0:${numeroPoliza}`),
                telegraf_1.Markup.button.callback('Mañana', `selectDay:1:${numeroPoliza}`)
            ]);
            const dayNames = [
                'Domingo',
                'Lunes',
                'Martes',
                'Miércoles',
                'Jueves',
                'Viernes',
                'Sábado'
            ];
            let nextDaysRow = [];
            for (let i = 2; i <= 6; i++) {
                const futureDate = new Date(today);
                futureDate.setDate(futureDate.getDate() + i);
                const dayName = dayNames[futureDate.getDay()];
                const dateStr = `${futureDate.getDate()}/${futureDate.getMonth() + 1}`;
                nextDaysRow.push(telegraf_1.Markup.button.callback(`${dayName} ${dateStr}`, `selectDay:${i}:${numeroPoliza}`));
                if (nextDaysRow.length === 2 || i === 6) {
                    dayButtons.push([...nextDaysRow]);
                    nextDaysRow = [];
                }
            }
            dayButtons.push([
                telegraf_1.Markup.button.callback('❌ Cancelar', `cancelSelectDay:${numeroPoliza}`)
            ]);
            await ctx.reply(`✅ Hora registrada: *${messageText}*\n\n` +
                '📅 ¿Para qué día programar la alerta de contacto?', {
                parse_mode: 'Markdown',
                ...telegraf_1.Markup.inlineKeyboard(dayButtons)
            });
            return true;
        }
        catch (error) {
            this.logError(`Error al procesar hora de contacto para póliza ${numeroPoliza}:`, error);
            this.awaitingContactTime.delete(chatId, threadId);
            await ctx.reply('❌ Error al procesar la hora de contacto. Operación cancelada.');
            return true;
        }
    }
    cleanupAllStates(chatId, threadId = null) {
        if (threadId) {
            this.pendingLeyendas.delete(chatId, threadId);
            this.polizaCache.delete(chatId, threadId);
            this.messageIds.delete(chatId, threadId);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            this.awaitingOrigenDestino.delete(chatId, threadId);
            this.awaitingContactTime.delete(chatId, threadId);
            this.scheduledServiceInfo.delete(chatId, threadId);
            if (this.handler && typeof this.handler.clearChatState === 'function') {
                this.logInfo('Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates', { chatId, threadId });
                this.handler.clearChatState(chatId, threadId);
            }
            else {
                this.logWarn('No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback');
            }
        }
        else {
            this.pendingLeyendas.deleteAll(chatId);
            this.polizaCache.deleteAll(chatId);
            this.messageIds.deleteAll(chatId);
            this.awaitingPhoneNumber.deleteAll(chatId);
            this.awaitingOrigenDestino.deleteAll(chatId);
            this.awaitingContactTime.deleteAll(chatId);
            this.scheduledServiceInfo.deleteAll(chatId);
            if (this.handler && typeof this.handler.clearChatState === 'function') {
                this.logInfo('Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates (sin threadId)', { chatId });
                this.handler.clearChatState(chatId, null);
            }
            else {
                this.logWarn('No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback (sin threadId)');
            }
        }
    }
}
exports.default = OcuparPolizaCallback;
