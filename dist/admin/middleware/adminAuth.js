"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../../utils/logger"));
const adminCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;
class AdminAuth {
    static async isAdmin(ctx) {
        try {
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            if (!userId || !chatId)
                return false;
            const MAIN_ADMIN_ID = parseInt(process.env.ADMIN_USER_ID || '0');
            if (!MAIN_ADMIN_ID) {
                logger_1.default.error('ADMIN_USER_ID no configurado en variables de entorno');
                return false;
            }
            if (userId === MAIN_ADMIN_ID) {
                return true;
            }
            if (ctx.chat.type === 'private') {
                return userId === MAIN_ADMIN_ID;
            }
            const cacheKey = `${chatId}:${userId}`;
            const cached = adminCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                return cached.isAdmin;
            }
            try {
                const member = await ctx.getChatMember(userId);
                const isAdmin = ['creator', 'administrator'].includes(member.status);
                adminCache.set(cacheKey, {
                    isAdmin,
                    timestamp: Date.now()
                });
                return isAdmin;
            }
            catch (groupError) {
                logger_1.default.warn('No se pudieron verificar permisos en grupo:', groupError.message);
                return false;
            }
        }
        catch (error) {
            logger_1.default.error('Error verificando permisos de admin:', error);
            return false;
        }
    }
    static async requireAdmin(ctx, next) {
        const isAdmin = await AdminAuth.isAdmin(ctx);
        if (!isAdmin) {
            await ctx.reply('⛔ No tienes permisos para usar esta función. Solo administradores.');
            return;
        }
        return next();
    }
    static async middleware(ctx, next) {
        if (ctx.update.callback_query?.data?.startsWith('admin_') ||
            ctx.message?.text?.startsWith('/admin')) {
            const userId = ctx.from?.id;
            const username = ctx.from?.username || ctx.from?.first_name || 'Unknown';
            const action = ctx.update.callback_query?.data || ctx.message?.text;
            logger_1.default.info(`Acción admin solicitada: ${action} por @${username} (${userId})`);
        }
        return next();
    }
    static clearCache() {
        adminCache.clear();
    }
    static startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of adminCache.entries()) {
                if (now - value.timestamp > CACHE_DURATION) {
                    adminCache.delete(key);
                }
            }
        }, CACHE_DURATION);
    }
}
AdminAuth.startCacheCleanup();
exports.default = AdminAuth;
