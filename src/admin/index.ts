import { Context, NarrowedContext } from 'telegraf';
import { CallbackQuery, Update } from 'telegraf/typings/core/types/typegram';
import { Telegraf } from 'telegraf';
import logger from '../utils/logger';
import adminMenu from './menus/adminMenu';
import adminAuth from './middleware/adminAuth';
import adminStateManager from './utils/adminStates';
import policyHandler from './handlers/policyHandler';
import serviceHandler from './handlers/serviceHandler';
import databaseHandler from './handlers/databaseHandler';
import reportsHandler from './handlers/reportsHandler';
import notificationsHandler from './handlers/notificationsHandler';
import SimpleScriptsHandler from './handlers/simpleScriptsHandler';

interface IAdminHandler {
    handleAction(ctx: Context, action: string): Promise<void>;
    handleTextMessage?(ctx: Context): Promise<boolean>;
    handleCancelNotification?(ctx: Context, notificationId: string): Promise<void>;
    handleDeleteNotification?(ctx: Context, notificationId: string): Promise<void>;
    handleEditDate?(ctx: Context, notificationId: string): Promise<void>;
    handleQuickEdit?(ctx: Context, notificationId: string, option: string): Promise<void>;
    handleCustomTime?(ctx: Context, notificationId: string, dayOption: string): Promise<void>;
    handleRescheduleNotification?(ctx: Context, notificationId: string): Promise<void>;
}

interface IPolicyHandler extends IAdminHandler {
    handlePolicySelection(ctx: Context, policyId: string): Promise<void>;
    handleUnifiedPolicySearch(ctx: Context): Promise<void>;
    handleDeleteConfirmation(ctx: Context, policyId: string): Promise<void>;
    handleDeletionReason(ctx: Context, policyId: string, reasonCode: string): Promise<boolean>;
    handleRestoreConfirmation(ctx: Context, policyId: string): Promise<void>;
    handleRestoreExecution(ctx: Context, policyId: string): Promise<void>;
    showEditCategoriesMenu(ctx: Context, policyId: string): Promise<void>;
    showPolicyDataEdit(ctx: Context, policyId: string): Promise<void>;
    startFieldEdit(ctx: Context, fieldName: string, policyId: string): Promise<void>;
    executeFieldChange(
        ctx: Context,
        policyId: string,
        fieldName: string,
        newValue: string
    ): Promise<boolean>;
    showMassSelectionInterface(ctx: Context): Promise<void>;
    cancelMassDeletion(ctx: Context): Promise<void>;
    togglePolicySelection(ctx: Context, policyId: string): Promise<void>;
    selectAllPolicies(ctx: Context): Promise<void>;
    deselectAllPolicies(ctx: Context): Promise<void>;
    showMassDeletionConfirmation(ctx: Context): Promise<void>;
    showRecentDeletedPolicies(ctx: Context): Promise<void>;
    showMassRestoreSelectionInterface(ctx: Context): Promise<void>;
    toggleRestoreSelection(ctx: Context, policyId: string): Promise<void>;
    selectAllForRestore(ctx: Context): Promise<void>;
    deselectAllForRestore(ctx: Context): Promise<void>;
    showMassRestoreConfirmation(ctx: Context): Promise<void>;
    executeMassRestore(ctx: Context): Promise<void>;
    handleTextMessage(ctx: Context): Promise<boolean>;
}

interface IServiceHandler extends IAdminHandler {
    handlePolicySelection(ctx: Context, policyId: string): Promise<void>;
    showServicesList(ctx: Context, policyId: string): Promise<void>;
    showServiceEditMenu(ctx: Context, policyId: string, serviceIndex: string): Promise<void>;
    showServiceDirectEdit(ctx: Context, result: any): Promise<void>;
    startFieldEdit(
        ctx: Context,
        policyId: string,
        type: string,
        itemIndex: number,
        fieldName: string
    ): Promise<void>;
    showServiceDirectEditShort(
        ctx: Context,
        policyId: string,
        type: string,
        itemIndex: number
    ): Promise<void>;
    handleServiceDirectEditShort(
        ctx: Context,
        shortId: string,
        type: string,
        itemIndex: number
    ): Promise<void>;
    handleServiceFieldEditShort(
        ctx: Context,
        shortId: string,
        type: string,
        itemIndex: number,
        fieldName: string
    ): Promise<void>;
    handleTextMessage(ctx: Context): Promise<boolean>;
}

