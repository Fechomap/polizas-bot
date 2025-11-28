// src/comandos/comandos/PolicyAssignmentCallbacks.ts
// Callbacks para el flujo de asignación de pólizas (OCR y legacy)

import { PolicyOCRHandler, ESTADOS_OCR } from './PolicyOCRHandler';
import { PolicyAssignmentHandler, asignacionesEnProceso } from './PolicyAssignmentHandler';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import type { Telegraf } from 'telegraf';
import type { NavigationContext } from './BaseCommand';

interface RegistryWithStateManager {
    stateManager?: {
        clearUserState(userId: string, flowType: string): Promise<void>;
    };
}

/**
 * Registra callbacks para el flujo de asignación de pólizas
 */
export function registerPolicyAssignmentCallbacks(
    bot: Telegraf<NavigationContext>,
    logInfo: (msg: string, data?: any) => void,
    logError: (msg: string, error?: any) => void,
    registry?: RegistryWithStateManager
): void {
    // Cancelar asignación de póliza
    bot.action('poliza_cancelar', async ctx => {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                return;
            }

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            // Limpiar asignación OCR
            PolicyOCRHandler.cancelarAsignacion(userIdStr, chatId, threadIdNum);

            // Limpiar asignación legacy
            if (asignacionesEnProceso) {
                const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
                asignacionesEnProceso.delete(stateKey);
            }

            await ctx.editMessageText('❌ Asignación de póliza cancelada.', {
                reply_markup: getMainKeyboard().reply_markup
            });

            logInfo('Asignación de póliza cancelada', { userId });
        } catch (error: any) {
            logError('Error cancelando asignación de póliza:', error);
            await ctx.reply('❌ Error al cancelar.');
        }
    });

    // Handler para selección de vehículo a asegurar
    bot.action(/^asignar_(.+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();
            const vehiculoId = ctx.match?.[1];
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!vehiculoId || !userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el vehículo.');
                return;
            }

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await ctx.deleteMessage();

            await PolicyOCRHandler.iniciarAsignacionConOpciones(
                bot as any,
                chatId,
                userIdStr,
                vehiculoId,
                threadIdNum
            );

            logInfo('Vehículo seleccionado para asegurar', { userId, vehiculoId });
        } catch (error: any) {
            logError('Error seleccionando vehículo:', error);
            await ctx.reply('❌ Error al seleccionar vehículo.');
        }
    });

    // Handler para paginación de vehículos
    bot.action(/^vehiculos_pag_(\d+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();
            const pagina = parseInt(ctx.match?.[1] ?? '1');
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!userId || !chatId) {
                await ctx.reply('❌ Error: No se pudo identificar el usuario.');
                return;
            }

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await ctx.deleteMessage();

            await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                bot as any,
                chatId,
                userIdStr,
                threadIdNum,
                pagina
            );

            logInfo('Navegación de vehículos', { userId, pagina });
        } catch (error: any) {
            logError('Error en paginación de vehículos:', error);
            await ctx.reply('❌ Error al navegar.');
        }
    });

    // Handler para selección de método OCR (PDF)
    bot.action(/^ocr_metodo_pdf_(.+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();
            const vehiculoId = ctx.match?.[1];
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!vehiculoId || !userId || !chatId) {
                await ctx.reply('❌ Error: Datos incompletos.');
                return;
            }

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await ctx.deleteMessage();

            await PolicyOCRHandler.seleccionarMetodoOCR(
                bot as any,
                chatId,
                userIdStr,
                vehiculoId,
                threadIdNum
            );

            logInfo('Método OCR seleccionado', { userId, vehiculoId });
        } catch (error: any) {
            logError('Error seleccionando método OCR:', error);
            await ctx.reply('❌ Error al seleccionar método.');
        }
    });

    // Handler para selección de método manual
    bot.action(/^ocr_metodo_manual_(.+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();
            const vehiculoId = ctx.match?.[1];
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!vehiculoId || !userId || !chatId) {
                await ctx.reply('❌ Error: Datos incompletos.');
                return;
            }

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await ctx.deleteMessage();

            await PolicyOCRHandler.seleccionarMetodoManual(
                bot as any,
                chatId,
                userIdStr,
                vehiculoId,
                threadIdNum
            );

            logInfo('Método manual seleccionado', { userId, vehiculoId });
        } catch (error: any) {
            logError('Error seleccionando método manual:', error);
            await ctx.reply('❌ Error al seleccionar método.');
        }
    });

    // Handler para selección de fecha OCR
    bot.action(/^ocr_fecha_(.+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();
            const fechaISO = ctx.match?.[1];
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!fechaISO || !userId || !chatId) {
                await ctx.reply('❌ Error: Datos incompletos.');
                return;
            }

            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdStr = String(userId);

            await ctx.deleteMessage();

            await PolicyOCRHandler.procesarFechaCallback(
                bot as any,
                chatId,
                userIdStr,
                fechaISO,
                threadIdNum
            );

            logInfo('Fecha OCR seleccionada', { userId, fechaISO });
        } catch (error: any) {
            logError('Error seleccionando fecha OCR:', error);
            await ctx.reply('❌ Error al seleccionar fecha.');
        }
    });

    // Handler para selección de fecha de emisión (flujo legacy)
    bot.action(/^fecha_emision_(.+)$/, async ctx => {
        try {
            await ctx.answerCbQuery();

            const fechaISO = ctx.match?.[1];
            const userId = ctx.from?.id;
            const chatId = ctx.chat?.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            if (!fechaISO || !userId || !chatId) {
                await ctx.reply('❌ Error: Datos incompletos para la fecha.');
                return;
            }

            // Verificar asignación en proceso
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
            const asignacion = asignacionesEnProceso?.get(stateKey);

            if (!asignacion) {
                await ctx.reply('❌ No hay asignación de póliza en proceso.');
                return;
            }

            await ctx.deleteMessage();

            await PolicyAssignmentHandler.confirmarFechaEmision(
                bot,
                chatId,
                fechaISO,
                asignacion,
                stateKey
            );

            logInfo('Fecha de emisión seleccionada', { userId, chatId, fechaISO });
        } catch (error: any) {
            logError('Error procesando fecha de emisión:', error);
            await ctx.reply('❌ Error al procesar la fecha.');
        }
    });
}

