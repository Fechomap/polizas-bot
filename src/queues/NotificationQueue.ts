// src/queues/NotificationQueue.ts

import Queue from 'bull';
import config from '../config';
import logger from '../utils/logger';
import ScheduledNotification from '../models/scheduledNotification';
import { Telegraf } from 'telegraf';

import { getPolicyByNumber } from '../controllers/policyController';

// Helper para enviar mensaje con timeout
async function sendMessageWithTimeout(
    bot: Telegraf,
    chatId: number,
    message: string,
    options: any,
    timeout: number
): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout enviando mensaje después de ${timeout}ms`));
        }, timeout);

        bot.telegram
            .sendMessage(chatId, message, options)
            .then((result: any) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch((error: any) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

// Helper para enviar fotos
async function sendVehiclePhotos(bot: Telegraf, notification: any): Promise<void> {
    try {
        if (!notification.numeroPoliza) return;
        const policy = await getPolicyByNumber(notification.numeroPoliza);
        if (!policy) return;

        const fotos = policy.archivos?.r2Files?.fotos || [];
        if (fotos.length === 0) return;

        const fotosAEnviar = fotos.slice(0, 2);
        for (let i = 0; i < fotosAEnviar.length; i++) {
            const foto = fotosAEnviar[i];
            const caption = `📸 ${notification.numeroPoliza} - ${notification.marcaModelo || 'Vehículo'} (${i + 1}/${fotosAEnviar.length})`;
            await bot.telegram.sendPhoto(notification.targetGroupId, foto.url, { caption });
            if (i < fotosAEnviar.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (error: any) {
        logger.error(`Error enviando fotos para ${notification.numeroPoliza}:`, error);
    }
}

// La lógica de envío real, ahora dentro del contexto de la cola.
async function sendNotificationToTelegram(notification: any, bot: Telegraf): Promise<void> {
    // Verificación final antes de enviar
    const latestStatus = await ScheduledNotification.findById(notification._id).lean();
    if (!latestStatus || latestStatus.status !== 'PROCESSING') {
        logger.warn(
            `[SEND_ABORTED] Notificación ${notification._id} ya no está en estado PROCESSING. Estado actual: ${latestStatus?.status}. Abortando envío.`
        );
        return;
    }

    // Si es notificación de CONTACTO, enviar fotos primero
    if (notification.tipoNotificacion === 'CONTACTO') {
        await sendVehiclePhotos(bot, notification);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Construir el mensaje
    let message = '';
    if (notification.tipoNotificacion === 'TERMINO') {
        message = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n✅ SERVICIO EN TÉRMINO ✅\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
        message += `🔸 <b><u>${notification.expedienteNum}</u></b>\n`;
        if (notification.marcaModelo)
            message += `🔸 ${notification.marcaModelo} ${notification.colorVehiculo || ''}\n`;
        if (notification.placas) message += `🔸 ${notification.placas}\n`;
        if (notification.origenDestino) {
            const destino =
                notification.origenDestino.split(' - ').pop() || notification.origenDestino;
            message += `🔸 ➡️ ${destino}\n`;
        }
        message += '✅ Confirmar cierre ✅';
    } else {
        message = '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n⚠️ SERVICIO EN CONTACTO ⚠️\n🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
        message += `🔸 <b><u>${notification.expedienteNum}</u></b>\n`;
        if (notification.marcaModelo)
            message += `🔸 ${notification.marcaModelo} ${notification.colorVehiculo || ''}\n`;
        if (notification.placas) message += `🔸 ${notification.placas}\n`;
        if (notification.origenDestino) {
            const destino =
                notification.origenDestino.split(' - ').pop() || notification.origenDestino;
            message += `🔸 ➡️ ${destino}\n`;
        }
        message += '⚠️ Seguimiento en chat ⚠️';
    }

    // Enviar el mensaje
    await sendMessageWithTimeout(
        bot,
        notification.targetGroupId,
        message,
        { parse_mode: 'HTML' },
        30000 // 30 segundos timeout
    );

    // Marcar como enviada
    await ScheduledNotification.findByIdAndUpdate(notification._id, {
        status: 'SENT',
        sentAt: new Date()
    });

    logger.info(`✅ [SENT VIA QUEUE] Notificación ${notification._id} enviada exitosamente.`);
}

// 1. Inicialización de la cola (soporta REDIS_URL o host/port)
const redisConfig = config.redis.url
    ? config.redis.url
    : { host: config.redis.host, port: config.redis.port, password: config.redis.password };

export const notificationQueue = new Queue('notifications', {
    redis: redisConfig as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

// 2. Productor de trabajos
export async function scheduleNotification(
    notificationId: string,
    scheduledFor: Date
): Promise<void> {
    const delay = scheduledFor.getTime() - Date.now();

    await notificationQueue.add(
        'send-notification',
        { notificationId },
        {
            delay: delay > 0 ? delay : 0,
            jobId: notificationId // Usar el ID de la notificación como ID del job para evitar duplicados
        }
    );
    logger.info(`Notificación encolada: ${notificationId} para ejecutarse en ${delay}ms`);
}

// 3. Consumidor de trabajos
export function initializeNotificationConsumer(bot: Telegraf): void {
    notificationQueue.process('send-notification', async job => {
        const { notificationId } = job.data;
        logger.info(`Procesando notificación desde la cola: ${notificationId}`);

        const notification = await ScheduledNotification.findById(notificationId).lean();

        // Validar que la notificación exista y esté en un estado procesable
        if (!notification) {
            logger.warn(`Notificación ${notificationId} no encontrada en la BD. Omitiendo.`);
            return;
        }
        if (notification.status === 'SENT' || notification.status === 'FAILED') {
            logger.warn(
                `Notificación ${notificationId} ya fue procesada o falló permanentemente. Omitiendo.`
            );
            return;
        }

        try {
            await ScheduledNotification.findByIdAndUpdate(notificationId, { status: 'PROCESSING' });
            await sendNotificationToTelegram(notification, bot); // Lógica de envío
        } catch (error) {
            logger.error(`Error procesando notificación ${notificationId}:`, error);
            await ScheduledNotification.findByIdAndUpdate(notificationId, {
                status: 'FAILED',
                errorMessage: error instanceof Error ? error.message : String(error)
            });
            throw error; // Re-lanzar el error para que Bull lo maneje como un fallo de job
        }
    });

    // 4. Event Listeners para logging
    notificationQueue.on('completed', job => {
        logger.info(`Job de notificación completado: ${job.id}`);
    });

    notificationQueue.on('failed', (job, err) => {
        logger.error(`Job de notificación falló: ${job.id}`, {
            error: err.message,
            attemptsMade: job.attemptsMade
        });
    });

    logger.info('✅ Consumidor de notificaciones inicializado.');
}
