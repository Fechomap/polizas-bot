const config = require('../config');
const logger = require('../utils/logger');

const handleGroupUpdate = async (ctx, next) => {
    try {
        const chatId = ctx.chat?.id;
        
        // Log the chat info but don't restrict access
        logger.info(`Chat access: ${chatId} (${ctx.chat?.type})`);
        
        // Si es una actualización del tipo "my_chat_member", solo registrar
        if (ctx.update.my_chat_member) {
            logger.info(`Actualización de estado en grupo ${chatId}`);
            return next();
        }

        // Always allow access
        return next();
    } catch (error) {
        logger.error('Error en middleware de grupo:', error);
        if (!error.message.includes('bot was kicked')) {
            await ctx.reply('❌ Ocurrió un error inesperado.');
        }
    }
};

module.exports = handleGroupUpdate;
