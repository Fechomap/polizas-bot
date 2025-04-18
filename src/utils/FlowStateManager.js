// src/utils/FlowStateManager.js
const logger = require('./logger');

/**
 * Clase para gestionar estados de flujos concurrentes en el bot
 * Permite manejar múltiples flujos simultáneos por chatId y por póliza
 */
class FlowStateManager {
    constructor() {
        // Map anidado: Map<chatId, Map<numeroPoliza, StateData>>
        this.flowStates = new Map();
        logger.info('FlowStateManager inicializado');
    }

    /**
     * Guarda información de estado para un flujo específico
     * @param {number|string} chatId - ID del chat donde ocurre el flujo
     * @param {string} numeroPoliza - Número de póliza asociada al flujo
     * @param {Object} stateData - Datos a guardar (hora, origen/destino, etc.)
     */
    saveState(chatId, numeroPoliza, stateData) {
        if (!chatId || !numeroPoliza) {
            logger.warn('Intento de guardar estado sin chatId o numeroPoliza válidos');
            return false;
        }

        // Asegurar que exista el map para este chatId
        if (!this.flowStates.has(chatId)) {
            this.flowStates.set(chatId, new Map());
        }

        // Guardar los datos para esta póliza
        this.flowStates.get(chatId).set(numeroPoliza, {
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
     * @returns {Object|null} Datos del estado o null si no existe
     */
    getState(chatId, numeroPoliza) {
        const chatStates = this.flowStates.get(chatId);
        if (!chatStates) return null;

        return chatStates.get(numeroPoliza) || null;
    }

    /**
     * Comprueba si existe un estado para el flujo especificado
     * @param {number|string} chatId - ID del chat
     * @param {string} numeroPoliza - Número de póliza
     * @returns {boolean} True si existe el estado
     */
    hasState(chatId, numeroPoliza) {
        const chatStates = this.flowStates.get(chatId);
        return chatStates ? chatStates.has(numeroPoliza) : false;
    }

    /**
     * Elimina un estado específico
     * @param {number|string} chatId - ID del chat
     * @param {string} numeroPoliza - Número de póliza
     * @returns {boolean} True si se eliminó correctamente
     */
    clearState(chatId, numeroPoliza) {
        const chatStates = this.flowStates.get(chatId);
        if (!chatStates) return false;

        const result = chatStates.delete(numeroPoliza);
        
        // Si el mapa está vacío, eliminar la entrada del chatId también
        if (chatStates.size === 0) {
            this.flowStates.delete(chatId);
        }
        
        logger.debug('Estado eliminado:', { chatId, numeroPoliza, result });
        return result;
    }

    /**
     * Limpia todos los estados asociados a un chat
     * @param {number|string} chatId - ID del chat
     * @returns {boolean} True si se limpió correctamente
     */
    clearAllStates(chatId) {
        const result = this.flowStates.delete(chatId);
        logger.debug('Todos los estados eliminados para chatId:', { chatId, result });
        return result;
    }

    /**
     * Obtiene todos los estados activos para un chat
     * @param {number|string} chatId - ID del chat
     * @returns {Array} Lista de estados activos
     */
    getActiveFlows(chatId) {
        const chatStates = this.flowStates.get(chatId);
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
        
        this.flowStates.forEach((polizaMap, chatId) => {
            polizaMap.forEach((data, numeroPoliza) => {
                allFlows.push({
                    chatId,
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