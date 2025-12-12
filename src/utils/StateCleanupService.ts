// src/utils/StateCleanupService.ts
import logger from './logger';
import config from '../config';

// Interfaces para el servicio de limpieza
interface IStateProvider {
    cleanup(cutoffTime: number): Promise<number>;
}

interface IRegisteredProvider {
    name: string;
    provider: IStateProvider;
}

interface ICleanupResult {
    cleaned: number;
    providerResults: Record<string, number>;
    timestamp: string;
}

/**
 * Servicio para limpieza periódica de estados huérfanos
 * Evita acumulación de estados que pueden causar problemas en la operación del bot
 * TTL y intervalos configurados desde config.ttl centralizado
 */
class StateCleanupService {
    private isRunning: boolean;
    private cleanupInterval: NodeJS.Timeout | null;
    private stateProviders: IRegisteredProvider[];
    private stateTimeoutMs: number;

    constructor() {
        this.isRunning = false;
        this.cleanupInterval = null;
        this.stateProviders = [];
        // TTL centralizado desde config (usa session como TTL principal)
        this.stateTimeoutMs = config.ttl.session;
    }

    /**
     * Inicializa el servicio de limpieza periódica
     * Usa TTL centralizados desde config si no se especifican
     */
    start(intervalMs?: number, timeoutMs?: number): void {
        if (this.isRunning) {
            logger.warn('StateCleanupService ya está en ejecución');
            return;
        }

        // Usar TTL centralizados desde config si no se especifican
        const cleanupIntervalMs = intervalMs ?? config.ttl.cleanupInterval;
        this.stateTimeoutMs = timeoutMs ?? config.ttl.session;
        this.isRunning = true;

        // Programar limpieza periódica
        this.cleanupInterval = setInterval(() => {
            this.runCleanup().catch(err =>
                logger.error('Error en limpieza periódica de estados:', err)
            );
        }, cleanupIntervalMs);

        logger.info('✅ StateCleanupService iniciado', {
            intervalMs: cleanupIntervalMs,
            timeoutMs: this.stateTimeoutMs
        });
    }

    /**
     * Detiene el servicio de limpieza
     */
    stop(): void {
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
     */
    registerStateProvider(provider: IStateProvider, name: string): void {
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
     */
    async runCleanup(): Promise<ICleanupResult> {
        if (this.stateProviders.length === 0) {
            logger.debug('No hay proveedores de estado registrados para limpieza');
            return {
                cleaned: 0,
                providerResults: {},
                timestamp: new Date().toISOString()
            };
        }

        logger.info('Iniciando limpieza de estados huérfanos...');

        // Calcular timestamp de corte (ahora - timeout)
        const cutoffTime = Date.now() - this.stateTimeoutMs;

        let totalCleaned = 0;
        const results: Record<string, number> = {};

        // Limpiar cada proveedor
        for (const { name, provider } of this.stateProviders) {
            try {
                const cleaned = await provider.cleanup(cutoffTime);

                if (cleaned > 0) {
                    logger.info(`Limpiados ${cleaned} estados huérfanos de ${name}`);
                }

                totalCleaned += cleaned;
                results[name] = cleaned;
            } catch (error: any) {
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

    /**
     * Ejecuta una limpieza manual inmediata
     */
    async forceCleanup(): Promise<ICleanupResult> {
        logger.info('Ejecutando limpieza manual de estados...');
        return await this.runCleanup();
    }

    /**
     * Obtiene estadísticas del servicio
     */
    getStats(): {
        isRunning: boolean;
        providersCount: number;
        timeoutMs: number;
        providers: string[];
    } {
        return {
            isRunning: this.isRunning,
            providersCount: this.stateProviders.length,
            timeoutMs: this.stateTimeoutMs,
            providers: this.stateProviders.map(p => p.name)
        };
    }

    /**
     * Actualiza el timeout para considerar estados como huérfanos
     */
    setStateTimeout(timeoutMs: number): void {
        this.stateTimeoutMs = timeoutMs;
        logger.info('StateCleanupService timeout actualizado:', { timeoutMs });
    }

    /**
     * Desregistra un proveedor de estados
     */
    unregisterStateProvider(name: string): boolean {
        const index = this.stateProviders.findIndex(p => p.name === name);
        if (index >= 0) {
            this.stateProviders.splice(index, 1);
            logger.info(`StateProvider desregistrado: ${name}`);
            return true;
        }
        return false;
    }
}

// Exportar como singleton
const cleanupService = new StateCleanupService();
export default cleanupService;
