// src/comandos/comandos/VehicleVisionCallbacks.ts
// Callbacks simplificados para flujo Vision de vehiculos

import { VehicleVisionHandler, ESTADOS, registros } from './VehicleVisionHandler';
import { VehicleRegistrationHandler } from './VehicleRegistrationHandler';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import type { Telegraf } from 'telegraf';
import type { NavigationContext } from './BaseCommand';

/**
 * Registra callbacks para el flujo Vision
 */
export function registerVehicleVisionCallbacks(
    bot: Telegraf<NavigationContext>,
    logInfo: (msg: string, data?: any) => void,
    logError: (msg: string, error?: any) => void
): void {

    // Iniciar registro Vision (desde menu de opciones)
    bot.action('vehiculo_registro_ocr', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdStr = threadId ? String(threadId) : null;
            await VehicleVisionHandler.iniciar(bot, chatId, userId, threadIdStr);

            logInfo('Vision: registro iniciado', { chatId, userId });
        } catch (error) {
            logError('Error iniciando Vision:', error);
        }
    });

    // Procesar batch manualmente
    bot.action('vision_procesar', async ctx => {
        try {
            await ctx.answerCbQuery('Procesando...');

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const key = VehicleVisionHandler.getKeyFromIds(userId, chatId, threadId ? String(threadId) : null);
            await VehicleVisionHandler.forzarProcesar(bot, key);

            logInfo('Vision: batch forzado', { chatId, userId });
        } catch (error) {
            logError('Error procesando batch:', error);
        }
    });

    // Confirmar datos
    bot.action('vision_confirmar', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const key = VehicleVisionHandler.getKeyFromIds(userId, chatId, threadId ? String(threadId) : null);
            await VehicleVisionHandler.confirmar(bot, key, String(userId));

            logInfo('Vision: confirmado', { chatId, userId });
        } catch (error) {
            logError('Error confirmando:', error);
        }
    });

    // Mostrar menu de correccion
    bot.action('vision_corregir', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const key = VehicleVisionHandler.getKeyFromIds(userId, chatId, threadId ? String(threadId) : null);
            await VehicleVisionHandler.mostrarMenuCorreccion(bot, key);

            logInfo('Vision: menu correccion', { chatId, userId });
        } catch (error) {
            logError('Error mostrando correccion:', error);
        }
    });

    // Reintentar tarjeta (fallback para datos faltantes)
    bot.action('vision_reintentar', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const key = VehicleVisionHandler.getKeyFromIds(userId, chatId, threadId ? String(threadId) : null);
            await VehicleVisionHandler.iniciarReintentoTarjeta(bot, key);

            logInfo('Vision: reintento tarjeta', { chatId, userId });
        } catch (error) {
            logError('Error iniciando reintento:', error);
        }
    });

    // Editar campo especifico
    bot.action(/^vision_editar:(.+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);
            const campo = ctx.match[1] as any;

            if (!userId || !chatId) return;

            const key = VehicleVisionHandler.getKeyFromIds(userId, chatId, threadId ? String(threadId) : null);
            await VehicleVisionHandler.iniciarEdicion(bot, key, campo);

            logInfo('Vision: editando campo', { chatId, userId, campo });
        } catch (error) {
            logError('Error editando campo:', error);
        }
    });

    // Volver a confirmacion
    bot.action('vision_volver', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const key = VehicleVisionHandler.getKeyFromIds(userId, chatId, threadId ? String(threadId) : null);
            await VehicleVisionHandler.volverConfirmacion(bot, key);

            logInfo('Vision: volver confirmacion', { chatId, userId });
        } catch (error) {
            logError('Error volviendo:', error);
        }
    });

    // Cambiar a registro manual
    bot.action('vision_manual', async ctx => {
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            const threadIdStr = threadId ? String(threadId) : null;
            VehicleVisionHandler.cancelar(userId, chatId, threadIdStr);
            await VehicleRegistrationHandler.iniciarRegistro(bot, chatId, userId, threadIdStr);

            logInfo('Vision: cambio a manual', { chatId, userId });
        } catch (error) {
            logError('Error cambiando a manual:', error);
        }
    });

    // Cancelar registro
    bot.action('vision_cancelar', async ctx => {
        try {
            await ctx.answerCbQuery();

            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) return;

            VehicleVisionHandler.cancelar(userId, chatId, threadId ? String(threadId) : null);

            await ctx.editMessageText('❌ Registro cancelado.', {
                reply_markup: getMainKeyboard().reply_markup
            });

            logInfo('Vision: cancelado', { chatId, userId });
        } catch (error) {
            logError('Error cancelando:', error);
        }
    });
}

/**
 * Procesa fotos para flujo Vision
 */
export async function procesarFotoVision(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId = typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdStr = threadId ? String(threadId) : null;
    const userIdNum = parseInt(userId);

    if (!VehicleVisionHandler.tieneRegistro(userIdNum, chatId, threadIdStr)) {
        return false;
    }

    const registro = VehicleVisionHandler.getRegistro(userIdNum, chatId, threadIdStr);
    // Aceptar fotos en ESPERANDO_FOTOS o REINTENTANDO_TARJETA
    if (registro?.estado !== ESTADOS.ESPERANDO_FOTOS &&
        registro?.estado !== ESTADOS.REINTENTANDO_TARJETA) {
        return false;
    }

    const photo = message.photo;
    if (!photo?.length) return false;

    const mejorFoto = photo[photo.length - 1];
    return await VehicleVisionHandler.procesarFoto(
        bot, chatId, userIdNum, threadIdStr, mejorFoto.file_id
    );
}

/**
 * Procesa texto para flujo Vision (edicion de campos)
 */
export async function procesarTextoVision(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId = typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdStr = threadId ? String(threadId) : null;
    const userIdNum = parseInt(userId);
    const texto = message.text?.trim();

    if (!texto) return false;

    if (!VehicleVisionHandler.tieneRegistro(userIdNum, chatId, threadIdStr)) {
        return false;
    }

    const registro = VehicleVisionHandler.getRegistro(userIdNum, chatId, threadIdStr);
    if (registro?.estado !== ESTADOS.CORRIGIENDO) {
        return false;
    }

    return await VehicleVisionHandler.procesarTexto(
        bot, chatId, userIdNum, threadIdStr, texto
    );
}
