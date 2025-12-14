// src/admin/utils/auditLogger.ts
/**
 * Sistema de auditoría para el módulo de administración
 * Migrado de Mongoose a Prisma/PostgreSQL
 */

import { Context } from 'telegraf';
import { prisma } from '../../database/prisma';
import logger from '../../utils/logger';
import type { AuditModule, AuditResult, AuditLog } from '../../generated/prisma';

interface IAuditLogEntry {
    id: string;
    userId: bigint;
    username?: string | null;
    firstName?: string | null;
    chatId: bigint;
    action: string;
    module: AuditModule;
    entityType?: string | null;
    entityId?: string | null;
    changes?: any;
    metadata?: any;
    result: AuditResult;
    errorMessage?: string | null;
    timestamp: Date;
}

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
    module: string;
    action: string;
    total: number;
    results: Array<{
        result: string;
        count: number;
    }>;
}

// Mapeo de strings a enums de Prisma
const moduleMap: Record<string, AuditModule> = {
    policy: 'POLICY',
    service: 'SERVICE',
    database: 'DATABASE',
    system: 'SYSTEM'
};

const resultMap: Record<string, AuditResult> = {
    success: 'SUCCESS',
    failure: 'FAILURE',
    partial: 'PARTIAL'
};

class AuditLogger {
    static async log(
        ctx: Context,
        action: string,
        details: IAuditLogOptions = {}
    ): Promise<AuditLog | null> {
        try {
            const user = ctx.from;
            const chatId = ctx.chat?.id;

            if (!user || !chatId) {
                logger.warn('Intento de log de auditoría sin usuario o chat válido');
                return null;
            }

            const moduleValue = moduleMap[details.module ?? 'system'] ?? 'SYSTEM';
            const resultValue = resultMap[details.result ?? 'success'] ?? 'SUCCESS';

            const logEntry = await prisma.auditLog.create({
                data: {
                    userId: BigInt(user.id),
                    username: user.username ?? null,
                    firstName: user.first_name ?? null,
                    chatId: BigInt(chatId),
                    action,
                    module: moduleValue,
                    entityType: details.entityType ?? null,
                    entityId: details.entityId ?? null,
                    changes: details.changes ?? undefined,
                    metadata: details.metadata ? { additional: details.metadata } : undefined,
                    result: resultValue,
                    errorMessage: details.errorMessage ?? null
                }
            });

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
    ): Promise<AuditLog | null> {
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
            entityType: entity.constructor?.name ?? 'Unknown',
            entityId: entity.id?.toString() ?? entity._id?.toString(),
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
    ): Promise<AuditLog | null> {
        const errorMessage =
            typeof error === 'string' ? error : (error.message ?? error.toString());

        return await this.log(ctx, action, {
            ...details,
            result: 'failure',
            errorMessage
        });
    }

    static async getLogs(filters: IAuditLogFilters = {}): Promise<IAuditLogResult> {
        const { userId, action, module, startDate, endDate, page = 1, limit = 20 } = filters;

        const where: any = {};

        if (userId) where.userId = BigInt(userId);
        if (action) {
            where.action = { contains: action, mode: 'insensitive' };
        }
        if (module) {
            where.module = moduleMap[module] ?? module;
        }

        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) where.timestamp.gte = startDate;
            if (endDate) where.timestamp.lte = endDate;
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit
            }),
            prisma.auditLog.count({ where })
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

        // Prisma no tiene aggregation pipeline como MongoDB,
        // usamos groupBy y luego procesamos los resultados
        const rawStats = await prisma.auditLog.groupBy({
            by: ['module', 'action', 'result'],
            where: {
                timestamp: { gte: startDate }
            },
            _count: { id: true }
        });

        // Procesar resultados para agrupar por module/action
        const statsMap = new Map<string, IAuditStats>();

        for (const stat of rawStats) {
            const key = `${stat.module}:${stat.action}`;

            if (!statsMap.has(key)) {
                statsMap.set(key, {
                    module: stat.module,
                    action: stat.action,
                    total: 0,
                    results: []
                });
            }

            const entry = statsMap.get(key)!;
            entry.total += stat._count.id;
            entry.results.push({
                result: stat.result,
                count: stat._count.id
            });
        }

        // Convertir a array y ordenar por total
        return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
    }

    static async cleanup(daysToKeep = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await prisma.auditLog.deleteMany({
            where: {
                timestamp: { lt: cutoffDate }
            }
        });

        logger.info(`Limpieza de auditoría: ${result.count} registros eliminados`);

        return result.count;
    }

    static async getUserActivity(userId: number, days = 30): Promise<IAuditLogEntry[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await prisma.auditLog.findMany({
            where: {
                userId: BigInt(userId),
                timestamp: { gte: startDate }
            },
            orderBy: { timestamp: 'desc' },
            take: 50
        });

        return logs as IAuditLogEntry[];
    }

    static async getModuleActivity(module: string, days = 30): Promise<IAuditLogEntry[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const moduleValue = moduleMap[module] ?? module;

        const logs = await prisma.auditLog.findMany({
            where: {
                module: moduleValue,
                timestamp: { gte: startDate }
            },
            orderBy: { timestamp: 'desc' },
            take: 100
        });

        return logs as IAuditLogEntry[];
    }

    static async getFailedOperations(days = 7): Promise<IAuditLogEntry[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await prisma.auditLog.findMany({
            where: {
                result: 'FAILURE',
                timestamp: { gte: startDate }
            },
            orderBy: { timestamp: 'desc' },
            take: 50
        });

        return logs as IAuditLogEntry[];
    }
}

export { AuditLogger };
export type { IAuditLogEntry, IAuditLogFilters, IAuditLogResult, IAuditLogOptions, IAuditStats };
