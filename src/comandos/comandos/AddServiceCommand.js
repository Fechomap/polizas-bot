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
        // Register the main /addservice command
        this.handler.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                // Set state to wait for policy number
                this.handler.awaitingServicePolicyNumber.set(chatId, true);
                await ctx.reply('🚗 Por favor, ingresa el número de póliza para registrar un servicio.');
            } catch (error) {
                this.logError('Error al iniciar comando addservice:', error);
                await this.replyError(ctx, 'Error al iniciar el registro de servicio.');
            }
        });

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
