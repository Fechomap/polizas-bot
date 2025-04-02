// src/comandos/comandos/StartCommand.js
const BaseCommand = require('./BaseCommand');

class StartCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'start';
    }

    getDescription() {
        return '¡Bienvenido al Bot de Pólizas! 🤖';
    }

    register() {
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                await ctx.reply(
                    '¡Bienvenido al Bot de Pólizas! 🤖\n\n' +
                    '📋 *Comandos Principales:*\n\n' +
                    '📝 /save - Registrar nueva póliza\n' +
                    '🔍 /get - Consultar una póliza\n' +
                    '📤 /upload - Subir fotos y PDF del vehículo\n' +
                    '💰 /addpayment - Registrar un pago\n' +
                    '🚗 /addservice - Registrar un servicio\n' +
                    '❓ /help - Ver todos los comandos',
                    { parse_mode: 'Markdown' }
                );
                this.logInfo('Comando start ejecutado', { chatId: ctx.chat.id });
            } catch (error) {
                this.logError('Error en comando start:', error);
                await ctx.reply('❌ Error al iniciar. Intenta nuevamente.');
            }
        });
    }
}

module.exports = StartCommand;
