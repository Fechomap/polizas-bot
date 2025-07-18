// src/utils/FlowStateManager.ts
import logger from './logger';
import StateKeyManager from './StateKeyManager';

// Interfaces para el manejo de estados
interface IStateData {
    [key: string]: any;
    createdAt: Date;
}

interface IActiveFlow {
    numeroPoliza: string;
    contextKey?: string;
    [key: string]: any;
}

interface IStateProvider {
    cleanup(cutoffTime?: number): Promise<number>;
}

/**
 * Clase para gestionar estados de flujos concurrentes en el bot
 * Permite manejar múltiples flujos simultáneos por chatId y por póliza
 */
class FlowStateManager implements IStateProvider {
    // Map anidado: Map<contextKey, Map<numeroPoliza, StateData>>
    private flowStates: Map<string, Map<string, IStateData>>;
    // Map principal: chatId => Map<flowId, contextData>
    private contexts: Map<string | number, Map<string, any>>;
    // Contador para generar IDs únicos por chatId
    private counters: Map<string | number, number>;

    constructor() {
        this.flowStates = new Map();
        this.contexts = new Map();
        this.counters = new Map();

        logger.info('FlowStateManager inicializado');

        // Registrar en el servicio de limpieza si está disponible
        try {
            const stateCleanupService = require('./StateCleanupService');
            stateCleanupService.registerStateProvider(this, 'FlowStateManager');
        } catch (error: any) {
            logger.warn('No se pudo registrar en StateCleanupService:', error.message);
        }
    }

    private _getContextKey(chatId: string | number, threadId?: string | null): string {
        return StateKeyManager.getContextKey(chatId, threadId);
    }

    /**
     * Guarda información de estado para un flujo específico
     */
    saveState(
        chatId: string | number,
        numeroPoliza: string,
        stateData: Record<string, any>,
        threadId?: string | null
    ): boolean {
        if (!chatId || !numeroPoliza) {
            logger.warn('Intento de guardar estado sin chatId o numeroPoliza válidos');
            return false;
        }

        const contextKey = this._getContextKey(chatId, threadId);

        // Asegurar que exista el map para este contextKey
        if (!this.flowStates.has(contextKey)) {
            this.flowStates.set(contextKey, new Map());
        }

        // Guardar los datos para esta póliza
        this.flowStates.get(contextKey)!.set(numeroPoliza, {
            ...stateData,
            createdAt: new Date() // Para poder implementar TTL si es necesario
        });

        logger.debug('Estado guardado:', { chatId, numeroPoliza, threadId, stateData });
        return true;
    }

    /**
     * Recupera datos de estado para un flujo específico
     */
    getState(
        chatId: string | number,
        numeroPoliza: string,
        threadId?: string | null
    ): IStateData | null {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return null;

        return chatStates.get(numeroPoliza) || null;
    }

    /**
     * Comprueba si existe un estado para el flujo especificado
     */
    hasState(chatId: string | number, numeroPoliza: string, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        return chatStates ? chatStates.has(numeroPoliza) : false;
    }

    /**
     * Elimina un estado específico
     */
    clearState(chatId: string | number, numeroPoliza: string, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return false;

        const result = chatStates.delete(numeroPoliza);

        // Si el mapa está vacío, eliminar la entrada del contextKey también
        if (chatStates.size === 0) {
            this.flowStates.delete(contextKey);
        }

        logger.debug('Estado eliminado:', { chatId, numeroPoliza, threadId, result });
        return result;
    }

    /**
     * Limpia todos los estados asociados a un chat
     */
    clearAllStates(chatId: string | number, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        const result = this.flowStates.delete(contextKey);
        logger.debug('Todos los estados eliminados para contextKey:', { contextKey, result });
        return result;
    }

    /**
     * Obtiene todos los estados activos para un chat
     */
    getActiveFlows(chatId: string | number, threadId?: string | null): IActiveFlow[] {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return [];

        return Array.from(chatStates.entries()).map(([numeroPoliza, data]) => ({
            numeroPoliza,
            ...data
        }));
    }

    /**
     * Obtiene todos los estados activos en el sistema
     */
    getAllActiveFlows(): IActiveFlow[] {
        const allFlows: IActiveFlow[] = [];

        this.flowStates.forEach((polizaMap, contextKey) => {
            polizaMap.forEach((data, numeroPoliza) => {
                allFlows.push({
                    contextKey,
                    numeroPoliza,
                    ...data
                });
            });
        });

        return allFlows;
    }

    /**
     * Valida que el acceso a un flujo coincida con el threadId correcto
     */
    validateThreadMatch(
        chatId: string | number,
        numeroPoliza: string,
        threadId?: string | null
    ): boolean {
        const contextKey = this._getContextKey(chatId, threadId);

        // Si existen estados para el contexto exacto, es válido
        if (this.flowStates.has(contextKey) && this.flowStates.get(contextKey)!.has(numeroPoliza)) {
            return true;
        }

        // Si no hay threadId, buscar en otros contextos de este chat
        if (!threadId) {
            for (const [otherContextKey, stateMap] of this.flowStates.entries()) {
                if (otherContextKey.startsWith(`${chatId}-`) && stateMap.has(numeroPoliza)) {
                    logger.warn(
                        'Intento de acceso a flujo sin threadId, pero existe en otro hilo',
                        {
                            chatId,
                            numeroPoliza,
                            existingThread: otherContextKey.split('-')[1]
                        }
                    );
                    return false;
                }
            }
        }

        // Si no se encontró conflicto, permitir acceso
        return true;
    }

    /**
     * Limpia contextos antiguos basado en un timestamp de corte
     */
    async cleanup(cutoffTime?: number): Promise<number> {
        let removed = 0;
        const now = Date.now();

        // Si no se proporciona timestamp, usar 2 horas por defecto
        if (!cutoffTime) {
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            cutoffTime = now - TWO_HOURS;
        }

        for (const [contextKey, stateMap] of this.flowStates.entries()) {
            for (const [flowId, data] of stateMap.entries()) {
                // Verificar si el estado es más antiguo que el corte
                const lastUpdate = data.createdAt ? data.createdAt.getTime() : 0;
                if (lastUpdate < cutoffTime) {
                    stateMap.delete(flowId);
                    removed++;
                    logger.debug(
                        `Eliminado contexto antiguo: ${flowId} (contextKey: ${contextKey})`,
                        {
                            lastUpdate: new Date(lastUpdate).toISOString(),
                            age: Math.round((now - lastUpdate) / 1000 / 60) + ' minutos'
                        }
                    );
                }
            }

            // Si el mapa para este contextKey quedó vacío, eliminarlo también
            if (stateMap.size === 0) {
                this.flowStates.delete(contextKey);
            }
        }

        if (removed > 0) {
            logger.info(`Limpiados ${removed} contextos antiguos de FlowStateManager`);
        }

        return removed;
    }

    /**
     * Obtiene estadísticas del estado actual
     */
    getStats(): {
        totalContexts: number;
        totalFlows: number;
        contextBreakdown: Record<string, number>;
    } {
        const stats = {
            totalContexts: this.flowStates.size,
            totalFlows: 0,
            contextBreakdown: {} as Record<string, number>
        };

        this.flowStates.forEach((stateMap, contextKey) => {
            stats.totalFlows += stateMap.size;
            stats.contextBreakdown[contextKey] = stateMap.size;
        });

        return stats;
    }
}

// Exportar una única instancia (patrón Singleton)
export default new FlowStateManager();
