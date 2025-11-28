// src/models/scheduledNotification.ts
import mongoose, { Schema, Document, Model } from 'mongoose';
import { IScheduledNotification } from '../../types';

// Interfaces específicas para el modelo ScheduledNotification
export interface IScheduledNotificationDocument extends IScheduledNotification {
    markAsScheduled(): Promise<IScheduledNotificationDocument>;
    markAsProcessing(): Promise<IScheduledNotificationDocument>;
    markAsSent(): Promise<IScheduledNotificationDocument>;
    markAsFailed(errorMsg: string): Promise<IScheduledNotificationDocument>;
    cancel(): Promise<IScheduledNotificationDocument>;
    reschedule(newDate: Date): Promise<IScheduledNotificationDocument>;
}

export interface IScheduledNotificationModel extends Model<IScheduledNotificationDocument> {
    findDuplicate(
        numeroPoliza: string,
        expedienteNum: string,
        tipoNotificacion: 'CONTACTO' | 'TERMINO' | 'MANUAL'
    ): Promise<IScheduledNotificationDocument | null>;
}

const scheduledNotificationSchema = new Schema(
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

        // Datos relevantes del vehículo
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

        // Control de reprogramación
        lastScheduledAt: {
            type: Date,
            index: true
        },

        // Control de procesamiento
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

        // Tipo de notificación
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
            type: Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

// Índices compuestos para búsquedas eficientes
scheduledNotificationSchema.index({ status: 1, scheduledDate: 1 });
scheduledNotificationSchema.index({ status: 1, lastScheduledAt: 1 });

// Índice único robusto anti-duplicados
scheduledNotificationSchema.index(
    {
        numeroPoliza: 1,
        expedienteNum: 1,
        tipoNotificacion: 1,
        status: 1
    },
    {
        unique: true,
        partialFilterExpression: {
            status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
        },
        name: 'unique_active_notification'
    }
);

// Índice adicional para búsquedas rápidas
scheduledNotificationSchema.index({ numeroPoliza: 1, expedienteNum: 1, tipoNotificacion: 1 });

// Métodos de instancia
scheduledNotificationSchema.methods.markAsScheduled =
    async function (): Promise<IScheduledNotificationDocument> {
        this.status = 'SCHEDULED';
        this.lastScheduledAt = new Date();
        return await this.save();
    };

scheduledNotificationSchema.methods.markAsProcessing =
    async function (): Promise<IScheduledNotificationDocument> {
        this.status = 'PROCESSING';
        this.processingStartedAt = new Date();
        return await this.save();
    };

scheduledNotificationSchema.methods.markAsSent =
    async function (): Promise<IScheduledNotificationDocument> {
        this.status = 'SENT';
        this.sentAt = new Date();
        return await this.save();
    };

scheduledNotificationSchema.methods.markAsFailed = async function (
    errorMsg: string
): Promise<IScheduledNotificationDocument> {
    this.status = 'FAILED';
    this.error = errorMsg;
    this.retryCount = (this.retryCount ?? 0) + 1;
    this.lastRetryAt = new Date();
    return await this.save();
};

scheduledNotificationSchema.methods.cancel =
    async function (): Promise<IScheduledNotificationDocument> {
        this.status = 'CANCELLED';
        return await this.save();
    };

scheduledNotificationSchema.methods.reschedule = async function (
    newDate: Date
): Promise<IScheduledNotificationDocument> {
    this.scheduledDate = newDate;
    this.status = 'PENDING';
    this.lastScheduledAt = null;
    this.processingStartedAt = null;
    return await this.save();
};

// Métodos estáticos
scheduledNotificationSchema.statics.findDuplicate = async function (
    numeroPoliza: string,
    expedienteNum: string,
    tipoNotificacion: 'CONTACTO' | 'TERMINO' | 'MANUAL'
): Promise<IScheduledNotificationDocument | null> {
    return await this.findOne({
        numeroPoliza,
        expedienteNum,
        tipoNotificacion,
        status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
    });
};

const ScheduledNotification: IScheduledNotificationModel = mongoose.model<
    IScheduledNotificationDocument,
    IScheduledNotificationModel
>('ScheduledNotification', scheduledNotificationSchema);

export default ScheduledNotification;
