// src/admin/handlers/notificationsHandler.ts
/**
 * Handler para gestión de notificaciones en el módulo admin
 * REFACTORIZADO: UI delegada a AdminNotificationsUIService (SRP)
 */

import { Context } from 'telegraf';
import { getInstance as getNotificationManager } from '../../services/NotificationManager';
import ScheduledNotification from '../../models/scheduledNotification';
import moment from 'moment-timezone';
import logger from '../../utils/logger';
import adminStateManager from '../utils/adminStates';
import { getAdminNotificationsUIService } from '../services/AdminNotificationsUIService';

// Service
const uiService = getAdminNotificationsUIService();

interface IAdminHandler {
    handleAction(ctx: Context, action: string): Promise<void>;
}

class NotificationsHandler implements IAdminHandler {
    async handleAction(ctx: Context, action: string): Promise<void> {
        return NotificationsHandler.handleActionStatic(ctx, action);
    }

    static async handleActionStatic(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'menu':
                case 'edit':
                    return await this.handleEditNotifications(ctx);
                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en NotificationsHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    static async handleEditNotifications(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notificationManager = getNotificationManager();
            const pendingNotifications = await notificationManager.getPendingNotifications();

            if (pendingNotifications.length === 0) {
                await ctx.editMessageText(uiService.generarMensajeSinNotificaciones(), {
                    ...uiService.generarTecladoSinNotificaciones()
                });
                return;
            }

            const upcomingNotifications = pendingNotifications
                .slice(0, 10)
                .sort(
                    (a: any, b: any) =>
                        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
                );

            const message = uiService.generarMensajeListaNotificaciones(upcomingNotifications);
            const keyboard = uiService.generarTecladoListaNotificaciones(upcomingNotifications);

            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
        } catch (error) {
            logger.error('Error en handleEditNotifications:', error);
            await ctx.editMessageText('❌ Error al cargar notificaciones para editar.', {
                ...uiService.generarTecladoSinNotificaciones()
            });
        }
    }

