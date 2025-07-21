import { BaseCommand, NavigationContext, IBaseHandler, ReplyOptions } from './BaseCommand';
import { getPolicyByNumber, markPolicyAsDeleted } from '../../controllers/policyController';
import { Markup } from 'telegraf';
import StateKeyManager from '../../utils/StateKeyManager';
import type { Context } from 'telegraf';
import type { BotContext } from '../../../types';

interface ICommand {
    getCommandName(): string;
    procesarMensajeBaseAutos?: (message: any, userId: string) => Promise<boolean>;
    procesarDocumentoBaseAutos?: (message: any, userId: string) => Promise<boolean>;
    handleOrigen?: (ctx: Context, message: any, threadId: number | string | null) => Promise<void>;
    handleDestino?: (ctx: Context, message: any, threadId: number | string | null) => Promise<void>;
    handlePhoneNumber?: (
        ctx: Context,
        messageText: string,
        threadId: number | string | null
    ) => Promise<void>;
    handleOrigenDestino?: (
        ctx: Context,
        messageText: string,
        threadId: number | string | null
    ) => Promise<void>;
    handleContactTime?: (
        ctx: Context,
        messageText: string,
        threadId: number | string | null
    ) => Promise<void>;
}

interface ICommandRegistry {
    getAllCommands(): ICommand[];
    getCommand?(commandName: string): ICommand | undefined;
}

interface IThreadSafeStateMap<T> {
    get: (chatId: number | string, threadId?: number | string | null) => T | undefined;
    has: (chatId: number | string, threadId?: number | string | null) => boolean;
    delete: (chatId: number | string, threadId?: number | string | null) => boolean;
}

interface IHandlerWithStates extends IBaseHandler {
    registry: ICommandRegistry;
    awaitingSaveData: IThreadSafeStateMap<any>;
    awaitingGetPolicyNumber: IThreadSafeStateMap<any>;
    awaitingUploadPolicyNumber: IThreadSafeStateMap<any>;
    awaitingDeletePolicyNumber: IThreadSafeStateMap<any>;
    awaitingPaymentPolicyNumber: IThreadSafeStateMap<any>;
    awaitingPaymentData: IThreadSafeStateMap<any>;
    awaitingServicePolicyNumber: IThreadSafeStateMap<any>;
    awaitingServiceData: IThreadSafeStateMap<any>;
    awaitingPhoneNumber: IThreadSafeStateMap<any>;
    awaitingOrigen: IThreadSafeStateMap<any>;
    awaitingDestino: IThreadSafeStateMap<any>;
    awaitingOrigenDestino: IThreadSafeStateMap<any>;
    awaitingDeleteReason?: IThreadSafeStateMap<string[]>;
    handleSaveData: (ctx: Context, messageText: string) => Promise<void>;
    handleGetPolicyFlow: (ctx: Context, messageText: string) => Promise<void>;
    handleUploadFlow: (ctx: Context, messageText: string) => Promise<void>;
    handleDeletePolicyFlow: (ctx: Context, messageText: string) => Promise<void>;
    handleAddPaymentPolicyNumber: (ctx: Context, messageText: string) => Promise<void>;
    handlePaymentData: (ctx: Context, messageText: string) => Promise<void>;
    handleAddServicePolicyNumber: (ctx: Context, messageText: string) => Promise<void>;
}

interface IOcuparPolizaCallback extends ICommand {
    awaitingContactTime?: IThreadSafeStateMap<any>;
    scheduledServiceInfo: IThreadSafeStateMap<{
        waitingForContactTime?: boolean;
        waitingForServiceData?: boolean;
    }>;
    handleServiceCompleted?: (ctx: Context, serviceData: any) => Promise<boolean>;
}

interface IServiceResult {
    expediente: string;
    origenDestino: string;
    costo: number;
    fechaJS: Date;
}

export class TextMessageHandler extends BaseCommand {
    protected handler: IHandlerWithStates;
    private ocuparPolizaCallback: IOcuparPolizaCallback | null = null;

    constructor(handler: IHandlerWithStates) {
        super(handler);
        this.handler = handler;
        this.ocuparPolizaCallback = null;
    }

