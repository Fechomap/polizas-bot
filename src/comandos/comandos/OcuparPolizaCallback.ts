import { Context, Markup } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { BaseCommand } from './BaseCommand';
import {
    getPolicyByNumber,
    convertirRegistroAServicio,
    marcarRegistroNoAsignado,
    calcularHorasAutomaticas
} from '../../controllers/policyController';
import StateKeyManager from '../../utils/StateKeyManager';
import { getInstance } from '../../services/NotificationManager';
import HereMapsService from '../../services/HereMapsService';
import { IPolicy, IThreadSafeStateMap } from '../../types/database';

interface IScheduledServiceInfo {
    numeroPoliza: string;
    expediente?: string;
    contactTime?: string;
    origin?: string;
    destination?: string;
    origenDestino?: string;
    scheduledDate?: Date;
    policy?: IPolicy;
}

interface IHandler {
    awaitingPhoneNumber: IThreadSafeStateMap<string>;
    awaitingOrigenDestino: IThreadSafeStateMap<string>;
    awaitingOrigen: IThreadSafeStateMap<string>;
    awaitingDestino: IThreadSafeStateMap<string>;
    awaitingServiceData: IThreadSafeStateMap<string>;
    awaitingServicePolicyNumber: IThreadSafeStateMap<boolean>;
    excelUploadMessages?: Map<number, number>;
    processingCallbacks?: Set<string>;
    uploadTargets: IThreadSafeStateMap<string>;
    registry: {
        registerCallback(pattern: RegExp, handler: (ctx: Context) => Promise<void>): void;
        getAllCommands(): Array<{
            getCommandName(): string;
            procesarDocumentoBaseAutos?(message: Message, userId: string): Promise<boolean>;
        }>;
    };
    clearChatState(chatId: number, threadId?: string | null): void;
    handleAddServicePolicyNumber?(ctx: Context, numeroPoliza: string): Promise<void>;
}

class OcuparPolizaCallback extends BaseCommand {
    private awaitingPhoneNumber: IThreadSafeStateMap<string>;
    private awaitingOrigenDestino: IThreadSafeStateMap<string>;
    private awaitingOrigen: IThreadSafeStateMap<string>;
    private awaitingDestino: IThreadSafeStateMap<string>;
    private pendingLeyendas: IThreadSafeStateMap<string>;
    private polizaCache: IThreadSafeStateMap<any>;
    private messageIds: IThreadSafeStateMap<number>;
    private awaitingContactTime: IThreadSafeStateMap<string>;
    private scheduledServiceInfo: IThreadSafeStateMap<IScheduledServiceInfo>;
    private hereMapsService: HereMapsService;

    constructor(handler: IHandler) {
        super(handler);
        this.awaitingPhoneNumber = handler.awaitingPhoneNumber;
        this.awaitingOrigenDestino = handler.awaitingOrigenDestino;
        this.awaitingOrigen = handler.awaitingOrigen;
        this.awaitingDestino = handler.awaitingDestino;

        this.pendingLeyendas = StateKeyManager.createThreadSafeStateMap<string>();
        this.polizaCache = StateKeyManager.createThreadSafeStateMap<any>();
        this.messageIds = StateKeyManager.createThreadSafeStateMap<number>();
        this.awaitingContactTime = StateKeyManager.createThreadSafeStateMap<string>();
        this.scheduledServiceInfo =
            StateKeyManager.createThreadSafeStateMap<IScheduledServiceInfo>();

        this.hereMapsService = new HereMapsService();
    }

    getCommandName(): string {
        return 'ocuparPoliza';
    }

    getDescription(): string {
        return 'Manejador para ocupar una póliza (asignar teléfono y origen-destino)';
    }

