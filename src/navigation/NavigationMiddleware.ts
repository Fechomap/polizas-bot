import { getInstance as getNavigationManager } from './NavigationManager';
import logger from '../utils/logger';
import type { Context } from 'telegraf';

// Cachear singleton al inicio del módulo (evita getInstance en cada request)
const navManager = getNavigationManager();

// Cachear imports de handlers (evita require() dinámico en cada request)
let VehicleRegistrationHandler: any = null;
let PolicyAssignmentHandler: any = null;
let AdminStateManager: any = null;

try {
    VehicleRegistrationHandler =
        require('../comandos/comandos/VehicleRegistrationHandler').VehicleRegistrationHandler;
    PolicyAssignmentHandler =
        require('../comandos/comandos/PolicyAssignmentHandler').PolicyAssignmentHandler;
    AdminStateManager = require('../admin/utils/adminStates').default;
} catch {
    // Módulos no disponibles
}

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
 * OPTIMIZADO: Sin logs debug, imports cacheados
 */

const navigationMiddleware = async (
    ctx: NavigationContext,
    next: () => Promise<void>
): Promise<void> => {
    // Early return para updates que no necesitan navegación
    if (!ctx.message && !ctx.callbackQuery) {
        return next();
    }

    try {
        ctx.navManager = navManager;
        ctx.navigationHandled = false;

        await next();

        if (!ctx.navigationHandled && ctx.from?.id) {
            await addAutomaticNavigation(ctx);
        }
    } catch (error: any) {
        logger.error('Error en navigation middleware:', error);
    }
};

/**
 * 🔄 Agrega navegación automática si no se manejó explícitamente
 */
async function addAutomaticNavigation(ctx: NavigationContext): Promise<void> {
    try {
        if (!shouldAddNavigation(ctx)) return;

        const userId = ctx.from!.id.toString();
        const mainMenu = navManager.getMainMenu(userId);

        if (!ctx.callbackQuery) {
            await ctx.reply('🧭 Navegación disponible:', {
                parse_mode: 'Markdown',
                ...mainMenu.markup
            });
        }
    } catch (error: any) {
        logger.error('Error agregando navegación automática:', error);
    }
}

/**
 * 🎯 Determina si se debe agregar navegación automática
 */
function shouldAddNavigation(ctx: NavigationContext): boolean {
    // No agregar en /start
    if ((ctx.message as any)?.text?.startsWith('/start')) {
        return false;
    }

    // No agregar si callback ya respondido
    if (ctx.callbackQuery && ctx.answered) {
        return false;
    }

    // No agregar en mensajes de error
    if (ctx.state?.isError) {
        return false;
    }

    // No agregar si está en flujo activo
    if (isInActiveFlow(ctx)) {
        return false;
    }

    return true;
}

/**
 * 🔍 Verifica si el usuario está en un flujo activo
 * OPTIMIZADO: Usa imports cacheados
 */
function isInActiveFlow(ctx: NavigationContext): boolean {
    try {
        const userId = ctx.from!.id.toString();
        const chatId = ctx.chat?.id;
        if (!chatId) return false;

        const threadId = (ctx.message as any)?.message_thread_id ?? null;

        // Verificar flujos BD AUTOS (usando imports cacheados)
        if (VehicleRegistrationHandler?.tieneRegistroEnProceso?.(userId, chatId, threadId)) {
            return true;
        }

        if (PolicyAssignmentHandler?.tieneAsignacionEnProceso?.(userId, chatId, threadId)) {
            return true;
        }

        // Verificar flujos Admin
        if (AdminStateManager?.hasActiveState?.(userId, chatId)) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * 🎛️ Función helper para marcar navegación como manejada
 */
function markNavigationHandled(ctx: NavigationContext): void {
    if (ctx) {
        ctx.navigationHandled = true;
    }
}

/**
 * 🧭 Agrega navegación persistente a respuesta específica
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

        const response = ctx.navManager.addPersistentNavigation(text, userId, options);
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

function getMiddlewareStats(): MiddlewareStats {
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
