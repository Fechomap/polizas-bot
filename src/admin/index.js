const logger = require('../utils/logger');
const adminMenu = require('./menus/adminMenu');
const adminAuth = require('./middleware/adminAuth');
const policyHandler = require('./handlers/policyHandler');
const serviceHandler = require('./handlers/serviceHandler');
const databaseHandler = require('./handlers/databaseHandler');
const reportsHandler = require('./handlers/reportsHandler');
const SimpleScriptsHandler = require('./handlers/simpleScriptsHandler');

class AdminModule {
    constructor(bot) {
        this.bot = bot;
        this.handlers = {
            policy: policyHandler,
            service: serviceHandler,
            database: databaseHandler,
            reports: reportsHandler,
            scripts: new SimpleScriptsHandler()
        };
    }

    initialize() {
        logger.info('Inicializando módulo de administración');

        // Registrar middleware de autenticación
        this.bot.use(adminAuth.middleware);

        // Registrar manejadores de callbacks admin
        this.registerCallbackHandlers();

        // Registrar comandos admin
        this.registerCommands();

        logger.info('Módulo de administración inicializado correctamente');
    }

    registerCallbackHandlers() {
        // Callback para abrir menú admin
        this.bot.action('admin_menu', adminAuth.requireAdmin, ctx => {
            return adminMenu.showMainMenu(ctx);
        });

        // Callbacks específicos para selección de pólizas
        this.bot.action(/^admin_policy_select:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handlePolicySelection(ctx, policyId);
            } catch (error) {
                logger.error('Error al seleccionar póliza:', error);
                await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
            }
        });

        // Callbacks específicos para eliminación
        this.bot.action(/^admin_policy_delete_confirm:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleDeleteConfirmation(ctx, policyId);
            } catch (error) {
                logger.error('Error al confirmar eliminación:', error);
                await ctx.answerCbQuery('Error al procesar eliminación', { show_alert: true });
            }
        });

        // Callbacks específicos para restauración
        this.bot.action(
            /^admin_policy_restore_confirm:(.+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                const policyId = ctx.match[1];
                try {
                    await this.handlers.policy.handleRestoreConfirmation(ctx, policyId);
                } catch (error) {
                    logger.error('Error al restaurar póliza:', error);
                    await ctx.answerCbQuery('Error al restaurar póliza', { show_alert: true });
                }
            }
        );

        // Callbacks para ejecutar restauración
        this.bot.action(
            /^admin_policy_restore_execute:(.+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                const policyId = ctx.match[1];
                try {
                    await this.handlers.policy.handleRestoreExecution(ctx, policyId);
                } catch (error) {
                    logger.error('Error al ejecutar restauración:', error);
                    await ctx.answerCbQuery('Error al restaurar póliza', { show_alert: true });
                }
            }
        );

        // Callbacks específicos para edición por categorías
        this.bot.action(
            /^admin_policy_edit_categories:(.+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                const policyId = ctx.match[1];
                try {
                    await this.handlers.policy.showEditCategoriesMenu(ctx, policyId);
                } catch (error) {
                    logger.error('Error al mostrar menú de categorías:', error);
                    await ctx.answerCbQuery('Error al cargar menú de edición', {
                        show_alert: true
                    });
                }
            }
        );

        // Callbacks para cada categoría específica
        this.bot.action(/^admin_edit_personal:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showPersonalDataEdit(ctx, policyId);
            } catch (error) {
                logger.error('Error al mostrar datos personales:', error);
                await ctx.answerCbQuery('Error al cargar datos personales', { show_alert: true });
            }
        });

        this.bot.action(/^admin_edit_address:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showAddressEdit(ctx, policyId);
            } catch (error) {
                logger.error('Error al mostrar datos de domicilio:', error);
                await ctx.answerCbQuery('Error al cargar datos de domicilio', { show_alert: true });
            }
        });

        this.bot.action(/^admin_edit_vehicle:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showVehicleEdit(ctx, policyId);
            } catch (error) {
                logger.error('Error al mostrar datos del vehículo:', error);
                await ctx.answerCbQuery('Error al cargar datos del vehículo', { show_alert: true });
            }
        });

        this.bot.action(/^admin_edit_policy:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showPolicyDataEdit(ctx, policyId);
            } catch (error) {
                logger.error('Error al mostrar datos de póliza:', error);
                await ctx.answerCbQuery('Error al cargar datos de póliza', { show_alert: true });
            }
        });

        this.bot.action(/^admin_edit_financial:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.showFinancialEdit(ctx, policyId);
            } catch (error) {
                logger.error('Error al mostrar datos financieros:', error);
                await ctx.answerCbQuery('Error al cargar datos financieros', { show_alert: true });
            }
        });

        // Callbacks para edición de campos específicos
        this.bot.action(/^admin_edit_field:([^:]+):(.+)$/, adminAuth.requireAdmin, async ctx => {
            const fieldName = ctx.match[1];
            const policyId = ctx.match[2];
            try {
                await this.handlers.policy.startFieldEdit(ctx, fieldName, policyId);
            } catch (error) {
                logger.error('Error al iniciar edición de campo:', error);
                await ctx.answerCbQuery('Error al iniciar edición', { show_alert: true });
            }
        });

        // Callbacks para confirmación de cambios
        this.bot.action(/^admin_confirm_edit:([^:]+):(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            const fieldName = ctx.match[2];
            try {
                await this.handlers.policy.executeFieldChange(ctx, policyId, fieldName);
            } catch (error) {
                logger.error('Error al confirmar cambio:', error);
                await ctx.answerCbQuery('Error al confirmar cambio', { show_alert: true });
            }
        });

        // Callback para selección masiva
        this.bot.action('admin_mass_selection', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.showMassSelectionInterface(ctx);
            } catch (error) {
                logger.error('Error al mostrar interfaz de selección masiva:', error);
                await ctx.answerCbQuery('Error al cargar interfaz de selección', {
                    show_alert: true
                });
            }
        });

        // Callback para cancelar desde motivo de eliminación
        this.bot.action('admin_mass_selection:cancelled', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.cancelMassDeletion(ctx);
            } catch (error) {
                logger.error('Error al cancelar eliminación masiva:', error);
                await ctx.answerCbQuery('Error al cancelar', { show_alert: true });
            }
        });

        // Callbacks para toggle de selección individual
        this.bot.action(/^admin_toggle_selection:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.togglePolicySelection(ctx, policyId);
            } catch (error) {
                logger.error('Error al cambiar selección:', error);
                await ctx.answerCbQuery('Error al cambiar selección', { show_alert: true });
            }
        });

        // Callbacks para seleccionar/deseleccionar todas
        this.bot.action('admin_select_all', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.selectAllPolicies(ctx);
            } catch (error) {
                logger.error('Error al seleccionar todas:', error);
                await ctx.answerCbQuery('Error al seleccionar todas', { show_alert: true });
            }
        });

        this.bot.action('admin_deselect_all', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.deselectAllPolicies(ctx);
            } catch (error) {
                logger.error('Error al deseleccionar todas:', error);
                await ctx.answerCbQuery('Error al deseleccionar todas', { show_alert: true });
            }
        });

        // Callback para confirmación de eliminación masiva
        this.bot.action('admin_confirm_mass_deletion', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.showMassDeletionConfirmation(ctx);
            } catch (error) {
                logger.error('Error al mostrar confirmación masiva:', error);
                await ctx.answerCbQuery('Error al mostrar confirmación', { show_alert: true });
            }
        });

        // Callbacks para restauración masiva
        this.bot.action('admin_show_recent_deleted', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.showRecentDeletedPolicies(ctx);
            } catch (error) {
                logger.error('Error al mostrar pólizas eliminadas recientes:', error);
                await ctx.answerCbQuery('Error al cargar pólizas eliminadas', { show_alert: true });
            }
        });

        this.bot.action('admin_mass_restore_selection', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.showMassRestoreSelectionInterface(ctx);
            } catch (error) {
                logger.error('Error al mostrar interfaz de restauración masiva:', error);
                await ctx.answerCbQuery('Error al cargar interfaz de restauración', {
                    show_alert: true
                });
            }
        });

        // Callbacks para toggle de selección en restauración
        this.bot.action(/^admin_toggle_restore:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.toggleRestoreSelection(ctx, policyId);
            } catch (error) {
                logger.error('Error al cambiar selección de restauración:', error);
                await ctx.answerCbQuery('Error al cambiar selección', { show_alert: true });
            }
        });

        // Callbacks para seleccionar/deseleccionar todas en restauración
        this.bot.action('admin_restore_select_all', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.selectAllForRestore(ctx);
            } catch (error) {
                logger.error('Error al seleccionar todas para restaurar:', error);
                await ctx.answerCbQuery('Error al seleccionar todas', { show_alert: true });
            }
        });

        this.bot.action('admin_restore_deselect_all', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.deselectAllForRestore(ctx);
            } catch (error) {
                logger.error('Error al deseleccionar todas para restaurar:', error);
                await ctx.answerCbQuery('Error al deseleccionar todas', { show_alert: true });
            }
        });

        // Callback para confirmación de restauración masiva
        this.bot.action('admin_confirm_mass_restore', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.showMassRestoreConfirmation(ctx);
            } catch (error) {
                logger.error('Error al mostrar confirmación de restauración masiva:', error);
                await ctx.answerCbQuery('Error al mostrar confirmación', { show_alert: true });
            }
        });

        // Callback para ejecutar restauración masiva
        this.bot.action('admin_execute_mass_restore', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.policy.executeMassRestore(ctx);
            } catch (error) {
                logger.error('Error al ejecutar restauración masiva:', error);
                await ctx.answerCbQuery('Error al ejecutar restauración', { show_alert: true });
            }
        });

        // Callbacks específicos para servicios
        this.bot.action(/^admin_service_select:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.service.handlePolicySelection(ctx, policyId);
            } catch (error) {
                logger.error('Error al seleccionar póliza para servicios:', error);
                await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
            }
        });

        // Callback para mostrar lista de servicios
        this.bot.action(/^admin_service_list:(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.service.showServicesList(ctx, policyId);
            } catch (error) {
                logger.error('Error al mostrar lista de servicios:', error);
                await ctx.answerCbQuery('Error al cargar servicios', { show_alert: true });
            }
        });

        // Callback para editar servicio específico
        this.bot.action(
            /^admin_service_edit_item:(.+):(.+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                const policyId = ctx.match[1];
                const serviceIndex = ctx.match[2];
                try {
                    await this.handlers.service.showServiceEditMenu(ctx, policyId, serviceIndex);
                } catch (error) {
                    logger.error('Error al mostrar menú de edición de servicio:', error);
                    await ctx.answerCbQuery('Error al cargar servicio', { show_alert: true });
                }
            }
        );

        // Callback para edición directa de servicio/registro por expediente
        this.bot.action(
            /^admin_service_direct_edit:(.+):(.+):(.+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                const policyId = ctx.match[1];
                const type = ctx.match[2]; // 'servicio' o 'registro'
                const itemIndex = parseInt(ctx.match[3]);
                try {
                    const Policy = require('../models/policy');
                    const policy = await Policy.findById(policyId);
                    if (!policy) {
                        await ctx.answerCbQuery('Póliza no encontrada', { show_alert: true });
                        return;
                    }

                    const item =
                        type === 'servicio'
                            ? policy.servicios[itemIndex]
                            : policy.registros[itemIndex];
                    if (!item) {
                        await ctx.answerCbQuery('Elemento no encontrado', { show_alert: true });
                        return;
                    }

                    const result = { policy, type, item, itemIndex };
                    await this.handlers.service.showServiceDirectEdit(ctx, result);
                } catch (error) {
                    logger.error('Error al mostrar edición directa:', error);
                    await ctx.answerCbQuery('Error al cargar elemento', { show_alert: true });
                }
            }
        );

        // Callback para editar campos específicos de servicio/registro
        this.bot.action(/^admin_field:(.+):(.+):(.+):(.+)$/, adminAuth.requireAdmin, async ctx => {
            const policyId = ctx.match[1];
            const type = ctx.match[2]; // 'servicio' o 'registro'
            const itemIndex = parseInt(ctx.match[3]);
            const fieldName = ctx.match[4];
            try {
                await this.handlers.service.startFieldEdit(
                    ctx,
                    policyId,
                    type,
                    itemIndex,
                    fieldName
                );
            } catch (error) {
                logger.error('Error al iniciar edición de campo:', error);
                await ctx.answerCbQuery('Error al iniciar edición', { show_alert: true });
            }
        });

        // Callback para valores de campo predefinidos
        this.bot.action(
            /^admin_val:(.+):(.+):(.+):(.+):(.+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                const shortId = ctx.match[1];
                const type = ctx.match[2]; // 'servicio' o 'registro'
                const itemIndex = parseInt(ctx.match[3]);
                const fieldName = ctx.match[4];
                const value = ctx.match[5];
                try {
                    await this.handlers.service.handleFieldValueShort(
                        ctx,
                        shortId,
                        type,
                        itemIndex,
                        fieldName,
                        value
                    );
                } catch (error) {
                    logger.error('Error al procesar valor de campo:', error);
                    await ctx.answerCbQuery('Error al procesar valor', { show_alert: true });
                }
            }
        );

        // Callback para volver a edición directa
        this.bot.action(/^admin_direct:(.+):(.+):(.+)$/, adminAuth.requireAdmin, async ctx => {
            const shortId = ctx.match[1];
            const type = ctx.match[2]; // 'servicio' o 'registro'
            const itemIndex = parseInt(ctx.match[3]);
            try {
                await this.handlers.service.showServiceDirectEditShort(
                    ctx,
                    shortId,
                    type,
                    itemIndex
                );
            } catch (error) {
                logger.error('Error al mostrar edición directa:', error);
                await ctx.answerCbQuery('Error al cargar elemento', { show_alert: true });
            }
        });

        // Callbacks específicos para reportes mensuales
        this.bot.action('admin_reports_monthly_current', adminAuth.requireAdmin, async ctx => {
            try {
                const now = new Date();
                const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const period = `${this.handlers.reports.formatMonth(startDate)}`;

                await this.handlers.reports.generateMonthlyReportForPeriod(
                    ctx,
                    startDate,
                    endDate,
                    period
                );
            } catch (error) {
                logger.error('Error al generar reporte mensual actual:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_monthly_previous', adminAuth.requireAdmin, async ctx => {
            try {
                const now = new Date();
                const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                const period = `${this.handlers.reports.formatMonth(startDate)}`;

                await this.handlers.reports.generateMonthlyReportForPeriod(
                    ctx,
                    startDate,
                    endDate,
                    period
                );
            } catch (error) {
                logger.error('Error al generar reporte mensual anterior:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_monthly_select', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.reports.showMonthSelection(ctx);
            } catch (error) {
                logger.error('Error al mostrar selección de mes:', error);
                await ctx.answerCbQuery('Error al mostrar selección', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_monthly_comparative', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.reports.generateComparativeReport(ctx);
            } catch (error) {
                logger.error('Error al generar reporte comparativo:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        // Callbacks para reportes semanales
        this.bot.action('admin_reports_weekly_current', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.reports.generateCurrentWeekReport(ctx);
            } catch (error) {
                logger.error('Error al generar reporte semanal actual:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_weekly_last', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.reports.generateLastWeekReport(ctx);
            } catch (error) {
                logger.error('Error al generar reporte semanal anterior:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_weekly_compare', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.reports.generateWeeklyComparison(ctx);
            } catch (error) {
                logger.error('Error al generar comparación semanal:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        // Callback para selección específica de mes
        this.bot.action(/^admin_reports_month_(\d+)_(\d+)$/, adminAuth.requireAdmin, async ctx => {
            try {
                const monthIndex = parseInt(ctx.match[1]);
                const year = parseInt(ctx.match[2]);

                const startDate = new Date(year, monthIndex, 1);
                const endDate = new Date(year, monthIndex + 1, 0);
                const period = `${this.handlers.reports.formatMonth(startDate)}`;

                await this.handlers.reports.generateMonthlyReportForPeriod(
                    ctx,
                    startDate,
                    endDate,
                    period
                );
            } catch (error) {
                logger.error('Error al generar reporte para mes específico:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        // Callbacks específicos para reportes ejecutivos diarios
        this.bot.action('admin_reports_executive_current', adminAuth.requireAdmin, async ctx => {
            try {
                const now = new Date();
                const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const period = `${this.handlers.reports.formatMonth(startDate)}`;

                await this.handlers.reports.generateExecutiveReportForPeriod(
                    ctx,
                    startDate,
                    endDate,
                    period
                );
            } catch (error) {
                logger.error('Error al generar reporte ejecutivo actual:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_executive_previous', adminAuth.requireAdmin, async ctx => {
            try {
                const now = new Date();
                const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                const period = `${this.handlers.reports.formatMonth(startDate)}`;

                await this.handlers.reports.generateExecutiveReportForPeriod(
                    ctx,
                    startDate,
                    endDate,
                    period
                );
            } catch (error) {
                logger.error('Error al generar reporte ejecutivo anterior:', error);
                await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
            }
        });

        this.bot.action('admin_reports_executive_select', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.reports.showMonthSelection(ctx, 'executive');
            } catch (error) {
                logger.error('Error al mostrar selección de mes ejecutivo:', error);
                await ctx.answerCbQuery('Error al mostrar selección', { show_alert: true });
            }
        });

        // Callback para selección específica de mes ejecutivo
        this.bot.action(
            /^admin_reports_executive_month_(\d+)_(\d+)$/,
            adminAuth.requireAdmin,
            async ctx => {
                try {
                    const monthIndex = parseInt(ctx.match[1]);
                    const year = parseInt(ctx.match[2]);

                    const startDate = new Date(year, monthIndex, 1);
                    const endDate = new Date(year, monthIndex + 1, 0);
                    const period = `${this.handlers.reports.formatMonth(startDate)}`;

                    await this.handlers.reports.generateExecutiveReportForPeriod(
                        ctx,
                        startDate,
                        endDate,
                        period
                    );
                } catch (error) {
                    logger.error('Error al generar reporte ejecutivo para mes específico:', error);
                    await ctx.answerCbQuery('Error al generar reporte', { show_alert: true });
                }
            }
        );

        // Callback para exportar Excel
        this.bot.action('admin_database_export', adminAuth.requireAdmin, async ctx => {
            try {
                await this.handlers.scripts.handleExportExcel(ctx);
            } catch (error) {
                logger.error('Error al exportar Excel:', error);
                await ctx.answerCbQuery('Error al exportar Excel', { show_alert: true });
            }
        });

        // Callbacks para submenús
        this.bot.action(/^admin_(.+)$/, adminAuth.requireAdmin, async ctx => {
            const action = ctx.match[1];
            const [module, ...params] = action.split('_');

            try {
                if (this.handlers[module]) {
                    await this.handlers[module].handleAction(ctx, params.join('_'));
                } else {
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
                }
            } catch (error) {
                logger.error('Error en callback admin:', error);
                await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
            }
        });

        // Interceptar mensajes de texto para búsquedas admin y edición de campos
        this.bot.on('text', async (ctx, next) => {
            logger.info('🔍 [ADMIN-DEBUG] Mensaje de texto recibido', {
                text: ctx.message.text,
                userId: ctx.from.id,
                chatId: ctx.chat.id
            });

            try {
                // Verificar estado admin actual
                const adminState = require('./utils/adminStates').getAdminState(
                    ctx.from.id,
                    ctx.chat.id
                );
                logger.info('🔍 [ADMIN-DEBUG] Estado admin actual:', adminState);

                // Intentar procesar como búsqueda de póliza o edición de campo
                let handled = await this.handlers.policy.handleTextMessage(ctx);
                logger.info('🔍 [ADMIN-DEBUG] Procesado por policy handler:', handled);

                // Si no fue procesado por policy, intentar con service
                if (!handled) {
                    handled = await this.handlers.service.handleTextMessage(ctx);
                    logger.info('🔍 [ADMIN-DEBUG] Procesado por service handler:', handled);
                }

                if (!handled) {
                    logger.info('🔍 [ADMIN-DEBUG] No procesado por admin, pasando a next()');
                    // Si no fue procesado por admin, continuar con el flujo normal
                    return next();
                }

                logger.info('🔍 [ADMIN-DEBUG] Mensaje procesado por admin exitosamente');
            } catch (error) {
                logger.error('🔍 [ADMIN-DEBUG] Error al procesar mensaje:', error);
                logger.error('Error al procesar mensaje de texto en admin:', error);
                return next();
            }
        });
    }

    registerCommands() {
        // Comando directo para acceder al admin (solo para administradores)
        this.bot.command('admin', adminAuth.requireAdmin, ctx => {
            return adminMenu.showMainMenu(ctx);
        });
    }
}

module.exports = AdminModule;
