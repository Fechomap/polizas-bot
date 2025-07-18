// src/comandos/comandos/StartCommand.js
const { Markup } = require('telegraf'); // Importar Markup
const BaseCommand = require('./BaseCommand');
const AdminStateManager = require('../../admin/utils/adminStates');

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
        // Comando /start con navegación persistente
        this.bot.command(this.getCommandName(), async ctx => {
            try {
                // SOLO limpiar estados admin problemáticos, NO toda la navegación
                AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
                this.logInfo('Estados admin limpiados al ejecutar /start', {
                    userId: ctx.from.id,
                    chatId: ctx.chat.id
                });

                // Usar el nuevo sistema de navegación persistente
                await this.showMainMenu(ctx);
                this.logInfo('Menú principal mostrado vía /start con navegación persistente', {
                    chatId: ctx.chat.id
                });
            } catch (error) {
                this.logError('Error en comando start al mostrar menú:', error);
                await ctx.reply('❌ Error al mostrar el menú principal. Intenta nuevamente.');
            }
        });
    }

    // Este método ahora está heredado de BaseCommand con navegación persistente
    // Mantener para compatibilidad pero usar el padre
}

module.exports = StartCommand;
