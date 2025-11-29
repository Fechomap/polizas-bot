// src/utils/FlowStateManager.ts
import Redis from 'ioredis';
import logger from './logger';
import StateKeyManager from './StateKeyManager';
import config from '../config';

// Interfaces para el manejo de estados
interface IStateData {
    [key: string]: any;
    createdAt: Date;
}

interface IActiveFlow {
    numeroPoliza: string;
    contextKey?: string;
    [key: string]: any;
}

interface IStateProvider {
    cleanup(cutoffTime?: number): Promise<number>;
}

const REDIS_PREFIX = 'flow:';

/**
 * Clase para gestionar estados de flujos concurrentes en el bot
 * Usa caché local + Redis para persistencia
 */
class FlowStateManager implements IStateProvider {
    // Caché local para operaciones rápidas
    private flowStates: Map<string, Map<string, IStateData>>;
    private redis: Redis | null = null;
    private isRedisConnected = false;

    constructor() {
        this.flowStates = new Map();
        this.initRedis();
    }

    /**
     * Inicializa conexión a Redis
     */
    private initRedis(): void {
        try {
            const redisUrl = config.redis.url;
            if (!redisUrl && !config.redis.host) {
                logger.warn('FlowStateManager: Redis no configurado, usando solo memoria');
                return;
            }

            const redisOptions = {
                retryStrategy: (times: number) => {
                    if (times > 3) {
                        logger.warn('FlowStateManager: Redis no disponible, usando solo memoria');
                        return null;
                    }
                    return Math.min(times * 100, 2000);
                },
                maxRetriesPerRequest: 3,
                lazyConnect: true
            };

            this.redis = redisUrl
                ? new Redis(redisUrl, redisOptions)
                : new Redis({
                      host: config.redis.host,
                      port: config.redis.port,
                      password: config.redis.password,
                      ...redisOptions
                  });

            this.redis.on('connect', () => {
                this.isRedisConnected = true;
                logger.info('FlowStateManager: Redis conectado');
                this.loadFromRedis();
            });

            this.redis.on('error', err => {
                this.isRedisConnected = false;
                logger.error('FlowStateManager: Error Redis', { error: err.message });
            });

            this.redis.on('close', () => {
                this.isRedisConnected = false;
            });

            // Conectar
            this.redis.connect().catch(() => {
                logger.warn('FlowStateManager: No se pudo conectar a Redis, usando memoria');
            });
        } catch (error) {
            logger.error('FlowStateManager: Error inicializando Redis', { error });
        }
    }

    /**
     * Escanea claves de Redis usando SCAN (no bloqueante)
     * Evita redis.keys() que bloquea el servidor
     */
    private async scanKeys(pattern: string): Promise<string[]> {
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
        } while (cursor !== '0');

