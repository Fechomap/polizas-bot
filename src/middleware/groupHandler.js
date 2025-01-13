const config = require('../config');
const logger = require('../utils/logger');

const handleGroupUpdate = async (ctx, next) => {
    try {
        // Si es un chat privado, continuar sin verificaciones
        if (ctx.chat?.type === 'private') {
            return next();
        }

        const chatId = ctx.chat.id;

        // Verificar si el grupo está permitido
        const isAllowed = config.telegram.allowedGroups.some(id => 
            Number(id) === Number(chatId)
        );

        if (!isAllowed) {
            logger.warn(`Grupo no autorizado: ${chatId}`);
            await ctx.reply('⛔️ Este bot solo puede ser usado en grupos autorizados.');
            return;
        }

        // Verificar permisos de administrador solo si es necesario
        if (ctx.message?.text?.startsWith('/')) {
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
        }

        // Si todo está bien, continuar
        return next();
    } catch (error) {
        logger.error('Error en middleware de grupo:', error);
        await ctx.reply('❌ Ocurrió un error inesperado.');
    }
};

module.exports = handleGroupUpdate;