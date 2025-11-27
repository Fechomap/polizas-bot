import { Telegraf, Context } from 'telegraf';
import express from 'express';
import https from 'https';
import connectDB from './database';
import logger from './utils/logger';
import config from './config';
import CommandHandler from './comandos/commandHandler';
import handleGroupUpdate from './middleware/groupHandler';
import authMiddleware from './middleware/authMiddleware';
import { getInstance as getNotificationManager } from './services/NotificationManager';
import { RedisSessionStore } from './state/RedisSessionStore';

// 🚀 TYPESCRIPT MIGRATION CONFIRMED - DÍA 15 COMPLETADO! 🚀
import stateCleanupService from './utils/StateCleanupService';
import AdminModule from './admin';
import CalculationScheduler from './admin/utils/calculationScheduler';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { notificationQueue, initializeNotificationConsumer } from './queues/NotificationQueue';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT inválido en configuración');
}

if (!config.telegram.token) {
    throw new Error('TELEGRAM_BOT_TOKEN no configurado en .env');
}

if (!config.mongodb.uri) {
    throw new Error('MONGO_URI no configurado en .env');
}

// Validar ID de grupo principal
if (!process.env.TELEGRAM_GROUP_ID) {
    logger.warn('TELEGRAM_GROUP_ID no configurado en .env. Usando valor por defecto (Riesgoso).');
}

let isShuttingDown = false;

async function initializeBot(): Promise<Telegraf> {
    try {
        app.get('/', (req, res) => {
            res.send('Bot is running!');
        });

        // Configurar Bull Board UI
        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');

        createBullBoard({
            queues: [new BullAdapter(notificationQueue)],
            serverAdapter: serverAdapter
        });

        app.use('/admin/queues', serverAdapter.getRouter());
        logger.info(`✅ Bull Board UI disponible en /admin/queues`);

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

        // Configurar agente HTTPS con timeouts mejorados para alertas rápidas
        const httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 10000,
            timeout: 10000, // 10 segundos para conexiones (reducido para alertas)
            maxSockets: 10 // Permitir múltiples conexiones simultáneas para alertas
        });

        const bot = new Telegraf(config.telegram.token, {
            telegram: {
                agent: httpsAgent,
                webhookReply: false
            },
            handlerTimeout: 90000 // 90 segundos para handlers
        });

        // Inicializar NotificationManager
        try {
            const notificationManager = getNotificationManager(bot);
            await notificationManager.initialize();
            logger.info('✅ Sistema de notificaciones (legacy) inicializado correctamente');

            // Inicializar consumidor de la cola de notificaciones
            initializeNotificationConsumer(bot);
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
        bot.use(async (ctx: Context, next: () => Promise<void>) => {
            // Si no hay mensaje o no tiene fecha, continuar
            if (!ctx.message || !('date' in ctx.message)) {
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
                    text: 'text' in ctx.message ? ctx.message.text : undefined
                });
                return; // No procesar este mensaje
            }

            return next();
        });

        // Middleware para logging
        bot.use(async (ctx: Context, next: () => Promise<void>) => {
            const start = Date.now();
            logger.info('Procesando update', {
                updateType: ctx.updateType,
                chatId: ctx.chat?.id,
                text: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
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

        // Middleware de sesión con Redis (NUEVO)
        // Usamos require para evitar problemas de resolución de módulos con esta librería beta
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const session = require('@telegraf/session');
        bot.use(
            session({
                store: new RedisSessionStore()
            })
        );
        logger.info('✅ Middleware de sesión con Redis configurado');

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
        bot.catch((err: unknown, ctx: Context) => {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error('Error no manejado:', {
                error: error.message,
                stack: error.stack
            });
            ctx.reply('❌ Ocurrió un error inesperado.');
        });

        // Configurar graceful shutdown
        const handleShutdown = async (signal: string): Promise<void> => {
            if (isShuttingDown) return;

            logger.info('Iniciando apagado graceful', { signal });
            isShuttingDown = true;

            // Detener NotificationManager antes del bot
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
