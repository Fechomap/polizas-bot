"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const policyController_1 = require("../controllers/policyController");
const logger_1 = __importDefault(require("../utils/logger"));
const StateKeyManager = require('../utils/StateKeyManager');
const threadValidatorMiddleware = require('../middleware/threadValidator');
const Policy = require('../models/policy');
const { CommandRegistry, StartCommand, GetCommand, ViewFilesCallbacks, TextMessageHandler, MediaUploadHandler, HelpCommand, OcuparPolizaCallback, TestCommand, ExcelUploadHandler, AddPaymentCommand, AddServiceCommand, SaveCommand, DeleteCommand, PaymentReportPDFCommand, PaymentReportExcelCommand, ReportUsedCommand, NotificationCommand, BaseAutosCommand } = require('./comandos');
const DocumentHandler = require('./comandos/documentHandler');
class CommandHandler {
    constructor(bot) {
        if (!bot) {
            throw new Error('Bot instance is required');
        }
        this.bot = bot;
        this.registry = new (require('./comandos/CommandRegistry'))();
        this.uploadTargets = StateKeyManager.createThreadSafeStateMap();
        this.awaitingSaveData = StateKeyManager.createThreadSafeStateMap();
        this.awaitingGetPolicyNumber = StateKeyManager.createThreadSafeStateMap();
        this.awaitingUploadPolicyNumber = StateKeyManager.createThreadSafeStateMap();
        this.awaitingDeletePolicyNumber = StateKeyManager.createThreadSafeStateMap();
        this.awaitingPaymentPolicyNumber = StateKeyManager.createThreadSafeStateMap();
        this.awaitingPaymentData = StateKeyManager.createThreadSafeStateMap();
        this.awaitingServicePolicyNumber = StateKeyManager.createThreadSafeStateMap();
        this.awaitingServiceData = StateKeyManager.createThreadSafeStateMap();
        this.awaitingPhoneNumber = StateKeyManager.createThreadSafeStateMap();
        this.awaitingOrigenDestino = StateKeyManager.createThreadSafeStateMap();
        this.awaitingDeleteReason = StateKeyManager.createThreadSafeStateMap();
        this.awaitingOrigen = StateKeyManager.createThreadSafeStateMap();
        this.awaitingDestino = StateKeyManager.createThreadSafeStateMap();
        this.excelUploadMessages = new Map();
        this.startCommandInstance = null;
        this.helpCommandInstance = null;
        this.bot.use(threadValidatorMiddleware(this));
        this.setupGroupRestriction();
        this.registerCommands();
    }
    setupGroupRestriction() {
        logger_1.default.info('Group restrictions disabled for testing');
    }
    registerCommands() {
        this.startCommandInstance = new StartCommand(this);
        this.registry.registerCommand(this.startCommandInstance);
        this.startCommandInstance.register();
        const getCmd = new GetCommand(this);
        this.registry.registerCommand(getCmd);
        getCmd.register();
        const mediaCmd = new MediaUploadHandler(this);
        this.registry.registerCommand(mediaCmd);
        mediaCmd.register();
        this.helpCommandInstance = new HelpCommand(this);
        this.registry.registerCommand(this.helpCommandInstance);
        this.helpCommandInstance.register();
        const ocuparCmd = new OcuparPolizaCallback(this);
        this.registry.registerCommand(ocuparCmd);
        ocuparCmd.register();
        const testCmd = new TestCommand(this);
        this.registry.registerCommand(testCmd);
        testCmd.register();
        const addPaymentCmd = new AddPaymentCommand(this);
        this.registry.registerCommand(addPaymentCmd);
        addPaymentCmd.register();
        const addServiceCmd = new AddServiceCommand(this);
        this.registry.registerCommand(addServiceCmd);
        addServiceCmd.register();
        const saveCmd = new SaveCommand(this);
        this.registry.registerCommand(saveCmd);
        saveCmd.register();
        const deleteCmd = new DeleteCommand(this);
        this.registry.registerCommand(deleteCmd);
        deleteCmd.register();
        const paymentReportPDFCmd = new PaymentReportPDFCommand(this);
        this.registry.registerCommand(paymentReportPDFCmd);
        const reportUsedCmd = new ReportUsedCommand(this);
        this.registry.registerCommand(reportUsedCmd);
        reportUsedCmd.register();
        const notificationCmd = new NotificationCommand(this);
        this.registry.registerCommand(notificationCmd);
        notificationCmd.register();
        const excelUploadCmd = new ExcelUploadHandler(this);
        this.registry.registerCommand(excelUploadCmd);
        excelUploadCmd.register();
        const baseAutosCmd = new BaseAutosCommand(this);
        this.registry.registerCommand(baseAutosCmd);
        baseAutosCmd.register();
        const documentHandler = new DocumentHandler(this.bot, this);
        documentHandler.setHandlers(excelUploadCmd, mediaCmd);
        documentHandler.register();
        const viewFilesCallbacks = new ViewFilesCallbacks(this);
        this.registry.registerCommand(viewFilesCallbacks);
        viewFilesCallbacks.register();
        new TextMessageHandler(this).register();
        this.setupRemainingCommands();
        this.setupCallbacks();
        this.setupActionHandlers();
    }
    setupActionHandlers() {
        logger_1.default.info('Configurando manejadores de acciones principales...');
        this.bot.action('accion:volver_menu', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const threadId = StateKeyManager.getThreadId(ctx);
                this.clearChatState(ctx.chat.id, threadId);
                try {
                    const AdminStateManager = require('../admin/utils/adminStates');
                    AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
                }
                catch (error) {
                    logger_1.default.debug('Módulo admin no disponible para limpieza de estado');
                }
                await this.startCommandInstance.showMainMenu(ctx);
            }
            catch (error) {
                logger_1.default.error('Error en accion:volver_menu:', error);
                await ctx.reply('❌ Error al volver al menú.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action('accion:polizas', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const polizasMenu = telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback('🔍 Consultar Póliza', 'accion:consultar')],
                    [telegraf_1.Markup.button.callback('💾 Registrar Póliza', 'accion:registrar')],
                    [telegraf_1.Markup.button.callback('💰 Añadir Pago', 'accion:addpayment')],
                    [telegraf_1.Markup.button.callback('🚗 Añadir Servicio', 'accion:addservice')],
                    [telegraf_1.Markup.button.callback('📁 Subir Archivos', 'accion:upload')],
                    [telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                ]);
                await ctx.editMessageText('📋 **GESTIÓN DE PÓLIZAS**\n\nSelecciona la acción que deseas realizar:', { parse_mode: 'Markdown', ...polizasMenu });
            }
            catch (error) {
                logger_1.default.error('Error en accion:polizas:', error);
                await ctx.reply('❌ Error al mostrar el menú de pólizas.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action('accion:administracion', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const adminMenu = telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback('🔧 Panel de Administración', 'admin_menu')],
                    [telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                ]);
                await ctx.editMessageText('🔧 **ADMINISTRACIÓN**\n\n' +
                    'Accede al sistema completo de administración para gestionar pólizas, servicios y base de datos.\n\n' +
                    '🔒 *Requiere permisos de administrador.*', { parse_mode: 'Markdown', ...adminMenu });
            }
            catch (error) {
                logger_1.default.error('Error en accion:administracion:', error);
                await ctx.reply('❌ Error al mostrar el menú de administración.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.setupMoreActionHandlers();
        logger_1.default.info('✅ Manejadores de acciones principales configurados.');
    }
    setupMoreActionHandlers() {
        this.bot.action([
            'accion:editar_poliza',
            'accion:editar_servicio',
            'accion:editar_expediente',
            'accion:gestion_bd'
        ], async (ctx) => {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('🚧 **Función en Desarrollo**\n\n' +
                    'Esta característica estará disponible próximamente.\n' +
                    'Incluirá edición completa de:\n' +
                    '• Datos de póliza\n' +
                    '• Información de servicios\n' +
                    '• Detalles de expedientes\n' +
                    '• Gestión avanzada de base de datos', {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        [
                            telegraf_1.Markup.button.callback('⬅️ Volver a Administración', 'accion:administracion')
                        ],
                        [telegraf_1.Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
                    ])
                });
            }
            catch (error) {
                logger_1.default.error('Error en función en construcción:', error);
                await ctx.reply('❌ Error al mostrar información.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.setupPolicyActionHandlers();
        this.setupReportActionHandlers();
        this.setupCallbackHandlers();
    }
    setupPolicyActionHandlers() {
        this.bot.action('accion:consultar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                logger_1.default.info(`Iniciando acción consultar en chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                this.clearChatState(chatId, threadId);
                const setResult = this.awaitingGetPolicyNumber.set(chatId, true, threadId);
                logger_1.default.info(`Estado de espera de póliza guardado: ${setResult ? 'OK' : 'FALLO'}`);
                const hasResult = this.awaitingGetPolicyNumber.has(chatId, threadId);
                logger_1.default.info(`Verificación inmediata después de guardar: ${hasResult ? 'OK' : 'FALLO'}`);
                await ctx.reply('🔍 Por favor, introduce el número de póliza que deseas consultar:');
                logger_1.default.info('Solicitud de número de póliza enviada');
            }
            catch (error) {
                logger_1.default.error('Error en accion:consultar:', error);
                await ctx.reply('❌ Error al iniciar la consulta.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action('accion:registrar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const threadId = StateKeyManager.getThreadId(ctx);
                this.clearChatState(ctx.chat.id, threadId);
                const excelUploadCmd = this.registry.getCommand('excelUpload');
                if (!excelUploadCmd) {
                    logger_1.default.error('ExcelUploadHandler no encontrado en registry');
                    throw new Error('ExcelUploadHandler no encontrado');
                }
                logger_1.default.info(`Activando flujo de subida de Excel para chatId: ${ctx.chat.id}`);
                excelUploadCmd.setAwaitingExcelUpload(ctx.chat.id, true);
                const excelMessage = await ctx.reply('📊 *Registro de Pólizas por Excel*\n\n' +
                    'Por favor, sube un archivo Excel (.xlsx) con las pólizas a registrar.', {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        telegraf_1.Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                    ])
                });
                this.excelUploadMessages.set(ctx.chat.id, excelMessage.message_id);
                logger_1.default.info(`Flujo de subida de Excel iniciado para chatId: ${ctx.chat.id}`);
            }
            catch (error) {
                logger_1.default.error('Error en accion:registrar:', error);
                await ctx.reply('❌ Error al iniciar el registro.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action('accion:cancelar_registro', async (ctx) => {
            try {
                await ctx.answerCbQuery('Registro cancelado');
                const excelUploadCmd = this.registry.getCommand('excelUpload');
                if (excelUploadCmd) {
                    excelUploadCmd.setAwaitingExcelUpload(ctx.chat.id, false);
                }
                const threadId = StateKeyManager.getThreadId(ctx);
                this.clearChatState(ctx.chat.id, threadId);
                this.excelUploadMessages.delete(ctx.chat.id);
                await ctx.editMessageText('Registro cancelado.');
            }
            catch (error) {
                logger_1.default.error('Error en accion:cancelar_registro:', error);
                try {
                    await ctx.answerCbQuery('Error al cancelar');
                }
                catch { }
            }
        });
        this.setupMorePolicyHandlers();
    }
    setupMorePolicyHandlers() {
        this.bot.action('accion:addpayment', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                this.clearChatState(chatId, threadId);
                this.awaitingPaymentPolicyNumber.set(chatId, true, threadId);
                await ctx.reply('💰 Introduce el número de póliza para añadir el pago:');
            }
            catch (error) {
                logger_1.default.error('Error en accion:addpayment:', error);
                await ctx.reply('❌ Error al iniciar el registro de pago.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
    }
    setupReportActionHandlers() {
        this.bot.action('accion:reportes', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('📊 **REPORTES Y ESTADÍSTICAS**\n\nSelecciona el tipo de reporte:', {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        [
                            telegraf_1.Markup.button.callback('💰 Pagos Pendientes (Lista)', 'accion:reportPayment')
                        ],
                        [
                            telegraf_1.Markup.button.callback('📄 Pagos Pendientes (PDF)', 'accion:reportPaymentPDF')
                        ],
                        [
                            telegraf_1.Markup.button.callback('🚗 Pólizas sin Servicios Recientes', 'accion:reportUsed')
                        ],
                        [telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                    ])
                });
            }
            catch (error) {
                logger_1.default.error('Error en accion:reportes:', error);
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
                await ctx.reply('❌ Error al mostrar el menú de reportes.');
            }
        });
        this.bot.action('accion:reportPaymentPDF', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const paymentReportPDFCmd = this.registry.getCommand('PaymentReportPDF');
                if (paymentReportPDFCmd &&
                    typeof paymentReportPDFCmd.generateReport === 'function') {
                    await paymentReportPDFCmd.generateReport(ctx);
                }
                else {
                    logger_1.default.warn('No se encontró el comando PaymentReportPDF o su método generateReport');
                    await ctx.reply('❌ Reporte PDF no disponible en este momento.');
                }
            }
            catch (error) {
                logger_1.default.error('Error en accion:reportPaymentPDF:', error);
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
                await ctx.reply('❌ Error al generar el reporte PDF de pagos pendientes.');
            }
        });
        this.bot.action('accion:reportUsed', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const reportUsedCmd = this.registry.getCommand('reportUsed');
                if (reportUsedCmd && typeof reportUsedCmd.generateReport === 'function') {
                    await reportUsedCmd.generateReport(ctx);
                }
                else {
                    logger_1.default.warn('No se encontró el comando reportUsed o su método generateReport');
                    await ctx.reply('❌ Reporte no disponible en este momento.');
                }
            }
            catch (error) {
                logger_1.default.error('Error en accion:reportUsed:', error);
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
                await ctx.reply('❌ Error al generar el reporte de pólizas prioritarias.');
            }
        });
        this.bot.action('accion:reportPayment', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const { getSusceptiblePolicies } = require('../controllers/policyController');
                const susceptiblePolicies = await getSusceptiblePolicies();
                if (susceptiblePolicies.length === 0) {
                    await ctx.reply('✅ No hay pólizas con pagos pendientes.');
                    return;
                }
                const reportText = susceptiblePolicies
                    .slice(0, 10)
                    .map((policy, index) => `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}`)
                    .join('\n');
                await ctx.reply(`💰 **Pólizas con Pagos Pendientes** (${susceptiblePolicies.length})\n\n${reportText}${susceptiblePolicies.length > 10 ? '\n\n...y más' : ''}`, {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        [telegraf_1.Markup.button.callback('⬅️ Volver a Reportes', 'accion:reportes')]
                    ])
                });
            }
            catch (error) {
                logger_1.default.error('Error en accion:reportPayment:', error);
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
                await ctx.reply('❌ Error al generar el reporte de pagos pendientes.');
            }
        });
        this.bot.action('accion:ver_eliminadas', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const { getDeletedPolicies } = require('../controllers/policyController');
                const deletedPolicies = await getDeletedPolicies();
                if (deletedPolicies.length === 0) {
                    await ctx.editMessageText('ℹ️ **Pólizas Eliminadas**\n\nNo hay pólizas marcadas como eliminadas.', {
                        parse_mode: 'Markdown',
                        ...telegraf_1.Markup.inlineKeyboard([
                            [
                                telegraf_1.Markup.button.callback('⬅️ Volver a Administración', 'accion:administracion')
                            ]
                        ])
                    });
                    return;
                }
                const deletedList = deletedPolicies
                    .map((policy) => `• ${policy.numeroPoliza} - ${policy.titular}`)
                    .join('\n');
                await ctx.editMessageText(`📋 **Pólizas Eliminadas** (${deletedPolicies.length})\n\n${deletedList}`, {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        [
                            telegraf_1.Markup.button.callback('⬅️ Volver a Administración', 'accion:administracion')
                        ]
                    ])
                });
            }
            catch (error) {
                logger_1.default.error('Error en accion:ver_eliminadas:', error);
                await ctx.reply('❌ Error al mostrar pólizas eliminadas.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
        this.bot.action('accion:base_autos', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                const baseAutosCmd = this.registry.getCommand('baseAutos');
                if (baseAutosCmd && typeof baseAutosCmd.showMenu === 'function') {
                    await baseAutosCmd.showMenu(ctx);
                }
                else {
                    logger_1.default.warn('No se encontró el comando baseAutos o su método showMenu');
                    await ctx.reply('❌ Base de Autos no disponible en este momento.');
                }
            }
            catch (error) {
                logger_1.default.error('Error en accion:base_autos:', error);
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
                await ctx.reply('❌ Error al mostrar la Base de Autos.');
            }
        });
    }
    setupCallbackHandlers() {
        this.bot.action(/ocuparPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                logger_1.default.info(`Iniciando acción ocuparPoliza para ${numeroPoliza} en chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
                const beforeStates = this.verifyAllMaps(chatId, threadId);
                logger_1.default.debug(`Estados antes de ocuparPoliza: ${JSON.stringify(beforeStates)}`);
                const ocuparPolizaCmd = this.registry.getCommand('ocuparPoliza');
                if (ocuparPolizaCmd && typeof ocuparPolizaCmd.handleOcuparPoliza === 'function') {
                    await ocuparPolizaCmd.handleOcuparPoliza(ctx, numeroPoliza);
                }
                else {
                    await ctx.reply(`❌ Error al procesar la ocupación de póliza ${numeroPoliza}.`);
                }
                const afterStates = this.verifyAllMaps(chatId, threadId);
                logger_1.default.debug(`Estados después de ocuparPoliza: ${JSON.stringify(afterStates)}`);
                await ctx.answerCbQuery();
            }
            catch (error) {
                logger_1.default.error('Error en acción ocuparPoliza:', error);
                await ctx.reply('❌ Error al ocupar la póliza.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch { }
            }
        });
    }
    setupRemainingCommands() {
        this.bot.action(/getPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const threadId = StateKeyManager.getThreadId(ctx);
                logger_1.default.info(`Callback getPoliza para: ${numeroPoliza}`, { threadId });
                await this.handleGetPolicyFlow(ctx, numeroPoliza);
                await ctx.reply('Acciones adicionales:', telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                ]));
                await ctx.answerCbQuery();
            }
            catch (error) {
                logger_1.default.error('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza desde callback.');
                try {
                    await ctx.answerCbQuery('Error');
                }
                catch {
                }
            }
        });
    }
    setupCallbacks() {
        logger_1.default.info('Configurando callbacks registrados...');
        const callbackHandlers = this.registry.getCallbackHandlers();
        callbackHandlers.forEach((handler, pattern) => {
            logger_1.default.info(`Conectando callback: ${pattern}`);
            this.bot.action(pattern, async (ctx) => {
                try {
                    await handler(ctx);
                }
                catch (error) {
                    logger_1.default.error(`Error en callback ${pattern}:`, error);
                    await ctx.reply('❌ Error al procesar la acción.');
                    try {
                        await ctx.answerCbQuery('Error');
                    }
                    catch {
                    }
                }
            });
        });
        logger_1.default.info(`✅ ${callbackHandlers.size} callbacks de módulos conectados al bot`);
    }
    clearChatState(chatId, threadId = null) {
        logger_1.default.debug(`Limpiando estado para chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
        if (threadId) {
            this.uploadTargets.delete(chatId, threadId);
            this.awaitingSaveData.delete(chatId, threadId);
            this.awaitingGetPolicyNumber.delete(chatId, threadId);
            this.awaitingUploadPolicyNumber.delete(chatId, threadId);
            this.awaitingDeletePolicyNumber.delete(chatId, threadId);
            this.awaitingPaymentPolicyNumber.delete(chatId, threadId);
            this.awaitingPaymentData.delete(chatId, threadId);
            this.awaitingServicePolicyNumber.delete(chatId, threadId);
            this.awaitingServiceData.delete(chatId, threadId);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            this.awaitingOrigenDestino.delete(chatId, threadId);
            this.awaitingDeleteReason.delete(chatId, threadId);
            const flowStateManager = require('../utils/FlowStateManager');
            flowStateManager.clearAllStates(chatId, threadId);
            return;
        }
        this.uploadTargets.deleteAll(chatId);
        this.awaitingSaveData.deleteAll(chatId);
        this.awaitingGetPolicyNumber.deleteAll(chatId);
        this.awaitingUploadPolicyNumber.deleteAll(chatId);
        this.awaitingDeletePolicyNumber.deleteAll(chatId);
        this.awaitingPaymentPolicyNumber.deleteAll(chatId);
        this.awaitingPaymentData.deleteAll(chatId);
        this.awaitingServicePolicyNumber.deleteAll(chatId);
        this.awaitingServiceData.deleteAll(chatId);
        this.awaitingPhoneNumber.deleteAll(chatId);
        this.awaitingOrigenDestino.deleteAll(chatId);
        this.awaitingDeleteReason.deleteAll(chatId);
        const flowStateManager = require('../utils/FlowStateManager');
        flowStateManager.clearAllStates(chatId);
        logger_1.default.debug(`Estado completamente limpiado para chatId=${chatId}`);
    }
    verifyAllMaps(chatId, threadId = null) {
        logger_1.default.debug(`Verificando todos los mapas para chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
        const states = {
            uploadTargets: false,
            awaitingSaveData: false,
            awaitingGetPolicyNumber: false,
            awaitingUploadPolicyNumber: false,
            awaitingDeletePolicyNumber: false,
            awaitingPaymentPolicyNumber: false,
            awaitingPaymentData: false,
            awaitingServicePolicyNumber: false,
            awaitingServiceData: false,
            awaitingPhoneNumber: false,
            awaitingOrigenDestino: false,
            awaitingDeleteReason: false
        };
        if (this.uploadTargets && typeof this.uploadTargets.has === 'function')
            states.uploadTargets = this.uploadTargets.has(chatId, threadId);
        if (this.awaitingSaveData && typeof this.awaitingSaveData.has === 'function')
            states.awaitingSaveData = this.awaitingSaveData.has(chatId, threadId);
        if (this.awaitingGetPolicyNumber && typeof this.awaitingGetPolicyNumber.has === 'function')
            states.awaitingGetPolicyNumber = this.awaitingGetPolicyNumber.has(chatId, threadId);
        const activeStates = Object.entries(states)
            .filter(([_, value]) => value)
            .map(([key]) => key);
        if (activeStates.length > 0) {
            logger_1.default.debug(`Estados activos encontrados: ${activeStates.join(', ')}`, {
                chatId,
                threadId: threadId || 'ninguno'
            });
        }
        else {
            logger_1.default.debug('No se encontraron estados activos', {
                chatId,
                threadId: threadId || 'ninguno'
            });
        }
        return states;
    }
    async handleGetPolicyFlow(ctx, messageText) {
        const chatId = ctx.chat?.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        logger_1.default.info(`Ejecutando handleGetPolicyFlow para chatId=${chatId}, threadId=${threadId || 'ninguno'}`);
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            logger_1.default.info(`Buscando póliza: ${numeroPoliza}`, {
                chatId,
                threadId: threadId || 'ninguno'
            });
            const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}. Verifica e intenta de nuevo.`);
            }
            else {
                const flowStateManager = require('../utils/FlowStateManager');
                flowStateManager.saveState(chatId, numeroPoliza, {
                    active: true,
                    activeSince: new Date().toISOString()
                }, threadId);
                const servicios = policy.servicios || [];
                const totalServicios = servicios.length;
                let serviciosInfo = '\n*Servicios:* Sin servicios registrados';
                if (totalServicios > 0) {
                    const ultimoServicio = servicios[totalServicios - 1];
                    const fechaServStr = ultimoServicio.fechaServicio
                        ? new Date(ultimoServicio.fechaServicio).toISOString().split('T')[0]
                        : '??';
                    const origenDestino = ultimoServicio.origenDestino || '(Sin Origen/Destino)';
                    serviciosInfo = `
*Servicios:* ${totalServicios}
*Último Servicio:* ${fechaServStr}
*Origen/Destino:* ${origenDestino}`;
                }
                const mensaje = `
📋 *Información de la Póliza*
*Número:* ${policy.numeroPoliza}
*Titular:* ${policy.titular}
📞 *Cel:* ${policy.telefono || 'No proporcionado'}

🚗 *Datos del Vehículo:*
*Marca:* ${policy.marca}
*Submarca:* ${policy.submarca}
*Año:* ${policy.año}
*Color:* ${policy.color}
*Serie:* ${policy.serie}
*Placas:* ${policy.placas}

*Aseguradora:* ${policy.aseguradora}
*Agente:* ${policy.agenteCotizador}
${serviciosInfo}
                `.trim();
                await ctx.replyWithMarkdown(mensaje, telegraf_1.Markup.inlineKeyboard([
                    [
                        telegraf_1.Markup.button.callback('📸 Ver Fotos', `verFotos:${policy.numeroPoliza}`),
                        telegraf_1.Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`)
                    ],
                    [
                        telegraf_1.Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`)
                    ],
                    [telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                ]));
                logger_1.default.info('Información de póliza enviada', { numeroPoliza, chatId, threadId });
                this.awaitingGetPolicyNumber.delete(chatId, threadId);
            }
        }
        catch (error) {
            logger_1.default.error('Error en handleGetPolicyFlow:', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
        }
    }
    async handleSaveData(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const lines = messageText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line !== '');
            logger_1.default.info(`Número de líneas recibidas en /save: ${lines.length}`, { chatId });
            const EXPECTED_LINES = 19;
            if (lines.length < EXPECTED_LINES) {
                await ctx.reply(`❌ Los datos no están completos. Se requieren ${EXPECTED_LINES} líneas de información.\n` +
                    'Puedes corregir y reenviar la información, o cancelar.', telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                ]));
                return;
            }
            const fechaStr = lines[18];
            const fechaParts = fechaStr.split(/[/-]/);
            if (fechaParts.length !== 3) {
                await ctx.reply('❌ Formato de fecha inválido en la línea 19. Use DD/MM/YY o DD/MM/YYYY.\n' +
                    'Puedes corregir y reenviar la información, o cancelar.', telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                ]));
                return;
            }
            let [day, month, year] = fechaParts;
            if (year.length === 2) {
                year = '20' + year;
            }
            const fecha = new Date(`${year}-${month}-${day}`);
            const policyData = {
                titular: lines[0],
                correo: lines[1].toLowerCase() === 'sin correo' ? '' : lines[1],
                contraseña: lines[2],
                calle: lines[3],
                colonia: lines[4],
                municipio: lines[5],
                estado: lines[6],
                cp: lines[7],
                rfc: lines[8].toUpperCase(),
                marca: lines[9].toUpperCase(),
                submarca: lines[10].toUpperCase(),
                año: parseInt(lines[11], 10),
                color: lines[12].toUpperCase(),
                serie: lines[13].toUpperCase(),
                placas: lines[14].toUpperCase(),
                agenteCotizador: lines[15],
                aseguradora: lines[16].toUpperCase(),
                numeroPoliza: lines[17].toUpperCase(),
                fechaEmision: fecha,
                archivos: {
                    fotos: [],
                    pdfs: []
                }
            };
            if (!policyData.titular)
                throw new Error('El titular es requerido');
            if (!policyData.numeroPoliza)
                throw new Error('El número de póliza es requerido');
            if (isNaN(policyData.año))
                throw new Error('El año debe ser un número válido');
            if (!/^\d{5}$/.test(policyData.cp))
                throw new Error('El CP debe tener 5 dígitos');
            const existingPolicy = await (0, policyController_1.getPolicyByNumber)(policyData.numeroPoliza);
            if (existingPolicy) {
                await ctx.reply(`❌ La póliza con número *${policyData.numeroPoliza}* (línea 18) ya existe. No se puede duplicar.\n` +
                    'Verifica el número o cancela el registro.', telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                ]));
                return;
            }
            const { savePolicy } = require('../controllers/policyController');
            const savedPolicy = await savePolicy(policyData);
            logger_1.default.info('✅ Póliza guardada:', { numeroPoliza: savedPolicy.numeroPoliza });
            this.awaitingSaveData.delete(chatId, threadId);
            await ctx.reply('✅ Póliza guardada exitosamente:\n' + `Número: ${savedPolicy.numeroPoliza}`, telegraf_1.Markup.inlineKeyboard([
                telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
            ]));
        }
        catch (error) {
            logger_1.default.error('Error al procesar datos de póliza (handleSaveData):', error);
            await ctx.reply(`❌ Error al guardar: ${error.message}\n` +
                'Verifica los datos e intenta reenviar, o cancela.', telegraf_1.Markup.inlineKeyboard([
                telegraf_1.Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
            ]));
        }
    }
    async handleDeletePolicyFlow(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const inputText = messageText.trim();
            let polizasArray = inputText.split('\n');
            if (polizasArray.length === 1) {
                if (inputText.includes(',')) {
                    polizasArray = inputText.split(',');
                }
                else if (inputText.includes(' ')) {
                    polizasArray = inputText.split(' ');
                }
                else {
                    polizasArray = [inputText];
                }
            }
            const numeroPolizas = polizasArray
                .map(num => num.trim().toUpperCase())
                .filter(num => num.length > 0);
            if (numeroPolizas.length === 0) {
                await ctx.reply('❌ No se detectaron números de póliza válidos. Por favor, inténtalo de nuevo o cancela.');
                return;
            }
            const results = await Promise.all(numeroPolizas.map(async (num) => {
                const policy = await (0, policyController_1.getPolicyByNumber)(num);
                return { numero: num, existe: !!policy };
            }));
            const noEncontradas = results.filter(r => !r.existe);
            const encontradas = results.filter(r => r.existe).map(r => r.numero);
            if (noEncontradas.length > 0) {
                await ctx.reply('❌ Las siguientes pólizas no se encontraron y no serán procesadas:\n' +
                    `${noEncontradas.map(p => `- ${p.numero}`).join('\n')}\n\n` +
                    `${encontradas.length > 0 ? 'Se procederá con las encontradas.' : 'Ninguna póliza válida para eliminar. Proceso cancelado.'}`);
                if (encontradas.length === 0) {
                    this.awaitingDeletePolicyNumber.delete(chatId, threadId);
                    return;
                }
            }
            let mensajeConfirmacion = '';
            const esProcesoPesado = encontradas.length > 5;
            if (esProcesoPesado) {
                mensajeConfirmacion = `🔄 Se procesarán ${encontradas.length} pólizas.\n\n`;
            }
            await ctx.reply(`🗑️ Vas a marcar como ELIMINADAS ${encontradas.length} póliza(s):\n` +
                `${esProcesoPesado ? '(Mostrando las primeras 5 de ' + encontradas.length + ')\n' : ''}` +
                `${encontradas
                    .slice(0, 5)
                    .map(p => '- ' + p)
                    .join('\n')}` +
                `${esProcesoPesado ? '\n...' : ''}\n\n` +
                `${mensajeConfirmacion}` +
                'Por favor, ingresa un motivo para la eliminación (o escribe "ninguno"):', { parse_mode: 'Markdown' });
            this.awaitingDeleteReason =
                this.awaitingDeleteReason || StateKeyManager.createThreadSafeStateMap();
            this.awaitingDeleteReason.set(chatId, encontradas, threadId);
            this.awaitingDeletePolicyNumber.delete(chatId, threadId);
        }
        catch (error) {
            logger_1.default.error('Error en handleDeletePolicyFlow:', error);
            await ctx.reply('❌ Hubo un error al procesar la solicitud. Intenta nuevamente.');
            this.awaitingDeletePolicyNumber.delete(chatId, threadId);
            if (this.awaitingDeleteReason)
                this.awaitingDeleteReason.delete(chatId, threadId);
        }
    }
    async handleAddPaymentPolicyNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. Verifica el número e intenta de nuevo, o cancela.`);
            }
            else {
                this.awaitingPaymentData.set(chatId, numeroPoliza, threadId);
                await ctx.reply(`✅ Póliza *${numeroPoliza}* encontrada.\n\n` +
                    '💰 *Ingresa el pago en este formato (2 líneas):*\n' +
                    '1️⃣ Monto del pago (ejemplo: 345.00)\n' +
                    '2️⃣ Fecha de pago (DD/MM/YYYY)\n\n' +
                    '📝 Ejemplo:\n\n' +
                    '345.00\n12/01/2024', { parse_mode: 'Markdown' });
                this.awaitingPaymentPolicyNumber.delete(chatId, threadId);
            }
        }
        catch (error) {
            logger_1.default.error('Error en handleAddPaymentPolicyNumber:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
            this.awaitingPaymentPolicyNumber.delete(chatId, threadId);
            this.awaitingPaymentData.delete(chatId, threadId);
        }
    }
    async handlePaymentData(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const numeroPoliza = this.awaitingPaymentData.get(chatId, threadId);
            if (!numeroPoliza) {
                logger_1.default.warn(`Se recibieron datos de pago sin una póliza en espera para chatId: ${chatId}`);
                return await ctx.reply('❌ Hubo un problema. Por favor, inicia el proceso de añadir pago desde el menú principal.');
            }
            const lines = messageText
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);
            if (lines.length < 2) {
                return await ctx.reply('❌ Formato inválido. Debes ingresar 2 líneas: Monto y Fecha (DD/MM/YYYY)');
            }
            const montoStr = lines[0];
            const fechaStr = lines[1];
            const monto = parseFloat(montoStr.replace(',', '.'));
            if (isNaN(monto) || monto <= 0) {
                return await ctx.reply('❌ Monto inválido. Ingresa un número mayor a 0.');
            }
            const [dia, mes, anio] = fechaStr.split(/[/-]/);
            if (!dia || !mes || !anio) {
                return await ctx.reply('❌ Fecha inválida. Usa el formato DD/MM/YYYY');
            }
            const fechaJS = new Date(`${anio}-${mes}-${dia}`);
            if (isNaN(fechaJS.getTime())) {
                return await ctx.reply('❌ Fecha inválida. Verifica que sea un día, mes y año correctos.');
            }
            const { addPaymentToPolicy } = require('../controllers/policyController');
            const updatedPolicy = await addPaymentToPolicy(numeroPoliza, monto, fechaJS);
            if (!updatedPolicy) {
                return await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
            }
            await ctx.reply(`✅ Se ha registrado un pago de $${monto.toFixed(2)} con fecha ${fechaStr} en la póliza *${numeroPoliza}*.`, {
                parse_mode: 'Markdown',
                ...telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                ])
            });
            this.awaitingPaymentData.delete(chatId, threadId);
        }
        catch (error) {
            logger_1.default.error('Error en handlePaymentData:', error);
            await ctx.reply('❌ Error al procesar el pago. Verifica los datos e intenta nuevamente.');
        }
    }
    async handleAddServicePolicyNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const flowStateManager = require('../utils/FlowStateManager');
            const activeFlows = flowStateManager.getActiveFlows(chatId, threadId);
            if (activeFlows.length > 0) {
                const policyNumber = activeFlows[0].numeroPoliza;
                logger_1.default.info(`Usando póliza activa del hilo actual: ${policyNumber}`);
                const policy = await (0, policyController_1.getPolicyByNumber)(policyNumber);
                if (policy) {
                    const flowData = flowStateManager.getState(chatId, policyNumber, threadId);
                    const origenDestino = flowData?.origenDestino ||
                        (flowData?.origin && flowData?.destination
                            ? `${flowData.origin} - ${flowData.destination}`
                            : null);
                    this.awaitingServiceData.set(chatId, {
                        numeroPoliza: policyNumber,
                        origenDestino: origenDestino,
                        usarFechaActual: true
                    }, threadId);
                    if (origenDestino) {
                        await ctx.reply(`✅ Usando póliza activa *${policyNumber}* con datos existentes.\n\n` +
                            `📍 Origen/Destino: ${origenDestino}\n\n` +
                            '🚗 *Solo ingresa los siguientes datos (2 líneas):*\n' +
                            '1️⃣ Costo (ej. 550.00)\n' +
                            '2️⃣ Número de expediente\n\n' +
                            '📝 Ejemplo:\n\n' +
                            '550.00\nEXP-2025-001', { parse_mode: 'Markdown' });
                    }
                    else {
                        await ctx.reply(`✅ Usando póliza activa *${policyNumber}* de este hilo.\n\n` +
                            '🚗 *Ingresa la información del servicio (4 líneas):*\n' +
                            '1️⃣ Costo (ej. 550.00)\n' +
                            '2️⃣ Fecha del servicio (DD/MM/YYYY)\n' +
                            '3️⃣ Número de expediente\n' +
                            '4️⃣ Origen y Destino\n\n' +
                            '📝 Ejemplo:\n\n' +
                            '550.00\n06/02/2025\nEXP-2025-001\nNeza - Tecamac', { parse_mode: 'Markdown' });
                    }
                    this.awaitingServicePolicyNumber.delete(chatId, threadId);
                    return;
                }
            }
            const numeroPoliza = messageText.trim().toUpperCase();
            const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. Verifica e intenta de nuevo.`);
            }
            else {
                this.awaitingServiceData.set(chatId, numeroPoliza, threadId);
                await ctx.reply(`✅ Póliza *${numeroPoliza}* encontrada.\n\n` +
                    '🚗 *Ingresa la información del servicio (4 líneas):*\n' +
                    '1️⃣ Costo (ej. 550.00)\n' +
                    '2️⃣ Fecha del servicio (DD/MM/YYYY)\n' +
                    '3️⃣ Número de expediente\n' +
                    '4️⃣ Origen y Destino\n\n' +
                    '📝 Ejemplo:\n\n' +
                    '550.00\n06/02/2025\nEXP-2025-001\nNeza - Tecamac', { parse_mode: 'Markdown' });
                this.awaitingServicePolicyNumber.delete(chatId, threadId);
            }
        }
        catch (error) {
            logger_1.default.error('Error en handleAddServicePolicyNumber:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
            this.awaitingServicePolicyNumber.delete(chatId, threadId);
            this.awaitingServiceData.delete(chatId, threadId);
        }
    }
    async handleServiceData(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const policyData = this.awaitingServiceData.get(chatId, threadId);
            if (!policyData) {
                logger_1.default.warn(`Se recibieron datos de servicio sin una póliza en espera para chatId: ${chatId}`);
                return await ctx.reply('❌ Hubo un problema. Por favor, inicia el proceso de añadir servicio desde el menú principal.');
            }
            const numeroPoliza = typeof policyData === 'object' ? policyData.numeroPoliza : policyData;
            const origenDestinoGuardado = typeof policyData === 'object' ? policyData.origenDestino : null;
            const usarFechaActual = typeof policyData === 'object' ? policyData.usarFechaActual : false;
            const lines = messageText
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);
            const { addServiceToPolicy } = require('../controllers/policyController');
            if (usarFechaActual && origenDestinoGuardado) {
                if (lines.length < 2) {
                    return await ctx.reply('❌ Formato inválido. Debes ingresar 2 líneas:\n' +
                        '1) Costo (ej. 550.00)\n' +
                        '2) Número de Expediente');
                }
                const [costoStr, expediente] = lines;
                const costo = parseFloat(costoStr.replace(',', '.'));
                if (isNaN(costo) || costo <= 0) {
                    return await ctx.reply('❌ Costo inválido. Ingresa un número mayor a 0.');
                }
                if (!expediente || expediente.length < 3) {
                    return await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
                }
                const fechaJS = new Date();
                const origenDestino = origenDestinoGuardado;
                const flowStateManager = require('../utils/FlowStateManager');
                flowStateManager.saveState(chatId, numeroPoliza, {
                    expedienteNum: expediente
                }, threadId);
                logger_1.default.info(`Guardando número de expediente: ${expediente} para póliza: ${numeroPoliza}`, { chatId, threadId });
                const updatedPolicy = await addServiceToPolicy(numeroPoliza, costo, fechaJS, expediente, origenDestino);
                if (!updatedPolicy) {
                    return await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
                }
                const totalServicios = updatedPolicy.servicios.length;
                const servicioInsertado = updatedPolicy.servicios[totalServicios - 1];
                const numeroServicio = servicioInsertado.numeroServicio;
                const today = fechaJS;
                const fechaStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
                await ctx.reply(`✅ Se ha registrado el servicio #${numeroServicio} en la póliza *${numeroPoliza}*.\n\n` +
                    `Costo: $${costo.toFixed(2)}\n` +
                    `Fecha: ${fechaStr} (hoy)\n` +
                    `Expediente: ${expediente}\n` +
                    `Origen y Destino: ${origenDestino}`, {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ])
                });
            }
            else {
                if (lines.length < 4) {
                    return await ctx.reply('❌ Formato inválido. Debes ingresar 4 líneas:\n' +
                        '1) Costo (ej. 550.00)\n' +
                        '2) Fecha (DD/MM/YYYY)\n' +
                        '3) Número de Expediente\n' +
                        '4) Origen y Destino (ej. "Los Reyes - Tlalnepantla")');
                }
                const [costoStr, fechaStr, expediente, origenDestino] = lines;
                const costo = parseFloat(costoStr.replace(',', '.'));
                if (isNaN(costo) || costo <= 0) {
                    return await ctx.reply('❌ Costo inválido. Ingresa un número mayor a 0.');
                }
                const [dia, mes, anio] = fechaStr.split(/[/-]/);
                if (!dia || !mes || !anio) {
                    return await ctx.reply('❌ Fecha inválida. Usa el formato DD/MM/YYYY');
                }
                const fechaJS = new Date(`${anio}-${mes}-${dia}`);
                if (isNaN(fechaJS.getTime())) {
                    return await ctx.reply('❌ Fecha inválida. Verifica día, mes y año correctos.');
                }
                if (!expediente || expediente.length < 3) {
                    return await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
                }
                if (!origenDestino || origenDestino.length < 3) {
                    return await ctx.reply('❌ Origen y destino inválidos. Ingresa al menos 3 caracteres.');
                }
                const updatedPolicy = await addServiceToPolicy(numeroPoliza, costo, fechaJS, expediente, origenDestino);
                if (!updatedPolicy) {
                    return await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
                }
                const totalServicios = updatedPolicy.servicios.length;
                const servicioInsertado = updatedPolicy.servicios[totalServicios - 1];
                const numeroServicio = servicioInsertado.numeroServicio;
                await ctx.reply(`✅ Se ha registrado el servicio #${numeroServicio} en la póliza *${numeroPoliza}*.\n\n` +
                    `Costo: $${costo.toFixed(2)}\n` +
                    `Fecha: ${fechaStr}\n` +
                    `Expediente: ${expediente}\n` +
                    `Origen y Destino: ${origenDestino}`, {
                    parse_mode: 'Markdown',
                    ...telegraf_1.Markup.inlineKeyboard([
                        telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ])
                });
            }
            this.awaitingServiceData.delete(chatId, threadId);
            const ocuparPolizaCmd = this.registry.getCommand('ocuparPoliza');
            if (ocuparPolizaCmd) {
                if (ocuparPolizaCmd.awaitingContactTime) {
                    ocuparPolizaCmd.awaitingContactTime.delete(chatId);
                }
                if (typeof ocuparPolizaCmd.cleanupAllStates === 'function') {
                    ocuparPolizaCmd.cleanupAllStates(chatId, threadId);
                }
            }
        }
        catch (error) {
            logger_1.default.error('Error en handleServiceData:', error);
            await ctx.reply('❌ Error al procesar el servicio. Verifica los datos e intenta nuevamente.');
        }
    }
    async handleUploadFlow(ctx, messageText) {
        const chatId = ctx.chat.id;
        const threadId = StateKeyManager.getThreadId(ctx);
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            logger_1.default.info('Iniciando upload para póliza:', { numeroPoliza, chatId });
            const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}. Verifica e intenta de nuevo.`);
                return;
            }
            this.uploadTargets.set(chatId, numeroPoliza, threadId);
            await ctx.reply(`📤 *Subida de Archivos - Póliza ${numeroPoliza}*\n\n` +
                '📸 Puedes enviar múltiples fotos.\n' +
                '📄 También puedes enviar archivos PDF.\n\n' +
                'Cuando termines, puedes volver al menú principal.', {
                parse_mode: 'Markdown',
                ...telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                ])
            });
            this.awaitingUploadPolicyNumber.delete(chatId, threadId);
        }
        catch (error) {
            logger_1.default.error('Error en handleUploadFlow:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
            this.awaitingUploadPolicyNumber.delete(chatId, threadId);
            this.uploadTargets.delete(chatId, threadId);
        }
    }
}
exports.default = CommandHandler;
