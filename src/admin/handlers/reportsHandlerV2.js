const { Markup } = require('telegraf');
const Policy = require('../../models/policy');
const { AuditLogger } = require('../utils/auditLogger');
const AdminMenu = require('../menus/adminMenu');
const logger = require('../../utils/logger');
const PDFDocument = require('pdfkit');
const ChartGenerator = require('../utils/chartGenerator');

/**
 * ReportsHandler V2 - Análisis completo del ciclo de vida de las pólizas
 *
 * CAMBIOS PRINCIPALES:
 * 1. Análisis de pólizas activas en el mes (no solo las creadas)
 * 2. Incluye servicios ejecutados en cualquier momento
 * 3. Considera pagos realizados en cualquier fecha
 * 4. Análisis del ciclo de vida completo (hasta 6 meses)
 */
class ReportsHandlerV2 {

    /**
     * MÉTODO MEJORADO: Obtiene datos completos considerando el ciclo de vida
     *
     * LÓGICA NUEVA:
     * - Incluye pólizas creadas hasta 6 meses antes del período analizado
     * - Contabiliza TODOS los servicios y pagos de cada póliza
     * - Categoriza pólizas por su fecha de emisión vs el mes analizado
     */
    static async getComprehensiveMonthlyDataV2(startDate, endDate) {
        try {
            logger.info('Iniciando análisis V2 de ciclo de vida completo', {
                startDate,
                endDate
            });

            // Fecha límite: 6 meses antes del inicio del período
            const sixMonthsBeforeStart = new Date(startDate);
            sixMonthsBeforeStart.setMonth(sixMonthsBeforeStart.getMonth() - 6);

            // 1. OBTENER TODAS LAS PÓLIZAS RELEVANTES
            // Incluye pólizas creadas hasta 6 meses antes y las del mes actual
            const relevantPolicies = await Policy.find({
                $or: [
                    // Pólizas creadas en el mes analizado
                    {
                        fechaEmision: { $gte: startDate, $lte: endDate },
                        estado: { $ne: 'ELIMINADO' }
                    },
                    // Pólizas creadas hasta 6 meses antes que podrían estar activas
                    {
                        fechaEmision: {
                            $gte: sixMonthsBeforeStart,
                            $lt: startDate
                        },
                        estado: { $ne: 'ELIMINADO' },
                        // Verificar que tenga actividad reciente (servicios o pagos)
                        $or: [
                            { 'servicios.fechaServicio': { $gte: startDate, $lte: endDate } },
                            { 'pagos.fechaPago': { $gte: startDate, $lte: endDate } },
                            { 'registros.fechaRegistro': { $gte: startDate, $lte: endDate } }
                        ]
                    }
                ]
            });

            const totalPoliciesAnalyzed = relevantPolicies.length;

            // 2. ANÁLISIS DETALLADO POR CATEGORÍAS
            const policyAnalysis = {
                // Pólizas nuevas del mes
                newPoliciesInMonth: relevantPolicies.filter(p =>
                    p.fechaEmision >= startDate && p.fechaEmision <= endDate
                ).length,

                // Pólizas anteriores con actividad
                previousPoliciesWithActivity: relevantPolicies.filter(p =>
                    p.fechaEmision < startDate
                ).length,

                // Análisis por antigüedad
                byAge: {
                    month0: 0, // Mismo mes
                    month1: 0, // 1 mes
                    month2: 0, // 2 meses
                    month3: 0, // 3 meses
                    month4: 0, // 4 meses
                    month5: 0, // 5 meses
                    month6Plus: 0 // 6+ meses
                }
            };

            // Calcular antigüedad de cada póliza
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

            // 3. ANÁLISIS POR ASEGURADORA CON CICLO DE VIDA COMPLETO
            const aseguradoraMap = new Map();

            relevantPolicies.forEach(policy => {
                const aseguradora = policy.aseguradora || 'SIN ESPECIFICAR';

                if (!aseguradoraMap.has(aseguradora)) {
                    aseguradoraMap.set(aseguradora, {
                        _id: aseguradora,
                        totalPolicies: 0,
                        newPoliciesInMonth: 0,
                        oldPoliciesActive: 0,
                        totalServices: 0,
                        servicesInMonth: 0,
                        totalPaymentAmount: 0,
                        paymentsInMonth: 0,
                        totalServiceCost: 0,
                        serviceCostInMonth: 0,
                        policiesWithServices: 0,
                        avgPolicyAge: 0,
                        ageSum: 0
                    });
                }

                const stats = aseguradoraMap.get(aseguradora);
                stats.totalPolicies++;

                // Determinar si es póliza nueva del mes
                if (policy.fechaEmision >= startDate && policy.fechaEmision <= endDate) {
                    stats.newPoliciesInMonth++;
                } else {
                    stats.oldPoliciesActive++;
                }

                // Edad de la póliza
                const policyAge = this.getMonthsDifference(policy.fechaEmision, endDate);
                stats.ageSum += policyAge;

                // Analizar TODOS los servicios (histórico completo)
                let hasServices = false;
                if (policy.servicios && policy.servicios.length > 0) {
                    hasServices = true;
                    stats.totalServices += policy.servicios.length;

                    policy.servicios.forEach(servicio => {
                        const serviceCost = servicio.costo || 0;
                        stats.totalServiceCost += serviceCost;

                        // Verificar si el servicio fue en el mes analizado
                        if (servicio.fechaServicio &&
                            servicio.fechaServicio >= startDate &&
                            servicio.fechaServicio <= endDate) {
                            stats.servicesInMonth++;
                            stats.serviceCostInMonth += serviceCost;
                        }
                    });
                }

                if (hasServices) {
                    stats.policiesWithServices++;
                }

                // Analizar TODOS los pagos (histórico completo)
                if (policy.pagos && policy.pagos.length > 0) {
                    policy.pagos.forEach(pago => {
                        const paymentAmount = pago.monto || 0;
                        stats.totalPaymentAmount += paymentAmount;

                        // Verificar si el pago fue en el mes analizado
                        if (pago.fechaPago &&
                            pago.fechaPago >= startDate &&
                            pago.fechaPago <= endDate) {
                            stats.paymentsInMonth += paymentAmount;
                        }
                    });
                }
            });

            // Calcular métricas finales para cada aseguradora
            const aseguradoraAnalysis = Array.from(aseguradoraMap.values()).map(stats => {
                // Tasa de uso real (considerando toda la vida de las pólizas)
                const realServiceUsageRate = stats.totalPolicies > 0
                    ? Math.round((stats.policiesWithServices / stats.totalPolicies) * 100 * 100) / 100
                    : 0;

                // ROI real (ingresos totales vs costos totales)
                const realROI = stats.totalServiceCost > 0
                    ? Math.round(((stats.totalPaymentAmount - stats.totalServiceCost) / stats.totalServiceCost) * 100 * 100) / 100
                    : 0;

                // Edad promedio de las pólizas
                const avgPolicyAge = stats.totalPolicies > 0
                    ? Math.round((stats.ageSum / stats.totalPolicies) * 10) / 10
                    : 0;

                // Eficiencia del mes (servicios del mes / pólizas activas)
                const monthEfficiency = stats.totalPolicies > 0
                    ? Math.round((stats.servicesInMonth / stats.totalPolicies) * 100) / 100
                    : 0;

                return {
                    ...stats,
                    serviceUsageRate: realServiceUsageRate,
                    roi: realROI,
                    avgPolicyAge,
                    monthEfficiency,
                    // Métricas adicionales para mejor análisis
                    percentNewPolicies: Math.round((stats.newPoliciesInMonth / stats.totalPolicies) * 100),
                    percentOldPolicies: Math.round((stats.oldPoliciesActive / stats.totalPolicies) * 100)
                };
            }).sort((a, b) => b.totalPolicies - a.totalPolicies);

            // 4. ANÁLISIS TEMPORAL MEJORADO
            const dailyAnalysis = await this.getDailyAnalysisV2(startDate, endDate, sixMonthsBeforeStart);

            // 5. ESTADÍSTICAS DE SERVICIOS MEJORADAS
            const serviciosStats = {
                // Pólizas sin servicios (en toda su vida)
                polizasSinServicios: relevantPolicies.filter(p =>
                    !p.servicios || p.servicios.length === 0
                ).length,

                // Pólizas con un servicio
                polizasConUnServicio: relevantPolicies.filter(p =>
                    p.servicios && p.servicios.length === 1
                ).length,

                // Pólizas con dos o más servicios
                polizasConDosServicios: relevantPolicies.filter(p =>
                    p.servicios && p.servicios.length >= 2
                ).length,

                // Nuevas métricas
                avgServicesPerPolicy: 0,
                totalServicesInMonth: 0,
                totalServicesHistoric: 0
            };

            // Calcular totales de servicios
            let totalServicesHistoric = 0;
            let totalServicesInMonth = 0;

            relevantPolicies.forEach(policy => {
                if (policy.servicios) {
                    totalServicesHistoric += policy.servicios.length;

                    policy.servicios.forEach(servicio => {
                        if (servicio.fechaServicio &&
                            servicio.fechaServicio >= startDate &&
                            servicio.fechaServicio <= endDate) {
                            totalServicesInMonth++;
                        }
                    });
                }
            });

            serviciosStats.totalServicesHistoric = totalServicesHistoric;
            serviciosStats.totalServicesInMonth = totalServicesInMonth;
            serviciosStats.avgServicesPerPolicy = totalPoliciesAnalyzed > 0
                ? Math.round((totalServicesHistoric / totalPoliciesAnalyzed) * 100) / 100
                : 0;

            // 6. RESUMEN FINANCIERO COMPLETO
            const financialSummary = await this.getFinancialSummaryV2(
                relevantPolicies,
                startDate,
                endDate
            );

            logger.info('Análisis V2 completado exitosamente', {
                totalPoliciesAnalyzed,
                newPolicies: policyAnalysis.newPoliciesInMonth,
                activePolicies: policyAnalysis.previousPoliciesWithActivity,
                aseguradorasCount: aseguradoraAnalysis.length
            });

            return {
                period: { start: startDate, end: endDate },
                totalPolicies: totalPoliciesAnalyzed,
                totalServices: totalServicesHistoric,
                policyAnalysis,
                aseguradoraAnalysis,
                dailyAnalysis,
                serviciosStats,
                financialSummary,
                generatedAt: new Date(),
                analysisType: 'CICLO_VIDA_COMPLETO'
            };

        } catch (error) {
            logger.error('Error en análisis V2:', error);
            throw error;
        }
    }

