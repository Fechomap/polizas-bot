// src/middleware/groupHandler.js
const config = require('../config');
const logger = require('../utils/logger');
const StateKeyManager = require('../utils/StateKeyManager');

const handleGroupUpdate = async (ctx, next) => {
    try {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return next(); // Si no hay chat, permitir (podría ser una actualización interna)
        }

        // Extraer threadId si existe
        const threadId = StateKeyManager.getThreadId(ctx);

        // Log mejorado
        logger.info('Chat access:', {
            chatId,
            chatType: ctx.chat?.type,
            threadId: threadId || 'ninguno',
            messageType: ctx.updateType
        });

        // Si es una actualización del tipo "my_chat_member", solo registrar
        if (ctx.update.my_chat_member) {
            logger.info('Actualización de estado en grupo', {
                chatId,
                threadId: threadId || 'ninguno'
            });
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