/**
 * Procesa mensajes de texto para flujo OCR de pólizas
 */
export async function procesarTextoOCRPoliza(
    bot: Telegraf<any>,
    message: any,
    userId: string,
    registry?: RegistryWithStateManager
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdNum = typeof threadId === 'number' ? threadId : null;

    if (PolicyOCRHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
        const procesado = await PolicyOCRHandler.procesarRespuestaTexto(bot, message, userId);

        // Limpiar estado si el proceso terminó
        if (procesado && !PolicyOCRHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
            if (registry?.stateManager) {
                await registry.stateManager.clearUserState(userId, 'bd_autos_flow');
            }
        }

        return procesado;
    }

    return false;
}

/**
 * Procesa mensajes para flujo legacy de asignación
 */
export async function procesarMensajeAsignacionLegacy(
    bot: Telegraf<any>,
    message: any,
    userId: string,
    registry?: RegistryWithStateManager
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdNum = typeof threadId === 'number' ? threadId : null;

    if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
        const procesado = await PolicyAssignmentHandler.procesarMensaje(bot, message, userId);

        // Limpiar estado si el proceso terminó
        if (
            procesado &&
            !PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)
        ) {
            if (registry?.stateManager) {
                await registry.stateManager.clearUserState(userId, 'bd_autos_flow');
            }
        }

        return procesado;
    }

    return false;
}

/**
 * Procesa documentos para flujo OCR de pólizas
 */
export async function procesarDocumentoOCRPoliza(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdNum = typeof threadId === 'number' ? threadId : null;

    if (PolicyOCRHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
        const asignacion = PolicyOCRHandler.obtenerAsignacion(userId, chatId, threadIdNum);

        // Si estamos esperando PDF para OCR
        if (asignacion?.estado === ESTADOS_OCR.ESPERANDO_PDF_OCR) {
            return await PolicyOCRHandler.procesarArchivoOCR(bot, message, userId);
        }

        // Si estamos esperando PDF final
        if (asignacion?.estado === ESTADOS_OCR.ESPERANDO_PDF_FINAL) {
            return await PolicyOCRHandler.procesarPDFFinal(bot, message, userId);
        }
    }

    return false;
}

/**
 * Procesa documentos para flujo legacy de asignación
 */
export async function procesarDocumentoAsignacionLegacy(
    bot: Telegraf<any>,
    message: any,
    userId: string
): Promise<boolean> {
    const chatId =
        typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
    const threadId = message.message_thread_id ?? null;
    const threadIdNum = typeof threadId === 'number' ? threadId : null;

    if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
        return await PolicyAssignmentHandler.procesarMensaje(bot, message, userId);
    }

    return false;
}
