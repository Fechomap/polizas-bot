/**
 * ReportsHandlerV2 - Reportes con Prisma/PostgreSQL
 */
import { prisma } from '../../database';
import logger from '../../utils/logger';

interface IReportData {
    totalPolicies: number;
    activePolicies: number;
    expiredPolicies: number;
    totalServices: number;
    monthlyRevenue: number;
    averageRating: number;
    topInsurers: Array<{
        name: string;
        count: number;
        percentage: number;
    }>;
    serviceDistribution: Array<{
        type: string;
        count: number;
        percentage: number;
    }>;
    dailyStats: Array<{
        date: string;
        policies: number;
        services: number;
        revenue: number;
    }>;
}

class ReportsHandlerV2 {
    /**
     * Obtiene datos comprehensivos para reportes mensuales
     */
    static async getComprehensiveMonthlyDataV2(
        startDate: Date,
        endDate: Date
    ): Promise<IReportData> {
        try {
            // Consultas paralelas para mejor rendimiento
            const [totalPolicies, activePolicies, services, payments, insurerStats] =
                await Promise.all([
                    // Total de pólizas
                    prisma.policy.count({
                        where: { estado: { not: 'ELIMINADO' } }
                    }),

                    // Pólizas activas
                    prisma.policy.count({
                        where: { estado: 'ACTIVO' }
                    }),

                    // Servicios en el período
                    prisma.servicio.aggregate({
                        where: {
                            fechaServicio: { gte: startDate, lte: endDate }
                        },
                        _count: true,
                        _sum: { costo: true }
                    }),

                    // Pagos en el período
                    prisma.pago.aggregate({
                        where: {
                            fechaPago: { gte: startDate, lte: endDate },
                            estado: 'REALIZADO'
                        },
                        _count: true,
                        _sum: { monto: true }
                    }),

                    // Top aseguradoras
                    prisma.policy.groupBy({
                        by: ['aseguradora'],
                        where: { estado: { not: 'ELIMINADO' } },
                        _count: true,
                        orderBy: { _count: { aseguradora: 'desc' } },
                        take: 5
                    })
                ]);

            // Calcular porcentajes de aseguradoras
            const totalForPercentage = insurerStats.reduce((sum, i) => sum + i._count, 0);
            const topInsurers = insurerStats.map(i => ({
                name: i.aseguradora ?? 'Sin aseguradora',
                count: i._count,
                percentage:
                    totalForPercentage > 0 ? Math.round((i._count / totalForPercentage) * 100) : 0
            }));

            return {
                totalPolicies,
                activePolicies,
                expiredPolicies: totalPolicies - activePolicies,
                totalServices: services._count,
                monthlyRevenue: payments._sum.monto ?? 0,
                averageRating: 0, // No disponible en estructura actual
                topInsurers,
                serviceDistribution: [], // Simplificado - no hay tipo de servicio en el schema
                dailyStats: [] // Simplificado - requiere agregación por día
            };
        } catch (error) {
            logger.error('Error en getComprehensiveMonthlyDataV2:', error);

            // Retornar datos vacíos en caso de error
            return {
                totalPolicies: 0,
                activePolicies: 0,
                expiredPolicies: 0,
                totalServices: 0,
                monthlyRevenue: 0,
                averageRating: 0,
                topInsurers: [],
                serviceDistribution: [],
                dailyStats: []
            };
        }
    }
}

export default ReportsHandlerV2;
