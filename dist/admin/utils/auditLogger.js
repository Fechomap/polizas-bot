"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = exports.AuditLogger = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = __importDefault(require("../../utils/logger"));
const auditLogSchema = new mongoose_1.default.Schema({
    userId: {
        type: Number,
        required: true,
        index: true
    },
    username: String,
    firstName: String,
    chatId: {
        type: Number,
        required: true
    },
    action: {
        type: String,
        required: true,
        index: true
    },
    module: {
        type: String,
        required: true,
        enum: ['policy', 'service', 'database', 'system']
    },
    entityType: String,
    entityId: String,
    changes: {
        before: mongoose_1.default.Schema.Types.Mixed,
        after: mongoose_1.default.Schema.Types.Mixed
    },
    metadata: {
        ip: String,
        userAgent: String,
        additional: mongoose_1.default.Schema.Types.Mixed
    },
    result: {
        type: String,
        enum: ['success', 'failure', 'partial'],
        default: 'success'
    },
    errorMessage: String,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, timestamp: -1 });
const AuditLog = mongoose_1.default.model('AuditLog', auditLogSchema);
exports.AuditLog = AuditLog;
class AuditLogger {
    static async log(ctx, action, details = {}) {
        try {
            const user = ctx.from;
            const chatId = ctx.chat?.id;
            if (!user || !chatId) {
                logger_1.default.warn('Intento de log de auditoría sin usuario o chat válido');
                return null;
            }
            const logEntry = new AuditLog({
                userId: user.id,
                username: user.username,
                firstName: user.first_name,
                chatId,
                action,
                module: details.module || 'system',
                entityType: details.entityType,
                entityId: details.entityId,
                changes: details.changes,
                metadata: {
                    additional: details.metadata
                },
                result: details.result || 'success',
                errorMessage: details.errorMessage
            });
            await logEntry.save();
            logger_1.default.info(`Auditoría: ${action} por @${user.username || user.first_name} (${user.id})`, {
                module: details.module,
                entityId: details.entityId,
                result: details.result
            });
            return logEntry;
        }
        catch (error) {
            logger_1.default.error('Error al registrar auditoría:', error);
            return null;
        }
    }
    static async logChange(ctx, action, entity, beforeData, afterData, module) {
        const changes = {
            before: beforeData,
            after: afterData
        };
        const modifiedFields = [];
        for (const key in afterData) {
            if (beforeData[key] !== afterData[key]) {
                modifiedFields.push(key);
            }
        }
        return await this.log(ctx, action, {
            module: module,
            entityType: entity.constructor.name,
            entityId: entity._id?.toString(),
            changes,
            metadata: {
                modifiedFields
            }
        });
    }
    static async logError(ctx, action, error, details = {}) {
        const errorMessage = typeof error === 'string' ? error : error.message || error.toString();
        return await this.log(ctx, action, {
            ...details,
            result: 'failure',
            errorMessage
        });
    }
    static async getLogs(filters = {}) {
        const { userId, action, module, startDate, endDate, page = 1, limit = 20 } = filters;
        const query = {};
        if (userId)
            query.userId = userId;
        if (action)
            query.action = new RegExp(action, 'i');
        if (module)
            query.module = module;
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate)
                query.timestamp.$gte = startDate;
            if (endDate)
                query.timestamp.$lte = endDate;
        }
        const skip = (page - 1) * limit;
        const [logs, total] = await Promise.all([
            AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
            AuditLog.countDocuments(query)
        ]);
        return {
            logs: logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async getStats(days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const stats = await AuditLog.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        module: '$module',
                        action: '$action',
                        result: '$result'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: {
                        module: '$_id.module',
                        action: '$_id.action'
                    },
                    total: { $sum: '$count' },
                    results: {
                        $push: {
                            result: '$_id.result',
                            count: '$count'
                        }
                    }
                }
            },
            {
                $sort: { total: -1 }
            }
        ]);
        return stats;
    }
    static async cleanup(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const result = await AuditLog.deleteMany({
            timestamp: { $lt: cutoffDate }
        });
        logger_1.default.info(`Limpieza de auditoría: ${result.deletedCount} registros eliminados`);
        return result.deletedCount || 0;
    }
    static async getUserActivity(userId, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const logs = await AuditLog.find({
            userId,
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();
        return logs;
    }
    static async getModuleActivity(module, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const logs = await AuditLog.find({
            module,
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();
        return logs;
    }
    static async getFailedOperations(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const logs = await AuditLog.find({
            result: 'failure',
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();
        return logs;
    }
}
exports.AuditLogger = AuditLogger;
