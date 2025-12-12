// src/state/RedisStateManager.ts

import Redis from 'ioredis';
import { IStateManager } from './IStateManager';
import RedisConnectionPool from '../infrastructure/RedisConnectionPool';
import logger from '../utils/logger';

/**
 * Implementación de IStateManager utilizando Redis.
 * Usa el pool de conexiones centralizado para evitar múltiples conexiones.
 */
export class RedisStateManager implements IStateManager {
    private redis: Redis | null = null;
    private isInitialized = false;

    constructor() {
        this.initializeRedis();
    }

    /**
     * Inicializa la conexión Redis usando el pool compartido
     */
    private async initializeRedis(): Promise<void> {
        try {
            this.redis = await RedisConnectionPool.getInstance();
            this.isInitialized = true;
            logger.info('RedisStateManager: Usando pool de conexiones compartido');
        } catch (error) {
            logger.error('RedisStateManager: Error inicializando Redis', { error });
        }
    }

    /**
     * Asegura que Redis esté inicializado antes de operaciones
     */
    private async ensureConnection(): Promise<Redis> {
        if (!this.redis || !RedisConnectionPool.isReady()) {
            this.redis = await RedisConnectionPool.getInstance();
        }
        return this.redis;
    }

    async setState(key: string, value: any, ttl?: number): Promise<void> {
        const redis = await this.ensureConnection();
        const stringValue = JSON.stringify(value);
        if (ttl) {
            await redis.setex(key, ttl, stringValue);
        } else {
            await redis.set(key, stringValue);
        }
    }

    async getState<T>(key: string): Promise<T | null> {
        const redis = await this.ensureConnection();
        const data = await redis.get(key);
        return data ? (JSON.parse(data) as T) : null;
    }

    async deleteState(key: string): Promise<void> {
        const redis = await this.ensureConnection();
        await redis.del(key);
    }

    async hasState(key: string): Promise<boolean> {
        const redis = await this.ensureConnection();
        const result = await redis.exists(key);
        return result === 1;
    }

    /**
     * Desconecta (no hace nada porque usa pool compartido)
     * La desconexión real se hace desde el shutdown handler
     */
    async disconnect(): Promise<void> {
        // No desconectar aquí - el pool se desconecta globalmente
        logger.info('RedisStateManager: disconnect() llamado (pool manejado globalmente)');
    }
}
