// src/comandos/comandos/NotificationCommand.ts
import BaseCommand from './BaseCommand';
import { Markup } from 'telegraf';
import { getInstance as getNotificationManager } from '../../services/NotificationManager';
import moment from 'moment-timezone';
import type { IBaseHandler, NavigationContext } from './BaseCommand';
import type { IScheduledNotification } from '../../types/database';

// Interfaces

interface NotificationStats {
    byStatus: Array<{ _id: string; count: number }>;
    byDate: Array<{ _id: string; count: number }>;
    total: Array<{ value: number }>;
}

interface CallbackRegistry {
    registerCallback(action: string, handler: (ctx: NavigationContext) => Promise<void>): void;
}

interface NotificationHandler extends IBaseHandler {
    registry: CallbackRegistry;
}

/**
 * Comando para gestionar notificaciones programadas (solo admin)
 */
class NotificationCommand extends BaseCommand {
    private readonly ADMIN_ID: number;

    constructor(handler: NotificationHandler) {
        super(handler);
        this.ADMIN_ID = parseInt(process.env.ADMIN_USER_ID ?? '0');
    }

    getCommandName(): string {
        return 'notifications';
    }

    getDescription(): string {
        return 'Gestionar notificaciones programadas (solo admin)';
    }

    register(): void {
        this.bot.command(this.getCommandName(), async (ctx: NavigationContext) => {
            try {
                // Verificar si es administrador
                if (ctx.from?.id !== this.ADMIN_ID) {
                    await ctx.reply('⚠️ Este comando está restringido solo para administradores.');
                }

                // Obtener instancia del NotificationManager
                const notificationManager = getNotificationManager(this.bot);

                // Verificar inicialización
                if (!notificationManager.isInitialized) {
                    try {
                        await notificationManager.initialize();
                    } catch (initError: any) {
                        this.logError('Error al inicializar NotificationManager:', initError);
                        await ctx.reply('❌ Error al inicializar el sistema de notificaciones.');
                    }
                }

                // Obtener notificaciones pendientes
                const pendingNotifications = await notificationManager.getPendingNotifications();

                if (pendingNotifications.length === 0) {
                    await ctx.reply('📅 No hay notificaciones programadas pendientes.');
                    return;
                }

                await ctx.reply(
                    `📋 *${pendingNotifications.length} Notificaciones Pendientes*\n` +
                        'Selecciona una opción:',
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [
                                Markup.button.callback(
                                    '📋 Ver notificaciones del día',
                                    'notification:list'
                                )
                            ],
                            [Markup.button.callback('⏰ Ver próximas hoy', 'notification:today')],
                            [Markup.button.callback('📊 Ver estadísticas', 'notification:stats')]
                        ])
                    }
                );

                this.logInfo('Comando notifications ejecutado (admin)');
            } catch (error: any) {
                this.logError('Error en comando notifications:', error);
                await ctx.reply('❌ Error al procesar comando de notificaciones.');
            }
        });

        // Callback para ver lista completa
        const handlerWithRegistry = this.handler as NotificationHandler;
        handlerWithRegistry.registry.registerCallback(
            'notification:list',
            async (ctx: NavigationContext) => {
                try {
                    // Verificar si es administrador
                    if (ctx.from?.id !== this.ADMIN_ID) {
                        await ctx.answerCbQuery('⚠️ Acción restringida a administradores');
                        return;
                    }

                    await ctx.answerCbQuery();

                    const ScheduledNotification = require('../../models/scheduledNotification');

                    // Obtener todas las notificaciones del día actual
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);

                    const todayNotifications: IScheduledNotification[] =
                        await ScheduledNotification.find({
                            scheduledDate: {
                                $gte: today,
                                $lt: tomorrow
                            }
                        }).sort({ scheduledDate: 1 });

                    if (todayNotifications.length === 0) {
                        await ctx.reply('📅 No hay notificaciones programadas para hoy.', {
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('⬅️ Volver', 'notification:back')]
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
                            // CRÍTICO: Usar moment-timezone para mostrar hora correcta en CDMX
                            const scheduledMoment = moment(notification.scheduledDate).tz(
                                'America/Mexico_City'
                            );
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
                            const tipoEmoji =
                                notification.tipoNotificacion === 'CONTACTO'
                                    ? '🟨'
                                    : notification.tipoNotificacion === 'TERMINO'
                                      ? '🟩'
                                      : '';

                            const emoji = statusEmoji[notification.status] ?? '❓';

                            message += `${emoji}${tipoEmoji} *${formattedTime}* - ${notification.tipoNotificacion ?? 'MANUAL'}\n`;
                            message += `📝 Póliza: ${notification.numeroPoliza}\n`;
                            message += `📄 Exp: ${notification.expedienteNum}\n`;

                            if (notification.marcaModelo) {
                                message += `🚗 ${notification.marcaModelo}\n`;
                            }

                            message += '\n';
                        });

                        // Añadir botones solo al último mensaje
                        if (i === totalChunks - 1) {
                            await ctx.reply(message, {
                                parse_mode: 'Markdown',
                                ...Markup.inlineKeyboard([
                                    [Markup.button.callback('⬅️ Volver', 'notification:back')]
                                ])
                            });
                        } else {
                            await ctx.reply(message, { parse_mode: 'Markdown' });
                        }
                    }
                    return;
                } catch (error: any) {
                    this.logError('Error en notification:list:', error);
                    await ctx.reply('❌ Error al obtener notificaciones del día.');
                }
                return;
            }
        );

        // Callback para ver notificaciones de hoy
        handlerWithRegistry.registry.registerCallback(
            'notification:today',
            async (ctx: NavigationContext) => {
                try {
                    // Verificar si es administrador
                    if (ctx.from?.id !== this.ADMIN_ID) {
                        await ctx.answerCbQuery('⚠️ Acción restringida a administradores');
                        return;
                    }

                    await ctx.answerCbQuery();

                    const notificationManager = getNotificationManager(this.bot);
                    const allPending = await notificationManager.getPendingNotifications();

                    if (allPending.length === 0) {
                        await ctx.reply('📅 No hay notificaciones programadas pendientes.');
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
                        await ctx.reply('📅 No hay notificaciones programadas para hoy.', {
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('⬅️ Volver', 'notification:back')]
                            ])
                        });
                        return;
                    }

                    // Ordenar por hora
                    todayNotifications.sort(
                        (a: IScheduledNotification, b: IScheduledNotification) =>
                            new Date(a.scheduledDate).getTime() -
                            new Date(b.scheduledDate).getTime()
                    );

                    let message = `⏰ *Notificaciones para HOY (${todayNotifications.length})*\n\n`;

                    todayNotifications.forEach((notification: IScheduledNotification) => {
                        // CRÍTICO: Usar moment-timezone para mostrar hora correcta en CDMX
                        const scheduledMoment = moment(notification.scheduledDate).tz(
                            'America/Mexico_City'
                        );
                        const formattedTime = scheduledMoment.format('HH:mm');

                        // Emoji según el tipo de notificación
                        const tipoEmoji =
                            notification.tipoNotificacion === 'CONTACTO'
                                ? '🟨'
                                : notification.tipoNotificacion === 'TERMINO'
                                  ? '🟩'
                                  : '';

                        message += `🔹${tipoEmoji} *${formattedTime}* - ${notification.expedienteNum}\n`;
                        message += `📝 Póliza: ${notification.numeroPoliza}\n`;
                        message += `📋 Tipo: ${notification.tipoNotificacion ?? 'MANUAL'}\n`;

                        if (notification.marcaModelo) {
                            message += `🚗 ${notification.marcaModelo}\n`;
                        }

                        message += '\n';
                    });

                    await ctx.reply(message, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Volver', 'notification:back')]
                        ])
                    });
                    return;
                } catch (error: any) {
                    this.logError('Error en notification:today:', error);
                    await ctx.reply('❌ Error al obtener notificaciones de hoy.');
                }
                return;
            }
        );

        // Callback para estadísticas
        handlerWithRegistry.registry.registerCallback(
            'notification:stats',
            async (ctx: NavigationContext) => {
                try {
                    // Verificar si es administrador
                    if (ctx.from?.id !== this.ADMIN_ID) {
                        await ctx.answerCbQuery('⚠️ Acción restringida a administradores');
                        return;
                    }

                    await ctx.answerCbQuery();

                    const ScheduledNotification = require('../../models/scheduledNotification');

                    // Obtener estadísticas usando agregación
                    const stats: NotificationStats[] = await ScheduledNotification.aggregate([
                        {
                            $facet: {
                                byStatus: [
                                    { $group: { _id: '$status', count: { $sum: 1 } } },
                                    { $sort: { count: -1 } }
                                ],
                                byDate: [
                                    {
                                        $match: {
                                            status: 'PENDING',
                                            scheduledDate: { $exists: true }
                                        }
                                    },
                                    {
                                        $project: {
                                            dayMonthYear: {
                                                $dateToString: {
                                                    format: '%Y-%m-%d',
                                                    date: '$scheduledDate'
                                                }
                                            }
                                        }
                                    },
                                    { $group: { _id: '$dayMonthYear', count: { $sum: 1 } } },
                                    { $sort: { _id: 1 } }
                                ],
                                total: [{ $count: 'value' }]
                            }
                        }
                    ]);

                    // Formatear las estadísticas
                    const totalCount = stats[0].total.length > 0 ? stats[0].total[0].value : 0;
                    const statusCount = stats[0].byStatus
                        .map(item => `${item._id}: ${item.count}`)
                        .join('\n');

                    const now = new Date();
                    const today = now.toISOString().substring(0, 10);

                    const todayCount = stats[0].byDate.find(item => item._id === today)?.count ?? 0;

                    let message = '📊 *Estadísticas de Notificaciones*\n\n';
                    message += `Total: ${totalCount}\n\n`;
                    message += `*Por estado:*\n${statusCount}\n\n`;
                    message += `*Hoy (${today}):* ${todayCount}\n`;

                    await ctx.reply(message, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Volver', 'notification:back')]
                        ])
                    });
                } catch (error: any) {
                    this.logError('Error en notification:stats:', error);
                    await ctx.reply('❌ Error al obtener estadísticas de notificaciones.');
                }
            }
        );

        // Callback para volver
        handlerWithRegistry.registry.registerCallback(
            'notification:back',
            async (ctx: NavigationContext) => {
                try {
                    await ctx.answerCbQuery();

                    const notificationManager = getNotificationManager(this.bot);
                    const pendingNotifications =
                        await notificationManager.getPendingNotifications();

                    await ctx.reply(
                        `📋 *${pendingNotifications.length} Notificaciones Pendientes*\n` +
                            'Selecciona una opción:',
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [
                                    Markup.button.callback(
                                        '📋 Ver notificaciones del día',
                                        'notification:list'
                                    )
                                ],
                                [
                                    Markup.button.callback(
                                        '⏰ Ver próximas hoy',
                                        'notification:today'
                                    )
                                ],
                                [
                                    Markup.button.callback(
                                        '📊 Ver estadísticas',
                                        'notification:stats'
                                    )
                                ]
                            ])
                        }
                    );
                } catch (error: any) {
                    this.logError('Error en notification:back:', error);
                    await ctx.reply('❌ Error al volver al menú de notificaciones.');
                }
            }
        );
    }
}

export default NotificationCommand;
