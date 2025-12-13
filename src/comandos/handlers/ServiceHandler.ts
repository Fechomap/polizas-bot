// src/comandos/handlers/ServiceHandler.ts
// Migrado a Prisma/PostgreSQL

import BaseCommand from '../comandos/BaseCommand';
import { STATE_TYPES } from '../commandHandler';
import { getPolicyByNumber, addServiceToPolicy } from '../../controllers/policyController';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';

class ServiceHandler extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    public register(): void {
        this.handler.bot.action('accion:addservice', this.handleAddServiceAction.bind(this));
    }

    private async handleAddServiceAction(ctx: ChatContext): Promise<void> {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            const threadId = BaseCommand.getThreadId(ctx);
            await this.handler.clearChatState(chatId, threadId);

            await this.handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_SERVICE_POLICY_NUMBER,
                true,
                threadId
            );

            await ctx.reply('🚗 Introduce el número de póliza para añadir el servicio:');
        } catch (error) {
            this.logError('Error en accion:addservice', error);
        }
    }

    public async handleAddServicePolicyNumber(
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

            await this.handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_SERVICE_DATA,
                numeroPoliza,
                threadId
            );

            await ctx.reply(
                `✅ Póliza *${numeroPoliza}* encontrada.\n\n` +
                    '🚗 *Ingresa la información del servicio (4 líneas):*\n' +
                    '1️⃣ Costo (ej. 550.00)\n' +
                    '2️⃣ Fecha del servicio (DD/MM/YYYY)\n' +
                    '3️⃣ Número de expediente\n' +
                    '4️⃣ Origen y Destino',
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            this.logError('Error en handleAddServicePolicyNumber', error);
        } finally {
            await this.handler.deleteAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_SERVICE_POLICY_NUMBER,
                threadId
            );
        }
    }

    public async handleServiceData(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);

        try {
            const numeroPoliza = await this.handler.getAwaitingState<string>(
                chatId,
                STATE_TYPES.AWAITING_SERVICE_DATA,
                threadId
            );
            if (!numeroPoliza) {
                await ctx.reply('❌ Hubo un problema. Inicia el proceso de nuevo.');
                return;
            }

            const lines = messageText
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);
            if (lines.length < 4) {
                await ctx.reply('❌ Formato inválido. Se requieren 4 líneas.');
                return;
            }

            const [costoStr, fechaStr, expediente, origenDestino] = lines;
            const costo = parseFloat(costoStr);
            const fecha = new Date(fechaStr.split('/').reverse().join('-'));

            // Usar policyController que ya está migrado a Prisma
            const result = await addServiceToPolicy(
                numeroPoliza,
                costo,
                fecha,
                expediente,
                origenDestino
            );

            if (result) {
                await ctx.reply(
                    `✅ Servicio registrado correctamente.\n` +
                        `📋 Número de servicio: ${result.servicioCounter}\n` +
                        `💰 Costo: $${costo.toFixed(2)}`
                );
            } else {
                await ctx.reply('❌ No se pudo registrar el servicio. Verifica la póliza.');
            }
        } catch (error: any) {
            this.logError('Error en handleServiceData', error);
            await ctx.reply(`❌ Error al registrar el servicio: ${error.message}`);
        } finally {
            await this.handler.deleteAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_SERVICE_DATA,
                threadId
            );
        }
    }

    getCommandName(): string {
        return 'service-handler';
    }
    getDescription(): string {
        return 'Maneja la creación de servicios.';
    }
}

export default ServiceHandler;