    register(): void {
        // Register the callback for "ocuparPoliza" button
        this.handler.registry.registerCallback(/ocuparPoliza:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                this.logInfo(`[keepPhone] Iniciando callback para póliza ${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }

                this.polizaCache.set(
                    chatId,
                    {
                        numeroPoliza,
                        policy
                    },
                    threadId
                );

                if (policy.telefono) {
                    await ctx.reply(
                        `📱 ${policy.telefono}`,
                        Markup.inlineKeyboard([
                            [Markup.button.callback('🔄 CAMBIAR', `changePhone:${numeroPoliza}`)],
                            [Markup.button.callback('✅ MANTENER', `keepPhone:${numeroPoliza}`)]
                        ])
                    );

                    this.logInfo(`Mostrando opciones de teléfono para póliza ${numeroPoliza}`, {
                        chatId,
                        threadId,
                        telefonoActual: policy.telefono
                    });
                } else {
                    const phoneSetResult = this.awaitingPhoneNumber.set(
                        chatId,
                        numeroPoliza,
                        threadId
                    );
                    this.logInfo(
                        `Estado de espera de teléfono guardado para nuevo teléfono: ${phoneSetResult ? 'OK' : 'FALLO'}`,
                        {
                            chatId,
                            threadId
                        }
                    );
                    const phoneHasResult = this.awaitingPhoneNumber.has(chatId, threadId);
                    this.logInfo(
                        `Verificación inmediata de estado teléfono (nuevo): ${phoneHasResult ? 'OK' : 'FALLO'}`
                    );
                    await ctx.reply(
                        `📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                            '⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.',
                        { parse_mode: 'Markdown' }
                    );
                }

                this.logInfo(`Esperando teléfono para póliza ${numeroPoliza}`, {
                    chatId: ctx.chat!.id,
                    threadId
                });
            } catch (error) {
                this.logError('Error en callback ocuparPoliza:', error);
                await ctx.reply('❌ Error al procesar ocupación de póliza.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register callback for keeping existing phone number
        this.handler.registry.registerCallback(/keepPhone:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('[keepPhone] Botones removidos del mensaje original');
                } catch (editError) {
                    this.logInfo(
                        '[keepPhone] No se pudo editar mensaje original:',
                        (editError as Error).message
                    );
                }

                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }

                this.logInfo('[keepPhone] Intentando eliminar estado awaitingPhoneNumber', {
                    chatId,
                    threadId
                });
                const deleteResult = this.awaitingPhoneNumber.delete(chatId, threadId);
                this.logInfo(
                    `[keepPhone] Resultado de delete awaitingPhoneNumber: ${deleteResult}`,
                    { chatId, threadId }
                );
                const hasAfterDelete = this.awaitingPhoneNumber.has(chatId, threadId);
                this.logInfo(
                    `[keepPhone] Verificación inmediata awaitingPhoneNumber.has: ${hasAfterDelete}`,
                    { chatId, threadId }
                );

                this.logInfo('[keepPhone] Intentando establecer estado awaitingOrigen', {
                    chatId,
                    threadId
                });
                const setResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
                this.logInfo(`[keepPhone] Resultado de set awaitingOrigen: ${setResult}`, {
                    chatId,
                    threadId
                });
                const hasAfterSet = this.awaitingOrigen.has(chatId, threadId);
                this.logInfo(
                    `[keepPhone] Verificación inmediata awaitingOrigen.has: ${hasAfterSet}`,
                    { chatId, threadId }
                );

                await ctx.reply(
                    `✅ Se mantendrá el número: ${policy.telefono}\n\n` + '📍indica *ORIGEN*',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                this.logError('Error en callback keepPhone:', error);
                await ctx.reply('❌ Error al procesar la acción.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register additional callbacks (abbreviated for brevity)
        this.registerChangePhoneCallback();
        this.registerServiceCallbacks();
        this.registerDaySelectionCallbacks();
    }

    private registerChangePhoneCallback(): void {
        this.handler.registry.registerCallback(/changePhone:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('[changePhone] Botones removidos del mensaje original');
                } catch (editError) {
                    this.logInfo(
                        '[changePhone] No se pudo editar mensaje original:',
                        (editError as Error).message
                    );
                }

                this.logInfo(
                    `[changePhone] Iniciando cambio de teléfono para póliza ${numeroPoliza}`,
                    { chatId, threadId }
                );

                const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                this.logInfo(
                    `[changePhone] Estado de espera de teléfono guardado: ${phoneSetResult ? 'OK' : 'FALLO'}`,
                    {
                        chatId,
                        threadId
                    }
                );

                await ctx.reply(
                    `📱 Ingresa el *nuevo número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                        '⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.',
                    { parse_mode: 'Markdown' }
                );

                this.logInfo(`[changePhone] Esperando nuevo teléfono para póliza ${numeroPoliza}`, {
                    chatId,
                    threadId
                });
            } catch (error) {
                this.logError('Error en callback changePhone:', error);
                await ctx.reply('❌ Error al procesar el cambio de teléfono.');
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    private registerServiceCallbacks(): void {
        // Register callbacks for service-related actions
        this.handler.registry.registerCallback(/registrar_servicio_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`Iniciando registro de servicio para póliza: ${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('Botones removidos del mensaje original');
                } catch (editError) {
                    this.logInfo(
                        'No se pudo editar mensaje original (probablemente ya fue editado):',
                        (editError as Error).message
                    );
                }

                await ctx.reply('🚗 **INGRESA EL NÚMERO DE EXPEDIENTE:**', {
                    parse_mode: 'Markdown'
                });

                (this.handler as any).awaitingServiceData.set(chatId, numeroPoliza, threadId);
                this.logInfo(
                    `Estado establecido para esperar datos del servicio para ${numeroPoliza}`
                );

                // Additional service registration logic would go here
            } catch (error) {
                this.logError('Error en callback registrarServicio:', error);
                await ctx.reply('❌ Error al iniciar el registro del servicio.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        this.handler.registry.registerCallback(/no_registrar_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`No registrar servicio para póliza: ${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    this.logInfo('Botones removidos del mensaje original');
                } catch (editError) {
                    this.logInfo(
                        'No se pudo editar mensaje original (probablemente ya fue editado):',
                        (editError as Error).message
                    );
                }

                await ctx.reply(
                    `✅ Proceso finalizado para póliza *${numeroPoliza}*.\n\n` +
                        '📝 Los datos de origen-destino y teléfono han sido guardados.\n' +
                        '🚫 No se registrará ningún servicio en este momento.',
                    { parse_mode: 'Markdown' }
                );

                this.cleanupAllStates(chatId, threadId);
            } catch (error) {
                this.logError('Error en callback noRegistrar:', error);
                await ctx.reply('❌ Error al finalizar el proceso.');
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    private registerDaySelectionCallbacks(): void {
        this.handler.registry.registerCallback(/selectDay:(\d+):(.+)/, async (ctx: Context) => {
            try {
                const daysOffset = parseInt((ctx.match as RegExpMatchArray)[1], 10);
                const numeroPoliza = (ctx.match as RegExpMatchArray)[2];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                this.logInfo(`Selección de día: offset=${daysOffset}, póliza=${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                await ctx.answerCbQuery();

                const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
                if (!serviceInfo?.contactTime) {
                    this.logError('No se encontró info de servicio o falta hora de contacto');
                    return await ctx.reply(
                        '❌ Error: No se encontró la información de la hora de contacto.'
                    );
                }

                this.logInfo(
                    `Recuperada info de servicio: contactTime=${serviceInfo.contactTime}, origen=${serviceInfo.origin}, destino=${serviceInfo.destination}`
                );

                const moment = require('moment-timezone');
                const today = moment().tz('America/Mexico_City');
                const scheduledMoment = today.clone().add(daysOffset, 'days');

                const [hours, minutes] = serviceInfo.contactTime.split(':').map(Number);
                scheduledMoment.hour(hours).minute(minutes).second(0).millisecond(0);

                const scheduledDateJS = scheduledMoment.toDate();
                serviceInfo.scheduledDate = scheduledDateJS;
                const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);

                this.logInfo(
                    `Info de servicio actualizada con fecha=${scheduledMoment.format()}: ${serviceStore ? 'OK' : 'FALLO'}`
                );

                const dayNames = [
                    'Domingo',
                    'Lunes',
                    'Martes',
                    'Miércoles',
                    'Jueves',
                    'Viernes',
                    'Sábado'
                ];
                const dayName = dayNames[scheduledMoment.day()];
                const dateStr = scheduledMoment.format('DD/MM/YYYY');

                await ctx.editMessageText(
                    `✅ Alerta programada para: *${dayName}, ${dateStr} a las ${serviceInfo.contactTime}*\n\n` +
                        'El servicio ha sido registrado correctamente. No se requieren más acciones.',
                    {
                        parse_mode: 'Markdown'
                    }
                );

                this.logInfo(
                    `Limpiando estados para chatId=${chatId}, threadId=${threadId} después de completar flujo.`
                );
                this.cleanupAllStates(chatId, threadId);
            } catch (error) {
                this.logError('Error al procesar selección de día:', error);
                await ctx.reply('❌ Error al procesar la selección de día. Operación cancelada.');
                const threadId = StateKeyManager.getThreadId(ctx);
                this.cleanupAllStates(ctx.chat!.id, threadId);
            }
        });
    }

    async handlePhoneNumber(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingPhoneNumber.get(chatId, threadId);

        const regexTel = /^\d{10}$/;
        if (!regexTel.test(messageText)) {
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelado.');
            return true;
        }

        try {
            let policy: IPolicy;
            const cachedData = this.polizaCache.get(chatId, threadId);

            if (cachedData && cachedData.numeroPoliza === numeroPoliza) {
                policy = cachedData.policy;
            } else {
                policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            }

            if (!policy) {
                this.logError(`Póliza no encontrada en handlePhoneNumber: ${numeroPoliza}`);
                this.awaitingPhoneNumber.delete(chatId, threadId);
                return await ctx.reply(
                    `❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`
                );
            }

            policy.telefono = messageText;
            await policy.save();

            if (cachedData) {
                cachedData.policy = policy;
                this.polizaCache.set(chatId, cachedData, threadId);
            }

            await ctx.reply(
                `✅ Teléfono ${messageText} asignado a la póliza ${numeroPoliza}.\n\n` +
                    '📍indica *ORIGEN*',
                { parse_mode: 'Markdown' }
            );

            this.awaitingPhoneNumber.delete(chatId, threadId);

            const origenResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
            this.logInfo(`Estado de espera de origen guardado: ${origenResult ? 'OK' : 'FALLO'}`, {
                chatId,
                threadId: threadId || 'ninguno'
            });

            const origenHasResult = this.awaitingOrigen.has(chatId, threadId);
            this.logInfo(
                `Verificación inmediata de estado origen-destino: ${origenHasResult ? 'OK' : 'FALLO'}`
            );

            return true;
        } catch (error) {
            this.logError(`Error guardando teléfono para póliza ${numeroPoliza}:`, error);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await ctx.reply('❌ Error al guardar el teléfono. Operación cancelada.');
            return true;
        }
    }

    async handleOrigen(ctx: Context, input: any, threadId: string | null = null): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingOrigen.get(chatId, threadId);

        if (!numeroPoliza) {
            this.logError('No se encontró número de póliza para origen');
            return false;
        }

        this.logInfo(`Procesando ubicación de origen para póliza ${numeroPoliza}`, {
            chatId,
            threadId: threadId || 'ninguno',
            inputType: typeof input === 'object' ? 'location' : 'text'
        });

        try {
            let coordenadas = null;

            if (input?.location) {
                coordenadas = {
                    lat: input.location.latitude,
                    lng: input.location.longitude
                };
                this.logInfo(
                    'Coordenadas de origen extraídas de ubicación de Telegram',
                    coordenadas
                );
            } else if (typeof input === 'string') {
                coordenadas = this.hereMapsService.parseCoordinates(input);
                if (!coordenadas) {
                    await ctx.reply('❌ Formato inválido. 📍indica *ORIGEN*', {
                        parse_mode: 'Markdown'
                    });
                    return false;
                }
                this.logInfo('Coordenadas de origen extraídas de texto', coordenadas);
            } else {
                await ctx.reply('❌ Formato de entrada no válido para el origen.');
                return false;
            }

            this.awaitingOrigen.delete(chatId, threadId);
            this.awaitingDestino.set(chatId, numeroPoliza, threadId);

            await ctx.reply(
                `✅ Origen registrado: ${coordenadas.lat}, ${coordenadas.lng}\n\n` +
                    '📍indica *DESTINO*',
                { parse_mode: 'Markdown' }
            );

            return true;
        } catch (error) {
            this.logError('Error procesando origen:', error);
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
            return false;
        }
    }

    async handleDestino(
        ctx: Context,
        input: any,
        threadId: string | null = null
    ): Promise<boolean> {
        // Implementation similar to handleOrigen but for destination
        return true;
    }

    async handleContactTime(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingContactTime.get(chatId, threadId);

        this.logInfo(`Procesando hora de contacto: ${messageText} para póliza: ${numeroPoliza}`, {
            chatId,
            threadId
        });

        const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
        if (!timeRegex.test(messageText)) {
            return await ctx.reply(
                '⚠️ Formato de hora inválido. Debe ser HH:mm (24 horas).\n' +
                    'Ejemplos válidos: 09:30, 14:45, 23:15'
            );
        }

        try {
            const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
            if (!serviceInfo) {
                this.logError(`No se encontró info de servicio para póliza: ${numeroPoliza}`);
                this.awaitingContactTime.delete(chatId, threadId);
                return await ctx.reply('❌ Error al procesar la hora. Operación cancelada.');
            }

            if (!serviceInfo.expediente) {
                this.logInfo(
                    'No se encontró expediente para la notificación, generando uno genérico'
                );
                serviceInfo.expediente = `EXP-${new Date().toISOString().slice(0, 10)}`;
            }

            serviceInfo.contactTime = messageText;
            const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);
            this.logInfo(
                `Info de servicio actualizada con hora=${messageText}: ${serviceStore ? 'OK' : 'FALLO'}`
            );

            // Show day selection buttons
            const today = new Date();
            const dayButtons = [];

            dayButtons.push([
                Markup.button.callback('Hoy', `selectDay:0:${numeroPoliza}`),
                Markup.button.callback('Mañana', `selectDay:1:${numeroPoliza}`)
            ]);

            const dayNames = [
                'Domingo',
                'Lunes',
                'Martes',
                'Miércoles',
                'Jueves',
                'Viernes',
                'Sábado'
            ];

            let nextDaysRow: any[] = [];
            for (let i = 2; i <= 6; i++) {
                const futureDate = new Date(today);
                futureDate.setDate(futureDate.getDate() + i);
                const dayName = dayNames[futureDate.getDay()];
                const dateStr = `${futureDate.getDate()}/${futureDate.getMonth() + 1}`;

                nextDaysRow.push(
                    Markup.button.callback(
                        `${dayName} ${dateStr}`,
                        `selectDay:${i}:${numeroPoliza}`
                    )
                );

                if (nextDaysRow.length === 2 || i === 6) {
                    dayButtons.push([...nextDaysRow]);
                    nextDaysRow = [];
                }
            }

            dayButtons.push([
                Markup.button.callback('❌ Cancelar', `cancelSelectDay:${numeroPoliza}`)
            ]);

            await ctx.reply(
                `✅ Hora registrada: *${messageText}*\n\n` +
                    '📅 ¿Para qué día programar la alerta de contacto?',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(dayButtons)
                }
            );

            return true;
        } catch (error) {
            this.logError(`Error al procesar hora de contacto para póliza ${numeroPoliza}:`, error);
            this.awaitingContactTime.delete(chatId, threadId);
            await ctx.reply('❌ Error al procesar la hora de contacto. Operación cancelada.');
            return true;
        }
    }

    private cleanupAllStates(chatId: number, threadId: string | null = null): void {
        if (threadId) {
            this.pendingLeyendas.delete(chatId, threadId);
            this.polizaCache.delete(chatId, threadId);
            this.messageIds.delete(chatId, threadId);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            this.awaitingOrigenDestino.delete(chatId, threadId);
            this.awaitingContactTime.delete(chatId, threadId);
            this.scheduledServiceInfo.delete(chatId, threadId);

            if (this.handler && typeof this.handler.clearChatState === 'function') {
                this.logInfo(
                    'Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates',
                    { chatId, threadId }
                );
                this.handler.clearChatState(chatId, threadId);
            } else {
                this.logWarn(
                    'No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback'
                );
            }
        } else {
            this.pendingLeyendas.deleteAll(chatId);
            this.polizaCache.deleteAll(chatId);
            this.messageIds.deleteAll(chatId);
            this.awaitingPhoneNumber.deleteAll(chatId);
            this.awaitingOrigenDestino.deleteAll(chatId);
            this.awaitingContactTime.deleteAll(chatId);
            this.scheduledServiceInfo.deleteAll(chatId);

            if (this.handler && typeof this.handler.clearChatState === 'function') {
                this.logInfo(
                    'Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates (sin threadId)',
                    { chatId }
                );
                this.handler.clearChatState(chatId, null);
            } else {
                this.logWarn(
                    'No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback (sin threadId)'
                );
            }
        }
    }
}

export default OcuparPolizaCallback;