    getCommandName(): string {
        return 'textHandler';
    }

    getDescription(): string {
        return 'Manejador de mensajes de texto que no son comandos';
    }

    register(): void {
        // Register location handler for Telegram location shares
        this.bot.on('location', async (ctx: Context) => {
            try {
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx as BotContext);

                this.logInfo('Procesando ubicación compartida de Telegram', {
                    chatId,
                    threadId: threadId || 'ninguno',
                    lat: (ctx.message as any)?.location?.latitude,
                    lng: (ctx.message as any)?.location?.longitude
                });

                // Get the OcuparPolizaCallback instance if needed
                if (!this.ocuparPolizaCallback && this.handler.registry) {
                    const commands = this.handler.registry.getAllCommands();
                    this.ocuparPolizaCallback =
                        (commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') as
                            | IOcuparPolizaCallback
                            | undefined) || null;
                }

                // Check if we're waiting for origin
                if (this.handler.awaitingOrigen.has(chatId, threadId)) {
                    this.logInfo('Procesando ubicación como origen');
                    if (
                        this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleOrigen === 'function'
                    ) {
                        await this.ocuparPolizaCallback.handleOrigen(ctx, ctx.message, threadId);
                    } else {
                        await ctx.reply('❌ Error al procesar la ubicación del origen.');
                    }
                    return;
                }

                // Check if we're waiting for destination
                if (this.handler.awaitingDestino.has(chatId, threadId)) {
                    this.logInfo('Procesando ubicación como destino');
                    if (
                        this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleDestino === 'function'
                    ) {
                        await this.ocuparPolizaCallback.handleDestino(ctx, ctx.message, threadId);
                    } else {
                        await ctx.reply('❌ Error al procesar la ubicación del destino.');
                    }
                    return;
                }

                // If no relevant state is active, ignore the location
                this.logInfo('Ubicación recibida pero no hay estado activo relevante');
            } catch (error) {
                this.logError('Error al procesar ubicación:', error);
                await ctx.reply('❌ Error al procesar la ubicación compartida.');
            }
        });

        // Register photo handler for Base de Autos vehicle registration
        this.bot.on('photo', async (ctx: Context) => {
            try {
                const chatId = ctx.chat!.id;
                const userId = ctx.from!.id.toString();

                this.logInfo('Procesando foto recibida', {
                    chatId,
                    userId,
                    photoCount: (ctx.message as any)?.photo ? (ctx.message as any).photo.length : 0
                });

                // Check for Base de Autos active flows
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');

                if (
                    baseAutosCommand &&
                    typeof baseAutosCommand.procesarMensajeBaseAutos === 'function'
                ) {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarMensajeBaseAutos(
                        ctx.message,
                        userId
                    );

                    if (procesadoPorBaseAutos) {
                        this.logInfo('[TextMsgHandler] Foto procesada por Base de Autos');
                        return; // Foto procesada por Base de Autos
                    }
                }

                // If not processed by Base de Autos, inform user
                this.logInfo('[TextMsgHandler] Foto recibida pero no hay flujo activo');
                await ctx.reply(
                    '📸 Foto recibida, pero no hay un registro de vehículo activo. Usa /base_autos para iniciar el registro.'
                );
            } catch (error) {
                this.logError('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto. Intenta nuevamente.');
            }
        });

        // Register document handler for Base de Autos policy assignment
        this.bot.on('document', async (ctx: Context) => {
            try {
                const chatId = ctx.chat!.id;
                const userId = ctx.from!.id.toString();

                this.logInfo('Documento recibido', {
                    chatId,
                    userId,
                    fileName: (ctx.message as any)?.document?.file_name,
                    mimeType: (ctx.message as any)?.document?.mime_type,
                    size: (ctx.message as any)?.document?.file_size
                });

                // Check for Base de Autos active flows
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');

                if (
                    baseAutosCommand &&
                    typeof baseAutosCommand.procesarDocumentoBaseAutos === 'function'
                ) {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarDocumentoBaseAutos(
                        ctx.message,
                        userId
                    );

                    if (procesadoPorBaseAutos) {
                        this.logInfo('[TextMsgHandler] Documento procesado por Base de Autos');
                        return; // Documento procesado por Base de Autos
                    }
                }

                // If not processed by Base de Autos, inform user
                this.logInfo('[TextMsgHandler] Documento recibido pero no hay flujo activo');
                await ctx.reply(
                    '📎 Documento recibido, pero no hay un proceso activo que lo requiera.'
                );
            } catch (error) {
                this.logError('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento. Intenta nuevamente.');
            }
        });

