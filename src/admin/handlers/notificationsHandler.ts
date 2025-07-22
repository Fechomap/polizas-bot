import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import AdminMenu from '../menus/adminMenu';
import { getInstance as getNotificationManager } from '../../services/NotificationManager';
import ScheduledNotification from '../../models/scheduledNotification';
import moment from 'moment-timezone';
import logger from '../../utils/logger';
import type { IScheduledNotification } from '../../types/database';

// Interface para el tipo de admin handler
interface IAdminHandler {
    handleAction(ctx: Context, action: string): Promise<void>;
}

class NotificationsHandler implements IAdminHandler {
    /**
     * Maneja las acciones del menú de notificaciones
     */
    async handleAction(ctx: Context, action: string): Promise<void> {
        return NotificationsHandler.handleActionStatic(ctx, action);
    }

    /**
     * Método estático para manejar las acciones del menú de notificaciones
     */
    static async handleActionStatic(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'menu':
                    return await AdminMenu.showNotificationsMenu(ctx);

                case 'list':
                    return await this.handleListNotifications(ctx);

                case 'today':
                    return await this.handleTodayNotifications(ctx);

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

    /**
     * Lista todas las notificaciones del día (equivalente a notification:list)
     */
    static async handleListNotifications(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery();

            // Obtener todas las notificaciones del día actual
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const todayNotifications: IScheduledNotification[] = await ScheduledNotification.find({
                scheduledDate: {
                    $gte: today,
                    $lt: tomorrow
                }
            }).sort({ scheduledDate: 1 });

            if (todayNotifications.length === 0) {
                await ctx.editMessageText('📅 No hay notificaciones programadas para hoy.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                    ])
                });
                return;
            }

            // Dividir en bloques de 8 máximo
            const chunkSize = 8;
            const totalChunks = Math.ceil(todayNotifications.length / chunkSize);

            for (let i = 0; i < totalChunks; i++) {
                const chunk = todayNotifications.slice(i * chunkSize, (i + 1) * chunkSize);

                let message = `📋 *Notificaciones de HOY (${i + 1}/${totalChunks})*\n\n`;

                chunk.forEach((notification: IScheduledNotification) => {
                    // Usar moment-timezone para mostrar hora correcta en CDMX
                    const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                    const formattedTime = scheduledMoment.format('HH:mm');

                    // Emoji según el estado
                    const statusEmoji: Record<string, string> = {
                        PENDING: '⏳',
                        SCHEDULED: '🕒',
                        PROCESSING: '⚡',
                        SENT: '✅',
                        FAILED: '❌',
                        CANCELLED: '🚫'
                    };

                    // Emoji según el tipo de notificación
                    const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '🟨' : 
                                    notification.tipoNotificacion === 'TERMINO' ? '🟩' : '';

                    const emoji = statusEmoji[notification.status] || '❓';

                    message += `${emoji}${tipoEmoji} *${formattedTime}* - ${notification.tipoNotificacion || 'MANUAL'}\n`;
                    message += `📝 Póliza: ${notification.numeroPoliza}\n`;
                    message += `📄 Exp: ${notification.expedienteNum}\n`;

                    if (notification.marcaModelo) {
                        message += `🚗 ${notification.marcaModelo}\n`;
                    }

                    message += '\n';
                });

                // Añadir botones solo al último mensaje
                if (i === totalChunks - 1) {
                    await ctx.editMessageText(message, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                        ])
                    });
                } else {
                    if (i === 0) {
                        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
                    } else {
                        await ctx.reply(message, { parse_mode: 'Markdown' });
                    }
                }
            }
        } catch (error) {
            logger.error('Error en handleListNotifications:', error);
            await ctx.editMessageText('❌ Error al obtener notificaciones del día.', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                ])
            });
        }
    }

    /**
     * Lista las notificaciones pendientes para hoy (equivalente a notification:today)
     */
    static async handleTodayNotifications(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notificationManager = getNotificationManager();
            const allPending = await notificationManager.getPendingNotifications();

            if (allPending.length === 0) {
                await ctx.editMessageText('📅 No hay notificaciones programadas pendientes.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                    ])
                });
                return;
            }

            // Filtrar solo las de hoy
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const todayNotifications = allPending.filter((n: IScheduledNotification) => {
                const date = new Date(n.scheduledDate);
                return date >= today && date < tomorrow;
            });

            if (todayNotifications.length === 0) {
                await ctx.editMessageText('📅 No hay notificaciones programadas para hoy.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                    ])
                });
                return;
            }

            // Ordenar por hora
            todayNotifications.sort(
                (a: IScheduledNotification, b: IScheduledNotification) =>
                    new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
            );

            let message = `⏰ *Notificaciones PENDIENTES para HOY (${todayNotifications.length})*\n\n`;

            todayNotifications.forEach((notification: IScheduledNotification) => {
                // Usar moment-timezone para mostrar hora correcta en CDMX
                const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                const formattedTime = scheduledMoment.format('HH:mm');

                // Emoji según el tipo de notificación
                const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '🟨' : 
                                notification.tipoNotificacion === 'TERMINO' ? '🟩' : '';

                message += `🔹${tipoEmoji} *${formattedTime}* - ${notification.expedienteNum}\n`;
                message += `📝 Póliza: ${notification.numeroPoliza}\n`;
                message += `📋 Tipo: ${notification.tipoNotificacion || 'MANUAL'}\n`;

                if (notification.marcaModelo) {
                    message += `🚗 ${notification.marcaModelo}\n`;
                }

                message += '\n';
            });

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                ])
            });
        } catch (error) {
            logger.error('Error en handleTodayNotifications:', error);
            await ctx.editMessageText('❌ Error al obtener notificaciones de hoy.', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                ])
            });
        }
    }

    /**
     * Maneja la opción de editar notificaciones (nueva funcionalidad)
     */
    static async handleEditNotifications(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notificationManager = getNotificationManager();
            const pendingNotifications = await notificationManager.getPendingNotifications();

            if (pendingNotifications.length === 0) {
                await ctx.editMessageText('📅 No hay notificaciones pendientes para editar.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                    ])
                });
                return;
            }

            // Mostrar solo las próximas 10 notificaciones para no sobrecargar
            const upcomingNotifications = pendingNotifications
                .slice(0, 10)
                .sort((a: any, b: any) => 
                    new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
                );

            let message = `✏️ *EDITAR NOTIFICACIONES*\n`;
            message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            message += `Selecciona una notificación para editar:\n\n`;

            const buttons: any[][] = [];

            upcomingNotifications.forEach((notification: any, index: number) => {
                const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                const formattedDateTime = scheduledMoment.format('DD/MM HH:mm');
                
                // Emoji según el tipo
                const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '🟨' : 
                                notification.tipoNotificacion === 'TERMINO' ? '🟩' : '⚪';

                message += `${index + 1}. ${tipoEmoji} ${formattedDateTime} - ${notification.expedienteNum}\n`;
                message += `   📝 ${notification.numeroPoliza}\n\n`;

                // Crear botón para editar esta notificación
                buttons.push([
                    Markup.button.callback(
                        `${index + 1}. ${tipoEmoji} ${notification.expedienteNum}`, 
                        `admin_notifications_edit_${notification._id}`
                    )
                ]);
            });

            // Agregar botón de volver
            buttons.push([Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });

        } catch (error) {
            logger.error('Error en handleEditNotifications:', error);
            await ctx.editMessageText('❌ Error al cargar notificaciones para editar.', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                ])
            });
        }
    }
}

export default NotificationsHandler;