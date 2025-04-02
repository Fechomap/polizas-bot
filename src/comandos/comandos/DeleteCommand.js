// src/comandos/comandos/DeleteCommand.js
const BaseCommand = require('./BaseCommand');
const logger = require('../../utils/logger');
const config = require('../../config'); // Needed for ADMIN_ID

class DeleteCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
        // Consider making ADMIN_ID configurable or passed via handler if needed elsewhere
        this.ADMIN_ID = 7143094298; // TODO: Move to config or environment variable
    }

    getCommandName() {
        return 'delete';
    }

    getDescription() {
        return 'Marca una o más pólizas como eliminadas (solo admin).';
    }

    register() {
        // No longer registering the /delete command directly.
        // The flow is initiated by the 'accion:delete' button in CommandHandler,
        // which sets the awaitingDeletePolicyNumber state.
        // The admin check should ideally happen within the action handler in CommandHandler.js
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);


        // Note: The actual handling of the text inputs (policy number, delete reason)
        // is done within TextMessageHandler.js by checking the state flags
        // (awaitingDeletePolicyNumber, awaitingDeleteReason) set by this command
        // and calling the handler's helper method (handleDeletePolicyFlow).
    }

    // --- Potentially move handleDeletePolicyFlow here in a future step ---
}

module.exports = DeleteCommand;
