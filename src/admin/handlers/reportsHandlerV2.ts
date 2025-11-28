import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import Policy from '../../models/policy';
import { AuditLogger } from '../utils/auditLogger';
import AdminMenu from '../menus/adminMenu';
import logger from '../../utils/logger';
// import PDFDocument from 'pdfkit';
import ChartGenerator from '../utils/chartGenerator';

interface IServiceData {
    fechaServicio: Date;
    tipoServicio: string;
    costo: number;
    estado: string;
}

interface IPagoData {
    fechaPago: Date;
    monto: number;
    metodoPago: string;
}

interface IRegistroData {
    fechaRegistro: Date;
    tipo: string;
    descripcion: string;
}

interface IPolicyData {
    _id: string;
    numeroPoliza: string;
    titular: string;
    fechaEmision: Date;
    estado: string;
    aseguradora: string;
    estadoPoliza: string;
    fechaFinCobertura: Date;
    fechaFinGracia: Date;
    servicios: IServiceData[];
    pagos: IPagoData[];
    registros: IRegistroData[];
    calificacion: number;
    totalServicios: number;
}

interface IPolicyAnalysis {
    newPoliciesInMonth: number;
    previousPoliciesWithActivity: number;
    byAge: {
        month0: number;
        month1: number;
        month2: number;
        month3: number;
        month4: number;
        month5: number;
        month6Plus: number;
    };
}

interface IComprehensiveData {
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
    policyAnalysis: IPolicyAnalysis;
}

