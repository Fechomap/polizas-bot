// src/services/NotificationManager.js
const logger = require('../utils/logger');
const ScheduledNotification = require('../models/scheduledNotification');
const { getPolicyByNumber } = require('../controllers/policyController');
const moment = require('moment-timezone'); // AÑADIR ESTA LÍNEA
// Configurar zona horaria por defecto
moment.tz.setDefault('America/Mexico_City'); // AÑADIR ESTA LÍNEA

class NotificationManager {
    constructor(bot) {
        this.bot = bot;
        this.activeTimers = new Map(); // Map<notificationId, timerObject>
        this.isInitialized = false;
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
            // Cargar notificaciones pendientes al iniciar
            await this.loadPendingNotifications();

            // Configurar job para recuperar periódicamente
            this.recoveryInterval = setInterval(() => {
                Promise.all([
                    this.loadPendingNotifications(),
                    this.recoverFailedNotifications()
                ]).catch(err => {
                    logger.error('Error en job de recuperación de notificaciones:', err);
                });
            }, 1 * 60 * 1000); // Cada 1 minuto para mayor precisión

            this.isInitialized = true;
            logger.info('✅ NotificationManager inicializado correctamente');
        } catch (error) {
            logger.error('❌ Error al inicializar NotificationManager:', error);
            throw error;
        }
    }

    /**
     * Carga notificaciones pendientes desde MongoDB
     */
    async loadPendingNotifications() {
        try {
            // Usar momento para la comparación con zona horaria correcta
            const nowCDMX = moment().tz('America/Mexico_City').toDate();

            // Obtener notificaciones PENDING cuyo tiempo programado sea en el futuro
            const pendingNotifications = await ScheduledNotification.find({
                status: 'PENDING',
                scheduledDate: { $gt: nowCDMX }
            }).sort({ scheduledDate: 1 });

            if (pendingNotifications.length === 0) {
                logger.info('No hay notificaciones pendientes para programar');
                return;
            }

            logger.info(`Cargando ${pendingNotifications.length} notificaciones pendientes`);

            // Programar cada notificación
            for (const notification of pendingNotifications) {
                await this.scheduleExistingNotification(notification);
            }

            logger.info('✅ Notificaciones pendientes cargadas exitosamente');
        } catch (error) {
            logger.error('Error al cargar notificaciones pendientes:', error);
            throw error;
        }
    }

    /**
     * Programa una notificación existente (recuperada de la BD)
     * @param {Object} notification - Objeto de notificación de MongoDB
     */
    async scheduleExistingNotification(notification) {
        try {
            const notificationId = notification._id.toString();
            if (this.activeTimers.has(notificationId)) {
                logger.info(`Notificación ${notificationId} ya tiene un timer programado, omitiendo`);
                return;
            }
            // Usar momento para manejar zonas horarias correctamente
            const nowCDMX = moment().tz('America/Mexico_City').toDate();
            const scheduledTime = new Date(notification.scheduledDate);

            // Si ya pasó el tiempo, marcar como FAILED
            if (scheduledTime <= nowCDMX) {
                logger.warn(`Notificación ${notification._id} programada para ${scheduledTime.toISOString()} ya pasó`);
                await notification.markAsFailed('Tiempo de programación ya pasó durante la carga');
                return;
            }

            // Calcular milisegundos hasta el envío
            const timeToWait = scheduledTime.getTime() - nowCDMX.getTime();

            // Programar el timer
            const timerId = setTimeout(
                () => this.sendNotificationWithRetry(notification._id.toString()),
                timeToWait
            );

            // Guardar referencia al timer
            this.activeTimers.set(notification._id.toString(), timerId);

            // Log en zona horaria CDMX para claridad
            const scheduledMoment = moment(scheduledTime).tz('America/Mexico_City');
            logger.info(`✅ Notificación ${notification._id} programada para ${scheduledMoment.format('YYYY-MM-DD HH:mm:ss')} CDMX (en ${Math.round(timeToWait/1000/60)} minutos)`);
        } catch (error) {
            logger.error(`Error al programar notificación existente ${notification._id}:`, error);
            await notification.markAsFailed(`Error al programar: ${error.message}`);
        }
    }

    /**
     * Crea y programa una nueva notificación
     * @param {Object} data - Datos de la notificación
     * @returns {Promise<Object>} Notificación creada
     */
    // Reemplaza el método scheduleNotification con este:
    async scheduleNotification(data) {
        try {
            // Validaciones básicas
            if (!data.numeroPoliza || !data.contactTime || !data.expedienteNum) {
                throw new Error('Datos incompletos para programar notificación');
            }

            if (!data.targetGroupId) {
                // Valor por defecto del grupo
                data.targetGroupId = -1002212807945;
            }

            // Obtener póliza para datos adicionales
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

            // CAMBIO: Determinar la fecha programada según los datos proporcionados
            let scheduledDate;

            // Si se proporciona una fecha completa (como Date o string ISO), usarla directamente
            if (data.scheduledDate) {
                // Asegurar que la fecha proporcionada se interprete en CDMX
                scheduledDate = moment(data.scheduledDate).tz('America/Mexico_City').toDate();
                logger.info(`Usando fecha programada proporcionada: ${moment(scheduledDate).tz('America/Mexico_City').format()}`);
            } else {
                // Comportamiento anterior: usar solo la hora
                scheduledDate = this.parseContactTime(data.contactTime);
                logger.info(`Usando solo hora (comportamiento anterior): ${moment(scheduledDate).tz('America/Mexico_City').format()}`);
            }

            if (!scheduledDate || isNaN(scheduledDate.getTime())) {
                throw new Error(`Formato de fecha/hora inválido: ${data.scheduledDate || data.contactTime}`);
            }

            // Crear la notificación en la BD
            const notification = new ScheduledNotification({
                ...data,
                ...policyData,
                scheduledDate,
                status: 'PENDING'
            });

            await notification.save();
            logger.info(`Notificación creada en BD: ${notification._id}`);

            // Programar el envío
            const nowCDMX = moment().tz('America/Mexico_City').toDate();
            const timeToWait = scheduledDate.getTime() - nowCDMX.getTime();

            // Asegurar que el tiempo de espera sea positivo
            if (timeToWait <= 0) {
                logger.warn(`Tiempo de espera negativo (${timeToWait}ms) para notificación ${notification._id}, ajustando...`);
                // Si la fecha ya pasó, marcar como fallida
                await notification.markAsFailed('La fecha programada ya pasó');
                return notification;
            }

            const timerId = setTimeout(
                () => this.sendNotificationWithRetry(notification._id.toString()),
                timeToWait
            );

            // Guardar referencia al timer
            this.activeTimers.set(notification._id.toString(), timerId);

            const scheduledMoment = moment(scheduledDate).tz('America/Mexico_City');
            logger.info(`✅ Nueva notificación ${notification._id} programada para ${scheduledMoment.format('YYYY-MM-DD HH:mm:ss')} CDMX (en ${Math.round(timeToWait/1000/60)} minutos)`);

            return notification;
        } catch (error) {
            logger.error('Error al programar nueva notificación:', error);
            throw error;
        }
    }

    /**
     * Envía un mensaje con timeout específico
     * @param {string} chatId - ID del chat/grupo
     * @param {string} message - Mensaje a enviar
     * @param {Object} options - Opciones del mensaje
     * @param {number} timeoutMs - Timeout en milisegundos
     */
    async sendMessageWithTimeout(chatId, message, options = {}, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`ETIMEDOUT: Message send timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            this.bot.telegram.sendMessage(chatId, message, options)
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
     * Verifica si un error es recuperable (merece reintento)
     * @param {Error} error - Error a evaluar
     * @returns {boolean} - true si el error es recuperable
     */
    isRetryableError(error) {
        const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE'];
        const retryableMessages = ['timeout', 'network', 'connection'];

        return retryableCodes.includes(error.code) ||
               retryableMessages.some(msg => error.message.toLowerCase().includes(msg));
    }

    /**
     * Envía una notificación con sistema de reintentos
     * @param {string} notificationId - ID de la notificación a enviar
     * @param {number} retryCount - Número de intento actual
     */
    async sendNotificationWithRetry(notificationId, retryCount = 0) {
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [5000, 15000, 60000]; // 5s, 15s, 1min

        try {
            await this.sendNotification(notificationId);
        } catch (error) {
            if (retryCount < MAX_RETRIES && this.isRetryableError(error)) {
                const delay = RETRY_DELAYS[retryCount];
                logger.warn(`⚠️ Reintentando notificación ${notificationId} en ${delay}ms (intento ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);

                setTimeout(() => {
                    this.sendNotificationWithRetry(notificationId, retryCount + 1)
                        .catch(retryError => {
                            logger.error(`Error en reintento ${retryCount + 1} para notificación ${notificationId}:`, retryError);
                        });
                }, delay);
            } else {
                // Marcar como fallida definitivamente
                logger.error(`❌ Notificación ${notificationId} falló definitivamente después de ${retryCount} reintentos: ${error.message}`);

                try {
                    const notification = await ScheduledNotification.findById(notificationId);
                    if (notification && typeof notification.markAsFailed === 'function') {
                        await notification.markAsFailed(`Failed after ${retryCount} retries: ${error.message}`);
                    }
                } catch (markError) {
                    logger.error('Error adicional al marcar como fallida:', markError);
                }
                throw error;
            }
        }
    }

    /**
     * Envía una notificación programada (método base)
     * @param {string} notificationId - ID de la notificación
     */
    async sendNotification(notificationId) {
        // Limpiar el timer de la lista
        this.activeTimers.delete(notificationId);

        let notification = null;
        try {
            // Bloqueo atómico: marcar como PROCESSING para evitar envíos simultáneos
            notification = await ScheduledNotification.findOneAndUpdate(
                { _id: notificationId, status: 'PENDING' },
                { status: 'PROCESSING' },
                { new: true }
            );
            if (!notification) {
                logger.warn(`Notificación ${notificationId} no encontrada o no está PENDING`);
                return;
            }

            // Construir el mensaje según el tipo de notificación
            let message = '';
            if (notification.tipoNotificacion === 'TERMINO') {
                // Mensaje de TÉRMINO en verde
                message = '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
                message += '✅ **SERVICIO EN TÉRMINO** ✅\n';
                message += '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n';
                message += `🔸 **${notification.expedienteNum}**\n`;
                
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
                
                message += '✅ **Confirmar cierre** ✅';
            } else {
                // Mensaje de CONTACTO en amarillo
                message = '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                message += '⚠️ **SERVICIO EN CONTACTO** ⚠️\n';
                message += '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                message += `🔸 **${notification.expedienteNum}**\n`;
                
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
                
                message += '⚠️ **Seguimiento en chat** ⚠️';
            }

            // Enviar el mensaje al grupo con timeout específico
            await this.sendMessageWithTimeout(
                notification.targetGroupId,
                message,
                { parse_mode: 'Markdown' },
                30000 // 30 segundos timeout
            );

            // Marcar como enviada
            await notification.markAsSent();

            logger.info(`✅ Notificación ${notificationId} enviada exitosamente al grupo ${notification.targetGroupId}`);
        } catch (error) {
            logger.error(`Error al enviar notificación ${notificationId}:`, error);

            // Si existe la notificación, marcarla como fallida
            if (notification && typeof notification.markAsFailed === 'function') {
                try {
                    await notification.markAsFailed(error.message);
                } catch (markError) {
                    logger.error('Error adicional al marcar como fallida:', markError);
                }
            }
        }
    }

    /**
     * Cancela una notificación programada
     * @param {string} notificationId - ID de la notificación
     * @returns {Promise<boolean>} - true si se canceló exitosamente
     */
    async cancelNotification(notificationId) {
        try {
            // Buscar la notificación
            const notification = await ScheduledNotification.findById(notificationId);

            if (!notification) {
                logger.warn(`Notificación ${notificationId} no encontrada para cancelar`);
                return false;
            }

            // Si ya no está pendiente, no hacer nada
            if (notification.status !== 'PENDING') {
                logger.warn(`Notificación ${notificationId} no está pendiente, estado actual: ${notification.status}`);
                return false;
            }

            // Cancelar el timer si existe
            const timerId = this.activeTimers.get(notificationId);
            if (timerId) {
                clearTimeout(timerId);
                this.activeTimers.delete(notificationId);
            }

            // Marcar como cancelada en la BD
            await notification.cancel();

            logger.info(`✅ Notificación ${notificationId} cancelada exitosamente`);
            return true;
        } catch (error) {
            logger.error(`Error al cancelar notificación ${notificationId}:`, error);
            return false;
        }
    }

    /**
     * Recupera notificaciones fallidas recientes y las reprograma
     */
    async recoverFailedNotifications() {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Buscar notificaciones fallidas de las últimas 24 horas
            const failedNotifications = await ScheduledNotification.find({
                status: 'FAILED',
                scheduledDate: { $gte: oneDayAgo }
            });

            if (failedNotifications.length === 0) {
                logger.debug('No hay notificaciones fallidas para recuperar');
                return;
            }

            logger.info(`🔄 Recuperando ${failedNotifications.length} notificaciones fallidas`);

            for (const notification of failedNotifications) {
                try {
                    // Reprogramar para 5 minutos en el futuro
                    const newScheduledDate = new Date(Date.now() + 5 * 60 * 1000);
                    await notification.reschedule(newScheduledDate);

                    // Programar nuevamente
                    await this.scheduleExistingNotification(notification);

                    logger.info(`✅ Notificación fallida ${notification._id} reprogramada para ${moment(newScheduledDate).tz('America/Mexico_City').format('DD/MM/YYYY HH:mm')} CDMX`);
                } catch (recoveryError) {
                    logger.error(`Error recuperando notificación ${notification._id}:`, recoveryError);
                }
            }
        } catch (error) {
            logger.error('Error en recuperación de notificaciones fallidas:', error);
        }
    }

    /**
     * Obtiene notificaciones pendientes
     * @param {Object} filter - Filtros opcionales
     * @returns {Promise<Array>} - Lista de notificaciones
     */
    async getPendingNotifications(filter = {}) {
        try {
            const baseQuery = { status: 'PENDING', ...filter };
            return await ScheduledNotification.find(baseQuery)
                .sort({ scheduledDate: 1 })
                .lean();
        } catch (error) {
            logger.error('Error al obtener notificaciones pendientes:', error);
            throw error;
        }
    }

    /**
     * Convierte una hora HH:mm en un objeto Date para hoy o mañana
     * @param {string} timeStr - Hora en formato HH:mm
     * @returns {Date|null} - Fecha programada o null si es inválida
     */
    parseContactTime(timeStr) {
        try {
            // Validar formato HH:mm
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            const match = timeStr.match(timeRegex);

            if (!match) {
                logger.warn(`Formato de hora inválido: ${timeStr}`);
                return null;
            }

            const [hours, minutes] = timeStr.split(':').map(Number);

            // Crear momento en la zona horaria de Ciudad de México
            const nowCDMX = moment().tz('America/Mexico_City');
            const scheduledCDMX = moment().tz('America/Mexico_City')
                .hour(hours)
                .minute(minutes)
                .second(0)
                .millisecond(0);

            // Si la hora ya pasó hoy, programar para mañana
            if (scheduledCDMX.isSameOrBefore(nowCDMX)) {
                scheduledCDMX.add(1, 'day');
                logger.info(`Hora ${timeStr} ya pasó hoy, programando para mañana:`, scheduledCDMX.format());
            }

            // Convertir a Date object (JavaScript nativo)
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
        // Limpiar intervalo de recuperación
        if (this.recoveryInterval) {
            clearInterval(this.recoveryInterval);
        }

        // Limpiar todos los timers activos
        for (const [id, timerId] of this.activeTimers.entries()) {
            clearTimeout(timerId);
            logger.debug(`Timer para notificación ${id} cancelado`);
        }

        this.activeTimers.clear();
        this.isInitialized = false;

        logger.info('NotificationManager detenido correctamente');
    }
}

// Exportar como singleton
let instance = null;

module.exports = {
    getInstance: (bot) => {
        if (!instance) {
            instance = new NotificationManager(bot);
        } else if (bot && !instance.bot) {
            instance.bot = bot;
        }
        return instance;
    }
};
