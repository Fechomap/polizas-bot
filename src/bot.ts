import { Telegraf, Context, session } from 'telegraf';
import express from 'express';
import https from 'https';
import logger from './utils/logger';
import config from './config';
import CommandHandler from './comandos/commandHandler';
import handleGroupUpdate from './middleware/groupHandler';
import authMiddleware from './middleware/authMiddleware';
import { getInstance as getNotificationManager } from './services/NotificationManager';
import { RedisSessionStore } from './state/RedisSessionStore';

// Sistema centralizado de estados
import { getUnifiedStateManager } from './state/UnifiedStateManager';
import stateCleanupService from './utils/StateCleanupService';
import AdminModule from './admin';
import CalculationScheduler from './admin/utils/calculationScheduler';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
    notificationQueue,
    initializeNotificationConsumer,
    closeNotificationQueue
} from './queues/NotificationQueue';
import RedisConnectionPool from './infrastructure/RedisConnectionPool';
import { stopInstance as stopNavigationManager } from './navigation/NavigationManager';
import adminStateManager from './admin/utils/adminStates';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? '3000', 10);

if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT inválido en configuración');
}

// Detectar entorno de producción (Railway)
const isProduction = process.env.NODE_ENV === 'production';
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
const webhookPath = '/webhook';
const webhookUrl = railwayDomain ? `https://${railwayDomain}${webhookPath}` : null;

if (!config.telegram.token) {
    throw new Error('TELEGRAM_BOT_TOKEN no configurado en .env');
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

        // Health check endpoint para Railway
        app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                mode: webhookUrl ? 'webhook' : 'polling'
            });
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

        logger.info('✅ PostgreSQL/Prisma listo');

        // Inicializar UnifiedStateManager ANTES de todo (garantiza conexión Redis)
        const unifiedStateManager = await getUnifiedStateManager();
        const stateStats = await unifiedStateManager.getStats();
        logger.info('✅ UnifiedStateManager inicializado', {
            redisConnected: stateStats.redisConnected,
            ttlSeconds: stateStats.ttlSeconds
        });

        // Registrar UnifiedStateManager como provider de cleanup
        stateCleanupService.registerStateProvider(
            {
                async cleanup(cutoffTime: number): Promise<number> {
                    // Redis maneja TTL automáticamente, pero forzamos limpieza del cache L1
                    return unifiedStateManager.cleanup(cutoffTime);
                }
            },
            'UnifiedStateManager'
        );

        // Iniciar servicio de limpieza automática de estados
        stateCleanupService.start(
            config.ttl.cleanupInterval, // 15 minutos desde config
            config.ttl.session // TTL de 1 hora desde config
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
            if (notificationManager) {
                await notificationManager.initialize();
                logger.info('✅ Sistema de notificaciones (legacy) inicializado correctamente');
            }

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

        // Middleware de sesión - SIEMPRE Redis (dev=DB1, prod=DB0)
        const sessionStore = new RedisSessionStore();
        bot.use(
            session({
                store: {
                    get: (key: string) => sessionStore.get(key),
                    set: (key: string, value: any) => sessionStore.set(key, value),
                    delete: (key: string) => sessionStore.delete(key)
                }
            })
        );
        logger.info('✅ Middleware de sesión con Redis configurado', {
            redisDb: config.redis.db,
            environment: config.isDevelopment ? 'desarrollo' : 'producción'
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
                if (notificationManager?.isInitialized) {
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

            // Detener AdminStateManager
            try {
                adminStateManager.stop();
                logger.info('✅ AdminStateManager detenido correctamente');
            } catch (stopError) {
                logger.error('Error al detener AdminStateManager:', stopError);
            }

            // Detener NavigationManager
            try {
                stopNavigationManager();
                logger.info('✅ NavigationManager detenido correctamente');
            } catch (stopError) {
                logger.error('Error al detener NavigationManager:', stopError);
            }

            // Cerrar cola de notificaciones (Bull - tiene su propia conexión Redis)
            try {
                await closeNotificationQueue();
                logger.info('✅ Cola de notificaciones cerrada correctamente');
            } catch (queueError) {
                logger.error('Error cerrando cola de notificaciones:', queueError);
            }

            // Cerrar pool de conexiones Redis (principal)
            try {
                await RedisConnectionPool.disconnect();
                logger.info('✅ Pool de conexiones Redis cerrado correctamente');
            } catch (redisError) {
                logger.error('Error cerrando pool Redis:', redisError);
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

        // Iniciar bot según entorno
        if (isProduction && webhookUrl) {
            // Producción (Railway): Usar webhook
            logger.info('🌐 Configurando modo WEBHOOK', { webhookUrl });

            // Registrar endpoint de webhook
            app.use(webhookPath, bot.webhookCallback(webhookPath));

            // Configurar webhook en Telegram
            await bot.telegram.setWebhook(webhookUrl, {
                drop_pending_updates: true
            });

            logger.info('🤖 Bot iniciado en modo WEBHOOK', { webhookUrl });
        } else {
            // Desarrollo: Usar polling
            logger.info('🔄 Configurando modo POLLING (desarrollo)');

            // Eliminar webhook si existía
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });

            await bot.launch();
            logger.info('🤖 Bot iniciado en modo POLLING');
        }

        // Iniciar servidor Express AL FINAL (después de configurar todo)
        app.listen(PORT, () => {
            logger.info(`Servidor web iniciado en puerto ${PORT}`);
        });

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
