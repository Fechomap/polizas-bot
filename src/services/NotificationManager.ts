// src/services/NotificationManager.ts
import logger from '../utils/logger';
import ScheduledNotification from '../models/scheduledNotification';
import { getPolicyByNumber } from '../controllers/policyController';
import moment from 'moment-timezone';
import { Telegraf } from 'telegraf';
import { IScheduledNotification } from '../../types';
import {
    scheduleNotification as scheduleNotificationInQueue,
    notificationQueue
} from '../queues/NotificationQueue';

moment.tz.setDefault('America/Mexico_City');

interface INotificationData {
    numeroPoliza: string;
    contactTime?: string;
    expedienteNum: string;
    tipoNotificacion: string;
    targetGroupId?: number;
    scheduledDate?: Date | string;
    origenDestino?: string;
    [key: string]: any;
}

interface IPolicyData {
    marcaModelo?: string;
    colorVehiculo?: string;
    placas?: string;
    telefono?: string;
}

interface INotificationStats {
    activeJobs: number;
    processingLocks: number;
    statuses: Record<string, number>;
}

class NotificationManager {
    public bot: Telegraf | null;
    public isInitialized: boolean;
    private processingLocks: Set<string>;
    private editingLocks: Set<string>;

    constructor(bot?: Telegraf) {
        this.bot = bot || null;
        this.isInitialized = false;
        this.processingLocks = new Set();
        this.editingLocks = new Set();
    }

    async initialize(): Promise<void> {
        if (!this.bot) throw new Error('NotificationManager requiere una instancia del bot.');
        if (this.isInitialized) return;
        this.isInitialized = true;
        logger.info(
            '✅ NotificationManager inicializado (la gestión de notificaciones ahora es por colas).'
        );
    }

