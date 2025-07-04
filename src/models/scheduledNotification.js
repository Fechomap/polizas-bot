// src/models/scheduledNotification.js
const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
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
        enum: ['PENDING', 'SENT', 'FAILED', 'CANCELLED'],
        default: 'PENDING',
        index: true
    },

    // Registro de envío
    sentAt: Date,
    error: String,

    // Datos adicionales (formato flexible)
    additionalData: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Índice compuesto para búsquedas eficientes
scheduledNotificationSchema.index({ status: 1, scheduledDate: 1 });

// Método para marcar como enviada
scheduledNotificationSchema.methods.markAsSent = async function() {
    this.status = 'SENT';
    this.sentAt = new Date();
    return await this.save();
};

// Método para marcar como fallida
scheduledNotificationSchema.methods.markAsFailed = async function(errorMsg) {
    this.status = 'FAILED';
    this.error = errorMsg;
    return await this.save();
};

// Método para cancelar una notificación
scheduledNotificationSchema.methods.cancel = async function() {
    this.status = 'CANCELLED';
    return await this.save();
};

// Método para reprogramar
scheduledNotificationSchema.methods.reschedule = async function(newDate) {
    this.scheduledDate = newDate;
    this.status = 'PENDING';
    return await this.save();
};

const ScheduledNotification = mongoose.model('ScheduledNotification', scheduledNotificationSchema);

module.exports = ScheduledNotification;
