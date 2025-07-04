const logger = require('../../utils/logger');
const config = require('../../config');

// Caché de permisos para optimizar validaciones
const adminCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

class AdminAuth {
    /**
   * Verifica si un usuario es administrador del grupo
   */
    static async isAdmin(ctx) {
        try {
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;

            if (!userId || !chatId) return false;

            // Verificar caché
            const cacheKey = `${chatId}:${userId}`;
            const cached = adminCache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                return cached.isAdmin;
            }

            // Obtener información del miembro
            const member = await ctx.getChatMember(userId);
            const isAdmin = ['creator', 'administrator'].includes(member.status);

            // Guardar en caché
            adminCache.set(cacheKey, {
                isAdmin,
                timestamp: Date.now()
            });

            return isAdmin;
        } catch (error) {
            logger.error('Error verificando permisos de admin:', error);
            return false;
        }
    }

    /**
   * Middleware que permite continuar solo si el usuario es admin
   */
    static async requireAdmin(ctx, next) {
        const isAdmin = await AdminAuth.isAdmin(ctx);

        if (!isAdmin) {
            await ctx.reply('⛔ No tienes permisos para usar esta función. Solo administradores.');
            return;
        }

        return next();
    }

    /**
   * Middleware general para logging de acciones admin
   */
    static async middleware(ctx, next) {
    // Solo procesar si es una acción admin
        if (ctx.update.callback_query?.data?.startsWith('admin_') ||
        ctx.message?.text?.startsWith('/admin')) {

            const userId = ctx.from?.id;
            const username = ctx.from?.username || ctx.from?.first_name || 'Unknown';
            const action = ctx.update.callback_query?.data || ctx.message?.text;

            logger.info(`Acción admin solicitada: ${action} por @${username} (${userId})`);
        }

        return next();
    }

    /**
   * Limpiar caché de permisos
   */
    static clearCache() {
        adminCache.clear();
    }

    /**
   * Limpiar caché antiguo periódicamente
   */
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

// Iniciar limpieza de caché
AdminAuth.startCacheCleanup();

module.exports = AdminAuth;
