import { Context } from 'telegraf';
import { ChatMember } from 'telegraf/typings/core/types/typegram';
import logger from '../../utils/logger';
import config from '../../config';

// Caché de permisos para optimizar validaciones
const adminCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

class AdminAuth {
    /**
     * Verifica si un usuario es administrador
     *
     * SISTEMA DE AUTORIZACIÓN:
     * 1. CHAT PRIVADO: Solo el ADMIN_USER_ID puede acceder
     * 2. GRUPOS: Administradores de Telegram + ADMIN_USER_ID
     * 3. SUPERADMIN: ADMIN_USER_ID tiene acceso total siempre
     */
    static async isAdmin(ctx: Context): Promise<boolean> {
        try {
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;

            if (!userId || !chatId) return false;

            // ADMINISTRADOR PRINCIPAL - ID específico para acceso total
            const MAIN_ADMIN_ID = parseInt(process.env.ADMIN_USER_ID || '0');
            if (!MAIN_ADMIN_ID) {
                logger.error('ADMIN_USER_ID no configurado en variables de entorno');
                return false;
            }

            if (userId === MAIN_ADMIN_ID) {
                return true;
            }

            // Para chats privados, solo el administrador principal
            if (ctx.chat.type === 'private') {
                return userId === MAIN_ADMIN_ID;
            }

            // Verificar caché para grupos
            const cacheKey = `${chatId}:${userId}`;
            const cached = adminCache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                return cached.isAdmin;
            }

            // Para grupos: verificar permisos de Telegram
            try {
                const member = await ctx.getChatMember(userId);
                const isAdmin = ['creator', 'administrator'].includes(member.status);

                // Guardar en caché
                adminCache.set(cacheKey, {
                    isAdmin,
                    timestamp: Date.now()
                });

                return isAdmin;
            } catch (groupError) {
                // Si falla getChatMember, denegar acceso
                logger.warn(
                    'No se pudieron verificar permisos en grupo:',
                    (groupError as Error).message
                );
                return false;
            }
        } catch (error) {
            logger.error('Error verificando permisos de admin:', error);
            return false;
        }
    }

    /**
     * Middleware que permite continuar solo si el usuario es admin
     */
    static async requireAdmin(ctx: Context, next: () => Promise<void>): Promise<void> {
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
    static async middleware(ctx: Context, next: () => Promise<void>): Promise<void> {
        // Solo procesar si es una acción admin
        if (
            (ctx.update as any).callback_query?.data?.startsWith('admin_') ||
            (ctx.message as any)?.text?.startsWith('/admin')
        ) {
            const userId = ctx.from?.id;
            const username = ctx.from?.username || ctx.from?.first_name || 'Unknown';
            const action = (ctx.update as any).callback_query?.data || (ctx.message as any)?.text;

            logger.info(`Acción admin solicitada: ${action} por @${username} (${userId})`);
        }

        return next();
    }

    /**
     * Limpiar caché de permisos
     */
    static clearCache(): void {
        adminCache.clear();
    }

    /**
     * Limpiar caché antiguo periódicamente
     */
    static startCacheCleanup(): void {
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

export default AdminAuth;
