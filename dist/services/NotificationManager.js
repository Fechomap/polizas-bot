"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationManager = exports.getInstance = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const scheduledNotification_1 = __importDefault(require("../models/scheduledNotification"));
const policyController_1 = require("../controllers/policyController");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
moment_timezone_1.default.tz.setDefault('America/Mexico_City');
class NotificationManager {
    constructor(bot) {
        this.bot = bot || null;
        this.activeTimers = new Map();
        this.isInitialized = false;
        this.processingLocks = new Set();
        this.recoveryInterval = null;
    }
    async initialize() {
        if (!this.bot) {
            throw new Error('NotificationManager requiere una instancia del bot para funcionar');
        }
        if (this.isInitialized) {
            logger_1.default.warn('NotificationManager ya está inicializado');
            return;
        }
        try {
            await this.cleanupStuckNotifications();
            await this.loadPendingNotifications();
            await this.recoverScheduledNotifications();
            this.recoveryInterval = setInterval(() => {
                Promise.all([
                    this.loadPendingNotifications(),
                    this.recoverFailedNotifications(),
                    this.recoverScheduledNotifications()
                ]).catch(err => {
                    logger_1.default.error('Error en job de recuperación de notificaciones:', err);
                });
            }, 5 * 60 * 1000);
            this.isInitialized = true;
            logger_1.default.info('✅ NotificationManager inicializado correctamente');
        }
        catch (error) {
            logger_1.default.error('❌ Error al inicializar NotificationManager:', error);
            throw error;
        }
    }
    async cleanupStuckNotifications() {
        try {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const stuckNotifications = await scheduledNotification_1.default.updateMany({
                status: 'PROCESSING',
                processingStartedAt: { $lt: tenMinutesAgo }
            }, {
                $set: {
                    status: 'PENDING',
                    processingStartedAt: null,
                    lastScheduledAt: null
                }
            });
            if (stuckNotifications.modifiedCount > 0) {
                logger_1.default.info(`[CLEANUP] ${stuckNotifications.modifiedCount} notificaciones atascadas recuperadas`);
            }
        }
        catch (error) {
            logger_1.default.error('Error limpiando notificaciones atascadas:', error);
        }
    }
    async loadPendingNotifications() {
        try {
            const nowCDMX = (0, moment_timezone_1.default)().tz('America/Mexico_City').toDate();
            const twoMinutesAgo = new Date(nowCDMX.getTime() - 2 * 60 * 1000);
            const pendingNotifications = await scheduledNotification_1.default.find({
                status: 'PENDING',
                scheduledDate: { $gt: nowCDMX },
                $or: [
                    { lastScheduledAt: { $exists: false } },
                    { lastScheduledAt: null },
                    { lastScheduledAt: { $lt: twoMinutesAgo } }
                ]
            }).sort({ scheduledDate: 1 });
            if (pendingNotifications.length === 0) {
                logger_1.default.debug('[RECOVERY] No hay notificaciones pendientes para programar');
                return;
            }
            logger_1.default.info(`[RECOVERY] Procesando ${pendingNotifications.length} notificaciones pendientes`);
            for (const notification of pendingNotifications) {
                if (this.activeTimers.has(notification._id.toString())) {
                    logger_1.default.debug(`[SKIP] ${notification._id} ya tiene timer activo`);
                    continue;
                }
                await this.scheduleExistingNotification(notification);
            }
            logger_1.default.info('✅ [RECOVERY] Notificaciones pendientes procesadas');
        }
        catch (error) {
            logger_1.default.error('Error al cargar notificaciones pendientes:', error);
            throw error;
        }
    }
    async scheduleExistingNotification(notification) {
        const notificationId = notification._id.toString();
        try {
            if (this.processingLocks.has(notificationId)) {
                logger_1.default.warn(`[LOCK] ${notificationId} ya está siendo procesada`);
                return;
            }
            this.processingLocks.add(notificationId);
            if (this.activeTimers.has(notificationId)) {
                logger_1.default.warn(`[DUPLICATE_PREVENTED] ${notificationId} ya tiene timer activo`);
                return;
            }
            const updatedNotification = await scheduledNotification_1.default.findOneAndUpdate({
                _id: notificationId,
                status: 'PENDING',
                $or: [
                    { lastScheduledAt: { $exists: false } },
                    { lastScheduledAt: null },
                    { lastScheduledAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } }
                ]
            }, {
                $set: {
                    status: 'SCHEDULED',
                    lastScheduledAt: new Date()
                }
            }, { new: true });
            if (!updatedNotification) {
                logger_1.default.warn(`[INVALID_STATE] ${notificationId} no se pudo actualizar a SCHEDULED`);
                return;
            }
            const nowCDMX = (0, moment_timezone_1.default)().tz('America/Mexico_City').toDate();
            const scheduledTime = new Date(updatedNotification.scheduledDate);
            if (scheduledTime <= nowCDMX) {
                logger_1.default.warn(`[EXPIRED] Notificación ${notificationId} expirada`);
                await updatedNotification.markAsFailed('Tiempo de programación ya pasó');
                return;
            }
            const timeToWait = scheduledTime.getTime() - nowCDMX.getTime();
            const timerId = setTimeout(async () => {
                try {
                    await this.sendNotificationWithRetry(notificationId);
                }
                finally {
                    this.activeTimers.delete(notificationId);
                }
            }, timeToWait);
            this.activeTimers.set(notificationId, timerId);
            const scheduledMoment = (0, moment_timezone_1.default)(scheduledTime).tz('America/Mexico_City');
            logger_1.default.info(`✅ [SCHEDULED] ${notificationId} para ${scheduledMoment.format('YYYY-MM-DD HH:mm:ss')} (en ${Math.round(timeToWait / 1000 / 60)} min)`);
        }
        catch (error) {
            logger_1.default.error(`Error al programar notificación ${notificationId}:`, error);
            try {
                await scheduledNotification_1.default.findByIdAndUpdate(notificationId, {
                    $set: {
                        status: 'PENDING',
                        lastScheduledAt: null
                    }
                });
            }
            catch (revertError) {
                logger_1.default.error('Error al revertir estado:', revertError);
            }
        }
        finally {
            this.processingLocks.delete(notificationId);
        }
    }
    async scheduleNotification(data) {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 100;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (!data.numeroPoliza || !data.contactTime || !data.expedienteNum) {
                    throw new Error('Datos incompletos para programar notificación');
                }
                if (!data.targetGroupId) {
                    data.targetGroupId = -1002212807945;
                }
                let policyData = {};
                try {
                    const policy = (await (0, policyController_1.getPolicyByNumber)(data.numeroPoliza));
                    if (policy) {
                        policyData = {
                            marcaModelo: `${policy.marca} ${policy.submarca} (${policy.año})`,
                            colorVehiculo: policy.color || '',
                            placas: policy.placas || '',
                            telefono: policy.telefono || ''
                        };
                    }
                }
                catch (err) {
                    logger_1.default.warn(`No se pudo obtener datos de póliza ${data.numeroPoliza}:`, err);
                }
                let scheduledDate;
                if (data.scheduledDate) {
                    scheduledDate = (0, moment_timezone_1.default)(data.scheduledDate).tz('America/Mexico_City').toDate();
                }
                else {
                    const parsedDate = this.parseContactTime(data.contactTime);
                    if (!parsedDate) {
                        throw new Error(`Formato de fecha/hora inválido: ${data.contactTime}`);
                    }
                    scheduledDate = parsedDate;
                }
                if (!scheduledDate || isNaN(scheduledDate.getTime())) {
                    throw new Error(`Formato de fecha/hora inválido: ${data.scheduledDate || data.contactTime}`);
                }
                const existingNotification = await scheduledNotification_1.default.findOneAndUpdate({
                    numeroPoliza: data.numeroPoliza,
                    expedienteNum: data.expedienteNum,
                    tipoNotificacion: data.tipoNotificacion,
                    status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
                }, {
                    $setOnInsert: {
                        ...data,
                        ...policyData,
                        scheduledDate,
                        status: 'PENDING',
                        retryCount: 0
                    }
                }, {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                });
                const isNewNotification = !existingNotification.createdAt ||
                    new Date().getTime() - new Date(existingNotification.createdAt).getTime() <
                        1000;
                if (!isNewNotification) {
                    logger_1.default.warn('[DUPLICATE_CREATION_PREVENTED] Ya existe notificación activa', {
                        numeroPoliza: data.numeroPoliza,
                        expediente: data.expedienteNum,
                        tipo: data.tipoNotificacion,
                        existingId: existingNotification._id,
                        attempt: attempt
                    });
                    return existingNotification;
                }
                logger_1.default.info(`[CREATED] Notificación ${existingNotification._id} creada atómicamente`, {
                    tipo: data.tipoNotificacion,
                    poliza: data.numeroPoliza,
                    expediente: data.expedienteNum,
                    attempt: attempt
                });
                const nowCDMX = (0, moment_timezone_1.default)().tz('America/Mexico_City').toDate();
                const timeToWait = scheduledDate.getTime() - nowCDMX.getTime();
                if (timeToWait > 0 && timeToWait < 24 * 60 * 60 * 1000) {
                    await this.scheduleExistingNotification(existingNotification);
                }
                return existingNotification;
            }
            catch (error) {
                if (error.code === 11000 && attempt < MAX_RETRIES) {
                    logger_1.default.warn(`[RETRY] Intento ${attempt}/${MAX_RETRIES} falló por duplicado, reintentando en ${RETRY_DELAY}ms`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                    continue;
                }
                logger_1.default.error(`Error al crear notificación (intento ${attempt}/${MAX_RETRIES}):`, error);
                throw error;
            }
        }
        throw new Error(`Falló crear notificación después de ${MAX_RETRIES} intentos`);
    }
    async sendNotificationWithRetry(notificationId, retryCount = 0) {
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [5000, 15000, 60000];
        try {
            await this.sendNotification(notificationId);
        }
        catch (error) {
            if (retryCount < MAX_RETRIES && this.isRetryableError(error)) {
                const delay = RETRY_DELAYS[retryCount];
                logger_1.default.warn(`⚠️ Reintentando ${notificationId} en ${delay}ms (intento ${retryCount + 1}/${MAX_RETRIES})`);
                setTimeout(() => {
                    this.sendNotificationWithRetry(notificationId, retryCount + 1).catch(retryError => {
                        logger_1.default.error(`Error en reintento ${retryCount + 1}:`, retryError);
                    });
                }, delay);
            }
            else {
                logger_1.default.error(`❌ Notificación ${notificationId} falló definitivamente`);
                try {
                    const notification = await scheduledNotification_1.default.findById(notificationId);
                    if (notification) {
                        await notification.markAsFailed(`Failed after ${retryCount} retries: ${error.message}`);
                    }
                }
                catch (markError) {
                    logger_1.default.error('Error al marcar como fallida:', markError);
                }
            }
        }
    }
    async sendNotification(notificationId) {
        let notification = null;
        try {
            notification = await scheduledNotification_1.default.findOneAndUpdate({
                _id: notificationId,
                status: { $in: ['PENDING', 'SCHEDULED'] }
            }, {
                $set: {
                    status: 'PROCESSING',
                    processingStartedAt: new Date()
                }
            }, { new: true });
            if (!notification) {
                logger_1.default.warn(`[SEND_BLOCKED] ${notificationId} no está disponible para envío`);
                return;
            }
            let message = '';
            if (notification.tipoNotificacion === 'TERMINO') {
                message = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
                message += '✅ SERVICIO EN TÉRMINO ✅\n';
                message += '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
                message += `🔸 <b><u>${notification.expedienteNum}</u></b>\n`;
                if (notification.marcaModelo && notification.colorVehiculo) {
                    message += `🔸 ${notification.marcaModelo} ${notification.colorVehiculo}\n`;
                }
                else if (notification.marcaModelo) {
                    message += `🔸 ${notification.marcaModelo}\n`;
                }
                if (notification.placas) {
                    message += `🔸 ${notification.placas}\n`;
                }
                if (notification.origenDestino) {
                    const destino = notification.origenDestino.split(' - ').pop() || notification.origenDestino;
                    message += `🔸 ➡️ ${destino}\n`;
                }
                message += '✅ Confirmar cierre ✅';
            }
            else {
                message = '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                message += '⚠️ SERVICIO EN CONTACTO ⚠️\n';
                message += '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                message += `🔸 <b><u>${notification.expedienteNum}</u></b>\n`;
                if (notification.marcaModelo && notification.colorVehiculo) {
                    message += `🔸 ${notification.marcaModelo} ${notification.colorVehiculo}\n`;
                }
                else if (notification.marcaModelo) {
                    message += `🔸 ${notification.marcaModelo}\n`;
                }
                if (notification.placas) {
                    message += `🔸 ${notification.placas}\n`;
                }
                if (notification.origenDestino) {
                    const destino = notification.origenDestino.split(' - ').pop() || notification.origenDestino;
                    message += `🔸 ➡️ ${destino}\n`;
                }
                message += '⚠️ Seguimiento en chat ⚠️';
            }
            await this.sendMessageWithTimeout(notification.targetGroupId, message, { parse_mode: 'HTML' }, 30000);
            await notification.markAsSent();
            logger_1.default.info(`✅ [SENT] Notificación ${notificationId} enviada exitosamente`);
        }
        catch (error) {
            logger_1.default.error(`Error al enviar notificación ${notificationId}:`, error);
            if (notification) {
                try {
                    await notification.markAsFailed(error.message);
                }
                catch (markError) {
                    logger_1.default.error('Error al marcar como fallida:', markError);
                }
            }
            throw error;
        }
    }
    async sendMessageWithTimeout(chatId, message, options, timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout enviando mensaje después de ${timeout}ms`));
            }, timeout);
            if (!this.bot) {
                clearTimeout(timeoutId);
                reject(new Error('Bot no disponible'));
                return;
            }
            this.bot.telegram
                .sendMessage(chatId, message, options)
                .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }
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
    async recoverFailedNotifications() {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const failedNotifications = await scheduledNotification_1.default.find({
                status: 'FAILED',
                scheduledDate: { $gte: oneDayAgo },
                retryCount: { $lt: 3 }
            });
            if (failedNotifications.length === 0) {
                return;
            }
            logger_1.default.info(`[RECOVERY] Recuperando ${failedNotifications.length} notificaciones fallidas`);
            for (const notification of failedNotifications) {
                try {
                    const newScheduledDate = new Date(Date.now() + 5 * 60 * 1000);
                    await notification.reschedule(newScheduledDate);
                    await this.scheduleExistingNotification(notification);
                    logger_1.default.info(`[RECOVERED] Notificación ${notification._id} reprogramada`);
                }
                catch (recoveryError) {
                    logger_1.default.error(`Error recuperando ${notification._id}:`, recoveryError);
                }
            }
        }
        catch (error) {
            logger_1.default.error('Error en recuperación de notificaciones:', error);
        }
    }
    async recoverScheduledNotifications() {
        try {
            const nowCDMX = (0, moment_timezone_1.default)().tz('America/Mexico_City').toDate();
            const scheduledNotifications = await scheduledNotification_1.default.find({
                status: 'SCHEDULED'
            });
            if (scheduledNotifications.length === 0) {
                logger_1.default.debug('[SCHEDULED_RECOVERY] No hay notificaciones SCHEDULED para revisar');
                return;
            }
            let recoveredCount = 0;
            let expiredCount = 0;
            for (const notification of scheduledNotifications) {
                const notificationId = notification._id.toString();
                if (this.activeTimers.has(notificationId)) {
                    logger_1.default.debug(`[SCHEDULED_RECOVERY] ${notificationId} ya tiene timer activo`);
                    continue;
                }
                const scheduledTime = new Date(notification.scheduledDate);
                if (scheduledTime <= nowCDMX) {
                    const minutesLate = Math.round((nowCDMX.getTime() - scheduledTime.getTime()) / (1000 * 60));
                    if (minutesLate <= 30) {
                        logger_1.default.warn(`[SCHEDULED_RECOVERY] Enviando notificación tardía ${notificationId} (${minutesLate} min tarde)`);
                        try {
                            await this.sendNotificationWithRetry(notificationId);
                            recoveredCount++;
                        }
                        catch (sendError) {
                            logger_1.default.error(`Error enviando notificación tardía ${notificationId}:`, sendError);
                        }
                    }
                    else {
                        logger_1.default.warn(`[SCHEDULED_RECOVERY] Marcando como fallida ${notificationId} (${minutesLate} min tarde)`);
                        await notification.markAsFailed(`Perdida al reiniciar bot, ${minutesLate} minutos tarde`);
                        expiredCount++;
                    }
                }
                else {
                    logger_1.default.info(`[SCHEDULED_RECOVERY] Reprogramando ${notificationId} para futuro`);
                    await scheduledNotification_1.default.findByIdAndUpdate(notificationId, {
                        $set: {
                            status: 'PENDING',
                            lastScheduledAt: null,
                            processingStartedAt: null
                        }
                    });
                    const updatedNotification = await scheduledNotification_1.default.findById(notificationId);
                    if (updatedNotification) {
                        await this.scheduleExistingNotification(updatedNotification);
                        recoveredCount++;
                    }
                }
            }
            if (recoveredCount > 0 || expiredCount > 0) {
                logger_1.default.info(`[SCHEDULED_RECOVERY] Procesadas: ${recoveredCount} recuperadas, ${expiredCount} expiradas`);
            }
        }
        catch (error) {
            logger_1.default.error('Error en recuperación de notificaciones SCHEDULED:', error);
        }
    }
    async cancelNotification(notificationId) {
        try {
            const notification = await scheduledNotification_1.default.findById(notificationId);
            if (!notification) {
                logger_1.default.warn(`Notificación ${notificationId} no encontrada`);
                return false;
            }
            if (!['PENDING', 'SCHEDULED'].includes(notification.status)) {
                logger_1.default.warn(`Notificación ${notificationId} no cancelable, estado: ${notification.status}`);
                return false;
            }
            const timerId = this.activeTimers.get(notificationId);
            if (timerId) {
                clearTimeout(timerId);
                this.activeTimers.delete(notificationId);
            }
            await notification.cancel();
            logger_1.default.info(`✅ Notificación ${notificationId} cancelada`);
            return true;
        }
        catch (error) {
            logger_1.default.error(`Error al cancelar ${notificationId}:`, error);
            return false;
        }
    }
    async cancelNotificationsByExpediente(expedienteNum) {
        try {
            const notifications = await scheduledNotification_1.default.find({
                expedienteNum,
                status: { $in: ['PENDING', 'SCHEDULED'] }
            });
            let cancelledCount = 0;
            for (const notification of notifications) {
                if (await this.cancelNotification(notification._id.toString())) {
                    cancelledCount++;
                }
            }
            logger_1.default.info(`[CANCELLED] ${cancelledCount} notificaciones del expediente ${expedienteNum}`);
            return cancelledCount;
        }
        catch (error) {
            logger_1.default.error(`Error cancelando notificaciones del expediente ${expedienteNum}:`, error);
            return 0;
        }
    }
    async getPendingNotifications(filter = {}) {
        try {
            const baseQuery = {
                status: { $in: ['PENDING', 'SCHEDULED'] },
                ...filter
            };
            return await scheduledNotification_1.default.find(baseQuery).sort({ scheduledDate: 1 }).lean();
        }
        catch (error) {
            logger_1.default.error('Error al obtener notificaciones pendientes:', error);
            throw error;
        }
    }
    parseContactTime(timeStr) {
        try {
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            const match = timeStr.match(timeRegex);
            if (!match) {
                logger_1.default.warn(`Formato de hora inválido: ${timeStr}`);
                return null;
            }
            const [hours, minutes] = timeStr.split(':').map(Number);
            const nowCDMX = (0, moment_timezone_1.default)().tz('America/Mexico_City');
            const scheduledCDMX = (0, moment_timezone_1.default)()
                .tz('America/Mexico_City')
                .hour(hours)
                .minute(minutes)
                .second(0)
                .millisecond(0);
            if (scheduledCDMX.isSameOrBefore(nowCDMX)) {
                scheduledCDMX.add(1, 'day');
            }
            return scheduledCDMX.toDate();
        }
        catch (error) {
            logger_1.default.error(`Error al analizar hora ${timeStr}:`, error);
            return null;
        }
    }
    stop() {
        if (this.recoveryInterval) {
            clearInterval(this.recoveryInterval);
        }
        for (const [id, timerId] of this.activeTimers.entries()) {
            clearTimeout(timerId);
        }
        this.activeTimers.clear();
        this.processingLocks.clear();
        this.isInitialized = false;
        logger_1.default.info('NotificationManager detenido correctamente');
    }
    async getStats() {
        try {
            const stats = await scheduledNotification_1.default.aggregate([
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
        }
        catch (error) {
            logger_1.default.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }
}
exports.NotificationManager = NotificationManager;
let instance = null;
const getInstance = (bot) => {
    if (!instance) {
        instance = new NotificationManager(bot);
    }
    else if (bot && !instance.bot) {
        instance.bot = bot;
    }
    return instance;
};
exports.getInstance = getInstance;
exports.default = NotificationManager;
