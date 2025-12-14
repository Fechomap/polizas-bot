// src/infrastructure/RedisConnectionPool.ts

import Redis, { RedisOptions } from 'ioredis';
import config from '../config';
import logger from '../utils/logger';

/**
 * Pool de conexiones Redis centralizado (Singleton)
 * Evita múltiples conexiones duplicadas en diferentes servicios
 * Proporciona métodos de limpieza para graceful shutdown
 */
class RedisConnectionPool {
    private static instance: Redis | null = null;
    private static connectionPromise: Promise<Redis> | null = null;

    /**
     * Obtiene la instancia única de conexión Redis
     * Si no existe, la crea y conecta
     */
    static async getInstance(): Promise<Redis> {
        // Si ya tenemos instancia conectada, retornarla
        if (this.instance && this.instance.status === 'ready') {
            return this.instance;
        }

        // Si ya hay una conexión en progreso, esperar
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        // Crear nueva conexión
        this.connectionPromise = this.createConnection();
        return this.connectionPromise;
    }

    /**
     * Obtiene la instancia de forma síncrona (puede ser null si no está conectada)
     * Útil para inicialización rápida sin await
     */
    static getInstanceSync(): Redis | null {
        return this.instance;
    }

    /**
     * Crea y configura la conexión Redis
     */
    private static async createConnection(): Promise<Redis> {
        try {
            // Log de URL para debugging (sin password)
            const redisUrl = config.redis.url;
            const redisDb = config.redis.db;
            if (redisUrl) {
                const safeUrl = redisUrl.replace(/:([^@]+)@/, ':***@');
                logger.info(`RedisPool: Conectando a ${safeUrl} (DB: ${redisDb})`);
            } else {
                logger.info(
                    `RedisPool: Conectando a ${config.redis.host}:${config.redis.port} (DB: ${redisDb})`
                );
            }

            const redisOptions: RedisOptions = {
                db: redisDb, // DB como opción separada (igual que factura-bot)
                retryStrategy: (times: number) => {
                    if (times > 5) {
                        logger.error('RedisPool: Máximo de reintentos alcanzado');
                        return null; // Dejar de reintentar
                    }
                    const delay = Math.min(times * 100, 3000);
                    logger.warn(`RedisPool: Reintentando conexión (intento ${times})...`);
                    return delay;
                },
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                enableReadyCheck: true,
                connectTimeout: 10000,
                // Configuración de pool
                family: 4, // IPv4
                keepAlive: 10000
            };

            this.instance = config.redis.url
                ? new Redis(config.redis.url, redisOptions)
                : new Redis({
                      host: config.redis.host,
                      port: config.redis.port,
                      password: config.redis.password,
                      ...redisOptions
                  });

            // Usar .once() para eventos de lifecycle (evita memory leaks)
            this.instance.once('connect', () => {
                logger.info('✅ RedisPool: Conectado exitosamente');
            });

            this.instance.once('ready', () => {
                logger.info('✅ RedisPool: Listo para recibir comandos');
            });

            // .on() solo para errores continuos (necesario para manejo)
            this.instance.on('error', (err: Error) => {
                logger.error('RedisPool: Error de conexión', { error: err.message });
            });

            this.instance.once('close', () => {
                logger.info('RedisPool: Conexión cerrada');
            });

            // Conectar
            await this.instance.connect();

            return this.instance;
        } catch (error) {
            this.connectionPromise = null;
            logger.error('RedisPool: Error creando conexión', { error });
            throw error;
        }
    }

    /**
     * Verifica si la conexión está lista
     */
    static isReady(): boolean {
        return this.instance?.status === 'ready';
    }

    /**
     * Desconecta el pool de Redis
     * Debe llamarse en el shutdown handler
     */
    static async disconnect(): Promise<void> {
        if (this.instance) {
            try {
                // Remover todos los listeners para evitar memory leaks
                this.instance.removeAllListeners();
                await this.instance.quit();
                this.instance = null;
                this.connectionPromise = null;
                logger.info('✅ RedisPool: Desconectado correctamente');
            } catch (error) {
                logger.error('RedisPool: Error al desconectar', { error });
                // Forzar cierre si quit falla
                if (this.instance) {
                    this.instance.disconnect();
                    this.instance = null;
                }
            }
        }
    }

    /**
     * Obtiene estadísticas de la conexión
     */
    static getStats(): {
        status: string;
        isReady: boolean;
        serverInfo: string | null;
    } {
        return {
            status: this.instance?.status ?? 'disconnected',
            isReady: this.isReady(),
            serverInfo: this.instance ? `${config.redis.host}:${config.redis.port}` : null
        };
    }
}

export default RedisConnectionPool;
