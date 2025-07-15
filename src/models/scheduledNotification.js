// src/models/scheduledNotification.js
const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema(
    {
        // Información de la póliza
        numeroPoliza: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        // Información del servicio
        expedienteNum: {
            type: String,
            required: true,
            trim: true
        },

        origenDestino: {
            type: String,
            trim: true
        },

        // Datos adicionales (placas, fotos, etc.)
        placas: {
            type: String,
            trim: true
        },

        fotoUrl: {
            type: String,
            trim: true
        },

        // Datos relevantes del vehículo (para mostrar en la notificación)
        marcaModelo: {
            type: String,
            trim: true
        },

        colorVehiculo: {
            type: String,
            trim: true
        },

        // Datos de contacto
        telefono: {
            type: String,
            trim: true
        },

        // Datos de programación
        contactTime: {
            type: String,
            required: true,
            trim: true
        },

        scheduledDate: {
            type: Date,
            required: true,
            index: true
        },

        // NUEVO CAMPO CRÍTICO: Control de reprogramación
        lastScheduledAt: {
            type: Date,
            index: true
        },

        // NUEVO CAMPO: Control de procesamiento
        processingStartedAt: {
            type: Date,
            index: true
        },

        // Metadatos
        createdBy: {
            chatId: Number,
            username: String
        },

        targetGroupId: {
            type: Number,
            required: true
        },

        // Tipo de notificación para diferenciar contacto y término
        tipoNotificacion: {
            type: String,
            enum: ['CONTACTO', 'TERMINO', 'MANUAL'],
            default: 'MANUAL'
        },

        status: {
            type: String,
            enum: ['PENDING', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'],
            default: 'PENDING',
            index: true
        },

        // Registro de envío
        sentAt: Date,
        error: String,

        // Control de reintentos
        retryCount: {
            type: Number,
            default: 0
        },

        lastRetryAt: Date,

        // Datos adicionales (formato flexible)
        additionalData: {
            type: mongoose.Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

// Índices compuestos para búsquedas eficientes
scheduledNotificationSchema.index({ status: 1, scheduledDate: 1 });
scheduledNotificationSchema.index({ numeroPoliza: 1, expedienteNum: 1, tipoNotificacion: 1 });
scheduledNotificationSchema.index({ status: 1, lastScheduledAt: 1 });

// Método para marcar como programada
scheduledNotificationSchema.methods.markAsScheduled = async function () {
    this.status = 'SCHEDULED';
    this.lastScheduledAt = new Date();
    return await this.save();
};

// Método para marcar como en procesamiento
scheduledNotificationSchema.methods.markAsProcessing = async function () {
    this.status = 'PROCESSING';
    this.processingStartedAt = new Date();
    return await this.save();
};

// Método para marcar como enviada
scheduledNotificationSchema.methods.markAsSent = async function () {
    this.status = 'SENT';
    this.sentAt = new Date();
    return await this.save();
};

// Método para marcar como fallida
scheduledNotificationSchema.methods.markAsFailed = async function (errorMsg) {
    this.status = 'FAILED';
    this.error = errorMsg;
    this.retryCount = (this.retryCount || 0) + 1;
    this.lastRetryAt = new Date();
    return await this.save();
};

// Método para cancelar una notificación
scheduledNotificationSchema.methods.cancel = async function () {
    this.status = 'CANCELLED';
    return await this.save();
};

// Método para reprogramar
scheduledNotificationSchema.methods.reschedule = async function (newDate) {
    this.scheduledDate = newDate;
    this.status = 'PENDING';
    this.lastScheduledAt = null; // Reset para permitir reprogramación
    this.processingStartedAt = null;
    return await this.save();
};

// Método estático para verificar duplicados
scheduledNotificationSchema.statics.findDuplicate = async function (
    numeroPoliza,
    expedienteNum,
    tipoNotificacion
) {
    return await this.findOne({
        numeroPoliza,
        expedienteNum,
        tipoNotificacion,
        status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
    });
};

const ScheduledNotification = mongoose.model('ScheduledNotification', scheduledNotificationSchema);

module.exports = ScheduledNotification;
