"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const express_1 = __importDefault(require("express"));
const https_1 = __importDefault(require("https"));
const database_1 = __importDefault(require("./database"));
const logger_1 = __importDefault(require("./utils/logger"));
const config_1 = __importDefault(require("./config"));
const commandHandler_1 = __importDefault(require("./comandos/commandHandler"));
const groupHandler_1 = __importDefault(require("./middleware/groupHandler"));
const authMiddleware_1 = __importDefault(require("./middleware/authMiddleware"));
const NotificationManager_1 = require("./services/NotificationManager");
const StateCleanupService_1 = __importDefault(require("./utils/StateCleanupService"));
const admin_1 = __importDefault(require("./admin"));
const calculationScheduler_1 = __importDefault(require("./admin/utils/calculationScheduler"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
let isShuttingDown = false;
async function initializeBot() {
    try {
        app.get('/', (req, res) => {
            res.send('Bot is running!');
        });
        app.listen(PORT, () => {
            logger_1.default.info(`Servidor web iniciado en puerto ${PORT}`);
        });
        await (0, database_1.default)();
        logger_1.default.info('✅ Base de datos conectada con éxito');
        StateCleanupService_1.default.start(15 * 60 * 1000, 30 * 60 * 1000);
        logger_1.default.info('✅ Servicio de limpieza de estados iniciado');
        const httpsAgent = new https_1.default.Agent({
            keepAlive: true,
            keepAliveMsecs: 10000,
            timeout: 30000,
            maxSockets: 1
        });
        const bot = new telegraf_1.Telegraf(config_1.default.telegram.token, {
            telegram: {
                agent: httpsAgent,
                webhookReply: false
            },
            handlerTimeout: 90000
        });
        try {
            const notificationManager = (0, NotificationManager_1.getInstance)(bot);
            await notificationManager.initialize();
            logger_1.default.info('✅ Sistema de notificaciones inicializado correctamente');
        }
        catch (notifyError) {
            logger_1.default.error('⚠️ Error al inicializar sistema de notificaciones:', notifyError);
        }
        const botInfo = await bot.telegram.getMe();
        logger_1.default.info('Bot conectado exitosamente a Telegram', {
            botName: botInfo.username,
            botId: botInfo.id
        });
        bot.use(async (ctx, next) => {
            if (!ctx.message || !('date' in ctx.message)) {
                return next();
            }
            const now = Math.floor(Date.now() / 1000);
            const messageTime = ctx.message.date;
            const messageAge = now - messageTime;
            const MAX_MESSAGE_AGE = 300;
            if (messageAge > MAX_MESSAGE_AGE) {
                logger_1.default.info(`Descartando mensaje antiguo (${messageAge} segundos)`, {
                    chatId: ctx.chat?.id,
                    text: 'text' in ctx.message ? ctx.message.text : undefined
                });
                return;
            }
            return next();
        });
        bot.use(async (ctx, next) => {
            const start = Date.now();
            logger_1.default.info('Procesando update', {
                updateType: ctx.updateType,
                chatId: ctx.chat?.id,
                text: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
            });
            try {
                await next();
                const ms = Date.now() - start;
                logger_1.default.info('Respuesta enviada', { ms });
            }
            catch (error) {
                logger_1.default.error('Error en middleware:', error);
                await ctx.reply('❌ Error al procesar el comando.');
            }
        });
        bot.use((0, authMiddleware_1.default)());
        bot.use(groupHandler_1.default);
        logger_1.default.info('Inicializando módulo de administración...');
        const adminModule = new admin_1.default(bot);
        adminModule.initialize();
        logger_1.default.info('✅ Módulo de administración inicializado');
        logger_1.default.info('Inicializando sistema de cálculo automático...');
        const calculationScheduler = new calculationScheduler_1.default(bot);
        calculationScheduler.initialize();
        logger_1.default.info('✅ Sistema de cálculo automático inicializado');
        logger_1.default.info('Registrando comandos...');
        new commandHandler_1.default(bot);
        logger_1.default.info('✅ Comandos registrados');
        bot.catch((err, ctx) => {
            const error = err instanceof Error ? err : new Error(String(err));
            logger_1.default.error('Error no manejado:', {
                error: error.message,
                stack: error.stack
            });
            ctx.reply('❌ Ocurrió un error inesperado.');
        });
        const handleShutdown = async (signal) => {
            if (isShuttingDown)
                return;
            logger_1.default.info('Iniciando apagado graceful', { signal });
            isShuttingDown = true;
            try {
                const notificationManager = (0, NotificationManager_1.getInstance)();
                if (notificationManager.isInitialized) {
                    notificationManager.stop();
                    logger_1.default.info('✅ Sistema de notificaciones detenido correctamente');
                }
            }
            catch (stopError) {
                logger_1.default.error('Error al detener sistema de notificaciones:', stopError);
            }
            try {
                calculationScheduler.stopAllJobs();
                logger_1.default.info('✅ Sistema de cálculo automático detenido correctamente');
            }
            catch (stopError) {
                logger_1.default.error('Error al detener sistema de cálculo:', stopError);
            }
            try {
                StateCleanupService_1.default.stop();
                logger_1.default.info('✅ Servicio de limpieza de estados detenido correctamente');
            }
            catch (stopError) {
                logger_1.default.error('Error al detener servicio de limpieza de estados:', stopError);
            }
            setTimeout(async () => {
                try {
                    await bot.stop();
                    logger_1.default.info('Bot detenido correctamente');
                    process.exit(0);
                }
                catch (error) {
                    logger_1.default.error('Error durante el apagado', { error });
                    process.exit(1);
                }
            }, 3000);
        };
        process.once('SIGINT', () => handleShutdown('SIGINT'));
        process.once('SIGTERM', () => handleShutdown('SIGTERM'));
        await bot.launch();
        logger_1.default.info('🤖 Bot iniciado exitosamente');
        return bot;
    }
    catch (error) {
        logger_1.default.error('Error fatal al inicializar el bot:', error);
        throw error;
    }
}
initializeBot().catch(error => {
    logger_1.default.error('Error fatal, deteniendo el proceso:', error);
    process.exit(1);
});
