const { Telegraf } = require('telegraf');
const express = require('express');
const connectDB = require('./database');
const logger = require('./utils/logger');
const config = require('./config');
const CommandHandler = require('./comandos/commandHandler');
const { 
    handleGroupUpdate, 
    checkBotPermissions, 
    sendMessageWithRetry 
} = require('./middleware/groupHandler');

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

        const bot = new Telegraf(config.telegram.token);

        const botInfo = await bot.telegram.getMe();
        logger.info('Bot conectado exitosamente a Telegram', {
            botName: botInfo.username,
            botId: botInfo.id
        });

        // Middleware para manejar actualizaciones de grupo
        bot.use(handleGroupUpdate);

        // Middleware para logging y verificación de permisos
        bot.use(async (ctx, next) => {
            const start = Date.now();
            logger.info('Procesando update', {
                updateType: ctx.updateType,
                chatId: ctx.chat?.id,
                text: ctx.message?.text
            });
        
            try {
                // Verificar si es un grupo y si el bot tiene los permisos necesarios
                if (ctx.chat?.type !== 'private') {
                    const hasPermissions = await checkBotPermissions(ctx);
                    if (!hasPermissions) {
                        logger.warn('Bot sin permisos de administrador', {
                            chatId: ctx.chat.id
                        });
                        return await sendMessageWithRetry(
                            bot,
                            ctx.chat.id,
                            '⚠️ El bot necesita permisos de administrador para funcionar correctamente.'
                        );
                    }
                }
        
                await next();
                const ms = Date.now() - start;
                logger.info('Respuesta enviada', { ms });
            } catch (error) {
                logger.error('Error en middleware:', error);
                try {
                    await sendMessageWithRetry(
                        bot,
                        ctx.chat.id,
                        '❌ Error al procesar el comando.'
                    );
                } catch (sendError) {
                    logger.error('Error enviando mensaje de error:', sendError);
                }
            }
        });

        logger.info('Registrando comandos...');
        new CommandHandler(bot);
        logger.info('✅ Comandos registrados');

        bot.catch((err, ctx) => {
            logger.error('Error no manejado:', {
                error: err.message,
                stack: err.stack
            });
            return sendMessageWithRetry(
                bot,
                ctx.chat.id,
                '❌ Ocurrió un error inesperado.'
            );
        });

        const handleShutdown = async (signal) => {
            if (isShuttingDown) return;
            
            logger.info(`Iniciando apagado graceful`, { signal });
            isShuttingDown = true;

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