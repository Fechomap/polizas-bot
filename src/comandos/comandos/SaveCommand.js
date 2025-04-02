// src/comandos/comandos/SaveCommand.js
const BaseCommand = require('./BaseCommand');
const logger = require('../../utils/logger');

class SaveCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'save';
    }

    getDescription() {
        return 'Inicia el proceso para guardar una nueva póliza.';
    }

    register() {
        // No longer registering the /save command directly.
        // The flow is initiated by the 'accion:registrar' button in CommandHandler,
        // which sets the awaitingSaveData state.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);

        // Note: The actual handling of the text input (policy data)
        // is done within TextMessageHandler.js by checking the state flag
        // (awaitingSaveData) and calling the handler's helper method (handleSaveData).
    }

    // --- Potentially move handleSaveData here in a future step ---
}

module.exports = SaveCommand;
