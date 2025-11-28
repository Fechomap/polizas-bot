/**
 * ServiceRegistrationStep - Manejo de registro de servicios
 *
 * Responsabilidad: Registro y asignación de servicios para pólizas
 */

import { Context, Markup } from 'telegraf';
import logger from '../../../utils/logger';
import {
    getPolicyByNumber,
    convertirRegistroAServicio,
    marcarRegistroNoAsignado,
    calcularHorasAutomaticas
} from '../../../controllers/policyController';
import StateKeyManager from '../../../utils/StateKeyManager';
import { getInstance } from '../../../services/NotificationManager';
import flowStateManager from '../../../utils/FlowStateManager';
import Policy from '../../../models/policy';
import Vehicle from '../../../models/vehicle';
import type { IPolicy } from '../../../types/database';
import type { IThreadSafeStateMap } from '../../../utils/StateKeyManager';
import type { IScheduledServiceInfo, IEnhancedLegendData } from '../types';
import LegendService from '../services/LegendService';

interface IServiceStepDependencies {
    bot: any;
    awaitingServiceData: IThreadSafeStateMap<string>;
    awaitingContactTime: IThreadSafeStateMap<string>;
    scheduledServiceInfo: IThreadSafeStateMap<IScheduledServiceInfo>;
    processingCallbacks?: Set<string>;
    cleanupAllStates: (chatId: number, threadId: string | null) => void;
}

class ServiceRegistrationStep {
    private bot: any;
    private awaitingServiceData: IThreadSafeStateMap<string>;
    private awaitingContactTime: IThreadSafeStateMap<string>;
    private scheduledServiceInfo: IThreadSafeStateMap<IScheduledServiceInfo>;
    private processingCallbacks: Set<string>;
    private cleanupAllStates: (chatId: number, threadId: string | null) => void;
    private legendService: LegendService;

    constructor(deps: IServiceStepDependencies) {
        this.bot = deps.bot;
        this.awaitingServiceData = deps.awaitingServiceData;
        this.awaitingContactTime = deps.awaitingContactTime;
        this.scheduledServiceInfo = deps.scheduledServiceInfo;
        this.processingCallbacks = deps.processingCallbacks ?? new Set();
        this.cleanupAllStates = deps.cleanupAllStates;
        this.legendService = new LegendService();
    }

    /**
     * Registra los callbacks relacionados con servicios
     */
    registerCallbacks(): void {
        this.registerServiceCallbacks();
        this.registerAssignmentCallbacks();
        this.registerDaySelectionCallbacks();
    }

