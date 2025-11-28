import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import AdminMenu from '../menus/adminMenu';
import { getInstance as getNotificationManager } from '../../services/NotificationManager';
import ScheduledNotification from '../../models/scheduledNotification';
import moment from 'moment-timezone';
import logger from '../../utils/logger';
import adminStateManager from '../utils/adminStates';
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
                case 'edit':
                    // Ir directo a lista de editar
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
     * Muestra lista de notificaciones para editar
     * Click en notificación → Directo a editar fecha
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
                .sort(
                    (a: any, b: any) =>
                        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
                );

            let message = `✏️ *EDITAR NOTIFICACIONES*\n`;
            message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            message += `Selecciona una notificación para editar:\n\n`;

            const buttons: any[][] = [];

            upcomingNotifications.forEach((notification: any, index: number) => {
                const scheduledMoment = moment(notification.scheduledDate).tz(
                    'America/Mexico_City'
                );
                const formattedDateTime = scheduledMoment.format('DD/MM HH:mm');

                // Emoji según el tipo
                const tipoEmoji =
                    notification.tipoNotificacion === 'CONTACTO'
                        ? '🟨'
                        : notification.tipoNotificacion === 'TERMINO'
                          ? '🟩'
                          : '⚪';

                message += `${index + 1}. ${tipoEmoji} ${formattedDateTime} - ${notification.expedienteNum}\n`;
                message += `   📝 ${notification.numeroPoliza}\n\n`;

                // Click → Directo a editar fecha (sin menú intermedio)
                buttons.push([
                    Markup.button.callback(
                        `${index + 1}. ${tipoEmoji} ${notification.expedienteNum}`,
                        `admin_notifications_edit_date_${notification._id}`
                    )
                ]);
            });

            // Agregar botón de volver al menú admin
            buttons.push([Markup.button.callback('⬅️ Volver', 'admin_menu')]);

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
    /**
     * Cancela una notificación específica
     */
    async handleCancelNotification(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            // Cancelar la notificación usando el método del modelo
            await notification.cancel();

            await ctx.editMessageText(
                `✅ *Notificación cancelada exitosamente*\n\n📝 Póliza: ${notification.numeroPoliza}\n📋 Expediente: ${notification.expedienteNum || 'N/A'}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                        [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
                    ])
                }
            );

            logger.info(`Notificación ${notificationId} cancelada por admin`);
        } catch (error) {
            logger.error('Error en handleCancelNotification:', error);
            await ctx.editMessageText('❌ Error al cancelar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                ])
            });
        }
    }

    /**
     * Elimina una notificación específica (solo para notificaciones viejas)
     */
    async handleDeleteNotification(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            // Verificar que sea una notificación vieja antes de eliminar
            const ahora = new Date();
            const hace24Horas = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

            if (
                !(
                    ['SENT', 'FAILED', 'CANCELLED'].includes(notification.status) &&
                    notification.scheduledDate < hace24Horas
                )
            ) {
                await ctx.editMessageText(
                    '❌ Solo se pueden eliminar notificaciones viejas (>24h) que estén enviadas, fallidas o canceladas.',
                    {
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                        ])
                    }
                );
                return;
            }

            // Eliminar la notificación
            await ScheduledNotification.findByIdAndDelete(notificationId);

            await ctx.editMessageText(
                `🗑️ *Notificación eliminada exitosamente*\n\n📝 Póliza: ${notification.numeroPoliza}\n📋 Expediente: ${notification.expedienteNum || 'N/A'}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                        [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
                    ])
                }
            );

            logger.info(
                `Notificación ${notificationId} eliminada por admin (póliza: ${notification.numeroPoliza})`
            );
        } catch (error) {
            logger.error('Error en handleDeleteNotification:', error);
            await ctx.editMessageText('❌ Error al eliminar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                ])
            });
        }
    }

    /**
     * Sistema de edición de fechas de notificaciones
     */

    /**
     * Maneja la edición de fecha de una notificación
     */
    async handleEditDate(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            const currentDateTime = moment(notification.scheduledDate)
                .tz('America/Mexico_City')
                .format('DD/MM/YYYY HH:mm');
            const tipoEmoji =
                notification.tipoNotificacion === 'CONTACTO'
                    ? '📞'
                    : notification.tipoNotificacion === 'TERMINO'
                      ? '🏁'
                      : '📝';

            let message = `📅 *EDITAR FECHA Y HORA*\n\n`;
            message += `${tipoEmoji} *Tipo:* ${notification.tipoNotificacion}\n`;
            message += `📝 *Póliza:* ${notification.numeroPoliza}\n`;
            message += `📅 *Actual:* ${currentDateTime}\n\n`;

            if (notification.tipoNotificacion === 'CONTACTO') {
                message += `⚠️ *Al mover CONTACTO, TERMINO se recorre igual*\n\n`;
            }

            message += `🕐 Selecciona cuándo reprogramar:`;

            const buttons = [];

            // Opciones rápidas de tiempo: +10, +20, +30, +40 minutos
            buttons.push([
                Markup.button.callback(
                    '⏰ +10min',
                    `admin_notifications_quick_${notificationId}_10m`
                ),
                Markup.button.callback(
                    '⏰ +20min',
                    `admin_notifications_quick_${notificationId}_20m`
                )
            ]);

            buttons.push([
                Markup.button.callback(
                    '⏰ +30min',
                    `admin_notifications_quick_${notificationId}_30m`
                ),
                Markup.button.callback(
                    '⏰ +40min',
                    `admin_notifications_quick_${notificationId}_40m`
                )
            ]);

            // Opciones para hora personalizada
            buttons.push([
                Markup.button.callback(
                    '🕐 Elegir hora (hoy)',
                    `admin_notifications_custom_${notificationId}_today`
                ),
                Markup.button.callback(
                    '📅 Mañana',
                    `admin_notifications_custom_${notificationId}_tomorrow`
                )
            ]);

            // Botón de volver a la lista
            buttons.push([Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });
        } catch (error) {
            logger.error('Error en handleEditDate:', error);
            await ctx.editMessageText('❌ Error al mostrar opciones de edición', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                ])
            });
        }
    }

    /**
     * Maneja la edición rápida de fechas con opciones predefinidas
     */
    async handleQuickEdit(ctx: Context, notificationId: string, option: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            // Calcular nueva fecha sumando a la hora PROGRAMADA (no a la hora actual)
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
                        ...Markup.inlineKeyboard([
                            [
                                Markup.button.callback(
                                    '⬅️ Volver',
                                    `admin_notifications_edit_date_${notificationId}`
                                )
                            ]
                        ])
                    });
                    return;
            }

            // Ejecutar la edición usando NotificationManager
            const notificationManager = getNotificationManager();
            const result = await notificationManager.editNotificationDate(notificationId, newDate);

            if (result.success) {
                let successMessage = `${result.message}\n\n`;

                if (result.affectedNotifications && result.affectedNotifications.length > 1) {
                    successMessage += `📊 Notificaciones actualizadas: ${result.affectedNotifications.length}\n`;
                }

                successMessage += `⏰ Cambio realizado: ${moment().tz('America/Mexico_City').format('DD/MM HH:mm')}`;

                await ctx.editMessageText(successMessage, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                        [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
                    ])
                });

                logger.info(
                    `Admin editó fecha de notificación ${notificationId} a ${newDate.toISOString()}`
                );
            } else {
                await ctx.editMessageText(`❌ ${result.message}`, {
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '🔄 Reintentar',
                                `admin_notifications_edit_date_${notificationId}`
                            )
                        ],
                        [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                    ])
                });
            }
        } catch (error) {
            logger.error('Error en handleQuickEdit:', error);
            await ctx.editMessageText('❌ Error al editar la notificación', {
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '⬅️ Volver',
                            `admin_notifications_edit_date_${notificationId}`
                        )
                    ]
                ])
            });
        }
    }

    /**
     * Maneja la solicitud de hora personalizada (Elegir hora / Mañana)
     * @param dayOption 'today' o 'tomorrow'
     */
    async handleCustomTime(ctx: Context, notificationId: string, dayOption: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            // Guardar estado para esperar entrada de hora
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

            const dayText = dayOption === 'today' ? 'HOY' : 'MAÑANA';
            const tipoEmoji =
                notification.tipoNotificacion === 'CONTACTO'
                    ? '📞'
                    : notification.tipoNotificacion === 'TERMINO'
                      ? '🏁'
                      : '📝';

            let message = `🕐 *ELEGIR HORA PARA ${dayText}*\n\n`;
            message += `${tipoEmoji} *Tipo:* ${notification.tipoNotificacion}\n`;
            message += `📝 *Póliza:* ${notification.numeroPoliza}\n\n`;
            message += `✏️ *Escribe la hora en formato 24h:*\n`;
            message += `Ejemplos: \`07:00\`, \`14:30\`, \`18:45\``;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '❌ Cancelar',
                            `admin_notifications_edit_date_${notificationId}`
                        )
                    ]
                ])
            });
        } catch (error) {
            logger.error('Error en handleCustomTime:', error);
            await ctx.editMessageText('❌ Error al mostrar opciones', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                ])
            });
        }
    }

    /**
     * Procesa la hora ingresada por texto
     */
    async handleTextMessage(ctx: Context): Promise<boolean> {
        const userId = ctx.from!.id;
        const chatId = ctx.chat!.id;
        const messageText = (ctx.message as any).text;

        const adminState = adminStateManager.getAdminState(userId, chatId);

        if (!adminState || adminState.operation !== 'notification_custom_time') {
            return false;
        }

        const { notificationId, dayOption } = adminState.data || {};

        if (!notificationId || !dayOption) {
            adminStateManager.clearAdminState(userId, chatId);
            return false;
        }

        // Validar formato de hora HH:MM
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
        const match = messageText.trim().match(timeRegex);

        if (!match) {
            await ctx.reply(
                '❌ Formato inválido. Usa formato 24h: `HH:MM`\n\nEjemplos: `07:00`, `14:30`, `18:45`',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '❌ Cancelar',
                                `admin_notifications_edit_date_${notificationId}`
                            )
                        ]
                    ])
                }
            );
            return true;
        }

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);

        try {
            // Calcular la fecha según el día
            const now = moment().tz('America/Mexico_City');
            let targetDate = now.clone();

            if (dayOption === 'tomorrow') {
                targetDate = targetDate.add(1, 'day');
            }

            targetDate = targetDate.hour(hours).minute(minutes).second(0);

            // Verificar que la fecha sea futura
            if (targetDate.isBefore(moment().tz('America/Mexico_City'))) {
                await ctx.reply('❌ La hora debe ser en el futuro. Intenta de nuevo:', {
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '❌ Cancelar',
                                `admin_notifications_edit_date_${notificationId}`
                            )
                        ]
                    ])
                });
                return true;
            }

            // Ejecutar la edición
            const notificationManager = getNotificationManager();
            const result = await notificationManager.editNotificationDate(
                notificationId,
                targetDate.toDate()
            );

            // Limpiar estado admin
            adminStateManager.clearAdminState(userId, chatId);

            if (result.success) {
                const dayText = dayOption === 'today' ? 'hoy' : 'mañana';
                let successMessage = `✅ *Notificación reprogramada*\n\n`;
                successMessage += `📅 Nueva hora: ${dayText} a las *${targetDate.format('HH:mm')}*\n`;

                if (result.affectedNotifications && result.affectedNotifications.length > 1) {
                    successMessage += `📊 Notificaciones actualizadas: ${result.affectedNotifications.length}\n`;
                }

                await ctx.reply(successMessage, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                        [Markup.button.callback('🏠 Menú Admin', 'admin_menu')]
                    ])
                });

                logger.info(
                    `Admin editó notificación ${notificationId} a ${targetDate.toISOString()}`
                );
            } else {
                await ctx.reply(`❌ ${result.message}`, {
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '🔄 Reintentar',
                                `admin_notifications_edit_date_${notificationId}`
                            )
                        ],
                        [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')]
                    ])
                });
            }

            return true;
        } catch (error) {
            logger.error('Error procesando hora personalizada:', error);
            adminStateManager.clearAdminState(userId, chatId);
            await ctx.reply('❌ Error al procesar la hora', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                ])
            });
            return true;
        }
    }

    /**
     * Maneja la reprogramación rápida (para notificaciones FAILED)
     */
    async handleRescheduleNotification(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            // Reprogramar para 5 minutos después
            const newDate = moment().tz('America/Mexico_City').add(5, 'minutes').toDate();
            const notificationManager = getNotificationManager();
            const result = await notificationManager.editNotificationDate(notificationId, newDate);

            if (result.success) {
                await ctx.editMessageText(`✅ *Notificación Reprogramada*\n\n${result.message}`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                        [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
                    ])
                });

                logger.info(`Admin reprogramó notificación FAILED ${notificationId} a +5min`);
            } else {
                await ctx.editMessageText(`❌ Error al reprogramar: ${result.message}`, {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                    ])
                });
            }
        } catch (error) {
            logger.error('Error en handleRescheduleNotification:', error);
            await ctx.editMessageText('❌ Error al reprogramar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
                ])
            });
        }
    }
}

export default NotificationsHandler;
