// src/state/RedisStateManager.ts

import Redis from 'ioredis';
import { IStateManager } from './IStateManager';
import config from '../config';
import logger from '../utils/logger';

/**
 * Implementación de IStateManager utilizando Redis.
 * Proporciona una gestión de estado persistente y compartida entre múltiples instancias.
 */
export class RedisStateManager implements IStateManager {
    private redis: Redis;

    constructor() {
        this.redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            retryStrategy: times => {
                const delay = Math.min(times * 50, 2000); // Reintentos cada 50ms, max 2s
                logger.warn(`Redis: Reintentando conectar (intento ${times})...`);
                return delay;
            },
            maxRetriesPerRequest: 3 // Evitar bucles infinitos en una sola petición
        });

        this.redis.on('error', err => {
            logger.error('Redis: Error de conexión', { error: err.message });
        });

        this.redis.on('connect', () => {
            logger.info('Redis: Conectado exitosamente.');
        });
    }

    async setState(key: string, value: any, ttl?: number): Promise<void> {
        const stringValue = JSON.stringify(value);
        if (ttl) {
            await this.redis.setex(key, ttl, stringValue);
        } else {
            await this.redis.set(key, stringValue);
        }
    }

    async getState<T>(key: string): Promise<T | null> {
        const data = await this.redis.get(key);
        return data ? (JSON.parse(data) as T) : null;
    }

    async deleteState(key: string): Promise<void> {
        await this.redis.del(key);
    }

    async hasState(key: string): Promise<boolean> {
        const result = await this.redis.exists(key);
        return result === 1;
    }

    async disconnect(): Promise<void> {
        await this.redis.quit();
        logger.info('Redis: Desconectado exitosamente.');
    }
}
