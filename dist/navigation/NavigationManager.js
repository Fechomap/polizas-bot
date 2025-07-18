"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationManager = void 0;
exports.getInstance = getInstance;
const telegraf_1 = require("telegraf");
const logger_1 = __importDefault(require("../utils/logger"));
class NavigationManager {
    constructor() {
        this.navigationStack = new Map();
        this.menuConfig = {
            main: {
                title: '🤖 **Bot de Pólizas** - Menú Principal',
                subtitle: 'Selecciona una categoría:',
                buttons: [
                    [
                        { text: '📋 PÓLIZAS', callback: 'accion:polizas' },
                        { text: '🔧 ADMINISTRACIÓN', callback: 'accion:administracion' }
                    ],
                    [
                        { text: '📊 REPORTES', callback: 'accion:reportes' },
                        { text: '🚗 BASE DE AUTOS', callback: 'accion:base_autos' }
                    ],
                    [{ text: '❓ AYUDA', callback: 'accion:help' }]
                ]
            },
            reportes: {
                title: '📊 **REPORTES** - Menú de Reportes',
                subtitle: 'Selecciona el tipo de reporte:',
                buttons: [
                    [
                        {
                            text: '📄 Pagos Pendientes (PDF + Excel)',
                            callback: 'accion:reportPaymentPDF'
                        }
                    ],
                    [{ text: '📈 Reportes Utilizados', callback: 'accion:reportUsed' }],
                    [{ text: '🏠 Menú Principal', callback: 'accion:volver_menu' }]
                ]
            }
        };
    }
    getMainMenu(userId, options = {}) {
        try {
            const config = this.menuConfig.main;
            const keyboard = this._buildKeyboard(config.buttons);
            this.pushContext(userId, {
                menu: 'main',
                timestamp: new Date(),
                ...options
            });
            return {
                text: `${config.title}\n\n${config.subtitle}`,
                markup: keyboard,
                parseMode: 'Markdown'
            };
        }
        catch (error) {
            logger_1.default.error('Error generando menú principal:', error);
            return this._getErrorMenu();
        }
    }
    getReportsMenu(userId) {
        try {
            const config = this.menuConfig.reportes;
            const keyboard = this._buildKeyboard(config.buttons);
            this.pushContext(userId, {
                menu: 'reportes',
                parent: 'main',
                timestamp: new Date()
            });
            return {
                text: `${config.title}\n\n${config.subtitle}`,
                markup: keyboard,
                parseMode: 'Markdown'
            };
        }
        catch (error) {
            logger_1.default.error('Error generando menú reportes:', error);
            return this._getErrorMenu();
        }
    }
    addPersistentNavigation(originalText, userId, options = {}) {
        try {
            const context = this.getCurrentContext(userId);
            const navigationButtons = [];
            navigationButtons.push([{ text: '🏠 Menú Principal', callback: 'accion:volver_menu' }]);
            if (context?.parent) {
                const parentLabel = this._getMenuLabel(context.parent);
                navigationButtons.unshift([
                    { text: `⬅️ ${parentLabel}`, callback: `accion:volver_${context.parent}` }
                ]);
            }
            const keyboard = this._buildKeyboard(navigationButtons);
            return {
                text: originalText,
                markup: keyboard,
                parseMode: options.parseMode || 'Markdown'
            };
        }
        catch (error) {
            logger_1.default.error('Error agregando navegación persistente:', error);
            return {
                text: originalText,
                markup: this._buildKeyboard([
                    [{ text: '🏠 Menú Principal', callback: 'accion:volver_menu' }]
                ]),
                parseMode: 'Markdown'
            };
        }
    }
    pushContext(userId, context) {
        if (!this.navigationStack.has(userId)) {
            this.navigationStack.set(userId, []);
        }
        const userStack = this.navigationStack.get(userId);
        userStack.push({
            ...context,
            id: Date.now(),
            timestamp: new Date()
        });
        if (userStack.length > 10) {
            userStack.shift();
        }
        logger_1.default.debug('Contexto navegación guardado:', {
            userId,
            context: context.menu,
            stackSize: userStack.length
        });
    }
    getCurrentContext(userId) {
        const userStack = this.navigationStack.get(userId);
        return userStack && userStack.length > 0 ? userStack[userStack.length - 1] : null;
    }
    popContext(userId) {
        const userStack = this.navigationStack.get(userId);
        if (userStack && userStack.length > 0) {
            const current = userStack.pop();
            logger_1.default.debug('Contexto navegación removido:', {
                userId,
                removedContext: current.menu,
                remainingStackSize: userStack.length
            });
            return this.getCurrentContext(userId);
        }
        return null;
    }
    getBreadcrumbs(userId) {
        const userStack = this.navigationStack.get(userId) || [];
        if (userStack.length <= 1)
            return '';
        const breadcrumbs = userStack
            .slice(-3)
            .map(ctx => this._getMenuLabel(ctx.menu))
            .join(' › ');
        return `🧭 ${breadcrumbs}`;
    }
    clearUserNavigation(userId) {
        this.navigationStack.delete(userId);
        logger_1.default.debug('Navegación limpiada para usuario:', { userId });
    }
    getNavigationStats() {
        const totalUsers = this.navigationStack.size;
        let totalContexts = 0;
        let activeUsers = 0;
        const now = new Date();
        for (const [, stack] of this.navigationStack.entries()) {
            totalContexts += stack.length;
            const lastContext = stack[stack.length - 1];
            if (lastContext && now.getTime() - lastContext.timestamp.getTime() < 30 * 60 * 1000) {
                activeUsers++;
            }
        }
        return {
            totalUsers,
            activeUsers,
            totalContexts,
            averageStackSize: totalUsers > 0 ? (totalContexts / totalUsers).toFixed(2) : '0'
        };
    }
    _buildKeyboard(buttonConfig) {
        const keyboard = buttonConfig.map(row => row.map(btn => telegraf_1.Markup.button.callback(btn.text, btn.callback)));
        return telegraf_1.Markup.inlineKeyboard(keyboard);
    }
    _getMenuLabel(menuKey) {
        const labels = {
            main: 'Inicio',
            reportes: 'Reportes',
            polizas: 'Pólizas',
            administracion: 'Administración',
            base_autos: 'Base de Autos',
            help: 'Ayuda'
        };
        return labels[menuKey] || menuKey;
    }
    _getErrorMenu() {
        return {
            text: '❌ Error en navegación. Volviendo al menú principal...',
            markup: this._buildKeyboard([
                [{ text: '🏠 Menú Principal', callback: 'accion:volver_menu' }]
            ]),
            parseMode: 'Markdown'
        };
    }
}
exports.NavigationManager = NavigationManager;
let navigationManager;
function getInstance() {
    if (!navigationManager) {
        navigationManager = new NavigationManager();
        logger_1.default.info('NavigationManager inicializado');
    }
    return navigationManager;
}
exports.default = getInstance;
