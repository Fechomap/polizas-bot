const { getInstance: getNavigationManager } = require('./NavigationManager');
const logger = require('../utils/logger');

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
const navigationMiddleware = async (ctx, next) => {
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
    } catch (error) {
        logger.error('Error en navigation middleware:', error);
        // Continuar sin navegación en caso de error
    }
};

/**
 * 🔄 Agrega navegación automática si no se manejó explícitamente
 * @param {Object} ctx - Contexto de Telegraf
 */
async function addAutomaticNavigation(ctx) {
    try {
        const userId = ctx.from.id.toString();
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
    } catch (error) {
        logger.error('Error agregando navegación automática:', error);
    }
}

/**
 * 🎯 Determina si se debe agregar navegación automática
 * @param {Object} ctx - Contexto de Telegraf
 * @returns {boolean} Si debe agregar navegación
 */
function shouldAddNavigation(ctx) {
    // No agregar navegación en estos casos:

    // 1. Si es un comando de start (ya tiene su propio menú)
    if (ctx.message?.text?.startsWith('/start')) {
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
 * @param {Object} ctx - Contexto de Telegraf
 * @returns {boolean} Si está en flujo activo
 */
function isInActiveFlow(ctx) {
    try {
        const userId = ctx.from.id.toString();
        const chatId = ctx.chat?.id;

        if (!chatId) return false;

        // Verificar flujos BD AUTOS
        const {
            VehicleRegistrationHandler
        } = require('../comandos/comandos/VehicleRegistrationHandler');
        const { PolicyAssignmentHandler } = require('../comandos/comandos/PolicyAssignmentHandler');

        const threadId = ctx.message?.message_thread_id || null;

        if (VehicleRegistrationHandler?.tieneRegistroEnProceso?.(userId, chatId, threadId)) {
            return true;
        }

        if (PolicyAssignmentHandler?.tieneAsignacionEnProceso?.(userId, chatId, threadId)) {
            return true;
        }

        // Verificar flujos Admin
        const AdminStateManager = require('../admin/utils/adminStates');
        if (AdminStateManager?.hasActiveState?.(userId, chatId)) {
            return true;
        }

        return false;
    } catch (error) {
        logger.debug('Error verificando flujos activos:', error);
        return false; // En caso de error, permitir navegación
    }
}

/**
 * 🎛️ Función helper para marcar navegación como manejada
 * @param {Object} ctx - Contexto de Telegraf
 */
function markNavigationHandled(ctx) {
    if (ctx) {
        ctx.navigationHandled = true;
    }
}

/**
 * 🧭 Agrega navegación persistente a respuesta específica
 * @param {Object} ctx - Contexto de Telegraf
 * @param {string} text - Texto del mensaje
 * @param {Object} options - Opciones adicionales
 * @returns {Object} Opciones con navegación agregada
 */
function addNavigationToResponse(ctx, text, options = {}) {
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
    } catch (error) {
        logger.error('Error agregando navegación a respuesta:', error);
        return { text, ...options };
    }
}

/**
 * 📊 Obtiene estadísticas del middleware
 * @returns {Object} Estadísticas de uso
 */
function getMiddlewareStats() {
    const navManager = getNavigationManager();
    return {
        ...navManager.getNavigationStats(),
        middlewareVersion: '1.0.0',
        lastUpdate: new Date().toISOString()
    };
}

module.exports = {
    navigationMiddleware,
    markNavigationHandled,
    addNavigationToResponse,
    getMiddlewareStats,
    isInActiveFlow,
    shouldAddNavigation
};
