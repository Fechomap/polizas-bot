import logger from '../../utils/logger';
import config from '../../config';

interface IAdminState {
    operation: string;
    data: Record<string, any>;
    createdAt: number;
    lastActivity: number;
    history: Array<{
        timestamp: number;
        previousData: Record<string, any>;
    }>;
}

interface IAdminStats {
    activeStates: number;
    operations: Record<string, number>;
}

class AdminStateManager {
    private adminStates: Map<string, IAdminState>;
    private timeouts: Map<string, NodeJS.Timeout>;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.adminStates = new Map();
        this.timeouts = new Map();
    }

    /**
     * Obtiene el TTL de admin desde config centralizado (usa session TTL principal)
     */
    private getAdminTimeout(): number {
        return config.ttl.session;
    }

    /**
     * Inicia la limpieza periódica (debe llamarse explícitamente)
     */
    start(): void {
        if (this.cleanupInterval) {
            return; // Ya está corriendo
        }

        this.cleanupInterval = setInterval(() => {
            this.cleanupOldAdminStates();
        }, 60 * 1000); // Cada minuto (frecuencia de cleanup, no TTL)

        // Permitir que el proceso termine aunque el interval esté activo
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }

        logger.info('AdminStateManager: Limpieza periódica iniciada');
    }

    /**
     * Detiene la limpieza periódica (llamar en shutdown)
     */
    stop(): void {
        // Limpiar interval de cleanup
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Limpiar todos los timeouts individuales
        for (const [key, timeout] of this.timeouts.entries()) {
            clearTimeout(timeout);
            this.timeouts.delete(key);
        }

        // Limpiar estados
        this.adminStates.clear();

        logger.info('AdminStateManager: Detenido y limpiado');
    }

    /**
     * Crea una clave de estado basada en userId y chatId
     */
    createStateKey(userId: number, chatId: number): string {
        return `${userId}:${chatId}`;
    }

    /**
     * Crea un estado administrativo con timeout especial
     */
    createAdminState(
        userId: number,
        chatId: number,
        operation: string,
        data: Record<string, any> = {}
    ): IAdminState {
        const stateKey = this.createStateKey(userId, chatId);

        const adminState: IAdminState = {
            operation,
            data,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            history: []
        };

        this.adminStates.set(stateKey, adminState);

        // Configurar timeout
        this.setAdminTimeout(stateKey);

        logger.info(`Estado admin creado: ${operation} para usuario ${userId}`);

        return adminState;
    }

    /**
     * Obtiene el estado administrativo actual
     */
    getAdminState(userId: number, chatId: number): IAdminState | undefined {
        const stateKey = this.createStateKey(userId, chatId);
        const state = this.adminStates.get(stateKey);

        if (state) {
            // Actualizar última actividad
            state.lastActivity = Date.now();
            this.setAdminTimeout(stateKey); // Resetear timeout
        }

        return state;
    }

    /**
     * Actualiza el estado administrativo
     */
    updateAdminState(
        userId: number,
        chatId: number,
        updates: Record<string, any>
    ): IAdminState | null {
        const state = this.getAdminState(userId, chatId);

        if (!state) {
            logger.warn(`Intento de actualizar estado admin inexistente para usuario ${userId}`);
            return null;
        }

        // Guardar estado anterior en historial
        state.history.push({
            timestamp: Date.now(),
            previousData: { ...state.data }
        });

        // Actualizar datos
        Object.assign(state.data, updates);
        state.lastActivity = Date.now();

        return state;
    }

    /**
     * Limpia el estado administrativo
     */
    clearAdminState(userId: number, chatId: number): void {
        const stateKey = this.createStateKey(userId, chatId);
        const state = this.adminStates.get(stateKey);

        if (state) {
            logger.info(`Estado admin limpiado: ${state.operation} para usuario ${userId}`);
            this.adminStates.delete(stateKey);
        }

        // Limpiar timeout si existe
        if (this.timeouts.has(stateKey)) {
            clearTimeout(this.timeouts.get(stateKey));
            this.timeouts.delete(stateKey);
        }
    }

    /**
     * Configura timeout para estado admin
     */
    private setAdminTimeout(stateKey: string): void {
        // Limpiar timeout existente si hay uno
        if (this.timeouts.has(stateKey)) {
            clearTimeout(this.timeouts.get(stateKey));
        }

        const timeout = setTimeout(() => {
            const state = this.adminStates.get(stateKey);
            if (state) {
                logger.warn(`Timeout de estado admin: ${state.operation}`);
                this.adminStates.delete(stateKey);
            }
            this.timeouts.delete(stateKey);
        }, this.getAdminTimeout());

        this.timeouts.set(stateKey, timeout);
    }

    /**
     * Obtiene estadísticas de estados admin activos
     */
    getAdminStats(): IAdminStats {
        const stats: IAdminStats = {
            activeStates: this.adminStates.size,
            operations: {}
        };

        for (const [, state] of this.adminStates) {
            const op = state.operation;
            stats.operations[op] = (stats.operations[op] ?? 0) + 1;
        }

        return stats;
    }

    /**
     * Limpia estados admin antiguos
     */
    cleanupOldAdminStates(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, state] of this.adminStates) {
            if (now - state.lastActivity > this.getAdminTimeout()) {
                this.adminStates.delete(key);
                // Limpiar timeout asociado
                if (this.timeouts.has(key)) {
                    clearTimeout(this.timeouts.get(key));
                    this.timeouts.delete(key);
                }
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info(`Limpiados ${cleaned} estados admin antiguos`);
        }

        return cleaned;
    }
}

// Singleton
const adminStateManager = new AdminStateManager();

// Iniciar limpieza periódica automáticamente
adminStateManager.start();

export default adminStateManager;
