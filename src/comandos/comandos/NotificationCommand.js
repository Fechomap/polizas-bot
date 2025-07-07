// src/comandos/comandos/NotificationCommand.js
const BaseCommand = require('./BaseCommand');
const { Markup } = require('telegraf');
const { getInstance: getNotificationManager } = require('../../services/NotificationManager');

class NotificationCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
        // ID del administrador para comandos restringidos
        this.ADMIN_ID = 7143094298; // Mismo ID que se usa en DeleteCommand
    }

    getCommandName() {
        return 'notifications';
    }

    getDescription() {
        return 'Gestionar notificaciones programadas (solo admin)';
    }

    register() {
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                // Verificar si es administrador
                if (ctx.from.id !== this.ADMIN_ID) {
                    return await ctx.reply('⚠️ Este comando está restringido solo para administradores.');
                }

                // Obtener instancia del NotificationManager
                const notificationManager = getNotificationManager(this.bot);

                // Verificar inicialización
                if (!notificationManager.isInitialized) {
                    try {
                        await notificationManager.initialize();
                    } catch (initError) {
                        this.logError('Error al inicializar NotificationManager:', initError);
                        return await ctx.reply('❌ Error al inicializar el sistema de notificaciones.');
                    }
                }

                // Obtener notificaciones pendientes
                const pendingNotifications = await notificationManager.getPendingNotifications();

                if (pendingNotifications.length === 0) {
                    return await ctx.reply('📅 No hay notificaciones programadas pendientes.');
                }

                await ctx.reply(
                    `📋 *${pendingNotifications.length} Notificaciones Pendientes*\n` +
                    'Selecciona una opción:',
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('📋 Ver notificaciones del día', 'notification:list')],
                            [Markup.button.callback('⏰ Ver próximas hoy', 'notification:today')],
                            [Markup.button.callback('📊 Ver estadísticas', 'notification:stats')],
                            [Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                        ])
                    }
                );

                this.logInfo('Comando notifications ejecutado (admin)');
            } catch (error) {
                this.logError('Error en comando notifications:', error);
                await ctx.reply('❌ Error al procesar comando de notificaciones.');
            }
        });

        // Callback para ver lista completa
        this.handler.registry.registerCallback('notification:list', async (ctx) => {
            try {
                // Verificar si es administrador
                if (ctx.from.id !== this.ADMIN_ID) {
                    return await ctx.answerCbQuery('⚠️ Acción restringida a administradores');
                }

                await ctx.answerCbQuery();

                const ScheduledNotification = require('../../models/scheduledNotification');
                
                // Obtener todas las notificaciones del día actual
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const todayNotifications = await ScheduledNotification.find({
                    scheduledDate: {
                        $gte: today,
                        $lt: tomorrow
                    }
                }).sort({ scheduledDate: 1 });

                if (todayNotifications.length === 0) {
                    return await ctx.reply(
                        '📅 No hay notificaciones programadas para hoy.',
                        {
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('⬅️ Volver', 'notification:back')],
                                [Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
                            ])
                        }
                    );
                }

                // Dividir en bloques de 8 máximo
                const chunkSize = 8;
                const totalChunks = Math.ceil(todayNotifications.length / chunkSize);

                for (let i = 0; i < totalChunks; i++) {
                    const chunk = todayNotifications.slice(i * chunkSize, (i + 1) * chunkSize);

                    let message = `📋 *Notificaciones de HOY (${i+1}/${totalChunks})*\n\n`;

                    chunk.forEach(notification => {
                        // CRÍTICO: Usar moment-timezone para mostrar hora correcta en CDMX
                        const moment = require('moment-timezone');
                        const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                        const formattedTime = scheduledMoment.format('HH:mm');
                        
                        // Emoji según el estado
                        const statusEmoji = {
                            'PENDING': '⏳',
                            'SENT': '✅',
                            'FAILED': '❌',
                            'CANCELLED': '🚫'
                        }[notification.status] || '❓';

                        message += `${statusEmoji} *${formattedTime}* - ${notification.status}\n`;
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
                                [Markup.button.callback('⬅️ Volver', 'notification:back')],
                                [Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
                            ])
                        });
                    } else {
                        await ctx.reply(message, { parse_mode: 'Markdown' });
                    }
                }
            } catch (error) {
                this.logError('Error en notification:list:', error);
                await ctx.reply('❌ Error al obtener notificaciones del día.');
            }
        });

        // Callback para ver notificaciones de hoy
        this.handler.registry.registerCallback('notification:today', async (ctx) => {
            try {
                // Verificar si es administrador
                if (ctx.from.id !== this.ADMIN_ID) {
                    return await ctx.answerCbQuery('⚠️ Acción restringida a administradores');
                }

                await ctx.answerCbQuery();

                const notificationManager = getNotificationManager(this.bot);
                const allPending = await notificationManager.getPendingNotifications();

                if (allPending.length === 0) {
                    return await ctx.reply('📅 No hay notificaciones programadas pendientes.');
                }

                // Filtrar solo las de hoy
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const todayNotifications = allPending.filter(n => {
                    const date = new Date(n.scheduledDate);
                    return date >= today && date < tomorrow;
                });

                if (todayNotifications.length === 0) {
                    return await ctx.reply(
                        '📅 No hay notificaciones programadas para hoy.',
                        {
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('⬅️ Volver', 'notification:back')],
                                [Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
                            ])
                        }
                    );
                }

                // Ordenar por hora
                todayNotifications.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

                let message = `⏰ *Notificaciones para HOY (${todayNotifications.length})*\n\n`;

                todayNotifications.forEach(notification => {
                    // CRÍTICO: Usar moment-timezone para mostrar hora correcta en CDMX
                    const moment = require('moment-timezone');
                    const scheduledMoment = moment(notification.scheduledDate).tz('America/Mexico_City');
                    const formattedTime = scheduledMoment.format('HH:mm');

                    message += `🔹 *${formattedTime}* - ${notification.expedienteNum}\n`;
                    message += `📝 Póliza: ${notification.numeroPoliza}\n`;

                    if (notification.marcaModelo) {
                        message += `🚗 ${notification.marcaModelo}\n`;
                    }

                    message += '\n';
                });

                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'notification:back')],
                        [Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
                    ])
                });
            } catch (error) {
                this.logError('Error en notification:today:', error);
                await ctx.reply('❌ Error al obtener notificaciones de hoy.');
            }
        });

        // Callback para estadísticas
        this.handler.registry.registerCallback('notification:stats', async (ctx) => {
            try {
                // Verificar si es administrador
                if (ctx.from.id !== this.ADMIN_ID) {
                    return await ctx.answerCbQuery('⚠️ Acción restringida a administradores');
                }

                await ctx.answerCbQuery();

                const ScheduledNotification = require('../../models/scheduledNotification');

                // Obtener estadísticas usando agregación
                const stats = await ScheduledNotification.aggregate([
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
                                            $dateToString: { format: '%Y-%m-%d', date: '$scheduledDate' }
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
                const statusCount = stats[0].byStatus.map(item => `${item._id}: ${item.count}`).join('\n');

                const now = new Date();
                const today = now.toISOString().substring(0, 10);

                const todayCount = stats[0].byDate.find(item => item._id === today)?.count || 0;

                let message = '📊 *Estadísticas de Notificaciones*\n\n';
                message += `Total: ${totalCount}\n\n`;
                message += `*Por estado:*\n${statusCount}\n\n`;
                message += `*Hoy (${today}):* ${todayCount}\n`;

                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'notification:back')],
                        [Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
                    ])
                });
            } catch (error) {
                this.logError('Error en notification:stats:', error);
                await ctx.reply('❌ Error al obtener estadísticas de notificaciones.');
            }
        });

        // Callback para volver
        this.handler.registry.registerCallback('notification:back', async (ctx) => {
            try {
                await ctx.answerCbQuery();

                const notificationManager = getNotificationManager(this.bot);
                const pendingNotifications = await notificationManager.getPendingNotifications();

                await ctx.reply(
                    `📋 *${pendingNotifications.length} Notificaciones Pendientes*\n` +
                    'Selecciona una opción:',
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('📋 Ver notificaciones del día', 'notification:list')],
                            [Markup.button.callback('⏰ Ver próximas hoy', 'notification:today')],
                            [Markup.button.callback('📊 Ver estadísticas', 'notification:stats')],
                            [Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                        ])
                    }
                );
            } catch (error) {
                this.logError('Error en notification:back:', error);
                await ctx.reply('❌ Error al volver al menú de notificaciones.');
            }
        });
    }
}

module.exports = NotificationCommand;