interface IReportsHandler extends IAdminHandler {
    formatMonth(date: Date): string;
    generateMonthlyReportForPeriod(
        ctx: Context,
        startDate: Date,
        endDate: Date,
        period: string
    ): Promise<void>;
    showMonthSelection(ctx: Context, type?: string): Promise<void>;
    generateComparativeReport(ctx: Context): Promise<void>;
    generateCurrentWeekReport(ctx: Context): Promise<void>;
    generateLastWeekReport(ctx: Context): Promise<void>;
    generateWeeklyComparison(ctx: Context): Promise<void>;
    generateExecutiveReportForPeriod(
        ctx: Context,
        startDate: Date,
        endDate: Date,
        period: string
    ): Promise<void>;
}

interface ISimpleScriptsHandler extends IAdminHandler {
    handleExportExcel(ctx: Context): Promise<void>;
    handleAutoCleanup(ctx: Context): Promise<void>;
    executeAutoCleanupConfirmed(ctx: Context): Promise<void>;
    cancelAutoCleanup(ctx: Context): Promise<void>;
    handleFileValidation(ctx: Context): Promise<void>;
}

class AdminModule {
    private bot: Telegraf;
    private handlers: {
        policy: IPolicyHandler;
        service: IServiceHandler;
        database: IAdminHandler;
        reports: IReportsHandler;
        notifications: IAdminHandler;
        scripts: ISimpleScriptsHandler;
    };

    constructor(bot: Telegraf) {
        this.bot = bot;
        this.handlers = {
            policy: policyHandler as IPolicyHandler,
            service: serviceHandler as IServiceHandler,
            database: databaseHandler as IAdminHandler,
            reports: reportsHandler as IReportsHandler,
            notifications: new notificationsHandler() as IAdminHandler,
            scripts: new SimpleScriptsHandler() as ISimpleScriptsHandler
        };
    }

    initialize(): void {
        logger.info('Inicializando módulo de administración');

        // Registrar middleware de autenticación
        this.bot.use(adminAuth.middleware);

        // Registrar manejadores de callbacks admin
        this.registerCallbackHandlers();

        // Registrar comandos admin
        this.registerCommands();

        logger.info('Módulo de administración inicializado correctamente');
    }

