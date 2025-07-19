import { getInstance as getNavigationManager } from './NavigationManager';
import logger from '../utils/logger';
import type { Context } from 'telegraf';

// Navigation properties type
type NavigationContext = Context & {
    navManager?: any;
    navigationHandled?: boolean;
    answered?: boolean;
    state?: {
        isError?: boolean;
        [key: string]: any;
    };
};

/**
 * 🔄 Navigation Middleware - Navegación Persistente Automática
 *
 * Middleware que automáticamente agrega navegación persistente
 * a todas las respuestas del bot que no la manejen explícitamente
 */

/**
 * Middleware principal de navegación
 * Se ejecuta después de cada comando/acción para agregar navegación
 */
const navigationMiddleware = async (
    ctx: NavigationContext,
    next: () => Promise<void>
): Promise<void> => {
    try {
        // Inyectar NavigationManager en el contexto
        ctx.navManager = getNavigationManager();

        // Marcar que navegación no ha sido manejada
        ctx.navigationHandled = false;

        // Ejecutar el siguiente middleware/handler
        await next();

        // Si la navegación no fue manejada explícitamente, agregarla
        if (!ctx.navigationHandled && ctx.from?.id) {
            await addAutomaticNavigation(ctx);
        }
    } catch (error: any) {
        logger.error('Error en navigation middleware:', error);
        // Continuar sin navegación en caso de error
    }
};

/**
 * 🔄 Agrega navegación automática si no se manejó explícitamente
 * @param ctx - Contexto de Telegraf
 */
async function addAutomaticNavigation(ctx: NavigationContext): Promise<void> {
    try {
        const userId = ctx.from!.id.toString();
        const navManager = ctx.navManager;

        // Solo agregar navegación si fue una interacción que esperamos respuesta
        if (!shouldAddNavigation(ctx)) {
            return;
        }

        // Obtener el menú principal como fallback
        const mainMenu = navManager.getMainMenu(userId);

        // Enviar menú como mensaje separado si no hay mensaje previo para editar
        if (!ctx.callbackQuery) {
            await ctx.reply('🧭 Navegación disponible:', {
                parse_mode: 'Markdown',
                ...mainMenu.markup
            });
        }

        logger.debug('Navegación automática agregada', {
            userId,
            hasCallbackQuery: !!ctx.callbackQuery,
            chatId: ctx.chat?.id
        });
    } catch (error: any) {
        logger.error('Error agregando navegación automática:', error);
    }
}

/**
 * 🎯 Determina si se debe agregar navegación automática
 * @param ctx - Contexto de Telegraf
 * @returns Si debe agregar navegación
 */
function shouldAddNavigation(ctx: NavigationContext): boolean {
    // No agregar navegación en estos casos:

    // 1. Si es un comando de start (ya tiene su propio menú)
    if ((ctx.message as any)?.text?.startsWith('/start')) {
        return false;
    }

    // 2. Si es una respuesta a un callback ya manejado
    if (ctx.callbackQuery && ctx.answered) {
        return false;
    }

    // 3. Si es un mensaje de error (ya manejado)
    if (ctx.state?.isError) {
        return false;
    }

    // 4. Si es parte de un flujo activo (BD AUTOS, Admin, etc.)
    if (isInActiveFlow(ctx)) {
        return false;
    }

    return true;
}

/**
 * 🔍 Verifica si el usuario está en un flujo activo
 * @param ctx - Contexto de Telegraf
 * @returns Si está en flujo activo
 */
function isInActiveFlow(ctx: NavigationContext): boolean {
    try {
        const userId = ctx.from!.id.toString();
        const chatId = ctx.chat?.id;

        if (!chatId) return false;

        // Verificar flujos BD AUTOS
        try {
            const {
                VehicleRegistrationHandler
            } = require('../comandos/comandos/VehicleRegistrationHandler');
            const {
                PolicyAssignmentHandler
            } = require('../comandos/comandos/PolicyAssignmentHandler');

            const threadId = (ctx.message as any)?.message_thread_id || null;

            if (VehicleRegistrationHandler?.tieneRegistroEnProceso?.(userId, chatId, threadId)) {
                return true;
            }

            if (PolicyAssignmentHandler?.tieneAsignacionEnProceso?.(userId, chatId, threadId)) {
                return true;
            }
        } catch {
            // Ignorar errores de módulos no encontrados
        }

        // Verificar flujos Admin
        try {
            const AdminStateManager = require('../admin/utils/adminStates').default;
            if (AdminStateManager?.hasActiveState?.(userId, chatId)) {
                return true;
            }
        } catch {
            // Ignorar errores de módulos no encontrados
        }

        return false;
    } catch (error: any) {
        logger.debug('Error verificando flujos activos:', error);
        return false; // En caso de error, permitir navegación
    }
}

/**
 * 🎛️ Función helper para marcar navegación como manejada
 * @param ctx - Contexto de Telegraf
 */
function markNavigationHandled(ctx: NavigationContext): void {
    if (ctx) {
        ctx.navigationHandled = true;
    }
}

/**
 * 🧭 Agrega navegación persistente a respuesta específica
 * @param ctx - Contexto de Telegraf
 * @param text - Texto del mensaje
 * @param options - Opciones adicionales
 * @returns Opciones con navegación agregada
 */
function addNavigationToResponse(
    ctx: NavigationContext,
    text: string,
    options: Record<string, any> = {}
): Record<string, any> {
    try {
        const userId = ctx.from?.id?.toString();
        if (!userId || !ctx.navManager) {
            return { text, ...options };
        }

        const navManager = ctx.navManager;
        const response = navManager.addPersistentNavigation(text, userId, options);

        // Marcar como manejada
        markNavigationHandled(ctx);

        return {
            ...options,
            ...response.markup,
            parse_mode: response.parseMode
        };
    } catch (error: any) {
        logger.error('Error agregando navegación a respuesta:', error);
        return { text, ...options };
    }
}

interface MiddlewareStats {
    totalUsers: number;
    activeUsers: number;
    totalContexts: number;
    averageStackSize: string;
    middlewareVersion: string;
    lastUpdate: string;
}

/**
 * 📊 Obtiene estadísticas del middleware
 * @returns Estadísticas de uso
 */
function getMiddlewareStats(): MiddlewareStats {
    const navManager = getNavigationManager();
    return {
        ...navManager.getNavigationStats(),
        middlewareVersion: '1.0.0',
        lastUpdate: new Date().toISOString()
    };
}

export {
    navigationMiddleware,
    markNavigationHandled,
    addNavigationToResponse,
    getMiddlewareStats,
    isInActiveFlow,
    shouldAddNavigation
};

export default navigationMiddleware;
