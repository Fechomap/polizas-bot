// src/comandos/handlers/PaymentHandler.ts
// Migrado a UnifiedStateManager - elimina dependencia de StateFactory

import { Markup } from 'telegraf';
import BaseCommand from '../comandos/BaseCommand';
import { STATE_TYPES } from '../commandHandler';
import { getPolicyByNumber, addPaymentToPolicy } from '../../controllers/policyController';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';

class PaymentHandler extends BaseCommand {
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

            // Usar UnifiedStateManager via handler
            await this.handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_PAYMENT_POLICY_NUMBER,
                true,
                threadId
            );

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

        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza: ${numeroPoliza}.`);
                return;
            }

            // Guardar número de póliza para siguiente paso
            await this.handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_PAYMENT_DATA,
                numeroPoliza,
                threadId
            );

            await ctx.reply(
                `✅ Póliza *${numeroPoliza}* encontrada.\n\n💰 *Ingresa el monto del pago:*`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            this.logError('Error en handleAddPaymentPolicyNumber', error);
        } finally {
            // Limpiar estado de espera de número de póliza
            await this.handler.deleteAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_PAYMENT_POLICY_NUMBER,
                threadId
            );
        }
    }

    public async handlePaymentData(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);

        try {
            const numeroPoliza = await this.handler.getAwaitingState<string>(
                chatId,
                STATE_TYPES.AWAITING_PAYMENT_DATA,
                threadId
            );
            if (!numeroPoliza) {
                await ctx.reply('❌ Hubo un problema. Inicia el proceso de nuevo.');
                return;
            }
            const monto = parseFloat(messageText.trim().replace(',', '.'));
            if (isNaN(monto) || monto <= 0) {
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
            await this.handler.deleteAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_PAYMENT_DATA,
                threadId
            );
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
