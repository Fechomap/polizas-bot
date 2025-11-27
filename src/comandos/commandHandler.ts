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
        this.bot.action('accion:volver_menu', async (ctx: any) => {
            await ctx.answerCbQuery();
            const threadId = BaseCommand.getThreadId(ctx);
            await this.clearChatState(ctx.chat.id, threadId);
            await this.startCommandInstance.showMainMenu(ctx);
        });
    }

    async clearChatState(
        chatId: number | string,
        threadId?: number | string | null
    ): Promise<void> {
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