    async scheduleNotification(data: INotificationData): Promise<IScheduledNotification> {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 100;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (!data.numeroPoliza || !data.expedienteNum)
                    throw new Error('Datos incompletos para programar notificación');
                if (!data.targetGroupId)
                    data.targetGroupId = parseInt(
                        process.env.TELEGRAM_GROUP_ID || '-1002212807945'
                    );

                let policyData: IPolicyData = {};
                try {
                    const policy = (await getPolicyByNumber(data.numeroPoliza)) as any;
                    if (policy) {
                        policyData = {
                            marcaModelo: `${policy.marca} ${policy.submarca} (${policy.año})`,
                            colorVehiculo: policy.color || '',
                            placas: policy.placas || '',
                            telefono: policy.telefono || ''
                        };
                    }
                } catch (err) {
                    logger.warn(`No se pudo obtener datos de póliza ${data.numeroPoliza}:`, err);
                }

                let scheduledDate: Date;
                if (data.scheduledDate) {
                    scheduledDate = moment(data.scheduledDate).tz('America/Mexico_City').toDate();
                } else if (data.contactTime) {
                    const parsedDate = this.parseContactTime(data.contactTime);
                    if (!parsedDate)
                        throw new Error(`Formato de fecha/hora inválido: ${data.contactTime}`);
                    scheduledDate = parsedDate;
                } else {
                    throw new Error('Se requiere scheduledDate o contactTime');
                }

                const existingNotification = await ScheduledNotification.findOneAndUpdate(
                    {
                        numeroPoliza: data.numeroPoliza,
                        expedienteNum: data.expedienteNum,
                        tipoNotificacion: data.tipoNotificacion,
                        status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
                    },
                    {
                        $setOnInsert: {
                            ...data,
                            ...policyData,
                            scheduledDate,
                            status: 'PENDING',
                            retryCount: 0
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                const isNewNotification =
                    !existingNotification.createdAt ||
                    new Date().getTime() - new Date(existingNotification.createdAt).getTime() <
                        1000;
                if (!isNewNotification) {
                    logger.warn('[DUPLICATE_CREATION_PREVENTED] Ya existe notificación activa', {
                        existingId: existingNotification._id
                    });
                    return existingNotification;
                }

                logger.info(`[CREATED] Notificación ${existingNotification._id} creada en BD.`);
                await scheduleNotificationInQueue(
                    existingNotification._id.toString(),
                    scheduledDate
                );
                return existingNotification;
            } catch (error: any) {
                if (error.code === 11000 && attempt < MAX_RETRIES) {
                    logger.warn(
                        `[RETRY] Intento ${attempt}/${MAX_RETRIES} falló por duplicado, reintentando...`
                    );
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                    continue;
                }
                logger.error(
                    `Error al crear notificación (intento ${attempt}/${MAX_RETRIES}):`,
                    error
                );
                throw error;
            }
        }
        throw new Error(`Falló crear notificación después de ${MAX_RETRIES} intentos`);
    }

    async validateEditableNotification(
        notification: any,
        newDate: Date
    ): Promise<{
        canEdit: boolean;
        reason?: string;
        editMode?: 'NORMAL_EDIT' | 'FORCE_CANCEL' | 'CANCEL_AND_CREATE';
        timeToExecution?: number;
        requiresImmediateCancel?: boolean;
    }> {
        const now = moment().tz('America/Mexico_City').toDate();
        if (newDate <= now)
            return { canEdit: false, reason: 'La nueva fecha debe ser en el futuro' };

        const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
        if (notification.scheduledDate < twentyMinutesAgo)
            return {
                canEdit: false,
                reason: 'No se puede editar una notificación programada hace más de 20 minutos'
            };

        if (['PROCESSING', 'SENT', 'FAILED'].includes(notification.status))
            return {
                canEdit: false,
                reason: `No se puede editar una notificación en estado ${notification.status}`
            };

        const timeToExecution = new Date(notification.scheduledDate).getTime() - now.getTime();
        if (timeToExecution < 2 * 60 * 1000 && timeToExecution > 0)
            return {
                canEdit: true,
                editMode: 'CANCEL_AND_CREATE',
                timeToExecution,
                reason: 'Tiempo crítico: se cancelará la original y se creará una nueva'
            };
        if (timeToExecution < 10 * 60 * 1000 && timeToExecution > 0)
            return {
                canEdit: true,
                editMode: 'FORCE_CANCEL',
                timeToExecution,
                requiresImmediateCancel: true,
                reason: 'Edición en ventana de riesgo: requiere cancelación forzosa'
            };

        return { canEdit: true, editMode: 'NORMAL_EDIT', timeToExecution };
    }

    async forceJobCancel(notificationId: string): Promise<boolean> {
        try {
            logger.info(`[FORCE_CANCEL] Iniciando cancelación forzosa para ${notificationId}`);
            this.editingLocks.add(notificationId);

            const job = await notificationQueue.getJob(notificationId);
            if (job) {
                await job.remove();
                logger.info(`[FORCE_CANCEL] Job ${notificationId} eliminado de la cola.`);
            }

            await ScheduledNotification.findByIdAndUpdate(notificationId, {
                status: 'EDITING',
                editingStartedAt: new Date()
            });

            this.editingLocks.delete(notificationId);
            return true;
        } catch (error) {
            logger.error(`Error en cancelación forzosa ${notificationId}:`, error);
            this.editingLocks.delete(notificationId);
            return false;
        }
    }

    async cancelAndRecreate(
        originalId: string,
        newDate: Date
    ): Promise<{ success: boolean; message: string; originalId: string; newId?: string }> {
        const original = await ScheduledNotification.findById(originalId);
        if (!original)
            return { success: false, message: 'Notificación original no encontrada', originalId };

        await this.forceJobCancel(originalId);
        await ScheduledNotification.findByIdAndUpdate(originalId, {
            status: 'CANCELLED',
            cancelReason: 'Editada en tiempo crítico'
        });

        const newNotificationData = {
            numeroPoliza: original.numeroPoliza,
            expedienteNum: original.expedienteNum,
            tipoNotificacion: original.tipoNotificacion,
            contactTime: newDate.toISOString(),
            targetGroupId: original.targetGroupId,
            origenDestino: original.origenDestino,
            marcaModelo: original.marcaModelo,
            colorVehiculo: original.colorVehiculo,
            placas: original.placas,
            telefono: original.telefono,
            scheduledDate: newDate
        };

        const newNotification = await this.scheduleNotification(newNotificationData);
        const newTime = moment(newDate).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm');
        return {
            success: true,
            message: `✅ Notificación crítica recreada para ${newTime}`,
            originalId,
            newId: newNotification._id.toString()
        };
    }

    async editNotificationDate(
        notificationId: string,
        newDate: Date
    ): Promise<{ success: boolean; message: string; affectedNotifications?: string[] }> {
        const notification = await ScheduledNotification.findById(notificationId);
        if (!notification) return { success: false, message: 'Notificación no encontrada' };

        const validation = await this.validateEditableNotification(notification, newDate);
        if (!validation.canEdit)
            return { success: false, message: validation.reason || 'No se puede editar' };

        if (validation.editMode === 'CANCEL_AND_CREATE') {
            return this.cancelAndRecreate(notificationId, newDate);
        }
        if (validation.editMode === 'FORCE_CANCEL') {
            const cancelSuccess = await this.forceJobCancel(notificationId);
            if (!cancelSuccess)
                return { success: false, message: 'No se pudo cancelar el job de manera segura' };
        }

        // Si es CONTACTO, mover también TERMINO manteniendo la diferencia de tiempo
        if (notification.tipoNotificacion === 'CONTACTO') {
            return this.editContactoAndTermino(notification, newDate);
        }
        return this.editSingleNotification(notification, newDate);
    }

    private async editContactoAndTermino(
        contactoNotification: any,
        newContactoDate: Date
    ): Promise<{ success: boolean; message: string; affectedNotifications?: string[] }> {
        const terminoNotification = await ScheduledNotification.findOne({
            numeroPoliza: contactoNotification.numeroPoliza,
            expedienteNum: contactoNotification.expedienteNum,
            tipoNotificacion: 'TERMINO',
            status: { $in: ['PENDING', 'SCHEDULED'] }
        });
        if (!terminoNotification)
            return this.editSingleNotification(contactoNotification, newContactoDate);

        const originalDiff =
            terminoNotification.scheduledDate.getTime() -
            contactoNotification.scheduledDate.getTime();
        const newTerminoDate = new Date(newContactoDate.getTime() + originalDiff);

        const terminoValidation = await this.validateEditableNotification(
            terminoNotification,
            newTerminoDate
        );
        if (!terminoValidation.canEdit)
            return {
                success: false,
                message: `No se puede mover TERMINO: ${terminoValidation.reason}`
            };

        const contactoJob = await notificationQueue.getJob(contactoNotification._id.toString());
        if (contactoJob) await contactoJob.remove();
        const terminoJob = await notificationQueue.getJob(terminoNotification._id.toString());
        if (terminoJob) await terminoJob.remove();

        await Promise.all([
            ScheduledNotification.findByIdAndUpdate(contactoNotification._id, {
                scheduledDate: newContactoDate,
                status: 'PENDING'
            }),
            ScheduledNotification.findByIdAndUpdate(terminoNotification._id, {
                scheduledDate: newTerminoDate,
                status: 'PENDING'
            })
        ]);

        const updatedContacto = await ScheduledNotification.findById(contactoNotification._id);
        const updatedTermino = await ScheduledNotification.findById(terminoNotification._id);
        if (updatedContacto)
            await scheduleNotificationInQueue(
                updatedContacto._id.toString(),
                new Date(updatedContacto.scheduledDate)
            );
        if (updatedTermino)
            await scheduleNotificationInQueue(
                updatedTermino._id.toString(),
                new Date(updatedTermino.scheduledDate)
            );

        const contactoTime = moment(newContactoDate)
            .tz('America/Mexico_City')
            .format('DD/MM/YYYY HH:mm');
        const terminoTime = moment(newTerminoDate)
            .tz('America/Mexico_City')
            .format('DD/MM/YYYY HH:mm');

        return {
            success: true,
            message: `✅ CONTACTO reprogramado a ${contactoTime} y TERMINO a ${terminoTime}`,
            affectedNotifications: [
                contactoNotification._id.toString(),
                terminoNotification._id.toString()
            ]
        };
    }

    private async editSingleNotification(
        notification: any,
        newDate: Date
    ): Promise<{ success: boolean; message: string; affectedNotifications?: string[] }> {
        const job = await notificationQueue.getJob(notification._id.toString());
        if (job) await job.remove();

        await ScheduledNotification.findByIdAndUpdate(notification._id, {
            scheduledDate: newDate,
            status: 'PENDING'
        });

        const updatedNotification = await ScheduledNotification.findById(notification._id);
        if (updatedNotification)
            await scheduleNotificationInQueue(
                updatedNotification._id.toString(),
                new Date(updatedNotification.scheduledDate)
            );

        const newTime = moment(newDate).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm');
        return {
            success: true,
            message: `✅ Notificación reprogramada a ${newTime}`,
            affectedNotifications: [notification._id.toString()]
        };
    }

    async cancelNotification(notificationId: string): Promise<boolean> {
        const notification = await ScheduledNotification.findById(notificationId);
        if (!notification || !['PENDING', 'SCHEDULED'].includes(notification.status)) return false;

        const job = await notificationQueue.getJob(notificationId);
        if (job) await job.remove();

        await (notification as any).cancel();
        logger.info(`✅ Notificación ${notificationId} cancelada`);
        return true;
    }

    async cancelNotificationsByExpediente(expedienteNum: string): Promise<number> {
        try {
            const notifications = await ScheduledNotification.find({
                expedienteNum,
                status: { $in: ['PENDING', 'SCHEDULED'] }
            });

            let cancelledCount = 0;
            for (const notification of notifications) {
                if (await this.cancelNotification(notification._id.toString())) {
                    cancelledCount++;
                }
            }

            logger.info(
                `[CANCELLED] ${cancelledCount} notificaciones del expediente ${expedienteNum}`
            );
            return cancelledCount;
        } catch (error: any) {
            logger.error(`Error cancelando notificaciones del expediente ${expedienteNum}:`, error);
            return 0;
        }
    }

    /**
     * Obtiene notificaciones pendientes directamente desde la cola
     */
    async getPendingNotifications(): Promise<IScheduledNotification[]> {
        try {
            const jobs = await notificationQueue.getJobs(['waiting', 'delayed']);
            const notificationIds = jobs.map(job => job.data.notificationId).filter(Boolean);

            if (notificationIds.length === 0) {
                return [];
            }

            const notifications = await ScheduledNotification.find({
                _id: { $in: notificationIds },
                status: { $in: ['PENDING', 'SCHEDULED'] }
            }).lean();

            return notifications as IScheduledNotification[];
        } catch (error) {
            logger.error('Error obteniendo notificaciones pendientes de la cola:', error);
            return [];
        }
    }

    /**
     * Convierte hora HH:mm a Date para hoy o mañana
     */
    parseContactTime(timeStr: string): Date | null {
        const match = timeStr.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
        if (!match) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        const scheduledCDMX = moment()
            .tz('America/Mexico_City')
            .hour(hours)
            .minute(minutes)
            .second(0)
            .millisecond(0);
        if (scheduledCDMX.isSameOrBefore(moment().tz('America/Mexico_City')))
            scheduledCDMX.add(1, 'day');
        return scheduledCDMX.toDate();
    }

    stop(): void {
        this.isInitialized = false;
        logger.info(
            'NotificationManager detenido (lógica de colas ahora vive independientemente).'
        );
    }

    async getStats(): Promise<INotificationStats | null> {
        const queueStats = await notificationQueue.getJobCounts();
        const dbStats = await ScheduledNotification.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const statuses = dbStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {});

        return {
            activeJobs: queueStats.active + queueStats.waiting,
            processingLocks: this.processingLocks.size,
            statuses
        };
    }
}

let instance: NotificationManager | null = null;
export const getInstance = (bot?: Telegraf): NotificationManager => {
    if (!instance) instance = new NotificationManager(bot);
    else if (bot && !instance.bot) instance.bot = bot;
    return instance;
};

export { NotificationManager };
export default NotificationManager;
