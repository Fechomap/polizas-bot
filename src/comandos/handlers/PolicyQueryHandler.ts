// src/comandos/handlers/PolicyQueryHandler.ts
// NOTA: Este handler fue refactorizado. El flujo de consulta de pólizas ahora
// se maneja directamente en commandHandler.ts con el nuevo flujo unificado
// (accion:polizas -> awaitingPolicySearch -> handlePolicySearch -> showPolicyInfo).
// Este archivo se mantiene por compatibilidad con la estructura de handlers.

import BaseCommand from '../comandos/BaseCommand';
import type { IBaseHandler } from '../comandos/BaseCommand';

class PolicyQueryHandler extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    public register(): void {
        // El flujo de consulta ahora se maneja en commandHandler.ts
        // con accion:polizas -> awaitingPolicySearch -> showPolicyInfo
        this.logInfo('PolicyQueryHandler: registro vacío, flujo migrado a commandHandler');
    }

    getCommandName(): string {
        return 'policy-query';
    }

    getDescription(): string {
        return 'Maneja las consultas de pólizas (migrado a commandHandler).';
    }
}

export default PolicyQueryHandler;
