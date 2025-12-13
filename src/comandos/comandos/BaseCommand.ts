import logger from '../../utils/logger';
import { getInstance as getNavigationManager } from '../../navigation/NavigationManager';
import {
    markNavigationHandled,
    addNavigationToResponse
} from '../../navigation/NavigationMiddleware';
import type { Context } from 'telegraf';
import type { NavigationManager } from '../../navigation/NavigationManager';
import type { ParseMode, Message } from 'telegraf/typings/core/types/typegram';

// Base handler interface
interface IBaseHandler {
    bot: any;
    // Métodos de UnifiedStateManager
    setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | null
    ): Promise<void>;
    getAwaitingState<T>(
        chatId: number,
        stateType: string,
        threadId?: number | null
    ): Promise<T | null>;
    hasAwaitingState(chatId: number, stateType: string, threadId?: number | null): Promise<boolean>;
    deleteAwaitingState(chatId: number, stateType: string, threadId?: number | null): Promise<void>;
    clearChatState(chatId: number, threadId?: number | string | null): Promise<void>;
    [key: string]: any;
}

// ChatContext Type Definition
type ChatContext = Context & {
    chat: {
        id: number;
        [key: string]: any;
    };
    from: {
        id: number;
        [key: string]: any;
    };
    message?: {
        message_thread_id?: number;
        [key: string]: any;
    };
    callbackQuery?: {
        [key: string]: any;
    };
};

// Navigation properties type (matching NavigationMiddleware)
type NavigationContext = Context & {
    navManager?: NavigationManager;
    navigationHandled?: boolean;
    answered?: boolean;
    state?: {
        isError?: boolean;
        [key: string]: any;
    };
};

interface ReplyOptions {
    parse_mode?: ParseMode;
    reply_markup?: any;
    [key: string]: any;
}

abstract class BaseCommand {
    protected handler: IBaseHandler;
    protected bot: any;
    protected navManager: NavigationManager;

    constructor(handler: IBaseHandler) {
        this.handler = handler;
        this.bot = handler.bot;
        this.navManager = getNavigationManager();
    }

    /**
     * Register the command with the bot
     * This method should be implemented by each command
     */
    abstract register(): void;

    /**
     * Get the command name (without the slash)
     */
    abstract getCommandName(): string;

    /**
     * Get the command description for help text
     */
    abstract getDescription(): string;

    /**
     * Safely gets the thread ID from the context.
     * @param ctx The Telegraf context.
     * @returns The thread ID or null.
     */
    public static getThreadId(ctx: ChatContext): number | null {
        if (ctx.message) {
            return ctx.message.message_thread_id ?? null;
        }
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
            const msg = ctx.callbackQuery.message;
            if (msg && 'date' in msg) {
                // Type guard for accessible message
                return (msg as Message.ServiceMessage).message_thread_id ?? null;
            }
        }
        return null;
    }

    /**
     * Log an info message with the command context
     */
    logInfo(message: string, data: Record<string, any> = {}): void {
        logger.info(`[${this.getCommandName()}] ${message}`, data);
    }

    /**
     * Log an error message with the command context
     */
    logError(message: string, error?: any): void {
        logger.error(`[${this.getCommandName()}] ${message}`, error);
    }

    // 🧭 MÉTODOS DE NAVEGACIÓN PERSISTENTE

    /**
     * 📤 Respuesta con navegación persistente automática
     * @param ctx - Contexto de Telegraf
     * @param text - Texto del mensaje
     * @param options - Opciones adicionales
     */
    async replyWithNavigation(
        ctx: NavigationContext,
        text: string,
        options: ReplyOptions = {}
    ): Promise<any> {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                return await ctx.reply(text, options);
            }

            const responseOptions = addNavigationToResponse(ctx, text, options);
            return await ctx.reply(text, responseOptions);
        } catch (error: any) {
            this.logError('Error en replyWithNavigation:', error);
            return await ctx.reply(text, options);
        }
    }

    /**
     * ✏️ Editar mensaje con navegación persistente
     * @param ctx - Contexto de Telegraf
     * @param text - Nuevo texto del mensaje
     * @param options - Opciones adicionales
     */
    async editWithNavigation(
        ctx: NavigationContext,
        text: string,
        options: ReplyOptions = {}
    ): Promise<any> {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId || !ctx.callbackQuery) {
                return await this.replyWithNavigation(ctx, text, options);
            }

            const responseOptions = addNavigationToResponse(ctx, text, options);
            return await ctx.editMessageText(text, responseOptions);
        } catch (error: any) {
            this.logError('Error en editWithNavigation:', error);
            // Fallback a reply si edit falla
            return await this.replyWithNavigation(ctx, text, options);
        }
    }

    /**
     * 🏠 Mostrar menú principal con navegación
     * @param ctx - Contexto de Telegraf
     */
    async showMainMenu(ctx: NavigationContext): Promise<void> {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                throw new Error('Usuario no identificado');
            }

            const menuData = this.navManager.getMainMenu(userId);
            markNavigationHandled(ctx);

            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
                await ctx.answerCbQuery();
            } else {
                // Enviar solo el menú inline
                await ctx.reply(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
            }

            this.logInfo('Menú principal mostrado con navegación', {
                userId,
                chatId: ctx.chat?.id
            });
        } catch (error: any) {
            this.logError('Error mostrando menú principal:', error);
            await ctx.reply('❌ Error al mostrar el menú principal.');
        }
    }

    /**
     * 📊 Mostrar menú de reportes con navegación
     * @param ctx - Contexto de Telegraf
     */
    async showReportsMenu(ctx: NavigationContext): Promise<void> {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                throw new Error('Usuario no identificado');
            }

            const menuData = this.navManager.getReportsMenu(userId);
            markNavigationHandled(ctx);

            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
                await ctx.answerCbQuery();
            } else {
                // Enviar el menú inline
                await ctx.reply(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
            }

            this.logInfo('Menú reportes mostrado con navegación', {
                userId,
                chatId: ctx.chat?.id
            });
        } catch (error: any) {
            this.logError('Error mostrando menú reportes:', error);
            await this.replyWithNavigation(ctx, '❌ Error al mostrar el menú de reportes.');
        }
    }

    /**
     * 🎯 Preservar navegación - marcar como manejada
     * @param ctx - Contexto de Telegraf
     */
    preserveNavigation(ctx: NavigationContext): void {
        markNavigationHandled(ctx);
    }

    /**
     * 🧹 Método helper para error con navegación
     * @param ctx - Contexto de Telegraf
     * @param errorMessage - Mensaje de error
     */
    async replyError(ctx: NavigationContext, errorMessage: string): Promise<void> {
        const fullMessage = `❌ ${errorMessage}`;
        await this.replyWithNavigation(ctx, fullMessage);
    }
}

export { BaseCommand, NavigationContext, IBaseHandler, ReplyOptions, ChatContext };
export default BaseCommand;
