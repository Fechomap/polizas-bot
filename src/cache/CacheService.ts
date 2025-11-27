// src/cache/CacheService.ts

import NodeCache from 'node-cache';
import Redis from 'ioredis';
import config from '../config';
import logger from '../utils/logger';

/**
 * Servicio de caché de dos niveles (L1 en memoria, L2 en Redis).
 * - L1 (node-cache): Caché local, muy rápida, para datos accedidos frecuentemente. TTL corto.
 * - L2 (Redis): Caché compartida, persistente, para una consistencia mayor entre instancias. TTL más largo.
 */
class CacheService {
    private l1Cache: NodeCache;
    private l2Cache: Redis;
    private isL2Connected = false;

    constructor() {
        // Configuración de L1 Cache (en memoria)
        this.l1Cache = new NodeCache({
            stdTTL: 300, // 5 minutos TTL por defecto
            checkperiod: 60, // Revisa expirados cada minuto
            useClones: false // Mejora performance al no clonar objetos
        });

        // Configuración de L2 Cache (Redis - soporta URL o host/port)
        const redisConfig = config.redis.url
            ? { lazyConnect: true, maxRetriesPerRequest: 3, connectTimeout: 10000 }
            : {
                  host: config.redis.host,
                  port: config.redis.port,
                  password: config.redis.password,
                  maxRetriesPerRequest: 3,
                  connectTimeout: 10000,
                  lazyConnect: true
              };
        this.l2Cache = config.redis.url
            ? new Redis(config.redis.url, redisConfig)
            : new Redis(redisConfig);

        this.l2Cache.on('connect', () => {
            this.isL2Connected = true;
            logger.info('CacheService: Conectado a Redis (L2).');
        });

        this.l2Cache.on('error', err => {
            this.isL2Connected = false;
            logger.error('CacheService: Error de conexión con Redis (L2).', { error: err.message });
        });

        // Conectar a Redis
        this.l2Cache.connect().catch(err => {
            logger.error('CacheService: Fallo en la conexión inicial a Redis.', {
                error: err.message
            });
        });

        logger.info('CacheService inicializado (L1: en memoria, L2: Redis).');
    }

    /**
     * Obtiene un valor de la caché.
     * Busca primero en L1, luego en L2. Si no lo encuentra, usa el `fetcher` para obtenerlo,
     * y lo almacena en ambas cachés.
     * @param key - La clave única de la caché.
     * @param fetcher - Una función asíncrona que obtiene el dato si no está en caché.
     * @param ttlSeconds - TTL en segundos para este item específico.
     * @returns El dato desde la caché o el fetcher.
     */
    async get<T>(key: string, fetcher: () => Promise<T>, ttlSeconds = 3600): Promise<T> {
        // 1. Intentar obtener de L1 (memoria)
        const l1Value = this.l1Cache.get<T>(key);
        if (l1Value !== undefined) {
            logger.debug(`[CACHE L1 HIT] Key: ${key}`);
            return l1Value;
        }

        // 2. Intentar obtener de L2 (Redis) si está conectado
        if (this.isL2Connected) {
            try {
                const l2Data = await this.l2Cache.get(key);
                if (l2Data) {
                    logger.debug(`[CACHE L2 HIT] Key: ${key}`);
                    const value = JSON.parse(l2Data) as T;
                    this.l1Cache.set(key, value, Math.min(300, ttlSeconds)); // Guardar en L1 con TTL más corto
                    return value;
                }
            } catch (error) {
                logger.error(`[CACHE L2 ERROR] Fallo al obtener la key ${key} de Redis.`, {
                    error
                });
            }
        }

        // 3. Si no está en caché, obtener del fetcher
        logger.debug(`[CACHE MISS] Key: ${key}. Obteniendo desde fetcher.`);
        const value = await fetcher();

        // 4. Almacenar en ambas cachés
        if (value !== null && value !== undefined) {
            this.l1Cache.set(key, value, Math.min(300, ttlSeconds));
            if (this.isL2Connected) {
                try {
                    await this.l2Cache.setex(key, ttlSeconds, JSON.stringify(value));
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
        if (this.isL2Connected) {
            try {
                await this.l2Cache.del(key);
                logger.debug(`[CACHE INVALIDATE] Key: ${key} invalidada en L1 y L2.`);
            } catch (error) {
                logger.error(`[CACHE L2 ERROR] Fallo al invalidar la key ${key} en Redis.`, {
                    error
                });
            }
        }
    }

    /**
     * Invalida todas las claves que coincidan con un patrón en L2, y limpia toda la L1.
     * ¡Usar con precaución! La búsqueda de patrones puede ser lenta en Redis.
     * @param pattern - El patrón a buscar (ej. "policy:*").
     */
    async invalidatePattern(pattern: string): Promise<void> {
        this.l1Cache.flushAll(); // L1 no soporta patrones, así que la limpiamos toda
        if (this.isL2Connected) {
            try {
                const stream = this.l2Cache.scanStream({ match: pattern, count: 100 });
                const keys: string[] = [];
                stream.on('data', resultKeys => {
                    keys.push(...resultKeys);
                });
                stream.on('end', async () => {
                    if (keys.length > 0) {
                        await this.l2Cache.del(keys);
                        logger.debug(
                            `[CACHE INVALIDATE] ${keys.length} keys invalidadas en L2 con patrón: ${pattern}`
                        );
                    }
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