        return keys;
    }

    /**
     * Carga estados desde Redis al iniciar
     * OPTIMIZADO: Usa MGET en lugar de múltiples GET (evita N+1)
     */
    private async loadFromRedis(): Promise<void> {
        if (!this.redis || !this.isRedisConnected) return;

        try {
            const keys = await this.scanKeys(`${REDIS_PREFIX}*`);
            if (keys.length === 0) return;

            logger.info(`FlowStateManager: Cargando ${keys.length} estados desde Redis`);

            // OPTIMIZACIÓN: Usar MGET para obtener todos los valores en una sola llamada
            const values = await this.redis.mget(...keys);

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const data = values[i];

                if (data) {
                    try {
                        const parsed = JSON.parse(data);
                        // Extraer contextKey y numeroPoliza del key
                        // formato: flow:{contextKey}:{numeroPoliza}
                        const keyParts = key.replace(REDIS_PREFIX, '').split(':');
                        if (keyParts.length >= 2) {
                            const contextKey = keyParts[0];
                            const numeroPoliza = keyParts.slice(1).join(':');

                            if (!this.flowStates.has(contextKey)) {
                                this.flowStates.set(contextKey, new Map());
                            }

                            // Convertir createdAt string a Date
                            if (parsed.createdAt) {
                                parsed.createdAt = new Date(parsed.createdAt);
                            }

                            this.flowStates.get(contextKey)!.set(numeroPoliza, parsed);
                        }
                    } catch {
                        // Error parseando estado, ignorar
                    }
                }
            }

            logger.info(`FlowStateManager: ${this.flowStates.size} contextos cargados`);
        } catch (error) {
            logger.error('FlowStateManager: Error cargando desde Redis', { error });
        }
    }

    /**
     * Guarda en Redis de forma asíncrona (fire and forget)
     */
    private saveToRedis(contextKey: string, numeroPoliza: string, data: IStateData): void {
        if (!this.redis || !this.isRedisConnected) return;

        const redisKey = `${REDIS_PREFIX}${contextKey}:${numeroPoliza}`;
        const serialized = JSON.stringify(data);

        this.redis.set(redisKey, serialized).catch(err => {
            logger.error('FlowStateManager: Error guardando en Redis', {
                redisKey,
                error: err.message
            });
        });
    }

    /**
     * Elimina de Redis de forma asíncrona
     */
    private deleteFromRedis(contextKey: string, numeroPoliza?: string): void {
        if (!this.redis || !this.isRedisConnected) return;

        if (numeroPoliza) {
            const redisKey = `${REDIS_PREFIX}${contextKey}:${numeroPoliza}`;
            this.redis.del(redisKey).catch(err => {
                logger.error('FlowStateManager: Error eliminando de Redis', {
                    redisKey,
                    error: err.message
                });
            });
        } else {
            // Eliminar todas las keys del contextKey usando SCAN (no bloqueante)
            const pattern = `${REDIS_PREFIX}${contextKey}:*`;
            this.scanKeys(pattern)
                .then(keys => {
                    if (keys.length > 0 && this.redis) {
                        this.redis.del(...keys).catch(err => {
                            logger.error('FlowStateManager: Error eliminando keys de Redis', {
                                pattern,
                                error: err.message
                            });
                        });
                    }
                })
                .catch(err => {
                    logger.error('FlowStateManager: Error escaneando keys en Redis', {
                        pattern,
                        error: err.message
                    });
                });
        }
    }

    private _getContextKey(chatId: string | number, threadId?: string | null): string {
        return StateKeyManager.getContextKey(chatId, threadId);
    }

    /**
     * Guarda información de estado para un flujo específico
     */
    saveState(
        chatId: string | number,
        numeroPoliza: string,
        stateData: Record<string, any>,
        threadId?: string | null
    ): boolean {
        if (!chatId || !numeroPoliza) {
            logger.warn('Intento de guardar estado sin chatId o numeroPoliza válidos');
            return false;
        }

        const contextKey = this._getContextKey(chatId, threadId);

        // Asegurar que exista el map para este contextKey
        if (!this.flowStates.has(contextKey)) {
            this.flowStates.set(contextKey, new Map());
        }

        // Obtener estado existente para hacer merge
        const existingState = this.flowStates.get(contextKey)!.get(numeroPoliza);

        // Hacer merge del estado existente con los nuevos datos
        const newState: IStateData = {
            ...existingState,
            ...stateData,
            createdAt: existingState?.createdAt ?? new Date()
        };

        this.flowStates.get(contextKey)!.set(numeroPoliza, newState);

        // Guardar en Redis de forma asíncrona
        this.saveToRedis(contextKey, numeroPoliza, newState);

        return true;
    }

    /**
     * Recupera datos de estado para un flujo específico
     */
    getState(
        chatId: string | number,
        numeroPoliza: string,
        threadId?: string | null
    ): IStateData | null {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return null;

        return chatStates.get(numeroPoliza) ?? null;
    }

    /**
     * Comprueba si existe un estado para el flujo especificado
     */
    hasState(chatId: string | number, numeroPoliza: string, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        return chatStates ? chatStates.has(numeroPoliza) : false;
    }

    /**
     * Elimina un estado específico
     */
    clearState(chatId: string | number, numeroPoliza: string, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return false;

        const result = chatStates.delete(numeroPoliza);

        // Eliminar de Redis
        this.deleteFromRedis(contextKey, numeroPoliza);

        // Si el mapa está vacío, eliminar la entrada del contextKey también
        if (chatStates.size === 0) {
            this.flowStates.delete(contextKey);
        }

        return result;
    }

    /**
     * Verifica si hay algún estado activo para un chat (sin loguear)
     */
    hasAnyState(chatId: string | number, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        return this.flowStates.has(contextKey);
    }

    /**
     * Limpia todos los estados asociados a un chat
     */
    clearAllStates(chatId: string | number, threadId?: string | null): boolean {
        const contextKey = this._getContextKey(chatId, threadId);
        const result = this.flowStates.delete(contextKey);

        // Eliminar de Redis solo si había algo
        if (result) {
            this.deleteFromRedis(contextKey);
        }

        return result;
    }

    /**
     * Obtiene todos los estados activos para un chat
     */
    getActiveFlows(chatId: string | number, threadId?: string | null): IActiveFlow[] {
        const contextKey = this._getContextKey(chatId, threadId);
        const chatStates = this.flowStates.get(contextKey);
        if (!chatStates) return [];

        return Array.from(chatStates.entries()).map(([numeroPoliza, data]) => ({
            numeroPoliza,
            ...data
        }));
    }

    /**
     * Obtiene todos los estados activos en el sistema
     */
    getAllActiveFlows(): IActiveFlow[] {
        const allFlows: IActiveFlow[] = [];

        this.flowStates.forEach((polizaMap, contextKey) => {
            polizaMap.forEach((data, numeroPoliza) => {
                allFlows.push({
                    contextKey,
                    numeroPoliza,
                    ...data
                });
            });
        });

        return allFlows;
    }

    /**
     * Valida que el acceso a un flujo coincida con el threadId correcto
     */
    validateThreadMatch(
        chatId: string | number,
        numeroPoliza: string,
        threadId?: string | null
    ): boolean {
        const contextKey = this._getContextKey(chatId, threadId);

        if (this.flowStates.has(contextKey) && this.flowStates.get(contextKey)!.has(numeroPoliza)) {
            return true;
        }

        if (!threadId) {
            for (const [otherContextKey, stateMap] of this.flowStates.entries()) {
                if (otherContextKey.startsWith(`${chatId}-`) && stateMap.has(numeroPoliza)) {
                    logger.warn(
                        'Intento de acceso a flujo sin threadId, pero existe en otro hilo',
                        {
                            chatId,
                            numeroPoliza,
                            existingThread: otherContextKey.split('-')[1]
                        }
                    );
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Limpia contextos antiguos basado en un timestamp de corte
     */
    async cleanup(cutoffTime?: number): Promise<number> {
        let removed = 0;
        const now = Date.now();

        if (!cutoffTime) {
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            cutoffTime = now - TWO_HOURS;
        }

        for (const [contextKey, stateMap] of this.flowStates.entries()) {
            for (const [flowId, data] of stateMap.entries()) {
                const lastUpdate = data.createdAt ? data.createdAt.getTime() : 0;
                if (lastUpdate < cutoffTime) {
                    stateMap.delete(flowId);
                    this.deleteFromRedis(contextKey, flowId);
                    removed++;
                }
            }

            if (stateMap.size === 0) {
                this.flowStates.delete(contextKey);
            }
        }

        if (removed > 0) {
            logger.info(`Limpiados ${removed} contextos antiguos de FlowStateManager`);
        }

        return removed;
    }

    /**
     * Obtiene estadísticas del estado actual
     */
    getStats(): {
        totalContexts: number;
        totalFlows: number;
        contextBreakdown: Record<string, number>;
        redisConnected: boolean;
    } {
        const stats = {
            totalContexts: this.flowStates.size,
            totalFlows: 0,
            contextBreakdown: {} as Record<string, number>,
            redisConnected: this.isRedisConnected
        };

        this.flowStates.forEach((stateMap, contextKey) => {
            stats.totalFlows += stateMap.size;
            stats.contextBreakdown[contextKey] = stateMap.size;
        });

        return stats;
    }
}

// Exportar una única instancia (patrón Singleton)
export default new FlowStateManager();
