/**
 * PhoneStep - Manejo de teléfono en el flujo de Ocupar Póliza
 *
 * Responsabilidad: Cambiar o mantener el teléfono de una póliza
 */

import { Context, Markup } from 'telegraf';
import logger from '../../../utils/logger';
import withTelegramRetry from '../../../utils/telegramRetry';
import {
    getPolicyByNumber,
    updatePolicyPhone,
    findPoliciesByPhone
} from '../../../controllers/policyController';
import StateKeyManager from '../../../utils/StateKeyManager';
import { whatsAppService, IPolicyInfo } from '../../../services/whatsapp';
import { getUnifiedStateManagerSync } from '../../../state/UnifiedStateManager';
import type { IPolicy } from '../../../types/database';
import type { IThreadSafeStateMap } from '../../../utils/StateKeyManager';
import type { IPolicyCacheData } from '../types';

// Interface para handler con métodos async de estado
interface IStateHandler {
    setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | string | null
    ): Promise<void>;
    deleteAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<void>;
}

interface IPhoneStepDependencies {
    bot: any;
    handler: IStateHandler;
    awaitingPhoneNumber: IThreadSafeStateMap<string>;
    awaitingOrigen: IThreadSafeStateMap<string>;
    polizaCache: IThreadSafeStateMap<IPolicyCacheData>;
}

class PhoneStep {
    private bot: any;
    private handler: IStateHandler;
    private awaitingPhoneNumber: IThreadSafeStateMap<string>;
    private awaitingOrigen: IThreadSafeStateMap<string>;
    private polizaCache: IThreadSafeStateMap<IPolicyCacheData>;
    private phoneAttempts: IThreadSafeStateMap<number>;

    // Tipos de estado para sincronización con Redis
    private static readonly STATE_TYPES = {
        AWAITING_PHONE_NUMBER: 'awaitingPhoneNumber',
        AWAITING_ORIGEN: 'awaitingOrigen'
    };

    constructor(deps: IPhoneStepDependencies) {
        this.bot = deps.bot;
        this.handler = deps.handler;
        this.awaitingPhoneNumber = deps.awaitingPhoneNumber;
        this.awaitingOrigen = deps.awaitingOrigen;
        this.polizaCache = deps.polizaCache;
        this.phoneAttempts = StateKeyManager.createThreadSafeStateMap<number>();
    }

    /**
     * Registra los callbacks relacionados con el teléfono
     */
    registerCallbacks(): void {
        this.registerKeepPhoneCallback();
        this.registerChangePhoneCallback();
    }

    /**
     * Verifica si la póliza tiene servicio previo con destino válido
     * y guarda las coordenadas en el state para usarlas después
     */
    private async checkAndSavePreviousDestino(
        policy: IPolicy,
        chatId: number,
        threadId: string | number | null
    ): Promise<{ lat: number; lng: number } | null> {
        if (!policy.servicios || policy.servicios.length === 0) {
            return null;
        }

        const ultimoServicio = policy.servicios[policy.servicios.length - 1];

        if (!ultimoServicio.destinoLat || !ultimoServicio.destinoLng) {
            return null;
        }

        const destinoCoords = {
            lat: ultimoServicio.destinoLat,
            lng: ultimoServicio.destinoLng
        };

        // Guardar destino previo en UnifiedStateManager
        const stateManager = getUnifiedStateManagerSync()!;
        const threadIdNum = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
        await stateManager.setFlowState(
            chatId,
            policy.numeroPoliza,
            { destinoCoords, hasPreviousDestino: true },
            threadIdNum
        );

        logger.info('[PhoneStep] Destino previo guardado', {
            numeroPoliza: policy.numeroPoliza,
            destinoLat: destinoCoords.lat,
            destinoLng: destinoCoords.lng
        });

        return destinoCoords;
    }

