// src/utils/StateKeyManager.js
const logger = require('./logger');

/**
 * Utilidad para gestionar claves de estado con soporte para hilos
 * Proporciona un sistema unificado para generar y validar claves compuestas
 */
class StateKeyManager {
    /**
     * Genera una clave compuesta única para identificar un contexto chat+hilo
     * @param {number|string} chatId - ID del chat
     * @param {number|string|null} threadId - ID del hilo (opcional)
     * @returns {string} Clave compuesta
     */
    static getContextKey(chatId, threadId) {
        return `${chatId}${threadId ? ':' + threadId : ''}`;
    }

    /**
     * Extrae chatId y threadId de una clave de contexto
     * @param {string} contextKey - Clave compuesta
     * @returns {Object} { chatId, threadId }
     */
    static parseContextKey(contextKey) {
        const parts = contextKey.split(':');
        return {
            chatId: parts[0],
            threadId: parts.length > 1 ? parts[1] : null
        };
    }

    /**
     * Extrae threadId de un contexto de Telegraf
     * @param {Object} ctx - Contexto de Telegraf
     * @returns {number|string|null} ID del hilo o null
     */
    static getThreadId(ctx) {
        // Validar que ctx existe
        if (!ctx || typeof ctx !== 'object') {
            return null;
        }

        // Extraer threadId de un mensaje normal
        if (ctx.message?.message_thread_id) {
            return ctx.message.message_thread_id;
        }

        // Extraer threadId de un callback_query
        if (ctx.callbackQuery?.message?.message_thread_id) {
            return ctx.callbackQuery.message.message_thread_id;
        }

        return null;
    }

    /**
     * Crea un objeto Map especializado que almacena estados usando claves compuestas de chatId+threadId
     * @returns {Object} Objeto con métodos especializados para gestionar estado
     */
    static createThreadSafeStateMap() {
        const stateMap = new Map();

        return {
            // Almacena un valor asociado a una combinación de chatId y threadId
            set: (chatId, value, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                stateMap.set(key, value);
                logger.debug(`Estado guardado para key=${key}`, { chatId, threadId, value });
                return value;
            },

            // Obtiene un valor para una combinación de chatId y threadId
            get: (chatId, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                return stateMap.get(key);
            },

            // Verifica si existe un valor para una combinación de chatId y threadId
            has: (chatId, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                // Problema detectado: Loguear para verificar que la clave se está generando correctamente
                const exists = stateMap.has(key);
                logger.debug(`Verificando estado para key=${key}, existe=${exists}`, {
                    chatId,
                    threadId
                });
                return exists;
            },

            // Elimina un valor para una combinación de chatId y threadId
            delete: (chatId, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                return stateMap.delete(key);
            },

            // Elimina todos los valores asociados a un chatId, sin importar el threadId
            deleteAll: chatId => {
                let count = 0;
                const keysToDelete = [];

                // Primero recopilamos todas las claves a eliminar
                for (const key of stateMap.keys()) {
                    if (key === `${chatId}` || key.startsWith(`${chatId}:`)) {
                        keysToDelete.push(key);
                    }
                }

                // Luego eliminamos cada clave
                for (const key of keysToDelete) {
                    stateMap.delete(key);
                    count++;
                }

                logger.debug(`Eliminados ${count} estados para chatId=${chatId}`);
                return count;
            },

            // Retorna todos los valores de un chatId
            getAllByChatId: chatId => {
                const result = [];
                for (const [key, value] of stateMap.entries()) {
                    if (key === `${chatId}` || key.startsWith(`${chatId}:`)) {
                        const { threadId } = StateKeyManager.parseContextKey(key);
                        result.push({ threadId, value });
                    }
                }
                return result;
            },

            // Retorna el mapa interno completo (para debugging)
            getInternalMap: () => stateMap,

            // Retorna el tamaño del mapa
            size: () => stateMap.size,

            // Limpia el mapa completamente
            clear: () => stateMap.clear()
        };
    }
}

module.exports = StateKeyManager;
