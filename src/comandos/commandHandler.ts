// src/comandos/commandHandler.ts
import { Markup, Telegraf } from 'telegraf';
import config from '../config';
import CommandRegistry from './comandos/CommandRegistry';
import logger from '../utils/logger';
import { stateManager } from '../state/StateFactory';
import BaseCommand from './comandos/BaseCommand';
import {
    StartCommand,
    TextMessageHandler,
    ViewFilesCallbacks,
    PaymentReportPDFCommand,
    ReportUsedCommand,
    BaseAutosCommand
} from './comandos';
import OcuparPolizaCallback from './comandos/OcuparPolizaCallback';
import PolicyQueryHandler from './handlers/PolicyQueryHandler';
import PolicyRegistrationHandler from './handlers/PolicyRegistrationHandler';
import PolicyDeletionHandler from './handlers/PolicyDeletionHandler';
import PaymentHandler from './handlers/PaymentHandler';
import ServiceHandler from './handlers/ServiceHandler';
import { getPolicyByNumber } from '../controllers/policyController';
import type { ChatContext } from './comandos/BaseCommand';
import StateKeyManager from '../utils/StateKeyManager';
import AdminMenu from '../admin/menus/adminMenu';

// Usar StateKeyManager para crear mapas con firma consistente
const createStateMap = () => StateKeyManager.createThreadSafeStateMap<any>();

class CommandHandler {
    public bot: Telegraf;
    public registry: CommandRegistry;
    public excelUploadMessages: Map<number, number>;
    private startCommandInstance: StartCommand;
    private policyQueryHandler: PolicyQueryHandler;
    private policyRegistrationHandler: PolicyRegistrationHandler;
    private policyDeletionHandler: PolicyDeletionHandler;
    private paymentHandler: PaymentHandler;
    private serviceHandler: ServiceHandler;
    public viewFilesCallbacks: ViewFilesCallbacks;
    public ocuparPolizaCallback: OcuparPolizaCallback;
    private paymentReportPDFCommand: PaymentReportPDFCommand;
    private reportUsedCommand: ReportUsedCommand;
    private baseAutosCommand: BaseAutosCommand;

    // Mapas de estado para compatibilidad con TextMessageHandler
    public awaitingSaveData = createStateMap();
    public awaitingUploadPolicyNumber = createStateMap();
    public awaitingDeletePolicyNumber = createStateMap();
    public awaitingPaymentPolicyNumber = createStateMap();
    public awaitingPaymentData = createStateMap();
    public awaitingServicePolicyNumber = createStateMap();
    public awaitingServiceData = createStateMap();
    public awaitingPhoneNumber = createStateMap();
    public awaitingOrigen = createStateMap();
    public awaitingDestino = createStateMap();
    public awaitingOrigenDestino = createStateMap();
    public awaitingDeleteReason = createStateMap();
    // Nuevo: estado para búsqueda unificada de pólizas
    public awaitingPolicySearch = createStateMap();

    constructor(bot: Telegraf) {
        if (!bot) throw new Error('Bot instance is required');
        this.bot = bot;
        this.registry = new CommandRegistry();
        this.excelUploadMessages = new Map();

        // Instantiate all handlers
        this.startCommandInstance = new StartCommand(this as any);
        this.policyQueryHandler = new PolicyQueryHandler(this as any);
        this.policyRegistrationHandler = new PolicyRegistrationHandler(this as any);
        this.policyDeletionHandler = new PolicyDeletionHandler(this as any);
        this.paymentHandler = new PaymentHandler(this as any);
        this.serviceHandler = new ServiceHandler(this as any);
        this.viewFilesCallbacks = new ViewFilesCallbacks(this as any);
        this.ocuparPolizaCallback = new OcuparPolizaCallback(this as any);
        this.paymentReportPDFCommand = new PaymentReportPDFCommand(this as any);
        this.reportUsedCommand = new ReportUsedCommand(this as any);
        this.baseAutosCommand = new BaseAutosCommand(this as any);

        // Registrar BaseAutosCommand en el registry para acceso desde TextMessageHandler
        this.registry.registerCommand(this.baseAutosCommand as any);

        this.registerCommands();
    }

