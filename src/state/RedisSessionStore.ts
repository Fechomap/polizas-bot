// src/state/RedisSessionStore.ts

import Redis from 'ioredis';
import config from '../config';
import logger from '../utils/logger';

/**
 * Adaptador de almacenamiento para sesiones de Telegraf utilizando Redis.
 * Permite que `telegraf/session` persista los datos de sesión en Redis.
 */
export class RedisSessionStore<T> {
    private readonly redis: Redis;
    private readonly prefix: string;

    constructor(prefix = 'telegraf:session:') {
        this.redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            // Opciones adicionales para robustez
            maxRetriesPerRequest: 3,
            connectTimeout: 10000
        });
        this.prefix = prefix;

        this.redis.on('error', err => {
            logger.error('Redis Session Store: Error de conexión', { error: err.message });
        });
    }

    private getKey(key: string): string {
        return this.prefix + key;
    }

    async get(key: string): Promise<T | undefined> {
        try {
            const data = await this.redis.get(this.getKey(key));
            if (data) {
                return JSON.parse(data) as T;
            }
            return undefined;
        } catch (error) {
            logger.error('Redis Session Store: Error en get()', { key, error });
            return undefined;
        }
    }

    async set(key: string, value: T): Promise<void> {
        try {
            const ttl = config.session.ttl > 0 ? Math.ceil(config.session.ttl / 1000) : undefined;
            const data = JSON.stringify(value);

            if (ttl) {
                await this.redis.setex(this.getKey(key), ttl, data);
            } else {
                await this.redis.set(this.getKey(key), data);
            }
        } catch (error) {
            logger.error('Redis Session Store: Error en set()', { key, error });
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.redis.del(this.getKey(key));
        } catch (error) {
            logger.error('Redis Session Store: Error en delete()', { key, error });
        }
    }
}
