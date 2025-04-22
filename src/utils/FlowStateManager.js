// src/utils/FlowStateManager.js
const logger = require('./logger');

/**
 * Clase para gestionar estados de flujos concurrentes en el bot
 * Permite manejar múltiples flujos simultáneos por chatId y por póliza
 */
class FlowStateManager {
    constructor() {
        // Map anidado: Map<contextKey, StateData>
        this.flowStates = new Map();
        logger.info('FlowStateManager inicializado');
    }

    _getContextKey(chatId, threadId) {
        return `${chatId}${threadId ? '-' + threadId : ''}`;
    }

    /**
     * Guarda información de estado para un flujo específico
     * @param {number|string} chatId - ID del chat donde ocurre el flujo
     * @param {string} numeroPoliza - Número de póliza asociada al flujo
     * @param {Object} stateData - Datos a guardar (hora, origen/destino, etc.)
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     */
    saveState(chatId, numeroPoliza, stateData, threadId = null) {
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
        this.flowStates.get(contextKey).set(numeroPoliza, {
            ...stateData,
            createdAt: new Date() // Para poder implementar TTL si es necesario
        });

        logger.debug('Estado guardado:', { chatId, numeroPoliza, threadId, stateData });
        return true;
    }

    /**
     * Recupera datos de estado para un flujo específico
     * @param {number|string} chatId - ID del chat 
     * @param {string} numeroPoliza - Número de póliza
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     * @returns {Object|null} Datos del estado o null si no existe
     */
    getState(chatId, numeroPoliza, threadId = null) {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return null;

        return chatStates.get(numeroPoliza) || null;
    }

    /**
     * Comprueba si existe un estado para el flujo especificado
     * @param {number|string} chatId - ID del chat
     * @param {string} numeroPoliza - Número de póliza
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     * @returns {boolean} True si existe el estado
     */
    hasState(chatId, numeroPoliza, threadId = null) {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        return chatStates ? chatStates.has(numeroPoliza) : false;
    }

    /**
     * Elimina un estado específico
     * @param {number|string} chatId - ID del chat
     * @param {string} numeroPoliza - Número de póliza
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     * @returns {boolean} True si se eliminó correctamente
     */
    clearState(chatId, numeroPoliza, threadId = null) {
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
     * @param {number|string} chatId - ID del chat
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     * @returns {boolean} True si se limpió correctamente
     */
    clearAllStates(chatId, threadId = null) {
        const contextKey = this._getContextKey(chatId, threadId);
        const result = this.flowStates.delete(contextKey);
        logger.debug('Todos los estados eliminados para contextKey:', { contextKey, result });
        return result;
    }

    /**
     * Obtiene todos los estados activos para un chat
     * @param {number|string} chatId - ID del chat
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     * @returns {Array} Lista de estados activos
     */
    getActiveFlows(chatId, threadId = null) {
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
     * @returns {Array} Lista de todos los estados activos
     */
    getAllActiveFlows() {
        const allFlows = [];
        
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
     * @param {number|string} chatId 
     * @param {string} numeroPoliza 
     * @param {string|null} threadId 
     * @returns {boolean}
     */
    validateThreadMatch(chatId, numeroPoliza, threadId = null) {
        const contextKey = this._getContextKey(chatId, threadId);
        // Si existen estados para el contexto exacto, es válido
        if (this.flowStates.has(contextKey) && this.flowStates.get(contextKey).has(numeroPoliza)) {
            return true;
        }
        // Si no hay threadId, buscar en otros contextos de este chat
        if (!threadId) {
            for (const [otherContextKey, stateMap] of this.flowStates.entries()) {
                if (otherContextKey.startsWith(`${chatId}-`) && stateMap.has(numeroPoliza)) {
                    logger.warn(`Intento de acceso a flujo sin threadId, pero existe en otro hilo`, {
                        chatId,
                        numeroPoliza,
                        existingThread: otherContextKey.split('-')[1]
                    });
                    return false;
                }
            }
        }
        // Si no se encontró conflicto, permitir acceso
        return true;
    }
}

// Exportar una única instancia (patrón Singleton)
module.exports = new FlowStateManager();