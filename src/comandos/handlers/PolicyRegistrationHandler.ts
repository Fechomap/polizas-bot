// src/comandos/handlers/PolicyRegistrationHandler.ts

import { Markup } from 'telegraf';
import BaseCommand from '../comandos/BaseCommand';
import { stateManager } from '../../state/StateFactory';
import {
    savePolicy,
    getPolicyByNumber,
    DuplicatePolicyError
} from '../../controllers/policyController';
import type { IBaseHandler, ChatContext } from '../comandos/BaseCommand';
import type { IPolicyData } from '../../types/database';
import type ExcelUploadHandler from '../comandos/ExcelUploadHandler';

class PolicyRegistrationHandler extends BaseCommand {
    private readonly STATE_TTL = 3600;

    constructor(handler: IBaseHandler) {
        super(handler);
    }

    public register(): void {
        this.handler.bot.action('accion:registrar', this.handleRegisterAction.bind(this));
        this.handler.bot.action('accion:cancelar_registro', this.handleCancelAction.bind(this));
    }

    private async handleRegisterAction(ctx: ChatContext): Promise<void> {
        try {
            await ctx.answerCbQuery();
            await this.handler.clearChatState(ctx.chat.id, BaseCommand.getThreadId(ctx));

            const excelUploadCmd = this.handler.registry.getCommand(
                'excelUpload'
            ) as ExcelUploadHandler;
            if (excelUploadCmd) {
                excelUploadCmd.setAwaitingExcelUpload(ctx.chat.id, true);
            }

            const msg = await ctx.reply(
                '📊 *Registro de Pólizas por Excel*\n\nPor favor, sube un archivo Excel (.xlsx).',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                    ])
                }
            );
            this.handler.excelUploadMessages.set(ctx.chat.id, msg.message_id);
        } catch (error) {
            this.logError('Error en accion:registrar', error);
        }
    }

    private async handleCancelAction(ctx: ChatContext): Promise<void> {
        try {
            await ctx.answerCbQuery('Registro cancelado');
            const excelUploadCmd = this.handler.registry.getCommand(
                'excelUpload'
            ) as ExcelUploadHandler;
            if (excelUploadCmd) {
                excelUploadCmd.setAwaitingExcelUpload(ctx.chat.id, false);
            }
            await this.handler.clearChatState(ctx.chat.id, BaseCommand.getThreadId(ctx));
            this.handler.excelUploadMessages.delete(ctx.chat.id);
            await ctx.editMessageText('Registro cancelado.');
        } catch (error) {
            this.logError('Error en accion:cancelar_registro', error);
        }
    }

    public async handleSaveData(ctx: ChatContext, messageText: string): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);
        const stateKey = this.handler._getStateKey(chatId, 'awaitingSaveData', threadId);

        try {
            const lines = messageText
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);
            if (lines.length < 19) {
                await ctx.reply('❌ Los datos no están completos. Se requieren 19 líneas.');
                return;
            }
            const fechaStr = lines[18];
            const fechaParts = fechaStr.split(/[/-]/);
            let [day, month, year] = fechaParts;
            if (year.length === 2) year = '20' + year;
            const fecha = new Date(`${year}-${month}-${day}`);

            const policyData: IPolicyData = {
                titular: lines[0],
                correo: lines[1].toLowerCase() === 'sin correo' ? '' : lines[1],
                contraseña: lines[2],
                calle: lines[3],
                colonia: lines[4],
                municipio: lines[5],
                cp: lines[7],
                rfc: lines[8].toUpperCase(),
                marca: lines[9].toUpperCase(),
                submarca: lines[10].toUpperCase(),
                año: parseInt(lines[11], 10),
                color: lines[12].toUpperCase(),
                serie: lines[13].toUpperCase(),
                placas: lines[14].toUpperCase(),
                agenteCotizador: lines[15],
                aseguradora: lines[16].toUpperCase(),
                numeroPoliza: lines[17].toUpperCase(),
                fechaEmision: fecha
            };

            await savePolicy(policyData as any);
            await ctx.reply(`✅ Póliza guardada exitosamente: ${policyData.numeroPoliza}`);
        } catch (error: any) {
            await ctx.reply(`❌ Error al guardar: ${error.message}`);
        } finally {
            await stateManager.deleteState(stateKey);
        }
    }

    getCommandName(): string {
        return 'policy-registration';
    }
    getDescription(): string {
        return 'Maneja el registro de pólizas.';
    }
}

export default PolicyRegistrationHandler;
