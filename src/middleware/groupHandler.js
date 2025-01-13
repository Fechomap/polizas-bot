const config = require('../config');
const logger = require('../utils/logger');

const handleGroupUpdate = async (ctx, next) => {
    try {
        const chatId = ctx.chat?.id;
        const chatType = ctx.chat?.type;

        // Verificar si el grupo está permitido
        const isAllowed = config.telegram.allowedGroups.some(id => 
            Number(id) === Number(chatId)
        );

        if (!isAllowed) {
            logger.warn(`Intento de uso no autorizado: ${chatId} (${chatType})`);
            // Solo responder si es un grupo (no en privado)
            if (chatType !== 'private') {
                await ctx.reply('⛔️ Este bot solo puede ser usado en el grupo autorizado.');
            }
            return;
        }

        // Si es una actualización del tipo "my_chat_member", solo registrar
        if (ctx.update.my_chat_member) {
            logger.info(`Actualización de estado en grupo ${chatId}`);
            return next();
        }

        // Verificar permisos de administrador
        try {
            const member = await ctx.telegram.getChatMember(chatId, ctx.botInfo.id);
            if (member.status !== 'administrator') {
                logger.warn(`Bot sin permisos de administrador en ${chatId}`);
                await ctx.reply('⚠️ Por favor, asegúrate de darme permisos de administrador.');
                return;
            }
        } catch (error) {
            logger.error('Error verificando permisos:', error);
            return;
        }

        return next();
    } catch (error) {
        logger.error('Error en middleware de grupo:', error);
        if (!error.message.includes('bot was kicked')) {
            await ctx.reply('❌ Ocurrió un error inesperado.');
        }
    }
};

module.exports = handleGroupUpdate;