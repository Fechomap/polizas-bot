"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./logger"));
class StateKeyManager {
    static getContextKey(chatId, threadId) {
        return `${chatId}${threadId ? ':' + threadId : ''}`;
    }
    static parseContextKey(contextKey) {
        const parts = contextKey.split(':');
        return {
            chatId: parts[0],
            threadId: parts.length > 1 ? parts[1] : null
        };
    }
    static getThreadId(ctx) {
        if (!ctx || typeof ctx !== 'object') {
            return null;
        }
        if (ctx.message && 'message_thread_id' in ctx.message) {
            return ctx.message.message_thread_id;
        }
        if (ctx.callbackQuery?.message && 'message_thread_id' in ctx.callbackQuery.message) {
            return ctx.callbackQuery.message.message_thread_id;
        }
        return null;
    }
    static createThreadSafeStateMap() {
        const stateMap = new Map();
        return {
            set: (chatId, value, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                stateMap.set(key, value);
                logger_1.default.debug(`Estado guardado para key=${key}`, { chatId, threadId, value });
                return value;
            },
            get: (chatId, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                return stateMap.get(key);
            },
            has: (chatId, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                const exists = stateMap.has(key);
                logger_1.default.debug(`Verificando estado para key=${key}, existe=${exists}`, {
                    chatId,
                    threadId
                });
                return exists;
            },
            delete: (chatId, threadId = null) => {
                const key = StateKeyManager.getContextKey(chatId, threadId);
                return stateMap.delete(key);
            },
            deleteAll: (chatId) => {
                let count = 0;
                const keysToDelete = [];
                for (const key of stateMap.keys()) {
                    if (key === `${chatId}` || key.startsWith(`${chatId}:`)) {
                        keysToDelete.push(key);
                    }
                }
                for (const key of keysToDelete) {
                    stateMap.delete(key);
                    count++;
                }
                logger_1.default.debug(`Eliminados ${count} estados para chatId=${chatId}`);
                return count;
            },
            getAllByChatId: (chatId) => {
                const result = [];
                for (const [key, value] of stateMap.entries()) {
                    if (key === `${chatId}` || key.startsWith(`${chatId}:`)) {
                        const { threadId } = StateKeyManager.parseContextKey(key);
                        result.push({ threadId, value });
                    }
                }
                return result;
            },
            getInternalMap: () => stateMap,
            size: () => stateMap.size,
            clear: () => stateMap.clear()
        };
    }
    static isValidContextKey(contextKey) {
        if (typeof contextKey !== 'string' || contextKey.length === 0) {
            return false;
        }
        const parts = contextKey.split(':');
        return parts.length >= 1 && parts.length <= 2 && parts[0].length > 0;
    }
    static generateTempKey(prefix = 'temp') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}:${timestamp}:${random}`;
    }
    static normalizeId(id) {
        return String(id).trim();
    }
}
exports.default = StateKeyManager;
