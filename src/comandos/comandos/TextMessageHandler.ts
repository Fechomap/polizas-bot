import { BaseCommand, NavigationContext, IBaseHandler, ReplyOptions } from './BaseCommand';
import { getPolicyByNumber, markPolicyAsDeleted } from '../../controllers/policyController';
import { Markup } from 'telegraf';
import StateKeyManager from '../../utils/StateKeyManager';
import { getStateCleanupService } from '../../services/StateCleanupService';
import type { Context } from 'telegraf';
import type { BotContext } from '../../../types';

// Service - Limpieza centralizada de estados
const cleanupService = getStateCleanupService();

interface ICommand {
    getCommandName(): string;
    procesarMensajeBaseAutos?: (message: any, userId: string) => Promise<boolean>;
    procesarDocumentoBaseAutos?: (message: any, userId: string) => Promise<boolean>;
    procesarFotoBaseAutos?: (message: any, userId: string) => Promise<boolean>;
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
    ocuparPolizaCallback?: IOcuparPolizaCallback;
    awaitingSaveData: IThreadSafeStateMap<any>;
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
    awaitingPolicySearch: IThreadSafeStateMap<any>;
    handleSaveData: (ctx: Context, messageText: string) => Promise<void>;
    handleUploadFlow: (ctx: Context, messageText: string) => Promise<void>;
    handleDeletePolicyFlow: (ctx: Context, messageText: string) => Promise<void>;
    handleAddPaymentPolicyNumber: (ctx: Context, messageText: string) => Promise<void>;
    handlePaymentData: (ctx: Context, messageText: string) => Promise<void>;
    handleAddServicePolicyNumber: (ctx: Context, messageText: string) => Promise<void>;
    handlePolicySearch: (ctx: Context, messageText: string) => Promise<void>;
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
        this.registerLocationHandler();
        this.registerPhotoHandler();
        this.registerDocumentHandler();
        this.registerTextHandler();
    }

    /**
     * Handler para ubicaciones compartidas
     */
    private registerLocationHandler(): void {
        this.bot.on('location', async (ctx: Context) => {
            try {
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx as BotContext);

                this.logInfo('Procesando ubicación compartida', {
                    chatId,
                    threadId: threadId ?? 'ninguno'
                });

                this.lazyLoadOcuparPoliza();

                if (this.handler.awaitingOrigen.has(chatId, threadId)) {
                    await this.handleLocationAsOrigen(ctx, threadId);
                    return;
                }

                if (this.handler.awaitingDestino.has(chatId, threadId)) {
                    await this.handleLocationAsDestino(ctx, threadId);
                    return;
                }
            } catch (error) {
                this.logError('Error al procesar ubicación:', error);
                await ctx.reply('❌ Error al procesar la ubicación compartida.');
            }
        });
    }

    /**
     * Handler para fotos
     */
    private registerPhotoHandler(): void {
        this.bot.on('photo', async (ctx: Context) => {
            try {
                const userId = ctx.from!.id.toString();
                const procesado = await this.procesarConBaseAutos(
                    ctx,
                    'procesarFotoBaseAutos',
                    userId
                );
                if (procesado) {
                    this.logInfo('[TextMsgHandler] Foto procesada por Base de Autos');
                }
            } catch (error) {
                this.logError('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto. Intenta nuevamente.');
            }
        });
    }

    /**
     * Handler para documentos
     */
    private registerDocumentHandler(): void {
        this.bot.on('document', async (ctx: Context) => {
            try {
                const userId = ctx.from!.id.toString();
                this.logInfo('Documento recibido', {
                    fileName: (ctx.message as any)?.document?.file_name,
                    mimeType: (ctx.message as any)?.document?.mime_type
                });

                const procesado = await this.procesarConBaseAutos(
                    ctx,
                    'procesarDocumentoBaseAutos',
                    userId
                );
                if (procesado) {
                    this.logInfo('[TextMsgHandler] Documento procesado por Base de Autos');
                }
            } catch (error) {
                this.logError('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento. Intenta nuevamente.');
            }
        });
    }

    /**
     * Handler principal para mensajes de texto
     */
    private registerTextHandler(): void {
        this.bot.on('text', async (ctx: Context, next: () => Promise<void>) => {
            this.lazyLoadOcuparPoliza();

            try {
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx as BotContext);
                const messageText = (ctx.message as any).text.trim();

                this.logInfo(`Procesando mensaje de texto: "${messageText}"`, {
                    chatId,
                    threadId: threadId ?? 'ninguno'
                });

                // Ignorar comandos
                if (messageText.startsWith('/')) {
                    return next();
                }

                // Menú principal
                if (this.esMenuPrincipal(messageText)) {
                    await this.procesarMenuPrincipal(ctx, chatId, threadId);
                    return;
                }

                // Base de Autos
                if (
                    await this.procesarConBaseAutos(
                        ctx,
                        'procesarMensajeBaseAutos',
                        ctx.from!.id.toString()
                    )
                ) {
                    this.logInfo('[TextMsgHandler] Mensaje procesado por Base de Autos');
                    return;
                }

                // Router de estados
                const procesado = await this.routeToStateHandler(
                    ctx,
                    chatId,
                    threadId,
                    messageText
                );
                if (procesado) return;

                // Si no hay estado activo, pasar al siguiente middleware
                this.logInfo('[TextMsgHandler] Ningún estado activo coincidió con el mensaje.');
                return next();
            } catch (error) {
                this.logError('Error general al procesar mensaje de texto:', error);
                await ctx.reply('❌ Error al procesar el mensaje. Intenta nuevamente.');
            }
        });
    }

    /**
     * Enruta el mensaje al handler correspondiente según el estado activo
     */
    private async routeToStateHandler(
        ctx: Context,
        chatId: number,
        threadId: number | string | null,
        messageText: string
    ): Promise<boolean> {
        // Save data
        if (this.handler.awaitingSaveData.get(chatId, threadId)) {
            await this.handler.handleSaveData(ctx, messageText);
            return true;
        }

        // Policy search
        if (this.handler.awaitingPolicySearch.has(chatId, threadId)) {
            await this.handler.handlePolicySearch(ctx, messageText);
            return true;
        }

        // Upload policy
        if (this.handler.awaitingUploadPolicyNumber.get(chatId, threadId)) {
            await this.handler.handleUploadFlow(ctx, messageText);
            return true;
        }

        // Delete policy
        if (this.handler.awaitingDeletePolicyNumber.get(chatId, threadId)) {
            await this.handler.handleDeletePolicyFlow(ctx, messageText);
            return true;
        }

        // Payment policy number
        if (this.handler.awaitingPaymentPolicyNumber.get(chatId, threadId)) {
            await this.handler.handleAddPaymentPolicyNumber(ctx, messageText);
            return true;
        }

        // Payment data
        if (this.handler.awaitingPaymentData.get(chatId, threadId)) {
            await this.handler.handlePaymentData(ctx, messageText);
            return true;
        }

        // Contact time
        if (await this.handleContactTimeIfActive(ctx, chatId, threadId, messageText)) {
            return true;
        }

        // Service policy number
        if (this.handler.awaitingServicePolicyNumber.get(chatId, threadId)) {
            await this.handler.handleAddServicePolicyNumber(ctx, messageText);
            return true;
        }

        // Service data
        if (this.handler.awaitingServiceData.get(chatId, threadId)) {
            await this.handleServiceData(ctx, chatId, threadId, messageText);
            return true;
        }

        // Phone number
        if (await this.handlePhoneNumberIfActive(ctx, chatId, threadId, messageText)) {
            return true;
        }

        // Origen
        if (this.handler.awaitingOrigen.has(chatId, threadId)) {
            await this.handleOrigenText(ctx, messageText, threadId);
            return true;
        }

        // Destino
        if (this.handler.awaitingDestino.has(chatId, threadId)) {
            await this.handleDestinoText(ctx, messageText, threadId);
            return true;
        }

        // Origen-Destino
        if (await this.handleOrigenDestinoIfActive(ctx, chatId, threadId, messageText)) {
            return true;
        }

        // Delete reason
        if (this.handler.awaitingDeleteReason?.get(chatId, threadId)) {
            await this.handleDeleteReason(ctx, chatId, threadId, messageText);
            return true;
        }

        return false;
    }

    // ============ HELPER METHODS ============

    private lazyLoadOcuparPoliza(): void {
        if (!this.ocuparPolizaCallback) {
            this.ocuparPolizaCallback = this.handler.ocuparPolizaCallback ?? null;
        }
    }

    private esMenuPrincipal(text: string): boolean {
        return (
            text === '🏠 MENÚ PRINCIPAL' || text === 'MENÚ PRINCIPAL' || text === 'Menu Principal'
        );
    }

    private async procesarMenuPrincipal(
        ctx: Context,
        chatId: number,
        threadId: number | string | null
    ): Promise<void> {
        this.logInfo('🏠 Botón MENÚ PRINCIPAL presionado', { chatId, userId: ctx.from?.id });

        cleanupService.limpiarTodosLosEstados(chatId, threadId, ctx.from?.id, this.handler);

        await this.showMainMenu(ctx as NavigationContext);
        this.logInfo('✅ Menú principal mostrado');
    }

    private async procesarConBaseAutos(
        ctx: Context,
        metodo: 'procesarMensajeBaseAutos' | 'procesarDocumentoBaseAutos' | 'procesarFotoBaseAutos',
        userId: string
    ): Promise<boolean> {
        const baseAutosCommand = this.handler.registry
            .getAllCommands()
            .find(cmd => cmd.getCommandName() === 'base_autos');

        if (baseAutosCommand && typeof (baseAutosCommand as any)[metodo] === 'function') {
            return await (baseAutosCommand as any)[metodo](ctx.message, userId);
        }
        return false;
    }

    private async handleLocationAsOrigen(
        ctx: Context,
        threadId: number | string | null
    ): Promise<void> {
        if (this.ocuparPolizaCallback?.handleOrigen) {
            await this.ocuparPolizaCallback.handleOrigen(ctx, ctx.message, threadId);
        } else {
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
        }
    }

    private async handleLocationAsDestino(
        ctx: Context,
        threadId: number | string | null
    ): Promise<void> {
        if (this.ocuparPolizaCallback?.handleDestino) {
            await this.ocuparPolizaCallback.handleDestino(ctx, ctx.message, threadId);
        } else {
            await ctx.reply('❌ Error al procesar la ubicación del destino.');
        }
    }

    private async handleContactTimeIfActive(
        ctx: Context,
        chatId: number,
        threadId: number | string | null,
        messageText: string
    ): Promise<boolean> {
        let esperaHoraContacto = false;

        const ocuparCmd = this.handler.ocuparPolizaCallback ?? null;
        if (ocuparCmd) {
            const serviceInfo = ocuparCmd.scheduledServiceInfo.get(chatId, threadId);
            if (serviceInfo?.waitingForContactTime) {
                esperaHoraContacto = true;
            }
        }

        if (!esperaHoraContacto && this.ocuparPolizaCallback?.awaitingContactTime) {
            if (typeof this.ocuparPolizaCallback.awaitingContactTime.has === 'function') {
                esperaHoraContacto = this.ocuparPolizaCallback.awaitingContactTime.has(
                    chatId,
                    threadId
                );
            } else if (typeof this.ocuparPolizaCallback.awaitingContactTime.get === 'function') {
                esperaHoraContacto = !!this.ocuparPolizaCallback.awaitingContactTime.get(
                    chatId,
                    threadId
                );
            }
        }

        if (esperaHoraContacto) {
            if (this.ocuparPolizaCallback?.handleContactTime) {
                await this.ocuparPolizaCallback.handleContactTime(ctx, messageText, threadId);
            } else {
                await ctx.reply('❌ Error: No se puede procesar la hora de contacto.');
            }
            return true;
        }
        return false;
    }

    private async handleServiceData(
        ctx: Context,
        chatId: number,
        threadId: number | string | null,
        messageText: string
    ): Promise<void> {
        const handleServiceData = require('../handleServiceData').default;
        const serviceResult: IServiceResult | null = await handleServiceData.call(
            this.handler,
            ctx,
            messageText
        );

        if (!serviceResult) {
            this.logError('[TextMsgHandler] handleServiceData falló');
            return;
        }

        const { expediente, origenDestino, costo, fechaJS } = serviceResult;
        const ocuparCmd = this.handler.ocuparPolizaCallback ?? null;

        if (ocuparCmd) {
            const serviceInfo = ocuparCmd.scheduledServiceInfo.get(chatId, threadId);
            if (serviceInfo?.waitingForServiceData) {
                const completed = await ocuparCmd.handleServiceCompleted?.(ctx, {
                    expediente,
                    origenDestino,
                    costo,
                    fecha: fechaJS
                });
                if (!completed) {
                    this.handler.awaitingServiceData.delete(chatId, threadId);
                }
                return;
            }
        }
        this.handler.awaitingServiceData.delete(chatId, threadId);
    }

    private async handlePhoneNumberIfActive(
        ctx: Context,
        chatId: number,
        threadId: number | string | null,
        messageText: string
    ): Promise<boolean> {
        let esperaTelefono = false;

        if (this.handler.awaitingPhoneNumber) {
            if (typeof this.handler.awaitingPhoneNumber.has === 'function') {
                esperaTelefono = this.handler.awaitingPhoneNumber.has(chatId, threadId);
            } else if (typeof this.handler.awaitingPhoneNumber.get === 'function') {
                esperaTelefono = !!this.handler.awaitingPhoneNumber.get(chatId, threadId);
            }
        }

        if (esperaTelefono) {
            this.lazyLoadOcuparPoliza();
            if (this.ocuparPolizaCallback?.handlePhoneNumber) {
                await this.ocuparPolizaCallback.handlePhoneNumber(ctx, messageText, threadId);
            } else {
                await ctx.reply('❌ Error al procesar el número telefónico.');
            }
            return true;
        }
        return false;
    }

    private async handleOrigenText(
        ctx: Context,
        messageText: string,
        threadId: number | string | null
    ): Promise<void> {
        this.lazyLoadOcuparPoliza();
        if (this.ocuparPolizaCallback?.handleOrigen) {
            await this.ocuparPolizaCallback.handleOrigen(ctx, messageText, threadId);
        } else {
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
        }
    }

    private async handleDestinoText(
        ctx: Context,
        messageText: string,
        threadId: number | string | null
    ): Promise<void> {
        this.lazyLoadOcuparPoliza();
        if (this.ocuparPolizaCallback?.handleDestino) {
            await this.ocuparPolizaCallback.handleDestino(ctx, messageText, threadId);
        } else {
            await ctx.reply('❌ Error al procesar la ubicación del destino.');
        }
    }

    private async handleOrigenDestinoIfActive(
        ctx: Context,
        chatId: number,
        threadId: number | string | null,
        messageText: string
    ): Promise<boolean> {
        let esperaOrigenDestino = false;

        if (this.handler.awaitingOrigenDestino) {
            if (typeof this.handler.awaitingOrigenDestino.has === 'function') {
                esperaOrigenDestino = this.handler.awaitingOrigenDestino.has(chatId, threadId);
            } else if (typeof this.handler.awaitingOrigenDestino.get === 'function') {
                esperaOrigenDestino = !!this.handler.awaitingOrigenDestino.get(chatId, threadId);
            }
        }

        if (esperaOrigenDestino) {
            this.lazyLoadOcuparPoliza();
            if (this.ocuparPolizaCallback?.handleOrigenDestino) {
                await this.ocuparPolizaCallback.handleOrigenDestino(ctx, messageText, threadId);
            } else {
                await ctx.reply('❌ Error al procesar origen-destino.');
            }
            return true;
        }
        return false;
    }

    private async handleDeleteReason(
        ctx: Context,
        chatId: number,
        threadId: number | string | null,
        messageText: string
    ): Promise<void> {
        const numeroPolizas = this.handler.awaitingDeleteReason!.get(chatId, threadId);
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

            const msgInicial = await ctx.reply(
                `🔄 Procesando ${numeroPolizas.length} póliza(s)...`
            );

            for (const numeroPoliza of numeroPolizas) {
                try {
                    const deletedPolicy = await markPolicyAsDeleted(numeroPoliza, motivo);
                    if (!deletedPolicy) {
                        noEncontradas++;
                        listadoNoEncontradas.push(numeroPoliza);
                    } else {
                        eliminadas++;
                    }

                    if (numeroPolizas.length > 10 && eliminadas % 5 === 0) {
                        await ctx.telegram.editMessageText(
                            msgInicial.chat.id,
                            msgInicial.message_id,
                            undefined,
                            `🔄 Procesando...\n✅ ${eliminadas + noEncontradas + errores}/${numeroPolizas.length}`
                        );
                    }
                } catch (error: any) {
                    this.logError(`Error al eliminar póliza ${numeroPoliza}:`, error);
                    let mensajeError = `❌ No se pudo eliminar la póliza ${numeroPoliza}`;

                    if (error.name === 'ValidationError') {
                        const camposFaltantes = Object.keys(error.errors ?? {})
                            .map(c => `\`${c}\``)
                            .join(', ');
                        if (camposFaltantes) {
                            mensajeError += `: falta(n) ${camposFaltantes}.`;
                        }
                    }

                    await ctx.reply(mensajeError);
                    errores++;
                }
            }

            await ctx.telegram.editMessageText(
                msgInicial.chat.id,
                msgInicial.message_id,
                undefined,
                '✅ Proceso completado'
            );

            let mensajeResultado = `📊 *Resultados:*\n✅ Eliminadas: ${eliminadas}\n`;
            if (noEncontradas > 0) {
                mensajeResultado += `⚠️ No encontradas: ${noEncontradas}\n`;
                if (noEncontradas <= 10) {
                    mensajeResultado += `📋 ${listadoNoEncontradas.join(', ')}\n`;
                }
            }
            if (errores > 0) {
                mensajeResultado += `❌ Errores: ${errores}\n`;
            }

            await ctx.replyWithMarkdown(mensajeResultado, Markup.inlineKeyboard([]));
        } catch (error) {
            this.logError('Error general al eliminar pólizas:', error);
            await ctx.reply('❌ Error al eliminar las pólizas.', Markup.inlineKeyboard([]));
        } finally {
            this.handler.awaitingDeleteReason?.delete(chatId, threadId);
        }
    }
}

export default TextMessageHandler;
