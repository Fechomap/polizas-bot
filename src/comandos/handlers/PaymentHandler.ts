// src/comandos/handlers/PaymentHandler.ts

import { Markup } from 'telegraf';
import BaseCommand from '../comandos/BaseCommand';
import { stateManager } from '../../state/StateFactory';
import { getPolicyByNumber, addPaymentToPolicy } from '../../controllers/policyController';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';

class PaymentHandler extends BaseCommand {
    private readonly STATE_TTL = 3600;

    constructor(handler: IBaseHandler) {
        super(handler);
    }

    public register(): void {
        this.handler.bot.action('accion:addpayment', this.handleAddPaymentAction.bind(this));
    }

    private async handleAddPaymentAction(ctx: ChatContext): Promise<void> {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            const threadId = BaseCommand.getThreadId(ctx);
            await this.handler.clearChatState(chatId, threadId);

            const stateKey = this.handler._getStateKey(
                chatId,
                'awaitingPaymentPolicyNumber',
                threadId
            );
            await stateManager.setState(stateKey, true, this.STATE_TTL);

            await ctx.reply('💰 Introduce el número de póliza para añadir el pago:');
        } catch (error) {
            this.logError('Error en accion:addpayment', error);
        }
    }

    public async handleAddPaymentPolicyNumber(
        ctx: ChatContext,
        messageText: string
    ): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);
        const stateKey = this.handler._getStateKey(chatId, 'awaitingPaymentPolicyNumber', threadId);

        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza: ${numeroPoliza}.`);
                return;
            }

            const dataStateKey = this.handler._getStateKey(chatId, 'awaitingPaymentData', threadId);
            await stateManager.setState(dataStateKey, numeroPoliza, this.STATE_TTL);

            await ctx.reply(
                `✅ Póliza *${numeroPoliza}* encontrada.\n\n💰 *Ingresa el monto del pago:*`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            this.logError('Error en handleAddPaymentPolicyNumber', error);
        } finally {
            await stateManager.deleteState(stateKey);
        }
    }

    public async handlePaymentData(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);
        const stateKey = this.handler._getStateKey(chatId, 'awaitingPaymentData', threadId);

        try {
            const numeroPoliza = await stateManager.getState<string>(stateKey);
            if (!numeroPoliza) {
                await ctx.reply('❌ Hubo un problema. Inicia el proceso de nuevo.');
                return;
            }
            const monto = parseFloat(messageText.trim().replace(',', '.'));
            if (isNaN(0) || monto <= 0) {
                await ctx.reply('❌ Monto inválido. Ingresa un número mayor a 0.');
                return;
            }
            await addPaymentToPolicy(numeroPoliza, monto, new Date());
            await ctx.reply(
                `✅ Pago de $${monto.toFixed(2)} registrado en la póliza *${numeroPoliza}*.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error: any) {
            this.logError('Error en handlePaymentData', error);
            await ctx.reply(`❌ Error al registrar el pago: ${error.message}`);
        } finally {
            await stateManager.deleteState(stateKey);
        }
    }

    getCommandName(): string {
        return 'payment-handler';
    }
    getDescription(): string {
        return 'Maneja el registro de pagos.';
    }
}

export default PaymentHandler;
