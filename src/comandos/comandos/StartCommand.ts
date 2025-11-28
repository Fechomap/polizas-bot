import BaseCommand, { NavigationContext, IBaseHandler } from './BaseCommand';
import StateKeyManager from '../../utils/StateKeyManager';
import { getPersistentMenuKeyboard } from '../teclados';
import { getStateCleanupService } from '../../services/StateCleanupService';

// Service - Limpieza centralizada de estados
const cleanupService = getStateCleanupService();

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
                const threadId = StateKeyManager.getThreadId(ctx);

                // LIMPIEZA CENTRALIZADA DE TODOS LOS ESTADOS
                if (chatId) {
                    cleanupService.limpiarTodosLosEstados(
                        chatId,
                        threadId,
                        ctx.from?.id,
                        this.handler
                    );
                    this.logInfo('🧹 Todos los estados limpiados vía /start', {
                        chatId,
                        threadId: threadId ?? 'ninguno'
                    });
                }

                // Configurar teclado persistente primero
                const persistentKeyboard = getPersistentMenuKeyboard();
                await ctx.reply('🤖 *Bot de Pólizas iniciado*', {
                    parse_mode: 'Markdown',
                    reply_markup: persistentKeyboard
                });

                // Usar el nuevo sistema de navegación persistente
                await this.showMainMenu(ctx);
                this.logInfo('Menú principal mostrado vía /start con navegación persistente', {
                    chatId: ctx.chat?.id,
                    threadId: threadId
                });
            } catch (error: any) {
                this.logError('Error en comando start al mostrar menú:', error);
                await ctx.reply('❌ Error al mostrar el menú principal. Intenta nuevamente.');
            }
        });
    }
}

export default StartCommand;
