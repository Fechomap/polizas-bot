// src/services/NotificationManager.js
const logger = require('../utils/logger');
const ScheduledNotification = require('../models/scheduledNotification');
const { getPolicyByNumber } = require('../controllers/policyController');
const moment = require('moment-timezone');
moment.tz.setDefault('America/Mexico_City');

class NotificationManager {
    constructor(bot) {
        this.bot = bot;
        this.activeTimers = new Map(); // Map<notificationId, timerObject>
        this.isInitialized = false;
        this.processingLocks = new Set(); // Para evitar procesamiento simultáneo
    }

    /**
     * Inicializa el gestor de notificaciones, cargando pendientes de la BD
     */
    async initialize() {
        if (!this.bot) {
            throw new Error('NotificationManager requiere una instancia del bot para funcionar');
        }

        if (this.isInitialized) {
            logger.warn('NotificationManager ya está inicializado');
            return;
        }

        try {
            // Limpiar notificaciones atascadas en PROCESSING
            await this.cleanupStuckNotifications();

            // Cargar notificaciones pendientes al iniciar
            await this.loadPendingNotifications();
            
            // Recuperar notificaciones SCHEDULED que perdieron su timer
            await this.recoverScheduledNotifications();

            // Configurar job para recuperar periódicamente
            this.recoveryInterval = setInterval(
                () => {
                    Promise.all([
                        this.loadPendingNotifications(),
                        this.recoverFailedNotifications(),
                        this.recoverScheduledNotifications()
                    ]).catch(err => {
                        logger.error('Error en job de recuperación de notificaciones:', err);
                    });
                },
                5 * 60 * 1000
            ); // Cada 5 minutos

            this.isInitialized = true;
            logger.info('✅ NotificationManager inicializado correctamente');
        } catch (error) {
            logger.error('❌ Error al inicializar NotificationManager:', error);
            throw error;
        }
    }

    /**
     * Limpia notificaciones atascadas en estado PROCESSING
     */
    async cleanupStuckNotifications() {
        try {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

            const stuckNotifications = await ScheduledNotification.updateMany(
                {
                    status: 'PROCESSING',
                    processingStartedAt: { $lt: tenMinutesAgo }
                },
                {
                    $set: {
                        status: 'PENDING',
                        processingStartedAt: null,
                        lastScheduledAt: null
                    }
                }
            );

            if (stuckNotifications.modifiedCount > 0) {
                logger.info(
                    `[CLEANUP] ${stuckNotifications.modifiedCount} notificaciones atascadas recuperadas`
                );
            }
        } catch (error) {
            logger.error('Error limpiando notificaciones atascadas:', error);
        }
    }

    /**
     * Carga notificaciones pendientes desde MongoDB con control anti-duplicados
     */
    async loadPendingNotifications() {
        try {
            const nowCDMX = moment().tz('America/Mexico_City').toDate();
            const twoMinutesAgo = new Date(nowCDMX.getTime() - 2 * 60 * 1000);

            // Solo recuperar notificaciones que:
            // 1. Están PENDING
            // 2. Su fecha programada es futura
            // 3. NO han sido programadas recientemente O nunca han sido programadas
            const pendingNotifications = await ScheduledNotification.find({
                status: 'PENDING',
                scheduledDate: { $gt: nowCDMX },
                $or: [
                    { lastScheduledAt: { $exists: false } },
                    { lastScheduledAt: null },
                    { lastScheduledAt: { $lt: twoMinutesAgo } }
                ]
            }).sort({ scheduledDate: 1 });

            if (pendingNotifications.length === 0) {
                logger.debug('[RECOVERY] No hay notificaciones pendientes para programar');
                return;
            }

            logger.info(
                `[RECOVERY] Procesando ${pendingNotifications.length} notificaciones pendientes`
            );

            // Programar cada notificación con verificación
            for (const notification of pendingNotifications) {
                // Verificar si ya tiene un timer activo
                if (this.activeTimers.has(notification._id.toString())) {
                    logger.debug(`[SKIP] ${notification._id} ya tiene timer activo`);
                    continue;
                }

                await this.scheduleExistingNotification(notification);
            }

            logger.info('✅ [RECOVERY] Notificaciones pendientes procesadas');
        } catch (error) {
            logger.error('Error al cargar notificaciones pendientes:', error);
            throw error;
        }
    }

