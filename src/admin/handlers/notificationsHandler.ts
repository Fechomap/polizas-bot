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
     * Lista TODAS las notificaciones pendientes (hoy y futuras)
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

            // Filtrar solo las futuras (no filtrar por día específico)
            const now = moment().tz('America/Mexico_City').toDate();
            
            const futureNotifications = allPending.filter((n: IScheduledNotification) => {
                return new Date(n.scheduledDate) > now;
            });

            if (futureNotifications.length === 0) {
                await ctx.editMessageText('📅 No hay notificaciones pendientes futuras.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                    ])
                });
                return;
            }

            // Ordenar por fecha/hora
            futureNotifications.sort(
                (a: IScheduledNotification, b: IScheduledNotification) =>
                    new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
            );

            // Separar por días para mejor visualización
            const today = moment().tz('America/Mexico_City').startOf('day');
            const todayNotifs = futureNotifications.filter(n => 
                moment(n.scheduledDate).tz('America/Mexico_City').isSame(today, 'day'));
            const tomorrowNotifs = futureNotifications.filter(n => 
                moment(n.scheduledDate).tz('America/Mexico_City').isSame(today.clone().add(1, 'day'), 'day'));
            const laterNotifs = futureNotifications.filter(n => 
                moment(n.scheduledDate).tz('America/Mexico_City').isAfter(today.clone().add(1, 'day'), 'day'));

            let message = `⏰ *NOTIFICACIONES PENDIENTES (${futureNotifications.length})*\n\n`;

            // Mostrar las de hoy
            if (todayNotifs.length > 0) {
                message += `📅 *HOY (${todayNotifs.length}):*\n`;
                todayNotifs.forEach((notification: IScheduledNotification) => {
                    const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                    const formattedTime = scheduledMoment.format('HH:mm');

                    const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '🟨' : 
                                    notification.tipoNotificacion === 'TERMINO' ? '🟩' : '📝';

                    message += `🔹${tipoEmoji} *${formattedTime}* - ${notification.expedienteNum}\n`;
                    message += `📝 ${notification.numeroPoliza} (${notification.tipoNotificacion})\n\n`;
                });
            }

            // Mostrar las de mañana
            if (tomorrowNotifs.length > 0) {
                message += `📅 *MAÑANA (${tomorrowNotifs.length}):*\n`;
                tomorrowNotifs.forEach((notification: IScheduledNotification) => {
                    const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                    const formattedTime = scheduledMoment.format('HH:mm');

                    const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '🟨' : 
                                    notification.tipoNotificacion === 'TERMINO' ? '🟩' : '📝';

                    message += `🔹${tipoEmoji} *${formattedTime}* - ${notification.expedienteNum}\n`;
                    message += `📝 ${notification.numeroPoliza} (${notification.tipoNotificacion})\n\n`;
                });
            }

            // Mostrar las de días posteriores (máximo 5)
            if (laterNotifs.length > 0) {
                message += `📅 *PRÓXIMOS DÍAS (${laterNotifs.length}):*\n`;
                laterNotifs.slice(0, 5).forEach((notification: IScheduledNotification) => {
                    const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                    const formattedDateTime = scheduledMoment.format('DD/MM HH:mm');

                    const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '🟨' : 
                                    notification.tipoNotificacion === 'TERMINO' ? '🟩' : '📝';

                    message += `🔹${tipoEmoji} *${formattedDateTime}* - ${notification.expedienteNum}\n`;
                    message += `📝 ${notification.numeroPoliza} (${notification.tipoNotificacion})\n\n`;
                });

                if (laterNotifs.length > 5) {
                    message += `... y ${laterNotifs.length - 5} más\n\n`;
                }
            }

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
                ])
            });
        } catch (error) {
            logger.error('Error en handleTodayNotifications:', error);
            await ctx.editMessageText('❌ Error al obtener notificaciones pendientes.', {
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
    /**
     * Maneja la edición individual de una notificación específica
     */
    async handleEditIndividual(ctx: Context, notificationId: string): Promise<void> {
        try {
            await ctx.answerCbQuery();

            // Buscar la notificación específica
            const notification = await ScheduledNotification.findById(notificationId);
            
            if (!notification) {
                await ctx.editMessageText('❌ Notificación no encontrada.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver al Menú', 'admin_notifications_edit')]
                    ])
                });
                return;
            }

            // Formatear la información de la notificación
            const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
            const formattedDateTime = scheduledMoment.format('DD/MM/YYYY HH:mm');
            
            const statusEmoji: Record<string, string> = {
                PENDING: '⏳ Pendiente',
                SCHEDULED: '🕒 Programada',
                PROCESSING: '⚡ Procesando',
                SENT: '✅ Enviada',
                FAILED: '❌ Falló',
                CANCELLED: '🚫 Cancelada'
            };

            const statusText = statusEmoji[notification.status] || notification.status;
            
            let message = `🔧 *EDITAR NOTIFICACIÓN*\n\n`;
            message += `📋 *Expediente:* ${notification.expedienteNum || 'N/A'}\n`;
            message += `📝 *Póliza:* ${notification.numeroPoliza}\n`;
            message += `📅 *Programada:* ${formattedDateTime}\n`;
            message += `📊 *Estado:* ${statusText}\n`;
            message += `🔄 *Reintentos:* ${notification.retryCount || 0}\n`;
            message += `📞 *Tipo:* ${notification.tipoNotificacion}\n`;
            
            if (notification.telefono) {
                message += `📱 *Teléfono:* ${notification.telefono}\n`;
            }
            
            if (notification.error) {
                message += `\n❌ *Error:* ${notification.error.substring(0, 100)}${notification.error.length > 100 ? '...' : ''}`;
            }

            // Botones según el estado de la notificación
            const buttons = [];
            
            // Solo mostrar opciones relevantes según el estado
            if (['PENDING', 'SCHEDULED', 'FAILED'].includes(notification.status)) {
                buttons.push([Markup.button.callback('🗑️ Cancelar Notificación', `admin_notifications_cancel_${notificationId}`)]);
                
                // Botón de editar fecha (siempre disponible para estos estados)
                buttons.push([Markup.button.callback('📅 Editar Fecha', `admin_notifications_edit_date_${notificationId}`)]);
                
                if (notification.status === 'FAILED') {
                    buttons.push([Markup.button.callback('🔄 Reprogramar 5min', `admin_notifications_reschedule_${notificationId}`)]);
                }
            }
            
            if (notification.status === 'PROCESSING') {
                buttons.push([Markup.button.callback('⏹️ Detener Procesamiento', `admin_notifications_stop_${notificationId}`)]);
            }
            
            // Botón para limpiar si es una notificación vieja
            const ahora = new Date();
            const hace24Horas = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
            
            if (['SENT', 'FAILED', 'CANCELLED'].includes(notification.status) && 
                notification.scheduledDate < hace24Horas) {
                buttons.push([Markup.button.callback('🧹 Eliminar (vieja)', `admin_notifications_delete_${notificationId}`)]);
            }
            
            // Botón de regreso
            buttons.push([Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')]);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });

        } catch (error) {
            logger.error('Error en handleEditIndividual:', error);
            await ctx.editMessageText('❌ Error al cargar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
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
            
            await ctx.editMessageText(`✅ *Notificación cancelada exitosamente*\n\n📝 Póliza: ${notification.numeroPoliza}\n📋 Expediente: ${notification.expedienteNum || 'N/A'}`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                    [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
                ])
            });

            logger.info(`Notificación ${notificationId} cancelada por admin`);

        } catch (error) {
            logger.error('Error en handleCancelNotification:', error);
            await ctx.editMessageText('❌ Error al cancelar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
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
            
            if (!(['SENT', 'FAILED', 'CANCELLED'].includes(notification.status) && 
                  notification.scheduledDate < hace24Horas)) {
                await ctx.editMessageText('❌ Solo se pueden eliminar notificaciones viejas (>24h) que estén enviadas, fallidas o canceladas.', {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
                    ])
                });
                return;
            }

            // Eliminar la notificación
            await ScheduledNotification.findByIdAndDelete(notificationId);
            
            await ctx.editMessageText(`🗑️ *Notificación eliminada exitosamente*\n\n📝 Póliza: ${notification.numeroPoliza}\n📋 Expediente: ${notification.expedienteNum || 'N/A'}`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
                    [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
                ])
            });

            logger.info(`Notificación ${notificationId} eliminada por admin (póliza: ${notification.numeroPoliza})`);

        } catch (error) {
            logger.error('Error en handleDeleteNotification:', error);
            await ctx.editMessageText('❌ Error al eliminar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
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

            const currentDateTime = moment(notification.scheduledDate).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm');
            const tipoEmoji = notification.tipoNotificacion === 'CONTACTO' ? '📞' : 
                             notification.tipoNotificacion === 'TERMINO' ? '🏁' : '📝';

            let message = `📅 *EDITAR FECHA Y HORA*\n\n`;
            message += `${tipoEmoji} *Tipo:* ${notification.tipoNotificacion}\n`;
            message += `📝 *Póliza:* ${notification.numeroPoliza}\n`;
            message += `📅 *Actual:* ${currentDateTime}\n\n`;
            
            if (notification.tipoNotificacion === 'CONTACTO') {
                message += `⚠️ *Al mover CONTACTO, TERMINO se ajusta automáticamente*\n\n`;
            } else if (notification.tipoNotificacion === 'TERMINO') {
                message += `⚠️ *TERMINO no puede ser antes que CONTACTO*\n\n`;
            }
            
            message += `🕐 Selecciona cuándo reprogramar:`;

            const now = moment().tz('America/Mexico_City');
            const buttons = [];
            
            // Opciones rápidas de tiempo
            buttons.push([
                Markup.button.callback('⏰ +30min', `admin_notifications_quick_${notificationId}_30m`),
                Markup.button.callback('⏰ +1h', `admin_notifications_quick_${notificationId}_1h`),
                Markup.button.callback('⏰ +2h', `admin_notifications_quick_${notificationId}_2h`)
            ]);

            buttons.push([
                Markup.button.callback('🌅 +4h', `admin_notifications_quick_${notificationId}_4h`),
                Markup.button.callback('🌄 Mañana 8AM', `admin_notifications_quick_${notificationId}_tomorrow8`),
                Markup.button.callback('🌆 Mañana 6PM', `admin_notifications_quick_${notificationId}_tomorrow18`)
            ]);

            // Opciones de fecha específica (simplificadas por Telegram)
            buttons.push([
                Markup.button.callback('📅 Hoy +3h', `admin_notifications_quick_${notificationId}_today3h`),
                Markup.button.callback('📅 Hoy +6h', `admin_notifications_quick_${notificationId}_today6h`)
            ]);

            // Botones de navegación
            buttons.push([Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]);

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });

        } catch (error) {
            logger.error('Error en handleEditDate:', error);
            await ctx.editMessageText('❌ Error al mostrar opciones de edición', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
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

            // Calcular nueva fecha según la opción
            const now = moment().tz('America/Mexico_City');
            let newDate: Date;

            switch (option) {
                case '30m':
                    newDate = now.add(30, 'minutes').toDate();
                    break;
                case '1h':
                    newDate = now.add(1, 'hour').toDate();
                    break;
                case '2h':
                    newDate = now.add(2, 'hours').toDate();
                    break;
                case '4h':
                    newDate = now.add(4, 'hours').toDate();
                    break;
                case 'today3h':
                    newDate = now.add(3, 'hours').toDate();
                    break;
                case 'today6h':
                    newDate = now.add(6, 'hours').toDate();
                    break;
                case 'tomorrow8':
                    newDate = now.add(1, 'day').hour(8).minute(0).second(0).toDate();
                    break;
                case 'tomorrow18':
                    newDate = now.add(1, 'day').hour(18).minute(0).second(0).toDate();
                    break;
                default:
                    await ctx.editMessageText('❌ Opción no válida', {
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_date_${notificationId}`)]
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

                logger.info(`Admin editó fecha de notificación ${notificationId} a ${newDate.toISOString()}`);
            } else {
                await ctx.editMessageText(`❌ ${result.message}`, {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Reintentar', `admin_notifications_edit_date_${notificationId}`)],
                        [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
                    ])
                });
            }

        } catch (error) {
            logger.error('Error en handleQuickEdit:', error);
            await ctx.editMessageText('❌ Error al editar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_date_${notificationId}`)]
                ])
            });
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
                        [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
                    ])
                });
            }

        } catch (error) {
            logger.error('Error en handleRescheduleNotification:', error);
            await ctx.editMessageText('❌ Error al reprogramar la notificación', {
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', `admin_notifications_edit_${notificationId}`)]
                ])
            });
        }
    }
}

export default NotificationsHandler;