    private registerCallbackHandlers(): void {
        // Callback para abrir menú admin
        this.bot.action('admin_menu', adminAuth.requireAdmin, (ctx: Context) => {
            return adminMenu.showMainMenu(ctx);
        });

        // Callback para menú de pólizas
        this.bot.action('admin_policy_menu', adminAuth.requireAdmin, (ctx: Context) => {
            return adminMenu.showPolicyMenu(ctx);
        });

        // Callback para búsqueda unificada de pólizas (NUEVO FLUJO)
        this.bot.action('admin_policy_search', adminAuth.requireAdmin, async (ctx: Context) => {
            try {
                await this.handlers.policy.handleUnifiedPolicySearch(ctx);
            } catch (error) {
                logger.error('Error en búsqueda unificada:', error);
                await ctx.answerCbQuery('Error al iniciar búsqueda', { show_alert: true });
            }
        });

        // Callbacks específicos para selección de pólizas
        this.bot.action(
            /^admin_policy_select:(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
                try {
                    await this.handlers.policy.handlePolicySelection(ctx, policyId);
                } catch (error) {
                    logger.error('Error al seleccionar póliza:', error);
                    await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
                }
            }
        );

        // Callbacks específicos para eliminación
        this.bot.action(
            /^admin_policy_delete_confirm:(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
                try {
                    await this.handlers.policy.handleDeleteConfirmation(ctx, policyId);
                } catch (error) {
                    logger.error('Error al confirmar eliminación:', error);
                    await ctx.answerCbQuery('Error al procesar eliminación', { show_alert: true });
                }
            }
        );

        // Callback para ejecutar eliminación con motivo (formato corto: adm_del:policyId:reasonCode)
        this.bot.action(/^adm_del:([^:]+):(.+)$/, adminAuth.requireAdmin, async (ctx: Context) => {
            const policyId = (ctx.match as RegExpMatchArray)[1];
            const reasonCode = (ctx.match as RegExpMatchArray)[2];
            try {
                await this.handlers.policy.handleDeletionReason(ctx, policyId, reasonCode);
                await ctx.answerCbQuery();
            } catch (error) {
                logger.error('Error al ejecutar eliminación:', error);
                await ctx.answerCbQuery('Error al eliminar póliza', { show_alert: true });
            }
        });

        // Callbacks específicos para restauración
        this.bot.action(
            /^admin_policy_restore_confirm:(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
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
            /^admin_policy_restore_exec:(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
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
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
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

        // Callback para edición de datos de póliza
        this.bot.action(
            /^admin_edit_policy:(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
                try {
                    await this.handlers.policy.showPolicyDataEdit(ctx, policyId);
                } catch (error) {
                    logger.error('Error al mostrar datos de póliza:', error);
                    await ctx.answerCbQuery('Error al cargar datos de póliza', {
                        show_alert: true
                    });
                }
            }
        );

        // Callbacks para edición de campos específicos
        this.bot.action(
            /^admin_edit_field:([^:]+):(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const fieldName = (ctx.match as RegExpMatchArray)[1];
                const policyId = (ctx.match as RegExpMatchArray)[2];
                try {
                    await this.handlers.policy.startFieldEdit(ctx, fieldName, policyId);
                } catch (error) {
                    logger.error('Error al iniciar edición de campo:', error);
                    await ctx.answerCbQuery('Error al iniciar edición', { show_alert: true });
                }
            }
        );

        // Callbacks para confirmación de cambios (legacy - el nuevo flujo usa handleTextMessage)
        this.bot.action(
            /^admin_confirm_edit:([^:]+):(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
                const fieldName = (ctx.match as RegExpMatchArray)[2];
                try {
                    // Obtener nuevo valor del estado admin
                    const state = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);
                    const newValue = state?.data?.newValue ?? '';
                    await this.handlers.policy.executeFieldChange(
                        ctx,
                        policyId,
                        fieldName,
                        newValue
                    );
                } catch (error) {
                    logger.error('Error al confirmar cambio:', error);
                    await ctx.answerCbQuery('Error al confirmar cambio', { show_alert: true });
                }
            }
        );

        // Additional callbacks (abbreviated for brevity - the rest follow the same pattern)
        this.registerPolicyMassOperationsCallbacks();
        this.registerServiceCallbacks();
        this.registerReportsCallbacks();
        this.registerDatabaseCallbacks();
        this.registerGenericCallbacks();
    }

    private registerPolicyMassOperationsCallbacks(): void {
        // Callback para selección masiva
        this.bot.action('admin_mass_selection', adminAuth.requireAdmin, async (ctx: Context) => {
            try {
                await this.handlers.policy.showMassSelectionInterface(ctx);
            } catch (error) {
                logger.error('Error al mostrar interfaz de selección masiva:', error);
                await ctx.answerCbQuery('Error al cargar interfaz de selección', {
                    show_alert: true
                });
            }
        });

        // Continue with other mass operations callbacks...
        this.bot.action(
            'admin_mass_selection:cancelled',
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    await this.handlers.policy.cancelMassDeletion(ctx);
                } catch (error) {
                    logger.error('Error al cancelar eliminación masiva:', error);
                    await ctx.answerCbQuery('Error al cancelar', { show_alert: true });
                }
            }
        );
    }

    private registerServiceCallbacks(): void {
        // Callbacks específicos para servicios
        this.bot.action(
            /^admin_service_select:(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const policyId = (ctx.match as RegExpMatchArray)[1];
                try {
                    await this.handlers.service.handlePolicySelection(ctx, policyId);
                } catch (error) {
                    logger.error('Error al seleccionar póliza para servicios:', error);
                    await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
                }
            }
        );

        // Callback para edición directa de servicios (formato corto: ase:shortId:type:index)
        this.bot.action(
            /^ase:([^:]+):([^:]+):(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const shortId = (ctx.match as RegExpMatchArray)[1];
                const typeCode = (ctx.match as RegExpMatchArray)[2];
                const itemIndex = parseInt((ctx.match as RegExpMatchArray)[3]);
                try {
                    const type = typeCode === 's' ? 'servicio' : 'registro';
                    await this.handlers.service.handleServiceDirectEditShort(
                        ctx,
                        shortId,
                        type,
                        itemIndex
                    );
                } catch (error) {
                    logger.error('Error al mostrar edición directa de servicio:', error);
                    await ctx.answerCbQuery('Error al cargar la edición', { show_alert: true });
                }
            }
        );

        // Callback para edición de campos específicos de servicios (formato corto: asf:shortId:type:index:field)
        this.bot.action(
            /^asf:([^:]+):([^:]+):([^:]+):(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                const shortId = (ctx.match as RegExpMatchArray)[1];
                const typeCode = (ctx.match as RegExpMatchArray)[2];
                const itemIndex = parseInt((ctx.match as RegExpMatchArray)[3]);
                const fieldCode = (ctx.match as RegExpMatchArray)[4];
                try {
                    const type = typeCode === 's' ? 'servicio' : 'registro';
                    const fieldMap: { [key: string]: string } = {
                        fS: 'fechaServicio',
                        tS: 'tipoServicio',
                        d: 'descripcion',
                        c: 'costo',
                        e: 'estado',
                        p: 'proveedor',
                        fR: 'fechaRegistro',
                        tR: 'tipoRegistro'
                    };
                    const fieldName = fieldMap[fieldCode] ?? fieldCode;
                    await this.handlers.service.handleServiceFieldEditShort(
                        ctx,
                        shortId,
                        type,
                        itemIndex,
                        fieldName
                    );
                } catch (error) {
                    logger.error('Error al iniciar edición de campo de servicio:', error);
                    await ctx.answerCbQuery('Error al iniciar edición', { show_alert: true });
                }
            }
        );
    }

