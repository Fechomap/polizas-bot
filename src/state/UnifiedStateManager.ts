// src/state/UnifiedStateManager.ts
/**
 * UnifiedStateManager - Sistema centralizado de estados en Redis
 *
 * UNICA FUENTE DE VERDAD para todos los estados del bot.
 * Reemplaza: FlowStateManager, RedisStateManager, MemoryStateManager, StateFactory
 * y todos los Maps en memoria de commandHandler y OcuparPolizaFlow.
 *
 * Características:
 * - Redis como almacenamiento principal (L2)
 * - NodeCache como cache en memoria (L1) para lecturas rápidas
 * - TTL automático de 1 hora para todos los estados
 * - Inicialización SÍNCRONA garantizada (factory pattern)
 * - Logs explícitos cuando Redis no disponible
 */

import Redis from 'ioredis';
import NodeCache from 'node-cache';
import RedisConnectionPool from '../infrastructure/RedisConnectionPool';
import config from '../config';
import logger from '../utils/logger';

// Prefijos para organizar keys en Redis
const PREFIXES = {
    STATE: 'state:', // Estados simples (awaiting*)
    FLOW: 'flow:', // Estados de flujo complejos
    SESSION: 'session:' // Datos de sesión
} as const;

// Interfaces
export interface IStateStats {
    redisConnected: boolean;
    l1CacheSize: number;
    redisKeysCount: number;
    ttlSeconds: number;
}

export interface IUnifiedStateManager {
    // Estados simples (awaiting*)
    setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | null
    ): Promise<void>;
    getAwaitingState<T>(
        chatId: number,
        stateType: string,
        threadId?: number | null
    ): Promise<T | null>;
    hasAwaitingState(chatId: number, stateType: string, threadId?: number | null): Promise<boolean>;
    deleteAwaitingState(chatId: number, stateType: string, threadId?: number | null): Promise<void>;

    // Estados de flujo (con datos complejos)
    setFlowState(
        chatId: number,
        flowId: string,
        data: object,
        threadId?: number | null
    ): Promise<void>;
    getFlowState<T>(chatId: number, flowId: string, threadId?: number | null): Promise<T | null>;
    updateFlowState(
        chatId: number,
        flowId: string,
        partialData: object,
        threadId?: number | null
    ): Promise<void>;
    deleteFlowState(chatId: number, flowId: string, threadId?: number | null): Promise<void>;

    // Limpieza
    clearAllStates(chatId: number, threadId?: number | null): Promise<number>;
    cleanup(cutoffTime?: number): Promise<number>;

    // Diagnóstico
    getStats(): Promise<IStateStats>;
    isReady(): boolean;
}

/**
 * Implementación del UnifiedStateManager
 */
class UnifiedStateManagerImpl implements IUnifiedStateManager {
    private redis: Redis | null = null;
    private l1Cache: NodeCache;
    private isRedisConnected = false;
    private readonly ttlSeconds: number;
    private readonly l1TtlSeconds: number;

    constructor() {
        // TTL centralizado desde config (1 hora = 3600000ms)
        this.ttlSeconds = Math.ceil(config.ttl.session / 1000);
        // L1 cache: 5 minutos para lecturas rápidas
        this.l1TtlSeconds = Math.ceil(config.ttl.cacheMemory / 1000);

        this.l1Cache = new NodeCache({
            stdTTL: this.l1TtlSeconds,
            checkperiod: 60,
            useClones: false
        });
    }

    /**
     * Inicializa la conexión a Redis - DEBE llamarse con await
     */
    async initialize(): Promise<void> {
        try {
            this.redis = await RedisConnectionPool.getInstance();

            if (this.redis) {
                // Esperar a que Redis esté realmente conectado
                if (this.redis.status === 'ready') {
                    this.isRedisConnected = true;
                } else {
                    // Esperar evento ready con timeout
                    await new Promise<void>((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('Redis connection timeout (5s)'));
                        }, 5000);

                        this.redis!.once('ready', () => {
                            clearTimeout(timeout);
                            this.isRedisConnected = true;
                            resolve();
                        });

                        this.redis!.once('error', err => {
                            clearTimeout(timeout);
                            reject(err);
                        });
                    });
                }

                // Configurar listeners para cambios de estado
                this.redis.on('ready', () => {
                    this.isRedisConnected = true;
                    logger.info('UnifiedStateManager: Redis conectado');
                });

                this.redis.on('error', err => {
                    this.isRedisConnected = false;
                    logger.error('UnifiedStateManager: Error de Redis', { error: err.message });
                });

                this.redis.on('close', () => {
                    this.isRedisConnected = false;
                    logger.warn('UnifiedStateManager: Redis desconectado');
                });

