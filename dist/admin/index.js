"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../utils/logger"));
const adminMenu_1 = __importDefault(require("./menus/adminMenu"));
const adminAuth_1 = __importDefault(require("./middleware/adminAuth"));
const policyHandler_1 = __importDefault(require("./handlers/policyHandler"));
const serviceHandler_1 = __importDefault(require("./handlers/serviceHandler"));
const databaseHandler_1 = __importDefault(require("./handlers/databaseHandler"));
const reportsHandler_1 = __importDefault(require("./handlers/reportsHandler"));
const simpleScriptsHandler_1 = __importDefault(require("./handlers/simpleScriptsHandler"));
class AdminModule {
    constructor(bot) {
        this.bot = bot;
        this.handlers = {
            policy: policyHandler_1.default,
            service: serviceHandler_1.default,
            database: databaseHandler_1.default,
            reports: reportsHandler_1.default,
            scripts: new simpleScriptsHandler_1.default()
        };
    }
    initialize() {
        logger_1.default.info('Inicializando módulo de administración');
        this.bot.use(adminAuth_1.default.middleware);
        this.registerCallbackHandlers();
        this.registerCommands();
        logger_1.default.info('Módulo de administración inicializado correctamente');
    }
    registerCallbackHandlers() {
        this.bot.action('admin_menu', adminAuth_1.default.requireAdmin, (ctx) => {
            return adminMenu_1.default.showMainMenu(ctx);
        });
        this.bot.action(/^admin_policy_select:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handlePolicySelection(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al seleccionar póliza:', error);
                await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
            }
        });
        this.bot.action(/^admin_policy_delete_confirm:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleDeleteConfirmation(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al confirmar eliminación:', error);
                await ctx.answerCbQuery('Error al procesar eliminación', { show_alert: true });
            }
        });
        this.bot.action(/^admin_policy_restore_confirm:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleRestoreConfirmation(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al restaurar póliza:', error);
                await ctx.answerCbQuery('Error al restaurar póliza', { show_alert: true });
            }
        });
        this.bot.action(/^admin_policy_restore_execute:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleRestoreExecution(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al ejecutar restauración:', error);
                await ctx.answerCbQuery('Error al restaurar póliza', { show_alert: true });
            }
        });
        this.bot.action(/^admin_policy_edit_categories:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showEditCategoriesMenu(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar menú de categorías:', error);
                await ctx.answerCbQuery('Error al cargar menú de edición', {
                    show_alert: true
                });
            }
        });
        this.bot.action(/^admin_edit_personal:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showPersonalDataEdit(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar datos personales:', error);
                await ctx.answerCbQuery('Error al cargar datos personales', { show_alert: true });
            }
        });
        this.bot.action(/^admin_edit_address:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showAddressEdit(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar datos de domicilio:', error);
                await ctx.answerCbQuery('Error al cargar datos de domicilio', { show_alert: true });
            }
        });
        this.bot.action(/^admin_edit_vehicle:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showVehicleEdit(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar datos del vehículo:', error);
                await ctx.answerCbQuery('Error al cargar datos del vehículo', { show_alert: true });
            }
        });
        this.bot.action(/^admin_edit_policy:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showPolicyDataEdit(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar datos de póliza:', error);
                await ctx.answerCbQuery('Error al cargar datos de póliza', { show_alert: true });
            }
        });
        this.bot.action(/^admin_edit_financial:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showFinancialEdit(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar datos financieros:', error);
                await ctx.answerCbQuery('Error al cargar datos financieros', { show_alert: true });
            }
        });
        this.bot.action(/^admin_edit_field:([^:]+):(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const fieldName = ctx.match[1];
            const policyId = ctx.match[2];
            try {
                await this.handlers.policy.startFieldEdit(ctx, fieldName, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al iniciar edición de campo:', error);
                await ctx.answerCbQuery('Error al iniciar edición', { show_alert: true });
            }
        });
        this.bot.action(/^admin_confirm_edit:([^:]+):(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            const fieldName = ctx.match[2];
            try {
                await this.handlers.policy.executeFieldChange(ctx, policyId, fieldName);
            }
            catch (error) {
                logger_1.default.error('Error al confirmar cambio:', error);
                await ctx.answerCbQuery('Error al confirmar cambio', { show_alert: true });
            }
        });
        this.registerPolicyMassOperationsCallbacks();
        this.registerServiceCallbacks();
        this.registerReportsCallbacks();
        this.registerDatabaseCallbacks();
        this.registerGenericCallbacks();
    }
    registerPolicyMassOperationsCallbacks() {
        this.bot.action('admin_mass_selection', adminAuth_1.default.requireAdmin, async (ctx) => {
            try {
                await this.handlers.policy.showMassSelectionInterface(ctx);
            }
            catch (error) {
                logger_1.default.error('Error al mostrar interfaz de selección masiva:', error);
                await ctx.answerCbQuery('Error al cargar interfaz de selección', {
                    show_alert: true
                });
            }
        });
        this.bot.action('admin_mass_selection:cancelled', adminAuth_1.default.requireAdmin, async (ctx) => {
            try {
                await this.handlers.policy.cancelMassDeletion(ctx);
            }
            catch (error) {
                logger_1.default.error('Error al cancelar eliminación masiva:', error);
                await ctx.answerCbQuery('Error al cancelar', { show_alert: true });
            }
        });
    }
    registerServiceCallbacks() {
        this.bot.action(/^admin_service_select:(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.service.handlePolicySelection(ctx, policyId);
            }
            catch (error) {
                logger_1.default.error('Error al seleccionar póliza para servicios:', error);
                await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
            }
        });
    }
    registerReportsCallbacks() {
        this.bot.action('admin_reports_monthly_current', adminAuth_1.default.requireAdmin, async (ctx) => {
            try {
                const now = new Date();
                const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const period = `${this.handlers.reports.formatMonth(startDate)}`;
                await this.handlers.reports.generateMonthlyReportForPeriod(ctx, startDate, endDate, period);
            }
            catch (error) {
                logger_1.default.error('Error al generar reporte mensual actual:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });
    }
    registerDatabaseCallbacks() {
        this.bot.action('admin_database_export', adminAuth_1.default.requireAdmin, async (ctx) => {
            try {
                await this.handlers.scripts.handleExportExcel(ctx);
            }
            catch (error) {
                logger_1.default.error('Error al exportar Excel:', error);
                await ctx.answerCbQuery('Error al exportar Excel', { show_alert: true });
            }
        });
    }
    registerGenericCallbacks() {
        this.bot.action(/^admin_(.+)$/, adminAuth_1.default.requireAdmin, async (ctx) => {
            const action = ctx.match[1];
            const [module, ...params] = action.split('_');
            try {
                if (this.handlers[module]) {
                    await this.handlers[module].handleAction(ctx, params.join('_'));
                }
                else {
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
                }
            }
            catch (error) {
                logger_1.default.error('Error en callback admin:', error);
                await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
            }
        });
        this.bot.on('text', async (ctx, next) => {
            logger_1.default.info('🔍 [ADMIN-DEBUG] Mensaje de texto recibido', {
                text: ctx.message.text,
                userId: ctx.from.id,
                chatId: ctx.chat.id
            });
            try {
                const adminState = require('./utils/adminStates').getAdminState(ctx.from.id, ctx.chat.id);
                logger_1.default.info('🔍 [ADMIN-DEBUG] Estado admin actual:', adminState);
                if (ctx.message.text.startsWith('/')) {
                    logger_1.default.info('🔍 [ADMIN-DEBUG] Comando detectado, priorizando sobre estado admin');
                    return next();
                }
                let handled = await this.handlers.policy.handleTextMessage(ctx);
                logger_1.default.info('🔍 [ADMIN-DEBUG] Procesado por policy handler:', handled);
                if (!handled) {
                    handled = await this.handlers.service.handleTextMessage(ctx);
                    logger_1.default.info('🔍 [ADMIN-DEBUG] Procesado por service handler:', handled);
                }
                if (!handled) {
                    logger_1.default.info('🔍 [ADMIN-DEBUG] No procesado por admin, pasando a next()');
                    return next();
                }
                logger_1.default.info('🔍 [ADMIN-DEBUG] Mensaje procesado por admin exitosamente');
            }
            catch (error) {
                logger_1.default.error('🔍 [ADMIN-DEBUG] Error al procesar mensaje:', error);
                logger_1.default.error('Error al procesar mensaje de texto en admin:', error);
                return next();
            }
        });
    }
    registerCommands() {
        this.bot.command('admin', adminAuth_1.default.requireAdmin, (ctx) => {
            return adminMenu_1.default.showMainMenu(ctx);
        });
    }
}
exports.default = AdminModule;
