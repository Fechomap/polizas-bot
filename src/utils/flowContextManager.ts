// src/utils/flowContextManager.ts
import logger from './logger';

interface IFlowContext {
    flowId: string;
    state: string;
    numeroPoliza: string | null;
    data: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

interface IFlowContextWithId extends IFlowContext {
    flowId: string;
}

/**
 * Gestor de contextos de flujo de alertas
 * Permite manejar múltiples flujos independientes para un mismo usuario
 */
class FlowContextManager {
    private contexts: Map<string | number, Map<string, IFlowContext>>;
    private counters: Map<string | number, number>;

    constructor() {
        // Map principal: chatId => Map<flowId, contextData>
        this.contexts = new Map();
        // Contador para generar IDs únicos por chatId
        this.counters = new Map();
        logger.info('FlowContextManager inicializado');
    }

    /**
     * Crea un nuevo contexto de flujo para un chat
     * @param {number|string} chatId - ID del chat
     * @param {string} initialState - Estado inicial ('awaitingPhone', 'awaitingOrigenDestino', etc.)
     * @param {string} numeroPoliza - Número de póliza asociada (opcional)
     * @returns {string} ID único del flujo creado
     */
    createContext(
        chatId: string | number,
        initialState: string,
        numeroPoliza: string | null = null
    ): string {
        // Inicializar contador si no existe
        if (!this.counters.has(chatId)) {
            this.counters.set(chatId, 1);
        }

        // Generar ID único para este flujo
        const flowId = `flow_${this.counters.get(chatId)}`;
        this.counters.set(chatId, this.counters.get(chatId)! + 1);

        // Inicializar Map para este chatId si no existe
        if (!this.contexts.has(chatId)) {
            this.contexts.set(chatId, new Map());
        }

        // Crear contexto con timestamp para poder limpiar antiguos
        const context: IFlowContext = {
            flowId,
            state: initialState,
            numeroPoliza,
            data: {},
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Guardar contexto
        this.contexts.get(chatId)!.set(flowId, context);

        logger.info(
            `Nuevo contexto creado: ${flowId} para chat ${chatId} - estado: ${initialState}`,
            {
                chatId,
                flowId,
                numeroPoliza
            }
        );

        return flowId;
    }

    /**
     * Actualiza el estado de un contexto
     * @param {number|string} chatId - ID del chat
     * @param {string} flowId - ID del flujo
     * @param {string} newState - Nuevo estado
     * @param {Object} data - Datos adicionales a guardar
     * @returns {boolean} True si se actualizó correctamente
     */
    updateState(
        chatId: string | number,
        flowId: string,
        newState: string,
        data: Record<string, any> = {}
    ): boolean {
        if (!this.contexts.has(chatId) || !this.contexts.get(chatId)!.has(flowId)) {
            logger.warn(`Intento de actualizar contexto inexistente: ${flowId} chat ${chatId}`);
            return false;
        }

        const context = this.contexts.get(chatId)!.get(flowId)!;
        context.state = newState;
        context.data = { ...context.data, ...data };
        context.updatedAt = new Date();

        logger.info(
            `Contexto actualizado: ${flowId} para chat ${chatId} - nuevo estado: ${newState}`,
            {
                chatId,
                flowId,
                numeroPoliza: context.numeroPoliza
            }
        );

        return true;
    }

    /**
     * Obtiene el contexto activo para un chat y estado específico
     * @param {number|string} chatId - ID del chat
     * @param {string} state - Estado a buscar
     * @returns {Object|null} Contexto encontrado o null
     */
    getContextByState(chatId: string | number, state: string): IFlowContextWithId | null {
        if (!this.contexts.has(chatId)) return null;

        // Buscar contextos que coincidan con el estado
        for (const [flowId, context] of this.contexts.get(chatId)!.entries()) {
            if (context.state === state) {
                return { ...context, flowId };
            }
        }

        return null;
    }

    /**
     * Obtiene un contexto específico por su ID
     * @param {number|string} chatId - ID del chat
     * @param {string} flowId - ID del flujo
     * @returns {Object|null} Contexto o null si no existe
     */
    getContext(chatId: string | number, flowId: string): IFlowContextWithId | null {
        if (!this.contexts.has(chatId) || !this.contexts.get(chatId)!.has(flowId)) {
            return null;
        }

        return { ...this.contexts.get(chatId)!.get(flowId)!, flowId };
    }

    /**
     * Obtiene todos los contextos activos para un chat
     * @param {number|string} chatId - ID del chat
     * @returns {Array} Lista de contextos
     */
    getAllContexts(chatId: string | number): IFlowContextWithId[] {
        if (!this.contexts.has(chatId)) return [];

        return Array.from(this.contexts.get(chatId)!.entries()).map(([flowId, context]) => ({
            ...context,
            flowId
        }));
    }

    /**
     * Elimina un contexto específico
     * @param {number|string} chatId - ID del chat
     * @param {string} flowId - ID del flujo a eliminar
     * @returns {boolean} True si se eliminó correctamente
     */
    removeContext(chatId: string | number, flowId: string): boolean {
        if (!this.contexts.has(chatId) || !this.contexts.get(chatId)!.has(flowId)) {
            return false;
        }

        const result = this.contexts.get(chatId)!.delete(flowId);

        // Si no quedan contextos para este chat, limpiar el mapa
        if (this.contexts.get(chatId)!.size === 0) {
            this.contexts.delete(chatId);
        }

        logger.info(`Contexto eliminado: ${flowId} para chat ${chatId}`, { chatId, flowId });
        return result;
    }

    /**
     * Limpia todos los contextos de un chat
     * @param {number|string} chatId - ID del chat
     * @returns {boolean} True si se limpió correctamente
     */
    clearAllContexts(chatId: string | number): boolean {
        if (!this.contexts.has(chatId)) return false;

        this.contexts.delete(chatId);
        logger.info(`Todos los contextos eliminados para chat ${chatId}`, { chatId });
        return true;
    }

    /**
     * Limpia contextos antiguos (más de 2 horas)
     * @returns {number} Número de contextos eliminados
     */
    cleanupOldContexts(): number {
        let removed = 0;
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const now = new Date();

        for (const [chatId, contextMap] of this.contexts.entries()) {
            for (const [flowId, context] of contextMap.entries()) {
                if (now.getTime() - context.updatedAt.getTime() > TWO_HOURS) {
                    contextMap.delete(flowId);
                    removed++;
                }
            }

            if (contextMap.size === 0) {
                this.contexts.delete(chatId);
            }
        }

        if (removed > 0) {
            logger.info(`Limpiados ${removed} contextos antiguos`);
        }

        return removed;
    }
}

// Exportar como singleton
export default new FlowContextManager();
