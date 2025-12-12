// src/state/RedisSessionStore.ts

import Redis from 'ioredis';
import RedisConnectionPool from '../infrastructure/RedisConnectionPool';
import config from '../config';
import logger from '../utils/logger';

/**
 * Adaptador de almacenamiento para sesiones de Telegraf utilizando Redis.
 * Usa el pool de conexiones compartido para evitar múltiples conexiones.
 * Implementa sliding window TTL (renueva TTL en cada acceso).
 */
export class RedisSessionStore<T> {
    private redis: Redis | null = null;
    private readonly prefix: string;
    private readonly ttlSeconds: number;

    constructor(prefix = 'telegraf:session:') {
        this.prefix = prefix;
        // TTL centralizado (convertir ms a segundos)
        this.ttlSeconds = Math.ceil(config.ttl.session / 1000);
        this.initializeRedis();
    }

    /**
     * Inicializa la conexión Redis usando el pool compartido
     */
    private async initializeRedis(): Promise<void> {
        try {
            this.redis = await RedisConnectionPool.getInstance();
            logger.info('RedisSessionStore: Usando pool de conexiones compartido');
        } catch (error) {
            logger.error('RedisSessionStore: Error inicializando Redis', { error });
        }
    }

    /**
     * Asegura que Redis esté disponible
     */
    private async ensureConnection(): Promise<Redis> {
        if (!this.redis || !RedisConnectionPool.isReady()) {
            this.redis = await RedisConnectionPool.getInstance();
        }
        return this.redis;
    }

    private getKey(key: string): string {
        return this.prefix + key;
    }

    async get(key: string): Promise<T | undefined> {
        try {
            const redis = await this.ensureConnection();
            const fullKey = this.getKey(key);
            const data = await redis.get(fullKey);

            if (data) {
                // Sliding window TTL: renovar TTL en cada acceso
                if (this.ttlSeconds > 0) {
                    await redis.expire(fullKey, this.ttlSeconds);
                }
                return JSON.parse(data) as T;
            }
            return undefined;
        } catch (error) {
            logger.error('RedisSessionStore: Error en get()', { key, error });
            return undefined;
        }
    }

    async set(key: string, value: T): Promise<void> {
        try {
            const redis = await this.ensureConnection();
            const data = JSON.stringify(value);

            if (this.ttlSeconds > 0) {
                await redis.setex(this.getKey(key), this.ttlSeconds, data);
            } else {
                await redis.set(this.getKey(key), data);
            }
        } catch (error) {
            logger.error('RedisSessionStore: Error en set()', { key, error });
        }
    }

    async delete(key: string): Promise<void> {
        try {
            const redis = await this.ensureConnection();
            await redis.del(this.getKey(key));
        } catch (error) {
            logger.error('RedisSessionStore: Error en delete()', { key, error });
        }
    }
}
