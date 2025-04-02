const { Telegraf } = require('telegraf');
const express = require('express');
const connectDB = require('./database');
const logger = require('./utils/logger');
const config = require('./config');
const CommandHandler = require('./comandos/commandHandler');
const handleGroupUpdate = require('./middleware/groupHandler');

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

        // Agregar middleware de grupo
        bot.use(handleGroupUpdate);

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
