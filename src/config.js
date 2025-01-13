const logger = require('../utils/logger');
const config = require('../config');

const isAllowedGroup = (chatId) => {
    return config.telegram.allowedGroups.includes(Number(chatId));
};

const handleGroupUpdate = async (ctx, next) => {
    try {
        // Verificar si es un grupo
        if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
            const chatId = ctx.chat.id;

            // Si el grupo no está permitido, registrar y salir
            if (!isAllowedGroup(chatId)) {
                logger.warn(`Intento de uso en grupo no autorizado: ${chatId}`);
                await ctx.reply('⛔️ Este bot solo puede ser usado en el grupo autorizado.');
                return;
            }

            // Manejar migración a supergrupo
            if (ctx.update.message?.migrate_to_chat_id) {
                const newChatId = ctx.update.message.migrate_to_chat_id;
                logger.info(`Grupo migrado: ${chatId} -> ${newChatId}`);
                
                // Aquí podrías actualizar la lista de grupos permitidos si lo necesitas
                config.telegram.allowedGroups = config.telegram.allowedGroups
                    .map(id => id === chatId ? newChatId : id);
                
                logger.info('Lista de grupos actualizada', {
                    allowedGroups: config.telegram.allowedGroups
                });
            }

            // Verificar permisos del bot
            const member = await ctx.telegram.getChatMember(chatId, ctx.botInfo.id);
            if (member.status !== 'administrator') {
                logger.warn(`Bot sin permisos de administrador en ${chatId}`);
                await ctx.reply('⚠️ El bot necesita permisos de administrador para funcionar correctamente.');
                return;
            }
        }

        return next();
    } catch (error) {
        logger.error('Error en middleware de grupo:', error);
        if (error.code !== 403) { // Ignorar errores de permiso
            await ctx.reply('❌ Error al procesar la solicitud.');
        }
    }
};

module.exports = {
    handleGroupUpdate,
    isAllowedGroup
};