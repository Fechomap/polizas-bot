// src/comandos/commandHandler.ts
import { Markup, Telegraf } from 'telegraf';
import CommandRegistry from './comandos/CommandRegistry';
import logger from '../utils/logger';
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
import AdminMenu from '../admin/menus/adminMenu';
import { getStateCleanupService } from '../services/StateCleanupService';
import { getUnifiedStateManagerSync, IUnifiedStateManager } from '../state/UnifiedStateManager';

// Service - Limpieza centralizada de estados
const cleanupService = getStateCleanupService();

// Tipos de estados para el bot
export const STATE_TYPES = {
    AWAITING_SAVE_DATA: 'awaitingSaveData',
    AWAITING_UPLOAD_POLICY_NUMBER: 'awaitingUploadPolicyNumber',
    AWAITING_DELETE_POLICY_NUMBER: 'awaitingDeletePolicyNumber',
    AWAITING_PAYMENT_POLICY_NUMBER: 'awaitingPaymentPolicyNumber',
    AWAITING_PAYMENT_DATA: 'awaitingPaymentData',
    AWAITING_SERVICE_POLICY_NUMBER: 'awaitingServicePolicyNumber',
    AWAITING_SERVICE_DATA: 'awaitingServiceData',
    AWAITING_PHONE_NUMBER: 'awaitingPhoneNumber',
    AWAITING_ORIGEN: 'awaitingOrigen',
    AWAITING_DESTINO: 'awaitingDestino',
    // AWAITING_ORIGEN_DESTINO: Eliminado - código muerto (nunca se establecía)
    AWAITING_DELETE_REASON: 'awaitingDeleteReason',
    AWAITING_POLICY_SEARCH: 'awaitingPolicySearch'
} as const;

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

    /**
     * Obtiene el UnifiedStateManager (singleton inicializado en bot.ts)
     * @throws Error si el manager no está inicializado
     */
    public get stateManager(): IUnifiedStateManager {
        const manager = getUnifiedStateManagerSync();
        if (!manager) {
            throw new Error(
                'UnifiedStateManager no inicializado. Asegúrate de que bot.ts lo inicialice primero.'
            );
        }
        return manager;
    }

    // ==================== MÉTODOS DE ESTADO ====================
    // Estos métodos reemplazan los Maps en memoria anteriores

    async setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | string | null
    ): Promise<void> {
        // Convertir threadId a number si es string
        const numericThreadId = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
        await this.stateManager.setAwaitingState(chatId, stateType, value, numericThreadId);
    }

    async getAwaitingState<T>(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<T | null> {
        const numericThreadId = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
        return this.stateManager.getAwaitingState<T>(chatId, stateType, numericThreadId);
    }

    async hasAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<boolean> {
        const numericThreadId = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
        return this.stateManager.hasAwaitingState(chatId, stateType, numericThreadId);
    }

    async deleteAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<void> {
        const numericThreadId = typeof threadId === 'string' ? parseInt(threadId, 10) : threadId;
        await this.stateManager.deleteAwaitingState(chatId, stateType, numericThreadId);
    }

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

    // Este método ya no se usa - mantenido para compatibilidad temporal
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
        // Volver al menú principal - LIMPIEZA CENTRALIZADA
        this.bot.action('accion:volver_menu', async (ctx: any) => {
            await ctx.answerCbQuery();
            const chatId = ctx.chat?.id;
            const threadId = BaseCommand.getThreadId(ctx);
            const userId = ctx.from?.id;

            // LIMPIEZA CENTRALIZADA DE TODOS LOS ESTADOS
            if (chatId) {
                cleanupService.limpiarTodosLosEstados(chatId, threadId, userId, this);
                logger.info('🧹 Todos los estados limpiados vía accion:volver_menu', {
                    chatId,
                    threadId: threadId ?? 'ninguno'
                });
            }

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

        // Callback para mostrar menú de "Más Acciones" de la póliza
        this.bot.action(/masAcciones:(.+)/, async (ctx: any) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback masAcciones para: ${numeroPoliza}`);
                await ctx.answerCbQuery();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('💰 Agregar Pago', `addPayment:${numeroPoliza}`)],
                    [Markup.button.callback('🔧 Agregar Servicio', `addService:${numeroPoliza}`)],
                    [Markup.button.callback('📁 Subir Archivos', `uploadFiles:${numeroPoliza}`)],
                    [Markup.button.callback('🗑️ Dar de Baja', `deletePolicy:${numeroPoliza}`)],
                    [Markup.button.callback('⬅️ Volver', `getPoliza:${numeroPoliza}`)],
                    [Markup.button.callback('🏠 Menú Principal', 'accion:volver_menu')]
                ]);

                await ctx.editMessageText(
                    `⚙️ *MÁS ACCIONES*\n\n` +
                        `Póliza: *${numeroPoliza}*\n\n` +
                        `Selecciona una acción:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    }
                );
            } catch (error: any) {
                logger.error('Error en callback masAcciones:', error);
                await ctx.reply('❌ Error al mostrar acciones.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Callback para agregar pago desde el menú de acciones
        this.bot.action(/addPayment:(.+)/, async (ctx: any) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback addPayment para: ${numeroPoliza}`);
                await ctx.answerCbQuery();

                const chatId = ctx.chat?.id;
                const threadId = BaseCommand.getThreadId(ctx);

                // Limpiar estados previos
                await this.clearChatState(chatId, threadId);

                // Guardar estado en UnifiedStateManager (Redis)
                await this.setAwaitingState(
                    chatId,
                    STATE_TYPES.AWAITING_PAYMENT_DATA,
                    numeroPoliza,
                    threadId
                );

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancelar', `masAcciones:${numeroPoliza}`)]
                ]);

                await ctx.editMessageText(
                    `💰 *AGREGAR PAGO*\n\n` +
                        `Póliza: *${numeroPoliza}*\n\n` +
                        `Ingresa el monto del pago:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    }
                );
            } catch (error: any) {
                logger.error('Error en callback addPayment:', error);
                await ctx.reply('❌ Error al iniciar el proceso de pago.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Callback para agregar servicio desde el menú de acciones
        this.bot.action(/addService:(.+)/, async (ctx: any) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback addService para: ${numeroPoliza}`);
                await ctx.answerCbQuery();

                const chatId = ctx.chat?.id;
                const threadId = BaseCommand.getThreadId(ctx);

                // Limpiar estados previos
                await this.clearChatState(chatId, threadId);

                // Guardar estado en UnifiedStateManager (Redis)
                await this.setAwaitingState(
                    chatId,
                    STATE_TYPES.AWAITING_SERVICE_DATA,
                    numeroPoliza,
                    threadId
                );

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancelar', `masAcciones:${numeroPoliza}`)]
                ]);

                await ctx.editMessageText(
                    `🔧 *AGREGAR SERVICIO*\n\n` +
                        `Póliza: *${numeroPoliza}*\n\n` +
                        `Ingresa los datos del servicio en el siguiente formato:\n\n` +
                        `\`Expediente\`\n` +
                        `\`Origen - Destino\`\n` +
                        `\`Costo\`\n` +
                        `\`Fecha (DD/MM/YYYY)\` _(opcional)_`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    }
                );
            } catch (error: any) {
                logger.error('Error en callback addService:', error);
                await ctx.reply('❌ Error al iniciar el proceso de servicio.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Callback para subir archivos desde el menú de acciones
        this.bot.action(/uploadFiles:(.+)/, async (ctx: any) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback uploadFiles para: ${numeroPoliza}`);
                await ctx.answerCbQuery();

                const chatId = ctx.chat?.id;
                const threadId = BaseCommand.getThreadId(ctx);

                // Limpiar estados previos
                await this.clearChatState(chatId, threadId);

                // Guardar estado en UnifiedStateManager (Redis)
                await this.setAwaitingState(
                    chatId,
                    STATE_TYPES.AWAITING_UPLOAD_POLICY_NUMBER,
                    numeroPoliza,
                    threadId
                );

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancelar', `masAcciones:${numeroPoliza}`)]
                ]);

                await ctx.editMessageText(
                    `📁 *SUBIR ARCHIVOS*\n\n` +
                        `Póliza: *${numeroPoliza}*\n\n` +
                        `Envía las fotos o PDFs que deseas agregar a esta póliza.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    }
                );
            } catch (error: any) {
                logger.error('Error en callback uploadFiles:', error);
                await ctx.reply('❌ Error al iniciar la subida de archivos.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Callback para dar de baja/eliminar póliza desde el menú de acciones
        this.bot.action(/deletePolicy:(.+)/, async (ctx: any) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback deletePolicy para: ${numeroPoliza}`);
                await ctx.answerCbQuery();

                const chatId = ctx.chat?.id;
                const threadId = BaseCommand.getThreadId(ctx);

                // Limpiar estados previos
                await this.clearChatState(chatId, threadId);

                // Guardar estado en UnifiedStateManager (Redis) - array de pólizas
                await this.setAwaitingState(
                    chatId,
                    STATE_TYPES.AWAITING_DELETE_REASON,
                    [numeroPoliza],
                    threadId
                );

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancelar', `masAcciones:${numeroPoliza}`)]
                ]);

                await ctx.editMessageText(
                    `🗑️ *DAR DE BAJA PÓLIZA*\n\n` +
                        `Póliza: *${numeroPoliza}*\n\n` +
                        `¿Estás seguro de dar de baja esta póliza?\n\n` +
                        `Escribe el motivo de la baja (o escribe "ninguno" si no hay motivo):`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    }
                );
            } catch (error: any) {
                logger.error('Error en callback deletePolicy:', error);
                await ctx.reply('❌ Error al iniciar el proceso de eliminación.');
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

        // Activar estado de espera en UnifiedStateManager (Redis)
        await this.setAwaitingState(chatId, STATE_TYPES.AWAITING_POLICY_SEARCH, true, threadId);

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
            await this.deleteAwaitingState(chatId, STATE_TYPES.AWAITING_POLICY_SEARCH, threadId);
        }
    }

    // Mostrar información de póliza encontrada (formato original)
    private async showPolicyInfo(ctx: any, policy: any): Promise<void> {
        const servicios = policy.servicios ?? [];
        const registros = policy.registros ?? [];
        const pagos = policy.pagos ?? [];
        const totalServicios = servicios.length;
        // Solo contar pagos REALIZADOS (dinero real recibido)
        const pagosRealizados = pagos.filter((p: any) => p.estado === 'REALIZADO');
        const totalPagos = pagosRealizados.length;

        // Info de servicios (formato original)
        let serviciosInfo = '*Servicios:* Sin servicios registrados';
        if (totalServicios > 0) {
            const ultimoServicio = servicios[totalServicios - 1];
            const fechaServStr = ultimoServicio.fechaServicio
                ? new Date(ultimoServicio.fechaServicio).toISOString().split('T')[0]
                : '??';
            // Buscar origenDestino en servicio, si no existe buscar en registro asociado
            let origenDestino = ultimoServicio.origenDestino;
            if (!origenDestino && registros.length > 0) {
                // Buscar en registros (puede estar ahí si se migró de MongoDB)
                const ultimoRegistro = registros[registros.length - 1];
                origenDestino = ultimoRegistro?.origenDestino;
            }
            origenDestino = origenDestino ?? '(Sin Origen/Destino)';
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
*Año:* ${policy.anio ?? policy.año ?? 'N/A'}
*Color:* ${policy.color}
*Serie:* ${policy.serie}
*Placas:* ${policy.placas}

*Aseguradora:* ${policy.aseguradora}
*Agente:* ${policy.agenteCotizador}

${serviciosInfo}

${pagosInfo}
        `.trim();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`)],
            [Markup.button.callback('⚙️ Más Acciones', `masAcciones:${policy.numeroPoliza}`)]
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
        const numericChatId = typeof chatId === 'string' ? parseInt(chatId) : chatId;
        const numericThreadId = threadId
            ? typeof threadId === 'string'
                ? parseInt(threadId)
                : threadId
            : null;

        // Usar UnifiedStateManager para limpiar TODOS los estados de este chat
        await this.stateManager.clearAllStates(numericChatId, numericThreadId);

        logger.debug('Estados limpiados para chat', {
            chatId: numericChatId,
            threadId: numericThreadId
        });
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
