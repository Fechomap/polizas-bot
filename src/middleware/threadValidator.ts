// src/middleware/threadValidator.ts
import logger from '../utils/logger';
import StateKeyManager from '../utils/StateKeyManager';
import flowStateManager from '../utils/FlowStateManager';
import type { Context } from 'telegraf';

interface CommandHandler {
    [key: string]: any;
    awaitingGetPolicyNumber?: Map<number, any>;
    awaitingSaveData?: Map<number, any>;
    awaitingUploadPolicyNumber?: Map<number, any>;
    awaitingDeletePolicyNumber?: Map<number, any>;
    awaitingPaymentPolicyNumber?: Map<number, any>;
    awaitingPaymentData?: Map<number, any>;
    awaitingServicePolicyNumber?: Map<number, any>;
    awaitingServiceData?: Map<number, any>;
    awaitingPhoneNumber?: Map<number, any>;
    awaitingOrigenDestino?: Map<number, any>;
    awaitingDeleteReason?: Map<number, any>;
}

/**
 * Middleware para validar y controlar flujos en hilos
 * Garantiza que un mensaje de un hilo no interfiera con el flujo de otro hilo
 */
const threadValidatorMiddleware =
    (commandHandler: CommandHandler) =>
    async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        try {
            const chatId = ctx.chat?.id;
            if (!chatId) return next(); // Si no hay chat, seguir

            // Extraer el threadId del contexto
            const threadId = StateKeyManager.getThreadId(ctx);

            // Si es un comando, siempre permitir
            if ((ctx.message as any)?.text?.startsWith('/')) {
                logger.debug('Permitiendo comando', {
                    chatId,
                    threadId,
                    text: (ctx.message as any).text
                });
                return next();
            }

            // Si es un callback query, siempre permitir para evitar problemas con botones
            if (ctx.callbackQuery) {
                logger.debug('Permitiendo callback query', {
                    chatId,
                    threadId,
                    data: (ctx.callbackQuery as any).data
                });
                return next();
            }

            // Verificar si hay flujos activos en otros hilos para este chat
            const activeFlows = flowStateManager.getActiveFlows(chatId);

            // Si hay flujos activos en otros hilos y este mensaje no tiene threadId
            // o proviene de un hilo diferente, potencialmente es un conflicto
            if (activeFlows.length > 0) {
                // Verificar si algún flujo activo pertenece a un hilo diferente al actual
                const conflictingFlows = activeFlows.filter(flow => {
                    // Si el flujo tiene un threadId diferente al mensaje actual
                    return flow.threadId && flow.threadId !== threadId;
                });

                if (conflictingFlows.length > 0) {
                    logger.warn('Detectado posible conflicto de hilos', {
                        messageThreadId: threadId,
                        activeFlows: conflictingFlows.map(f => f.threadId)
                    });

                    // Verificar mapas de espera
                    let isInWrongThread = false;

                    // Lista de verificación (solo en CommandHandler)
                    const stateMapNames: (keyof CommandHandler)[] = [
                        'awaitingGetPolicyNumber',
                        'awaitingSaveData',
                        'awaitingUploadPolicyNumber',
                        'awaitingDeletePolicyNumber',
                        'awaitingPaymentPolicyNumber',
                        'awaitingPaymentData',
                        'awaitingServicePolicyNumber',
                        'awaitingServiceData',
                        'awaitingPhoneNumber',
                        'awaitingOrigenDestino',
                        'awaitingDeleteReason'
                    ];

                    // Verificar si algún estado en CommandHandler está activo para este chat
                    for (const mapName of stateMapNames) {
                        const stateMap = commandHandler[mapName];
                        if (stateMap?.has?.(chatId)) {
                            // Encontramos un estado activo sin hilo, pero hay hilos activos
                            isInWrongThread = true;
                            logger.warn(
                                `Estado ${String(mapName)} activo sin threadId pero hay hilos activos`,
                                {
                                    chatId,
                                    messageThreadId: threadId,
                                    conflictingThreads: conflictingFlows
                                        .map(f => f.threadId)
                                        .join(',')
                                }
                            );
                            break;
                        }
                    }

                    if (isInWrongThread) {
                        // No procesamos el mensaje y notificamos al usuario
                        logger.info('Bloqueando mensaje de hilo incorrecto', {
                            chatId,
                            messageThreadId: threadId
                        });

                        // Solo enviar advertencia, no bloquear (opcional)
                        await ctx.reply(
                            '⚠️ Hay una operación activa en otro hilo. ' +
                                'Por favor, continúa en el hilo correcto o finaliza ' +
                                'la operación actual antes de iniciar una nueva.'
                        );
                        return; // No llama a next(), bloqueando el procesamiento
                    }
                }
            }

            // Si llegamos aquí, no hay conflictos o no pudimos detectarlos
            return next();
        } catch (error: any) {
            logger.error('Error en threadValidatorMiddleware:', error);
            return next(); // En caso de error, permitir el mensaje
        }
    };

export default threadValidatorMiddleware;
