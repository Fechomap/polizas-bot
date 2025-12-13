import { Context } from 'telegraf';
import { Markup } from 'telegraf';
// Policy import removed - reports now use ReportsHandlerV2 which uses Prisma
import { AuditLogger } from '../utils/auditLogger';
import AdminMenu from '../menus/adminMenu';
import logger from '../../utils/logger';
// import PDFDocument from 'pdfkit';
import ChartGenerator from '../utils/chartGenerator';
import ReportsHandlerV2 from './reportsHandlerV2';

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

class ReportsHandler {
    static async handleAction(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'menu':
                    return await AdminMenu.showReportsMenu(ctx);

                case 'monthly':
                    return await this.handleMonthlyReport(ctx);

                case 'weekly':
                    return await this.handleWeeklyReport(ctx);

                case 'custom':
                    return await this.handleCustomReport(ctx);

                case 'executive':
                    return await this.handleExecutiveReport(ctx);

                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en ReportsHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    static async handleMonthlyReport(ctx: Context): Promise<void> {
        try {
            const menuText = `
📈 *REPORTE MENSUAL PROFESIONAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selecciona el período para generar el reporte:

📅 *Mes Actual* - ${this.formatMonth(new Date())}
📋 *Mes Anterior* - ${this.formatMonth(this.getPreviousMonth())}
📊 *Seleccionar Mes* - Elegir mes específico
📈 *Comparativo 6M* - Análisis comparativo detallado

¿Qué período deseas analizar?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('📅 Mes Actual', 'admin_reports_monthly_current'),
                    Markup.button.callback('📋 Mes Anterior', 'admin_reports_monthly_previous')
                ],
                [
                    Markup.button.callback('📊 Seleccionar Mes', 'admin_reports_monthly_select'),
                    Markup.button.callback('📈 Comparativo 6M', 'admin_reports_monthly_comparative')
                ],
                [Markup.button.callback('⬅️ Volver', 'admin_reports_menu')]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar opciones mensuales:', error);
            await ctx.reply('❌ Error al mostrar opciones de reporte mensual.');
        }
    }

    static async generateMonthlyReportForPeriod(
        ctx: Context,
        startDate: Date,
        endDate: Date,
        period: string
    ): Promise<void> {
        try {
            await ctx.answerCbQuery('Generando reporte empresarial...');

            const loadingMessage = await ctx.editMessageText(
                '📊 *GENERANDO REPORTE EMPRESARIAL*\n' +
                    `📅 Período: ${period}\n\n` +
                    '⏳ Extrayendo datos de MongoDB...'
            );

            const reportData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(
                startDate,
                endDate
            );

            // Update loading message
            await ctx.editMessageText(
                '📊 *GENERANDO REPORTE EMPRESARIAL*\n' +
                    `📅 Período: ${period}\n\n` +
                    '📈 Generando gráficos y estadísticas...'
            );

            // Generate report summary
            const summaryText = this.generateReportSummary(reportData, period);

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'monthly_report_generated', {
                module: 'reports',
                metadata: {
                    period,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }
            });
        } catch (error) {
            logger.error('Error al generar reporte mensual:', error);
            await ctx.reply('❌ Error al generar el reporte mensual.');
        }
    }

    static formatMonth(date: Date): string {
        const months = [
            'Enero',
            'Febrero',
            'Marzo',
            'Abril',
            'Mayo',
            'Junio',
            'Julio',
            'Agosto',
            'Septiembre',
            'Octubre',
            'Noviembre',
            'Diciembre'
        ];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    static getPreviousMonth(): Date {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        return date;
    }

    static generateReportSummary(reportData: IReportData, period: string): string {
        return `
📊 *REPORTE EMPRESARIAL COMPLETO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 **Período:** ${period}

📈 **MÉTRICAS PRINCIPALES**
• Total Pólizas: ${reportData.totalPolicies}
• Pólizas Activas: ${reportData.activePolicies}
• Pólizas Vencidas: ${reportData.expiredPolicies}
• Total Servicios: ${reportData.totalServices}
• Ingresos Mensuales: $${reportData.monthlyRevenue.toLocaleString()}
• Calificación Promedio: ${reportData.averageRating.toFixed(1)}/5

🏢 **PRINCIPALES ASEGURADORAS**
${reportData.topInsurers.map(insurer => `• ${insurer.name}: ${insurer.count} (${insurer.percentage.toFixed(1)}%)`).join('\n')}

⚙️ **DISTRIBUCIÓN DE SERVICIOS**
${reportData.serviceDistribution.map(service => `• ${service.type}: ${service.count} (${service.percentage.toFixed(1)}%)`).join('\n')}

📋 Reporte generado el ${new Date().toLocaleString('es-ES')}
        `.trim();
    }

    static async showMonthSelection(ctx: Context, type?: string): Promise<void> {
        try {
            const currentDate = new Date();
            const months = [
                'Enero',
                'Febrero',
                'Marzo',
                'Abril',
                'Mayo',
                'Junio',
                'Julio',
                'Agosto',
                'Septiembre',
                'Octubre',
                'Noviembre',
                'Diciembre'
            ];

            let menuText = `
📅 *SELECCIONAR MES*
━━━━━━━━━━━━━━━━━━━━━━

Selecciona el mes para generar el reporte:

**Año ${currentDate.getFullYear()}:**
`;

            const buttons: any[] = [];
            const currentMonth = currentDate.getMonth();

            // Show months up to current month
            for (let i = 0; i <= currentMonth; i++) {
                const buttonText = `${months[i]} ${currentDate.getFullYear()}`;
                const callbackData = `admin_reports_month_${i}_${currentDate.getFullYear()}`;
                buttons.push([Markup.button.callback(buttonText, callbackData)]);
            }

            // Add previous year months
            if (currentMonth < 11) {
                menuText += `\n**Año ${currentDate.getFullYear() - 1}:**\n`;
                for (let i = currentMonth + 1; i <= 11; i++) {
                    const buttonText = `${months[i]} ${currentDate.getFullYear() - 1}`;
                    const callbackData = `admin_reports_month_${i}_${currentDate.getFullYear() - 1}`;
                    buttons.push([Markup.button.callback(buttonText, callbackData)]);
                }
            }

            buttons.push([Markup.button.callback('⬅️ Volver', 'admin_reports_monthly')]);

            const keyboard = Markup.inlineKeyboard(buttons);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar selección de mes:', error);
            await ctx.reply('❌ Error al mostrar selección de mes.');
        }
    }

    static async generateComparativeReport(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery('Generando reporte comparativo...');

            const loadingMessage = await ctx.editMessageText(
                '📈 *GENERANDO REPORTE COMPARATIVO*\n\n' + '⏳ Analizando últimos 6 meses...'
            );

            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 6);

            const reportData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(
                startDate,
                endDate
            );

            const summaryText = `
📈 *REPORTE COMPARATIVO 6 MESES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 **Período:** Últimos 6 meses

📊 **EVOLUCIÓN MENSUAL**
• Promedio Pólizas/Mes: ${Math.round(reportData.totalPolicies / 6)}
• Promedio Servicios/Mes: ${Math.round(reportData.totalServices / 6)}
• Ingresos Promedio: $${Math.round(reportData.monthlyRevenue / 6).toLocaleString()}

📈 **TENDENCIAS**
• Crecimiento Pólizas: +${((reportData.activePolicies / reportData.totalPolicies) * 100).toFixed(1)}%
• Retención Clientes: ${((reportData.activePolicies / (reportData.activePolicies + reportData.expiredPolicies)) * 100).toFixed(1)}%
• Satisfacción: ${reportData.averageRating.toFixed(1)}/5

🏆 **LOGROS DESTACADOS**
• Total Servicios Completados: ${reportData.totalServices}
• Pólizas Gestionadas: ${reportData.totalPolicies}
• Aseguradoras Activas: ${reportData.topInsurers.length}

📋 Reporte generado el ${new Date().toLocaleString('es-ES')}
            `.trim();

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'comparative_report_generated', {
                module: 'reports',
                metadata: {
                    period: 'last_6_months',
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }
            });
        } catch (error) {
            logger.error('Error al generar reporte comparativo:', error);
            await ctx.reply('❌ Error al generar el reporte comparativo.');
        }
    }

    static async generateCurrentWeekReport(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery('Generando reporte semanal...');

            const today = new Date();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);

            const reportData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(
                startOfWeek,
                endOfWeek
            );

            const summaryText = `
📊 *REPORTE SEMANAL ACTUAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 **Semana:** ${startOfWeek.toLocaleDateString('es-ES')} - ${endOfWeek.toLocaleDateString('es-ES')}

📈 **MÉTRICAS SEMANALES**
• Pólizas Nuevas: ${reportData.totalPolicies}
• Servicios Completados: ${reportData.totalServices}
• Pólizas Activas: ${reportData.activePolicies}
• Pólizas Vencidas: ${reportData.expiredPolicies}
• Ingresos Generados: $${reportData.monthlyRevenue.toLocaleString()}

📋 Reporte generado el ${new Date().toLocaleString('es-ES')}
            `.trim();

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'weekly_report_generated', {
                module: 'reports',
                metadata: {
                    period: 'current_week',
                    startDate: startOfWeek.toISOString(),
                    endDate: endOfWeek.toISOString()
                }
            });
        } catch (error) {
            logger.error('Error al generar reporte semanal:', error);
            await ctx.reply('❌ Error al generar el reporte semanal.');
        }
    }

    static async generateLastWeekReport(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery('Generando reporte de semana pasada...');

            const today = new Date();
            const startOfLastWeek = new Date(today);
            startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);

            const reportData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(
                startOfLastWeek,
                endOfLastWeek
            );

            const summaryText = `
📊 *REPORTE SEMANA PASADA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 **Semana:** ${startOfLastWeek.toLocaleDateString('es-ES')} - ${endOfLastWeek.toLocaleDateString('es-ES')}

📈 **MÉTRICAS SEMANALES**
• Pólizas Nuevas: ${reportData.totalPolicies}
• Servicios Completados: ${reportData.totalServices}
• Pólizas Activas: ${reportData.activePolicies}
• Pólizas Vencidas: ${reportData.expiredPolicies}
• Ingresos Generados: $${reportData.monthlyRevenue.toLocaleString()}

📋 Reporte generado el ${new Date().toLocaleString('es-ES')}
            `.trim();

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'last_week_report_generated', {
                module: 'reports',
                metadata: {
                    period: 'last_week',
                    startDate: startOfLastWeek.toISOString(),
                    endDate: endOfLastWeek.toISOString()
                }
            });
        } catch (error) {
            logger.error('Error al generar reporte de semana pasada:', error);
            await ctx.reply('❌ Error al generar el reporte de semana pasada.');
        }
    }

    static async generateWeeklyComparison(ctx: Context): Promise<void> {
        try {
            await ctx.answerCbQuery('Generando comparación semanal...');

            const today = new Date();

            // Current week
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);

            // Last week
            const startOfLastWeek = new Date(today);
            startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);

            const [currentWeekData, lastWeekData] = await Promise.all([
                ReportsHandlerV2.getComprehensiveMonthlyDataV2(startOfWeek, endOfWeek),
                ReportsHandlerV2.getComprehensiveMonthlyDataV2(startOfLastWeek, endOfLastWeek)
            ]);

            const policiesChange = currentWeekData.totalPolicies - lastWeekData.totalPolicies;
            const servicesChange = currentWeekData.totalServices - lastWeekData.totalServices;
            const revenueChange = currentWeekData.monthlyRevenue - lastWeekData.monthlyRevenue;

            const summaryText = `
📊 *COMPARACIÓN SEMANAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 **Semana Actual:** ${startOfWeek.toLocaleDateString('es-ES')} - ${endOfWeek.toLocaleDateString('es-ES')}
📅 **Semana Pasada:** ${startOfLastWeek.toLocaleDateString('es-ES')} - ${endOfLastWeek.toLocaleDateString('es-ES')}

📈 **COMPARACIÓN**
• Pólizas: ${currentWeekData.totalPolicies} vs ${lastWeekData.totalPolicies} (${policiesChange >= 0 ? '+' : ''}${policiesChange})
• Servicios: ${currentWeekData.totalServices} vs ${lastWeekData.totalServices} (${servicesChange >= 0 ? '+' : ''}${servicesChange})
• Ingresos: $${currentWeekData.monthlyRevenue.toLocaleString()} vs $${lastWeekData.monthlyRevenue.toLocaleString()} (${revenueChange >= 0 ? '+' : ''}$${revenueChange.toLocaleString()})

📊 **TENDENCIA**
• Pólizas: ${policiesChange >= 0 ? '📈 Crecimiento' : '📉 Descenso'}
• Servicios: ${servicesChange >= 0 ? '📈 Crecimiento' : '📉 Descenso'}
• Ingresos: ${revenueChange >= 0 ? '📈 Crecimiento' : '📉 Descenso'}

📋 Reporte generado el ${new Date().toLocaleString('es-ES')}
            `.trim();

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'weekly_comparison_generated', {
                module: 'reports',
                metadata: {
                    period: 'weekly_comparison',
                    currentWeekStart: startOfWeek.toISOString(),
                    currentWeekEnd: endOfWeek.toISOString(),
                    lastWeekStart: startOfLastWeek.toISOString(),
                    lastWeekEnd: endOfLastWeek.toISOString()
                }
            });
        } catch (error) {
            logger.error('Error al generar comparación semanal:', error);
            await ctx.reply('❌ Error al generar la comparación semanal.');
        }
    }

    static async generateExecutiveReportForPeriod(
        ctx: Context,
        startDate: Date,
        endDate: Date,
        period: string
    ): Promise<void> {
        try {
            await ctx.answerCbQuery('Generando reporte ejecutivo...');

            const reportData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(
                startDate,
                endDate
            );

            const summaryText = `
🎯 *REPORTE EJECUTIVO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 **Período:** ${period}

🏆 **RESUMEN EJECUTIVO**
• Total Pólizas Gestionadas: ${reportData.totalPolicies}
• Retención de Clientes: ${((reportData.activePolicies / reportData.totalPolicies) * 100).toFixed(1)}%
• Servicios Completados: ${reportData.totalServices}
• Ingresos Generados: $${reportData.monthlyRevenue.toLocaleString()}
• Satisfacción Promedio: ${reportData.averageRating.toFixed(1)}/5

🎯 **INDICADORES CLAVE**
• Eficiencia Operativa: ${((reportData.totalServices / reportData.totalPolicies) * 100).toFixed(1)}%
• Diversificación: ${reportData.topInsurers.length} aseguradoras activas
• Crecimiento: +${((reportData.activePolicies / reportData.totalPolicies) * 100).toFixed(1)}% pólizas activas

📋 Reporte ejecutivo generado el ${new Date().toLocaleString('es-ES')}
            `.trim();

            await ctx.editMessageText(summaryText, {
                parse_mode: 'Markdown'
            });

            await AuditLogger.log(ctx, 'executive_report_generated', {
                module: 'reports',
                metadata: {
                    period,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }
            });
        } catch (error) {
            logger.error('Error al generar reporte ejecutivo:', error);
            await ctx.reply('❌ Error al generar el reporte ejecutivo.');
        }
    }

    // Placeholder methods for missing functionality
    static async handleWeeklyReport(ctx: Context): Promise<void> {
        try {
            const menuText = `
📊 *REPORTES SEMANALES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selecciona el tipo de reporte semanal:

📅 *Semana Actual* - Datos de la semana en curso
📋 *Semana Pasada* - Datos de la semana anterior
📈 *Comparación* - Comparar semana actual vs anterior

¿Qué reporte deseas generar?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📅 Semana Actual', 'admin_reports_weekly_current')],
                [Markup.button.callback('📋 Semana Pasada', 'admin_reports_weekly_previous')],
                [Markup.button.callback('📈 Comparación', 'admin_reports_weekly_comparison')],
                [Markup.button.callback('⬅️ Volver', 'admin_reports_menu')]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar reportes semanales:', error);
            await ctx.reply('❌ Error al mostrar opciones de reportes semanales.');
        }
    }

    static async handleCustomReport(ctx: Context): Promise<void> {
        await ctx.reply('Funcionalidad de reportes personalizados en desarrollo.');
    }

    static async handleExecutiveReport(ctx: Context): Promise<void> {
        try {
            const menuText = `
🎯 *REPORTE EJECUTIVO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selecciona el período para el reporte ejecutivo:

📅 *Mes Actual* - Resumen ejecutivo del mes
📋 *Trimestre* - Análisis trimestral
📈 *Semestre* - Perspectiva semestral
🏆 *Año Completo* - Reporte anual ejecutivo

¿Qué período deseas analizar?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📅 Mes Actual', 'admin_reports_executive_month')],
                [Markup.button.callback('📋 Trimestre', 'admin_reports_executive_quarter')],
                [Markup.button.callback('📈 Semestre', 'admin_reports_executive_semester')],
                [Markup.button.callback('🏆 Año Completo', 'admin_reports_executive_year')],
                [Markup.button.callback('⬅️ Volver', 'admin_reports_menu')]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar opciones ejecutivas:', error);
            await ctx.reply('❌ Error al mostrar opciones de reporte ejecutivo.');
        }
    }
}

export default ReportsHandler;
