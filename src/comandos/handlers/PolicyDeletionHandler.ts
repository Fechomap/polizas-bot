// src/comandos/handlers/PolicyDeletionHandler.ts
// Migrado a UnifiedStateManager - elimina dependencia de StateFactory

import { Markup } from 'telegraf';
import BaseCommand from '../comandos/BaseCommand';
import { STATE_TYPES } from '../commandHandler';
import { getPolicyByNumber, markPolicyAsDeleted } from '../../controllers/policyController';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';

class PolicyDeletionHandler extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    public register(): void {
        this.handler.bot.action('accion:delete', this.handleDeleteAction.bind(this));
    }

    private async handleDeleteAction(ctx: ChatContext): Promise<void> {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            const threadId = BaseCommand.getThreadId(ctx);
            await this.handler.clearChatState(chatId, threadId);

            await this.handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_DELETE_POLICY_NUMBER,
                true,
                threadId
            );

            await ctx.reply(
                '🗑️ **ELIMINAR PÓLIZA**\n\nPuedes enviar uno o varios números de póliza separados por comas o saltos de línea.',
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            this.logError('Error en accion:delete', error);
        }
    }

    public async handleDeletePolicyFlow(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);

        try {
            const numeroPolizas = messageText
                .trim()
                .toUpperCase()
                .split(/[\n, ]+/)
                .filter(Boolean);
            if (numeroPolizas.length === 0) {
                await ctx.reply('❌ No se detectaron números de póliza válidos.');
                return;
            }

            const results = await Promise.all(
                numeroPolizas.map(async num => ({ num, exists: !!(await getPolicyByNumber(num)) }))
            );
            const encontradas = results.filter(r => r.exists).map(r => r.num);
            const noEncontradas = results.filter(r => !r.exists).map(r => r.num);

            if (noEncontradas.length > 0) {
                await ctx.reply(`❌ Pólizas no encontradas: ${noEncontradas.join(', ')}`);
            }
            if (encontradas.length === 0) {
                await this.handler.deleteAwaitingState(
                    chatId,
                    STATE_TYPES.AWAITING_DELETE_POLICY_NUMBER,
                    threadId
                );
                return;
            }

            await ctx.reply(
                `🗑️ Vas a eliminar ${encontradas.length} póliza(s). Ingresa el motivo:`
            );

            // Guardar pólizas encontradas para siguiente paso
            await this.handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_DELETE_REASON,
                encontradas,
                threadId
            );
        } catch (error) {
            this.logError('Error en handleDeletePolicyFlow', error);
            await ctx.reply('❌ Error al procesar la eliminación.');
        } finally {
            await this.handler.deleteAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_DELETE_POLICY_NUMBER,
                threadId
            );
        }
    }

    public async handleDeleteReason(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);

        try {
            const numeroPolizas = await this.handler.getAwaitingState<string[]>(
                chatId,
                STATE_TYPES.AWAITING_DELETE_REASON,
                threadId
            );
            if (!numeroPolizas || numeroPolizas.length === 0) return;

            const motivo = messageText.trim();
            const promises = numeroPolizas.map(num => markPolicyAsDeleted(num, motivo));
            await Promise.all(promises);

            await ctx.reply(`✅ ${numeroPolizas.length} póliza(s) marcada(s) como eliminada(s).`);
        } catch (error) {
            this.logError('Error en handleDeleteReason', error);
        } finally {
            await this.handler.deleteAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_DELETE_REASON,
                threadId
            );
        }
    }

    getCommandName(): string {
        return 'policy-deletion';
    }
    getDescription(): string {
        return 'Maneja la eliminación de pólizas.';
    }
}

export default PolicyDeletionHandler;
