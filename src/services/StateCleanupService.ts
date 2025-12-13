// src/services/StateCleanupService.ts
/**
 * Servicio CENTRALIZADO para limpiar TODOS los estados de flujos
 * Responsabilidad única: limpieza de estados
 *
 * IMPORTANTE: Este servicio limpia TODOS los estados cuando se presiona:
 * - Botón "MENÚ PRINCIPAL"
 * - Comando /start
 *
 * Cada nuevo flujo que use estados debe registrarse aquí.
 *
 * OPTIMIZACIÓN: Solo loguea cuando realmente limpia algo
 */

import StateKeyManager from '../utils/StateKeyManager';
import { getUnifiedStateManagerSync } from '../state/UnifiedStateManager';
import logger from '../utils/logger';

// Importar TODOS los mapas de estado de flujos
import { vehiculosEnProceso } from '../comandos/comandos/VehicleRegistrationHandler';
import { asignacionesEnProceso } from '../comandos/comandos/PolicyAssignmentHandler';
import { registros as registrosVision } from '../comandos/comandos/VehicleVisionHandler';

// Cachear AdminStateManager al inicio (evita require() dinámico costoso)
let AdminStateManager: any = null;
try {
    AdminStateManager = require('../admin/utils/adminStates').default;
} catch {
    // Módulo admin no disponible
}

interface IHandler {
    clearChatState?: (chatId: number, threadId: number | string | null) => void;
    [key: string]: any;
}

export class StateCleanupService {
    /**
     * Limpia TODOS los estados para un usuario/chat
     * Este método se llama cuando:
     * - Usuario presiona "MENÚ PRINCIPAL"
     * - Usuario envía /start
     */
    limpiarTodosLosEstados(
        chatId: number,
        threadId: number | string | null,
        userId: number | undefined,
        handler?: IHandler
    ): void {
        // Ejecutar todas las limpiezas (cada una tiene early return si no hay nada)
        this.limpiarEstadosAdmin(userId, chatId);
        this.limpiarEstadoVehiculosEnProceso(userId, chatId, threadId);
        this.limpiarEstadoAsignaciones(userId, chatId, threadId);
        this.limpiarEstadoVision(userId, chatId, threadId);
        this.limpiarEstadosOcuparPoliza(chatId, threadId);

        // Limpiar estados del handler (comandos en espera)
        handler?.clearChatState?.(chatId, threadId);
    }

    /**
     * Limpia estados del módulo admin
     */
    private limpiarEstadosAdmin(userId: number | undefined, chatId: number): void {
        if (!AdminStateManager || !userId) return;
        AdminStateManager.clearAdminState(userId, chatId);
    }

    /**
     * Limpia estado de registro de vehículos (VehicleRegistrationHandler)
     */
    private limpiarEstadoVehiculosEnProceso(
        userId: number | undefined,
        chatId: number,
        threadId: number | string | null
    ): void {
        if (!userId) return;

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        if (!vehiculosEnProceso.has(stateKey)) return;

        vehiculosEnProceso.delete(stateKey);
        logger.info('[StateCleanup] Registro vehículo limpiado', { stateKey });
    }

    /**
     * Limpia estado de asignación de pólizas (PolicyAssignmentHandler)
     */
    private limpiarEstadoAsignaciones(
        userId: number | undefined,
        chatId: number,
        threadId: number | string | null
    ): void {
        if (!userId) return;

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        if (!asignacionesEnProceso.has(stateKey)) return;

        asignacionesEnProceso.delete(stateKey);
        logger.info('[StateCleanup] Asignación póliza limpiada', { stateKey });
    }

    /**
     * Limpia estado de Vision IA (VehicleVisionHandler)
     */
    private limpiarEstadoVision(
        userId: number | undefined,
        chatId: number,
        threadId: number | string | null
    ): void {
        if (!userId) return;

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        if (!registrosVision.has(stateKey)) return;

        registrosVision.delete(stateKey);
        logger.info('[StateCleanup] Vision IA limpiado', { stateKey });
    }

    /**
     * Limpia estados del flujo Ocupar Póliza (UnifiedStateManager)
     */
    private limpiarEstadosOcuparPoliza(chatId: number, threadId: number | string | null): void {
        const threadIdNum = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
        const contextKey = StateKeyManager.getContextKey(chatId, threadId);

        // UnifiedStateManager.clearAllStates es no-op si no hay estados
        const stateManager = getUnifiedStateManagerSync();
        if (!stateManager) return;
        stateManager.clearAllStates(chatId, threadIdNum).then(clearedCount => {
            if (clearedCount > 0) {
                logger.info('[StateCleanup] Flujo Ocupar Póliza limpiado', {
                    contextKey,
                    clearedCount
                });
            }
        });
    }
}

// Singleton
let instance: StateCleanupService | null = null;

export function getStateCleanupService(): StateCleanupService {
    instance ??= new StateCleanupService();
    return instance;
}

export default StateCleanupService;
