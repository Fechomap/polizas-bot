const logger = require('../utils/logger');
const adminMenu = require('./menus/adminMenu');
const adminAuth = require('./middleware/adminAuth');
const policyHandler = require('./handlers/policyHandler');
const serviceHandler = require('./handlers/serviceHandler');
const databaseHandler = require('./handlers/databaseHandler');

class AdminModule {
    constructor(bot) {
        this.bot = bot;
        this.handlers = {
            policy: policyHandler,
            service: serviceHandler,
            database: databaseHandler
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
        this.bot.action('admin_menu', adminAuth.requireAdmin, (ctx) => {
            return adminMenu.showMainMenu(ctx);
        });

        // Callbacks específicos para selección de pólizas
        this.bot.action(/^admin_policy_select:(.+)$/, adminAuth.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handlePolicySelection(ctx, policyId);
            } catch (error) {
                logger.error('Error al seleccionar póliza:', error);
                await ctx.answerCbQuery('Error al cargar la póliza', { show_alert: true });
            }
        });

        // Callbacks específicos para eliminación
        this.bot.action(/^admin_policy_delete_confirm:(.+)$/, adminAuth.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleDeleteConfirmation(ctx, policyId);
            } catch (error) {
                logger.error('Error al confirmar eliminación:', error);
                await ctx.answerCbQuery('Error al procesar eliminación', { show_alert: true });
            }
        });

        // Callbacks específicos para restauración
        this.bot.action(/^admin_policy_restore_confirm:(.+)$/, adminAuth.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleRestoreConfirmation(ctx, policyId);
            } catch (error) {
                logger.error('Error al restaurar póliza:', error);
                await ctx.answerCbQuery('Error al restaurar póliza', { show_alert: true });
            }
        });

        // Callbacks para ejecutar restauración
        this.bot.action(/^admin_policy_restore_execute:(.+)$/, adminAuth.requireAdmin, async (ctx) => {
            const policyId = ctx.match[1];
            try {
                await this.handlers.policy.handleRestoreExecution(ctx, policyId);
            } catch (error) {
                logger.error('Error al ejecutar restauración:', error);
                await ctx.answerCbQuery('Error al restaurar póliza', { show_alert: true });
            }
        });

        // Callbacks para submenús
        this.bot.action(/^admin_(.+)$/, adminAuth.requireAdmin, async (ctx) => {
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

        // Interceptar mensajes de texto para búsquedas admin
        this.bot.on('text', async (ctx, next) => {
            try {
                // Intentar procesar como búsqueda de póliza
                const handled = await this.handlers.policy.handleTextMessage(ctx);

                if (!handled) {
                    // Si no fue procesado por admin, continuar con el flujo normal
                    return next();
                }
            } catch (error) {
                logger.error('Error al procesar mensaje de texto en admin:', error);
                return next();
            }
        });
    }

    registerCommands() {
    // Comando directo para acceder al admin (solo para administradores)
        this.bot.command('admin', adminAuth.requireAdmin, (ctx) => {
            return adminMenu.showMainMenu(ctx);
        });
    }
}

module.exports = AdminModule;
