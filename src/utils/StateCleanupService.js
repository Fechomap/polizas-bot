// src/utils/StateCleanupService.js
const logger = require('./logger');

/**
 * Servicio para limpieza periódica de estados huérfanos
 * Evita acumulación de estados que pueden causar problemas en la operación del bot
 */
class StateCleanupService {
    constructor() {
        this.isRunning = false;
        this.cleanupInterval = null;
        this.stateProviders = [];
        
        // Tiempo límite para considerar un estado como huérfano (en milisegundos)
        this.stateTimeoutMs = 30 * 60 * 1000; // 30 minutos por defecto
    }
    
    /**
     * Inicializa el servicio de limpieza periódica
     * @param {number} intervalMs - Intervalo entre limpiezas en milisegundos
     * @param {number} timeoutMs - Tiempo en ms para considerar un estado como huérfano
     */
    start(intervalMs = 15 * 60 * 1000, timeoutMs = 30 * 60 * 1000) {
        if (this.isRunning) {
            logger.warn('StateCleanupService ya está en ejecución');
            return;
        }
        
        this.stateTimeoutMs = timeoutMs;
        this.isRunning = true;
        
        // Programar limpieza periódica
        this.cleanupInterval = setInterval(() => {
            this.runCleanup()
                .catch(err => logger.error('Error en limpieza periódica de estados:', err));
        }, intervalMs);
        
        logger.info('✅ StateCleanupService iniciado', {
            intervalMs,
            timeoutMs
        });
    }
    
    /**
     * Detiene el servicio de limpieza
     */
    stop() {
        if (!this.isRunning) return;
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.isRunning = false;
        logger.info('StateCleanupService detenido');
    }
    
    /**
     * Registra un proveedor de estados para ser limpiado periódicamente
     * @param {Object} provider - Objeto que contiene estados
     * @param {Function} provider.cleanup - Función de limpieza que recibe timestamp de corte
     * @param {string} name - Nombre descriptivo del proveedor
     */
    registerStateProvider(provider, name) {
        if (!provider || typeof provider.cleanup !== 'function') {
            logger.error('Provider inválido para StateCleanupService', { name });
            return;
        }
        
        this.stateProviders.push({
            name,
            provider
        });
        
        logger.info(`StateProvider registrado: ${name}`);
    }
    
    /**
     * Ejecuta la limpieza de estados huérfanos en todos los proveedores registrados
     * @returns {Promise<Object>} Resultado de la limpieza
     */
    async runCleanup() {
        if (this.stateProviders.length === 0) {
            logger.debug('No hay proveedores de estado registrados para limpieza');
            return { cleaned: 0 };
        }
        
        logger.info('Iniciando limpieza de estados huérfanos...');
        
        // Calcular timestamp de corte (ahora - timeout)
        const cutoffTime = Date.now() - this.stateTimeoutMs;
        
        let totalCleaned = 0;
        const results = {};
        
        // Limpiar cada proveedor
        for (const { name, provider } of this.stateProviders) {
            try {
                const cleaned = await provider.cleanup(cutoffTime);
                
                if (cleaned > 0) {
                    logger.info(`Limpiados ${cleaned} estados huérfanos de ${name}`);
                }
                
                totalCleaned += cleaned;
                results[name] = cleaned;
            } catch (error) {
                logger.error(`Error limpiando estados de ${name}:`, error);
                results[name] = -1; // Indicar error
            }
        }
        
        logger.info(`Limpieza de estados completada. Total: ${totalCleaned}`);
        return {
            cleaned: totalCleaned,
            providerResults: results,
            timestamp: new Date().toISOString()
        };
    }
}

// Exportar como singleton
const cleanupService = new StateCleanupService();
module.exports = cleanupService;