    /**
     * Callbacks de registro de servicio
     */
    private registerServiceCallbacks(): void {
        // Registrar servicio
        this.bot.action(/registrar_servicio_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdForState = typeof threadId === 'number' ? threadId : undefined;

                logger.info(`Iniciando registro de servicio para: ${numeroPoliza}`);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                } catch {}

                // Enviar leyenda azul en background
                this.sendBlueLegendAsync(ctx, numeroPoliza, chatId, threadIdForState);

                await ctx.reply('🚗 **INGRESA EL NÚMERO DE EXPEDIENTE:**', {
                    parse_mode: 'Markdown'
                });

                this.awaitingServiceData.set(chatId, numeroPoliza, threadIdForState);
            } catch (error) {
                logger.error('Error en callback registrarServicio:', error);
                await ctx.reply('❌ Error al iniciar el registro del servicio.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // No registrar servicio
        this.bot.action(/no_registrar_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                logger.info(`No registrar servicio para: ${numeroPoliza}`);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                } catch {}

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

    /**
     * Callbacks de asignación de servicio
     */
    private registerAssignmentCallbacks(): void {
        // Asignado
        this.bot.action(/asig_yes_(.+)_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const numeroRegistro = parseInt((ctx.match as RegExpMatchArray)[2]);
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                // Protección anti-doble-clic
                const processingKey = `${chatId}_${numeroPoliza}_${numeroRegistro}`;
                if (this.processingCallbacks.has(processingKey)) {
                    logger.warn(`Callback ya procesándose: ${processingKey}`);
                    await ctx.answerCbQuery('⚠️ Procesando... espera un momento');
                    return;
                }

                this.processingCallbacks.add(processingKey);

                try {
                    await this.handleAssignment(
                        ctx,
                        numeroPoliza,
                        numeroRegistro,
                        chatId,
                        threadId
                    );
                } finally {
                    this.processingCallbacks.delete(processingKey);
                    await ctx.answerCbQuery();
                }
            } catch (error) {
                logger.error('Error en callback assignedService:', error);
                await ctx.reply('❌ Error al procesar la asignación del servicio.');
            }
        });

        // No asignado
        this.bot.action(/asig_no_(.+)_(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const numeroRegistro = parseInt((ctx.match as RegExpMatchArray)[2]);
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                logger.info(`Registro ${numeroRegistro} NO ASIGNADO para: ${numeroPoliza}`);

                try {
                    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
                } catch {}

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
            } catch (error) {
                logger.error('Error en callback noAssignedService:', error);
                await ctx.reply('❌ Error al procesar la NO asignación del servicio.');
            } finally {
                await ctx.answerCbQuery();
            }
        });
    }

    /**
     * Maneja la asignación de un servicio
     */
    private async handleAssignment(
        ctx: Context,
        numeroPoliza: string,
        numeroRegistro: number,
        chatId: number,
        threadId: string | number | null
    ): Promise<void> {
        logger.info(`Registro ${numeroRegistro} ASIGNADO para: ${numeroPoliza}`);

        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch {}

        const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
        if (!policy) {
            await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
            return;
        }

        const registro = policy.registros.find((r: any) => r.numeroRegistro === numeroRegistro);
        if (!registro) {
            await ctx.reply(`❌ Registro ${numeroRegistro} no encontrado.`);
            return;
        }

        // Calcular horas automáticas
        const fechaBase = new Date();
        const tiempoTrayecto = registro.rutaInfo?.tiempoMinutos ?? 0;
        const horasCalculadas = calcularHorasAutomaticas(fechaBase, tiempoTrayecto);

        // Convertir registro a servicio
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

        // Procesar NIV si aplica
        await this.processNIVIfApplicable(ctx, policy, numeroPoliza, numeroServicio);

        // Formatear fechas
        const fechaContactoStr = this.formatDate(horasCalculadas.fechaContactoProgramada);
        const fechaTerminoStr = this.formatDate(horasCalculadas.fechaTerminoProgramada);

        // Confirmar conversión
        await ctx.reply(
            `✅ *Registro convertido a Servicio #${numeroServicio}*\n\n` +
                '✨Los cálculos fueron realizados✨\n\n' +
                '⏰ *Programación:*\n' +
                `📞 Contacto: ${fechaContactoStr}\n` +
                `🏁 Término: ${fechaTerminoStr}\n\n` +
                '🤖 Las notificaciones se enviarán automáticamente.',
            { parse_mode: 'Markdown' }
        );

        // Programar notificaciones
        await this.scheduleNotifications(policy, registro, numeroPoliza, horasCalculadas);

        logger.info(`Servicio #${numeroServicio} confirmado para ${numeroPoliza}`);
    }

    /**
     * Procesa NIV si la póliza es de tipo NIV
     */
    private async processNIVIfApplicable(
        ctx: Context,
        policy: IPolicy,
        numeroPoliza: string,
        numeroServicio: number
    ): Promise<void> {
        try {
            const policyDoc = await Policy.findOne({ numeroPoliza });
            if (policyDoc && policyDoc.tipoPoliza === 'NIV' && policyDoc.totalServicios >= 1) {
                logger.info(`NIV utilizado: ${numeroPoliza}. Eliminando automáticamente.`);

                await Policy.findByIdAndUpdate(policyDoc._id, {
                    estado: 'ELIMINADO',
                    fechaEliminacion: new Date(),
                    motivoEliminacion: 'NIV utilizado - Eliminación automática'
                });

                if (policyDoc.vehicleId) {
                    await Vehicle.findByIdAndUpdate(policyDoc.vehicleId, { estado: 'ELIMINADO' });
                }

                await ctx.reply(
                    '⚡ *NIV CONSUMIDO*\n\n' +
                        `El NIV \`${numeroPoliza}\` ha sido utilizado y se ha eliminado automáticamente.\n` +
                        'Ya no aparecerá en reportes futuros.',
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            logger.error('Error procesando NIV:', error);
        }
    }

    /**
     * Programa las notificaciones de contacto y término
     */
    private async scheduleNotifications(
        policy: IPolicy,
        registro: any,
        numeroPoliza: string,
        horasCalculadas: any
    ): Promise<void> {
        try {
            const notificationManager = getInstance();

            if (!notificationManager?.isInitialized) {
                logger.error('NotificationManager no inicializado');
                return;
            }

            const contactTimeStr = this.formatTime(horasCalculadas.fechaContactoProgramada);
            const terminoTimeStr = this.formatTime(horasCalculadas.fechaTerminoProgramada);
            const origenDestino = registro.origenDestino ?? 'Origen - Destino';
            const marcaModelo = `${policy.marca} ${policy.submarca} (${policy.año})`;

            const notificationData = {
                numeroPoliza,
                targetGroupId: parseInt(process.env.TELEGRAM_GROUP_ID ?? '-1002212807945'),
                expedienteNum: registro.numeroExpediente,
                origenDestino,
                marcaModelo,
                colorVehiculo: policy.color,
                placas: policy.placas,
                telefono: policy.telefono
            };

            // Programar notificación de CONTACTO
            try {
                await notificationManager.scheduleNotification({
                    ...notificationData,
                    contactTime: contactTimeStr,
                    scheduledDate: horasCalculadas.fechaContactoProgramada,
                    tipoNotificacion: 'CONTACTO'
                });
                logger.info(`Notificación CONTACTO programada: ${contactTimeStr}`);
            } catch (error) {
                logger.error('Error programando notificación CONTACTO:', error);
            }

            // Programar notificación de TÉRMINO
            try {
                await notificationManager.scheduleNotification({
                    ...notificationData,
                    contactTime: terminoTimeStr,
                    scheduledDate: horasCalculadas.fechaTerminoProgramada,
                    tipoNotificacion: 'TERMINO'
                });
                logger.info(`Notificación TÉRMINO programada: ${terminoTimeStr}`);
            } catch (error) {
                logger.error('Error programando notificación TÉRMINO:', error);
            }
        } catch (error) {
            logger.error('Error al programar notificaciones:', error);
        }
    }

    /**
     * Callbacks de selección de día
     */
    private registerDaySelectionCallbacks(): void {
        this.bot.action(/selectDay:(\d+):(.+)/, async (ctx: Context) => {
            try {
                const daysOffset = parseInt((ctx.match as RegExpMatchArray)[1], 10);
                const numeroPoliza = (ctx.match as RegExpMatchArray)[2];
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                logger.info(`Selección de día: offset=${daysOffset}, póliza=${numeroPoliza}`);
                await ctx.answerCbQuery();

                const serviceInfo = this.scheduledServiceInfo.get(chatId, threadId);
                if (!serviceInfo?.contactTime) {
                    await ctx.reply(
                        '❌ Error: No se encontró la información de la hora de contacto.'
                    );
                    return;
                }

                const moment = require('moment-timezone');
                const today = moment().tz('America/Mexico_City');
                const scheduledMoment = today.clone().add(daysOffset, 'days');

                const [hours, minutes] = serviceInfo.contactTime.split(':').map(Number);
                scheduledMoment.hour(hours).minute(minutes).second(0).millisecond(0);

                serviceInfo.scheduledDate = scheduledMoment.toDate();
                this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);

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
                        'El servicio ha sido registrado correctamente.',
                    { parse_mode: 'Markdown' }
                );

                const threadIdStr = threadId ? String(threadId) : null;
                this.cleanupAllStates(chatId, threadIdStr);
            } catch (error) {
                logger.error('Error al procesar selección de día:', error);
                await ctx.reply('❌ Error al procesar la selección de día.');
            }
        });
    }

    /**
     * Maneja el ingreso de hora de contacto
     */
    async handleContactTime(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingContactTime.get(chatId, threadId);

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
                this.awaitingContactTime.delete(chatId, threadId);
                await ctx.reply('❌ Error al procesar la hora. Operación cancelada.');
                return false;
            }

            if (!serviceInfo.expediente) {
                serviceInfo.expediente = `EXP-${new Date().toISOString().slice(0, 10)}`;
            }

            serviceInfo.contactTime = messageText;
            this.scheduledServiceInfo.set(chatId, serviceInfo, threadId);

            // Mostrar selección de día
            await this.showDaySelection(ctx, numeroPoliza ?? '', messageText);

            return true;
        } catch (error) {
            logger.error('Error al procesar hora de contacto:', error);
            this.awaitingContactTime.delete(chatId, threadId);
            await ctx.reply('❌ Error al procesar la hora de contacto.');
            return true;
        }
    }

    /**
     * Muestra botones de selección de día
     */
    private async showDaySelection(
        ctx: Context,
        numeroPoliza: string,
        contactTime: string
    ): Promise<void> {
        const today = new Date();
        const dayButtons = [];
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        dayButtons.push([
            Markup.button.callback('Hoy', `selectDay:0:${numeroPoliza}`),
            Markup.button.callback('Mañana', `selectDay:1:${numeroPoliza}`)
        ]);

        let nextDaysRow: any[] = [];
        for (let i = 2; i <= 6; i++) {
            const futureDate = new Date(today);
            futureDate.setDate(futureDate.getDate() + i);
            const dayName = dayNames[futureDate.getDay()];
            const dateStr = `${futureDate.getDate()}/${futureDate.getMonth() + 1}`;

            nextDaysRow.push(
                Markup.button.callback(`${dayName} ${dateStr}`, `selectDay:${i}:${numeroPoliza}`)
            );

            if (nextDaysRow.length === 2 || i === 6) {
                dayButtons.push([...nextDaysRow]);
                nextDaysRow = [];
            }
        }

        dayButtons.push([Markup.button.callback('❌ Cancelar', `cancelSelectDay:${numeroPoliza}`)]);

        await ctx.reply(
            `✅ Hora registrada: *${contactTime}*\n\n` +
                '📅 ¿Para qué día programar la alerta de contacto?',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(dayButtons)
            }
        );
    }

    /**
     * Envía leyenda azul de forma asíncrona
     */
    private sendBlueLegendAsync(
        ctx: Context,
        numeroPoliza: string,
        chatId: number,
        threadId: number | undefined
    ): void {
        setImmediate(async () => {
            try {
                const threadIdStr = threadId ? String(threadId) : null;
                const flowState = flowStateManager.getState(chatId, numeroPoliza, threadIdStr);
                const policy = await getPolicyByNumber(numeroPoliza);

                if (flowState && policy && flowState.geocoding) {
                    const enhancedData: IEnhancedLegendData = {
                        origenGeo: flowState.geocoding.origen,
                        destinoGeo: flowState.geocoding.destino,
                        googleMapsUrl: flowState.googleMapsUrl ?? flowState.rutaInfo?.googleMapsUrl,
                        leyenda: ''
                    };

                    const targetGroupId = parseInt(
                        process.env.TELEGRAM_GROUP_ID ?? '-1002212807945'
                    );

                    await this.legendService.sendBlueLegendWithTypingEffect(
                        ctx.telegram,
                        targetGroupId,
                        policy,
                        enhancedData
                    );
                }
            } catch (error) {
                logger.error('Error enviando leyenda azul:', error);
            }
        });
    }

    /**
     * Formatea una fecha para mostrar
     */
    private formatDate(date: Date): string {
        return date.toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Formatea una hora para notificaciones
     */
    private formatTime(date: Date): string {
        return date.toLocaleTimeString('es-MX', {
            timeZone: 'America/Mexico_City',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

export default ServiceRegistrationStep;
