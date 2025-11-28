/**
 * OcuparPolizaFlow - Orquestador del flujo de Ocupar Póliza
 *
 * Este archivo coordina los diferentes pasos del flujo:
 * 1. PhoneStep - Manejo de teléfono
 * 2. LocationStep - Origen y destino
 * 3. ServiceRegistrationStep - Registro de servicios
 *
 * Arquitectura: Patrón Coordinator/Orchestrator
 */

import { Context, Markup } from 'telegraf';
import { BaseCommand, IBaseHandler } from '../../comandos/comandos/BaseCommand';
import logger from '../../utils/logger';
import { getPolicyByNumber } from '../../controllers/policyController';
import StateKeyManager from '../../utils/StateKeyManager';
import flowStateManager from '../../utils/FlowStateManager';
import type { IPolicy } from '../../types/database';
import type { IThreadSafeStateMap } from '../../utils/StateKeyManager';
import type { IPolicyCacheData, IScheduledServiceInfo } from './types';

// Steps
import PhoneStep from './steps/PhoneStep';
import LocationStep from './steps/LocationStep';
import ServiceRegistrationStep from './steps/ServiceRegistrationStep';

// Handler interface
interface IFlowHandler extends IBaseHandler {
    awaitingPhoneNumber: IThreadSafeStateMap<string>;
    awaitingOrigenDestino: IThreadSafeStateMap<string>;
    awaitingOrigen: IThreadSafeStateMap<string>;
    awaitingDestino: IThreadSafeStateMap<string>;
    awaitingServiceData: IThreadSafeStateMap<string>;
    processingCallbacks?: Set<string>;
    viewFilesCallbacks?: any;
    clearChatState(chatId: number, threadId?: string | null): void;
}

class OcuparPolizaFlow extends BaseCommand {
    // State maps
    private polizaCache: IThreadSafeStateMap<IPolicyCacheData>;
    private pendingLeyendas: IThreadSafeStateMap<string>;
    private messageIds: IThreadSafeStateMap<number>;
    public awaitingContactTime: IThreadSafeStateMap<string>;
    public scheduledServiceInfo: IThreadSafeStateMap<IScheduledServiceInfo>;

    // Steps
    private phoneStep: PhoneStep;
    private locationStep: LocationStep;
    private serviceStep: ServiceRegistrationStep;

    constructor(handler: IFlowHandler) {
        super(handler);

        // Inicializar state maps
        this.polizaCache = StateKeyManager.createThreadSafeStateMap<IPolicyCacheData>();
        this.pendingLeyendas = StateKeyManager.createThreadSafeStateMap<string>();
        this.messageIds = StateKeyManager.createThreadSafeStateMap<number>();
        this.awaitingContactTime = StateKeyManager.createThreadSafeStateMap<string>();
        this.scheduledServiceInfo =
            StateKeyManager.createThreadSafeStateMap<IScheduledServiceInfo>();

        // Inicializar steps con sus dependencias
        this.phoneStep = new PhoneStep({
            bot: this.bot,
            awaitingPhoneNumber: handler.awaitingPhoneNumber,
            awaitingOrigen: handler.awaitingOrigen,
            polizaCache: this.polizaCache
        });

        this.locationStep = new LocationStep({
            awaitingOrigen: handler.awaitingOrigen,
            awaitingDestino: handler.awaitingDestino,
            polizaCache: this.polizaCache,
            pendingLeyendas: this.pendingLeyendas
        });

        this.serviceStep = new ServiceRegistrationStep({
            bot: this.bot,
            awaitingServiceData: handler.awaitingServiceData,
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
            handler.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);

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
     * Limpia todos los estados del flujo
     */
    public cleanupAllStates(chatId: number, threadId: string | null = null): void {
        const handler = this.handler as IFlowHandler;

        if (threadId) {
            // Limpiar estados locales
            this.pendingLeyendas.delete(chatId, threadId);
            this.polizaCache.delete(chatId, threadId);
            this.messageIds.delete(chatId, threadId);
            this.awaitingContactTime.delete(chatId, threadId);
            this.scheduledServiceInfo.delete(chatId, threadId);

            // Limpiar estados del handler
            handler.awaitingPhoneNumber.delete(chatId, threadId);
            handler.awaitingOrigenDestino.delete(chatId, threadId);
            handler.awaitingOrigen.delete(chatId, threadId);
            handler.awaitingDestino.delete(chatId, threadId);

            // Limpiar FlowStateManager
            flowStateManager.clearAllStates(chatId, threadId);

            // Limpiar en CommandHandler
            if (handler.clearChatState) {
                handler.clearChatState(chatId, threadId);
            }
        } else {
            // Limpiar todos los threads
            this.pendingLeyendas.deleteAll(chatId);
            this.polizaCache.deleteAll(chatId);
            this.messageIds.deleteAll(chatId);
            this.awaitingContactTime.deleteAll(chatId);
            this.scheduledServiceInfo.deleteAll(chatId);

            handler.awaitingPhoneNumber.deleteAll(chatId);
            handler.awaitingOrigenDestino.deleteAll(chatId);
            handler.awaitingOrigen.deleteAll(chatId);
            handler.awaitingDestino.deleteAll(chatId);

            flowStateManager.clearAllStates(chatId, null);

            if (handler.clearChatState) {
                handler.clearChatState(chatId, null);
            }
        }

        logger.info('Estados del flujo limpiados', { chatId, threadId });
    }
}

export default OcuparPolizaFlow;
