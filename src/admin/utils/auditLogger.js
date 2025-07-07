const mongoose = require('mongoose');
const logger = require('../../utils/logger');

// Schema para logs de auditoría
const auditLogSchema = new mongoose.Schema({
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
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed
    },
    metadata: {
        ip: String,
        userAgent: String,
        additional: mongoose.Schema.Types.Mixed
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

// Índices compuestos para búsquedas eficientes
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

class AuditLogger {
    /**
   * Registra una acción administrativa
   */
    static async log(ctx, action, details = {}) {
        try {
            const user = ctx.from;
            const chatId = ctx.chat?.id;

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

            // También registrar en log de archivo
            logger.info(`Auditoría: ${action} por @${user.username || user.first_name} (${user.id})`, {
                module: details.module,
                entityId: details.entityId,
                result: details.result
            });

            return logEntry;
        } catch (error) {
            logger.error('Error al registrar auditoría:', error);
            // No fallar si la auditoría falla
            return null;
        }
    }

    /**
   * Registra un cambio con comparación antes/después
   */
    static async logChange(ctx, action, entity, beforeData, afterData, module) {
        const changes = {
            before: beforeData,
            after: afterData
        };

        // Calcular campos modificados
        const modifiedFields = [];
        for (const key in afterData) {
            if (beforeData[key] !== afterData[key]) {
                modifiedFields.push(key);
            }
        }

        return await this.log(ctx, action, {
            module,
            entityType: entity.constructor.name,
            entityId: entity._id?.toString(),
            changes,
            metadata: {
                modifiedFields
            }
        });
    }

    /**
   * Registra un error en una operación administrativa
   */
    static async logError(ctx, action, error, details = {}) {
        return await this.log(ctx, action, {
            ...details,
            result: 'failure',
            errorMessage: error.message || error.toString()
        });
    }

    /**
   * Obtiene logs de auditoría con filtros
   */
    static async getLogs(filters = {}, options = {}) {
        const {
            userId,
            action,
            module,
            startDate,
            endDate,
            page = 1,
            limit = 20
        } = filters;

        const query = {};

        if (userId) query.userId = userId;
        if (action) query.action = new RegExp(action, 'i');
        if (module) query.module = module;

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = startDate;
            if (endDate) query.timestamp.$lte = endDate;
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(query)
        ]);

        return {
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
   * Obtiene estadísticas de auditoría
   */
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

    /**
   * Limpia logs antiguos
   */
    static async cleanup(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await AuditLog.deleteMany({
            timestamp: { $lt: cutoffDate }
        });

        logger.info(`Limpieza de auditoría: ${result.deletedCount} registros eliminados`);

        return result.deletedCount;
    }
}

module.exports = { AuditLogger, AuditLog };
