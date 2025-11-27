import { Context, Markup } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { BaseCommand, IBaseHandler } from './BaseCommand';
import logger from '../../utils/logger';
import {
    getPolicyByNumber,
    convertirRegistroAServicio,
    marcarRegistroNoAsignado,
    calcularHorasAutomaticas
} from '../../controllers/policyController';
import StateKeyManager from '../../utils/StateKeyManager';
import { getInstance } from '../../services/NotificationManager';
import HereMapsService from '../../services/HereMapsService';
import { IPolicy } from '../../types/database';
import Policy from '../../models/policy';
import Vehicle from '../../models/vehicle';
import type { IThreadSafeStateMap } from '../../utils/StateKeyManager';
import flowStateManager from '../../utils/FlowStateManager';

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

interface IHandler extends IBaseHandler {
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
    public awaitingContactTime: IThreadSafeStateMap<string>;
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
            const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
            await this.handleOcuparPoliza(ctx, numeroPoliza);
        });

        // Register callback for keeping existing phone number
        this.handler.registry.registerCallback(/keepPhone:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('[keepPhone] Botones removidos del mensaje original');
                } catch (editError) {
                    logger.info('[keepPhone] No se pudo editar mensaje original:', {
                        error: (editError as Error).message
                    });
                }

                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
                if (!policy) {
                    await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                    return;
                }

                logger.info('[keepPhone] Intentando eliminar estado awaitingPhoneNumber', {
                    chatId,
                    threadId
                });
                const deleteResult = this.awaitingPhoneNumber.delete(chatId, threadId);
                logger.info(
                    `[keepPhone] Resultado de delete awaitingPhoneNumber: ${deleteResult}`,
                    { chatId, threadId }
                );
                const hasAfterDelete = this.awaitingPhoneNumber.has(chatId, threadId);
                logger.info(
                    `[keepPhone] Verificación inmediata awaitingPhoneNumber.has: ${hasAfterDelete}`,
                    { chatId, threadId }
                );

                logger.info('[keepPhone] Intentando establecer estado awaitingOrigen', {
                    chatId,
                    threadId
                });
                const setResult = this.awaitingOrigen.set(chatId, numeroPoliza, threadId);
                logger.info(`[keepPhone] Resultado de set awaitingOrigen: ${setResult}`, {
                    chatId,
                    threadId
                });
                const hasAfterSet = this.awaitingOrigen.has(chatId, threadId);
                logger.info(
                    `[keepPhone] Verificación inmediata awaitingOrigen.has: ${hasAfterSet}`,
                    { chatId, threadId }
                );

                await ctx.reply(
                    `✅ Se mantendrá el número: ${policy.telefono}\n\n` + '📍indica *ORIGEN*',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                logger.error('Error en callback keepPhone:', error);
                await ctx.reply('❌ Error al procesar la acción.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Register additional callbacks (abbreviated for brevity)
        this.registerChangePhoneCallback();
        this.registerServiceCallbacks();
        this.registerAssignmentCallbacks();
        this.registerDaySelectionCallbacks();
    }

    public async handleOcuparPoliza(ctx: Context, numeroPoliza: string): Promise<void> {
        try {
            const chatId = ctx.chat!.id;
            const threadId = StateKeyManager.getThreadId(ctx);
            logger.info(`[keepPhone] Iniciando callback para póliza ${numeroPoliza}`, {
                chatId,
                threadId
            });

            const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            if (!policy) {
                await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                return;
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

                logger.info(`Mostrando opciones de teléfono para póliza ${numeroPoliza}`, {
                    chatId,
                    threadId,
                    telefonoActual: policy.telefono
                });
            } else {
                const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                logger.info(
                    `Estado de espera de teléfono guardado para nuevo teléfono: ${phoneSetResult ? 'OK' : 'FALLO'}`,
                    {
                        chatId,
                        threadId
                    }
                );
                const phoneHasResult = this.awaitingPhoneNumber.has(chatId, threadId);
                logger.info(
                    `Verificación inmediata de estado teléfono (nuevo): ${phoneHasResult ? 'OK' : 'FALLO'}`
                );
                await ctx.reply(
                    `📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                        '⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.',
                    { parse_mode: 'Markdown' }
                );
            }

            logger.info(`Esperando teléfono para póliza ${numeroPoliza}`, {
                chatId: ctx.chat!.id,
                threadId
            });
        } catch (error) {
            logger.error('Error en callback ocuparPoliza:', error);
            await ctx.reply('❌ Error al procesar ocupación de póliza.');
        } finally {
            try {
                await ctx.answerCbQuery();
            } catch {}
        }
    }

    private registerChangePhoneCallback(): void {
        this.handler.registry.registerCallback(/changePhone:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('[changePhone] Botones removidos del mensaje original');
                } catch (editError) {
                    logger.info('[changePhone] No se pudo editar mensaje original:', {
                        error: (editError as Error).message
                    });
                }

                logger.info(
                    `[changePhone] Iniciando cambio de teléfono para póliza ${numeroPoliza}`,
                    { chatId, threadId }
                );

                const phoneSetResult = this.awaitingPhoneNumber.set(chatId, numeroPoliza, threadId);
                logger.info(
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

                logger.info(`[changePhone] Esperando nuevo teléfono para póliza ${numeroPoliza}`, {
                    chatId,
                    threadId
                });
            } catch (error) {
                logger.error('Error en callback changePhone:', error);
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

                logger.info(`Iniciando registro de servicio para póliza: ${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('Botones removidos del mensaje original');
                } catch (editError) {
                    logger.info(
                        'No se pudo editar mensaje original (probablemente ya fue editado):',
                        { error: (editError as Error).message }
                    );
                }

                // Obtener datos de la póliza y geocoding para enviar leyenda azul de forma asíncrona
                setImmediate(async () => {
                    try {
                        const threadIdStr = threadId ? String(threadId) : null;
                        const flowState = flowStateManager.getState(
                            chatId,
                            numeroPoliza,
                            threadIdStr
                        );
                        const policy = await getPolicyByNumber(numeroPoliza);

                        if (flowState && policy && flowState.geocoding) {
                            const enhancedData = {
                                origenGeo: flowState.geocoding.origen,
                                destinoGeo: flowState.geocoding.destino,
                                googleMapsUrl:
                                    flowState.googleMapsUrl || flowState.rutaInfo?.googleMapsUrl,
                                leyenda: '' // No usado en la versión azul
                            };

                            const targetGroupId = parseInt(
                                process.env.TELEGRAM_GROUP_ID || '-1002212807945'
                            );
                            logger.info(
                                `Enviando leyenda azul al grupo ${targetGroupId} para registro de servicio`
                            );

                            // Enviar leyenda azul de forma asíncrona y rápida
                            this.enviarLeyendaConEfectoTypingAzul(
                                ctx.telegram,
                                targetGroupId,
                                policy,
                                enhancedData
                            ).catch(error => {
                                logger.error('Error enviando leyenda azul:', error);
                            });
                        } else {
                            logger.warn('No se pudo obtener datos completos para leyenda azul', {
                                hasFlowState: !!flowState,
                                hasPolicy: !!policy,
                                hasGeocoding: !!flowState?.geocoding
                            });
                        }
                    } catch (error) {
                        logger.error('Error al obtener datos para leyenda azul:', error);
                    }
                });

                await ctx.reply('🚗 **INGRESA EL NÚMERO DE EXPEDIENTE:**', {
                    parse_mode: 'Markdown'
                });

                (this.handler as any).awaitingServiceData.set(chatId, numeroPoliza, threadId);
                logger.info(
                    `Estado establecido para esperar datos del servicio para ${numeroPoliza}`
                );
            } catch (error) {
                logger.error('Error en callback registrarServicio:', error);
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

                logger.info(`No registrar servicio para póliza: ${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('Botones removidos del mensaje original');
                } catch (editError) {
                    logger.info(
                        'No se pudo editar mensaje original (probablemente ya fue editado):',
                        { error: (editError as Error).message }
                    );
                }

                await ctx.reply(
                    `✅ Proceso finalizado para póliza *${numeroPoliza}*.\n\n` +
                        '📝 Los datos de origen-destino y teléfono han sido guardados.\n' +
                        '🚫 No se registrará ningún servicio en este momento.',
                    { parse_mode: 'Markdown' }
                );

                const threadIdStr = threadId ? String(threadId) : null;
                this.cleanupAllStates(chatId, threadIdStr);
            } catch (error) {
                logger.error('Error en callback noRegistrar:', error);
                await ctx.reply('❌ Error al finalizar el proceso.');
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    private registerAssignmentCallbacks(): void {
        // Register callback for "Asignado" button
        this.handler.registry.registerCallback(/asig_yes_(.+)_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const numeroRegistro = parseInt((ctx.match as RegExpMatchArray)[2]);
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // PROTECCIÓN ANTI-DOBLE-CLIC: Verificar si ya se está procesando
                const processingKey = `${chatId}_${numeroPoliza}_${numeroRegistro}`;
                if ((this.handler as any).processingCallbacks?.has(processingKey)) {
                    logger.warn(
                        `[ANTI-DUPLICATE] Callback asig_yes ya procesándose para ${processingKey}, ignorando`
                    );
                    await ctx.answerCbQuery('⚠️ Procesando... espera un momento');
                    return;
                }

                // Marcar como procesándose
                if (!(this.handler as any).processingCallbacks) {
                    (this.handler as any).processingCallbacks = new Set();
                }
                (this.handler as any).processingCallbacks.add(processingKey);

                logger.info(
                    `Registro ${numeroRegistro} marcado como ASIGNADO para póliza: ${numeroPoliza}`,
                    { chatId, threadId }
                );

                // Edit the original message to remove buttons
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('Botones ASIGNADO/NO ASIGNADO removidos del mensaje original');
                } catch (editError) {
                    logger.info(
                        'No se pudo editar mensaje original (probablemente ya fue editado):',
                        { error: (editError as Error).message }
                    );
                }

                // Obtener la póliza para extraer datos del registro
                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
                if (!policy) {
                    await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                    return;
                }

                // Buscar el registro específico
                const registro = policy.registros.find(
                    (r: any) => r.numeroRegistro === numeroRegistro
                );
                if (!registro) {
                    await ctx.reply(
                        `❌ Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}.`
                    );
                    return;
                }

                // Calcular horas automáticas (fecha base = ahora)
                const fechaBase = new Date();
                const tiempoTrayecto = registro.rutaInfo?.tiempoMinutos || 0;
                const horasCalculadas = calcularHorasAutomaticas(fechaBase, tiempoTrayecto);

                logger.info('Horas calculadas automáticamente:', {
                    contacto: horasCalculadas.fechaContactoProgramada,
                    termino: horasCalculadas.fechaTerminoProgramada,
                    minutosContacto: horasCalculadas.minutosContacto,
                    minutosTermino: horasCalculadas.minutosTermino
                });

                // Convertir registro a servicio confirmado
                const resultado = await convertirRegistroAServicio(
                    numeroPoliza,
                    numeroRegistro,
                    horasCalculadas.fechaContactoProgramada,
                    horasCalculadas.fechaTerminoProgramada
                );

                if (!resultado) {
                    await ctx.reply(`❌ Error al convertir registro ${numeroRegistro} a servicio.`);
                    return;
                }

                const { numeroServicio } = resultado;

                // ✅ NUEVA LÓGICA: Detectar y eliminar NIVs automáticamente
                try {
                    const policy = await Policy.findOne({ numeroPoliza });
                    if (policy && policy.tipoPoliza === 'NIV' && policy.totalServicios >= 1) {
                        logger.info(
                            `Detectado NIV utilizado: ${numeroPoliza}. Iniciando eliminación automática.`
                        );

                        // Marcar póliza NIV como eliminada
                        await Policy.findByIdAndUpdate(policy._id, {
                            estado: 'ELIMINADO',
                            fechaEliminacion: new Date(),
                            motivoEliminacion: 'NIV utilizado - Eliminación automática'
                        });

                        // Marcar vehículo asociado como eliminado
                        if (policy.vehicleId) {
                            await Vehicle.findByIdAndUpdate(policy.vehicleId, {
                                estado: 'ELIMINADO'
                            });
                            logger.info(
                                `Vehículo ${policy.vehicleId} marcado como eliminado (NIV consumido)`
                            );
                        }

                        // Log de auditoría
                        logger.info(
                            `NIV ${numeroPoliza} eliminado automáticamente tras conversión a servicio ${numeroServicio}`
                        );

                        // Mensaje adicional al usuario sobre el NIV consumido
                        await ctx.reply(
                            '⚡ *NIV CONSUMIDO*\n\n' +
                                `El NIV \`${numeroPoliza}\` ha sido utilizado y se ha eliminado automáticamente del sistema.\n` +
                                'Ya no aparecerá en reportes futuros.',
                            { parse_mode: 'Markdown' }
                        );
                    }
                } catch (nivError: any) {
                    logger.error('Error procesando eliminación automática de NIV:', {
                        error: nivError.message,
                        numeroPoliza,
                        numeroServicio
                    });
                    // No fallar todo el proceso por esto, solo logar el error
                }

                // Formatear fechas para mostrar
                const fechaContactoStr = horasCalculadas.fechaContactoProgramada.toLocaleString(
                    'es-MX',
                    {
                        timeZone: 'America/Mexico_City',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }
                );

                const fechaTerminoStr = horasCalculadas.fechaTerminoProgramada.toLocaleString(
                    'es-MX',
                    {
                        timeZone: 'America/Mexico_City',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }
                );

                // Confirmar conversión con detalles automáticos
                await ctx.reply(
                    `✅ *Registro convertido a Servicio #${numeroServicio}*\n\n` +
                        '✨Los cálculos fueron realizados✨\n\n' +
                        '⏰ *Programación:*\n' +
                        `📞 Contacto: ${fechaContactoStr}\n` +
                        `🏁 Término: ${fechaTerminoStr}\n\n` +
                        '🤖 Las notificaciones se enviarán automáticamente.',
                    { parse_mode: 'Markdown' }
                );

                // Programar notificaciones automáticas usando el sistema existente
                try {
                    const notificationManager = getInstance();

                    if (!notificationManager?.isInitialized) {
                        logger.error(
                            'NotificationManager no está inicializado para notificaciones automáticas'
                        );
                    } else {
                        // Formatear horas para notificaciones (HH:mm formato)
                        const contactTimeStr =
                            horasCalculadas.fechaContactoProgramada.toLocaleTimeString('es-MX', {
                                timeZone: 'America/Mexico_City',
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                        const terminoTimeStr =
                            horasCalculadas.fechaTerminoProgramada.toLocaleTimeString('es-MX', {
                                timeZone: 'America/Mexico_City',
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                        // Obtener datos del registro para notificaciones
                        const origenDestino = registro.origenDestino || 'Origen - Destino';
                        const marcaModelo = `${policy.marca} ${policy.submarca} (${policy.año})`;

                        logger.info('Programando notificaciones automáticas:', {
                            expediente: registro.numeroExpediente,
                            contacto: contactTimeStr,
                            termino: terminoTimeStr,
                            fechaContacto: horasCalculadas.fechaContactoProgramada.toISOString(),
                            fechaTermino: horasCalculadas.fechaTerminoProgramada.toISOString()
                        });

                        // PROGRAMACIÓN SECUENCIAL DE NOTIFICACIONES (ANTI-DUPLICADOS)
                        const results: Array<
                            | { status: 'fulfilled'; value: any }
                            | { status: 'rejected'; reason: any }
                        > = [
                            { status: 'rejected', reason: null },
                            { status: 'rejected', reason: null }
                        ];

                        try {
                            // 1. Programar notificación de CONTACTO primero
                            const notifContacto = await notificationManager.scheduleNotification({
                                numeroPoliza: numeroPoliza,
                                targetGroupId: parseInt(
                                    process.env.TELEGRAM_GROUP_ID || '-1002212807945'
                                ),
                                contactTime: contactTimeStr,
                                expedienteNum: registro.numeroExpediente,
                                origenDestino: origenDestino,
                                marcaModelo: marcaModelo,
                                colorVehiculo: policy.color,
                                placas: policy.placas,
                                telefono: policy.telefono,
                                scheduledDate: horasCalculadas.fechaContactoProgramada,
                                tipoNotificacion: 'CONTACTO'
                            });
                            results[0] = { status: 'fulfilled', value: notifContacto };
                        } catch (contactoError) {
                            results[0] = { status: 'rejected', reason: contactoError };
                            logger.error(
                                'Error programando notificación de CONTACTO:',
                                contactoError
                            );
                        }

                        try {
                            // 2. Programar notificación de TÉRMINO después
                            const notifTermino = await notificationManager.scheduleNotification({
                                numeroPoliza: numeroPoliza,
                                targetGroupId: parseInt(
                                    process.env.TELEGRAM_GROUP_ID || '-1002212807945'
                                ),
                                contactTime: terminoTimeStr,
                                expedienteNum: registro.numeroExpediente,
                                origenDestino: origenDestino,
                                marcaModelo: marcaModelo,
                                colorVehiculo: policy.color,
                                placas: policy.placas,
                                telefono: policy.telefono,
                                scheduledDate: horasCalculadas.fechaTerminoProgramada,
                                tipoNotificacion: 'TERMINO'
                            });
                            results[1] = { status: 'fulfilled', value: notifTermino };
                        } catch (terminoError) {
                            results[1] = { status: 'rejected', reason: terminoError };
                            logger.error(
                                'Error programando notificación de TÉRMINO:',
                                terminoError
                            );
                        }

                        // Procesar resultados
                        const notificationContacto =
                            results[0].status === 'fulfilled' ? results[0].value : null;
                        const notificationTermino =
                            results[1].status === 'fulfilled' ? results[1].value : null;

                        if (notificationContacto) {
                            logger.info(
                                `✅ Notificación de CONTACTO programada ID: ${notificationContacto._id} para ${contactTimeStr}`
                            );
                        } else {
                            logger.error(
                                'Error programando notificación de CONTACTO:',
                                results[0].status === 'rejected'
                                    ? results[0].reason
                                    : 'Error desconocido'
                            );
                        }

                        if (notificationTermino) {
                            logger.info(
                                `✅ Notificación de TÉRMINO programada ID: ${notificationTermino._id} para ${terminoTimeStr}`
                            );
                        } else {
                            logger.error(
                                'Error programando notificación de TÉRMINO:',
                                results[1].status === 'rejected'
                                    ? results[1].reason
                                    : 'Error desconocido'
                            );
                        }

                        // Validar que al menos una notificación se haya programado exitosamente
                        if (!notificationContacto && !notificationTermino) {
                            throw new Error('No se pudo programar ninguna notificación automática');
                        }
                    }
                } catch (notifyError) {
                    logger.error('Error al programar notificaciones automáticas:', notifyError);
                    // Continuar a pesar del error, no es crítico para el flujo principal
                }

                logger.info(
                    `Servicio #${numeroServicio} confirmado y programado para póliza ${numeroPoliza}`
                );
            } catch (error) {
                logger.error('Error en callback assignedService:', error);
                await ctx.reply('❌ Error al procesar la asignación del servicio.');
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdStr = threadId ? String(threadId) : null;
                this.cleanupAllStates(ctx.chat!.id, threadIdStr);
            } finally {
                // LIMPIAR ESTADO DE PROCESAMIENTO
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const numeroRegistro = parseInt((ctx.match as RegExpMatchArray)[2]);
                const processingKey = `${ctx.chat!.id}_${numeroPoliza}_${numeroRegistro}`;
                if ((this.handler as any).processingCallbacks) {
                    (this.handler as any).processingCallbacks.delete(processingKey);
                    logger.info(
                        `[ANTI-DUPLICATE] Estado de procesamiento limpiado para ${processingKey}`
                    );
                }
                await ctx.answerCbQuery();
            }
        });

        // Register callback for "No asignado" button
        this.handler.registry.registerCallback(/asig_no_(.+)_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const numeroRegistro = parseInt((ctx.match as RegExpMatchArray)[2]);
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                logger.info(
                    `Registro ${numeroRegistro} marcado como NO ASIGNADO para póliza: ${numeroPoliza}`,
                    { chatId, threadId }
                );

                // Edit the original message to remove buttons
                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                    logger.info('Botones ASIGNADO/NO ASIGNADO removidos del mensaje original');
                } catch (editError) {
                    logger.info(
                        'No se pudo editar mensaje original (probablemente ya fue editado):',
                        { error: (editError as Error).message }
                    );
                }

                // Marcar registro como no asignado en la base de datos
                const resultado = await marcarRegistroNoAsignado(numeroPoliza, numeroRegistro);

                if (resultado) {
                    await ctx.reply(
                        `✅ Registro ${numeroRegistro} marcado como *NO ASIGNADO* para póliza ${numeroPoliza}.\n\n` +
                            '📝 El registro permanecerá en la base de datos pero no se programará ningún servicio.',
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.reply(
                        `❌ Error al marcar registro ${numeroRegistro} como NO ASIGNADO.`
                    );
                }

                logger.info(
                    `Registro ${numeroRegistro} procesado como NO ASIGNADO para póliza ${numeroPoliza}`
                );
            } catch (error) {
                logger.error('Error en callback noAssignedService:', error);
                await ctx.reply('❌ Error al procesar la NO asignación del servicio.');
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

                logger.info(`Selección de día: offset=${daysOffset}, póliza=${numeroPoliza}`, {
                    chatId,
                    threadId
                });

                await ctx.answerCbQuery();

                const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
                if (!serviceInfo?.contactTime) {
                    logger.error('No se encontró info de servicio o falta hora de contacto');
                    await ctx.reply(
                        '❌ Error: No se encontró la información de la hora de contacto.'
                    );
                    return;
                }

                logger.info(
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

                logger.info(
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

                logger.info(
                    `Limpiando estados para chatId=${chatId}, threadId=${threadId} después de completar flujo.`
                );
                const threadIdStr = threadId ? String(threadId) : null;
                this.cleanupAllStates(chatId, threadIdStr);
            } catch (error) {
                logger.error('Error al procesar selección de día:', error);
                await ctx.reply('❌ Error al procesar la selección de día. Operación cancelada.');
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdStr = threadId ? String(threadId) : null;
                this.cleanupAllStates(ctx.chat!.id, threadIdStr);
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
                if (!numeroPoliza) {
                    logger.error(`Número de póliza no encontrado en handlePhoneNumber`);
                    this.awaitingPhoneNumber.delete(chatId, threadId);
                    await ctx.reply(
                        '❌ Error: Número de póliza no encontrado. Operación cancelada.'
                    );
                    return true;
                }
                policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            }

            if (!policy) {
                logger.error(`Póliza no encontrada en handlePhoneNumber: ${numeroPoliza}`);
                this.awaitingPhoneNumber.delete(chatId, threadId);
                await ctx.reply(
                    `❌ Error: Póliza ${numeroPoliza} no encontrada. Operación cancelada.`
                );
                return true;
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

            const origenResult = this.awaitingOrigen.set(chatId, numeroPoliza || '', threadId);
            logger.info(`Estado de espera de origen guardado: ${origenResult ? 'OK' : 'FALLO'}`, {
                chatId,
                threadId: threadId || 'ninguno'
            });

            const origenHasResult = this.awaitingOrigen.has(chatId, threadId);
            logger.info(
                `Verificación inmediata de estado origen-destino: ${origenHasResult ? 'OK' : 'FALLO'}`
            );

            return true;
        } catch (error) {
            logger.error(`Error guardando teléfono para póliza ${numeroPoliza}:`, error);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            await ctx.reply('❌ Error al guardar el teléfono. Operación cancelada.');
            return true;
        }
    }

    async handleOrigen(ctx: Context, input: any, threadId: string | null = null): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingOrigen.get(chatId, threadId);

        if (!numeroPoliza) {
            logger.error('No se encontró número de póliza para origen');
            return false;
        }

        logger.info(`Procesando ubicación de origen para póliza ${numeroPoliza}`, {
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
                logger.info(
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
                logger.info('Coordenadas de origen extraídas de texto', coordenadas);
            } else {
                await ctx.reply('❌ Formato de entrada no válido para el origen.');
                return false;
            }

            // Guardar coordenadas de origen en FlowStateManager
            flowStateManager.saveState(
                chatId,
                numeroPoliza,
                { origenCoords: coordenadas },
                threadId
            );

            // También almacenar en caché local para compatibilidad
            const cachedData = this.polizaCache.get(chatId, threadId);
            if (cachedData) {
                cachedData.origenCoords = coordenadas;
                this.polizaCache.set(chatId, cachedData, threadId);
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
            logger.error('Error procesando origen:', error);
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
            return false;
        }
    }

    async handleDestino(
        ctx: Context,
        input: any,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingDestino.get(chatId, threadId);

        if (!numeroPoliza) {
            logger.error('No se encontró número de póliza para destino');
            return false;
        }

        logger.info(`Procesando ubicación de destino para póliza ${numeroPoliza}`, {
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
                logger.info(
                    'Coordenadas de destino extraídas de ubicación de Telegram',
                    coordenadas
                );
            } else if (typeof input === 'string') {
                coordenadas = this.hereMapsService.parseCoordinates(input);
                if (!coordenadas) {
                    await ctx.reply('❌ Formato inválido. 📍indica *DESTINO*', {
                        parse_mode: 'Markdown'
                    });
                    return false;
                }
                logger.info('Coordenadas de destino extraídas de texto', coordenadas);
            } else {
                await ctx.reply('❌ Formato de entrada no válido para el destino.');
                return false;
            }

            // Recuperar coordenadas de origen desde FlowStateManager
            const threadIdStr = threadId ? String(threadId) : null;
            const savedState = flowStateManager.getState(chatId, numeroPoliza, threadIdStr);
            const origenCoords = savedState?.origenCoords;

            if (!origenCoords) {
                logger.error('No se encontraron coordenadas de origen guardadas');
                await ctx.reply(
                    '❌ Error: No se encontraron las coordenadas del origen. Reinicia el proceso.'
                );
                this.awaitingDestino.delete(chatId, threadId);
                return false;
            }

            // Calcular ruta con HERE Maps API
            logger.info('Calculando ruta con HERE Maps API');
            const rutaInfo = await this.hereMapsService.calculateRoute(origenCoords, coordenadas);

            // Obtener póliza desde caché o BD
            const policyCacheData = this.polizaCache.get(chatId, threadId);
            const policy =
                policyCacheData?.policy || ((await getPolicyByNumber(numeroPoliza)) as IPolicy);
            if (!policy) {
                await ctx.reply('❌ Error: Póliza no encontrada.');
                this.awaitingDestino.delete(chatId, threadId);
                return false;
            }

            // Generar leyenda mejorada con geocoding
            const enhancedData = await this.generateEnhancedLegend(
                policy,
                origenCoords,
                coordenadas,
                rutaInfo
            );
            const leyenda = enhancedData.leyenda;

            // Guardar datos completos en FlowStateManager
            const saveData: any = {
                origenCoords,
                destinoCoords: coordenadas,
                coordenadas: {
                    origen: origenCoords,
                    destino: coordenadas
                },
                rutaInfo,
                origenDestino: `${origenCoords.lat},${origenCoords.lng} - ${coordenadas.lat},${coordenadas.lng}`
            };

            // Agregar información de geocoding si está disponible
            if (enhancedData) {
                saveData.geocoding = {
                    origen: enhancedData.origenGeo,
                    destino: enhancedData.destinoGeo
                };
                saveData.googleMapsUrl = enhancedData.googleMapsUrl;
                saveData.origenDestino = `${enhancedData.origenGeo.ubicacionCorta} - ${enhancedData.destinoGeo.ubicacionCorta}`;
            }

            flowStateManager.saveState(chatId, numeroPoliza, saveData, threadId);

            // Actualizar caché de póliza
            if (policyCacheData) {
                policyCacheData.destinoCoords = coordenadas;
                policyCacheData.coordenadas = { origen: origenCoords, destino: coordenadas };
                policyCacheData.rutaInfo = rutaInfo;
                this.polizaCache.set(chatId, policyCacheData, threadId);
            }

            // Guardar leyenda para envío
            this.pendingLeyendas.set(chatId, leyenda, threadId);

            // Crear mensaje de respuesta con info de ruta
            let responseMessage = `✅ Destino registrado: ${coordenadas.lat}, ${coordenadas.lng}\n\n`;

            if (rutaInfo) {
                responseMessage +=
                    '🗺️ *Información de ruta:*\n' +
                    `📏 Distancia: ${rutaInfo.distanciaKm} km\n` +
                    `⏱️ Tiempo estimado: ${rutaInfo.tiempoMinutos} minutos`;
                if (rutaInfo.aproximado) {
                    responseMessage += ' (aproximado)';
                }
                responseMessage += `\n🔗 [Ver ruta en Google Maps](${rutaInfo.googleMapsUrl})\n\n`;
            }

            // Envío automático de leyenda al grupo con efecto typing (asíncrono)
            const targetGroupId = parseInt(process.env.TELEGRAM_GROUP_ID || '-1002212807945');

            // Enviar leyenda en background sin bloquear al usuario
            setImmediate(async () => {
                try {
                    logger.info(
                        `Enviando leyenda automáticamente al grupo ${targetGroupId} con efecto typing`
                    );
                    await this.enviarLeyendaConEfectoTyping(
                        ctx.telegram,
                        targetGroupId,
                        policy,
                        enhancedData
                    );
                    logger.info(`Leyenda con efecto typing enviada al grupo: ${targetGroupId}`);
                } catch (sendError) {
                    logger.error('Error al enviar leyenda automáticamente al grupo:', sendError);
                }
            });

            // Enviar mensaje de confirmación con opciones de servicio inmediatamente
            await ctx.reply(
                responseMessage +
                    '✅ *Leyenda enviada al grupo de servicios.*\n\n' +
                    '🚗 ¿Deseas registrar un servicio?',
                {
                    parse_mode: 'Markdown',
                    link_preview_options: { is_disabled: true },
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '✅ Registrar Servicio',
                                `registrar_servicio_${numeroPoliza}`
                            ),
                            Markup.button.callback(
                                '❌ No registrar',
                                `no_registrar_${numeroPoliza}`
                            )
                        ]
                    ])
                }
            );

            logger.info('Flujo automático completado - respuesta inmediata al usuario');

            // Limpieza de estados
            this.pendingLeyendas.delete(chatId, threadId);
            this.awaitingDestino.delete(chatId, threadId);
            return true;
        } catch (error) {
            logger.error('Error procesando destino:', error);
            await ctx.reply('❌ Error al procesar la ubicación del destino.');
            this.awaitingDestino.delete(chatId, threadId);
            return false;
        }
    }

    async generateEnhancedLegend(
        policy: IPolicy,
        origenCoords: { lat: number; lng: number },
        destinoCoords: { lat: number; lng: number },
        rutaInfo: any
    ): Promise<{
        leyenda: string;
        origenGeo: any;
        destinoGeo: any;
        googleMapsUrl: string;
    }> {
        try {
            // Realizar geocoding reverso para origen y destino
            const [origenGeo, destinoGeo] = await Promise.all([
                this.hereMapsService.reverseGeocode(origenCoords.lat, origenCoords.lng),
                this.hereMapsService.reverseGeocode(destinoCoords.lat, destinoCoords.lng)
            ]);

            // Generar URL de Google Maps
            const googleMapsUrl = this.hereMapsService.generateGoogleMapsUrl(
                origenCoords,
                destinoCoords
            );

            // Formato de ubicación simplificado: "Colonia - Municipio"
            const origenTexto = origenGeo.ubicacionCorta.toUpperCase();
            const destinoTexto = destinoGeo.ubicacionCorta.toUpperCase();

            // Nuevo formato de leyenda con diseño visual llamativo
            const leyenda =
                '⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️\n' +
                `🔥 A L E R T A.    ${policy.aseguradora} 🔥\n` +
                '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n\n' +
                `🚗 ${policy.marca} - ${policy.submarca} - ${policy.año}\n\n` +
                `🔸 ORIGEN: ${origenTexto}\n` +
                `🔸 DESTINO: ${destinoTexto}\n\n` +
                `🗺️ ${googleMapsUrl}\n\n` +
                '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n' +
                '🌟 S E R V I C I O     A C T I V O 🌟\n' +
                '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀';

            logger.info(`Nueva leyenda generada: ${leyenda}`);

            return {
                leyenda,
                origenGeo,
                destinoGeo,
                googleMapsUrl
            };
        } catch (error) {
            logger.error('Error generando leyenda mejorada:', error);

            // Fallback: usar coordenadas directas con diseño visual llamativo
            const googleMapsUrl = this.hereMapsService.generateGoogleMapsUrl(
                origenCoords,
                destinoCoords
            );
            const leyenda =
                '⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️\n' +
                `🔥 A L E R T A.    ${policy.aseguradora} 🔥\n` +
                '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n\n' +
                `🚗 ${policy.marca} - ${policy.submarca} - ${policy.año}\n\n` +
                `🔸 ORIGEN: ${origenCoords.lat.toFixed(4)}, ${origenCoords.lng.toFixed(4)}\n` +
                `🔸 DESTINO: ${destinoCoords.lat.toFixed(4)}, ${destinoCoords.lng.toFixed(4)}\n\n` +
                `🗺️ ${googleMapsUrl}\n\n` +
                '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n' +
                '🌟 S E R V I C I O     A C T I V O 🌟\n' +
                '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀';

            return {
                leyenda,
                origenGeo: {
                    ubicacionCorta: `${origenCoords.lat.toFixed(4)}, ${origenCoords.lng.toFixed(4)}`,
                    fallback: true
                },
                destinoGeo: {
                    ubicacionCorta: `${destinoCoords.lat.toFixed(4)}, ${destinoCoords.lng.toFixed(4)}`,
                    fallback: true
                },
                googleMapsUrl
            };
        }
    }

    /**
     * Envía una leyenda al grupo con efecto typing usando múltiples mensajes secuenciales
     */
    async enviarLeyendaConEfectoTyping(
        telegram: any,
        targetGroupId: number,
        policy: any,
        enhancedData: any
    ): Promise<void> {
        try {
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            // Validar datos antes de generar mensajes
            if (!policy || !enhancedData?.origenGeo || !enhancedData.destinoGeo) {
                logger.error('Datos insuficientes para leyenda con efecto typing', {
                    hasPolicy: !!policy,
                    hasEnhancedData: !!enhancedData,
                    hasOrigenGeo: !!enhancedData?.origenGeo,
                    hasDestinoGeo: !!enhancedData?.destinoGeo
                });
                throw new Error('Datos insuficientes para generar leyenda');
            }

            // Secuencia de mensajes para crear efecto typing
            const mensajes = [
                '🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣',
                '🔥 PENDIENTES',
                `🔥 ALERTA ${policy.aseguradora || 'DESCONOCIDA'}`,
                `🔥 ${policy.marca || 'MARCA'} - ${policy.submarca || 'SUBMARCA'} - ${policy.año || 'AÑO'}`,
                `🔥 ORIGEN: ${enhancedData.origenGeo.ubicacionCorta?.toUpperCase() || 'ORIGEN DESCONOCIDO'}`,
                `🔥 DESTINO: ${enhancedData.destinoGeo.ubicacionCorta?.toUpperCase() || 'DESTINO DESCONOCIDO'}`
            ];

            // Enviar cada mensaje con delay
            for (let i = 0; i < mensajes.length; i++) {
                const mensaje = mensajes[i];

                // Validar que el mensaje no esté vacío
                if (!mensaje || mensaje.trim().length === 0) {
                    logger.warn(`Mensaje ${i + 1} está vacío, saltando envío`);
                    continue;
                }

                await telegram.sendMessage(targetGroupId, mensaje);
                logger.info(`Mensaje ${i + 1}/${mensajes.length} enviado: ${mensaje}`);

                // Delay entre mensajes (menos en el último) - 4 mensajes por segundo
                if (i < mensajes.length - 1) {
                    await delay(250); // 250ms entre mensajes = 4 por segundo
                }
            }

            // Mensaje con URL de Google Maps
            const mensajeUrl = `🗺️ ${enhancedData.googleMapsUrl || 'URL no disponible'}`;

            await delay(250); // Delay antes del mensaje con URL - 4 por segundo
            await telegram.sendMessage(targetGroupId, mensajeUrl);

            await delay(250); // Delay antes del mensaje de cierre - 4 por segundo

            // Mensaje de cierre morado separado
            const mensajeCierre = '🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣';
            await telegram.sendMessage(targetGroupId, mensajeCierre);

            logger.info('Secuencia de leyenda con efecto typing completada exitosamente');
        } catch (error) {
            logger.error('Error enviando leyenda con efecto typing:', error);

            // Fallback: enviar leyenda original en caso de error
            const leyendaFallback = enhancedData.leyenda;
            await telegram.sendMessage(targetGroupId, leyendaFallback);
            logger.info('Enviada leyenda fallback por error en efecto typing');
        }
    }

    /**
     * Envía una leyenda al grupo con efecto typing usando múltiples mensajes secuenciales (versión azul para registro de servicio)
     */
    async enviarLeyendaConEfectoTypingAzul(
        telegram: any,
        targetGroupId: number,
        policy: any,
        enhancedData: any
    ): Promise<void> {
        try {
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            // Validar datos antes de generar mensajes azules
            if (!policy || !enhancedData?.origenGeo || !enhancedData.destinoGeo) {
                logger.error('Datos insuficientes para leyenda azul con efecto typing', {
                    hasPolicy: !!policy,
                    hasEnhancedData: !!enhancedData,
                    hasOrigenGeo: !!enhancedData?.origenGeo,
                    hasDestinoGeo: !!enhancedData?.destinoGeo
                });
                throw new Error('Datos insuficientes para generar leyenda azul');
            }

            // Secuencia de mensajes para crear efecto typing en azul
            const mensajes = [
                '🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵',
                '🔥 PENDIENTES',
                `🔥 ALERTA ${policy.aseguradora || 'DESCONOCIDA'}`,
                `🔥 ${policy.marca || 'MARCA'} - ${policy.submarca || 'SUBMARCA'} - ${policy.año || 'AÑO'}`,
                `🔥 ORIGEN: ${enhancedData.origenGeo.ubicacionCorta?.toUpperCase() || 'ORIGEN DESCONOCIDO'}`,
                `🔥 DESTINO: ${enhancedData.destinoGeo.ubicacionCorta?.toUpperCase() || 'DESTINO DESCONOCIDO'}`
            ];

            // Enviar cada mensaje con delay
            for (let i = 0; i < mensajes.length; i++) {
                const mensaje = mensajes[i];

                // Validar que el mensaje no esté vacío
                if (!mensaje || mensaje.trim().length === 0) {
                    logger.warn(`Mensaje azul ${i + 1} está vacío, saltando envío`);
                    continue;
                }

                await telegram.sendMessage(targetGroupId, mensaje);
                logger.info(`Mensaje azul ${i + 1}/${mensajes.length} enviado: ${mensaje}`);

                // Delay entre mensajes azules - mismo ritmo que morado (4 por segundo)
                if (i < mensajes.length - 1) {
                    await delay(250); // 250ms entre mensajes = 4 por segundo
                }
            }

            // Mensaje con URL de Google Maps
            const mensajeUrl = `🗺️ ${enhancedData.googleMapsUrl || 'URL no disponible'}`;

            await delay(250); // Delay antes del mensaje con URL azul - 4 por segundo
            await telegram.sendMessage(targetGroupId, mensajeUrl);

            await delay(250); // Delay antes del mensaje de cierre azul - 4 por segundo

            // Mensaje de cierre azul separado
            const mensajeCierre = '🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵';
            await telegram.sendMessage(targetGroupId, mensajeCierre);

            logger.info('Secuencia de leyenda azul con efecto typing completada exitosamente');
        } catch (error) {
            logger.error('Error enviando leyenda azul con efecto typing:', error);

            // Fallback: enviar leyenda original en caso de error
            const leyendaFallback = enhancedData.leyenda;
            await telegram.sendMessage(targetGroupId, leyendaFallback);
            logger.info('Enviada leyenda fallback por error en efecto typing azul');
        }
    }

    async handleContactTime(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingContactTime.get(chatId, threadId);

        logger.info(`Procesando hora de contacto: ${messageText} para póliza: ${numeroPoliza}`, {
            chatId,
            threadId
        });

        const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
        if (!timeRegex.test(messageText)) {
            await ctx.reply(
                '⚠️ Formato de hora inválido. Debe ser HH:mm (24 horas).\n' +
                    'Ejemplos válidos: 09:30, 14:45, 23:15'
            );
            return false;
        }

        try {
            const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
            if (!serviceInfo) {
                logger.error(`No se encontró info de servicio para póliza: ${numeroPoliza}`);
                this.awaitingContactTime.delete(chatId, threadId);
                await ctx.reply('❌ Error al procesar la hora. Operación cancelada.');
                return false;
            }

            if (!serviceInfo.expediente) {
                logger.info(
                    'No se encontró expediente para la notificación, generando uno genérico'
                );
                serviceInfo.expediente = `EXP-${new Date().toISOString().slice(0, 10)}`;
            }

            serviceInfo.contactTime = messageText;
            const serviceStore = this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);
            logger.info(
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
            logger.error(`Error al procesar hora de contacto para póliza ${numeroPoliza}:`, error);
            this.awaitingContactTime.delete(chatId, threadId);
            await ctx.reply('❌ Error al procesar la hora de contacto. Operación cancelada.');
            return true;
        }
    }

    public cleanupAllStates(chatId: number, threadId: string | null = null): void {
        if (threadId) {
            this.pendingLeyendas.delete(chatId, threadId);
            this.polizaCache.delete(chatId, threadId);
            this.messageIds.delete(chatId, threadId);
            this.awaitingPhoneNumber.delete(chatId, threadId);
            this.awaitingOrigenDestino.delete(chatId, threadId);
            this.awaitingContactTime.delete(chatId, threadId);
            this.scheduledServiceInfo.delete(chatId, threadId);

            // También limpiar en FlowStateManager
            flowStateManager.clearAllStates(chatId, threadId);

            if (this.handler && typeof this.handler.clearChatState === 'function') {
                logger.info(
                    'Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates',
                    { chatId, threadId }
                );
                this.handler.clearChatState(chatId, threadId);
            } else {
                logger.error(
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

            // También limpiar en FlowStateManager
            flowStateManager.clearAllStates(chatId, null);

            if (this.handler && typeof this.handler.clearChatState === 'function') {
                logger.info(
                    'Llamando a CommandHandler.clearChatState desde OcuparPolizaCallback.cleanupAllStates (sin threadId)',
                    { chatId }
                );
                this.handler.clearChatState(chatId, null);
            } else {
                logger.error(
                    'No se pudo llamar a CommandHandler.clearChatState desde OcuparPolizaCallback (sin threadId)'
                );
            }
        }
    }
}

export default OcuparPolizaCallback;
