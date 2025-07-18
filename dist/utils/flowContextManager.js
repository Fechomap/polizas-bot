"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./logger"));
class FlowContextManager {
    constructor() {
        this.contexts = new Map();
        this.counters = new Map();
        logger_1.default.info('FlowContextManager inicializado');
    }
    createContext(chatId, initialState, numeroPoliza = null) {
        if (!this.counters.has(chatId)) {
            this.counters.set(chatId, 1);
        }
        const flowId = `flow_${this.counters.get(chatId)}`;
        this.counters.set(chatId, this.counters.get(chatId) + 1);
        if (!this.contexts.has(chatId)) {
            this.contexts.set(chatId, new Map());
        }
        const context = {
            flowId,
            state: initialState,
            numeroPoliza,
            data: {},
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.contexts.get(chatId).set(flowId, context);
        logger_1.default.info(`Nuevo contexto creado: ${flowId} para chat ${chatId} - estado: ${initialState}`, {
            chatId,
            flowId,
            numeroPoliza
        });
        return flowId;
    }
    updateState(chatId, flowId, newState, data = {}) {
        if (!this.contexts.has(chatId) || !this.contexts.get(chatId).has(flowId)) {
            logger_1.default.warn(`Intento de actualizar contexto inexistente: ${flowId} chat ${chatId}`);
            return false;
        }
        const context = this.contexts.get(chatId).get(flowId);
        context.state = newState;
        context.data = { ...context.data, ...data };
        context.updatedAt = new Date();
        logger_1.default.info(`Contexto actualizado: ${flowId} para chat ${chatId} - nuevo estado: ${newState}`, {
            chatId,
            flowId,
            numeroPoliza: context.numeroPoliza
        });
        return true;
    }
    getContextByState(chatId, state) {
        if (!this.contexts.has(chatId))
            return null;
        for (const [flowId, context] of this.contexts.get(chatId).entries()) {
            if (context.state === state) {
                return { ...context, flowId };
            }
        }
        return null;
    }
    getContext(chatId, flowId) {
        if (!this.contexts.has(chatId) || !this.contexts.get(chatId).has(flowId)) {
            return null;
        }
        return { ...this.contexts.get(chatId).get(flowId), flowId };
    }
    getAllContexts(chatId) {
        if (!this.contexts.has(chatId))
            return [];
        return Array.from(this.contexts.get(chatId).entries()).map(([flowId, context]) => ({
            ...context,
            flowId
        }));
    }
    removeContext(chatId, flowId) {
        if (!this.contexts.has(chatId) || !this.contexts.get(chatId).has(flowId)) {
            return false;
        }
        const result = this.contexts.get(chatId).delete(flowId);
        if (this.contexts.get(chatId).size === 0) {
            this.contexts.delete(chatId);
        }
        logger_1.default.info(`Contexto eliminado: ${flowId} para chat ${chatId}`, { chatId, flowId });
        return result;
    }
    clearAllContexts(chatId) {
        if (!this.contexts.has(chatId))
            return false;
        this.contexts.delete(chatId);
        logger_1.default.info(`Todos los contextos eliminados para chat ${chatId}`, { chatId });
        return true;
    }
    cleanupOldContexts() {
        let removed = 0;
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const now = new Date();
        for (const [chatId, contextMap] of this.contexts.entries()) {
            for (const [flowId, context] of contextMap.entries()) {
                if (now.getTime() - context.updatedAt.getTime() > TWO_HOURS) {
                    contextMap.delete(flowId);
                    removed++;
                }
            }
            if (contextMap.size === 0) {
                this.contexts.delete(chatId);
            }
        }
        if (removed > 0) {
            logger_1.default.info(`Limpiados ${removed} contextos antiguos`);
        }
        return removed;
    }
}
exports.default = new FlowContextManager();
