const logger = require('../../utils/logger');

class AdminStateManager {
    constructor() {
        this.ADMIN_TIMEOUT = 5 * 60 * 1000; // 5 minutos para operaciones admin
        this.adminStates = new Map();
        this.timeouts = new Map();
    }

    /**
     * Crea una clave de estado basada en userId y chatId
     */
    createStateKey(userId, chatId) {
        return `${userId}:${chatId}`;
    }

    /**
   * Crea un estado administrativo con timeout especial
   */
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

        // Configurar timeout
        this.setAdminTimeout(stateKey);

        logger.info(`Estado admin creado: ${operation} para usuario ${userId}`);

        return adminState;
    }

    /**
   * Obtiene el estado administrativo actual
   */
    getAdminState(userId, chatId) {
        const stateKey = this.createStateKey(userId, chatId);
        const state = this.adminStates.get(stateKey);

        if (state) {
            // Actualizar última actividad
            state.lastActivity = Date.now();
            this.setAdminTimeout(stateKey); // Resetear timeout
        }

        return state;
    }

    /**
   * Actualiza el estado administrativo
   */
    updateAdminState(userId, chatId, updates) {
        const state = this.getAdminState(userId, chatId);

        if (!state) {
            logger.warn(`Intento de actualizar estado admin inexistente para usuario ${userId}`);
            return null;
        }

        // Guardar estado anterior en historial
        state.history.push({
            timestamp: Date.now(),
            previousData: { ...state.data }
        });

        // Actualizar datos
        Object.assign(state.data, updates);
        state.lastActivity = Date.now();

        return state;
    }

    /**
   * Limpia el estado administrativo
   */
    clearAdminState(userId, chatId) {
        const stateKey = this.createStateKey(userId, chatId);
        const state = this.adminStates.get(stateKey);

        if (state) {
            logger.info(`Estado admin limpiado: ${state.operation} para usuario ${userId}`);
            this.adminStates.delete(stateKey);
        }
    }

    /**
   * Configura timeout para estado admin
   */
    setAdminTimeout(stateKey) {
    // Limpiar timeout existente si hay uno
        if (this.timeouts.has(stateKey)) {
            clearTimeout(this.timeouts.get(stateKey));
        }

        const timeout = setTimeout(() => {
            const state = this.adminStates.get(stateKey);
            if (state) {
                logger.warn(`Timeout de estado admin: ${state.operation}`);
                this.adminStates.delete(stateKey);
            }
            this.timeouts.delete(stateKey);
        }, this.ADMIN_TIMEOUT);

        this.timeouts.set(stateKey, timeout);
    }

    /**
   * Obtiene estadísticas de estados admin activos
   */
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

    /**
   * Limpia estados admin antiguos
   */
    cleanupOldAdminStates() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, state] of this.adminStates) {
            if (now - state.lastActivity > this.ADMIN_TIMEOUT) {
                this.adminStates.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info(`Limpiados ${cleaned} estados admin antiguos`);
        }

        return cleaned;
    }
}

// Singleton
const adminStateManager = new AdminStateManager();

// Limpieza periódica
setInterval(() => {
    adminStateManager.cleanupOldAdminStates();
}, 60 * 1000); // Cada minuto

module.exports = adminStateManager;
