"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const policy_1 = __importDefault(require("../../models/policy"));
const auditLogger_1 = require("../utils/auditLogger");
const logger_1 = __importDefault(require("../../utils/logger"));
class ReportsHandlerV2 {
    static async getComprehensiveMonthlyDataV2(startDate, endDate) {
        try {
            logger_1.default.info('Iniciando análisis V2 de ciclo de vida completo', {
                startDate,
                endDate
            });
            const sixMonthsBeforeStart = new Date(startDate);
            sixMonthsBeforeStart.setMonth(sixMonthsBeforeStart.getMonth() - 6);
            const relevantPolicies = await policy_1.default.find({
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
            });
            const totalPoliciesAnalyzed = relevantPolicies.length;
            const policyAnalysis = {
                newPoliciesInMonth: relevantPolicies.filter(p => p.fechaEmision >= startDate && p.fechaEmision <= endDate).length,
                previousPoliciesWithActivity: relevantPolicies.filter(p => p.fechaEmision < startDate).length,
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
                if (monthsDiff === 0)
                    policyAnalysis.byAge.month0++;
                else if (monthsDiff === 1)
                    policyAnalysis.byAge.month1++;
                else if (monthsDiff === 2)
                    policyAnalysis.byAge.month2++;
                else if (monthsDiff === 3)
                    policyAnalysis.byAge.month3++;
                else if (monthsDiff === 4)
                    policyAnalysis.byAge.month4++;
                else if (monthsDiff === 5)
                    policyAnalysis.byAge.month5++;
                else
                    policyAnalysis.byAge.month6Plus++;
            });
            let totalServices = 0;
            let totalRevenue = 0;
            let totalRating = 0;
            let ratingCount = 0;
            let activePolicies = 0;
            let expiredPolicies = 0;
            const insurerStats = new Map();
            const serviceStats = new Map();
            const dailyStats = new Map();
            relevantPolicies.forEach(policy => {
                const servicesInPeriod = policy.servicios?.filter(s => s.fechaServicio >= startDate && s.fechaServicio <= endDate) || [];
                totalServices += servicesInPeriod.length;
                const paymentsInPeriod = policy.pagos?.filter(p => p.fechaPago >= startDate && p.fechaPago <= endDate) || [];
                const policyRevenue = paymentsInPeriod.reduce((sum, payment) => sum + payment.monto, 0);
                totalRevenue += policyRevenue;
                if (policy.calificacion && policy.calificacion > 0) {
                    totalRating += policy.calificacion;
                    ratingCount++;
                }
                if (this.isPolicyActive(policy)) {
                    activePolicies++;
                }
                else {
                    expiredPolicies++;
                }
                const insurerName = policy.aseguradora || 'Sin aseguradora';
                insurerStats.set(insurerName, (insurerStats.get(insurerName) || 0) + 1);
                servicesInPeriod.forEach(service => {
                    const serviceType = service.tipoServicio || 'Sin tipo';
                    serviceStats.set(serviceType, (serviceStats.get(serviceType) || 0) + 1);
                });
                servicesInPeriod.forEach(service => {
                    const dateKey = service.fechaServicio.toISOString().split('T')[0];
                    const dayStats = dailyStats.get(dateKey) || { policies: 0, services: 0, revenue: 0 };
                    dayStats.services++;
                    dayStats.revenue += service.costo || 0;
                    dailyStats.set(dateKey, dayStats);
                });
            });
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
            const comprehensiveData = {
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
            logger_1.default.info('Análisis V2 completado', {
                totalPolicies: totalPoliciesAnalyzed,
                totalServices,
                totalRevenue,
                averageRating
            });
            return comprehensiveData;
        }
        catch (error) {
            logger_1.default.error('Error en análisis V2:', error);
            throw new Error('Error al obtener datos comprensivos: ' + error.message);
        }
    }
    static getMonthsDifference(date1, date2) {
        const yearDiff = date2.getFullYear() - date1.getFullYear();
        const monthDiff = date2.getMonth() - date1.getMonth();
        return yearDiff * 12 + monthDiff;
    }
    static isPolicyActive(policy) {
        const today = new Date();
        if (policy.fechaFinCobertura) {
            const endDate = new Date(policy.fechaFinCobertura);
            if (endDate > today) {
                return true;
            }
            if (policy.fechaFinGracia) {
                const graceDate = new Date(policy.fechaFinGracia);
                return graceDate > today;
            }
        }
        return policy.estadoPoliza === 'ACTIVA' || policy.estado === 'ACTIVO';
    }
    static async generatePDFReport(data, period) {
        return new Promise((resolve, reject) => {
            try {
                const mockBuffer = Buffer.from('PDF Report Mock Data');
                resolve(mockBuffer);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    static async handleAction(ctx, action) {
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
        }
        catch (error) {
            logger_1.default.error('Error en ReportsHandlerV2:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }
    static async handleComprehensiveAnalysis(ctx) {
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
            await auditLogger_1.AuditLogger.log(ctx, 'comprehensive_analysis_v2', {
                module: 'reports',
                metadata: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    totalPolicies: data.totalPolicies,
                    totalServices: data.totalServices
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error en análisis comprensivo:', error);
            await ctx.reply('❌ Error al generar análisis comprensivo.');
        }
    }
    static async handleLifecycleAnalysis(ctx) {
        await ctx.reply('Análisis de ciclo de vida en desarrollo.');
    }
    static async handleTrendAnalysis(ctx) {
        await ctx.reply('Análisis de tendencias en desarrollo.');
    }
}
exports.default = ReportsHandlerV2;
