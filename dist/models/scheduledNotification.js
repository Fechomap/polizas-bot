"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const scheduledNotificationSchema = new mongoose_1.Schema({
    numeroPoliza: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    expedienteNum: {
        type: String,
        required: true,
        trim: true
    },
    origenDestino: {
        type: String,
        trim: true
    },
    placas: {
        type: String,
        trim: true
    },
    fotoUrl: {
        type: String,
        trim: true
    },
    marcaModelo: {
        type: String,
        trim: true
    },
    colorVehiculo: {
        type: String,
        trim: true
    },
    telefono: {
        type: String,
        trim: true
    },
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
    lastScheduledAt: {
        type: Date,
        index: true
    },
    processingStartedAt: {
        type: Date,
        index: true
    },
    createdBy: {
        chatId: Number,
        username: String
    },
    targetGroupId: {
        type: Number,
        required: true
    },
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
    sentAt: Date,
    error: String,
    retryCount: {
        type: Number,
        default: 0
    },
    lastRetryAt: Date,
    additionalData: {
        type: mongoose_1.Schema.Types.Mixed
    }
}, {
    timestamps: true
});
scheduledNotificationSchema.index({ status: 1, scheduledDate: 1 });
scheduledNotificationSchema.index({ status: 1, lastScheduledAt: 1 });
scheduledNotificationSchema.index({
    numeroPoliza: 1,
    expedienteNum: 1,
    tipoNotificacion: 1,
    status: 1
}, {
    unique: true,
    partialFilterExpression: {
        status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
    },
    name: 'unique_active_notification'
});
scheduledNotificationSchema.index({ numeroPoliza: 1, expedienteNum: 1, tipoNotificacion: 1 });
scheduledNotificationSchema.methods.markAsScheduled =
    async function () {
        this.status = 'SCHEDULED';
        this.lastScheduledAt = new Date();
        return await this.save();
    };
scheduledNotificationSchema.methods.markAsProcessing =
    async function () {
        this.status = 'PROCESSING';
        this.processingStartedAt = new Date();
        return await this.save();
    };
scheduledNotificationSchema.methods.markAsSent =
    async function () {
        this.status = 'SENT';
        this.sentAt = new Date();
        return await this.save();
    };
scheduledNotificationSchema.methods.markAsFailed = async function (errorMsg) {
    this.status = 'FAILED';
    this.error = errorMsg;
    this.retryCount = (this.retryCount || 0) + 1;
    this.lastRetryAt = new Date();
    return await this.save();
};
scheduledNotificationSchema.methods.cancel =
    async function () {
        this.status = 'CANCELLED';
        return await this.save();
    };
scheduledNotificationSchema.methods.reschedule = async function (newDate) {
    this.scheduledDate = newDate;
    this.status = 'PENDING';
    this.lastScheduledAt = null;
    this.processingStartedAt = null;
    return await this.save();
};
scheduledNotificationSchema.statics.findDuplicate = async function (numeroPoliza, expedienteNum, tipoNotificacion) {
    return await this.findOne({
        numeroPoliza,
        expedienteNum,
        tipoNotificacion,
        status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
    });
};
const ScheduledNotification = mongoose_1.default.model('ScheduledNotification', scheduledNotificationSchema);
exports.default = ScheduledNotification;
