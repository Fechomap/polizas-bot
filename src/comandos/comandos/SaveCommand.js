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
        // Register the main /save command
        this.handler.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                this.logInfo('=== Iniciando comando SAVE ===', { chatId });

                // Set state to wait for policy data
                this.handler.awaitingSaveData.set(chatId, true);

                await ctx.reply(
                    'Ingresa los datos de la póliza siguiendo este formato (cada campo en una línea):\n\n' +
                    '1) Titular\n' +
                    '2) Correo Electrónico\n' +
                    '3) Contraseña\n' +
                    '4) Calle\n' +
                    '5) Colonia\n' +
                    '6) Municipio\n' +
                    '7) Estado\n' +
                    '8) CP\n' +
                    '9) RFC\n' +
                    '10) Marca\n' +
                    '11) Submarca\n' +
                    '12) Año\n' +
                    '13) Color\n' +
                    '14) Serie\n' +
                    '15) Placas\n' +
                    '16) Agente Cotizador\n' +
                    '17) Aseguradora\n' +
                    '18) # de Póliza\n' +
                    '19) Fecha de Emisión (DD/MM/YY o DD/MM/YYYY)'
                );
            } catch (error) {
                this.logError('Error al iniciar save:', error);
                await this.replyError(ctx, 'Error al iniciar el proceso.');
            }
        });

        // Note: The actual handling of the text input (policy data)
        // is done within TextMessageHandler.js by checking the state flag
        // (awaitingSaveData) and calling the handler's helper method (handleSaveData).
    }

    // --- Potentially move handleSaveData here in a future step ---
}

module.exports = SaveCommand;
