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
    /**
     * Obtiene datos comprensivos usando MongoDB Aggregation Pipeline
     * OPTIMIZADO: Todo el cálculo se hace en la BD, no bloquea el event loop
     */
    static async getComprehensiveMonthlyDataV2(
        startDate: Date,
        endDate: Date
    ): Promise<IComprehensiveData> {
        try {
            logger.info('Iniciando análisis V2 con aggregation', { startDate, endDate });

            const sixMonthsBeforeStart = new Date(startDate);
            sixMonthsBeforeStart.setMonth(sixMonthsBeforeStart.getMonth() - 6);
            const today = new Date();

            // Pipeline de agregación - todo se calcula en MongoDB
            const results = await Policy.aggregate([
                // Stage 1: Match - filtrar pólizas relevantes
                {
                    $match: {
                        $or: [
                            {
                                fechaEmision: { $gte: startDate, $lte: endDate },
                                estado: { $ne: 'ELIMINADO' }
                            },
                            {
                                fechaEmision: { $gte: sixMonthsBeforeStart, $lt: startDate },
                                estado: { $ne: 'ELIMINADO' },
                                $or: [
                                    {
                                        'servicios.fechaServicio': {
                                            $gte: startDate,
                                            $lte: endDate
                                        }
                                    },
                                    { 'pagos.fechaPago': { $gte: startDate, $lte: endDate } },
                                    {
                                        'registros.fechaRegistro': {
                                            $gte: startDate,
                                            $lte: endDate
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                },
                // Stage 2: Project - calcular campos derivados
                {
                    $project: {
                        fechaEmision: 1,
                        aseguradora: { $ifNull: ['$aseguradora', 'Sin aseguradora'] },
                        calificacion: 1,
                        fechaFinCobertura: 1,
                        fechaFinGracia: 1,
                        estadoPoliza: 1,
                        estado: 1,
                        // Filtrar servicios del período
                        serviciosEnPeriodo: {
                            $filter: {
                                input: { $ifNull: ['$servicios', []] },
                                as: 's',
                                cond: {
                                    $and: [
                                        { $gte: ['$$s.fechaServicio', startDate] },
                                        { $lte: ['$$s.fechaServicio', endDate] }
                                    ]
                                }
                            }
                        },
                        // Filtrar pagos del período
                        pagosEnPeriodo: {
                            $filter: {
                                input: { $ifNull: ['$pagos', []] },
                                as: 'p',
                                cond: {
                                    $and: [
                                        { $gte: ['$$p.fechaPago', startDate] },
                                        { $lte: ['$$p.fechaPago', endDate] }
                                    ]
                                }
                            }
                        },
                        // Calcular meses de antigüedad
                        monthsAge: {
                            $add: [
                                {
                                    $multiply: [
                                        {
                                            $subtract: [
                                                { $year: endDate },
                                                { $year: '$fechaEmision' }
                                            ]
                                        },
                                        12
                                    ]
                                },
                                { $subtract: [{ $month: endDate }, { $month: '$fechaEmision' }] }
                            ]
                        },
                        // Determinar si es nueva (del mes)
                        isNew: {
                            $and: [
                                { $gte: ['$fechaEmision', startDate] },
                                { $lte: ['$fechaEmision', endDate] }
                            ]
                        },
                        // Determinar si está activa
                        isActive: {
                            $or: [
                                { $gt: ['$fechaFinCobertura', today] },
                                { $gt: ['$fechaFinGracia', today] },
                                { $eq: ['$estadoPoliza', 'ACTIVA'] },
                                { $eq: ['$estado', 'ACTIVO'] }
                            ]
                        }
                    }
                },
                // Stage 3: Facet - ejecutar múltiples agregaciones en paralelo
                {
                    $facet: {
                        // Estadísticas generales
                        general: [
                            {
                                $group: {
                                    _id: null,
                                    totalPolicies: { $sum: 1 },
                                    activePolicies: {
                                        $sum: { $cond: ['$isActive', 1, 0] }
                                    },
                                    newPolicies: {
                                        $sum: { $cond: ['$isNew', 1, 0] }
                                    },
                                    previousWithActivity: {
                                        $sum: { $cond: [{ $not: '$isNew' }, 1, 0] }
                                    },
                                    totalRating: {
                                        $sum: {
                                            $cond: [
                                                { $gt: ['$calificacion', 0] },
                                                '$calificacion',
                                                0
                                            ]
                                        }
                                    },
                                    ratingCount: {
                                        $sum: { $cond: [{ $gt: ['$calificacion', 0] }, 1, 0] }
                                    },
                                    totalServices: { $sum: { $size: '$serviciosEnPeriodo' } },
                                    totalRevenue: {
                                        $sum: { $sum: '$pagosEnPeriodo.monto' }
                                    }
                                }
                            }
                        ],
                        // Distribución por antigüedad
                        byAge: [
                            {
                                $group: {
                                    _id: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: { $eq: ['$monthsAge', 0] },
                                                    then: 'month0'
                                                },
                                                {
                                                    case: { $eq: ['$monthsAge', 1] },
                                                    then: 'month1'
                                                },
                                                {
                                                    case: { $eq: ['$monthsAge', 2] },
                                                    then: 'month2'
                                                },
                                                {
                                                    case: { $eq: ['$monthsAge', 3] },
                                                    then: 'month3'
                                                },
                                                {
                                                    case: { $eq: ['$monthsAge', 4] },
                                                    then: 'month4'
                                                },
                                                { case: { $eq: ['$monthsAge', 5] }, then: 'month5' }
                                            ],
                                            default: 'month6Plus'
                                        }
                                    },
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        // Top aseguradoras
                        insurers: [
                            { $group: { _id: '$aseguradora', count: { $sum: 1 } } },
                            { $sort: { count: -1 } },
                            { $limit: 10 }
                        ],
                        // Distribución de servicios por tipo
                        serviceTypes: [
                            {
                                $unwind: {
                                    path: '$serviciosEnPeriodo',
                                    preserveNullAndEmptyArrays: false
                                }
                            },
                            {
                                $group: {
                                    _id: {
                                        $ifNull: ['$serviciosEnPeriodo.tipoServicio', 'Sin tipo']
                                    },
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { count: -1 } }
                        ],
                        // Estadísticas diarias
                        dailyStats: [
                            {
                                $unwind: {
                                    path: '$serviciosEnPeriodo',
                                    preserveNullAndEmptyArrays: false
                                }
                            },
                            {
                                $group: {
                                    _id: {
                                        $dateToString: {
                                            format: '%Y-%m-%d',
                                            date: '$serviciosEnPeriodo.fechaServicio'
                                        }
                                    },
                                    services: { $sum: 1 },
                                    revenue: {
                                        $sum: { $ifNull: ['$serviciosEnPeriodo.costo', 0] }
                                    }
                                }
                            },
                            { $sort: { _id: 1 } }
                        ]
                    }
                }
            ]);

            // Procesar resultados de agregación
            const data = results[0];
            const general = data.general[0] || {
                totalPolicies: 0,
                activePolicies: 0,
                newPolicies: 0,
                previousWithActivity: 0,
                totalRating: 0,
                ratingCount: 0,
                totalServices: 0,
                totalRevenue: 0
            };

            // Construir byAge desde resultados
            const byAgeMap: Record<string, number> = {};
            data.byAge.forEach((item: { _id: string; count: number }) => {
                byAgeMap[item._id] = item.count;
            });

            const policyAnalysis: IPolicyAnalysis = {
                newPoliciesInMonth: general.newPolicies,
                previousPoliciesWithActivity: general.previousWithActivity,
                byAge: {
                    month0: byAgeMap['month0'] ?? 0,
                    month1: byAgeMap['month1'] ?? 0,
                    month2: byAgeMap['month2'] ?? 0,
                    month3: byAgeMap['month3'] ?? 0,
                    month4: byAgeMap['month4'] ?? 0,
                    month5: byAgeMap['month5'] ?? 0,
                    month6Plus: byAgeMap['month6Plus'] ?? 0
                }
            };

            // Top insurers con porcentaje
            const topInsurers = data.insurers.map((i: { _id: string; count: number }) => ({
                name: i._id,
                count: i.count,
                percentage: general.totalPolicies > 0 ? (i.count / general.totalPolicies) * 100 : 0
            }));

            // Service distribution con porcentaje
            const serviceDistribution = data.serviceTypes.map(
                (s: { _id: string; count: number }) => ({
                    type: s._id,
                    count: s.count,
                    percentage:
                        general.totalServices > 0 ? (s.count / general.totalServices) * 100 : 0
                })
            );

            // Daily stats
            const dailyStatsArray = data.dailyStats.map(
                (d: { _id: string; services: number; revenue: number }) => ({
                    date: d._id,
                    policies: 0,
                    services: d.services,
                    revenue: d.revenue
                })
            );

            const averageRating =
                general.ratingCount > 0 ? general.totalRating / general.ratingCount : 0;

            const comprehensiveData: IComprehensiveData = {
                totalPolicies: general.totalPolicies,
                activePolicies: general.activePolicies,
                expiredPolicies: general.totalPolicies - general.activePolicies,
                totalServices: general.totalServices,
                monthlyRevenue: general.totalRevenue,
                averageRating,
                topInsurers,
                serviceDistribution,
                dailyStats: dailyStatsArray,
                policyAnalysis
            };

            logger.info('Análisis V2 (aggregation) completado', {
                totalPolicies: general.totalPolicies,
                totalServices: general.totalServices
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
