"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./logger"));
const StateKeyManager_1 = __importDefault(require("./StateKeyManager"));
class FlowStateManager {
    constructor() {
        this.flowStates = new Map();
        this.contexts = new Map();
        this.counters = new Map();
        logger_1.default.info('FlowStateManager inicializado');
        try {
            const stateCleanupService = require('./StateCleanupService');
            stateCleanupService.registerStateProvider(this, 'FlowStateManager');
        }
        catch (error) {
            logger_1.default.warn('No se pudo registrar en StateCleanupService:', error.message);
        }
    }
    _getContextKey(chatId, threadId) {
        return StateKeyManager_1.default.getContextKey(chatId, threadId);
    }
    saveState(chatId, numeroPoliza, stateData, threadId) {
        if (!chatId || !numeroPoliza) {
            logger_1.default.warn('Intento de guardar estado sin chatId o numeroPoliza válidos');
            return false;
        }
        const contextKey = this._getContextKey(chatId, threadId);
        if (!this.flowStates.has(contextKey)) {
            this.flowStates.set(contextKey, new Map());
        }
        this.flowStates.get(contextKey).set(numeroPoliza, {
            ...stateData,
            createdAt: new Date()
        });
        logger_1.default.debug('Estado guardado:', { chatId, numeroPoliza, threadId, stateData });
        return true;
    }
    getState(chatId, numeroPoliza, threadId) {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates)
            return null;
        return chatStates.get(numeroPoliza) || null;
    }
    hasState(chatId, numeroPoliza, threadId) {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        return chatStates ? chatStates.has(numeroPoliza) : false;
    }
    clearState(chatId, numeroPoliza, threadId) {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates)
            return false;
        const result = chatStates.delete(numeroPoliza);
        if (chatStates.size === 0) {
            this.flowStates.delete(contextKey);
        }
        logger_1.default.debug('Estado eliminado:', { chatId, numeroPoliza, threadId, result });
        return result;
    }
    clearAllStates(chatId, threadId) {
        const contextKey = this._getContextKey(chatId, threadId);
        const result = this.flowStates.delete(contextKey);
        logger_1.default.debug('Todos los estados eliminados para contextKey:', { contextKey, result });
        return result;
    }
    getActiveFlows(chatId, threadId) {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates)
            return [];
        return Array.from(chatStates.entries()).map(([numeroPoliza, data]) => ({
            numeroPoliza,
            ...data
        }));
    }
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
    validateThreadMatch(chatId, numeroPoliza, threadId) {
        const contextKey = this._getContextKey(chatId, threadId);
        if (this.flowStates.has(contextKey) && this.flowStates.get(contextKey).has(numeroPoliza)) {
            return true;
        }
        if (!threadId) {
            for (const [otherContextKey, stateMap] of this.flowStates.entries()) {
                if (otherContextKey.startsWith(`${chatId}-`) && stateMap.has(numeroPoliza)) {
                    logger_1.default.warn('Intento de acceso a flujo sin threadId, pero existe en otro hilo', {
                        chatId,
                        numeroPoliza,
                        existingThread: otherContextKey.split('-')[1]
                    });
                    return false;
                }
            }
        }
        return true;
    }
    async cleanup(cutoffTime) {
        let removed = 0;
        const now = Date.now();
        if (!cutoffTime) {
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            cutoffTime = now - TWO_HOURS;
        }
        for (const [contextKey, stateMap] of this.flowStates.entries()) {
            for (const [flowId, data] of stateMap.entries()) {
                const lastUpdate = data.createdAt ? data.createdAt.getTime() : 0;
                if (lastUpdate < cutoffTime) {
                    stateMap.delete(flowId);
                    removed++;
                    logger_1.default.debug(`Eliminado contexto antiguo: ${flowId} (contextKey: ${contextKey})`, {
                        lastUpdate: new Date(lastUpdate).toISOString(),
                        age: Math.round((now - lastUpdate) / 1000 / 60) + ' minutos'
                    });
                }
            }
            if (stateMap.size === 0) {
                this.flowStates.delete(contextKey);
            }
        }
        if (removed > 0) {
            logger_1.default.info(`Limpiados ${removed} contextos antiguos de FlowStateManager`);
        }
        return removed;
    }
    getStats() {
        const stats = {
            totalContexts: this.flowStates.size,
            totalFlows: 0,
            contextBreakdown: {}
        };
        this.flowStates.forEach((stateMap, contextKey) => {
            stats.totalFlows += stateMap.size;
            stats.contextBreakdown[contextKey] = stateMap.size;
        });
        return stats;
    }
}
exports.default = new FlowStateManager();
