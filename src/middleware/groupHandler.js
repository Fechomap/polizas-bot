const config = require('../config');
const logger = require('../utils/logger');

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const checkBotPermissions = async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
        return member.status === 'administrator';
    } catch (error) {
        logger.error('Error verificando permisos:', error);
        return false;
    }
};

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

const isAllowedGroup = (chatId) => {
    if (!config.telegram.allowedGroups) return false;
    const numericChatId = Number(chatId);
    return config.telegram.allowedGroups.some(id => Number(id) === numericChatId);
};

const handleGroupUpdate = async (ctx, next) => {
    try {
        if (ctx.chat?.type === 'private') {
            return next();
        }

        const chatId = ctx.chat.id;

        // Verificar si es un grupo permitido
        if (!isAllowedGroup(chatId)) {
            logger.warn(`Acceso denegado a grupo no autorizado: ${chatId}`);
            await ctx.reply('⛔️ Este bot solo puede ser usado en grupos autorizados.');
            return;
        }

        // Manejar actualización a supergrupo
        if (ctx.update.message?.migrate_to_chat_id) {
            const newChatId = ctx.update.message.migrate_to_chat_id;
            logger.info(`Grupo migrado: ${chatId} -> ${newChatId}`);
        }

        // Solo verificar permisos para comandos
        if (ctx.message?.text?.startsWith('/')) {
            const hasPermissions = await checkBotPermissions(ctx);
            if (!hasPermissions) {
                logger.warn('Bot necesita permisos de administrador', { chatId });
                await ctx.reply('⚠️ Por favor, dame permisos de administrador para funcionar correctamente.');
                return;
            }
        }

        return next();
    } catch (error) {
        logger.error('Error en middleware de grupo:', error);
    }
};

module.exports = {
    handleGroupUpdate,
    sendMessageWithRetry,
    isAllowedGroup,
    checkBotPermissions
};