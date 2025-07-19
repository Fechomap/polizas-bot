import { Markup } from 'telegraf';
import BaseCommand, { NavigationContext, IBaseHandler } from './BaseCommand';
import type { Context } from 'telegraf';

// Import AdminStateManager
const AdminStateManager = require('../../admin/utils/adminStates').default;

class StartCommand extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'start';
    }

    getDescription(): string {
        return '¡Bienvenido al Bot de Pólizas! 🤖';
    }

    register(): void {
        // Comando /start con navegación persistente
        this.bot.command(this.getCommandName(), async (ctx: NavigationContext) => {
            try {
                // SOLO limpiar estados admin problemáticos, NO toda la navegación
                AdminStateManager.clearAdminState(ctx.from?.id, ctx.chat?.id);
                this.logInfo('Estados admin limpiados al ejecutar /start', {
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id
                });

                // Usar el nuevo sistema de navegación persistente
                await this.showMainMenu(ctx);
                this.logInfo('Menú principal mostrado vía /start con navegación persistente', {
                    chatId: ctx.chat?.id
                });
            } catch (error: any) {
                this.logError('Error en comando start al mostrar menú:', error);
                await ctx.reply('❌ Error al mostrar el menú principal. Intenta nuevamente.');
            }
        });
    }

    // Este método ahora está heredado de BaseCommand con navegación persistente
    // Mantener para compatibilidad pero usar el padre
}

export default StartCommand;
