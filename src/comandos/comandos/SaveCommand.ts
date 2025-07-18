// src/comandos/comandos/SaveCommand.ts
import BaseCommand from './BaseCommand';
import type { IBaseHandler } from './BaseCommand';

/**
 * Comando para iniciar el proceso de guardado de nuevas pólizas
 */
class SaveCommand extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'save';
    }

    getDescription(): string {
        return 'Inicia el proceso para guardar una nueva póliza.';
    }

    register(): void {
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

export default SaveCommand;
