"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../../utils/logger"));
class AdminStateManager {
    constructor() {
        this.ADMIN_TIMEOUT = 5 * 60 * 1000;
        this.adminStates = new Map();
        this.timeouts = new Map();
    }
    createStateKey(userId, chatId) {
        return `${userId}:${chatId}`;
    }
    createAdminState(userId, chatId, operation, data = {}) {
        const stateKey = this.createStateKey(userId, chatId);
        const adminState = {
            operation,
            data,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            history: []
        };
        this.adminStates.set(stateKey, adminState);
        this.setAdminTimeout(stateKey);
        logger_1.default.info(`Estado admin creado: ${operation} para usuario ${userId}`);
        return adminState;
    }
    getAdminState(userId, chatId) {
        const stateKey = this.createStateKey(userId, chatId);
        const state = this.adminStates.get(stateKey);
        if (state) {
            state.lastActivity = Date.now();
            this.setAdminTimeout(stateKey);
        }
        return state;
    }
    updateAdminState(userId, chatId, updates) {
        const state = this.getAdminState(userId, chatId);
        if (!state) {
            logger_1.default.warn(`Intento de actualizar estado admin inexistente para usuario ${userId}`);
            return null;
        }
        state.history.push({
            timestamp: Date.now(),
            previousData: { ...state.data }
        });
        Object.assign(state.data, updates);
        state.lastActivity = Date.now();
        return state;
    }
    clearAdminState(userId, chatId) {
        const stateKey = this.createStateKey(userId, chatId);
        const state = this.adminStates.get(stateKey);
        if (state) {
            logger_1.default.info(`Estado admin limpiado: ${state.operation} para usuario ${userId}`);
            this.adminStates.delete(stateKey);
        }
        if (this.timeouts.has(stateKey)) {
            clearTimeout(this.timeouts.get(stateKey));
            this.timeouts.delete(stateKey);
        }
    }
    setAdminTimeout(stateKey) {
        if (this.timeouts.has(stateKey)) {
            clearTimeout(this.timeouts.get(stateKey));
        }
        const timeout = setTimeout(() => {
            const state = this.adminStates.get(stateKey);
            if (state) {
                logger_1.default.warn(`Timeout de estado admin: ${state.operation}`);
                this.adminStates.delete(stateKey);
            }
            this.timeouts.delete(stateKey);
        }, this.ADMIN_TIMEOUT);
        this.timeouts.set(stateKey, timeout);
    }
    getAdminStats() {
        const stats = {
            activeStates: this.adminStates.size,
            operations: {}
        };
        for (const [key, state] of this.adminStates) {
            const op = state.operation;
            stats.operations[op] = (stats.operations[op] || 0) + 1;
        }
        return stats;
    }
    cleanupOldAdminStates() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, state] of this.adminStates) {
            if (now - state.lastActivity > this.ADMIN_TIMEOUT) {
                this.adminStates.delete(key);
                if (this.timeouts.has(key)) {
                    clearTimeout(this.timeouts.get(key));
                    this.timeouts.delete(key);
                }
                cleaned++;
            }
        }
        if (cleaned > 0) {
            logger_1.default.info(`Limpiados ${cleaned} estados admin antiguos`);
        }
        return cleaned;
    }
}
const adminStateManager = new AdminStateManager();
setInterval(() => {
    adminStateManager.cleanupOldAdminStates();
}, 60 * 1000);
exports.default = adminStateManager;
