const { Markup } = require('telegraf');
const logger = require('../utils/logger');

/**
 * 🧭 NavigationManager - Sistema de Navegación Persistente
 *
 * Elimina la necesidad de escribir /start repetidamente
 * Proporciona menús contextuales y breadcrumbs
 * Preserva estado de navegación durante la sesión
 */
class NavigationManager {
    constructor() {
        // Stack de navegación por usuario
        this.navigationStack = new Map();

        // Configuración de menús
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

    /**
     * 🏠 Genera el menú principal personalizado
     * @param {string} userId - ID del usuario
     * @param {Object} options - Opciones adicionales
     * @returns {Object} Markup del menú principal
     */
    getMainMenu(userId, options = {}) {
        try {
            const config = this.menuConfig.main;

            // Construir teclado inline
            const keyboard = this._buildKeyboard(config.buttons);

            // Guardar contexto de navegación
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
        } catch (error) {
            logger.error('Error generando menú principal:', error);
            return this._getErrorMenu();
        }
    }

    /**
     * 📊 Genera menú de reportes
     * @param {string} userId - ID del usuario
     * @returns {Object} Markup del menú de reportes
     */
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
        } catch (error) {
            logger.error('Error generando menú reportes:', error);
            return this._getErrorMenu();
        }
    }

    /**
     * 🧭 Agrega botón "Volver al Menú" a cualquier respuesta
     * @param {string} originalText - Texto original del mensaje
     * @param {string} userId - ID del usuario
     * @param {Object} options - Opciones adicionales
     * @returns {Object} Mensaje con navegación persistente
     */
    addPersistentNavigation(originalText, userId, options = {}) {
        try {
            const context = this.getCurrentContext(userId);
            const navigationButtons = [];

            // Botón principal siempre presente
            navigationButtons.push([{ text: '🏠 Menú Principal', callback: 'accion:volver_menu' }]);

            // Botón contextual si hay parent
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
        } catch (error) {
            logger.error('Error agregando navegación persistente:', error);
            return {
                text: originalText,
                markup: this._buildKeyboard([
                    [{ text: '🏠 Menú Principal', callback: 'accion:volver_menu' }]
                ]),
                parseMode: 'Markdown'
            };
        }
    }

    /**
     * 📌 Guarda contexto de navegación
     * @param {string} userId - ID del usuario
     * @param {Object} context - Contexto a guardar
     */
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

        // Limitar a últimos 10 contextos para evitar memory leaks
        if (userStack.length > 10) {
            userStack.shift();
        }

        logger.debug('Contexto navegación guardado:', {
            userId,
            context: context.menu,
            stackSize: userStack.length
        });
    }

    /**
     * 🔄 Obtiene contexto actual de navegación
     * @param {string} userId - ID del usuario
     * @returns {Object|null} Contexto actual o null
     */
    getCurrentContext(userId) {
        const userStack = this.navigationStack.get(userId);
        return userStack && userStack.length > 0 ? userStack[userStack.length - 1] : null;
    }

    /**
     * ⬅️ Vuelve al contexto anterior
     * @param {string} userId - ID del usuario
     * @returns {Object|null} Contexto anterior o null
     */
    popContext(userId) {
        const userStack = this.navigationStack.get(userId);
        if (userStack && userStack.length > 0) {
            const current = userStack.pop();
            logger.debug('Contexto navegación removido:', {
                userId,
                removedContext: current.menu,
                remainingStackSize: userStack.length
            });
            return this.getCurrentContext(userId);
        }
        return null;
    }

    /**
     * 🍞 Genera breadcrumbs de navegación
     * @param {string} userId - ID del usuario
     * @returns {string} Breadcrumbs formateados
     */
    getBreadcrumbs(userId) {
        const userStack = this.navigationStack.get(userId) || [];
        if (userStack.length <= 1) return '';

        const breadcrumbs = userStack
            .slice(-3) // Últimos 3 elementos
            .map(ctx => this._getMenuLabel(ctx.menu))
            .join(' › ');

        return `🧭 ${breadcrumbs}`;
    }

    /**
     * 🧹 Limpia navegación de usuario (usar con cuidado)
     * @param {string} userId - ID del usuario
     */
    clearUserNavigation(userId) {
        this.navigationStack.delete(userId);
        logger.debug('Navegación limpiada para usuario:', { userId });
    }

    /**
     * 📊 Obtiene estadísticas de navegación
     * @returns {Object} Estadísticas del sistema
     */
    getNavigationStats() {
        const totalUsers = this.navigationStack.size;
        let totalContexts = 0;
        let activeUsers = 0;
        const now = new Date();

        for (const [, stack] of this.navigationStack.entries()) {
            totalContexts += stack.length;

            // Usuario activo si tiene contexto de últimos 30 minutos
            const lastContext = stack[stack.length - 1];
            if (lastContext && now - lastContext.timestamp < 30 * 60 * 1000) {
                activeUsers++;
            }
        }

        return {
            totalUsers,
            activeUsers,
            totalContexts,
            averageStackSize: totalUsers > 0 ? (totalContexts / totalUsers).toFixed(2) : 0
        };
    }

    // 🔧 MÉTODOS PRIVADOS

    /**
     * Construye teclado inline desde configuración
     * @private
     */
    _buildKeyboard(buttonConfig) {
        const keyboard = buttonConfig.map(row =>
            row.map(btn => Markup.button.callback(btn.text, btn.callback))
        );
        return Markup.inlineKeyboard(keyboard);
    }

    /**
     * Obtiene etiqueta legible del menú
     * @private
     */
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

    /**
     * Menú de error por defecto
     * @private
     */
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

// Singleton instance
let navigationManager;

/**
 * Obtiene instancia singleton de NavigationManager
 * @returns {NavigationManager} Instancia única
 */
function getInstance() {
    if (!navigationManager) {
        navigationManager = new NavigationManager();
        logger.info('NavigationManager inicializado');
    }
    return navigationManager;
}

module.exports = {
    NavigationManager,
    getInstance
};
