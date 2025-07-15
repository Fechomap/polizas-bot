const { Telegraf } = require('telegraf');
const express = require('express');
const https = require('https');
const connectDB = require('./database');
const logger = require('./utils/logger');
const config = require('./config');
const CommandHandler = require('./comandos/commandHandler');
const handleGroupUpdate = require('./middleware/groupHandler');
const authMiddleware = require('./middleware/authMiddleware');
const { getInstance: getNotificationManager } = require('./services/NotificationManager');
const stateCleanupService = require('./utils/StateCleanupService');
const AdminModule = require('./admin');
const CalculationScheduler = require('./admin/utils/calculationScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

let isShuttingDown = false;

async function initializeBot() {
    try {
        app.get('/', (req, res) => {
            res.send('Bot is running!');
        });

        app.listen(PORT, () => {
            logger.info(`Servidor web iniciado en puerto ${PORT}`);
        });

        await connectDB();
        logger.info('✅ Base de datos conectada con éxito');

        // Iniciar servicio de limpieza automática de estados
        stateCleanupService.start(
            15 * 60 * 1000, // Ejecutar cada 15 minutos
            30 * 60 * 1000 // Limpiar estados más antiguos de 30 minutos
        );
        logger.info('✅ Servicio de limpieza de estados iniciado');

        // Configurar agente HTTPS con timeouts mejorados
        const httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 10000,
            timeout: 30000, // 30 segundos para conexiones
            maxSockets: 1
        });

        const bot = new Telegraf(config.telegram.token, {
            telegram: {
                agent: httpsAgent,
                webhookReply: false
            },
            handlerTimeout: 90000 // 90 segundos para handlers
        });

        // AÑADIR AQUÍ: Inicializar NotificationManager
        try {
            const notificationManager = getNotificationManager(bot);
            await notificationManager.initialize();
            logger.info('✅ Sistema de notificaciones inicializado correctamente');
        } catch (notifyError) {
            logger.error('⚠️ Error al inicializar sistema de notificaciones:', notifyError);
            // No bloquear el inicio del bot si falla el notificationManager
        }

        const botInfo = await bot.telegram.getMe();
        logger.info('Bot conectado exitosamente a Telegram', {
            botName: botInfo.username,
            botId: botInfo.id
        });

        // Middleware para filtrar mensajes antiguos
        bot.use(async (ctx, next) => {
            // Si no hay mensaje o no tiene fecha, continuar
            if (!ctx.message || !ctx.message.date) {
                return next();
            }

            // Calcular la antigüedad del mensaje en segundos
            const now = Math.floor(Date.now() / 1000);
            const messageTime = ctx.message.date;
            const messageAge = now - messageTime;

            // Descartar mensajes más antiguos que 5 minutos (300 segundos)
            const MAX_MESSAGE_AGE = 300;
            if (messageAge > MAX_MESSAGE_AGE) {
                logger.info(`Descartando mensaje antiguo (${messageAge} segundos)`, {
                    chatId: ctx.chat?.id,
                    text: ctx.message?.text
                });
                return; // No procesar este mensaje
            }

            return next();
        });

        // Middleware para logging
        bot.use(async (ctx, next) => {
            const start = Date.now();
            logger.info('Procesando update', {
                updateType: ctx.updateType,
                chatId: ctx.chat?.id,
                text: ctx.message?.text
            });

            try {
                await next();
                const ms = Date.now() - start;
                logger.info('Respuesta enviada', { ms });
            } catch (error) {
                logger.error('Error en middleware:', error);
                await ctx.reply('❌ Error al procesar el comando.');
            }
        });

        // Middleware de autorización (PRIMERO - más importante)
        bot.use(authMiddleware());

        // Agregar middleware de grupo
        bot.use(handleGroupUpdate);

        // Inicializar módulo de administración ANTES de CommandHandler para mayor prioridad
        logger.info('Inicializando módulo de administración...');
        const adminModule = new AdminModule(bot);
        adminModule.initialize();
        logger.info('✅ Módulo de administración inicializado');

        // Inicializar sistema de cálculo automático
        logger.info('Inicializando sistema de cálculo automático...');
        const calculationScheduler = new CalculationScheduler(bot);
        calculationScheduler.initialize();
        logger.info('✅ Sistema de cálculo automático inicializado');

        // Registrar comandos
        logger.info('Registrando comandos...');
        new CommandHandler(bot);
        logger.info('✅ Comandos registrados');

        // Manejador de errores global
        bot.catch((err, ctx) => {
            logger.error('Error no manejado:', {
                error: err.message,
                stack: err.stack
            });
            return ctx.reply('❌ Ocurrió un error inesperado.');
        });

        // Configurar graceful shutdown
        const handleShutdown = async signal => {
            if (isShuttingDown) return;

            logger.info('Iniciando apagado graceful', { signal });
            isShuttingDown = true;

            // AÑADIR AQUÍ: Detener NotificationManager antes del bot
            try {
                const notificationManager = getNotificationManager();
                if (notificationManager.isInitialized) {
                    notificationManager.stop();
                    logger.info('✅ Sistema de notificaciones detenido correctamente');
                }
            } catch (stopError) {
                logger.error('Error al detener sistema de notificaciones:', stopError);
            }

            // Detener sistema de cálculo automático
            try {
                calculationScheduler.stopAllJobs();
                logger.info('✅ Sistema de cálculo automático detenido correctamente');
            } catch (stopError) {
                logger.error('Error al detener sistema de cálculo:', stopError);
            }

            // Detener servicio de limpieza de estados
            try {
                stateCleanupService.stop();
                logger.info('✅ Servicio de limpieza de estados detenido correctamente');
            } catch (stopError) {
                logger.error('Error al detener servicio de limpieza de estados:', stopError);
            }

            setTimeout(async () => {
                try {
                    await bot.stop();
                    logger.info('Bot detenido correctamente');
                    process.exit(0);
                } catch (error) {
                    logger.error('Error durante el apagado', { error });
                    process.exit(1);
                }
            }, 3000);
        };

        process.once('SIGINT', () => handleShutdown('SIGINT'));
        process.once('SIGTERM', () => handleShutdown('SIGTERM'));

        await bot.launch();
        logger.info('🤖 Bot iniciado exitosamente');

        return bot;
    } catch (error) {
        logger.error('Error fatal al inicializar el bot:', error);
        throw error;
    }
}

initializeBot().catch(error => {
    logger.error('Error fatal, deteniendo el proceso:', error);
    process.exit(1);
});
