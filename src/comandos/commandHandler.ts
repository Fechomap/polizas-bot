// src/comandos/commandHandler.ts
import { Markup, Telegraf } from 'telegraf';
import config from '../config';
import CommandRegistry from './comandos/CommandRegistry';
import logger from '../utils/logger';
import { stateManager } from '../state/StateFactory';
import BaseCommand from './comandos/BaseCommand';
import { StartCommand, TextMessageHandler } from './comandos';
import PolicyQueryHandler from './handlers/PolicyQueryHandler';
import PolicyRegistrationHandler from './handlers/PolicyRegistrationHandler';
import PolicyDeletionHandler from './handlers/PolicyDeletionHandler';
import PaymentHandler from './handlers/PaymentHandler';
import ServiceHandler from './handlers/ServiceHandler';
import type { ChatContext } from './comandos/BaseCommand';

// Helper para crear mapas de estado compatibles con TextMessageHandler
function createStateMap() {
    const map = new Map<string, any>();
    return {
        get: (chatId: number | string, threadId?: number | string | null) => {
            const key = `${chatId}:${threadId || ''}`;
            return map.get(key);
        },
        has: (chatId: number | string, threadId?: number | string | null) => {
            const key = `${chatId}:${threadId || ''}`;
            return map.has(key);
        },
        set: (chatId: number | string, threadId: number | string | null | undefined, value: any) => {
            const key = `${chatId}:${threadId || ''}`;
            map.set(key, value);
        },
        delete: (chatId: number | string, threadId?: number | string | null) => {
            const key = `${chatId}:${threadId || ''}`;
            return map.delete(key);
        }
    };
}

class CommandHandler {
    public bot: Telegraf;
    public registry: CommandRegistry;
    public excelUploadMessages: Map<number, number>;
    private startCommandInstance: StartCommand;
    private policyQueryHandler: PolicyQueryHandler;
    private policyRegistrationHandler: PolicyRegistrationHandler;
    private policyDeletionHandler: PolicyDeletionHandler;
    private paymentHandler: PaymentHandler;
    private serviceHandler: ServiceHandler;

    // Mapas de estado para compatibilidad con TextMessageHandler
    public awaitingSaveData = createStateMap();
    public awaitingGetPolicyNumber = createStateMap();
    public awaitingUploadPolicyNumber = createStateMap();
    public awaitingDeletePolicyNumber = createStateMap();
    public awaitingPaymentPolicyNumber = createStateMap();
    public awaitingPaymentData = createStateMap();
    public awaitingServicePolicyNumber = createStateMap();
    public awaitingServiceData = createStateMap();
    public awaitingPhoneNumber = createStateMap();
    public awaitingOrigen = createStateMap();
    public awaitingDestino = createStateMap();
    public awaitingOrigenDestino = createStateMap();
    public awaitingDeleteReason = createStateMap();

    constructor(bot: Telegraf) {
        if (!bot) throw new Error('Bot instance is required');
        this.bot = bot;
        this.registry = new CommandRegistry();
        this.excelUploadMessages = new Map();

        // Instantiate all handlers
        this.startCommandInstance = new StartCommand(this as any);
        this.policyQueryHandler = new PolicyQueryHandler(this as any);
        this.policyRegistrationHandler = new PolicyRegistrationHandler(this as any);
        this.policyDeletionHandler = new PolicyDeletionHandler(this as any);
        this.paymentHandler = new PaymentHandler(this as any);
        this.serviceHandler = new ServiceHandler(this as any);

        this.registerCommands();
    }

    _getStateKey(
        chatId: number | string,
        stateName: string,
        threadId?: number | string | null
    ): string {
        const threadSuffix = threadId ? `:${threadId}` : '';
        return `${stateName}:${chatId}${threadSuffix}`;
    }

    registerCommands(): void {
        this.startCommandInstance.register();
        this.policyQueryHandler.register();
        this.policyRegistrationHandler.register();
        this.policyDeletionHandler.register();
        this.paymentHandler.register();
        this.serviceHandler.register();

        new TextMessageHandler(this as any).register();
        this.setupActionHandlers();
    }

    setupActionHandlers(): void {
        // Volver al menú principal
        this.bot.action('accion:volver_menu', async (ctx: any) => {
            await ctx.answerCbQuery();
            const threadId = BaseCommand.getThreadId(ctx);
            await this.clearChatState(ctx.chat.id, threadId);
            await this.startCommandInstance.showMainMenu(ctx);
        });

        // Menú de Pólizas
        this.bot.action('accion:polizas', async (ctx: any) => {
            await ctx.answerCbQuery();
            await this.showPolizasMenu(ctx);
        });

        // Menú de Reportes
        this.bot.action('accion:reportes', async (ctx: any) => {
            await ctx.answerCbQuery();
            await this.showReportesMenu(ctx);
        });

        // Menú de Administración
        this.bot.action('accion:administracion', async (ctx: any) => {
            await ctx.answerCbQuery();
            await this.showAdminMenu(ctx);
        });
    }

