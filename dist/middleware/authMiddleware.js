"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../utils/logger"));
const authMiddleware = () => async (ctx, next) => {
    try {
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;
        const chatType = ctx.chat?.type;
        if (!chatId || !userId)
            return next();
        const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID) || 7143094298;
        const AUTHORIZED_GROUP_ID = process.env.AUTHORIZED_GROUP_ID
            ? parseInt(process.env.AUTHORIZED_GROUP_ID)
            : null;
        logger_1.default.debug('Verificando autorización', {
            chatId,
            userId,
            chatType,
            isAdmin: userId === ADMIN_USER_ID
        });
        if (userId === ADMIN_USER_ID) {
            logger_1.default.debug('Acceso concedido: Administrador principal');
            return next();
        }
        if (chatType === 'private') {
            logger_1.default.warn('Acceso denegado: Chat privado no autorizado', {
                userId,
                username: ctx.from?.username || 'sin_username'
            });
            await ctx.reply('🔒 *ACCESO RESTRINGIDO*\n\n' +
                'Este bot es de uso exclusivo para gestión interna.\n\n' +
                'Si necesitas asistencia, contacta al administrador.', { parse_mode: 'Markdown' });
            return;
        }
        if (['group', 'supergroup'].includes(chatType)) {
            if (AUTHORIZED_GROUP_ID && chatId !== AUTHORIZED_GROUP_ID) {
                logger_1.default.warn('Acceso denegado: Grupo no autorizado', {
                    chatId,
                    authorizedGroupId: AUTHORIZED_GROUP_ID
                });
                await ctx.reply('⛔ Este grupo no está autorizado para usar este bot.\n\n' +
                    'Contacta al administrador para más información.');
                return;
            }
            logger_1.default.debug('Acceso concedido: Grupo autorizado');
            return next();
        }
        logger_1.default.warn('Acceso denegado: Tipo de chat no soportado', {
            chatType,
            chatId
        });
        await ctx.reply('❌ Tipo de chat no soportado.');
        return;
    }
    catch (error) {
        logger_1.default.error('Error en middleware de autorización:', error);
        await ctx.reply('❌ Error de autorización. Acceso denegado.');
        return;
    }
};
exports.default = authMiddleware;