    /**
     * Calcula la diferencia en meses entre dos fechas
     */
    static getMonthsDifference(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        let months = (end.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += end.getMonth();

        return months >= 0 ? months : 0;
    }

    /**
     * Análisis diario mejorado
     */
    static async getDailyAnalysisV2(startDate, endDate, sixMonthsBeforeStart) {
        const dailyMap = new Map();

        // Inicializar todos los días del mes
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const day = currentDate.getDate();
            dailyMap.set(day, {
                _id: { day },
                policiesCount: 0,
                servicesCount: 0,
                paymentsCount: 0,
                totalRevenue: 0
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Obtener actividad diaria
        const policies = await Policy.find({
            $or: [
                { fechaEmision: { $gte: startDate, $lte: endDate } },
                {
                    fechaEmision: { $gte: sixMonthsBeforeStart, $lt: startDate },
                    $or: [
                        { 'servicios.fechaServicio': { $gte: startDate, $lte: endDate } },
                        { 'pagos.fechaPago': { $gte: startDate, $lte: endDate } }
                    ]
                }
            ],
            estado: { $ne: 'ELIMINADO' }
        });

        policies.forEach(policy => {
            // Contar pólizas nuevas del día
            if (policy.fechaEmision >= startDate && policy.fechaEmision <= endDate) {
                const day = policy.fechaEmision.getDate();
                const dayStats = dailyMap.get(day);
                if (dayStats) {
                    dayStats.policiesCount++;
                }
            }

            // Contar servicios del día
            if (policy.servicios) {
                policy.servicios.forEach(servicio => {
                    if (servicio.fechaServicio &&
                        servicio.fechaServicio >= startDate &&
                        servicio.fechaServicio <= endDate) {
                        const day = servicio.fechaServicio.getDate();
                        const dayStats = dailyMap.get(day);
                        if (dayStats) {
                            dayStats.servicesCount++;
                        }
                    }
                });
            }

            // Contar pagos del día
            if (policy.pagos) {
                policy.pagos.forEach(pago => {
                    if (pago.fechaPago &&
                        pago.fechaPago >= startDate &&
                        pago.fechaPago <= endDate) {
                        const day = pago.fechaPago.getDate();
                        const dayStats = dailyMap.get(day);
                        if (dayStats) {
                            dayStats.paymentsCount++;
                            dayStats.totalRevenue += (pago.monto || 0);
                        }
                    }
                });
            }
        });

        return Array.from(dailyMap.values()).sort((a, b) => a._id.day - b._id.day);
    }

    /**
     * Resumen financiero mejorado
     */
    static async getFinancialSummaryV2(policies, startDate, endDate) {
        let totalRevenue = 0;
        let totalRevenueInMonth = 0;
        let totalServiceCosts = 0;
        let totalServiceCostsInMonth = 0;
        let totalServices = 0;
        let totalServicesInMonth = 0;
        let totalPayments = 0;
        let totalPaymentsInMonth = 0;

        policies.forEach(policy => {
            // Analizar pagos
            if (policy.pagos) {
                policy.pagos.forEach(pago => {
                    const amount = pago.monto || 0;
                    totalRevenue += amount;
                    totalPayments++;

                    if (pago.fechaPago &&
                        pago.fechaPago >= startDate &&
                        pago.fechaPago <= endDate) {
                        totalRevenueInMonth += amount;
                        totalPaymentsInMonth++;
                    }
                });
            }

            // Analizar servicios
            if (policy.servicios) {
                policy.servicios.forEach(servicio => {
                    const cost = servicio.costo || 0;
                    totalServiceCosts += cost;
                    totalServices++;

                    if (servicio.fechaServicio &&
                        servicio.fechaServicio >= startDate &&
                        servicio.fechaServicio <= endDate) {
                        totalServiceCostsInMonth += cost;
                        totalServicesInMonth++;
                    }
                });
            }
        });

        // Cálculos finales
        const netProfit = totalRevenue - totalServiceCosts;
        const netProfitInMonth = totalRevenueInMonth - totalServiceCostsInMonth;

        const profitMargin = totalRevenue > 0
            ? Math.round(((totalRevenue - totalServiceCosts) / totalRevenue) * 100 * 100) / 100
            : 0;

        const profitMarginInMonth = totalRevenueInMonth > 0
            ? Math.round(((totalRevenueInMonth - totalServiceCostsInMonth) / totalRevenueInMonth) * 100 * 100) / 100
            : 0;

        const averageROI = totalServiceCosts > 0
            ? Math.round(((totalRevenue - totalServiceCosts) / totalServiceCosts) * 100 * 100) / 100
            : 0;

        return {
            // Totales históricos (ciclo de vida completo)
            totalRevenue,
            totalServiceCosts,
            netProfit,
            profitMargin,
            averageROI,
            totalServices,
            totalPayments,

            // Totales del mes específico
            totalRevenueInMonth,
            totalServiceCostsInMonth,
            netProfitInMonth,
            profitMarginInMonth,
            totalServicesInMonth,
            totalPaymentsInMonth,

            // Métricas adicionales
            avgRevenuePerPolicy: policies.length > 0
                ? Math.round(totalRevenue / policies.length)
                : 0,
            avgServiceCostPerPolicy: policies.length > 0
                ? Math.round(totalServiceCosts / policies.length)
                : 0,
            avgServicesPerPolicy: policies.length > 0
                ? Math.round((totalServices / policies.length) * 100) / 100
                : 0
        };
    }

    /**
     * NUEVO: Análisis ejecutivo diario con pólizas activas y eliminadas
     * Incluye análisis día por día con patrones de registro y eliminación
     */
    static async getDailyExecutiveAnalysis(startDate, endDate) {
        try {
            logger.info('Iniciando análisis ejecutivo diario', { startDate, endDate });
            
            // Obtener TODAS las pólizas del mes (activas y eliminadas)
            const allPolicies = await Policy.find({
                $or: [
                    // Pólizas creadas en el mes
                    { fechaEmision: { $gte: startDate, $lte: endDate } },
                    // Pólizas eliminadas en el mes
                    { 
                        fechaEliminacion: { $gte: startDate, $lte: endDate },
                        estado: 'ELIMINADO'
                    }
                ]
            });

            // Inicializar estructura de datos por día
            const dailyData = new Map();
            const currentDate = new Date(startDate);
            
            while (currentDate <= endDate) {
                const dayKey = currentDate.getDate();
                dailyData.set(dayKey, {
                    day: dayKey,
                    date: new Date(currentDate),
                    policiesCreated: 0,
                    policiesDeleted: 0,
                    netPolicyChange: 0,
                    createdPolicies: [],
                    deletedPolicies: [],
                    servicesRegistered: 0,
                    servicesByInsurer: {},
                    deletionReasons: {},
                    totalInvestment: 0,
                    policyTypes: {}
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Analizar cada póliza
            allPolicies.forEach(policy => {
                // Pólizas creadas en el mes
                if (policy.fechaEmision >= startDate && policy.fechaEmision <= endDate) {
                    const day = policy.fechaEmision.getDate();
                    const dayStats = dailyData.get(day);
                    
                    if (dayStats) {
                        dayStats.policiesCreated++;
                        dayStats.createdPolicies.push({
                            numeroPoliza: policy.numeroPoliza,
                            aseguradora: policy.aseguradora,
                            titular: policy.titular,
                            vehiculo: `${policy.marca} ${policy.submarca} ${policy.año}`,
                            estado: policy.estado
                        });

                        // Contar por aseguradora
                        const aseguradora = policy.aseguradora || 'SIN ESPECIFICAR';
                        if (!dayStats.servicesByInsurer[aseguradora]) {
                            dayStats.servicesByInsurer[aseguradora] = 0;
                        }
                        dayStats.servicesByInsurer[aseguradora]++;

                        // Contar servicios/registros del día
                        if (policy.servicios && policy.servicios.length > 0) {
                            policy.servicios.forEach(servicio => {
                                if (servicio.fechaServicio && 
                                    servicio.fechaServicio.getDate() === day) {
                                    dayStats.servicesRegistered++;
                                }
                            });
                        }

                        if (policy.registros && policy.registros.length > 0) {
                            policy.registros.forEach(registro => {
                                if (registro.fechaRegistro && 
                                    registro.fechaRegistro.getDate() === day) {
                                    dayStats.servicesRegistered++;
                                }
                            });
                        }

                        // Calcular inversión total (estimada por pagos)
                        if (policy.pagos && policy.pagos.length > 0) {
                            policy.pagos.forEach(pago => {
                                if (pago.fechaPago && 
                                    pago.fechaPago >= startDate && 
                                    pago.fechaPago <= endDate) {
                                    dayStats.totalInvestment += (pago.monto || 0);
                                }
                            });
                        }
                    }
                }

                // Pólizas eliminadas en el mes
                if (policy.fechaEliminacion && 
                    policy.fechaEliminacion >= startDate && 
                    policy.fechaEliminacion <= endDate && 
                    policy.estado === 'ELIMINADO') {
                    
                    const day = policy.fechaEliminacion.getDate();
                    const dayStats = dailyData.get(day);
                    
                    if (dayStats) {
                        dayStats.policiesDeleted++;
                        dayStats.deletedPolicies.push({
                            numeroPoliza: policy.numeroPoliza,
                            aseguradora: policy.aseguradora,
                            titular: policy.titular,
                            vehiculo: `${policy.marca} ${policy.submarca} ${policy.año}`,
                            motivoEliminacion: policy.motivoEliminacion || 'SIN ESPECIFICAR',
                            fechaEmision: policy.fechaEmision
                        });

                        // Contar motivos de eliminación
                        const motivo = policy.motivoEliminacion || 'SIN ESPECIFICAR';
                        if (!dayStats.deletionReasons[motivo]) {
                            dayStats.deletionReasons[motivo] = 0;
                        }
                        dayStats.deletionReasons[motivo]++;
                    }
                }
            });

            // Calcular cambio neto y estadísticas finales
            const dailyAnalysis = Array.from(dailyData.values()).map(dayData => {
                dayData.netPolicyChange = dayData.policiesCreated - dayData.policiesDeleted;
                
                // Convertir mapas a arrays ordenados
                dayData.insurerRanking = Object.entries(dayData.servicesByInsurer)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5); // Top 5 aseguradoras

                dayData.topDeletionReasons = Object.entries(dayData.deletionReasons)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3); // Top 3 motivos

                return dayData;
            });

            // Calcular estadísticas del mes
            const monthlyStats = {
                totalPoliciesCreated: dailyAnalysis.reduce((sum, day) => sum + day.policiesCreated, 0),
                totalPoliciesDeleted: dailyAnalysis.reduce((sum, day) => sum + day.policiesDeleted, 0),
                totalServicesRegistered: dailyAnalysis.reduce((sum, day) => sum + day.servicesRegistered, 0),
                totalInvestment: dailyAnalysis.reduce((sum, day) => sum + day.totalInvestment, 0),
                netPolicyChange: dailyAnalysis.reduce((sum, day) => sum + day.netPolicyChange, 0),
                peakRegistrationDay: dailyAnalysis.reduce((peak, day) => 
                    day.policiesCreated > peak.policiesCreated ? day : peak, 
                    dailyAnalysis[0]
                ),
                peakDeletionDay: dailyAnalysis.reduce((peak, day) => 
                    day.policiesDeleted > peak.policiesDeleted ? day : peak, 
                    dailyAnalysis[0]
                )
            };

            // Análisis de patrones
            const patterns = {
                avgPoliciesPerDay: Math.round(monthlyStats.totalPoliciesCreated / dailyAnalysis.length * 100) / 100,
                avgDeletionsPerDay: Math.round(monthlyStats.totalPoliciesDeleted / dailyAnalysis.length * 100) / 100,
                retentionRate: monthlyStats.totalPoliciesCreated > 0 
                    ? Math.round((1 - monthlyStats.totalPoliciesDeleted / monthlyStats.totalPoliciesCreated) * 100 * 100) / 100
                    : 100,
                mostActiveWeekdays: this.analyzeWeekdayPatterns(dailyAnalysis, startDate),
                growthTrend: this.calculateGrowthTrend(dailyAnalysis)
            };

            // Análisis por aseguradora (global del mes)
            const insurerAnalysis = this.analyzeInsurerPerformance(allPolicies, startDate, endDate);

            logger.info('Análisis ejecutivo diario completado', {
                totalDays: dailyAnalysis.length,
                totalPoliciesCreated: monthlyStats.totalPoliciesCreated,
                totalPoliciesDeleted: monthlyStats.totalPoliciesDeleted,
                netChange: monthlyStats.netPolicyChange
            });

            return {
                period: { start: startDate, end: endDate },
                dailyAnalysis,
                monthlyStats,
                patterns,
                insurerAnalysis,
                generatedAt: new Date(),
                analysisType: 'EJECUTIVO_DIARIO'
            };

        } catch (error) {
            logger.error('Error en análisis ejecutivo diario:', error);
            throw error;
        }
    }

    /**
     * Analiza patrones de días de la semana
     */
    static analyzeWeekdayPatterns(dailyAnalysis, startDate) {
        const weekdayStats = {
            0: { name: 'Domingo', policies: 0, deletions: 0, days: 0 },
            1: { name: 'Lunes', policies: 0, deletions: 0, days: 0 },
            2: { name: 'Martes', policies: 0, deletions: 0, days: 0 },
            3: { name: 'Miércoles', policies: 0, deletions: 0, days: 0 },
            4: { name: 'Jueves', policies: 0, deletions: 0, days: 0 },
            5: { name: 'Viernes', policies: 0, deletions: 0, days: 0 },
            6: { name: 'Sábado', policies: 0, deletions: 0, days: 0 }
        };

        dailyAnalysis.forEach(day => {
            const weekday = day.date.getDay();
            weekdayStats[weekday].policies += day.policiesCreated;
            weekdayStats[weekday].deletions += day.policiesDeleted;
            weekdayStats[weekday].days++;
        });

        return Object.values(weekdayStats).map(stat => ({
            ...stat,
            avgPolicies: stat.days > 0 ? Math.round(stat.policies / stat.days * 100) / 100 : 0,
            avgDeletions: stat.days > 0 ? Math.round(stat.deletions / stat.days * 100) / 100 : 0
        })).sort((a, b) => b.avgPolicies - a.avgPolicies);
    }

    /**
     * Calcula tendencia de crecimiento
     */
    static calculateGrowthTrend(dailyAnalysis) {
        if (dailyAnalysis.length < 2) return { trend: 'INSUFICIENTE_DATA', slope: 0 };

        const firstHalf = dailyAnalysis.slice(0, Math.floor(dailyAnalysis.length / 2));
        const secondHalf = dailyAnalysis.slice(Math.floor(dailyAnalysis.length / 2));

        const firstHalfAvg = firstHalf.reduce((sum, day) => sum + day.policiesCreated, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, day) => sum + day.policiesCreated, 0) / secondHalf.length;

        const slope = secondHalfAvg - firstHalfAvg;
        
        let trend = 'ESTABLE';
        if (slope > 0.5) trend = 'CRECIENTE';
        else if (slope < -0.5) trend = 'DECRECIENTE';

        return { trend, slope: Math.round(slope * 100) / 100 };
    }

    /**
     * Analiza performance por aseguradora
     */
    static analyzeInsurerPerformance(policies, startDate, endDate) {
        const insurerMap = new Map();

        policies.forEach(policy => {
            const insurer = policy.aseguradora || 'SIN ESPECIFICAR';
            
            if (!insurerMap.has(insurer)) {
                insurerMap.set(insurer, {
                    name: insurer,
                    policiesCreated: 0,
                    policiesDeleted: 0,
                    totalInvestment: 0,
                    retentionRate: 0,
                    avgPolicyLifespan: 0,
                    totalServiceCosts: 0
                });
            }

            const stats = insurerMap.get(insurer);

            // Pólizas creadas
            if (policy.fechaEmision >= startDate && policy.fechaEmision <= endDate) {
                stats.policiesCreated++;
            }

            // Pólizas eliminadas
            if (policy.fechaEliminacion && 
                policy.fechaEliminacion >= startDate && 
                policy.fechaEliminacion <= endDate && 
                policy.estado === 'ELIMINADO') {
                stats.policiesDeleted++;
            }

            // Inversión total
            if (policy.pagos) {
                policy.pagos.forEach(pago => {
                    stats.totalInvestment += (pago.monto || 0);
                });
            }

            // Costos de servicios
            if (policy.servicios) {
                policy.servicios.forEach(servicio => {
                    stats.totalServiceCosts += (servicio.costo || 0);
                });
            }
        });

        return Array.from(insurerMap.values()).map(stats => ({
            ...stats,
            retentionRate: stats.policiesCreated > 0 
                ? Math.round((1 - stats.policiesDeleted / stats.policiesCreated) * 100 * 100) / 100
                : 100,
            netPolicyChange: stats.policiesCreated - stats.policiesDeleted,
            roi: stats.totalServiceCosts > 0 
                ? Math.round(((stats.totalInvestment - stats.totalServiceCosts) / stats.totalServiceCosts) * 100 * 100) / 100
                : 0
        })).sort((a, b) => b.policiesCreated - a.policiesCreated);
    }

    /**
     * Genera PDF del reporte ejecutivo diario con diseño horizontal futurista
     */
    static async generateExecutiveDailyPDF(executiveData, period) {
        try {
            logger.info('Generando PDF ejecutivo diario');

            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape', // Formato horizontal
                margins: { top: 40, bottom: 40, left: 40, right: 40 },
                bufferPages: true
            });

            // Configurar fuente y codificación UTF-8
            doc.font('Helvetica');
            
            // Asegurar codificación UTF-8 correcta
            doc.info.Title = 'Reporte Ejecutivo Diario';
            doc.info.Subject = `Análisis diario - ${period}`;
            doc.info.Creator = 'Sistema de Gestión de Pólizas IA';

            // ENCABEZADO PRINCIPAL
            doc.fontSize(24)
               .fillColor('#00D2FF')
               .text('REPORTE EJECUTIVO DIARIO', 50, 50);

            doc.fontSize(16)
               .fillColor('#333333')
               .text(`Periodo: ${period}`, 50, 85);

            // GENERAR GRÁFICA DE DISTRIBUCIÓN DIARIA
            const chartBuffer = await this.generateDailyDistributionChart(executiveData);
            
            // Insertar gráfica en el PDF (tamaño más compacto)
            if (chartBuffer) {
                doc.image(chartBuffer, 50, 120, { width: 650, height: 220 });
            }

            // NUEVA PÁGINA para el contenido
            doc.addPage();
            
            // RESUMEN EJECUTIVO (Nueva página)
            let yPos = 50;
            const { monthlyStats, patterns, dailyAnalysis } = executiveData;

            // Cuadros de métricas principales
            doc.fontSize(14)
               .fillColor('#FFFFFF')
               .rect(50, yPos, 150, 60)
               .fill('#667eea');

            doc.fillColor('#FFFFFF')
               .text('POLIZAS CREADAS', 55, yPos + 10)
               .fontSize(20)
               .text(monthlyStats.totalPoliciesCreated.toString(), 55, yPos + 30);

            doc.fontSize(14)
               .fillColor('#FFFFFF')
               .rect(220, yPos, 150, 60)
               .fill('#764ba2');

            doc.fillColor('#FFFFFF')
               .text('POLIZAS ELIMINADAS', 225, yPos + 10)
               .fontSize(20)
               .text(monthlyStats.totalPoliciesDeleted.toString(), 225, yPos + 30);

            doc.fontSize(14)
               .fillColor('#FFFFFF')
               .rect(390, yPos, 150, 60)
               .fill('#f093fb');

            doc.fillColor('#FFFFFF')
               .text('CAMBIO NETO', 395, yPos + 10)
               .fontSize(12)
               .text('(Creadas - Eliminadas)', 395, yPos + 22)
               .fontSize(20)
               .text(monthlyStats.netPolicyChange.toString(), 395, yPos + 35);

            doc.fontSize(14)
               .fillColor('#FFFFFF')
               .rect(560, yPos, 150, 60)
               .fill('#4facfe');

            doc.fillColor('#FFFFFF')
               .text('TASA RETENCION', 565, yPos + 10)
               .fontSize(12)
               .text('(No eliminadas)', 565, yPos + 22)
               .fontSize(20)
               .text(`${patterns.retentionRate}%`, 565, yPos + 35);

            yPos += 80;

            // ANÁLISIS POR DÍA (Sección principal)  
            doc.fontSize(18)
               .fillColor('#00D2FF')
               .text('ANALISIS DIARIO DETALLADO', 50, yPos);

            yPos += 35;

            // Encabezados de tabla
            doc.fontSize(10)
               .fillColor('#333333');

            const colWidths = [40, 60, 60, 60, 80, 120, 200];
            const headers = ['DIA', 'CREADAS', 'ELIMINADAS', 'NETO', 'SERVICIOS', 'TOP ASEGURADORA', 'MOTIVOS ELIMINACION'];
            
            let xPos = 50;
            headers.forEach((header, i) => {
                doc.rect(xPos, yPos, colWidths[i], 25)
                   .fill('#e6f3ff');
                
                doc.fillColor('#333333')
                   .text(header, xPos + 5, yPos + 8);
                
                xPos += colWidths[i];
            });

            yPos += 25;

            // Datos por día - Solo mostrar días con actividad para evitar páginas vacías
            const activeDays = dailyAnalysis.filter(day => 
                day.policiesCreated > 0 || day.policiesDeleted > 0 || day.servicesRegistered > 0
            );

            if (activeDays.length === 0) {
                doc.fontSize(12)
                   .fillColor('#666666')
                   .text('No hay actividad registrada en este período', 50, yPos + 40);
                yPos += 60;
            } else {
                activeDays.forEach((day, index) => {
                    if (yPos > 480) { // Nueva página si es necesario
                        doc.addPage();
                        yPos = 50;
                        
                        // Repetir encabezados en nueva página
                        doc.fontSize(18)
                           .fillColor('#00D2FF')
                           .text('ANALISIS DIARIO DETALLADO (Continuación)', 50, yPos);
                        yPos += 30;
                        
                        // Encabezados de tabla
                        xPos = 50;
                        headers.forEach((header, i) => {
                            doc.rect(xPos, yPos, colWidths[i], 25)
                               .fill('#e6f3ff');
                            
                            doc.fillColor('#333333')
                               .fontSize(10)
                               .text(header, xPos + 5, yPos + 8);
                            
                            xPos += colWidths[i];
                        });
                        yPos += 25;
                    }

                    // Color alternado para filas
                    const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
                    
                    xPos = 50;
                    headers.forEach((_, i) => {
                        doc.rect(xPos, yPos, colWidths[i], 18)
                           .fill(bgColor);
                        xPos += colWidths[i];
                    });

                    // Datos
                    xPos = 50;
                    doc.fillColor('#333333')
                       .fontSize(9);

                    // Día
                    doc.text(day.day.toString(), xPos + 5, yPos + 5);
                    xPos += colWidths[0];

                    // Pólizas creadas
                    doc.text(day.policiesCreated.toString(), xPos + 5, yPos + 5);
                    xPos += colWidths[1];

                    // Pólizas eliminadas
                    doc.text(day.policiesDeleted.toString(), xPos + 5, yPos + 5);
                    xPos += colWidths[2];

                    // Cambio neto
                    const netChange = day.netPolicyChange;
                    doc.fillColor(netChange >= 0 ? '#28a745' : '#dc3545')
                       .text(netChange > 0 ? `+${netChange}` : netChange.toString(), xPos + 5, yPos + 5);
                    xPos += colWidths[3];

                    // Servicios
                    doc.fillColor('#333333')
                       .text(day.servicesRegistered.toString(), xPos + 5, yPos + 5);
                    xPos += colWidths[4];

                    // Top aseguradora
                    const topInsurer = day.insurerRanking[0] || ['N/A', 0];
                    const insurerText = topInsurer[0].length > 15 ? 
                        topInsurer[0].substring(0, 12) + '...' : topInsurer[0];
                    doc.text(`${insurerText} (${topInsurer[1]})`, xPos + 5, yPos + 5);
                    xPos += colWidths[5];

                    // Motivos de eliminación
                    const reasons = day.topDeletionReasons.map(r => `${r[0]}(${r[1]})`).join(', ');
                    const reasonsText = reasons.length > 25 ? reasons.substring(0, 22) + '...' : reasons;
                    doc.text(reasonsText || 'N/A', xPos + 5, yPos + 5);

                    yPos += 18;
                });
            }

            // NUEVA PÁGINA PARA ANÁLISIS ADICIONAL
            doc.addPage();
            yPos = 50;

            // ANÁLISIS DE PATRONES
            doc.fontSize(18)
               .fillColor('#00D2FF')
               .text('ANALISIS DE PATRONES Y TENDENCIAS', 50, yPos);

            yPos += 40;

            // Días de la semana más activos
            doc.fontSize(14)
               .fillColor('#333333')
               .text('ACTIVIDAD POR DIA DE LA SEMANA:', 50, yPos);

            yPos += 25;

            patterns.mostActiveWeekdays.slice(0, 5).forEach((weekday, index) => {
                doc.fontSize(11)
                   .fillColor('#666666')
                   .text(`${index + 1}. ${weekday.name}: ${weekday.avgPolicies} polizas/dia promedio`, 70, yPos);
                yPos += 18;
            });

            yPos += 20;

            // Tendencia de crecimiento
            doc.fontSize(14)
               .fillColor('#333333')
               .text('TENDENCIA DE CRECIMIENTO:', 50, yPos);

            yPos += 25;

            const trendColor = patterns.growthTrend.trend === 'CRECIENTE' ? '#28a745' : 
                              patterns.growthTrend.trend === 'DECRECIENTE' ? '#dc3545' : '#ffc107';
            
            doc.fontSize(12)
               .fillColor(trendColor)
               .text(`${patterns.growthTrend.trend} (pendiente: ${patterns.growthTrend.slope})`, 70, yPos);

            yPos += 40;

            // ANÁLISIS POR ASEGURADORA
            doc.fontSize(14)
               .fillColor('#333333')
               .text('TOP 5 ASEGURADORAS DEL MES:', 50, yPos);

            yPos += 25;

            executiveData.insurerAnalysis.slice(0, 5).forEach((insurer, index) => {
                doc.fontSize(10)
                   .fillColor('#666666')
                   .text(`${index + 1}. ${insurer.name}:`, 70, yPos)
                   .text(`Creadas: ${insurer.policiesCreated} | Eliminadas: ${insurer.policiesDeleted} | Retención: ${insurer.retentionRate}%`, 70, yPos + 12);
                yPos += 30;
            });

            // PIE DE PÁGINA
            doc.fontSize(8)
               .fillColor('#666666')
               .text(`Generado el ${new Date().toLocaleString('es-MX')} | Sistema de Gestion de Polizas IA`, 50, 520)
               .text('Generated with Claude Code | Co-Authored-By: Claude <noreply@anthropic.com>', 400, 520);

            return doc;

        } catch (error) {
            logger.error('Error generando PDF ejecutivo diario:', error);
            throw error;
        }
    }

    /**
     * Genera gráfica de distribución diaria de pólizas con Chart.js
     */
    static async generateDailyDistributionChart(executiveData) {
        try {
            const ChartGenerator = require('../utils/chartGenerator');
            
            // Preparar datos para la gráfica
            const { dailyAnalysis } = executiveData;
            
            // Crear arrays de datos ordenados por día
            const labels = [];
            const createdData = [];
            const deletedData = [];
            
            // Determinar el rango de días del mes actual
            const maxDay = Math.max(...dailyAnalysis.map(d => d.day), 30);
            
            // Asegurar que tenemos datos para todos los días del mes
            for (let day = 1; day <= maxDay; day++) {
                const dayData = dailyAnalysis.find(d => d.day === day) || {
                    day,
                    policiesCreated: 0,
                    policiesDeleted: 0
                };
                
                labels.push(`${day}`);
                createdData.push(dayData.policiesCreated);
                deletedData.push(dayData.policiesDeleted);
            }

            // Configuración de la gráfica
            const chartConfig = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Pólizas Creadas',
                            data: createdData,
                            backgroundColor: '#00D2FF',
                            borderColor: '#0099CC',
                            borderWidth: 1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Pólizas Eliminadas',
                            data: deletedData,
                            backgroundColor: '#FF9500',
                            borderColor: '#FF8C00',
                            borderWidth: 1,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'DISTRIBUCIÓN DIARIA DE PÓLIZAS',
                            font: {
                                size: 18,
                                weight: 'bold'
                            },
                            color: '#333333'
                        },
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: {
                                    size: 12
                                },
                                color: '#333333'
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Días del Mes',
                                font: {
                                    size: 14,
                                    weight: 'bold'
                                },
                                color: '#333333'
                            },
                            ticks: {
                                font: {
                                    size: 10
                                },
                                color: '#666666',
                                maxRotation: 45
                            },
                            grid: {
                                color: '#E5E5E5'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Número de Pólizas',
                                font: {
                                    size: 14,
                                    weight: 'bold'
                                },
                                color: '#333333'
                            },
                            ticks: {
                                font: {
                                    size: 12
                                },
                                color: '#666666',
                                beginAtZero: true
                            },
                            grid: {
                                color: '#E5E5E5'
                            }
                        }
                    },
                    elements: {
                        bar: {
                            borderRadius: 2
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            };

            // Generar la gráfica (tamaño más compacto para PDF)
            const chartBuffer = await ChartGenerator.generateChart(chartConfig, 900, 300);
            
            logger.info('Gráfica de distribución diaria generada exitosamente', {
                totalDays: dailyAnalysis.length,
                maxCreated: Math.max(...createdData),
                maxDeleted: Math.max(...deletedData)
            });

            return chartBuffer;

        } catch (error) {
            logger.error('Error generando gráfica de distribución diaria:', error);
            return null; // Continuar sin gráfica si hay error
        }
    }
}

module.exports = ReportsHandlerV2;
