// src/comandos/comandos/AddServiceCommand.js
const BaseCommand = require('./BaseCommand');
const logger = require('../../utils/logger');
const { getPolicyByNumber, addServiceToPolicy } = require('../../controllers/policyController');

class AddServiceCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'addservice';
    }

    getDescription() {
        return 'Registra un servicio utilizado para una póliza existente.';
    }

    register() {
        // No longer registering the /addservice command directly.
        // The flow is initiated by the 'accion:addservice' button in CommandHandler,
        // which sets the awaitingServicePolicyNumber state.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);


        // Note: The actual handling of the text inputs (policy number, service data)
        // is done within TextMessageHandler.js by checking the state flags
        // (awaitingServicePolicyNumber, awaitingServiceData) set by this command
        // and calling the handler's helper methods (handleAddServicePolicyNumber, handleServiceData).
        // For a full refactor, these helper methods could also be moved into this class.
    }

    // --- Potentially move helper methods here in a future step ---
    // async handleAddServicePolicyNumber(ctx, messageText) { ... }
    // async handleServiceData(ctx, messageText) { ... }
}

module.exports = AddServiceCommand;
