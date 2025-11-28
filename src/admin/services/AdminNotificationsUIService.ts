// src/admin/services/AdminNotificationsUIService.ts
/**
 * Servicio de UI para el módulo de notificaciones del admin
 * Responsabilidad única: generación de mensajes y teclados
 */

import { Markup } from 'telegraf';
import moment from 'moment-timezone';

interface INotification {
    _id: any; // ObjectId or string
    numeroPoliza: string;
    expedienteNum?: string;
    tipoNotificacion: string;
    scheduledDate: Date;
    status: string;
}

export class AdminNotificationsUIService {
    private readonly timezone = 'America/Mexico_City';

    /**
     * Obtiene emoji según tipo de notificación
     */
    getTipoEmoji(tipo: string): string {
        switch (tipo) {
            case 'CONTACTO':
                return '📞';
            case 'TERMINO':
                return '🏁';
            default:
                return '📝';
        }
    }

    /**
     * Obtiene emoji de color según tipo
     */
    getTipoColorEmoji(tipo: string): string {
        switch (tipo) {
            case 'CONTACTO':
                return '🟨';
            case 'TERMINO':
                return '🟩';
            default:
                return '⚪';
        }
    }

    /**
     * Formatea fecha para mostrar
     */
    formatearFecha(date: Date, formato = 'DD/MM HH:mm'): string {
        return moment(date).tz(this.timezone).format(formato);
    }

    /**
     * Genera mensaje de sin notificaciones
     */
    generarMensajeSinNotificaciones(): string {
        return '📅 No hay notificaciones pendientes para editar.';
    }

