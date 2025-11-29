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
 */

import StateKeyManager from '../utils/StateKeyManager';
import flowStateManager from '../utils/FlowStateManager';
import logger from '../utils/logger';

// Importar TODOS los mapas de estado de flujos
import { vehiculosEnProceso } from '../comandos/comandos/VehicleRegistrationHandler';
import { asignacionesEnProceso } from '../comandos/comandos/PolicyAssignmentHandler';
import { registros as registrosVision } from '../comandos/comandos/VehicleVisionHandler';

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
        logger.info('[StateCleanup] === INICIANDO LIMPIEZA TOTAL DE ESTADOS ===', {
            chatId,
            threadId,
            userId
        });

        // 1. Limpiar estados admin
        this.limpiarEstadosAdmin(userId, chatId);

        // 2. Limpiar estados de Base de Autos (registro manual)
        this.limpiarEstadoVehiculosEnProceso(userId, chatId, threadId);

        // 3. Limpiar estados de asignación de póliza
        this.limpiarEstadoAsignaciones(userId, chatId, threadId);

        // 4. Limpiar estados de Vision IA
        this.limpiarEstadoVision(userId, chatId, threadId);

        // 5. Limpiar estados de flujo Ocupar Póliza
        this.limpiarEstadosOcuparPoliza(chatId, threadId);

        // 6. Limpiar estados del handler (comandos en espera)
        if (handler?.clearChatState) {
            handler.clearChatState(chatId, threadId);
            logger.info('[StateCleanup] Estados del handler limpiados', { chatId, threadId });
        }

        logger.info('[StateCleanup] === LIMPIEZA TOTAL COMPLETADA ===');
    }

    /**
     * Limpia estados del módulo admin
     */
    private limpiarEstadosAdmin(userId: number | undefined, chatId: number): void {
        try {
            const AdminStateManager = require('../admin/utils/adminStates').default;
            AdminStateManager.clearAdminState(userId, chatId);
            logger.info('[StateCleanup] Estados admin limpiados');
        } catch {
            // Módulo admin no disponible
        }
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

        if (vehiculosEnProceso.has(stateKey)) {
            vehiculosEnProceso.delete(stateKey);
            logger.info('[StateCleanup] Estado de registro de vehículo limpiado', { stateKey });
        }
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

        if (asignacionesEnProceso.has(stateKey)) {
            asignacionesEnProceso.delete(stateKey);
            logger.info('[StateCleanup] Estado de asignación de póliza limpiado', { stateKey });
        }
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

        if (registrosVision.has(stateKey)) {
            registrosVision.delete(stateKey);
            logger.info('[StateCleanup] Estado de Vision IA limpiado', { stateKey });
        }
    }

    /**
     * Limpia estados del flujo Ocupar Póliza (FlowStateManager)
     */
    private limpiarEstadosOcuparPoliza(chatId: number, threadId: number | string | null): void {
        const threadIdStr = threadId ? String(threadId) : null;
        flowStateManager.clearAllStates(chatId, threadIdStr);
        logger.info('[StateCleanup] Estados de flujo Ocupar Póliza limpiados', {
            chatId,
            threadId: threadIdStr ?? 'ninguno'
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
