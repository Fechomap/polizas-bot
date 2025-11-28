// src/comandos/comandos/VehicleRegistrationCallbacks.ts
// Callbacks para el flujo de registro manual de vehículos

import { VehicleRegistrationHandler } from './VehicleRegistrationHandler';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import type { Telegraf } from 'telegraf';
import type { NavigationContext } from './BaseCommand';

/**
 * Registra callbacks para el flujo de registro manual de vehículos
 */
export function registerVehicleRegistrationCallbacks(
    bot: Telegraf<NavigationContext>,
    logInfo: (msg: string, data?: any) => void,
    logError: (msg: string, error?: any) => void
): void {
    // Cancelar registro de vehículo manual
    bot.action('vehiculo_cancelar', async ctx => {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                return;
            }

            const threadIdStr = threadId ? String(threadId) : null;
            VehicleRegistrationHandler.cancelarRegistro(userId, chatId, threadIdStr);

            await ctx.editMessageText('❌ Registro de vehículo cancelado.', {
                reply_markup: getMainKeyboard().reply_markup
            });

            logInfo('Registro de vehículo cancelado', { userId });
        } catch (error: any) {
            logError('Error cancelando registro de vehículo:', error);
            await ctx.reply('❌ Error al cancelar.');
        }
    });

    // Finalizar registro de vehículo manual
    bot.action('vehiculo_finalizar', async ctx => {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                return;
            }

            // Verificar que hay registro en proceso
            const threadIdStr = threadId ? String(threadId) : null;
            if (!VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadIdStr)) {
                await ctx.reply('❌ No hay registro en proceso.');
                return;
            }

            // Finalizar el registro
            const resultado = await VehicleRegistrationHandler.finalizarRegistro(
                bot as any,
                chatId,
                userId,
                threadIdStr
            );

            if (resultado) {
                await ctx.deleteMessage();
            }

            logInfo('Registro de vehículo finalizado', { userId });
        } catch (error: any) {
            logError('Error finalizando registro de vehículo:', error);
            await ctx.reply('❌ Error al finalizar.');
        }
    });
}

/**
 * Procesa mensajes para el flujo de registro manual
 */
export async function procesarMensajeRegistroManual(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdStr = threadId ? String(threadId) : null;
    const userIdNum = parseInt(userId);

    if (VehicleRegistrationHandler.tieneRegistroEnProceso(userIdNum, chatId, threadIdStr)) {
        return await VehicleRegistrationHandler.procesarMensaje(bot, message, userIdNum);
    }

    return false;
}
