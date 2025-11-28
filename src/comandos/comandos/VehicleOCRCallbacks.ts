// src/comandos/comandos/VehicleOCRCallbacks.ts
// Callbacks separados para el flujo OCR de vehículos
// Responsabilidad única: manejar las acciones de botones del flujo OCR

import { VehicleOCRHandler, ESTADOS_OCR_VEHICULO } from './VehicleOCRHandler';
import { VehicleRegistrationHandler } from './VehicleRegistrationHandler';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import type { Telegraf } from 'telegraf';
import type { NavigationContext } from './BaseCommand';

/**
 * Registra todos los callbacks para el flujo OCR de vehículos
 */
export function registerVehicleOCRCallbacks(
    bot: Telegraf<NavigationContext>,
    logInfo: (msg: string, data?: any) => void,
    logError: (msg: string, error?: any) => void
): void {
    // Iniciar registro con OCR
    bot.action('vehiculo_registro_ocr', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                return;
            }

            const threadIdStr = threadId ? String(threadId) : null;

            await VehicleOCRHandler.iniciarRegistroOCR(bot, chatId, userId, threadIdStr);

            logInfo('Registro OCR iniciado', { chatId, userId });
        } catch (error: any) {
            logError('Error iniciando registro OCR:', error);
            await ctx.reply('❌ Error al iniciar registro con OCR.');
        }
    });

    // Iniciar registro manual
    bot.action('vehiculo_registro_manual', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                return;
            }

            const threadIdStr = threadId ? String(threadId) : null;

            await VehicleRegistrationHandler.iniciarRegistro(bot, chatId, userId, threadIdStr);

            logInfo('Registro manual iniciado', { chatId, userId });
        } catch (error: any) {
            logError('Error iniciando registro manual:', error);
            await ctx.reply('❌ Error al iniciar el registro.');
        }
    });

    // Cambiar de OCR a manual
    bot.action('vehiculo_ocr_manual', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdStr = threadId ? String(threadId) : null;

            VehicleOCRHandler.cancelarRegistro(userId, chatId, threadIdStr);
            await VehicleRegistrationHandler.iniciarRegistro(bot, chatId, userId, threadIdStr);
        } catch (error: any) {
            logError('Error cambiando a registro manual:', error);
        }
    });

    // Reintentar foto de tarjeta
    bot.action('vehiculo_ocr_reintentar', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await VehicleOCRHandler.reiniciarParaNuevaFoto(bot, chatId, userIdStr, threadIdNum);
        } catch (error: any) {
            logError('Error reiniciando OCR:', error);
        }
    });

    // Confirmar datos extraídos
    bot.action('vehiculo_ocr_confirmar', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await VehicleOCRHandler.confirmarDatos(bot, chatId, userIdStr, threadIdNum);
        } catch (error: any) {
            logError('Error confirmando datos OCR:', error);
        }
    });

    // Corregir datos - vuelve a pedir todos
    bot.action('vehiculo_ocr_corregir', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdStr = threadId ? String(threadId) : null;

            VehicleOCRHandler.cancelarRegistro(userId, chatId, threadIdStr);
            await VehicleRegistrationHandler.iniciarRegistro(bot, chatId, userId, threadIdStr);
            await ctx.reply('📝 Cambiado a registro manual. Puedes ingresar los datos correctos.');
        } catch (error: any) {
            logError('Error corrigiendo datos:', error);
        }
    });

    // Omitir fotos del vehículo
    bot.action('vehiculo_ocr_omitir_fotos', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.reply('⚠️ Debes enviar al menos 1 foto del vehículo para continuar.');
        } catch (error: any) {
            logError('Error en omitir fotos:', error);
        }
    });

    // Finalizar registro OCR
    bot.action('vehiculo_ocr_finalizar', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await VehicleOCRHandler.finalizarRegistro(bot, chatId, userIdStr, threadIdNum);
        } catch (error: any) {
            logError('Error finalizando registro OCR:', error);
        }
    });

    // Cancelar registro OCR
    bot.action('vehiculo_ocr_cancelar', async ctx => {
        try {
            await ctx.answerCbQuery();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdStr = threadId ? String(threadId) : null;

            VehicleOCRHandler.cancelarRegistro(userId, chatId, threadIdStr);

            await ctx.editMessageText('❌ Registro cancelado.', {
                reply_markup: getMainKeyboard().reply_markup
            });
        } catch (error: any) {
            logError('Error cancelando registro OCR:', error);
        }
    });
}

/**
 * Procesa mensajes de texto para flujo OCR de vehículos
 */
export async function procesarTextoOCRVehiculo(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdStr = threadId ? String(threadId) : null;
    const userIdNum = parseInt(userId);

    if (VehicleOCRHandler.tieneRegistroEnProceso(userId, chatId, threadIdStr)) {
        const registro = VehicleOCRHandler.obtenerRegistro(userId, chatId, threadIdStr);

        if (registro?.estado === ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE) {
            return await VehicleOCRHandler.procesarTexto(bot, message, userIdNum);
        }
    }

    return false;
}

/**
 * Procesa fotos para flujo OCR de vehículos
 */
export async function procesarFotoOCRVehiculo(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdStr = threadId ? String(threadId) : null;
    const userIdNum = parseInt(userId);

    if (VehicleOCRHandler.tieneRegistroEnProceso(userId, chatId, threadIdStr)) {
        const registro = VehicleOCRHandler.obtenerRegistro(userId, chatId, threadIdStr);

        if (
            registro?.estado === ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA ||
            registro?.estado === ESTADOS_OCR_VEHICULO.ESPERANDO_FOTOS_VEHICULO
        ) {
            return await VehicleOCRHandler.procesarImagen(bot, message, userIdNum);
        }
    }

    return false;
}
