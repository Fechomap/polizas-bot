import mongoose from 'mongoose';
import { Context } from 'telegraf';
import logger from '../../utils/logger';

interface IAuditLogEntry {
    userId: number;
    username?: string;
    firstName?: string;
    chatId: number;
    action: string;
    module: 'policy' | 'service' | 'database' | 'system';
    entityType?: string;
    entityId?: string;
    changes?: {
        before: any;
        after: any;
    };
    metadata?: {
        ip?: string;
        userAgent?: string;
        additional?: any;
    };
    result: 'success' | 'failure' | 'partial';
    errorMessage?: string;
    timestamp: Date;
}

interface IAuditLogDocument extends mongoose.Document, IAuditLogEntry {}

interface IAuditLogFilters {
    userId?: number;
    action?: string;
    module?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}

interface IAuditLogResult {
    logs: IAuditLogEntry[];
    total: number;
    page: number;
    totalPages: number;
}

interface IAuditLogOptions {
    module?: string;
    entityType?: string;
    entityId?: string;
    changes?: {
        before: any;
        after: any;
    };
    metadata?: any;
    result?: 'success' | 'failure' | 'partial';
    errorMessage?: string;
}

interface IAuditStats {
    _id: {
        module: string;
        action: string;
    };
    total: number;
    results: Array<{
        result: string;
        count: number;
    }>;
}

const auditLogSchema = new mongoose.Schema<IAuditLogDocument>({
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

// Compound indexes for efficient queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, timestamp: -1 });

const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);

class AuditLogger {
    static async log(
        ctx: Context,
        action: string,
        details: IAuditLogOptions = {}
    ): Promise<IAuditLogDocument | null> {
        try {
            const user = ctx.from;
            const chatId = ctx.chat?.id;

            if (!user || !chatId) {
                logger.warn('Intento de log de auditoría sin usuario o chat válido');
                return null;
            }

            const logEntry = new AuditLog({
                userId: user.id,
                username: user.username,
                firstName: user.first_name,
                chatId,
                action,
                module: details.module ?? 'system',
                entityType: details.entityType,
                entityId: details.entityId,
                changes: details.changes,
                metadata: {
                    additional: details.metadata
                },
                result: details.result ?? 'success',
                errorMessage: details.errorMessage
            });

            await logEntry.save();

            logger.info(
                `Auditoría: ${action} por @${user.username ?? user.first_name} (${user.id})`,
                {
                    module: details.module,
                    entityId: details.entityId,
                    result: details.result
                }
            );

            return logEntry;
        } catch (error) {
            logger.error('Error al registrar auditoría:', error);
            return null;
        }
    }

    static async logChange(
        ctx: Context,
        action: string,
        entity: any,
        beforeData: any,
        afterData: any,
        module: string
    ): Promise<IAuditLogDocument | null> {
        const changes = {
            before: beforeData,
            after: afterData
        };

        const modifiedFields: string[] = [];
        for (const key in afterData) {
            if (beforeData[key] !== afterData[key]) {
                modifiedFields.push(key);
            }
        }

        return await this.log(ctx, action, {
            module: module as any,
            entityType: entity.constructor.name,
            entityId: entity._id?.toString(),
            changes,
            metadata: {
                modifiedFields
            }
        });
    }

    static async logError(
        ctx: Context,
        action: string,
        error: Error | string,
        details: IAuditLogOptions = {}
    ): Promise<IAuditLogDocument | null> {
        const errorMessage =
            typeof error === 'string' ? error : (error.message ?? error.toString());

        return await this.log(ctx, action, {
            ...details,
            result: 'failure',
            errorMessage
        });
    }

    /**
     * Escapa caracteres especiales para RegExp
     */
    private static escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static async getLogs(filters: IAuditLogFilters = {}): Promise<IAuditLogResult> {
        const { userId, action, module, startDate, endDate, page = 1, limit = 20 } = filters;

        const query: any = {};

        if (userId) query.userId = userId;
        if (action) {
            const escapedAction = this.escapeRegExp(action);
            query.action = new RegExp(escapedAction, 'i');
        }
        if (module) query.module = module;

        if (startDate ?? endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = startDate;
            if (endDate) query.timestamp.$lte = endDate;
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
            AuditLog.countDocuments(query)
        ]);

        return {
            logs: logs as IAuditLogEntry[],
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }

    static async getStats(days = 30): Promise<IAuditStats[]> {
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

        return stats as IAuditStats[];
    }

    static async cleanup(daysToKeep = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await AuditLog.deleteMany({
            timestamp: { $lt: cutoffDate }
        });

        logger.info(`Limpieza de auditoría: ${result.deletedCount} registros eliminados`);

        return result.deletedCount ?? 0;
    }

    static async getUserActivity(userId: number, days = 30): Promise<IAuditLogEntry[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await AuditLog.find({
            userId,
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        return logs as IAuditLogEntry[];
    }

    static async getModuleActivity(module: string, days = 30): Promise<IAuditLogEntry[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await AuditLog.find({
            module,
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        return logs as IAuditLogEntry[];
    }

    static async getFailedOperations(days = 7): Promise<IAuditLogEntry[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await AuditLog.find({
            result: 'failure',
            timestamp: { $gte: startDate }
        })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        return logs as IAuditLogEntry[];
    }
}

export { AuditLogger, AuditLog };
export type { IAuditLogEntry, IAuditLogFilters, IAuditLogResult, IAuditLogOptions, IAuditStats };
