// src/comandos/handlers/ServiceHandler.ts

import BaseCommand from '../comandos/BaseCommand';
import { stateManager } from '../../state/StateFactory';
import { PolicyRepositoryMongo } from '../../infrastructure/repositories/PolicyRepositoryMongo';
import { PolicyService } from '../../domain/Policy/Policy.service';
import { AddServiceUseCase } from '../../application/use-cases/AddServiceUseCase';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';

class ServiceHandler extends BaseCommand {
    private readonly STATE_TTL = 3600;

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

            const stateKey = this.handler._getStateKey(
                chatId,
                'awaitingServicePolicyNumber',
                threadId
            );
            await stateManager.setState(stateKey, true, this.STATE_TTL);

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
        const stateKey = this.handler._getStateKey(chatId, 'awaitingServicePolicyNumber', threadId);

        try {
            const numeroPoliza = messageText.trim().toUpperCase();

            // We can still use the old controller here just to check existence,
            // as the full clean architecture is not yet applied everywhere.
            const { getPolicyByNumber } = require('../../controllers/policyController');
            const policy = await getPolicyByNumber(numeroPoliza);

            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza: ${numeroPoliza}.`);
                return;
            }

            const dataStateKey = this.handler._getStateKey(chatId, 'awaitingServiceData', threadId);
            await stateManager.setState(dataStateKey, numeroPoliza, this.STATE_TTL);

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
            await stateManager.deleteState(stateKey);
        }
    }

    public async handleServiceData(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);
        const stateKey = this.handler._getStateKey(chatId, 'awaitingServiceData', threadId);

        try {
            const numeroPoliza = await stateManager.getState<string>(stateKey);
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

            // --- INICIO DE LA NUEVA ARQUITECTURA ---
            // 1. Instanciar dependencias
            const policyRepo = new PolicyRepositoryMongo();
            const policyService = new PolicyService(policyRepo);
            const addServiceUseCase = new AddServiceUseCase(policyService);

            // 2. Ejecutar caso de uso
            const result = await addServiceUseCase.execute({
                numeroPoliza,
                serviceData: {
                    costo,
                    fechaServicio: fecha,
                    numeroExpediente: expediente,
                    origenDestino
                }
            });

            // 3. Responder al usuario
            if (result.success) {
                await ctx.reply(`✅ ${result.message}`);
            } else {
                await ctx.reply(`❌ ${result.message}`);
            }
            // --- FIN DE LA NUEVA ARQUITECTURA ---
        } catch (error: any) {
            this.logError('Error en handleServiceData', error);
            await ctx.reply(`❌ Error al registrar el servicio: ${error.message}`);
        } finally {
            await stateManager.deleteState(stateKey);
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
