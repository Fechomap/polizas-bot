"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.navigationMiddleware = void 0;
exports.markNavigationHandled = markNavigationHandled;
exports.addNavigationToResponse = addNavigationToResponse;
exports.getMiddlewareStats = getMiddlewareStats;
exports.isInActiveFlow = isInActiveFlow;
exports.shouldAddNavigation = shouldAddNavigation;
const NavigationManager_1 = require("./NavigationManager");
const logger_1 = __importDefault(require("../utils/logger"));
const navigationMiddleware = async (ctx, next) => {
    try {
        ctx.navManager = (0, NavigationManager_1.getInstance)();
        ctx.navigationHandled = false;
        await next();
        if (!ctx.navigationHandled && ctx.from?.id) {
            await addAutomaticNavigation(ctx);
        }
    }
    catch (error) {
        logger_1.default.error('Error en navigation middleware:', error);
    }
};
exports.navigationMiddleware = navigationMiddleware;
async function addAutomaticNavigation(ctx) {
    try {
        const userId = ctx.from.id.toString();
        const navManager = ctx.navManager;
        if (!shouldAddNavigation(ctx)) {
            return;
        }
        const mainMenu = navManager.getMainMenu(userId);
        if (!ctx.callbackQuery) {
            await ctx.reply('🧭 Navegación disponible:', {
                parse_mode: 'Markdown',
                ...mainMenu.markup
            });
        }
        logger_1.default.debug('Navegación automática agregada', {
            userId,
            hasCallbackQuery: !!ctx.callbackQuery,
            chatId: ctx.chat?.id
        });
    }
    catch (error) {
        logger_1.default.error('Error agregando navegación automática:', error);
    }
}
function shouldAddNavigation(ctx) {
    if (ctx.message?.text?.startsWith('/start')) {
        return false;
    }
    if (ctx.callbackQuery && ctx.answered) {
        return false;
    }
    if (ctx.state?.isError) {
        return false;
    }
    if (isInActiveFlow(ctx)) {
        return false;
    }
    return true;
}
function isInActiveFlow(ctx) {
    try {
        const userId = ctx.from.id.toString();
        const chatId = ctx.chat?.id;
        if (!chatId)
            return false;
        try {
            const { VehicleRegistrationHandler } = require('../comandos/comandos/VehicleRegistrationHandler');
            const { PolicyAssignmentHandler } = require('../comandos/comandos/PolicyAssignmentHandler');
            const threadId = ctx.message?.message_thread_id || null;
            if (VehicleRegistrationHandler?.tieneRegistroEnProceso?.(userId, chatId, threadId)) {
                return true;
            }
            if (PolicyAssignmentHandler?.tieneAsignacionEnProceso?.(userId, chatId, threadId)) {
                return true;
            }
        }
        catch {
        }
        try {
            const AdminStateManager = require('../admin/utils/adminStates');
            if (AdminStateManager?.hasActiveState?.(userId, chatId)) {
                return true;
            }
        }
        catch {
        }
        return false;
    }
    catch (error) {
        logger_1.default.debug('Error verificando flujos activos:', error);
        return false;
    }
}
function markNavigationHandled(ctx) {
    if (ctx) {
        ctx.navigationHandled = true;
    }
}
function addNavigationToResponse(ctx, text, options = {}) {
    try {
        const userId = ctx.from?.id?.toString();
        if (!userId || !ctx.navManager) {
            return { text, ...options };
        }
        const navManager = ctx.navManager;
        const response = navManager.addPersistentNavigation(text, userId, options);
        markNavigationHandled(ctx);
        return {
            ...options,
            ...response.markup,
            parse_mode: response.parseMode
        };
    }
    catch (error) {
        logger_1.default.error('Error agregando navegación a respuesta:', error);
        return { text, ...options };
    }
}
function getMiddlewareStats() {
    const navManager = (0, NavigationManager_1.getInstance)();
    return {
        ...navManager.getNavigationStats(),
        middlewareVersion: '1.0.0',
        lastUpdate: new Date().toISOString()
    };
}
exports.default = navigationMiddleware;