                logger.info('UnifiedStateManager: Inicializado correctamente', {
                    ttlSeconds: this.ttlSeconds,
                    l1TtlSeconds: this.l1TtlSeconds,
                    redisDb: config.redis.db
                });
            }
        } catch (error) {
            this.isRedisConnected = false;
            logger.error('UnifiedStateManager: Error inicializando Redis', { error });
            logger.warn('UnifiedStateManager: Funcionando SOLO con cache L1 (memoria)');
        }
    }

    // ==================== HELPERS ====================

    /**
     * Genera key para estados awaiting
     */
    private getStateKey(chatId: number, stateType: string, threadId?: number | null): string {
        const threadSuffix = threadId ? `:${threadId}` : '';
        return `${PREFIXES.STATE}${chatId}${threadSuffix}:${stateType}`;
    }

    /**
     * Genera key para estados de flujo
     */
    private getFlowKey(chatId: number, flowId: string, threadId?: number | null): string {
        const threadSuffix = threadId ? `:${threadId}` : '';
        return `${PREFIXES.FLOW}${chatId}${threadSuffix}:${flowId}`;
    }

    /**
     * Guarda en Redis con TTL
     */
    private async saveToRedis(key: string, value: any): Promise<boolean> {
        if (!this.redis || !this.isRedisConnected) {
            logger.debug(`UnifiedStateManager: Redis no disponible, solo L1 cache para key=${key}`);
            return false;
        }

        try {
            const serialized = JSON.stringify(value);
            await this.redis.setex(key, this.ttlSeconds, serialized);
            return true;
        } catch (error) {
            logger.error('UnifiedStateManager: Error guardando en Redis', { key, error });
            return false;
        }
    }

    /**
     * Lee de Redis
     */
    private async getFromRedis<T>(key: string): Promise<T | null> {
        if (!this.redis || !this.isRedisConnected) {
            return null;
        }

        try {
            const data = await this.redis.get(key);
            if (data) {
                // Renovar TTL (sliding window)
                await this.redis.expire(key, this.ttlSeconds);
                return JSON.parse(data) as T;
            }
            return null;
        } catch (error) {
            logger.error('UnifiedStateManager: Error leyendo de Redis', { key, error });
            return null;
        }
    }

    /**
     * Elimina de Redis
     */
    private async deleteFromRedis(key: string): Promise<boolean> {
        if (!this.redis || !this.isRedisConnected) {
            return false;
        }

        try {
            await this.redis.del(key);
            return true;
        } catch (error) {
            logger.error('UnifiedStateManager: Error eliminando de Redis', { key, error });
            return false;
        }
    }

    // ==================== ESTADOS AWAITING ====================

    async setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | null
    ): Promise<void> {
        const key = this.getStateKey(chatId, stateType, threadId);

        // Guardar en L1 cache
        this.l1Cache.set(key, value);

        // Guardar en Redis (L2)
        await this.saveToRedis(key, value);

        logger.debug('UnifiedStateManager: Estado guardado', { key, stateType });
    }

    async getAwaitingState<T>(
        chatId: number,
        stateType: string,
        threadId?: number | null
    ): Promise<T | null> {
        const key = this.getStateKey(chatId, stateType, threadId);

        // Buscar en L1 cache primero
        const l1Value = this.l1Cache.get<T>(key);
        if (l1Value !== undefined) {
            return l1Value;
        }

        // Buscar en Redis (L2)
        const l2Value = await this.getFromRedis<T>(key);
        if (l2Value !== null) {
            // Cachear en L1 para futuras lecturas
            this.l1Cache.set(key, l2Value);
            return l2Value;
        }

        return null;
    }

    async hasAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | null
    ): Promise<boolean> {
        const value = await this.getAwaitingState(chatId, stateType, threadId);
        return value !== null;
    }

    async deleteAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | null
    ): Promise<void> {
        const key = this.getStateKey(chatId, stateType, threadId);

        // Eliminar de L1
        this.l1Cache.del(key);

        // Eliminar de Redis
        await this.deleteFromRedis(key);

        logger.debug('UnifiedStateManager: Estado eliminado', { key, stateType });
    }

    // ==================== ESTADOS DE FLUJO ====================

    async setFlowState(
        chatId: number,
        flowId: string,
        data: object,
        threadId?: number | null
    ): Promise<void> {
        const key = this.getFlowKey(chatId, flowId, threadId);
        const stateData = {
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Guardar en L1 cache
        this.l1Cache.set(key, stateData);

        // Guardar en Redis (L2)
        await this.saveToRedis(key, stateData);

        logger.debug('UnifiedStateManager: Flow state guardado', { key, flowId });
    }

    async getFlowState<T>(
        chatId: number,
        flowId: string,
        threadId?: number | null
    ): Promise<T | null> {
        const key = this.getFlowKey(chatId, flowId, threadId);

        // Buscar en L1 cache primero
        const l1Value = this.l1Cache.get<T>(key);
        if (l1Value !== undefined) {
            return l1Value;
        }

        // Buscar en Redis (L2)
        const l2Value = await this.getFromRedis<T>(key);
        if (l2Value !== null) {
            // Cachear en L1
            this.l1Cache.set(key, l2Value);
            return l2Value;
        }

        return null;
    }

    async updateFlowState(
        chatId: number,
        flowId: string,
        partialData: object,
        threadId?: number | null
    ): Promise<void> {
        const existing = await this.getFlowState<object>(chatId, flowId, threadId);
        const merged = {
            ...(existing ?? {}),
            ...partialData,
            updatedAt: new Date().toISOString()
        };

        await this.setFlowState(chatId, flowId, merged, threadId);
    }

    async deleteFlowState(chatId: number, flowId: string, threadId?: number | null): Promise<void> {
        const key = this.getFlowKey(chatId, flowId, threadId);

        // Eliminar de L1
        this.l1Cache.del(key);

        // Eliminar de Redis
        await this.deleteFromRedis(key);

        logger.debug('UnifiedStateManager: Flow state eliminado', { key, flowId });
    }

    // ==================== LIMPIEZA ====================

    async clearAllStates(chatId: number, threadId?: number | null): Promise<number> {
        let deleted = 0;
        const threadSuffix = threadId ? `:${threadId}` : '';
        const patterns = [
            `${PREFIXES.STATE}${chatId}${threadSuffix}:*`,
            `${PREFIXES.FLOW}${chatId}${threadSuffix}:*`
        ];

        // Limpiar L1 cache (keys que coincidan)
        const l1Keys = this.l1Cache.keys();
        for (const key of l1Keys) {
            if (
                key.startsWith(`${PREFIXES.STATE}${chatId}`) ||
                key.startsWith(`${PREFIXES.FLOW}${chatId}`)
            ) {
                // Si hay threadId, verificar que coincida
                if (threadId) {
                    if (key.includes(`:${threadId}:`)) {
                        this.l1Cache.del(key);
                        deleted++;
                    }
                } else {
                    this.l1Cache.del(key);
                    deleted++;
                }
            }
        }

        // Limpiar Redis
        if (this.redis && this.isRedisConnected) {
            for (const pattern of patterns) {
                try {
                    const keys = await this.scanKeys(pattern);
                    if (keys.length > 0) {
                        await this.redis.del(...keys);
                        deleted += keys.length;
                    }
                } catch (error) {
                    logger.error('UnifiedStateManager: Error limpiando Redis', { pattern, error });
                }
            }
        }

        logger.info('UnifiedStateManager: Estados limpiados', { chatId, threadId, deleted });
        return deleted;
    }

    /**
     * Escanea keys de Redis usando SCAN (no bloqueante)
     */
    private async scanKeys(pattern: string, maxKeys = 10000): Promise<string[]> {
        if (!this.redis || !this.isRedisConnected) return [];

        const keys: string[] = [];
        let cursor = '0';

        do {
            const [nextCursor, foundKeys] = await this.redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100
            );
            cursor = nextCursor;
            keys.push(...foundKeys);

            if (keys.length >= maxKeys) {
                logger.warn(`UnifiedStateManager: Límite de ${maxKeys} keys alcanzado en scan`);
                break;
            }
        } while (cursor !== '0');

        return keys;
    }

    async cleanup(cutoffTime?: number): Promise<number> {
        // Redis maneja TTL automáticamente, solo limpiamos L1
        const now = Date.now();
        const effectiveCutoff = cutoffTime ?? now - config.ttl.session;

        // NodeCache maneja su propio TTL, forzar limpieza
        const stats = this.l1Cache.getStats();
        logger.info('UnifiedStateManager: Cleanup ejecutado', {
            l1Keys: stats.keys,
            l1Hits: stats.hits,
            l1Misses: stats.misses
        });

        return 0; // Redis TTL maneja la limpieza automáticamente
    }

    // ==================== DIAGNÓSTICO ====================

    async getStats(): Promise<IStateStats> {
        let redisKeysCount = 0;

        if (this.redis && this.isRedisConnected) {
            try {
                const stateKeys = await this.scanKeys(`${PREFIXES.STATE}*`, 100000);
                const flowKeys = await this.scanKeys(`${PREFIXES.FLOW}*`, 100000);
                redisKeysCount = stateKeys.length + flowKeys.length;
            } catch (error) {
                logger.error('UnifiedStateManager: Error obteniendo stats de Redis', { error });
            }
        }

        return {
            redisConnected: this.isRedisConnected,
            l1CacheSize: this.l1Cache.keys().length,
            redisKeysCount,
            ttlSeconds: this.ttlSeconds
        };
    }

    isReady(): boolean {
        return this.isRedisConnected;
    }
}

// ==================== SINGLETON CON FACTORY ====================

let instance: UnifiedStateManagerImpl | null = null;
let initializationPromise: Promise<UnifiedStateManagerImpl> | null = null;

/**
 * Factory para obtener la instancia inicializada
 * IMPORTANTE: Usar await para garantizar que Redis esté conectado
 */
export async function getUnifiedStateManager(): Promise<IUnifiedStateManager> {
    if (instance) {
        return instance;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        const manager = new UnifiedStateManagerImpl();
        await manager.initialize();
        instance = manager;
        return manager;
    })();

    return initializationPromise;
}

/**
 * Obtiene la instancia SIN esperar inicialización
 * SOLO usar después de que el bot haya iniciado
 */
export function getUnifiedStateManagerSync(): IUnifiedStateManager | null {
    return instance;
}

export default { getUnifiedStateManager, getUnifiedStateManagerSync };