    async handleCancelNotification(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText(uiService.generarMensajeNoEncontrada(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            await notification.cancel();

            await ctx.editMessageText(
                uiService.generarMensajeCancelada(
                    notification.numeroPoliza,
                    notification.expedienteNum
                ),
                { parse_mode: 'Markdown', ...uiService.generarTecladoPostCancelacion() }
            );

            logger.info(`Notificación ${notificationId} cancelada por admin`);
        } catch (error) {
            logger.error('Error en handleCancelNotification:', error);
            await ctx.editMessageText('❌ Error al cancelar la notificación', {
                ...uiService.generarTecladoVolverEditar()
            });
        }
    }

    async handleDeleteNotification(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText(uiService.generarMensajeNoEncontrada(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            const ahora = new Date();
            const hace24Horas = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

            if (
                !(
                    ['SENT', 'FAILED', 'CANCELLED'].includes(notification.status) &&
                    notification.scheduledDate < hace24Horas
                )
            ) {
                await ctx.editMessageText(uiService.generarMensajeErrorEliminarNoVieja(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            await ScheduledNotification.findByIdAndDelete(notificationId);

            await ctx.editMessageText(
                uiService.generarMensajeEliminada(
                    notification.numeroPoliza,
                    notification.expedienteNum
                ),
                { parse_mode: 'Markdown', ...uiService.generarTecladoPostCancelacion() }
            );

            logger.info(
                `Notificación ${notificationId} eliminada por admin (póliza: ${notification.numeroPoliza})`
            );
        } catch (error) {
            logger.error('Error en handleDeleteNotification:', error);
            await ctx.editMessageText('❌ Error al eliminar la notificación', {
                ...uiService.generarTecladoVolverEditar()
            });
        }
    }

    async handleEditDate(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText(uiService.generarMensajeNoEncontrada(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            const message = uiService.generarMensajeEditarFecha(notification);
            const keyboard = uiService.generarTecladoOpcionesFecha(notificationId);

            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
        } catch (error) {
            logger.error('Error en handleEditDate:', error);
            await ctx.editMessageText('❌ Error al mostrar opciones de edición', {
                ...uiService.generarTecladoVolverEditar()
            });
        }
    }

    async handleQuickEdit(ctx: Context, notificationId: string, option: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText(uiService.generarMensajeNoEncontrada(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
            let newDate: Date;

            switch (option) {
                case '10m':
                    newDate = scheduledMoment.add(10, 'minutes').toDate();
                    break;
                case '20m':
                    newDate = scheduledMoment.add(20, 'minutes').toDate();
                    break;
                case '30m':
                    newDate = scheduledMoment.add(30, 'minutes').toDate();
                    break;
                case '40m':
                    newDate = scheduledMoment.add(40, 'minutes').toDate();
                    break;
                default:
                    await ctx.editMessageText('❌ Opción no válida', {
                        ...uiService.generarTecladoReintentarEdicion(notificationId)
                    });
                    return;
            }

            const notificationManager = getNotificationManager();
            const result = await notificationManager.editNotificationDate(notificationId, newDate);

            if (result.success) {
                const affectedCount = result.affectedNotifications?.length ?? 1;
                const message = uiService.generarMensajeExitoEdicion(affectedCount, result.message);
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    ...uiService.generarTecladoPostEdicion()
                });
                logger.info(
                    `Admin editó fecha de notificación ${notificationId} a ${newDate.toISOString()}`
                );
            } else {
                await ctx.editMessageText(`❌ ${result.message}`, {
                    ...uiService.generarTecladoReintentarEdicion(notificationId)
                });
            }
        } catch (error) {
            logger.error('Error en handleQuickEdit:', error);
            await ctx.editMessageText('❌ Error al editar la notificación', {
                ...uiService.generarTecladoReintentarEdicion(notificationId)
            });
        }
    }

    async handleCustomTime(ctx: Context, notificationId: string, dayOption: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText(uiService.generarMensajeNoEncontrada(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'notification_custom_time'
            );
            adminStateManager.updateAdminState(ctx.from!.id, ctx.chat!.id, {
                notificationId,
                dayOption,
                numeroPoliza: notification.numeroPoliza
            });

            const message = uiService.generarMensajeElegirHora(notification, dayOption);
            const keyboard = uiService.generarTecladoCancelarHora(notificationId);

            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
        } catch (error) {
            logger.error('Error en handleCustomTime:', error);
            await ctx.editMessageText('❌ Error al mostrar opciones', {
                ...uiService.generarTecladoVolverEditar()
            });
        }
    }

    async handleTextMessage(ctx: Context): Promise<boolean> {
        const userId = ctx.from!.id;
        const chatId = ctx.chat!.id;
        const messageText = (ctx.message as any).text;

        const adminState = adminStateManager.getAdminState(userId, chatId);

        if (!adminState || adminState.operation !== 'notification_custom_time') {
            return false;
        }

        const { notificationId, dayOption } = adminState.data ?? {};

        if (!notificationId || !dayOption) {
            adminStateManager.clearAdminState(userId, chatId);
            return false;
        }

        const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
        const match = messageText.trim().match(timeRegex);

        if (!match) {
            await ctx.reply(uiService.generarMensajeFormatoInvalido(), {
                parse_mode: 'Markdown',
                ...uiService.generarTecladoCancelarHora(notificationId)
            });
            return true;
        }

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);

        try {
            const now = moment().tz('America/Mexico_City');
            let targetDate = now.clone();

            if (dayOption === 'tomorrow') {
                targetDate = targetDate.add(1, 'day');
            }

            targetDate = targetDate.hour(hours).minute(minutes).second(0);

            if (targetDate.isBefore(moment().tz('America/Mexico_City'))) {
                await ctx.reply(uiService.generarMensajeHoraFutura(), {
                    ...uiService.generarTecladoCancelarHora(notificationId)
                });
                return true;
            }

            const notificationManager = getNotificationManager();
            const result = await notificationManager.editNotificationDate(
                notificationId,
                targetDate.toDate()
            );

            adminStateManager.clearAdminState(userId, chatId);

            if (result.success) {
                const affectedCount = result.affectedNotifications?.length ?? 1;
                const message = uiService.generarMensajeExitoHoraPersonalizada(
                    dayOption,
                    targetDate.format('HH:mm'),
                    affectedCount
                );
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    ...uiService.generarTecladoPostHoraPersonalizada()
                });
                logger.info(
                    `Admin editó notificación ${notificationId} a ${targetDate.toISOString()}`
                );
            } else {
                await ctx.reply(`❌ ${result.message}`, {
                    ...uiService.generarTecladoReintentarEdicion(notificationId)
                });
            }

            return true;
        } catch (error) {
            logger.error('Error procesando hora personalizada:', error);
            adminStateManager.clearAdminState(userId, chatId);
            await ctx.reply('❌ Error al procesar la hora', {
                ...uiService.generarTecladoVolverEditar()
            });
            return true;
        }
    }

    async handleRescheduleNotification(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText(uiService.generarMensajeNoEncontrada(), {
                    ...uiService.generarTecladoVolverEditar()
                });
                return;
            }

            const newDate = moment().tz('America/Mexico_City').add(5, 'minutes').toDate();
            const notificationManager = getNotificationManager();
            const result = await notificationManager.editNotificationDate(notificationId, newDate);

            if (result.success) {
                await ctx.editMessageText(
                    uiService.generarMensajeReprogramacionExitosa(result.message),
                    {
                        parse_mode: 'Markdown',
                        ...uiService.generarTecladoPostCancelacion()
                    }
                );
                logger.info(`Admin reprogramó notificación FAILED ${notificationId} a +5min`);
            } else {
                await ctx.editMessageText(`❌ Error al reprogramar: ${result.message}`, {
                    ...uiService.generarTecladoVolverEditar()
                });
            }
        } catch (error) {
            logger.error('Error en handleRescheduleNotification:', error);
            await ctx.editMessageText('❌ Error al reprogramar la notificación', {
                ...uiService.generarTecladoVolverEditar()
            });
        }
    }
}

export default NotificationsHandler;
