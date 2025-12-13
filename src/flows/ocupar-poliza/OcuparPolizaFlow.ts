/**
 * OcuparPolizaFlow - Orquestador del flujo de Ocupar Póliza
 *
 * Este archivo coordina los diferentes pasos del flujo:
 * 1. PhoneStep - Manejo de teléfono
 * 2. LocationStep - Origen y destino
 * 3. ServiceRegistrationStep - Registro de servicios
 *
 * Arquitectura: Patrón Coordinator/Orchestrator
 * Estados: Centralizados en UnifiedStateManager (Redis)
 */

import { Context, Markup } from 'telegraf';
import { BaseCommand, IBaseHandler } from '../../comandos/comandos/BaseCommand';
import logger from '../../utils/logger';
import { getPolicyByNumber } from '../../controllers/policyController';
import StateKeyManager, { IThreadSafeStateMap } from '../../utils/StateKeyManager';
import { getUnifiedStateManagerSync, IUnifiedStateManager } from '../../state/UnifiedStateManager';
import { STATE_TYPES } from '../../comandos/commandHandler';
import type { IPolicy } from '../../types/database';
import type { IPolicyCacheData, IScheduledServiceInfo } from './types';

// Steps
import PhoneStep from './steps/PhoneStep';
import LocationStep from './steps/LocationStep';
import ServiceRegistrationStep from './steps/ServiceRegistrationStep';

// Estados específicos del flujo OcuparPoliza
export const FLOW_STATE_TYPES = {
    POLIZA_CACHE: 'flow:ocuparPoliza:cache',
    PENDING_LEYENDAS: 'flow:ocuparPoliza:leyendas',
    MESSAGE_IDS: 'flow:ocuparPoliza:messageIds',
    AWAITING_CONTACT_TIME: 'awaitingContactTime',
    SCHEDULED_SERVICE_INFO: 'flow:ocuparPoliza:scheduledService'
} as const;

// Handler interface - ahora usa métodos async
interface IFlowHandler extends IBaseHandler {
    // Métodos async para gestión de estados
    setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | string | null
    ): Promise<void>;
    getAwaitingState<T>(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<T | null>;
    hasAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<boolean>;
    deleteAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<void>;

    processingCallbacks?: Set<string>;
    viewFilesCallbacks?: any;
    clearChatState(chatId: number, threadId?: string | null): Promise<void>;
}

class OcuparPolizaFlow extends BaseCommand {
    // State maps - locales para compatibilidad con Steps síncronos
    private polizaCache: IThreadSafeStateMap<IPolicyCacheData>;
    private pendingLeyendas: IThreadSafeStateMap<string>;
    private messageIds: IThreadSafeStateMap<number>;
    public awaitingContactTime: IThreadSafeStateMap<string>;
    public scheduledServiceInfo: IThreadSafeStateMap<IScheduledServiceInfo>;

    // State maps para Steps (creados localmente, limpieza vía Redis)
    private awaitingPhoneNumber: IThreadSafeStateMap<string>;
    private awaitingOrigen: IThreadSafeStateMap<string>;
    private awaitingDestino: IThreadSafeStateMap<string>;
    private awaitingServiceData: IThreadSafeStateMap<string>;

    // Steps
    private phoneStep: PhoneStep;
    private locationStep: LocationStep;
    private serviceStep: ServiceRegistrationStep;