    /**
     * Programa una notificación existente con verificaciones exhaustivas
     */
    async scheduleExistingNotification(notification) {
        const notificationId = notification._id.toString();

        try {
            // Evitar procesamiento simultáneo
            if (this.processingLocks.has(notificationId)) {
                logger.warn(`[LOCK] ${notificationId} ya está siendo procesada`);
                return;
            }

            this.processingLocks.add(notificationId);

            // Verificación 1: Timer activo
            if (this.activeTimers.has(notificationId)) {
                logger.warn(`[DUPLICATE_PREVENTED] ${notificationId} ya tiene timer activo`);
                return;
            }

            // Verificación 2: Estado actual en BD (con actualización atómica)
            const updatedNotification = await ScheduledNotification.findOneAndUpdate(
                {
                    _id: notificationId,
                    status: 'PENDING',
                    $or: [
                        { lastScheduledAt: { $exists: false } },
                        { lastScheduledAt: null },
                        { lastScheduledAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } }
                    ]
                },
                {
                    $set: {
                        status: 'SCHEDULED',
                        lastScheduledAt: new Date()
                    }
                },
                { new: true }
            );

            if (!updatedNotification) {
                logger.warn(`[INVALID_STATE] ${notificationId} no se pudo actualizar a SCHEDULED`);
                return;
            }

            const nowCDMX = moment().tz('America/Mexico_City').toDate();
            const scheduledTime = new Date(updatedNotification.scheduledDate);

            // Si ya pasó el tiempo, marcar como FAILED
            if (scheduledTime <= nowCDMX) {
                logger.warn(`[EXPIRED] Notificación ${notificationId} expirada`);
                await updatedNotification.markAsFailed('Tiempo de programación ya pasó');
                return;
            }

            // Calcular tiempo de espera
            const timeToWait = scheduledTime.getTime() - nowCDMX.getTime();

            // Programar el timer
            const timerId = setTimeout(async () => {
                try {
                    await this.sendNotificationWithRetry(notificationId);
                } finally {
                    this.activeTimers.delete(notificationId);
                }
            }, timeToWait);

            // Guardar referencia al timer
            this.activeTimers.set(notificationId, timerId);

            const scheduledMoment = moment(scheduledTime).tz('America/Mexico_City');
            logger.info(
                `✅ [SCHEDULED] ${notificationId} para ${scheduledMoment.format('YYYY-MM-DD HH:mm:ss')} (en ${Math.round(timeToWait / 1000 / 60)} min)`
            );
        } catch (error) {
            logger.error(`Error al programar notificación ${notificationId}:`, error);

            // Revertir estado si falló
            try {
                await ScheduledNotification.findByIdAndUpdate(notificationId, {
                    $set: {
                        status: 'PENDING',
                        lastScheduledAt: null
                    }
                });
            } catch (revertError) {
                logger.error('Error al revertir estado:', revertError);
            }
        } finally {
            this.processingLocks.delete(notificationId);
        }
    }

    /**
     * Crea y programa una nueva notificación con verificación de duplicados
     */
    async scheduleNotification(data) {
        try {
            // Validaciones básicas
            if (!data.numeroPoliza || !data.contactTime || !data.expedienteNum) {
                throw new Error('Datos incompletos para programar notificación');
            }

            // VERIFICAR DUPLICADOS ANTES DE CREAR
            const existingNotification = await ScheduledNotification.findDuplicate(
                data.numeroPoliza,
                data.expedienteNum,
                data.tipoNotificacion
            );

            if (existingNotification) {
                logger.warn('[DUPLICATE_CREATION_PREVENTED] Ya existe notificación activa', {
                    numeroPoliza: data.numeroPoliza,
                    expediente: data.expedienteNum,
                    tipo: data.tipoNotificacion,
                    existingId: existingNotification._id
                });
                return existingNotification;
            }

            if (!data.targetGroupId) {
                data.targetGroupId = -1002212807945;
            }

            // Obtener datos adicionales de la póliza
            let policyData = {};
            try {
                const policy = await getPolicyByNumber(data.numeroPoliza);
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

            // Determinar fecha programada
            let scheduledDate;
            if (data.scheduledDate) {
                scheduledDate = moment(data.scheduledDate).tz('America/Mexico_City').toDate();
            } else {
                scheduledDate = this.parseContactTime(data.contactTime);
            }

            if (!scheduledDate || isNaN(scheduledDate.getTime())) {
                throw new Error(
                    `Formato de fecha/hora inválido: ${data.scheduledDate || data.contactTime}`
                );
            }

            // Crear la notificación
            const notification = new ScheduledNotification({
                ...data,
                ...policyData,
                scheduledDate,
                status: 'PENDING',
                retryCount: 0
            });

            await notification.save();
            logger.info(`[CREATED] Notificación ${notification._id} creada`, {
                tipo: data.tipoNotificacion,
                poliza: data.numeroPoliza,
                expediente: data.expedienteNum
            });

            // Programar inmediatamente si es para el futuro cercano
            const nowCDMX = moment().tz('America/Mexico_City').toDate();
            const timeToWait = scheduledDate.getTime() - nowCDMX.getTime();

            if (timeToWait > 0 && timeToWait < 24 * 60 * 60 * 1000) {
                // Menos de 24 horas
                await this.scheduleExistingNotification(notification);
            }

            return notification;
        } catch (error) {
            logger.error('Error al crear notificación:', error);
            throw error;
        }
    }

    /**
     * Envía una notificación con reintentos
     */
    async sendNotificationWithRetry(notificationId, retryCount = 0) {
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [5000, 15000, 60000]; // 5s, 15s, 1min

        try {
            await this.sendNotification(notificationId);
        } catch (error) {
            if (retryCount < MAX_RETRIES && this.isRetryableError(error)) {
                const delay = RETRY_DELAYS[retryCount];
                logger.warn(
                    `⚠️ Reintentando ${notificationId} en ${delay}ms (intento ${retryCount + 1}/${MAX_RETRIES})`
                );

                setTimeout(() => {
                    this.sendNotificationWithRetry(notificationId, retryCount + 1).catch(
                        retryError => {
                            logger.error(`Error en reintento ${retryCount + 1}:`, retryError);
                        }
                    );
                }, delay);
            } else {
                logger.error(`❌ Notificación ${notificationId} falló definitivamente`);

                try {
                    const notification = await ScheduledNotification.findById(notificationId);
                    if (notification) {
                        await notification.markAsFailed(
                            `Failed after ${retryCount} retries: ${error.message}`
                        );
                    }
                } catch (markError) {
                    logger.error('Error al marcar como fallida:', markError);
                }
            }
        }
    }

    /**
     * Envía una notificación con verificación de estado
     */
    async sendNotification(notificationId) {
        let notification = null;

        try {
            // Actualización atómica del estado
            notification = await ScheduledNotification.findOneAndUpdate(
                {
                    _id: notificationId,
                    status: { $in: ['PENDING', 'SCHEDULED'] }
                },
                {
                    $set: {
                        status: 'PROCESSING',
                        processingStartedAt: new Date()
                    }
                },
                { new: true }
            );

            if (!notification) {
                logger.warn(`[SEND_BLOCKED] ${notificationId} no está disponible para envío`);
                return;
            }

            // Construir el mensaje según el tipo de notificación
            let message = '';
            if (notification.tipoNotificacion === 'TERMINO') {
                // Mensaje de TÉRMINO en verde
                message = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
                message += '✅ SERVICIO EN TÉRMINO ✅\n';
                message += '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
                message += `🔸 <b><u>${notification.expedienteNum}</u></b>\n`;

                // Añadir vehículo y color en una línea
                if (notification.marcaModelo && notification.colorVehiculo) {
                    message += `🔸 ${notification.marcaModelo} ${notification.colorVehiculo}\n`;
                } else if (notification.marcaModelo) {
                    message += `🔸 ${notification.marcaModelo}\n`;
                }

                if (notification.placas) {
                    message += `🔸 ${notification.placas}\n`;
                }

                // Extraer solo el destino final
                if (notification.origenDestino) {
                    const destino = notification.origenDestino.split(' - ').pop() || notification.origenDestino;
                    message += `🔸 ➡️ ${destino}\n`;
                }

                message += '✅ Confirmar cierre ✅';
            } else {
                // Mensaje de CONTACTO en amarillo
                message = '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                message += '⚠️ SERVICIO EN CONTACTO ⚠️\n';
                message += '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                message += `🔸 <b><u>${notification.expedienteNum}</u></b>\n`;

                // Añadir vehículo y color en una línea
                if (notification.marcaModelo && notification.colorVehiculo) {
                    message += `🔸 ${notification.marcaModelo} ${notification.colorVehiculo}\n`;
                } else if (notification.marcaModelo) {
                    message += `🔸 ${notification.marcaModelo}\n`;
                }

                if (notification.placas) {
                    message += `🔸 ${notification.placas}\n`;
                }

                // Extraer solo el destino final
                if (notification.origenDestino) {
                    const destino = notification.origenDestino.split(' - ').pop() || notification.origenDestino;
                    message += `🔸 ➡️ ${destino}\n`;
                }

                message += '⚠️ Seguimiento en chat ⚠️';
            }

            // Enviar el mensaje al grupo con timeout específico
            await this.sendMessageWithTimeout(
                notification.targetGroupId,
                message,
                { parse_mode: 'HTML' },
                30000 // 30 segundos timeout
            );

            // Marcar como enviada
            await notification.markAsSent();
            logger.info(`✅ [SENT] Notificación ${notificationId} enviada exitosamente`);
        } catch (error) {
            logger.error(`Error al enviar notificación ${notificationId}:`, error);

            if (notification) {
                try {
                    await notification.markAsFailed(error.message);
                } catch (markError) {
                    logger.error('Error al marcar como fallida:', markError);
                }
            }

            throw error;
        }
    }

    /**
     * Envía mensaje con timeout personalizado
     */
    async sendMessageWithTimeout(chatId, message, options, timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout enviando mensaje después de ${timeout}ms`));
            }, timeout);

            this.bot.telegram
                .sendMessage(chatId, message, options)
                .then(result => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Determina si un error es reintentable
     */
    isRetryableError(error) {
        const retryableErrors = [
            'ETIMEOUT',
            'ECONNRESET',
            'ENOTFOUND',
            'ECONNREFUSED',
            'socket hang up',
            'Timeout'
        ];

        const errorMessage = error.message || '';
        return retryableErrors.some(retryable => errorMessage.includes(retryable));
    }

    /**
     * Recupera notificaciones fallidas recientes
     */
    async recoverFailedNotifications() {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const failedNotifications = await ScheduledNotification.find({
                status: 'FAILED',
                scheduledDate: { $gte: oneDayAgo },
                retryCount: { $lt: 3 }
            });

            if (failedNotifications.length === 0) {
                return;
            }

            logger.info(
                `[RECOVERY] Recuperando ${failedNotifications.length} notificaciones fallidas`
            );

            for (const notification of failedNotifications) {
                try {
                    const newScheduledDate = new Date(Date.now() + 5 * 60 * 1000);
                    await notification.reschedule(newScheduledDate);
                    await this.scheduleExistingNotification(notification);

                    logger.info(`[RECOVERED] Notificación ${notification._id} reprogramada`);
                } catch (recoveryError) {
                    logger.error(`Error recuperando ${notification._id}:`, recoveryError);
                }
            }
        } catch (error) {
            logger.error('Error en recuperación de notificaciones:', error);
        }
    }

    /**
     * Recupera notificaciones SCHEDULED que perdieron su timer al reiniciar
     */
    async recoverScheduledNotifications() {
        try {
            const nowCDMX = moment().tz('America/Mexico_City').toDate();
            
            // Buscar notificaciones SCHEDULED sin timer activo
            const scheduledNotifications = await ScheduledNotification.find({
                status: 'SCHEDULED'
            });

            if (scheduledNotifications.length === 0) {
                logger.debug('[SCHEDULED_RECOVERY] No hay notificaciones SCHEDULED para revisar');
                return;
            }

            let recoveredCount = 0;
            let expiredCount = 0;

            for (const notification of scheduledNotifications) {
                const notificationId = notification._id.toString();
                
                // Verificar si ya tiene timer activo (no debería, pero por seguridad)
                if (this.activeTimers.has(notificationId)) {
                    logger.debug(`[SCHEDULED_RECOVERY] ${notificationId} ya tiene timer activo`);
                    continue;
                }

                const scheduledTime = new Date(notification.scheduledDate);
                
                // Si ya pasó el tiempo programado
                if (scheduledTime <= nowCDMX) {
                    const minutesLate = Math.round((nowCDMX.getTime() - scheduledTime.getTime()) / (1000 * 60));
                    
                    if (minutesLate <= 30) {
                        // Enviar inmediatamente si no han pasado más de 30 minutos
                        logger.warn(`[SCHEDULED_RECOVERY] Enviando notificación tardía ${notificationId} (${minutesLate} min tarde)`);
                        
                        try {
                            await this.sendNotificationWithRetry(notificationId);
                            recoveredCount++;
                        } catch (sendError) {
                            logger.error(`Error enviando notificación tardía ${notificationId}:`, sendError);
                        }
                    } else {
                        // Marcar como fallida si ya pasaron más de 30 minutos
                        logger.warn(`[SCHEDULED_RECOVERY] Marcando como fallida ${notificationId} (${minutesLate} min tarde)`);
                        await notification.markAsFailed(`Perdida al reiniciar bot, ${minutesLate} minutos tarde`);
                        expiredCount++;
                    }
                } else {
                    // Reprogramar para el futuro
                    logger.info(`[SCHEDULED_RECOVERY] Reprogramando ${notificationId} para futuro`);
                    
                    // Resetear estado para que se pueda reprogramar
                    await ScheduledNotification.findByIdAndUpdate(notificationId, {
                        $set: {
                            status: 'PENDING',
                            lastScheduledAt: null,
                            processingStartedAt: null
                        }
                    });
                    
                    // Recargar la notificación actualizada
                    const updatedNotification = await ScheduledNotification.findById(notificationId);
                    if (updatedNotification) {
                        await this.scheduleExistingNotification(updatedNotification);
                        recoveredCount++;
                    }
                }
            }

            if (recoveredCount > 0 || expiredCount > 0) {
                logger.info(`[SCHEDULED_RECOVERY] Procesadas: ${recoveredCount} recuperadas, ${expiredCount} expiradas`);
            }
        } catch (error) {
            logger.error('Error en recuperación de notificaciones SCHEDULED:', error);
        }
    }

    /**
     * Cancela una notificación programada
     */
    async cancelNotification(notificationId) {
        try {
            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                logger.warn(`Notificación ${notificationId} no encontrada`);
                return false;
            }

            if (!['PENDING', 'SCHEDULED'].includes(notification.status)) {
                logger.warn(
                    `Notificación ${notificationId} no cancelable, estado: ${notification.status}`
                );
                return false;
            }

            // Cancelar timer si existe
            const timerId = this.activeTimers.get(notificationId);
            if (timerId) {
                clearTimeout(timerId);
                this.activeTimers.delete(notificationId);
            }

            await notification.cancel();
            logger.info(`✅ Notificación ${notificationId} cancelada`);
            return true;
        } catch (error) {
            logger.error(`Error al cancelar ${notificationId}:`, error);
            return false;
        }
    }

    /**
     * Cancela todas las notificaciones de un expediente
     */
    async cancelNotificationsByExpediente(expedienteNum) {
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
        } catch (error) {
            logger.error(`Error cancelando notificaciones del expediente ${expedienteNum}:`, error);
            return 0;
        }
    }

    /**
     * Obtiene notificaciones pendientes con filtros
     */
    async getPendingNotifications(filter = {}) {
        try {
            const baseQuery = {
                status: { $in: ['PENDING', 'SCHEDULED'] },
                ...filter
            };

            return await ScheduledNotification.find(baseQuery).sort({ scheduledDate: 1 }).lean();
        } catch (error) {
            logger.error('Error al obtener notificaciones pendientes:', error);
            throw error;
        }
    }

    /**
     * Convierte hora HH:mm a Date para hoy o mañana
     */
    parseContactTime(timeStr) {
        try {
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            const match = timeStr.match(timeRegex);

            if (!match) {
                logger.warn(`Formato de hora inválido: ${timeStr}`);
                return null;
            }

            const [hours, minutes] = timeStr.split(':').map(Number);

            const nowCDMX = moment().tz('America/Mexico_City');
            const scheduledCDMX = moment()
                .tz('America/Mexico_City')
                .hour(hours)
                .minute(minutes)
                .second(0)
                .millisecond(0);

            // Si ya pasó, programar para mañana
            if (scheduledCDMX.isSameOrBefore(nowCDMX)) {
                scheduledCDMX.add(1, 'day');
            }

            return scheduledCDMX.toDate();
        } catch (error) {
            logger.error(`Error al analizar hora ${timeStr}:`, error);
            return null;
        }
    }

    /**
     * Detiene el gestor de notificaciones
     */
    stop() {
        if (this.recoveryInterval) {
            clearInterval(this.recoveryInterval);
        }

        // Limpiar todos los timers
        for (const [id, timerId] of this.activeTimers.entries()) {
            clearTimeout(timerId);
        }

        this.activeTimers.clear();
        this.processingLocks.clear();
        this.isInitialized = false;

        logger.info('NotificationManager detenido correctamente');
    }

    /**
     * Obtiene estadísticas del sistema
     */
    async getStats() {
        try {
            const stats = await ScheduledNotification.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const result = {
                activeTimers: this.activeTimers.size,
                processingLocks: this.processingLocks.size,
                statuses: {}
            };

            stats.forEach(stat => {
                result.statuses[stat._id] = stat.count;
            });

            return result;
        } catch (error) {
            logger.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }
}

// Exportar como singleton
let instance = null;

module.exports = {
    getInstance: bot => {
        if (!instance) {
            instance = new NotificationManager(bot);
        } else if (bot && !instance.bot) {
            instance.bot = bot;
        }
        return instance;
    }
};
