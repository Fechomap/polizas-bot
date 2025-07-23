import BaseCommand, { NavigationContext, IBaseHandler } from './BaseCommand';
import StateKeyManager from '../../utils/StateKeyManager';
import { getPersistentMenuKeyboard } from '../teclados';

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
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // Limpiar estados admin problemáticos
                AdminStateManager.clearAdminState(ctx.from?.id, ctx.chat?.id);
                this.logInfo('Estados admin limpiados al ejecutar /start', {
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id,
                    threadId: threadId
                });

                // LIMPIAR TODOS LOS PROCESOS DEL HILO ESPECÍFICO
                if (chatId && this.handler.clearChatState) {
                    this.handler.clearChatState(chatId, threadId);
                    this.logInfo('🧹 Todos los procesos del hilo limpiados completamente', {
                        chatId: chatId,
                        threadId: threadId || 'ninguno'
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

    // Este método ahora está heredado de BaseCommand con navegación persistente
    // Mantener para compatibilidad pero usar el padre
}

export default StartCommand;