    constructor(handler: IFlowHandler) {
        super(handler);

        // Inicializar state maps (locales para compatibilidad con Steps síncronos)
        this.polizaCache = StateKeyManager.createThreadSafeStateMap<IPolicyCacheData>();
        this.pendingLeyendas = StateKeyManager.createThreadSafeStateMap<string>();
        this.messageIds = StateKeyManager.createThreadSafeStateMap<number>();
        this.awaitingContactTime = StateKeyManager.createThreadSafeStateMap<string>();
        this.scheduledServiceInfo =
            StateKeyManager.createThreadSafeStateMap<IScheduledServiceInfo>();

        // State maps para Steps - creados localmente
        this.awaitingPhoneNumber = StateKeyManager.createThreadSafeStateMap<string>();
        this.awaitingOrigen = StateKeyManager.createThreadSafeStateMap<string>();
        this.awaitingDestino = StateKeyManager.createThreadSafeStateMap<string>();
        this.awaitingServiceData = StateKeyManager.createThreadSafeStateMap<string>();

        // Inicializar steps con sus dependencias (usando state maps locales + handler para Redis)
        this.phoneStep = new PhoneStep({
            bot: this.bot,
            handler: handler,
            awaitingPhoneNumber: this.awaitingPhoneNumber,
            awaitingOrigen: this.awaitingOrigen,
            polizaCache: this.polizaCache
        });

        this.locationStep = new LocationStep({
            handler: handler,
            awaitingOrigen: this.awaitingOrigen,
            awaitingDestino: this.awaitingDestino,
            polizaCache: this.polizaCache,
            pendingLeyendas: this.pendingLeyendas
        });

        this.serviceStep = new ServiceRegistrationStep({
            bot: this.bot,
            handler: handler,
            awaitingServiceData: this.awaitingServiceData,
            awaitingContactTime: this.awaitingContactTime,
            scheduledServiceInfo: this.scheduledServiceInfo,
            processingCallbacks: handler.processingCallbacks,
            cleanupAllStates: this.cleanupAllStates.bind(this)
        });
    }

    getCommandName(): string {
        return 'ocuparPoliza';
    }

    getDescription(): string {
        return 'Flujo para ocupar una póliza (asignar teléfono y origen-destino)';
    }

    /**
     * Registra todos los callbacks del flujo
     */
    register(): void {
        // Callback principal de ocupar póliza
        this.bot.action(/ocuparPoliza:(.+)/, async (ctx: Context) => {
            const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
            await this.handleOcuparPoliza(ctx, numeroPoliza);
        });

        // Registrar callbacks de cada step
        this.phoneStep.registerCallbacks();
        this.serviceStep.registerCallbacks();

        logger.info('OcuparPolizaFlow: Todos los callbacks registrados');
    }

    /**
     * Punto de entrada principal del flujo
     */
    public async handleOcuparPoliza(ctx: Context, numeroPoliza: string): Promise<void> {
        try {
            const chatId = ctx.chat!.id;
            const threadId = StateKeyManager.getThreadId(ctx);

            logger.info(`[OcuparPoliza] Iniciando flujo para póliza ${numeroPoliza}`, {
                chatId,
                threadId
            });

            const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            if (!policy) {
                await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                return;
            }

            // 1. Mostrar fotos y PDFs
            await this.showPolicyFiles(ctx, policy);

            // 2. Guardar en caché
            this.polizaCache.set(chatId, { numeroPoliza, policy }, threadId);

            // 3. Mostrar opciones de teléfono
            await this.showPhoneOptions(ctx, policy, numeroPoliza, chatId, threadId);
        } catch (error) {
            logger.error('Error en handleOcuparPoliza:', error);
            await ctx.reply('❌ Error al procesar ocupación de póliza.');
        } finally {
            try {
                await ctx.answerCbQuery();
            } catch {}
        }
    }

    /**
     * Muestra fotos y PDFs de la póliza
     */
    private async showPolicyFiles(ctx: Context, policy: IPolicy): Promise<void> {
        const viewFiles = (this.handler as IFlowHandler).viewFilesCallbacks;
        if (viewFiles) {
            await viewFiles.showPhotos(ctx, policy);
            await viewFiles.showPDFs(ctx, policy);
        }
    }

