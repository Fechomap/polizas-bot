// src/comandos/handlers/PolicyQueryHandler.ts

import { Markup } from 'telegraf';
import BaseCommand from '../comandos/BaseCommand';
import { stateManager } from '../../state/StateFactory';
import { getPolicyByNumber } from '../../controllers/policyController';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';

class PolicyQueryHandler extends BaseCommand {
    private readonly STATE_TTL = 3600; // 1 hour TTL for states

    constructor(handler: IBaseHandler) {
        super(handler);
    }

    public register(): void {
        this.handler.bot.action('accion:consultar', this.handleConsultarAction.bind(this));
    }

    private async handleConsultarAction(ctx: ChatContext): Promise<void> {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            const threadId = BaseCommand.getThreadId(ctx);

            // Clear any previous state for this chat/thread
            // Note: This assumes a generic clearChatState method exists on the main handler.
            // This dependency will be removed in a later refactoring phase.
            await this.handler.clearChatState(chatId, threadId);

            const stateKey = this.handler._getStateKey(chatId, 'awaitingGetPolicyNumber', threadId);
            await stateManager.setState(stateKey, true, this.STATE_TTL);

            await ctx.reply('🔍 Por favor, introduce el número de póliza que deseas consultar:');
        } catch (error: any) {
            this.logError('Error en accion:consultar', error);
            try {
                await ctx.answerCbQuery('Error');
            } catch {}
        }
    }

    public async handleGetPolicyFlow(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat?.id;
        const threadId = BaseCommand.getThreadId(ctx);
        const stateKey = this.handler._getStateKey(chatId, 'awaitingGetPolicyNumber', threadId);

        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            this.logInfo('Buscando póliza:', { numeroPoliza, threadId });

            const policy = await getPolicyByNumber(numeroPoliza);

            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}.`);
            } else {
                const servicios = policy.servicios || [];
                const totalServicios = servicios.length;
                let serviciosInfo = '\n*Servicios:* Sin servicios registrados';
                if (totalServicios > 0) {
                    const ultimoServicio = servicios[totalServicios - 1];
                    serviciosInfo = `\n*Servicios:* ${totalServicios}\n*Último Servicio:* ${new Date(ultimoServicio.fechaServicio).toLocaleDateString()}\n*Origen/Destino:* ${ultimoServicio.origenDestino}`;
                }

                const mensaje = `📋 *Información de la Póliza*\n*Número:* ${policy.numeroPoliza}\n... (detalles de la póliza) ...${serviciosInfo}`;
                await ctx.replyWithMarkdown(
                    mensaje,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '📸 Ver Fotos',
                                `verFotos:${policy.numeroPoliza}`
                            ),
                            Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`)
                        ],
                        [
                            Markup.button.callback(
                                '🚗 Ocupar Póliza',
                                `ocuparPoliza:${policy.numeroPoliza}`
                            )
                        ]
                    ])
                );
            }
        } catch (error: any) {
            this.logError('Error en handleGetPolicyFlow:', error);
            await ctx.reply('❌ Error al buscar la póliza.');
        } finally {
            await stateManager.deleteState(stateKey);
        }
    }

    // El nombre del comando y la descripción no son tan relevantes aquí,
    // ya que este handler se activa por una acción de botón.
    getCommandName(): string {
        return 'policy-query';
    }
    getDescription(): string {
        return 'Maneja las consultas de pólizas.';
    }
}

export default PolicyQueryHandler;
