// src/services/NotificationManager.ts
import logger from '../utils/logger';
import { prisma } from '../database/prisma';
import { getPolicyByNumber } from '../controllers/policyController';
import moment from 'moment-timezone';
import { Telegraf } from 'telegraf';
import { IScheduledNotification } from '../../types';
import {
    scheduleNotification as scheduleNotificationInQueue,
    notificationQueue
} from '../queues/NotificationQueue';
import type { NotificationStatus, NotificationType } from '../generated/prisma';

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
        this.bot = bot ?? null;
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
                data.targetGroupId ??= parseInt(process.env.TELEGRAM_GROUP_ID ?? '-1002212807945');

                let policyData: IPolicyData = {};
                try {
                    const policy = (await getPolicyByNumber(data.numeroPoliza)) as any;
                    if (policy) {
                        policyData = {
                            marcaModelo: `${policy.marca} ${policy.submarca} (${policy.anio ?? policy.año})`,
                            colorVehiculo: policy.color ?? '',
                            placas: policy.placas ?? '',
                            telefono: policy.telefono ?? ''
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

                // Buscar notificación existente
                const existingNotification = await prisma.scheduledNotification.findFirst({
                    where: {
                        numeroPoliza: data.numeroPoliza,
                        expedienteNum: data.expedienteNum,
                        tipoNotificacion: data.tipoNotificacion as NotificationType,
                        status: { in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
                    }
                });

                if (existingNotification) {
                    logger.warn('[DUPLICATE_CREATION_PREVENTED] Ya existe notificación activa', {
                        existingId: existingNotification.id
                    });
                    return existingNotification as unknown as IScheduledNotification;
                }

                // Crear nueva notificación
                const newNotification = await prisma.scheduledNotification.create({
                    data: {
                        numeroPoliza: data.numeroPoliza,
                        expedienteNum: data.expedienteNum,
                        tipoNotificacion: data.tipoNotificacion as NotificationType,
                        targetGroupId: BigInt(data.targetGroupId),
                        scheduledDate,
                        status: 'PENDING',
                        retryCount: 0,
                        origenDestino: data.origenDestino ?? null,
                        marcaModelo: policyData.marcaModelo ?? null,
                        colorVehiculo: policyData.colorVehiculo ?? null,
                        placas: policyData.placas ?? null,
                        telefono: policyData.telefono ?? null,
                        contactTime: data.contactTime ?? scheduledDate.toISOString()
                    }
                });

                logger.info(`[CREATED] Notificación ${newNotification.id} creada en BD.`);
                await scheduleNotificationInQueue(newNotification.id, scheduledDate);
                return newNotification as unknown as IScheduledNotification;
            } catch (error: any) {
                if (error.code === 'P2002' && attempt < MAX_RETRIES) {
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

            await prisma.scheduledNotification.update({
                where: { id: notificationId },
                data: { status: 'PROCESSING' }
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
        const original = await prisma.scheduledNotification.findUnique({
            where: { id: originalId }
        });
        if (!original)
            return { success: false, message: 'Notificación original no encontrada', originalId };

        await this.forceJobCancel(originalId);
        await prisma.scheduledNotification.update({
            where: { id: originalId },
            data: {
                status: 'CANCELLED',
                error: 'Editada en tiempo crítico'
            }
        });

        const newNotificationData = {
            numeroPoliza: original.numeroPoliza,
            expedienteNum: original.expedienteNum,
            tipoNotificacion: original.tipoNotificacion,
            contactTime: newDate.toISOString(),
            targetGroupId: Number(original.targetGroupId),
            origenDestino: original.origenDestino ?? undefined,
            marcaModelo: original.marcaModelo ?? undefined,
            colorVehiculo: original.colorVehiculo ?? undefined,
            placas: original.placas ?? undefined,
            telefono: original.telefono ?? undefined,
            scheduledDate: newDate
        };

        const newNotification = await this.scheduleNotification(newNotificationData);
        const newTime = moment(newDate).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm');
        return {
            success: true,
            message: `✅ Notificación crítica recreada para ${newTime}`,
            originalId,
            newId: (newNotification as any).id?.toString()
        };
    }

    async editNotificationDate(
        notificationId: string,
        newDate: Date
    ): Promise<{ success: boolean; message: string; affectedNotifications?: string[] }> {
        const notification = await prisma.scheduledNotification.findUnique({
            where: { id: notificationId }
        });
        if (!notification) return { success: false, message: 'Notificación no encontrada' };

        const validation = await this.validateEditableNotification(notification, newDate);
        if (!validation.canEdit)
            return { success: false, message: validation.reason ?? 'No se puede editar' };

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
        const terminoNotification = await prisma.scheduledNotification.findFirst({
            where: {
                numeroPoliza: contactoNotification.numeroPoliza,
                expedienteNum: contactoNotification.expedienteNum,
                tipoNotificacion: 'TERMINO',
                status: { in: ['PENDING', 'SCHEDULED'] }
            }
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

        const contactoJob = await notificationQueue.getJob(contactoNotification.id);
        if (contactoJob) await contactoJob.remove();
        const terminoJob = await notificationQueue.getJob(terminoNotification.id);
        if (terminoJob) await terminoJob.remove();

        await Promise.all([
            prisma.scheduledNotification.update({
                where: { id: contactoNotification.id },
                data: { scheduledDate: newContactoDate, status: 'PENDING' }
            }),
            prisma.scheduledNotification.update({
                where: { id: terminoNotification.id },
                data: { scheduledDate: newTerminoDate, status: 'PENDING' }
            })
        ]);

        const updatedContacto = await prisma.scheduledNotification.findUnique({
            where: { id: contactoNotification.id }
        });
        const updatedTermino = await prisma.scheduledNotification.findUnique({
            where: { id: terminoNotification.id }
        });
        if (updatedContacto)
            await scheduleNotificationInQueue(updatedContacto.id, new Date(updatedContacto.scheduledDate));
        if (updatedTermino)
            await scheduleNotificationInQueue(updatedTermino.id, new Date(updatedTermino.scheduledDate));

        const contactoTime = moment(newContactoDate)
            .tz('America/Mexico_City')
            .format('DD/MM/YYYY HH:mm');
        const terminoTime = moment(newTerminoDate)
            .tz('America/Mexico_City')
            .format('DD/MM/YYYY HH:mm');

        return {
            success: true,
            message: `✅ CONTACTO reprogramado a ${contactoTime} y TERMINO a ${terminoTime}`,
            affectedNotifications: [contactoNotification.id, terminoNotification.id]
        };
    }

    private async editSingleNotification(
        notification: any,
        newDate: Date
    ): Promise<{ success: boolean; message: string; affectedNotifications?: string[] }> {
        const job = await notificationQueue.getJob(notification.id);
        if (job) await job.remove();

        await prisma.scheduledNotification.update({
            where: { id: notification.id },
            data: { scheduledDate: newDate, status: 'PENDING' }
        });

        const updatedNotification = await prisma.scheduledNotification.findUnique({
            where: { id: notification.id }
        });
        if (updatedNotification)
            await scheduleNotificationInQueue(updatedNotification.id, new Date(updatedNotification.scheduledDate));

        const newTime = moment(newDate).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm');
        return {
            success: true,
            message: `✅ Notificación reprogramada a ${newTime}`,
            affectedNotifications: [notification.id]
        };
    }

    async cancelNotification(notificationId: string): Promise<boolean> {
        const notification = await prisma.scheduledNotification.findUnique({
            where: { id: notificationId }
        });
        if (!notification || !['PENDING', 'SCHEDULED'].includes(notification.status)) return false;

        const job = await notificationQueue.getJob(notificationId);
        if (job) await job.remove();

        await prisma.scheduledNotification.update({
            where: { id: notificationId },
            data: { status: 'CANCELLED' }
        });

        logger.info(`✅ Notificación ${notificationId} cancelada`);
        return true;
    }

    async cancelNotificationsByExpediente(expedienteNum: string): Promise<number> {
        try {
            const notifications = await prisma.scheduledNotification.findMany({
                where: {
                    expedienteNum,
                    status: { in: ['PENDING', 'SCHEDULED'] }
                }
            });

            let cancelledCount = 0;
            for (const notification of notifications) {
                if (await this.cancelNotification(notification.id)) {
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

            const notifications = await prisma.scheduledNotification.findMany({
                where: {
                    id: { in: notificationIds },
                    status: { in: ['PENDING', 'SCHEDULED'] }
                }
            });

            return notifications as unknown as IScheduledNotification[];
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

        // Agrupar por estado usando Prisma
        const dbStats = await prisma.scheduledNotification.groupBy({
            by: ['status'],
            _count: { status: true }
        });

        const statuses = dbStats.reduce((acc, stat) => ({
            ...acc,
            [stat.status]: stat._count.status
        }), {} as Record<string, number>);

        return {
            activeJobs: queueStats.active + queueStats.waiting + queueStats.delayed,
            processingLocks: this.processingLocks.size,
            statuses
        };
    }
}

// Singleton instance
let instance: NotificationManager | null = null;

/**
 * Obtiene la instancia del NotificationManager.
 * Si se proporciona un bot y no existe instancia, la crea.
 */
export function getInstance(bot?: Telegraf): NotificationManager | null {
    if (!instance && bot) {
        instance = new NotificationManager(bot);
    }
    return instance;
}

export function setInstance(manager: NotificationManager): void {
    instance = manager;
}

export function createInstance(bot?: Telegraf): NotificationManager {
    instance = new NotificationManager(bot);
    return instance;
}

export default NotificationManager;