    /**
     * Genera teclado para sin notificaciones
     */
    generarTecladoSinNotificaciones(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Volver', 'admin_notifications_menu')]
        ]);
    }

    /**
     * Genera mensaje de lista de notificaciones
     */
    generarMensajeListaNotificaciones(notifications: INotification[]): string {
        let message = `✏️ *EDITAR NOTIFICACIONES*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        message += `Selecciona una notificación para editar:\n\n`;

        notifications.forEach((notification, index) => {
            const formattedDateTime = this.formatearFecha(notification.scheduledDate);
            const tipoEmoji = this.getTipoColorEmoji(notification.tipoNotificacion);

            message += `${index + 1}. ${tipoEmoji} ${formattedDateTime} - ${notification.expedienteNum}\n`;
            message += `   📝 ${notification.numeroPoliza}\n\n`;
        });

        return message;
    }

    /**
     * Genera teclado de lista de notificaciones
     */
    generarTecladoListaNotificaciones(
        notifications: INotification[]
    ): ReturnType<typeof Markup.inlineKeyboard> {
        const buttons: any[][] = [];

        notifications.forEach((notification, index) => {
            const tipoEmoji = this.getTipoColorEmoji(notification.tipoNotificacion);
            buttons.push([
                Markup.button.callback(
                    `${index + 1}. ${tipoEmoji} ${notification.expedienteNum}`,
                    `admin_notifications_edit_date_${notification._id}`
                )
            ]);
        });

        buttons.push([Markup.button.callback('⬅️ Volver', 'admin_menu')]);

        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Genera mensaje de notificación no encontrada
     */
    generarMensajeNoEncontrada(): string {
        return '❌ Notificación no encontrada.';
    }

    /**
     * Genera teclado volver a editar
     */
    generarTecladoVolverEditar(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
        ]);
    }

    /**
     * Genera mensaje de notificación cancelada
     */
    generarMensajeCancelada(numeroPoliza: string, expedienteNum?: string): string {
        return `✅ *Notificación cancelada exitosamente*\n\n📝 Póliza: ${numeroPoliza}\n📋 Expediente: ${expedienteNum ?? 'N/A'}`;
    }

    /**
     * Genera teclado post-cancelación
     */
    generarTecladoPostCancelacion(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
            [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
        ]);
    }

    /**
     * Genera mensaje de error al eliminar (solo viejas)
     */
    generarMensajeErrorEliminarNoVieja(): string {
        return '❌ Solo se pueden eliminar notificaciones viejas (>24h) que estén enviadas, fallidas o canceladas.';
    }

    /**
     * Genera mensaje de notificación eliminada
     */
    generarMensajeEliminada(numeroPoliza: string, expedienteNum?: string): string {
        return `🗑️ *Notificación eliminada exitosamente*\n\n📝 Póliza: ${numeroPoliza}\n📋 Expediente: ${expedienteNum ?? 'N/A'}`;
    }

    /**
     * Genera mensaje de edición de fecha
     */
    generarMensajeEditarFecha(notification: INotification): string {
        const currentDateTime = this.formatearFecha(notification.scheduledDate, 'DD/MM/YYYY HH:mm');
        const tipoEmoji = this.getTipoEmoji(notification.tipoNotificacion);

        let message = `📅 *EDITAR FECHA Y HORA*\n\n`;
        message += `${tipoEmoji} *Tipo:* ${notification.tipoNotificacion}\n`;
        message += `📝 *Póliza:* ${notification.numeroPoliza}\n`;
        message += `📅 *Actual:* ${currentDateTime}\n\n`;

        if (notification.tipoNotificacion === 'CONTACTO') {
            message += `⚠️ *Al mover CONTACTO, TERMINO se recorre igual*\n\n`;
        }

        message += `🕐 Selecciona cuándo reprogramar:`;

        return message;
    }

    /**
     * Genera teclado de opciones de fecha
     */
    generarTecladoOpcionesFecha(notificationId: string): ReturnType<typeof Markup.inlineKeyboard> {
        const buttons = [
            [
                Markup.button.callback(
                    '⏰ +10min',
                    `admin_notifications_quick_${notificationId}_10m`
                ),
                Markup.button.callback(
                    '⏰ +20min',
                    `admin_notifications_quick_${notificationId}_20m`
                )
            ],
            [
                Markup.button.callback(
                    '⏰ +30min',
                    `admin_notifications_quick_${notificationId}_30m`
                ),
                Markup.button.callback(
                    '⏰ +40min',
                    `admin_notifications_quick_${notificationId}_40m`
                )
            ],
            [
                Markup.button.callback(
                    '🕐 Elegir hora (hoy)',
                    `admin_notifications_custom_${notificationId}_today`
                ),
                Markup.button.callback(
                    '📅 Mañana',
                    `admin_notifications_custom_${notificationId}_tomorrow`
                )
            ],
            [Markup.button.callback('⬅️ Volver', 'admin_notifications_edit')]
        ];

        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Genera mensaje de éxito al editar fecha
     */
    generarMensajeExitoEdicion(affectedCount: number, resultMessage: string): string {
        let message = `${resultMessage}\n\n`;

        if (affectedCount > 1) {
            message += `📊 Notificaciones actualizadas: ${affectedCount}\n`;
        }

        message += `⏰ Cambio realizado: ${moment().tz(this.timezone).format('DD/MM HH:mm')}`;

        return message;
    }

    /**
     * Genera teclado post-edición exitosa
     */
    generarTecladoPostEdicion(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
            [Markup.button.callback('🏠 Menú Principal', 'admin_notifications_menu')]
        ]);
    }

    /**
     * Genera teclado para reintentar edición
     */
    generarTecladoReintentarEdicion(
        notificationId: string
    ): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    '🔄 Reintentar',
                    `admin_notifications_edit_date_${notificationId}`
                )
            ],
            [Markup.button.callback('⬅️ Volver', `admin_notifications_edit`)]
        ]);
    }

    /**
     * Genera mensaje para elegir hora personalizada
     */
    generarMensajeElegirHora(notification: INotification, dayOption: string): string {
        const dayText = dayOption === 'today' ? 'HOY' : 'MAÑANA';
        const tipoEmoji = this.getTipoEmoji(notification.tipoNotificacion);

        let message = `🕐 *ELEGIR HORA PARA ${dayText}*\n\n`;
        message += `${tipoEmoji} *Tipo:* ${notification.tipoNotificacion}\n`;
        message += `📝 *Póliza:* ${notification.numeroPoliza}\n\n`;
        message += `✏️ *Escribe la hora en formato 24h:*\n`;
        message += `Ejemplos: \`07:00\`, \`14:30\`, \`18:45\``;

        return message;
    }

    /**
     * Genera teclado para cancelar hora personalizada
     */
    generarTecladoCancelarHora(notificationId: string): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    '❌ Cancelar',
                    `admin_notifications_edit_date_${notificationId}`
                )
            ]
        ]);
    }

    /**
     * Genera mensaje de formato inválido
     */
    generarMensajeFormatoInvalido(): string {
        return '❌ Formato inválido. Usa formato 24h: `HH:MM`\n\nEjemplos: `07:00`, `14:30`, `18:45`';
    }

    /**
     * Genera mensaje de hora debe ser futura
     */
    generarMensajeHoraFutura(): string {
        return '❌ La hora debe ser en el futuro. Intenta de nuevo:';
    }

    /**
     * Genera mensaje de éxito con hora personalizada
     */
    generarMensajeExitoHoraPersonalizada(
        dayOption: string,
        hora: string,
        affectedCount: number
    ): string {
        const dayText = dayOption === 'today' ? 'hoy' : 'mañana';
        let message = `✅ *Notificación reprogramada*\n\n`;
        message += `📅 Nueva hora: ${dayText} a las *${hora}*\n`;

        if (affectedCount > 1) {
            message += `📊 Notificaciones actualizadas: ${affectedCount}\n`;
        }

        return message;
    }

    /**
     * Genera teclado post hora personalizada
     */
    generarTecladoPostHoraPersonalizada(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Volver a Lista', 'admin_notifications_edit')],
            [Markup.button.callback('🏠 Menú Admin', 'admin_menu')]
        ]);
    }

    /**
     * Genera mensaje de reprogramación rápida exitosa
     */
    generarMensajeReprogramacionExitosa(resultMessage: string): string {
        return `✅ *Notificación Reprogramada*\n\n${resultMessage}`;
    }
}

// Singleton
let instance: AdminNotificationsUIService | null = null;

export function getAdminNotificationsUIService(): AdminNotificationsUIService {
    instance ??= new AdminNotificationsUIService();
    return instance;
}

export default AdminNotificationsUIService;
