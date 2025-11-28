import logger from '../utils/logger';
import type { Context } from 'telegraf';

/**
 * Middleware de autorización general del bot
 * Controla quién puede usar el bot según el tipo de chat
 */
const authMiddleware =
    () =>
    async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        try {
            const chatId = ctx.chat?.id;
            const userId = ctx.from?.id;
            const chatType = ctx.chat?.type;

            if (!chatId || !userId) return next();

            // ID del administrador principal del .env
            const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0');

            // ID del grupo autorizado del .env (opcional)
            const AUTHORIZED_GROUP_ID = process.env.AUTHORIZED_GROUP_ID
                ? parseInt(process.env.AUTHORIZED_GROUP_ID)
                : null;

            logger.debug('Verificando autorización', {
                chatId,
                userId,
                chatType,
                isAdmin: userId === ADMIN_USER_ID
            });

            // REGLAS DE AUTORIZACIÓN:

            // 1. ADMINISTRADOR PRINCIPAL: Acceso total en cualquier chat
            if (userId === ADMIN_USER_ID) {
                logger.debug('Acceso concedido: Administrador principal');
                return next();
            }

            // 2. CHAT PRIVADO: Solo el administrador puede usar el bot
            if (chatType === 'private') {
                logger.warn('Acceso denegado: Chat privado no autorizado', {
                    userId,
                    username: ctx.from?.username ?? 'sin_username'
                });

                await ctx.reply(
                    '🔒 *ACCESO RESTRINGIDO*\n\n' +
                        'Este bot es de uso exclusivo para gestión interna.\n\n' +
                        'Si necesitas asistencia, contacta al administrador.',
                    { parse_mode: 'Markdown' }
                );
                return; // No continuar
            }

            // 3. GRUPOS: Verificar si es el grupo autorizado
            if (['group', 'supergroup'].includes(chatType as string)) {
                // Si hay grupo específico configurado, verificar
                if (AUTHORIZED_GROUP_ID && chatId !== AUTHORIZED_GROUP_ID) {
                    logger.warn('Acceso denegado: Grupo no autorizado', {
                        chatId,
                        authorizedGroupId: AUTHORIZED_GROUP_ID
                    });

                    await ctx.reply(
                        '⛔ Este grupo no está autorizado para usar este bot.\n\n' +
                            'Contacta al administrador para más información.'
                    );
                    return; // No continuar
                }

                // Grupo autorizado o sin restricción específica
                logger.debug('Acceso concedido: Grupo autorizado');
                return next();
            }

            // 4. OTROS TIPOS DE CHAT: Denegar por defecto
            logger.warn('Acceso denegado: Tipo de chat no soportado', {
                chatType,
                chatId
            });

            await ctx.reply('❌ Tipo de chat no soportado.');
            return; // No continuar
        } catch (error: any) {
            logger.error('Error en middleware de autorización:', error);

            // En caso de error, denegar acceso por seguridad
            await ctx.reply('❌ Error de autorización. Acceso denegado.');
            return; // No continuar
        }
    };

export default authMiddleware;
