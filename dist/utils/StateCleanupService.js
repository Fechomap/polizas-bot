"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./logger"));
class StateCleanupService {
    constructor() {
        this.isRunning = false;
        this.cleanupInterval = null;
        this.stateProviders = [];
        this.stateTimeoutMs = 30 * 60 * 1000;
    }
    start(intervalMs = 15 * 60 * 1000, timeoutMs = 30 * 60 * 1000) {
        if (this.isRunning) {
            logger_1.default.warn('StateCleanupService ya está en ejecución');
            return;
        }
        this.stateTimeoutMs = timeoutMs;
        this.isRunning = true;
        this.cleanupInterval = setInterval(() => {
            this.runCleanup().catch(err => logger_1.default.error('Error en limpieza periódica de estados:', err));
        }, intervalMs);
        logger_1.default.info('✅ StateCleanupService iniciado', {
            intervalMs,
            timeoutMs
        });
    }
    stop() {
        if (!this.isRunning)
            return;
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.isRunning = false;
        logger_1.default.info('StateCleanupService detenido');
    }
    registerStateProvider(provider, name) {
        if (!provider || typeof provider.cleanup !== 'function') {
            logger_1.default.error('Provider inválido para StateCleanupService', { name });
            return;
        }
        this.stateProviders.push({
            name,
            provider
        });
        logger_1.default.info(`StateProvider registrado: ${name}`);
    }
    async runCleanup() {
        if (this.stateProviders.length === 0) {
            logger_1.default.debug('No hay proveedores de estado registrados para limpieza');
            return {
                cleaned: 0,
                providerResults: {},
                timestamp: new Date().toISOString()
            };
        }
        logger_1.default.info('Iniciando limpieza de estados huérfanos...');
        const cutoffTime = Date.now() - this.stateTimeoutMs;
        let totalCleaned = 0;
        const results = {};
        for (const { name, provider } of this.stateProviders) {
            try {
                const cleaned = await provider.cleanup(cutoffTime);
                if (cleaned > 0) {
                    logger_1.default.info(`Limpiados ${cleaned} estados huérfanos de ${name}`);
                }
                totalCleaned += cleaned;
                results[name] = cleaned;
            }
            catch (error) {
                logger_1.default.error(`Error limpiando estados de ${name}:`, error);
                results[name] = -1;
            }
        }
        logger_1.default.info(`Limpieza de estados completada. Total: ${totalCleaned}`);
        return {
            cleaned: totalCleaned,
            providerResults: results,
            timestamp: new Date().toISOString()
        };
    }
    async forceCleanup() {
        logger_1.default.info('Ejecutando limpieza manual de estados...');
        return await this.runCleanup();
    }
    getStats() {
        return {
            isRunning: this.isRunning,
            providersCount: this.stateProviders.length,
            timeoutMs: this.stateTimeoutMs,
            providers: this.stateProviders.map(p => p.name)
        };
    }
    setStateTimeout(timeoutMs) {
        this.stateTimeoutMs = timeoutMs;
        logger_1.default.info('StateCleanupService timeout actualizado:', { timeoutMs });
    }
    unregisterStateProvider(name) {
        const index = this.stateProviders.findIndex(p => p.name === name);
        if (index >= 0) {
            this.stateProviders.splice(index, 1);
            logger_1.default.info(`StateProvider desregistrado: ${name}`);
            return true;
        }
        return false;
    }
}
const cleanupService = new StateCleanupService();
exports.default = cleanupService;
