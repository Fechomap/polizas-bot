// src/comandos/comandos/GetCommand.ts
// NOTA: Este comando fue refactorizado. El flujo de consulta de pólizas ahora
// se maneja directamente en commandHandler.ts con el nuevo flujo unificado
// (accion:polizas -> awaitingPolicySearch -> handlePolicySearch -> showPolicyInfo).
// Este archivo se mantiene por compatibilidad.

import BaseCommand from './BaseCommand';
import type { IBaseHandler } from './BaseCommand';

/**
 * Comando para consultar pólizas existentes
 * DEPRECADO: El flujo ahora se maneja en commandHandler.ts
 */
class GetCommand extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'get';
    }

    getDescription(): string {
        return 'Consultar una póliza existente (migrado a commandHandler)';
    }

    register(): void {
        this.logInfo('GetCommand: registro vacío, flujo migrado a commandHandler');
    }
}

export default GetCommand;