    // Menú de Pólizas - usa callbacks existentes en handlers
    private async showPolizasMenu(ctx: any): Promise<void> {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 Registrar', 'accion:registrar'),
                Markup.button.callback('🔍 Consultar', 'accion:consultar')
            ],
            [
                Markup.button.callback('💰 Agregar Pago', 'accion:addpayment'),
                Markup.button.callback('🔧 Agregar Servicio', 'accion:addservice')
            ],
            [Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
        ]);
        await ctx.editMessageText('📋 **PÓLIZAS** - Gestión de Pólizas. Selecciona una opción:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }

    // Menú de Reportes - usa el módulo admin que ya tiene reportes
    private async showReportesMenu(ctx: any): Promise<void> {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📊 Panel de Reportes', 'admin_reports_menu')],
            [Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
        ]);
        await ctx.editMessageText('📊 **REPORTES**\n\nAccede al panel de reportes:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }

    // Menú de Administración - redirige directamente al panel admin
    private async showAdminMenu(ctx: any): Promise<void> {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔧 Panel de Administración', 'admin_menu')],
            [Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
        ]);
        await ctx.editMessageText('🔧 **ADMINISTRACIÓN**\n\nAccede al panel de administración:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }

    async clearChatState(
        chatId: number | string,
        threadId?: number | string | null
    ): Promise<void> {
        // Limpiar mapas en memoria
        this.awaitingSaveData.delete(chatId, threadId);
        this.awaitingGetPolicyNumber.delete(chatId, threadId);
        this.awaitingUploadPolicyNumber.delete(chatId, threadId);
        this.awaitingDeletePolicyNumber.delete(chatId, threadId);
        this.awaitingPaymentPolicyNumber.delete(chatId, threadId);
        this.awaitingPaymentData.delete(chatId, threadId);
        this.awaitingServicePolicyNumber.delete(chatId, threadId);
        this.awaitingServiceData.delete(chatId, threadId);
        this.awaitingPhoneNumber.delete(chatId, threadId);
        this.awaitingOrigen.delete(chatId, threadId);
        this.awaitingDestino.delete(chatId, threadId);
        this.awaitingOrigenDestino.delete(chatId, threadId);
        this.awaitingDeleteReason.delete(chatId, threadId);

        // Limpiar stateManager (Redis/Memory)
        const stateNames = [
            'awaitingGetPolicyNumber',
            'awaitingSaveData',
            'awaitingDeletePolicyNumber',
            'awaitingPaymentPolicyNumber',
            'awaitingPaymentData',
            'awaitingServicePolicyNumber',
            'awaitingServiceData'
        ];
        const deletionPromises = stateNames.map(name =>
            stateManager.deleteState(this._getStateKey(chatId, name, threadId))
        );
        await Promise.all(deletionPromises);
    }

    // --- Facade Methods for TextMessageHandler ---
    async handleGetPolicyFlow(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyQueryHandler.handleGetPolicyFlow(ctx, messageText);
    }
    async handleSaveData(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyRegistrationHandler.handleSaveData(ctx, messageText);
    }
    async handleUploadFlow(ctx: ChatContext, messageText: string): Promise<void> {
        // Placeholder - upload flow handled elsewhere
        logger.info('handleUploadFlow called', { messageText });
    }
    async handleDeletePolicyFlow(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyDeletionHandler.handleDeletePolicyFlow(ctx, messageText);
    }
    async handleDeleteReason(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyDeletionHandler.handleDeleteReason(ctx, messageText);
    }
    async handleAddPaymentPolicyNumber(ctx: ChatContext, messageText: string): Promise<void> {
        await this.paymentHandler.handleAddPaymentPolicyNumber(ctx, messageText);
    }
    async handlePaymentData(ctx: ChatContext, messageText: string): Promise<void> {
        await this.paymentHandler.handlePaymentData(ctx, messageText);
    }
    async handleAddServicePolicyNumber(ctx: ChatContext, messageText: string): Promise<void> {
        await this.serviceHandler.handleAddServicePolicyNumber(ctx, messageText);
    }
    async handleServiceData(ctx: ChatContext, messageText: string): Promise<void> {
        await this.serviceHandler.handleServiceData(ctx, messageText);
    }
}

export default CommandHandler;
