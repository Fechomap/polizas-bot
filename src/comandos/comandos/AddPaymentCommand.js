// src/comandos/comandos/AddPaymentCommand.js
const BaseCommand = require('./BaseCommand');
const logger = require('../../utils/logger');
const { getPolicyByNumber, addPaymentToPolicy } = require('../../controllers/policyController');

class AddPaymentCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'addpayment';
    }

    getDescription() {
        return 'Registra un pago para una póliza existente.';
    }

    register() {
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

module.exports = AddPaymentCommand;