    /**
     * Callback para mantener el teléfono existente
     */
    private registerKeepPhoneCallback(): void {
        this.bot.action(/keepPhone:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // Remover botones del mensaje original
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('[keepPhone] Botones removidos');
                } catch (editError) {
                    logger.info('[keepPhone] No se pudo editar mensaje original');
                }

                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
                if (!policy) {
                    await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                    return;
                }

                // Limpiar estado de espera de teléfono (local + Redis)
                this.awaitingPhoneNumber.delete(chatId, threadId);
                await this.handler.deleteAwaitingState(
                    chatId,
                    PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                    threadId
                );

                // Verificar si tiene destino previo
                const previousDestino = await this.checkAndSavePreviousDestino(
                    policy,
                    chatId,
                    threadId
                );

                // Establecer estado de espera de origen (local + Redis)
                this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
                await this.handler.setAwaitingState(
                    chatId,
                    PhoneStep.STATE_TYPES.AWAITING_ORIGEN,
                    numeroPoliza,
                    threadId
                );

                logger.info('[keepPhone] Estado actualizado', {
                    chatId,
                    threadId,
                    numeroPoliza,
                    hasPreviousDestino: !!previousDestino
                });

                // Generar URL de WhatsApp
                const whatsappData = this.generateWhatsAppData(policy);
                const whatsappButton = whatsAppService.generateTelegramButton(whatsappData);

                // Mensaje diferente si hay destino previo
                let mensaje = '📍indica *ORIGEN*';
                if (previousDestino) {
                    mensaje =
                        '📍indica *ORIGEN*\n\n' +
                        `_Destino del servicio anterior será usado automáticamente_`;
                }

                await withTelegramRetry(
                    () =>
                        ctx.reply(mensaje, {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.url(whatsappButton.text, whatsappButton.url)]
                            ])
                        }),
                    `keepPhone - póliza ${numeroPoliza}`
                );
            } catch (error) {
                logger.error('Error en callback keepPhone:', error);
                await withTelegramRetry(
                    () => ctx.reply('❌ Error al procesar la acción.'),
                    'keepPhone - error reply'
                );
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    /**
     * Callback para cambiar el teléfono
     */
    private registerChangePhoneCallback(): void {
        this.bot.action(/changePhone:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // Remover botones del mensaje original
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                } catch (editError) {
                    logger.info('[changePhone] No se pudo editar mensaje original');
                }

                logger.info(`[changePhone] Iniciando cambio para póliza ${numeroPoliza}`);

                // Establecer estado de espera de nuevo teléfono (local + Redis)
                this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                await this.handler.setAwaitingState(
                    chatId,
                    PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                    numeroPoliza,
                    threadId
                );

                await ctx.reply(`📱 Ingresa el *número telefónico* (10 dígitos):`, {
                    parse_mode: 'Markdown'
                });

                logger.info(`[changePhone] Esperando nuevo teléfono para ${numeroPoliza}`);
            } catch (error) {
                logger.error('Error en callback changePhone:', error);
                await ctx.reply('❌ Error al procesar el cambio de teléfono.');
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    /**
     * Maneja el ingreso de un nuevo número de teléfono
     */
    async handlePhoneNumber(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingPhoneNumber.get(chatId, threadId);

        // Validar formato del teléfono
        const regexTel = /^\d{10}$/;
        if (!regexTel.test(messageText)) {
            const attempts = (this.phoneAttempts.get(chatId, threadId) ?? 0) + 1;
            this.phoneAttempts.set(chatId, attempts, threadId);

            if (attempts >= 2) {
                // Segundo intento fallido - cancelar (local + Redis)
                this.awaitingPhoneNumber.delete(chatId, threadId);
                await this.handler.deleteAwaitingState(
                    chatId,
                    PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                    threadId
                );
                this.phoneAttempts.delete(chatId, threadId);
                await ctx.reply('❌ Teléfono inválido. Proceso cancelado.');
                return true;
            }

            // Primer intento fallido - dar otra oportunidad
            await ctx.reply('❌ Teléfono inválido (10 dígitos). Intenta de nuevo:');
            return true;
        }

        // Teléfono válido - limpiar contador de intentos
        this.phoneAttempts.delete(chatId, threadId);

        try {
            let policy: IPolicy;
            const cachedData = this.polizaCache.get(chatId, threadId);

            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
            } else {
                if (!numeroPoliza) {
                    logger.error('Número de póliza no encontrado en handlePhoneNumber');
                    this.awaitingPhoneNumber.delete(chatId, threadId);
                    await this.handler.deleteAwaitingState(
                        chatId,
                        PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                        threadId
                    );
                    await ctx.reply(
                        '❌ Error: Número de póliza no encontrado. Operación cancelada.'
                    );
                    return true;
                }
                policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            }

            if (!policy) {
                logger.error(`Póliza no encontrada: ${numeroPoliza}`);
                this.awaitingPhoneNumber.delete(chatId, threadId);
                await this.handler.deleteAwaitingState(
                    chatId,
                    PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                    threadId
                );
                await ctx.reply(
                    `❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`
                );
                return true;
            }

            // VALIDACIÓN INFORMATIVA: Verificar si el teléfono ya está en uso
            const polizasConMismoTelefono = await findPoliciesByPhone(
                messageText,
                policy.numeroPoliza
            );

            if (polizasConMismoTelefono.length > 0) {
                const polizasInfo = polizasConMismoTelefono
                    .map(p => `• *${p.numeroPoliza}* - ${p.titular ?? 'Sin titular'}`)
                    .join('\n');

                await ctx.reply(`⚠️ *Teléfono en uso:*\n${polizasInfo}`, {
                    parse_mode: 'Markdown'
                });

                logger.warn(`Teléfono ${messageText} duplicado`, {
                    nuevaPoliza: policy.numeroPoliza,
                    existentes: polizasConMismoTelefono.map(p => p.numeroPoliza)
                });
            }

            // Actualizar teléfono en la BD (continúa aunque esté duplicado)
            const updatedPolicy = await updatePolicyPhone(policy.numeroPoliza, messageText);
            if (!updatedPolicy) {
                throw new Error('No se pudo actualizar el teléfono en la base de datos');
            }
            policy = updatedPolicy;

            // Actualizar caché
            if (cachedData) {
                cachedData.policy = policy;
                this.polizaCache.set(chatId, cachedData, threadId);
            }

            // Limpiar estado de teléfono y establecer estado de origen (local + Redis)
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await this.handler.deleteAwaitingState(
                chatId,
                PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                threadId
            );

            // Verificar si tiene destino previo
            const previousDestino = await this.checkAndSavePreviousDestino(
                policy,
                chatId,
                threadId
            );

            this.awaitingOrigen.set(chatId, numeroPoliza ?? '', threadId);
            await this.handler.setAwaitingState(
                chatId,
                PhoneStep.STATE_TYPES.AWAITING_ORIGEN,
                numeroPoliza ?? '',
                threadId
            );

            logger.info(`Teléfono actualizado para póliza ${numeroPoliza}: ${messageText}`, {
                hasPreviousDestino: !!previousDestino
            });

            // Obtener último servicio
            const ultimoServicio =
                policy.servicios && policy.servicios.length > 0
                    ? policy.servicios[policy.servicios.length - 1]
                    : null;

            // Obtener origen/destino del último servicio
            let origenDestinoUltimo = '';
            if (ultimoServicio?.origenDestino) {
                origenDestinoUltimo = ultimoServicio.origenDestino;
            } else if (policy.registros && policy.registros.length > 0) {
                const ultimoRegistro = policy.registros[policy.registros.length - 1];
                if (ultimoRegistro?.origenDestino) {
                    origenDestinoUltimo = ultimoRegistro.origenDestino;
                }
            }

            // Generar URL de WhatsApp con el nuevo teléfono y toda la info
            const policyInfo: IPolicyInfo = {
                numeroPoliza: policy.numeroPoliza,
                titular: policy.titular,
                telefono: messageText,
                marca: policy.marca,
                submarca: policy.submarca,
                año: String(policy.año ?? ''),
                color: policy.color,
                serie: policy.serie,
                placas: policy.placas,
                aseguradora: policy.aseguradora,
                agenteCotizador: policy.agenteCotizador,
                totalServicios: policy.totalServicios ?? 0,
                ultimoServicio: ultimoServicio?.fechaServicio ?? undefined,
                origenDestinoUltimo,
                totalPagos: policy.pagos?.filter((p: any) => p.estado === 'REALIZADO').length ?? 0
            };

            const whatsappData = whatsAppService.generatePolicyWhatsApp(policyInfo);
            const whatsappButton = whatsAppService.generateTelegramButton(whatsappData);

            // Mensaje diferente si hay destino previo
            let mensaje = '📍indica *ORIGEN*';
            if (previousDestino) {
                mensaje =
                    '📍indica *ORIGEN*\n\n' +
                    `_Destino del servicio anterior será usado automáticamente_`;
            }

            await withTelegramRetry(
                () =>
                    ctx.reply(mensaje, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.url(whatsappButton.text, whatsappButton.url)]
                        ])
                    }),
                `PhoneStep.handlePhoneNumber - póliza ${numeroPoliza}`
            );

            return true;
        } catch (error) {
            logger.error(`Error guardando teléfono para póliza ${numeroPoliza}:`, error);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await this.handler.deleteAwaitingState(
                chatId,
                PhoneStep.STATE_TYPES.AWAITING_PHONE_NUMBER,
                threadId
            );
            await withTelegramRetry(
                () => ctx.reply('❌ Error al guardar el teléfono. Operación cancelada.'),
                'PhoneStep.handlePhoneNumber - error reply'
            );
            return true;
        }
    }

    /**
     * Genera datos de WhatsApp para una póliza
     */
    private generateWhatsAppData(policy: IPolicy) {
        // Obtener último servicio
        const ultimoServicio =
            policy.servicios && policy.servicios.length > 0
                ? policy.servicios[policy.servicios.length - 1]
                : null;

        // Obtener origen/destino del último servicio
        let origenDestinoUltimo = '';
        if (ultimoServicio?.origenDestino) {
            origenDestinoUltimo = ultimoServicio.origenDestino;
        } else if (policy.registros && policy.registros.length > 0) {
            const ultimoRegistro = policy.registros[policy.registros.length - 1];
            if (ultimoRegistro?.origenDestino) {
                origenDestinoUltimo = ultimoRegistro.origenDestino;
            }
        }

        const policyInfo: IPolicyInfo = {
            numeroPoliza: policy.numeroPoliza,
            titular: policy.titular,
            telefono: policy.telefono ?? '',
            marca: policy.marca,
            submarca: policy.submarca,
            año: String(policy.año ?? ''),
            color: policy.color,
            serie: policy.serie,
            placas: policy.placas,
            aseguradora: policy.aseguradora,
            agenteCotizador: policy.agenteCotizador,
            totalServicios: policy.totalServicios ?? 0,
            ultimoServicio: ultimoServicio?.fechaServicio ?? undefined,
            origenDestinoUltimo,
            totalPagos: policy.pagos?.filter((p: any) => p.estado === 'REALIZADO').length ?? 0
        };

        return whatsAppService.generatePolicyWhatsApp(policyInfo);
    }
}

export default PhoneStep;
