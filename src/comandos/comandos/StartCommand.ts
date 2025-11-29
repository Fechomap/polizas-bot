import BaseCommand, { NavigationContext, IBaseHandler } from './BaseCommand';
import StateKeyManager from '../../utils/StateKeyManager';
import { getStateCleanupService } from '../../services/StateCleanupService';
import { getInstance as getNavigationManager } from '../../navigation/NavigationManager';

// Services singleton
const cleanupService = getStateCleanupService();
const navManager = getNavigationManager();

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
                const chatId = ctx.chat?.id;
                const userId = ctx.from?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // LIMPIEZA TOTAL: estados + navigation stack
                if (chatId && userId) {
                    cleanupService.limpiarTodosLosEstados(chatId, threadId, userId, this.handler);
                    navManager.clearUserNavigation(String(userId));
                }

                // Mostrar menú principal directamente (sin mensaje redundante)
                await this.showMainMenu(ctx);
            } catch (error: any) {
                this.logError('Error en /start:', error);
                await ctx.reply('❌ Error al mostrar el menú. Intenta nuevamente.');
            }
        });
    }
}

export default StartCommand;
