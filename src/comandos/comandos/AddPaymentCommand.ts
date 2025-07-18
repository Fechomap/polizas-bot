// src/comandos/comandos/AddPaymentCommand.ts
import BaseCommand from './BaseCommand';
import { getPolicyByNumber, addPaymentToPolicy } from '../../controllers/policyController';
import type { IBaseHandler } from './BaseCommand';

/**
 * Comando para registrar pagos en pólizas existentes
 */
class AddPaymentCommand extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'addpayment';
    }

    getDescription(): string {
        return 'Registra un pago para una póliza existente.';
    }

    register(): void {
        // No longer registering the /addpayment command directly.
        // The flow is initiated by the 'accion:addpayment' button in CommandHandler,
        // which sets the awaitingPaymentPolicyNumber state.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);

        // Note: The actual handling of the text inputs (policy number, payment data)
        // is done within TextMessageHandler.js by checking the state flags
        // (awaitingPaymentPolicyNumber, awaitingPaymentData) set by this command
        // and calling the handler's helper methods (handleAddPaymentPolicyNumber, handlePaymentData).
        // For a full refactor, these helper methods could also be moved into this class
        // and called directly from TextMessageHandler, but for now, we keep them in CommandHandler.
    }

    // --- Potentially move helper methods here in a future step ---
    // async handleAddPaymentPolicyNumber(ctx, messageText) { ... }
    // async handlePaymentData(ctx, messageText) { ... }
}

export default AddPaymentCommand;
