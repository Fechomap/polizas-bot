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
        // Register the main /delete command
        this.handler.bot.command(this.getCommandName(), async (ctx) => {
            try {
                // Admin check
                if (ctx.from.id !== this.ADMIN_ID) {
                    return await ctx.reply('❌ No tienes permiso para marcar pólizas como eliminadas.');
                }

                const chatId = ctx.chat.id;
                // Set state to wait for policy number(s)
                this.handler.awaitingDeletePolicyNumber.set(chatId, true);
                await ctx.reply(
                    '📝 Por favor, ingresa el número o números de póliza a marcar como ELIMINADAS (separados por espacio, coma o salto de línea).\n' +
                    'Estas pólizas serán excluidas de consultas y reportes, pero se conservarán en la base de datos.'
                );
            } catch (error) {
                this.logError('Error al iniciar comando delete:', error);
                await this.replyError(ctx, 'Error al iniciar el proceso de eliminación.');
            }
        });

        // Note: The actual handling of the text inputs (policy number, delete reason)
        // is done within TextMessageHandler.js by checking the state flags
        // (awaitingDeletePolicyNumber, awaitingDeleteReason) set by this command
        // and calling the handler's helper method (handleDeletePolicyFlow).
    }

    // --- Potentially move handleDeletePolicyFlow here in a future step ---
}

module.exports = DeleteCommand;