    /**
     * Muestra las opciones de teléfono
     */
    private async showPhoneOptions(
        ctx: Context,
        policy: IPolicy,
        numeroPoliza: string,
        chatId: number,
        threadId: string | number | null
    ): Promise<void> {
        const handler = this.handler as IFlowHandler;

        if (policy.telefono) {
            await ctx.reply(
                `📱 ${policy.telefono}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 CAMBIAR', `changePhone:${numeroPoliza}`)],
                    [Markup.button.callback('✅ MANTENER', `keepPhone:${numeroPoliza}`)]
                ])
            );

            logger.info(`Opciones de teléfono mostradas para ${numeroPoliza}`);
        } else {
            // Usar método async del handler para establecer estado
            await handler.setAwaitingState(
                chatId,
                STATE_TYPES.AWAITING_PHONE_NUMBER,
                numeroPoliza,
                threadId
            );

            await ctx.reply(`📱 Ingresa el *número telefónico* (10 dígitos):`, {
                parse_mode: 'Markdown'
            });
        }
    }

    // ==================== Métodos delegados a los Steps ====================

    /**
     * Delega el manejo del teléfono al PhoneStep
     */
    async handlePhoneNumber(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        return this.phoneStep.handlePhoneNumber(ctx, messageText, threadId);
    }

    /**
     * Delega el manejo del origen al LocationStep
     */
    async handleOrigen(ctx: Context, input: any, threadId: string | null = null): Promise<boolean> {
        return this.locationStep.handleOrigen(ctx, input, threadId);
    }

    /**
     * Delega el manejo del destino al LocationStep
     */
    async handleDestino(
        ctx: Context,
        input: any,
        threadId: string | null = null
    ): Promise<boolean> {
        return this.locationStep.handleDestino(ctx, input, threadId);
    }

    /**
     * Delega el manejo de hora de contacto al ServiceStep
     */
    async handleContactTime(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        return this.serviceStep.handleContactTime(ctx, messageText, threadId);
    }

    // ==================== Limpieza de Estados ====================

    /**
     * Limpia todos los estados del flujo (async)
     * Usa UnifiedStateManager para estados en Redis
     */
    public async cleanupAllStates(
        chatId: number,
        threadId: string | number | null = null
    ): Promise<void> {
        const handler = this.handler as IFlowHandler;
        const numericThreadId = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;

        // Limpiar estados locales (Maps internos para compatibilidad con Steps)
        if (threadId) {
            this.pendingLeyendas.delete(chatId, threadId);
            this.polizaCache.delete(chatId, threadId);
            this.messageIds.delete(chatId, threadId);
            this.awaitingContactTime.delete(chatId, threadId);
            this.scheduledServiceInfo.delete(chatId, threadId);
            // State maps para Steps
            this.awaitingPhoneNumber.delete(chatId, threadId);
            this.awaitingOrigen.delete(chatId, threadId);
            this.awaitingDestino.delete(chatId, threadId);
            this.awaitingServiceData.delete(chatId, threadId);
        } else {
            this.pendingLeyendas.deleteAll(chatId);
            this.polizaCache.deleteAll(chatId);
            this.messageIds.deleteAll(chatId);
            this.awaitingContactTime.deleteAll(chatId);
            this.scheduledServiceInfo.deleteAll(chatId);
            // State maps para Steps
            this.awaitingPhoneNumber.deleteAll(chatId);
            this.awaitingOrigen.deleteAll(chatId);
            this.awaitingDestino.deleteAll(chatId);
            this.awaitingServiceData.deleteAll(chatId);
        }

        // Limpiar estados del handler via async methods (Redis)
        await Promise.all([
            handler.deleteAwaitingState(chatId, STATE_TYPES.AWAITING_PHONE_NUMBER, numericThreadId),
            // AWAITING_ORIGEN_DESTINO eliminado - era código muerto
            handler.deleteAwaitingState(chatId, STATE_TYPES.AWAITING_ORIGEN, numericThreadId),
            handler.deleteAwaitingState(chatId, STATE_TYPES.AWAITING_DESTINO, numericThreadId),
            handler.deleteAwaitingState(chatId, STATE_TYPES.AWAITING_SERVICE_DATA, numericThreadId),
            handler.deleteAwaitingState(
                chatId,
                FLOW_STATE_TYPES.AWAITING_CONTACT_TIME,
                numericThreadId
            )
        ]);

        // Limpiar en CommandHandler (limpia todos los estados del chat en Redis)
        if (handler.clearChatState) {
            await handler.clearChatState(chatId, threadId?.toString() ?? null);
        }

        logger.info('Estados del flujo limpiados', { chatId, threadId });
    }
}

export default OcuparPolizaFlow;
