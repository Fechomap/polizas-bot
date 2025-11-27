import { Markup } from 'telegraf';
import logger from '../utils/logger';

interface NavigationButton {
    text: string;
    callback: string;
}

interface MenuConfig {
    title: string;
    subtitle: string;
    buttons: NavigationButton[][];
}

interface NavigationContext {
    menu: string;
    parent?: string;
    timestamp: Date;
    id?: number;
    [key: string]: any;
}

interface NavigationResponse {
    text: string;
    markup: any;
    parseMode: string;
}

interface NavigationStats {
    totalUsers: number;
    activeUsers: number;
    totalContexts: number;
    averageStackSize: string;
}

/**
 * 🧭 NavigationManager - Sistema de Navegación Persistente
 *
 * Elimina la necesidad de escribir /start repetidamente
 * Proporciona menús contextuales y breadcrumbs
 * Preserva estado de navegación durante la sesión
 */
class NavigationManager {
    private navigationStack: Map<string, NavigationContext[]>;
    private menuConfig: Record<string, MenuConfig>;

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
                        { text: '🔧 ADMIN', callback: 'accion:administracion' }
                    ],
                    [
                        { text: '📊 REPORTES', callback: 'accion:reportes' },
                        { text: '🚗 AUTOS', callback: 'accion:base_autos' }
                    ]
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
     * @param userId - ID del usuario
     * @param options - Opciones adicionales
     * @returns Markup del menú principal
     */
    getMainMenu(userId: string, options: Record<string, any> = {}): NavigationResponse {
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
        } catch (error: any) {
            logger.error('Error generando menú principal:', error);
            return this._getErrorMenu();
        }
    }

    /**
     * 📊 Genera menú de reportes
     * @param userId - ID del usuario
     * @returns Markup del menú de reportes
     */
    getReportsMenu(userId: string): NavigationResponse {
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
        } catch (error: any) {
            logger.error('Error generando menú reportes:', error);
            return this._getErrorMenu();
        }
    }

    /**
     * 🧭 Agrega botón "Menú Principal" PERSISTENTE a cualquier respuesta
     * Este botón reemplaza la funcionalidad de /start y limpia todos los estados
     * @param originalText - Texto original del mensaje
     * @param userId - ID del usuario
     * @param options - Opciones adicionales
     * @returns Mensaje con navegación persistente
     */
    addPersistentNavigation(
        originalText: string,
        userId: string,
        options: Record<string, any> = {}
    ): NavigationResponse {
        try {
            const context = this.getCurrentContext(userId);
            const navigationButtons: NavigationButton[][] = [];

            // Botón principal SIEMPRE presente - reemplaza /start
            // Este botón limpia TODOS los estados del thread específico
            navigationButtons.push([{ text: '🏠 MENÚ PRINCIPAL', callback: 'accion:volver_menu' }]);

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
        } catch (error: any) {
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
     * @param userId - ID del usuario
     * @param context - Contexto a guardar
     */
    pushContext(userId: string, context: NavigationContext): void {
        if (!this.navigationStack.has(userId)) {
            this.navigationStack.set(userId, []);
        }

        const userStack = this.navigationStack.get(userId)!;
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
     * @param userId - ID del usuario
     * @returns Contexto actual o null
     */
    getCurrentContext(userId: string): NavigationContext | null {
        const userStack = this.navigationStack.get(userId);
        return userStack && userStack.length > 0 ? userStack[userStack.length - 1] : null;
    }

    /**
     * ⬅️ Vuelve al contexto anterior
     * @param userId - ID del usuario
     * @returns Contexto anterior o null
     */
    popContext(userId: string): NavigationContext | null {
        const userStack = this.navigationStack.get(userId);
        if (userStack && userStack.length > 0) {
            const current = userStack.pop()!;
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
     * @param userId - ID del usuario
     * @returns Breadcrumbs formateados
     */
    getBreadcrumbs(userId: string): string {
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
     * @param userId - ID del usuario
     */
    clearUserNavigation(userId: string): void {
        this.navigationStack.delete(userId);
        logger.debug('Navegación limpiada para usuario:', { userId });
    }

    /**
     * 📊 Obtiene estadísticas de navegación
     * @returns Estadísticas del sistema
     */
    getNavigationStats(): NavigationStats {
        const totalUsers = this.navigationStack.size;
        let totalContexts = 0;
        let activeUsers = 0;
        const now = new Date();

        for (const [, stack] of this.navigationStack.entries()) {
            totalContexts += stack.length;

            // Usuario activo si tiene contexto de últimos 30 minutos
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

    // 🔧 MÉTODOS PRIVADOS

    /**
     * Construye teclado inline desde configuración
     * @private
     */
    private _buildKeyboard(buttonConfig: NavigationButton[][]): any {
        const keyboard = buttonConfig.map(row =>
            row.map(btn => Markup.button.callback(btn.text, btn.callback))
        );
        return Markup.inlineKeyboard(keyboard);
    }

    /**
     * Obtiene etiqueta legible del menú
     * @private
     */
    private _getMenuLabel(menuKey: string): string {
        const labels: Record<string, string> = {
            main: 'Inicio',
            reportes: 'Reportes',
            polizas: 'Pólizas',
            administracion: 'Administración',
            base_autos: 'Base de Autos'
        };
        return labels[menuKey] || menuKey;
    }

    /**
     * Menú de error por defecto
     * @private
     */
    private _getErrorMenu(): NavigationResponse {
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
let navigationManager: NavigationManager | undefined;

/**
 * Obtiene instancia singleton de NavigationManager
 * @returns Instancia única
 */
function getInstance(): NavigationManager {
    if (!navigationManager) {
        navigationManager = new NavigationManager();
        logger.info('NavigationManager inicializado');
    }
    return navigationManager;
}

export { NavigationManager, getInstance };
export default getInstance;
