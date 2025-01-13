const logger = require('../utils/logger');

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const sendMessageWithRetry = async (bot, chatId, message, retryCount = 0) => {
    try {
        await bot.telegram.sendMessage(chatId, message);
    } catch (error) {
        if (error.code === 403 && retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return sendMessageWithRetry(bot, chatId, message, retryCount + 1);
        }
        throw error;
    }
};

const handleGroupUpdate = async (ctx, next) => {
    try {
        // Manejar actualización de supergrupo
        if (ctx.update.message?.migrate_to_chat_id) {
            const oldChatId = ctx.chat.id;
            const newChatId = ctx.update.message.migrate_to_chat_id;
            logger.info(`Grupo migrado de ${oldChatId} a ${newChatId}`);
            // Aquí podrías actualizar el ID en tu base de datos si lo necesitas
        }

        // Manejar cambios en el estado del bot en el grupo
        if (ctx.update.my_chat_member) {
            const chatId = ctx.update.my_chat_member.chat.id;
            const newStatus = ctx.update.my_chat_member.new_chat_member.status;
            logger.info(`Estado del bot actualizado en ${chatId}: ${newStatus}`);
        }

        await next();
    } catch (error) {
        logger.error('Error en el manejo del grupo:', error);
    }
};

const checkBotPermissions = async (ctx) => {
    try {
        const chatMember = await ctx.telegram.getChatMember(
            ctx.chat.id,
            ctx.botInfo.id
        );
        return chatMember.status === 'administrator';
    } catch (error) {
        logger.error('Error verificando permisos:', error);
        return false;
    }
};

module.exports = {
    handleGroupUpdate,
    checkBotPermissions,
    sendMessageWithRetry
};