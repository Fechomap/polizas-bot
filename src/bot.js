const { Telegraf } = require('telegraf');
const express = require('express');
const connectDB = require('./database');
const logger = require('./utils/logger');
const config = require('./config');
const CommandHandler = require('./comandos/commandHandler');

const app = express();
const PORT = process.env.PORT || 3000;

let isShuttingDown = false;

async function initializeBot() {
    try {
        // Configurar servidor web básico para Heroku
        app.get('/', (req, res) => {
            res.send('Bot is running!');
        });

        // Iniciar servidor web
        app.listen(PORT, () => {
            logger.info(`Servidor web iniciado en puerto ${PORT}`);
        });

        // Conectar a la base de datos
        await connectDB();
        logger.info('✅ Base de datos conectada con éxito');

        // Crear instancia del bot
        const bot = new Telegraf(config.telegram.token);

        // Verificar conexión con Telegram
        const botInfo = await bot.telegram.getMe();
        logger.info('Bot conectado exitosamente a Telegram', {
            botName: botInfo.username,
            botId: botInfo.id
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

        // Iniciar el bot
        await bot.launch();
        logger.info('🤖 Bot iniciado exitosamente');

        return bot;
    } catch (error) {
        logger.error('Error fatal al inicializar el bot:', error);
        throw error;
    }
}

// Iniciar el bot
initializeBot().catch(error => {
    logger.error('Error fatal, deteniendo el proceso:', error);
    process.exit(1);
});