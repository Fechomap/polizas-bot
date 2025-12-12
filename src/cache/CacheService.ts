// src/cache/CacheService.ts

import NodeCache from 'node-cache';
import Redis from 'ioredis';
import RedisConnectionPool from '../infrastructure/RedisConnectionPool';
import config from '../config';
import logger from '../utils/logger';

/**
 * Servicio de caché de dos niveles (L1 en memoria, L2 en Redis).
 * - L1 (node-cache): Caché local, TTL fijo 5 min (no consumir RAM)
 * - L2 (Redis): Caché compartida, TTL centralizado desde config
 */
class CacheService {
    private l1Cache: NodeCache;
    private l2Cache: Redis | null = null;
    private isL2Connected = false;
    private readonly l1TtlSeconds: number;
    private readonly l2TtlSeconds: number;

    constructor() {
        // L1: TTL fijo para memoria (no consumir RAM)
        this.l1TtlSeconds = Math.ceil(config.ttl.cacheMemory / 1000);
        // L2: TTL centralizado desde config.ttl.session
        this.l2TtlSeconds = Math.ceil(config.ttl.session / 1000);

        // Configuración de L1 Cache (en memoria)
        this.l1Cache = new NodeCache({
            stdTTL: this.l1TtlSeconds,
            checkperiod: 60,
            useClones: false
        });

        // Inicializar L2 Cache usando pool compartido
        this.initializeL2Cache();

        logger.info('CacheService inicializado (L1: en memoria, L2: Redis pool compartido).');
    }

    /**
     * Inicializa L2 Cache usando el pool de conexiones compartido
     */
    private async initializeL2Cache(): Promise<void> {
        try {
            this.l2Cache = await RedisConnectionPool.getInstance();
            this.isL2Connected = RedisConnectionPool.isReady();

            // Escuchar eventos de conexión
            if (this.l2Cache) {
                this.l2Cache.on('ready', () => {
                    this.isL2Connected = true;
                    logger.info('CacheService: L2 (Redis) conectado via pool compartido');
                });

                this.l2Cache.on('error', () => {
                    this.isL2Connected = false;
                });

                this.l2Cache.on('close', () => {
                    this.isL2Connected = false;
                });
            }

            logger.info('CacheService: Usando pool de conexiones compartido para L2');
        } catch (error) {
            logger.error('CacheService: Error inicializando L2 cache', { error });
        }
    }

    /**
     * Asegura conexión L2
     */
    private async ensureL2Connection(): Promise<Redis | null> {
        if (!this.l2Cache || !RedisConnectionPool.isReady()) {
            try {
                this.l2Cache = await RedisConnectionPool.getInstance();
                this.isL2Connected = RedisConnectionPool.isReady();
            } catch {
                this.isL2Connected = false;
            }
        }
        return this.l2Cache;
    }

    /**
     * Obtiene un valor de la caché.
     * Busca primero en L1, luego en L2. Si no lo encuentra, usa el `fetcher` para obtenerlo,
     * y lo almacena en ambas cachés.
     * @param key - La clave única de la caché.
     * @param fetcher - Una función asíncrona que obtiene el dato si no está en caché.
     * @param ttlSeconds - TTL en segundos para este item específico (usa L2 TTL centralizado por defecto).
     * @returns El dato desde la caché o el fetcher.
     */
    async get<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
        // Usar TTL centralizado si no se especifica
        const l2Ttl = ttlSeconds ?? this.l2TtlSeconds;

        // 1. Intentar obtener de L1 (memoria)
        const l1Value = this.l1Cache.get<T>(key);
        if (l1Value !== undefined) {
            return l1Value;
        }

        // 2. Intentar obtener de L2 (Redis) si está conectado
        const l2 = await this.ensureL2Connection();
        if (l2 && this.isL2Connected) {
            try {
                const l2Data = await l2.get(key);
                if (l2Data) {
                    const value = JSON.parse(l2Data) as T;
                    // Usar L1 TTL centralizado
                    this.l1Cache.set(key, value, Math.min(this.l1TtlSeconds, l2Ttl));
                    return value;
                }
            } catch (error) {
                logger.error(`[CACHE L2 ERROR] Fallo al obtener la key ${key} de Redis.`, {
                    error
                });
            }
        }

        // 3. Si no está en caché, obtener del fetcher
        const value = await fetcher();

        // 4. Almacenar en ambas cachés con TTL centralizados
        if (value !== null && value !== undefined) {
            this.l1Cache.set(key, value, Math.min(this.l1TtlSeconds, l2Ttl));
            if (l2 && this.isL2Connected) {
                try {
                    await l2.setex(key, l2Ttl, JSON.stringify(value));
                } catch (error) {
                    logger.error(`[CACHE L2 ERROR] Fallo al guardar la key ${key} en Redis.`, {
                        error
                    });
                }
            }
        }

        return value;
    }

    /**
     * Invalida una clave específica en ambas cachés.
     * @param key - La clave a invalidar.
     */
    async invalidate(key: string): Promise<void> {
        this.l1Cache.del(key);
        const l2 = await this.ensureL2Connection();
        if (l2 && this.isL2Connected) {
            try {
                await l2.del(key);
            } catch (error) {
                logger.error(`[CACHE L2 ERROR] Fallo al invalidar la key ${key} en Redis.`, {
                    error
                });
            }
        }
    }

    /**
     * Invalida todas las claves que coincidan con un patrón en L2, y limpia toda la L1.
     * Procesa las keys en chunks para evitar picos de memoria.
     * @param pattern - El patrón a buscar (ej. "policy:*").
     */
    async invalidatePattern(pattern: string): Promise<void> {
        this.l1Cache.flushAll(); // L1 no soporta patrones, así que la limpiamos toda

        const l2 = await this.ensureL2Connection();
        if (l2 && this.isL2Connected) {
            try {
                const CHUNK_SIZE = 1000;
                const stream = l2.scanStream({ match: pattern, count: 100 });
                let keysBuffer: string[] = [];

                stream.on('data', async (resultKeys: string[]) => {
                    keysBuffer.push(...resultKeys);

                    // Procesar en chunks para evitar picos de memoria
                    if (keysBuffer.length >= CHUNK_SIZE) {
                        stream.pause();
                        try {
                            await l2.del(...keysBuffer);
                        } catch (error) {
                            logger.error('[CACHE L2 ERROR] Error eliminando chunk de keys', {
                                error
                            });
                        }
                        keysBuffer = [];
                        stream.resume();
                    }
                });

                stream.on('end', async () => {
                    // Eliminar keys restantes
                    if (keysBuffer.length > 0) {
                        try {
                            await l2.del(...keysBuffer);
                        } catch (error) {
                            logger.error('[CACHE L2 ERROR] Error eliminando keys finales', {
                                error
                            });
                        }
                    }
                });

                stream.on('error', (error: Error) => {
                    logger.error(`[CACHE L2 ERROR] Error en stream de invalidación`, { error });
                });
            } catch (error) {
                logger.error(
                    `[CACHE L2 ERROR] Fallo al invalidar por patrón ${pattern} en Redis.`,
                    { error }
                );
            }
        }
    }
}

// Exportar como singleton
export const cacheService = new CacheService();