class ReportsHandlerV2 {
    static async getComprehensiveMonthlyDataV2(
        startDate: Date,
        endDate: Date
    ): Promise<IComprehensiveData> {
        try {
            logger.info('Iniciando análisis V2 de ciclo de vida completo', {
                startDate,
                endDate
            });

            const sixMonthsBeforeStart = new Date(startDate);
            sixMonthsBeforeStart.setMonth(sixMonthsBeforeStart.getMonth() - 6);

            const relevantPolicies = (await Policy.find({
                $or: [
                    {
                        fechaEmision: { $gte: startDate, $lte: endDate },
                        estado: { $ne: 'ELIMINADO' }
                    },
                    {
                        fechaEmision: {
                            $gte: sixMonthsBeforeStart,
                            $lt: startDate
                        },
                        estado: { $ne: 'ELIMINADO' },
                        $or: [
                            { 'servicios.fechaServicio': { $gte: startDate, $lte: endDate } },
                            { 'pagos.fechaPago': { $gte: startDate, $lte: endDate } },
                            { 'registros.fechaRegistro': { $gte: startDate, $lte: endDate } }
                        ]
                    }
                ]
            })) as unknown as IPolicyData[];

            const totalPoliciesAnalyzed = relevantPolicies.length;

            const policyAnalysis: IPolicyAnalysis = {
                newPoliciesInMonth: relevantPolicies.filter(
                    p => p.fechaEmision >= startDate && p.fechaEmision <= endDate
                ).length,

                previousPoliciesWithActivity: relevantPolicies.filter(
                    p => p.fechaEmision < startDate
                ).length,

                byAge: {
                    month0: 0,
                    month1: 0,
                    month2: 0,
                    month3: 0,
                    month4: 0,
                    month5: 0,
                    month6Plus: 0
                }
            };

            relevantPolicies.forEach(policy => {
                const monthsDiff = this.getMonthsDifference(policy.fechaEmision, endDate);
                if (monthsDiff === 0) policyAnalysis.byAge.month0++;
                else if (monthsDiff === 1) policyAnalysis.byAge.month1++;
                else if (monthsDiff === 2) policyAnalysis.byAge.month2++;
                else if (monthsDiff === 3) policyAnalysis.byAge.month3++;
                else if (monthsDiff === 4) policyAnalysis.byAge.month4++;
                else if (monthsDiff === 5) policyAnalysis.byAge.month5++;
                else policyAnalysis.byAge.month6Plus++;
            });

            let totalServices = 0;
            let totalRevenue = 0;
            let totalRating = 0;
            let ratingCount = 0;
            let activePolicies = 0;
            let expiredPolicies = 0;

            const insurerStats = new Map<string, number>();
            const serviceStats = new Map<string, number>();
            const dailyStats = new Map<
                string,
                { policies: number; services: number; revenue: number }
            >();

            relevantPolicies.forEach(policy => {
                // Count services in the period
                const servicesInPeriod =
                    policy.servicios?.filter(
                        s => s.fechaServicio >= startDate && s.fechaServicio <= endDate
                    ) ?? [];

                totalServices += servicesInPeriod.length;

                // Count revenue from payments in the period
                const paymentsInPeriod =
                    policy.pagos?.filter(p => p.fechaPago >= startDate && p.fechaPago <= endDate) ||
                    [];

                const policyRevenue = paymentsInPeriod.reduce(
                    (sum, payment) => sum + payment.monto,
                    0
                );
                totalRevenue += policyRevenue;

                // Rating analysis
                if (policy.calificacion && policy.calificacion > 0) {
                    totalRating += policy.calificacion;
                    ratingCount++;
                }

                // Policy status analysis
                if (this.isPolicyActive(policy)) {
                    activePolicies++;
                } else {
                    expiredPolicies++;
                }

                // Insurer statistics
                const insurerName = policy.aseguradora ?? 'Sin aseguradora';
                insurerStats.set(insurerName, (insurerStats.get(insurerName) ?? 0) + 1);

                // Service type distribution
                servicesInPeriod.forEach(service => {
                    const serviceType = service.tipoServicio ?? 'Sin tipo';
                    serviceStats.set(serviceType, (serviceStats.get(serviceType) ?? 0) + 1);
                });

                // Daily statistics
                servicesInPeriod.forEach(service => {
                    const dateKey = service.fechaServicio.toISOString().split('T')[0];
                    const dayStats = dailyStats.get(dateKey) ?? {
                        policies: 0,
                        services: 0,
                        revenue: 0
                    };
                    dayStats.services++;
                    dayStats.revenue += service.costo ?? 0;
                    dailyStats.set(dateKey, dayStats);
                });
            });

            // Convert maps to arrays for response
            const topInsurers = Array.from(insurerStats.entries())
                .map(([name, count]) => ({
                    name,
                    count,
                    percentage: (count / totalPoliciesAnalyzed) * 100
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            const serviceDistribution = Array.from(serviceStats.entries())
                .map(([type, count]) => ({
                    type,
                    count,
                    percentage: (count / totalServices) * 100
                }))
                .sort((a, b) => b.count - a.count);

            const dailyStatsArray = Array.from(dailyStats.entries())
                .map(([date, stats]) => ({
                    date,
                    policies: stats.policies,
                    services: stats.services,
                    revenue: stats.revenue
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

            const comprehensiveData: IComprehensiveData = {
                totalPolicies: totalPoliciesAnalyzed,
                activePolicies,
                expiredPolicies,
                totalServices,
                monthlyRevenue: totalRevenue,
                averageRating,
                topInsurers,
                serviceDistribution,
                dailyStats: dailyStatsArray,
                policyAnalysis
            };

            logger.info('Análisis V2 completado', {
                totalPolicies: totalPoliciesAnalyzed,
                totalServices,
                totalRevenue,
                averageRating
            });

            return comprehensiveData;
        } catch (error) {
            logger.error('Error en análisis V2:', error);
            throw new Error('Error al obtener datos comprensivos: ' + (error as Error).message);
        }
    }

    static getMonthsDifference(date1: Date, date2: Date): number {
        const yearDiff = date2.getFullYear() - date1.getFullYear();
        const monthDiff = date2.getMonth() - date1.getMonth();
        return yearDiff * 12 + monthDiff;
    }

    static isPolicyActive(policy: IPolicyData): boolean {
        const today = new Date();

        if (policy.fechaFinCobertura) {
            const endDate = new Date(policy.fechaFinCobertura);
            if (endDate > today) {
                return true;
            }

            // Check grace period
            if (policy.fechaFinGracia) {
                const graceDate = new Date(policy.fechaFinGracia);
                return graceDate > today;
            }
        }

        return policy.estadoPoliza === 'ACTIVA' || policy.estado === 'ACTIVO';
    }

    static async generatePDFReport(data: IComprehensiveData, period: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                // TODO: Implement PDF generation when PDFKit types are available
                const mockBuffer = Buffer.from('PDF Report Mock Data');
                resolve(mockBuffer);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async handleAction(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'comprehensive':
                    return await this.handleComprehensiveAnalysis(ctx);
                case 'lifecycle':
                    return await this.handleLifecycleAnalysis(ctx);
                case 'trends':
                    return await this.handleTrendAnalysis(ctx);
                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en ReportsHandlerV2:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    static async handleComprehensiveAnalysis(ctx: Context): Promise<void> {
        try {
            const now = new Date();
            const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

            const data = await this.getComprehensiveMonthlyDataV2(startDate, endDate);

            const summaryText = `
🔍 *ANÁLISIS COMPRENSIVO V2*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **CICLO DE VIDA COMPLETO**
• Pólizas Nuevas del Mes: ${data.policyAnalysis.newPoliciesInMonth}
• Pólizas Previas con Actividad: ${data.policyAnalysis.previousPoliciesWithActivity}
• Total Analizado: ${data.totalPolicies}

📈 **ANÁLISIS POR ANTIGÜEDAD**
• Mes Actual: ${data.policyAnalysis.byAge.month0}
• 1 Mes: ${data.policyAnalysis.byAge.month1}
• 2 Meses: ${data.policyAnalysis.byAge.month2}
• 3 Meses: ${data.policyAnalysis.byAge.month3}
• 4 Meses: ${data.policyAnalysis.byAge.month4}
• 5 Meses: ${data.policyAnalysis.byAge.month5}
• 6+ Meses: ${data.policyAnalysis.byAge.month6Plus}

💰 **MÉTRICAS FINANCIERAS**
• Servicios Totales: ${data.totalServices}
• Ingresos del Período: $${data.monthlyRevenue.toLocaleString()}
• Calificación Promedio: ${data.averageRating.toFixed(1)}/5

📋 Análisis generado el ${new Date().toLocaleString('es-ES')}
            `.trim();

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'comprehensive_analysis_v2', {
                module: 'reports',
                metadata: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    totalPolicies: data.totalPolicies,
                    totalServices: data.totalServices
                }
            });
        } catch (error) {
            logger.error('Error en análisis comprensivo:', error);
            await ctx.reply('❌ Error al generar análisis comprensivo.');
        }
    }

    static async handleLifecycleAnalysis(ctx: Context): Promise<void> {
        await ctx.reply('Análisis de ciclo de vida en desarrollo.');
    }

    static async handleTrendAnalysis(ctx: Context): Promise<void> {
        await ctx.reply('Análisis de tendencias en desarrollo.');
    }
}

export default ReportsHandlerV2;
