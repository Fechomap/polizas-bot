"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
const VehicleRegistrationHandler_1 = require("./VehicleRegistrationHandler");
const PolicyAssignmentHandler_1 = require("./PolicyAssignmentHandler");
const teclados_1 = require("../teclados");
const StateKeyManager_1 = __importDefault(require("../../utils/StateKeyManager"));
class BaseAutosCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
    }
    getCommandName() {
        return 'base_autos';
    }
    getDescription() {
        return 'Base de Datos de Autos - Registro y Asignación de Pólizas';
    }
    register() {
        this.bot.action('accion:base_autos', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const mensaje = '🚗 *BASE DE AUTOS*\n\n' + 'Selecciona tu rol:';
                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    ...(0, teclados_1.getBaseAutosKeyboard)()
                });
                this.logInfo('Menú Base de Autos mostrado', {
                    chatId: ctx.chat?.id,
                    userId: ctx.from?.id
                });
            }
            catch (error) {
                this.logError('Error en accion:base_autos:', error);
                await ctx.reply('❌ Error al mostrar el menú de Base de Autos.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action('base_autos:registrar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                await ctx.deleteMessage();
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }
                if (VehicleRegistrationHandler_1.VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId)) {
                    await ctx.reply('⚠️ Ya tienes un registro en proceso. Completalo o cancelalo primero.');
                    return;
                }
                await VehicleRegistrationHandler_1.VehicleRegistrationHandler.iniciarRegistro(this.bot, chatId, userId, threadId);
                this.logInfo('Registro de vehículo iniciado', {
                    chatId,
                    userId
                });
            }
            catch (error) {
                this.logError('Error iniciando registro de vehículo:', error);
                await ctx.reply('❌ Error al iniciar el registro.');
            }
        });
        this.bot.action('base_autos:asegurar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                await ctx.deleteMessage();
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }
                if (PolicyAssignmentHandler_1.PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)) {
                    await ctx.reply('⚠️ Ya tienes una asignación en proceso. Completala o cancelala primero.');
                    return;
                }
                await PolicyAssignmentHandler_1.PolicyAssignmentHandler.mostrarVehiculosDisponibles(this.bot, chatId, userId, threadId);
                this.logInfo('Lista de vehículos para asegurar mostrada', {
                    chatId,
                    userId
                });
            }
            catch (error) {
                this.logError('Error mostrando vehículos para asegurar:', error);
                await ctx.reply('❌ Error al mostrar vehículos disponibles.');
            }
        });
        this.bot.action('accion:volver_menu', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const mensaje = '🤖 **Bot de Pólizas** - Menú Principal\n\nSelecciona una categoría:';
                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    ...(0, teclados_1.getMainKeyboard)()
                });
            }
            catch (error) {
                this.logError('Error volviendo al menú principal:', error);
                await ctx.reply('❌ Error al volver al menú.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action(/^asignar_(.+)$/, async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const vehicleId = ctx.match?.[1];
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                if (!vehicleId || !userId || !chatId) {
                    await ctx.reply('❌ Error: Datos incompletos para la asignación.');
                    return;
                }
                await ctx.deleteMessage();
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                await PolicyAssignmentHandler_1.PolicyAssignmentHandler.iniciarAsignacion(this.bot, chatId, userId, vehicleId, threadId);
                this.logInfo('Asignación de póliza iniciada', {
                    chatId,
                    userId,
                    vehicleId
                });
            }
            catch (error) {
                this.logError('Error iniciando asignación de póliza:', error);
                await ctx.reply('❌ Error al iniciar la asignación de póliza.');
            }
        });
        this.bot.action(/^vehiculos_pag_(\d+)$/, async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const pagina = parseInt(ctx.match?.[1] || '1');
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }
                await ctx.deleteMessage();
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                await PolicyAssignmentHandler_1.PolicyAssignmentHandler.mostrarVehiculosDisponibles(this.bot, chatId, userId, threadId, pagina);
            }
            catch (error) {
                this.logError('Error en paginación de vehículos:', error);
                await ctx.reply('❌ Error al cargar la página.');
            }
        });
        this.bot.action('vehiculo_cancelar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }
                VehicleRegistrationHandler_1.VehicleRegistrationHandler.cancelarRegistro(userId, chatId, threadId);
                await ctx.editMessageText('❌ Registro de vehículo cancelado.', {
                    reply_markup: (0, teclados_1.getMainKeyboard)()
                });
                this.logInfo('Registro de vehículo cancelado', { userId });
            }
            catch (error) {
                this.logError('Error cancelando registro de vehículo:', error);
                await ctx.reply('❌ Error al cancelar.');
            }
        });
        this.bot.action('vehiculo_finalizar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }
                const { vehiculosEnProceso } = require('./VehicleRegistrationHandler');
                const stateKey = `${userId}:${StateKeyManager_1.default.getContextKey(chatId, threadId)}`;
                const registro = vehiculosEnProceso?.get(stateKey);
                if (!registro) {
                    await ctx.reply('❌ No hay registro en proceso.');
                    return;
                }
                const resultado = await VehicleRegistrationHandler_1.VehicleRegistrationHandler.finalizarRegistro(this.bot, chatId, userId, registro, stateKey);
                if (resultado) {
                    await ctx.deleteMessage();
                }
                this.logInfo('Registro de vehículo finalizado', { userId });
            }
            catch (error) {
                this.logError('Error finalizando registro de vehículo:', error);
                await ctx.reply('❌ Error al finalizar.');
            }
        });
        this.bot.action('poliza_cancelar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from?.id?.toString();
                if (!userId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario.');
                    return;
                }
                const { asignacionesEnProceso } = require('./PolicyAssignmentHandler');
                if (asignacionesEnProceso) {
                    asignacionesEnProceso.delete(userId);
                }
                await ctx.editMessageText('❌ Asignación de póliza cancelada.', {
                    reply_markup: (0, teclados_1.getMainKeyboard)()
                });
                this.logInfo('Asignación de póliza cancelada', { userId });
            }
            catch (error) {
                this.logError('Error cancelando asignación de póliza:', error);
                await ctx.reply('❌ Error al cancelar.');
            }
        });
        this.bot.action(/^fecha_emision_(.+)$/, async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const fechaISO = ctx.match?.[1];
                const userId = ctx.from?.id?.toString();
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager_1.default.getThreadId(ctx);
                if (!fechaISO || !userId || !chatId) {
                    await ctx.reply('❌ Error: Datos incompletos para la fecha.');
                    return;
                }
                const { asignacionesEnProceso } = require('./PolicyAssignmentHandler');
                const stateKey = `${userId}:${StateKeyManager_1.default.getContextKey(chatId, threadId)}`;
                const asignacion = asignacionesEnProceso.get(stateKey);
                if (!asignacion) {
                    await ctx.reply('❌ No hay asignación de póliza en proceso.');
                    return;
                }
                await ctx.deleteMessage();
                await PolicyAssignmentHandler_1.PolicyAssignmentHandler.confirmarFechaEmision(this.bot, chatId, fechaISO, asignacion, stateKey);
                this.logInfo('Fecha de emisión seleccionada', {
                    userId,
                    chatId,
                    fechaISO
                });
            }
            catch (error) {
                this.logError('Error procesando selección de fecha:', error);
                await ctx.reply('❌ Error al procesar la fecha.');
            }
        });
        this.logInfo('BaseAutosCommand registrado exitosamente');
    }
    async procesarMensajeBaseAutos(message, userId) {
        try {
            const chatId = message.chat.id;
            const threadId = message.message_thread_id || null;
            if (VehicleRegistrationHandler_1.VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId)) {
                const procesado = await VehicleRegistrationHandler_1.VehicleRegistrationHandler.procesarMensaje(this.bot, message, userId);
                if (procesado)
                    return true;
            }
            if (PolicyAssignmentHandler_1.PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)) {
                const procesado = await PolicyAssignmentHandler_1.PolicyAssignmentHandler.procesarMensaje(this.bot, message, userId);
                if (procesado &&
                    !PolicyAssignmentHandler_1.PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)) {
                    const handlerWithRegistry = this.handler;
                    if (handlerWithRegistry?.registry?.stateManager) {
                        await handlerWithRegistry.registry.stateManager.clearUserState(userId, 'bd_autos_flow');
                    }
                }
                if (procesado)
                    return true;
            }
            return false;
        }
        catch (error) {
            this.logError('Error procesando mensaje en BaseAutosCommand:', error);
            return false;
        }
    }
    async procesarDocumentoBaseAutos(message, userId) {
        try {
            const chatId = message.chat.id;
            const threadId = message.message_thread_id || null;
            if (PolicyAssignmentHandler_1.PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)) {
                const procesado = await PolicyAssignmentHandler_1.PolicyAssignmentHandler.procesarMensaje(this.bot, message, userId);
                if (procesado)
                    return true;
            }
            return false;
        }
        catch (error) {
            this.logError('Error procesando documento en BaseAutosCommand:', error);
            return false;
        }
    }
}
exports.default = BaseAutosCommand;
