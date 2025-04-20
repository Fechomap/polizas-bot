// src/utils/FlowStateManager.js
const logger = require('./logger');

/**
 * Clase para gestionar estados de flujos concurrentes en el bot
 * Permite manejar múltiples flujos simultáneos por chatId y por póliza
 */
class FlowStateManager {
    constructor() {
        // Map anidado: Map<contextKey, StateData>
        this.contexts = new Map();
        logger.info('FlowStateManager inicializado');
    }

    _getContextKey(chatId, threadId) {
        return `${chatId}-${threadId}`;
    }

    /**
     * Guarda información de estado para un flujo específico
     * @param {number|string} chatId - ID del chat donde ocurre el flujo
     * @param {string} numeroPoliza - Número de póliza asociada al flujo
     * @param {Object} stateData - Datos a guardar (hora, origen/destino, etc.)
     * @param {string|null} threadId - ID del hilo asociado (opcional)
     */
    saveState(chatId, numeroPoliza, stateData, threadId = null) {
        const contextKey = this._getContextKey(chatId, threadId);
        if (!chatId || !numeroPoliza) {
            logger.warn('Intento de guardar estado sin chatId o numeroPoliza válidos');
            return false;
        }

        // Asegurar que exista el map para este contextKey
        if (!this.contexts.has(contextKey)) {
            this.contexts.set(contextKey, new Map());
        }

        // Guardar los datos para esta póliza
        this.contexts.get(contextKey).set(numeroPoliza, {
            ...stateData,
            createdAt: new Date() // Para poder implementar TTL si es necesario
        });

        logger.debug('Estado guardado:', { chatId, numeroPoliza, stateData });
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
        const chatStates = this.contexts.get(contextKey);
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
        const chatStates = this.contexts.get(contextKey);
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
        const chatStates = this.contexts.get(contextKey);
        if (!chatStates) return false;

        const result = chatStates.delete(numeroPoliza);
        
        // Si el mapa está vacío, eliminar la entrada del contextKey también
        if (chatStates.size === 0) {
            this.contexts.delete(contextKey);
        }
        
        logger.debug('Estado eliminado:', { chatId, numeroPoliza, result });
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
        const result = this.contexts.delete(contextKey);
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
        const chatStates = this.contexts.get(contextKey);
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
        
        this.contexts.forEach((polizaMap, contextKey) => {
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
}

// Exportar una única instancia (patrón Singleton)
module.exports = new FlowStateManager();