    _getStateKey(
        chatId: number | string,
        stateName: string,
        threadId?: number | string | null
    ): string {
        const threadSuffix = threadId ? `:${threadId}` : '';
        return `${stateName}:${chatId}${threadSuffix}`;
    }

    registerCommands(): void {
        this.startCommandInstance.register();
        this.policyQueryHandler.register();
        this.policyRegistrationHandler.register();
        this.policyDeletionHandler.register();
        this.paymentHandler.register();
        this.serviceHandler.register();
        this.viewFilesCallbacks.register();
        this.ocuparPolizaCallback.register();
        this.baseAutosCommand.register();

        new TextMessageHandler(this as any).register();
        this.setupActionHandlers();
    }

    setupActionHandlers(): void {
        // Volver al menú principal
        this.bot.action('accion:volver_menu', async (ctx: any) => {
            await ctx.answerCbQuery();
            const threadId = BaseCommand.getThreadId(ctx);
            await this.clearChatState(ctx.chat.id, threadId);
            await this.startCommandInstance.showMainMenu(ctx);
        });

        // Menú de Pólizas - NUEVO FLUJO UNIFICADO
        this.bot.action('accion:polizas', async (ctx: any) => {
            await ctx.answerCbQuery();
            await this.askForPolicyNumber(ctx);
        });

        // Menú de Reportes
        this.bot.action('accion:reportes', async (ctx: any) => {
            await ctx.answerCbQuery();
            await this.showReportesMenu(ctx);
        });

        // Menú de Administración
        this.bot.action('accion:administracion', async (ctx: any) => {
            await ctx.answerCbQuery();
            await this.showAdminMenu(ctx);
        });

        // Reporte de Pagos Pendientes
        this.bot.action('accion:reportPaymentPDF', async (ctx: any) => {
            try {
                await ctx.answerCbQuery();
                if (
                    this.paymentReportPDFCommand &&
                    typeof this.paymentReportPDFCommand.generateReport === 'function'
                ) {
                    await this.paymentReportPDFCommand.generateReport(ctx);
                } else {
                    logger.warn('PaymentReportPDFCommand no disponible');
                    await ctx.reply('❌ Reporte PDF no disponible en este momento.');
                }
            } catch (error: any) {
                logger.error('Error en accion:reportPaymentPDF:', error);
                await ctx.reply('❌ Error al generar el reporte PDF de pagos pendientes.');
            }
        });

        // Reporte de Pólizas a Mandar (Prioritarias)
        this.bot.action('accion:reportUsed', async (ctx: any) => {
            try {
                await ctx.answerCbQuery();
                if (
                    this.reportUsedCommand &&
                    typeof this.reportUsedCommand.generateReport === 'function'
                ) {
                    await this.reportUsedCommand.generateReport(ctx);
                } else {
                    logger.warn('ReportUsedCommand no disponible');
                    await ctx.reply('❌ Reporte no disponible en este momento.');
                }
            } catch (error: any) {
                logger.error('Error en accion:reportUsed:', error);
                await ctx.reply('❌ Error al generar el reporte de pólizas prioritarias.');
            }
        });

        // Callback para consultar póliza desde reportes
        this.bot.action(/getPoliza:(.+)/, async (ctx: any) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback getPoliza para: ${numeroPoliza}`);

                const policy = await getPolicyByNumber(numeroPoliza);
                if (policy) {
                    await this.showPolicyInfo(ctx, policy);
                } else {
                    await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                }
                await ctx.answerCbQuery();
            } catch (error: any) {
                logger.error('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });
    }

    // NUEVO FLUJO: Pedir número de póliza
    private async askForPolicyNumber(ctx: any): Promise<void> {
        const chatId = ctx.chat.id;
        const threadId = BaseCommand.getThreadId(ctx);

        // Limpiar estados previos
        await this.clearChatState(chatId, threadId);

        // Activar estado de espera
        this.awaitingPolicySearch.set(chatId, true, threadId);

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
        ]);

        await ctx.editMessageText('📋 **PÓLIZAS**\n\nIngresa el número de póliza:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }

    // NUEVO FLUJO: Procesar búsqueda de póliza
    public async handlePolicySearch(ctx: any, numeroPoliza: string): Promise<void> {
        const chatId = ctx.chat?.id;
        const threadId = BaseCommand.getThreadId(ctx);

        try {
            const normalizedNumero = numeroPoliza.trim().toUpperCase();
            logger.info('Buscando póliza:', { numeroPoliza: normalizedNumero });

            const policy = await getPolicyByNumber(normalizedNumero);

            if (policy) {
                // PÓLIZA ENCONTRADA - mostrar info y menú de acciones
                await this.showPolicyInfo(ctx, policy);
            } else {
                // PÓLIZA NO ENCONTRADA - mostrar menú de opciones
                await this.showPolicyNotFound(ctx, normalizedNumero);
            }
        } catch (error: any) {
            logger.error('Error en handlePolicySearch:', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
        } finally {
            // Limpiar estado
            this.awaitingPolicySearch.delete(chatId, threadId);
        }
    }

    // Mostrar información de póliza encontrada (formato original)
    private async showPolicyInfo(ctx: any, policy: any): Promise<void> {
        const servicios = policy.servicios ?? [];
        const pagos = policy.pagos ?? [];
        const totalServicios = servicios.length;
        const totalPagos = pagos.length;

        // Info de servicios (formato original)
        let serviciosInfo = '*Servicios:* Sin servicios registrados';
        if (totalServicios > 0) {
            const ultimoServicio = servicios[totalServicios - 1];
            const fechaServStr = ultimoServicio.fechaServicio
                ? new Date(ultimoServicio.fechaServicio).toISOString().split('T')[0]
                : '??';
            const origenDestino = ultimoServicio.origenDestino ?? '(Sin Origen/Destino)';
            serviciosInfo =
                `*Servicios:* ${totalServicios}\n` +
                `*Último Servicio:* ${fechaServStr}\n` +
                `*Origen/Destino:* ${origenDestino}`;
        }

        // Info de pagos (NUEVO)
        let pagosInfo = '*Pagos:* Sin pagos registrados';
        if (totalPagos > 0) {
            pagosInfo = `*Pagos:* ${totalPagos} pago(s)`;
        }

        const mensaje = `
📋 *Información de la Póliza*
*Número:* ${policy.numeroPoliza}
*Titular:* ${policy.titular}
📞 *Cel:* ${policy.telefono ?? 'SIN NÚMERO'}

🚗 *Datos del Vehículo:*
*Marca:* ${policy.marca}
*Submarca:* ${policy.submarca}
*Año:* ${policy.año}
*Color:* ${policy.color}
*Serie:* ${policy.serie}
*Placas:* ${policy.placas}

*Aseguradora:* ${policy.aseguradora}
*Agente:* ${policy.agenteCotizador}

${serviciosInfo}

${pagosInfo}
        `.trim();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`)]
        ]);

        await ctx.replyWithMarkdown(mensaje, keyboard);
    }

    // Mostrar opciones cuando la póliza no existe
    private async showPolicyNotFound(ctx: any, numeroPoliza: string): Promise<void> {
        const mensaje =
            `⚠️ **PÓLIZA NO ENCONTRADA**\n\n` +
            `No existe una póliza activa con el número: **${numeroPoliza}**\n\n` +
            `¿Qué deseas hacer?`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📝 Registrar Nueva Póliza', 'accion:registrar')],
            [Markup.button.callback('🔍 Buscar otra', 'accion:polizas')],
            [Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
        ]);

        await ctx.reply(mensaje, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }

    // Menú de Reportes
    private async showReportesMenu(ctx: any): Promise<void> {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📄 PAGOS PENDIENTES', 'accion:reportPaymentPDF')],
            [Markup.button.callback('🚗 PÓLIZAS A MANDAR', 'accion:reportUsed')],
            [Markup.button.callback('🏠 MENÚ PRINCIPAL', 'accion:volver_menu')]
        ]);
        await ctx.editMessageText(
            '📊 **REPORTES Y ESTADÍSTICAS**\n\nSelecciona el tipo de reporte:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            }
        );
    }

    // Menú de Administración - muestra directamente el panel admin completo
    private async showAdminMenu(ctx: any): Promise<void> {
        await AdminMenu.showMainMenu(ctx);
    }

    async clearChatState(
        chatId: number | string,
        threadId?: number | string | null
    ): Promise<void> {
        // Limpiar mapas en memoria
        this.awaitingSaveData.delete(chatId, threadId);
        this.awaitingUploadPolicyNumber.delete(chatId, threadId);
        this.awaitingDeletePolicyNumber.delete(chatId, threadId);
        this.awaitingPaymentPolicyNumber.delete(chatId, threadId);
        this.awaitingPaymentData.delete(chatId, threadId);
        this.awaitingServicePolicyNumber.delete(chatId, threadId);
        this.awaitingServiceData.delete(chatId, threadId);
        this.awaitingPhoneNumber.delete(chatId, threadId);
        this.awaitingOrigen.delete(chatId, threadId);
        this.awaitingDestino.delete(chatId, threadId);
        this.awaitingOrigenDestino.delete(chatId, threadId);
        this.awaitingDeleteReason.delete(chatId, threadId);
        this.awaitingPolicySearch.delete(chatId, threadId);

        // Limpiar stateManager (Redis/Memory)
        const stateNames = [
            'awaitingSaveData',
            'awaitingDeletePolicyNumber',
            'awaitingPaymentPolicyNumber',
            'awaitingPaymentData',
            'awaitingServicePolicyNumber',
            'awaitingServiceData'
        ];
        const deletionPromises = stateNames.map(name =>
            stateManager.deleteState(this._getStateKey(chatId, name, threadId))
        );
        await Promise.all(deletionPromises);
    }

    // --- Facade Methods for TextMessageHandler ---
    async handleSaveData(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyRegistrationHandler.handleSaveData(ctx, messageText);
    }
    async handleUploadFlow(ctx: ChatContext, messageText: string): Promise<void> {
        // Placeholder - upload flow handled elsewhere
        logger.info('handleUploadFlow called', { messageText });
    }
    async handleDeletePolicyFlow(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyDeletionHandler.handleDeletePolicyFlow(ctx, messageText);
    }
    async handleDeleteReason(ctx: ChatContext, messageText: string): Promise<void> {
        await this.policyDeletionHandler.handleDeleteReason(ctx, messageText);
    }
    async handleAddPaymentPolicyNumber(ctx: ChatContext, messageText: string): Promise<void> {
        await this.paymentHandler.handleAddPaymentPolicyNumber(ctx, messageText);
    }
    async handlePaymentData(ctx: ChatContext, messageText: string): Promise<void> {
        await this.paymentHandler.handlePaymentData(ctx, messageText);
    }
    async handleAddServicePolicyNumber(ctx: ChatContext, messageText: string): Promise<void> {
        await this.serviceHandler.handleAddServicePolicyNumber(ctx, messageText);
    }
    async handleServiceData(ctx: ChatContext, messageText: string): Promise<void> {
        await this.serviceHandler.handleServiceData(ctx, messageText);
    }
}

export default CommandHandler;
