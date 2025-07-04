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
    }

    registerCommands() {
    // Comando directo para acceder al admin (solo para administradores)
        this.bot.command('admin', adminAuth.requireAdmin, (ctx) => {
            return adminMenu.showMainMenu(ctx);
        });
    }
}

module.exports = AdminModule;
