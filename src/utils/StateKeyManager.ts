// src/utils/StateKeyManager.ts
import logger from './logger';
import { BotContext } from '../../types';

// Interfaces para el StateKeyManager
interface IParsedContextKey {
    chatId: string;
    threadId: string | null;
}

interface IThreadSafeStateMap<T = any> {
    set: (chatId: string | number, value: T, threadId?: string | number | null) => T;
    get: (chatId: string | number, threadId?: string | number | null) => T | undefined;
    has: (chatId: string | number, threadId?: string | number | null) => boolean;
    delete: (chatId: string | number, threadId?: string | number | null) => boolean;
    deleteAll: (chatId: string | number) => number;
    getAllByChatId: (chatId: string | number) => Array<{ threadId: string | null; value: T }>;
    getInternalMap: () => Map<string, T>;
    size: () => number;
    clear: () => void;
}

/**
 * Utilidad para gestionar claves de estado con soporte para hilos
 * Proporciona un sistema unificado para generar y validar claves compuestas
 */
class StateKeyManager {
    /**
     * Genera una clave compuesta única para identificar un contexto chat+hilo
     */
    static getContextKey(chatId: string | number, threadId?: string | number | null): string {
        return `${chatId}${threadId ? ':' + threadId : ''}`;
    }

    /**
     * Extrae chatId y threadId de una clave de contexto
     */
    static parseContextKey(contextKey: string): IParsedContextKey {
        const parts = contextKey.split(':');
        return {
            chatId: parts[0],
            threadId: parts.length > 1 ? parts[1] : null
        };
    }

    /**
     * Extrae threadId de un contexto de Telegraf
     */
    static getThreadId(ctx: BotContext): number | string | null {
        // Validar que ctx existe
        if (!ctx || typeof ctx !== 'object') {
            return null;
        }

        // Extraer threadId de un mensaje normal
        if (ctx.message && 'message_thread_id' in ctx.message) {
            return (ctx.message as any).message_thread_id;
        }

        // Extraer threadId de un callback_query
        if (ctx.callbackQuery?.message && 'message_thread_id' in ctx.callbackQuery.message) {
            return (ctx.callbackQuery.message as any).message_thread_id;
        }

        return null;
    }

    /**
     * Crea un objeto Map especializado que almacena estados usando claves compuestas de chatId+threadId
     */
    static createThreadSafeStateMap<T = any>(): IThreadSafeStateMap<T> {
        const stateMap = new Map<string, T>();

        return {
            // Almacena un valor asociado a una combinación de chatId y threadId
            set: (
                chatId: string | number,
                value: T,
                threadId: string | number | null = null
            ): T => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                stateMap.set(key, value);
                logger.debug(`Estado guardado para key=${key}`, { chatId, threadId, value });
                return value;
            },

            // Obtiene un valor para una combinación de chatId y threadId
            get: (
                chatId: string | number,
                threadId: string | number | null = null
            ): T | undefined => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                return stateMap.get(key);
            },

            // Verifica si existe un valor para una combinación de chatId y threadId
            has: (chatId: string | number, threadId: string | number | null = null): boolean => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                const exists = stateMap.has(key);
                logger.debug(`Verificando estado para key=${key}, existe=${exists}`, {
                    chatId,
                    threadId
                });
                return exists;
            },

            // Elimina un valor para una combinación de chatId y threadId
            delete: (chatId: string | number, threadId: string | number | null = null): boolean => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                return stateMap.delete(key);
            },

            // Elimina todos los valores asociados a un chatId, sin importar el threadId
            deleteAll: (chatId: string | number): number => {
                let count = 0;
                const keysToDelete: string[] = [];

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
            getAllByChatId: (
                chatId: string | number
            ): Array<{ threadId: string | null; value: T }> => {
                const result: Array<{ threadId: string | null; value: T }> = [];
                for (const [key, value] of stateMap.entries()) {
                    if (key === `${chatId}` || key.startsWith(`${chatId}:`)) {
                        const { threadId } = StateKeyManager.parseContextKey(key);
                        result.push({ threadId, value });
                    }
                }
                return result;
            },

            // Retorna el mapa interno completo (para debugging)
            getInternalMap: (): Map<string, T> => stateMap,

            // Retorna el tamaño del mapa
            size: (): number => stateMap.size,

            // Limpia el mapa completamente
            clear: (): void => stateMap.clear()
        };
    }

    /**
     * Valida si una clave de contexto tiene el formato correcto
     */
    static isValidContextKey(contextKey: string): boolean {
        if (typeof contextKey !== 'string' || contextKey.length === 0) {
            return false;
        }

        const parts = contextKey.split(':');
        // Debe tener al menos un chatId, y opcionalmente un threadId
        return parts.length >= 1 && parts.length <= 2 && parts[0].length > 0;
    }

    /**
     * Genera una clave temporal única para operaciones de corta duración
     */
    static generateTempKey(prefix: string = 'temp'): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}:${timestamp}:${random}`;
    }

    /**
     * Normaliza un ID de chat o thread para uso consistente en claves
     */
    static normalizeId(id: string | number): string {
        return String(id).trim();
    }
}

export default StateKeyManager;