    private registerReportsCallbacks(): void {
        // Callbacks específicos para reportes mensuales
        this.bot.action(
            'admin_reports_monthly_current',
            adminAuth.requireAdmin,
            async (ctx: Context) => {
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
            }
        );

        // Continue with other report callbacks...
    }

    private registerDatabaseCallbacks(): void {
        // Callback para exportar Excel
        this.bot.action('admin_database_export', adminAuth.requireAdmin, async (ctx: Context) => {
            try {
                await this.handlers.scripts.handleExportExcel(ctx);
            } catch (error) {
                logger.error('Error al exportar Excel:', error);
                await ctx.answerCbQuery('Error al exportar Excel', { show_alert: true });
            }
        });

        // Callback para auto-cleanup
        this.bot.action(
            'admin_database_autocleanup',
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    await this.handlers.scripts.handleAutoCleanup(ctx);
                } catch (error) {
                    logger.error('Error en auto-cleanup:', error);
                    await ctx.answerCbQuery('Error en limpieza automática', { show_alert: true });
                }
            }
        );

        // Callback para validación de archivos
        this.bot.action(
            'admin_database_file_validation',
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    await this.handlers.scripts.handleFileValidation(ctx);
                } catch (error) {
                    logger.error('Error en validación de archivos:', error);
                    await ctx.answerCbQuery('Error en validación de archivos', {
                        show_alert: true
                    });
                }
            }
        );

        // Callbacks para edición individual de notificaciones -> Directo a editar fecha
        this.bot.action(
            /^admin_notifications_edit_([a-f0-9]{24})$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    // Ir directo a editar fecha (sin menú intermedio)
                    await this.handlers.notifications.handleEditDate?.(ctx, notificationId);
                } catch (error) {
                    logger.error('Error editando notificación:', error);
                    await ctx.answerCbQuery('Error al editar notificación', { show_alert: true });
                }
            }
        );

        // Callbacks para acciones específicas de notificaciones
        this.bot.action(
            /^admin_notifications_cancel_(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    await this.handlers.notifications.handleCancelNotification?.(
                        ctx,
                        notificationId
                    );
                } catch (error) {
                    logger.error('Error cancelando notificación:', error);
                    await ctx.answerCbQuery('Error al cancelar notificación', { show_alert: true });
                }
            }
        );

        this.bot.action(
            /^admin_notifications_delete_(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    await this.handlers.notifications.handleDeleteNotification?.(
                        ctx,
                        notificationId
                    );
                } catch (error) {
                    logger.error('Error eliminando notificación:', error);
                    await ctx.answerCbQuery('Error al eliminar notificación', { show_alert: true });
                }
            }
        );

        // Callbacks para edición de fechas de notificaciones
        this.bot.action(
            /^admin_notifications_edit_date_(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    await this.handlers.notifications.handleEditDate?.(ctx, notificationId);
                } catch (error) {
                    logger.error('Error mostrando opciones de edición:', error);
                    await ctx.answerCbQuery('Error al mostrar opciones de edición', {
                        show_alert: true
                    });
                }
            }
        );

        this.bot.action(
            /^admin_notifications_quick_(.+)_(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    const option = (ctx.match as RegExpMatchArray)[2];
                    await this.handlers.notifications.handleQuickEdit?.(
                        ctx,
                        notificationId,
                        option
                    );
                } catch (error) {
                    logger.error('Error en edición rápida de notificación:', error);
                    await ctx.answerCbQuery('Error al editar notificación', { show_alert: true });
                }
            }
        );

        this.bot.action(
            /^admin_notifications_reschedule_(.+)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    await this.handlers.notifications.handleRescheduleNotification?.(
                        ctx,
                        notificationId
                    );
                } catch (error) {
                    logger.error('Error reprogramando notificación:', error);
                    await ctx.answerCbQuery('Error al reprogramar notificación', {
                        show_alert: true
                    });
                }
            }
        );

        // Callback para hora personalizada (Elegir hora / Mañana)
        this.bot.action(
            /^admin_notifications_custom_(.+)_(today|tomorrow)$/,
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    const notificationId = (ctx.match as RegExpMatchArray)[1];
                    const dayOption = (ctx.match as RegExpMatchArray)[2];
                    await this.handlers.notifications.handleCustomTime?.(
                        ctx,
                        notificationId,
                        dayOption
                    );
                } catch (error) {
                    logger.error('Error en hora personalizada:', error);
                    await ctx.answerCbQuery('Error al procesar', { show_alert: true });
                }
            }
        );

        // Callbacks para confirmación de auto-cleanup
        this.bot.action(
            'admin_autocleanup_confirm',
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    await this.handlers.scripts.executeAutoCleanupConfirmed(ctx);
                } catch (error) {
                    logger.error('Error ejecutando auto-cleanup:', error);
                    await ctx.answerCbQuery('Error ejecutando limpieza', { show_alert: true });
                }
            }
        );

        this.bot.action(
            'admin_autocleanup_cancel',
            adminAuth.requireAdmin,
            async (ctx: Context) => {
                try {
                    await this.handlers.scripts.cancelAutoCleanup(ctx);
                } catch (error) {
                    logger.error('Error cancelando auto-cleanup:', error);
                    await ctx.answerCbQuery('Error cancelando limpieza', { show_alert: true });
                }
            }
        );
    }

    private registerGenericCallbacks(): void {
        // Callbacks para submenús
        this.bot.action(/^admin_(.+)$/, adminAuth.requireAdmin, async (ctx: Context) => {
            const action = (ctx.match as RegExpMatchArray)[1];
            const [module, ...params] = action.split('_');

            try {
                if (this.handlers[module as keyof typeof this.handlers]) {
                    await this.handlers[module as keyof typeof this.handlers].handleAction(
                        ctx,
                        params.join('_')
                    );
                } else {
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
                }
            } catch (error) {
                logger.error('Error en callback admin:', error);
                await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
            }
        });

        // Interceptar mensajes de texto para búsquedas admin y edición de campos
        // OPTIMIZADO: Early return si no hay estado admin activo
        this.bot.on('text', async (ctx: Context, next: () => Promise<void>) => {
            try {
                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;
                if (!userId || !chatId) return next();

                // Early return: si no hay estado admin, pasar directamente
                const adminState = adminStateManager.getAdminState(userId, chatId);
                if (!adminState) return next();

                const messageText = (ctx.message as any).text;

                // Comandos siempre tienen prioridad
                if (messageText.startsWith('/')) {
                    adminStateManager.clearAdminState(userId, chatId);
                    return next();
                }

                // Botón MENÚ PRINCIPAL tiene prioridad
                if (messageText.toUpperCase().includes('MENÚ PRINCIPAL')) {
                    adminStateManager.clearAdminState(userId, chatId);
                    return next();
                }

                // Intentar procesar con handlers admin
                let handled = await this.handlers.policy.handleTextMessage(ctx);

                if (!handled) {
                    handled = await this.handlers.service.handleTextMessage(ctx);
                }

                if (!handled && this.handlers.notifications.handleTextMessage) {
                    handled = await this.handlers.notifications.handleTextMessage(ctx);
                }

                if (!handled) return next();
            } catch (error) {
                logger.error('Error en admin text handler:', error);
                return next();
            }
        });
    }

    private registerCommands(): void {
        // Comando directo para acceder al admin (solo para administradores)
        this.bot.command('admin', adminAuth.requireAdmin, (ctx: Context) => {
            return adminMenu.showMainMenu(ctx);
        });
    }
}

export default AdminModule;