        // Get the OcuparPolizaCallback instance if it's registered later
        this.bot.on('text', async (ctx: Context, next: () => Promise<void>) => {
            // Lazy load the ocuparPolizaCallback if needed
            if (!this.ocuparPolizaCallback && this.handler.registry) {
                const commands = this.handler.registry.getAllCommands();
                this.ocuparPolizaCallback =
                    (commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') as
                        | IOcuparPolizaCallback
                        | undefined) || null;
            }
            try {
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx as BotContext);
                const messageText = (ctx.message as any).text.trim();

                // Log para depuración
                this.logInfo(`Procesando mensaje de texto: "${messageText}"`, {
                    chatId,
                    threadId: threadId || 'ninguno'
                });

                // Ignore commands
                if (messageText.startsWith('/')) {
                    this.logInfo(
                        '[TextMsgHandler] Ignorando comando, pasando a siguiente middleware.'
                    );
                    return next();
                }

                // 🏠 MENÚ PRINCIPAL PERSISTENTE - Manejo del botón de teclado
                if (
                    messageText === '🏠 MENÚ PRINCIPAL' ||
                    messageText === 'MENÚ PRINCIPAL' ||
                    messageText === 'Menu Principal'
                ) {
                    this.logInfo('🏠 Botón MENÚ PRINCIPAL presionado desde teclado persistente', {
                        chatId,
                        threadId: threadId || 'ninguno',
                        userId: ctx.from?.id
                    });

                    // LIMPIAR ESTADOS ADMIN PROBLEMÁTICOS (igual que /start)
                    try {
                        const AdminStateManager = require('../../admin/utils/adminStates').default;
                        AdminStateManager.clearAdminState(ctx.from?.id, chatId);
                        this.logInfo('✅ Estados admin limpiados desde botón teclado persistente');
                    } catch (error) {
                        this.logInfo('Módulo admin no disponible para limpieza de estado');
                    }

                    // LIMPIAR TODOS LOS PROCESOS DEL HILO ESPECÍFICO (igual que /start)
                    if (chatId && this.handler.clearChatState) {
                        this.handler.clearChatState(chatId, threadId);
                        this.logInfo(
                            '🧹 Todos los procesos limpiados desde botón teclado persistente',
                            {
                                chatId: chatId,
                                threadId: threadId || 'ninguno'
                            }
                        );
                    }

                    // Mostrar menú principal inline
                    await this.showMainMenu(ctx as NavigationContext);
                    this.logInfo(
                        '✅ Menú principal mostrado vía teclado persistente (equivalente a /start)'
                    );
                    return;
                }

                // Check for Base de Autos active flows
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');

                if (
                    baseAutosCommand &&
                    typeof baseAutosCommand.procesarMensajeBaseAutos === 'function'
                ) {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarMensajeBaseAutos(
                        ctx.message,
                        ctx.from!.id.toString()
                    );

                    if (procesadoPorBaseAutos) {
                        this.logInfo('[TextMsgHandler] Mensaje procesado por Base de Autos');
                        return; // Mensaje procesado por Base de Autos
                    }
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingSaveData');
                // 1) If we're in /save flow
                if (this.handler.awaitingSaveData.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingSaveData activo. Llamando a handleSaveData.'
                    );
                    await this.handler.handleSaveData(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingGetPolicyNumber');
                // 2) If we're waiting for a policy number for 'accion:consultar'
                const esperaPoliza = this.handler.awaitingGetPolicyNumber.has(chatId, threadId);

                if (esperaPoliza) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingGetPolicyNumber activo. Llamando a handleGetPolicyFlow.'
                    );
                    try {
                        await this.handler.handleGetPolicyFlow(ctx, messageText);
                    } catch (error) {
                        this.logError(
                            `Error en handleGetPolicyFlow: ${(error as Error).message}`,
                            error
                        );
                        await ctx.reply(
                            '❌ Error al procesar el número de póliza. Por favor intenta nuevamente.'
                        );
                    }
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingUploadPolicyNumber');
                // 3) If we're waiting for a policy number for /upload
                if (this.handler.awaitingUploadPolicyNumber.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingUploadPolicyNumber activo. Llamando a handleUploadFlow.'
                    );
                    await this.handler.handleUploadFlow(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingDeletePolicyNumber');
                // 4) If we're waiting for a policy number for /delete
                if (this.handler.awaitingDeletePolicyNumber.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingDeletePolicyNumber activo. Llamando a handleDeletePolicyFlow.'
                    );
                    await this.handler.handleDeletePolicyFlow(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingPaymentPolicyNumber');
                // 5) If we're waiting for a policy number for /addpayment
                if (this.handler.awaitingPaymentPolicyNumber.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingPaymentPolicyNumber activo. Llamando a handleAddPaymentPolicyNumber.'
                    );
                    await this.handler.handleAddPaymentPolicyNumber(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingPaymentData');
                // 6) If we're waiting for payment data (amount/date) for /addpayment
                if (this.handler.awaitingPaymentData.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingPaymentData activo. Llamando a handlePaymentData.'
                    );
                    await this.handler.handlePaymentData(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(
                    `[TextMsgHandler] Verificando estado: awaitingContactTime con threadId=${threadId || 'ninguno'}`
                );
                // (C) If we're waiting for contact time (part of 'ocuparPoliza' flow after service assignment)
                let esperaHoraContacto = false;

                // Verificar si existe serviceInfo con waitingForContactTime=true
                const ocuparPolizaCmd = this.handler.registry?.getCommand
                    ? (this.handler.registry.getCommand('ocuparPoliza') as
                          | IOcuparPolizaCallback
                          | undefined)
                    : null;

                if (ocuparPolizaCmd) {
                    const serviceInfo = ocuparPolizaCmd.scheduledServiceInfo.get(chatId, threadId);
                    this.logInfo(
                        `[TextMsgHandler] Verificando serviceInfo para hora de contacto: ${JSON.stringify(serviceInfo)}`
                    );

                    if (serviceInfo?.waitingForContactTime) {
                        this.logInfo(
                            '[TextMsgHandler] Encontrado serviceInfo con waitingForContactTime=true'
                        );
                        esperaHoraContacto = true;
                    }
                }

                // Verificación tradicional como respaldo
                if (!esperaHoraContacto && this.ocuparPolizaCallback?.awaitingContactTime) {
                    if (typeof this.ocuparPolizaCallback.awaitingContactTime.has === 'function') {
                        esperaHoraContacto = this.ocuparPolizaCallback.awaitingContactTime.has(
                            chatId,
                            threadId
                        );
                        this.logInfo(
                            `Verificación de awaitingContactTime.has: ${esperaHoraContacto ? 'SÍ se espera' : 'NO se espera'}`
                        );
                    } else if (
                        typeof this.ocuparPolizaCallback.awaitingContactTime.get === 'function'
                    ) {
                        const valor = this.ocuparPolizaCallback.awaitingContactTime.get(
                            chatId,
                            threadId
                        );
                        esperaHoraContacto = !!valor;
                        this.logInfo(
                            `Verificación alternativa usando get: ${esperaHoraContacto ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`
                        );
                    }
                }

                if (esperaHoraContacto) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingContactTime activo. Llamando a handleContactTime.'
                    );
                    this.logInfo('Delegando manejo de hora de contacto a OcuparPolizaCallback', {
                        chatId,
                        threadId,
                        hora: messageText
                    });
                    if (typeof this.ocuparPolizaCallback?.handleContactTime === 'function') {
                        await this.ocuparPolizaCallback.handleContactTime(
                            ctx,
                            messageText,
                            threadId
                        );
                    } else {
                        this.logInfo(
                            'OcuparPolizaCallback or handleContactTime not found, cannot process contact time.'
                        );
                        await ctx.reply(
                            '❌ Error: No se puede procesar la hora de contacto. Por favor, inténtalo de nuevo desde el menú principal.'
                        );
                    }
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingServicePolicyNumber');
                // 7) Waiting for a policy number for /addservice
                if (this.handler.awaitingServicePolicyNumber.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingServicePolicyNumber activo. Llamando a handleAddServicePolicyNumber.'
                    );
                    await this.handler.handleAddServicePolicyNumber(ctx, messageText);
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo(
                    `[TextMsgHandler] Verificando estado: awaitingServiceData con threadId=${threadId || 'ninguno'}`
                );
                // 8) Waiting for service data (cost, date, file number)
                if (this.handler.awaitingServiceData.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingServiceData activo. Llamando a handleServiceData.'
                    );
                    // Usar la versión corregida de handleServiceData
                    const handleServiceData = require('../handleServiceData').default;
                    const serviceResult: IServiceResult | null = await handleServiceData.call(
                        this.handler,
                        ctx,
                        messageText
                    );

                    // Verificar si handleServiceData tuvo éxito
                    if (!serviceResult) {
                        this.logError(
                            '[TextMsgHandler] handleServiceData falló o no devolvió datos.'
                        );
                        return;
                    }

                    // Extraer datos del resultado
                    const { expediente, origenDestino, costo, fechaJS } = serviceResult;

                    // NUEVO: Verificar si estamos en flujo de notificación después de servicio
                    const ocuparPolizaCmd2 = this.handler.registry?.getCommand
                        ? (this.handler.registry.getCommand('ocuparPoliza') as
                              | IOcuparPolizaCallback
                              | undefined)
                        : null;

                    if (ocuparPolizaCmd2) {
                        this.logInfo(
                            `[TextMsgHandler] Verificando flujo de notificación para chatId=${chatId}, threadId=${threadId || 'ninguno'}`
                        );
                        const serviceInfo = ocuparPolizaCmd2.scheduledServiceInfo.get(
                            chatId,
                            threadId
                        );
                        this.logInfo(
                            `[TextMsgHandler] serviceInfo recuperado: ${JSON.stringify(serviceInfo)}`
                        );

                        if (serviceInfo?.waitingForServiceData) {
                            this.logInfo(
                                '[TextMsgHandler] serviceInfo encontrado y waitingForServiceData=true. Llamando a handleServiceCompleted.'
                            );
                            const completed = await ocuparPolizaCmd2.handleServiceCompleted?.(ctx, {
                                expediente,
                                origenDestino,
                                costo,
                                fecha: fechaJS
                            });
                            if (completed) {
                                return;
                            } else {
                                this.logError('[TextMsgHandler] handleServiceCompleted falló.');
                                this.handler.awaitingServiceData.delete(chatId, threadId);
                                return;
                            }
                        } else {
                            this.logInfo(
                                `[TextMsgHandler] Condición de notificación falló: serviceInfo=${!!serviceInfo}, waitingForServiceData=${serviceInfo?.waitingForServiceData}`
                            );
                            this.handler.awaitingServiceData.delete(chatId, threadId);
                            this.logInfo(
                                '[TextMsgHandler] Estado awaitingServiceData limpiado (no era flujo de notificación).'
                            );
                        }
                    } else {
                        this.logInfo('[TextMsgHandler] ocuparPolizaCmd no encontrado.');
                        this.handler.awaitingServiceData.delete(chatId, threadId);
                        this.logInfo(
                            '[TextMsgHandler] Estado awaitingServiceData limpiado (ocuparPolizaCmd no encontrado).'
                        );
                    }

                    this.logInfo(
                        '[TextMsgHandler] Flujo de datos de servicio completado (sin continuación de notificación).'
                    );
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingPhoneNumber');
                // (A) If we're waiting for a phone number (part of 'ocuparPoliza' flow)
                let esperaTelefono = false;

                // Verificar existencia del mapa
                if (!this.handler.awaitingPhoneNumber) {
                    this.logInfo('El mapa awaitingPhoneNumber no existe en el handler');
                } else {
                    // Verificar método has
                    if (typeof this.handler.awaitingPhoneNumber.has === 'function') {
                        esperaTelefono = this.handler.awaitingPhoneNumber.has(chatId, threadId);
                        this.logInfo(
                            `Verificación de awaitingPhoneNumber.has: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}`
                        );
                    } else {
                        this.logInfo('El método has no está disponible en awaitingPhoneNumber');

                        // Verificar método get como alternativa
                        if (typeof this.handler.awaitingPhoneNumber.get === 'function') {
                            const valor = this.handler.awaitingPhoneNumber.get(chatId, threadId);
                            esperaTelefono = !!valor;
                            this.logInfo(
                                `Verificación alternativa usando get: ${esperaTelefono ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`
                            );
                        } else {
                            this.logError('Ni has ni get están disponibles en awaitingPhoneNumber');
                        }
                    }
                }

                if (esperaTelefono) {
                    this.logInfo(`Procesando número telefónico: ${messageText}`, {
                        chatId,
                        threadId: threadId || 'ninguno'
                    });
                    try {
                        // Verificar existe el callback y el método
                        if (!this.ocuparPolizaCallback) {
                            this.logInfo('Intentando cargar ocuparPolizaCallback dinámicamente');
                            const commands = this.handler.registry.getAllCommands();
                            this.ocuparPolizaCallback =
                                (commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') as
                                    | IOcuparPolizaCallback
                                    | undefined) || null;
                        }

                        if (
                            this.ocuparPolizaCallback &&
                            typeof this.ocuparPolizaCallback.handlePhoneNumber === 'function'
                        ) {
                            this.logInfo(
                                'Delegando manejo de número telefónico a OcuparPolizaCallback',
                                { chatId, threadId }
                            );
                            await this.ocuparPolizaCallback.handlePhoneNumber(
                                ctx,
                                messageText,
                                threadId
                            );
                        } else {
                            this.logError(
                                'No se puede procesar el teléfono: OcuparPolizaCallback o handlePhoneNumber no encontrados'
                            );
                            await ctx.reply(
                                '❌ Error al procesar el número telefónico. Por favor, intenta desde el menú principal.'
                            );
                        }
                    } catch (error) {
                        this.logError(
                            `Error al procesar número telefónico: ${(error as Error).message}`,
                            error
                        );
                        await ctx.reply(
                            '❌ Error al procesar el número telefónico. Por favor, intenta nuevamente.'
                        );
                    }
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingPhoneNumber activo. Llamando a handlePhoneNumber.'
                    );
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingOrigen');
                // (A1) If we're waiting for origin coordinates (new flow)
                if (this.handler.awaitingOrigen.has(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingOrigen activo. Llamando a handleOrigen.'
                    );
                    if (!this.ocuparPolizaCallback) {
                        const commands = this.handler.registry.getAllCommands();
                        this.ocuparPolizaCallback =
                            (commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') as
                                | IOcuparPolizaCallback
                                | undefined) || null;
                    }

                    if (
                        this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleOrigen === 'function'
                    ) {
                        await this.ocuparPolizaCallback.handleOrigen(ctx, messageText, threadId);
                    } else {
                        await ctx.reply('❌ Error al procesar la ubicación del origen.');
                    }
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingDestino');
                // (A2) If we're waiting for destination coordinates (new flow)
                if (this.handler.awaitingDestino.has(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingDestino activo. Llamando a handleDestino.'
                    );
                    if (!this.ocuparPolizaCallback) {
                        const commands = this.handler.registry.getAllCommands();
                        this.ocuparPolizaCallback =
                            (commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') as
                                | IOcuparPolizaCallback
                                | undefined) || null;
                    }

                    if (
                        this.ocuparPolizaCallback &&
                        typeof this.ocuparPolizaCallback.handleDestino === 'function'
                    ) {
                        await this.ocuparPolizaCallback.handleDestino(ctx, messageText, threadId);
                    } else {
                        await ctx.reply('❌ Error al procesar la ubicación del destino.');
                    }
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingOrigenDestino');
                // (B) If we're waiting for origin-destination (part of 'ocuparPoliza' flow)
                let esperaOrigenDestino = false;

                // Verificar existencia del mapa
                if (!this.handler.awaitingOrigenDestino) {
                    this.logInfo('El mapa awaitingOrigenDestino no existe en el handler');
                } else {
                    // Verificar método has
                    if (typeof this.handler.awaitingOrigenDestino.has === 'function') {
                        esperaOrigenDestino = this.handler.awaitingOrigenDestino.has(
                            chatId,
                            threadId
                        );
                        this.logInfo(
                            `Verificación de awaitingOrigenDestino.has: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}`
                        );
                    } else {
                        this.logInfo('El método has no está disponible en awaitingOrigenDestino');

                        // Verificar método get como alternativa
                        if (typeof this.handler.awaitingOrigenDestino.get === 'function') {
                            const valor = this.handler.awaitingOrigenDestino.get(chatId, threadId);
                            esperaOrigenDestino = !!valor;
                            this.logInfo(
                                `Verificación alternativa usando get: ${esperaOrigenDestino ? 'SÍ se espera' : 'NO se espera'}, valor=${valor}`
                            );
                        } else {
                            this.logError(
                                'Ni has ni get están disponibles en awaitingOrigenDestino'
                            );
                        }
                    }
                }

                if (esperaOrigenDestino) {
                    this.logInfo(`Procesando origen-destino: ${messageText}`, {
                        chatId,
                        threadId: threadId || 'ninguno'
                    });
                    try {
                        // Verificar existe el callback y el método
                        if (!this.ocuparPolizaCallback) {
                            this.logInfo('Intentando cargar ocuparPolizaCallback dinámicamente');
                            const commands = this.handler.registry.getAllCommands();
                            this.ocuparPolizaCallback =
                                (commands.find(cmd => cmd.getCommandName() === 'ocuparPoliza') as
                                    | IOcuparPolizaCallback
                                    | undefined) || null;
                        }

                        if (
                            this.ocuparPolizaCallback &&
                            typeof this.ocuparPolizaCallback.handleOrigenDestino === 'function'
                        ) {
                            this.logInfo(
                                'Delegando manejo de origen-destino a OcuparPolizaCallback',
                                { chatId, threadId }
                            );
                            await this.ocuparPolizaCallback.handleOrigenDestino(
                                ctx,
                                messageText,
                                threadId
                            );
                        } else {
                            this.logError(
                                'No se puede procesar origen-destino: OcuparPolizaCallback o handleOrigenDestino no encontrados'
                            );
                            await ctx.reply(
                                '❌ Error al procesar origen-destino. Por favor, intenta desde el menú principal.'
                            );
                        }
                    } catch (error) {
                        this.logError(
                            `Error al procesar origen-destino: ${(error as Error).message}`,
                            error
                        );
                        await ctx.reply(
                            '❌ Error al procesar origen-destino. Por favor, intenta nuevamente.'
                        );
                    }
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingOrigenDestino activo. Llamando a handleOrigenDestino.'
                    );
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Verificando estado: awaitingDeleteReason');
                // Handle delete reason
                if (this.handler.awaitingDeleteReason?.get(chatId, threadId)) {
                    this.logInfo(
                        '[TextMsgHandler] Estado awaitingDeleteReason activo. Procesando motivo.'
                    );
                    const numeroPolizas = this.handler.awaitingDeleteReason.get(chatId, threadId);
                    const motivo = messageText.trim() === 'ninguno' ? '' : messageText.trim();

                    if (!numeroPolizas) {
                        this.logError('No se encontraron números de póliza para eliminar');
                        return;
                    }

                    try {
                        let eliminadas = 0;
                        let noEncontradas = 0;
                        let errores = 0;
                        const listadoNoEncontradas: string[] = [];

                        // Show initial message
                        const msgInicial = await ctx.reply(
                            `🔄 Procesando ${numeroPolizas.length} póliza(s)...`
                        );

                        // Process each policy in the list
                        for (const numeroPoliza of numeroPolizas) {
                            try {
                                // Use markPolicyAsDeleted for each policy
                                const deletedPolicy = await markPolicyAsDeleted(
                                    numeroPoliza,
                                    motivo
                                );

                                if (!deletedPolicy) {
                                    noEncontradas++;
                                    listadoNoEncontradas.push(numeroPoliza);
                                } else {
                                    eliminadas++;
                                }

                                // If there are many policies, update the message every 5 processed
                                if (numeroPolizas.length > 10 && eliminadas % 5 === 0) {
                                    await ctx.telegram.editMessageText(
                                        msgInicial.chat.id,
                                        msgInicial.message_id,
                                        undefined,
                                        `🔄 Procesando ${numeroPolizas.length} póliza(s)...\n` +
                                            `✅ Procesadas: ${eliminadas + noEncontradas + errores}/${numeroPolizas.length}\n` +
                                            '⏱️ Por favor espere...'
                                    );
                                }
                            } catch (error: any) {
                                this.logError(
                                    `Error al marcar póliza ${numeroPoliza} como eliminada:`,
                                    error
                                );

                                // Mostrar mensaje de error específico para esta póliza
                                let mensajeError = `❌ No se pudo eliminar la póliza ${numeroPoliza}`;

                                // Extraer mensaje de error en lenguaje claro
                                if (error.name === 'ValidationError') {
                                    // Errores de validación de Mongoose
                                    const camposFaltantes = Object.keys(error.errors || {})
                                        .map(campo => `\`${campo}\``)
                                        .join(', ');

                                    if (camposFaltantes) {
                                        mensajeError += `: falta(n) el/los campo(s) obligatorio(s) ${camposFaltantes}.`;
                                    } else {
                                        mensajeError += ': error de validación.';
                                    }
                                } else {
                                    // Otros tipos de errores
                                    mensajeError += '.';
                                }

                                // Enviar mensaje de error específico para esta póliza
                                await ctx.reply(mensajeError);

                                errores++;
                            }
                        }

                        // Edit the initial message to show the final result
                        await ctx.telegram.editMessageText(
                            msgInicial.chat.id,
                            msgInicial.message_id,
                            undefined,
                            '✅ Proceso completado'
                        );

                        // Build the results message
                        let mensajeResultado =
                            '📊 *Resultados del proceso:*\n' +
                            `✅ Pólizas eliminadas correctamente: ${eliminadas}\n`;

                        if (noEncontradas > 0) {
                            mensajeResultado += `⚠️ Pólizas no encontradas o ya eliminadas: ${noEncontradas}\n`;

                            // If there are few not found, list them
                            if (noEncontradas <= 10) {
                                mensajeResultado += `📋 No encontradas:\n${listadoNoEncontradas.map(p => `- ${p}`).join('\n')}\n`;
                            }
                        }

                        if (errores > 0) {
                            mensajeResultado += `❌ Errores al procesar: ${errores}\n`;
                        }

                        // Add "Volver al Menú" button
                        await ctx.replyWithMarkdown(
                            mensajeResultado,
                            Markup.inlineKeyboard([
                            ])
                        );
                    } catch (error) {
                        this.logError('Error general al marcar pólizas como eliminadas:', error);
                        // Add "Volver al Menú" button even on error
                        await ctx.reply(
                            '❌ Hubo un error al marcar las pólizas como eliminadas. Intenta nuevamente.',
                            Markup.inlineKeyboard([
                            ])
                        );
                    } finally {
                        // Clean up the waiting state
                        this.handler.awaitingDeleteReason?.delete(chatId, threadId);
                    }
                    return;
                }

                // --- LOGGING AÑADIDO ---
                this.logInfo('[TextMsgHandler] Ningún estado activo coincidió con el mensaje.');
                // Si llegamos aquí y no es un comando, pasar al siguiente middleware (AdminModule)
                return next();
            } catch (error) {
                this.logError('Error general al procesar mensaje de texto:', error);
                await ctx.reply('❌ Error al procesar el mensaje. Intenta nuevamente.');
            }
        });
    }
}

export default TextMessageHandler;
