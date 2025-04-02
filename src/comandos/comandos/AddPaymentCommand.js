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
        // Register the main /addpayment command
        this.handler.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                // Set state to wait for policy number
                this.handler.awaitingPaymentPolicyNumber.set(chatId, true);
                await ctx.reply('💰 Por favor, ingresa el número de póliza para registrar un pago.');
            } catch (error) {
                this.logError('Error al iniciar comando addpayment:', error);
                await this.replyError(ctx, 'Error al iniciar el registro de pago.');
            }
        });

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
