const { Markup } = require('telegraf');
const Policy = require('../../models/policy');
const { AuditLogger } = require('../utils/auditLogger');
const AdminMenu = require('../menus/adminMenu');
const logger = require('../../utils/logger');
const PDFDocument = require('pdfkit');
const ChartGenerator = require('../utils/chartGenerator');
const ReportsHandlerV2 = require('./reportsHandlerV2');

class ReportsHandler {
    /**
     * Maneja las acciones relacionadas con reportes
     */
    static async handleAction(ctx, action) {
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

    /**
     * Genera reporte mensual con selección de período
     */
    static async handleMonthlyReport(ctx) {
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
                [
                    Markup.button.callback('⬅️ Volver', 'admin_reports_menu')
                ]
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

    /**
     * Genera reporte mensual completo con datos específicos
     */
    static async generateMonthlyReportForPeriod(ctx, startDate, endDate, period) {
        try {
            await ctx.answerCbQuery('Generando reporte empresarial...');

            const loadingMessage = await ctx.editMessageText(
                '📊 *GENERANDO REPORTE EMPRESARIAL*\n' +
                `📅 Período: ${period}\n\n` +
                '⏳ Extrayendo datos de MongoDB...'
            );

            // Obtener datos empresariales reales CON CICLO DE VIDA COMPLETO
            const reportData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(startDate, endDate);

            // Debug: verificar datos antes de generar PDF
            logger.info('Datos obtenidos para reporte mensual:', {
                totalPolicies: reportData?.totalPolicies,
                totalServices: reportData?.totalServices,
                hasFinancialData: !!reportData?.financialSummary,
                aseguradorasCount: reportData?.aseguradoraAnalysis?.length || 0
            });

            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loadingMessage.message_id,
                undefined,
                '📊 *GENERANDO REPORTE EMPRESARIAL*\n' +
                `📅 Período: ${period}\n\n` +
                `📈 Procesando ${reportData.totalPolicies} pólizas...\n` +
                `🔄 Analizando ${reportData.totalServices} servicios...`
            );

            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loadingMessage.message_id,
                undefined,
                '📊 *GENERANDO REPORTE EMPRESARIAL*\n' +
                `📅 Período: ${period}\n\n` +
                '💰 Calculando análisis financiero...\n' +
                '📊 Generando métricas de rendimiento...'
            );

            // Generar PDF profesional horizontal
            const pdfBuffer = await this.generateProfessionalMonthlyPDF(ctx, reportData, period);

            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loadingMessage.message_id,
                undefined,
                '📊 *GENERANDO REPORTE EMPRESARIAL*\n' +
                `📅 Período: ${period}\n\n` +
                '✅ Finalizando reporte...'
            );

            // Enviar PDF
            const filename = `reporte_empresarial_${startDate.getFullYear()}_${(startDate.getMonth() + 1).toString().padStart(2, '0')}.pdf`;
            await ctx.replyWithDocument({
                source: pdfBuffer,
                filename
            }, {
                caption: this.generateEnterpriseReportSummary(reportData, period),
                parse_mode: 'Markdown'
            });

            // Volver al menú
            await AdminMenu.showReportsMenu(ctx);

            await AuditLogger.log(ctx, 'enterprise_monthly_report_generated', 'reports', {
                period,
                totalPolicies: reportData.totalPolicies,
                totalServices: reportData.totalServices,
                totalRevenue: reportData.financialSummary.totalRevenue,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });

        } catch (error) {
            logger.error('Error al generar reporte mensual empresarial:', error);
            await ctx.reply('❌ Error al generar el reporte. Intenta nuevamente.');
        }
    }

    /**
     * Obtiene datos comprensivos del período con análisis financiero
     */
    static async getComprehensiveMonthlyData(startDate, endDate) {
        try {
            logger.info('Iniciando extracción de datos comprensivos', { startDate, endDate });

            // 1. RESUMEN GENERAL
            const totalPolicies = await Policy.countDocuments({
                fechaEmision: { $gte: startDate, $lte: endDate },
                estado: { $ne: 'ELIMINADO' }
            });

            // 2. ANÁLISIS POR ASEGURADORA CON MÉTRICAS FINANCIERAS
            const aseguradoraAnalysis = await Policy.aggregate([
                {
                    $match: {
                        fechaEmision: { $gte: startDate, $lte: endDate },
                        estado: { $ne: 'ELIMINADO' }
                    }
                },
                {
                    $group: {
                        _id: '$aseguradora',
                        totalPolicies: { $sum: 1 },
                        totalPayments: { $sum: { $size: { $ifNull: ['$pagos', []] } } },
                        totalPaymentAmount: {
                            $sum: {
                                $reduce: {
                                    input: { $ifNull: ['$pagos', []] },
                                    initialValue: 0,
                                    in: { $add: ['$$value', '$$this.monto'] }
                                }
                            }
                        },
                        totalServices: { $sum: { $size: { $ifNull: ['$servicios', []] } } },
                        totalServiceCost: {
                            $sum: {
                                $reduce: {
                                    input: { $ifNull: ['$servicios', []] },
                                    initialValue: 0,
                                    in: { $add: ['$$value', { $ifNull: ['$$this.costo', 0] }] }
                                }
                            }
                        },
                        policiesWithServices: {
                            $sum: {
                                $cond: [
                                    { $gt: [{ $size: { $ifNull: ['$servicios', []] } }, 0] },
                                    1,
                                    0
                                ]
                            }
                        },
                        policiesWithoutServices: {
                            $sum: {
                                $cond: [
                                    { $eq: [{ $size: { $ifNull: ['$servicios', []] } }, 0] },
                                    1,
                                    0
                                ]
                            }
                        },
                        expiredPolicies: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$estadoPoliza', 'VENCIDA'] },
                                    1,
                                    0
                                ]
                            }
                        },
                        activePolicies: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$estadoPoliza', 'VIGENTE'] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        serviceUsageRate: {
                            $round: [
                                {
                                    $multiply: [
                                        { $divide: ['$policiesWithServices', '$totalPolicies'] },
                                        100
                                    ]
                                },
                                2
                            ]
                        },
                        averageServiceCost: {
                            $cond: [
                                { $gt: ['$totalServices', 0] },
                                { $divide: ['$totalServiceCost', '$totalServices'] },
                                0
                            ]
                        },
                        roi: {
                            $cond: [
                                { $gt: ['$totalServiceCost', 0] },
                                {
                                    $round: [
                                        {
                                            $multiply: [
                                                {
                                                    $divide: [
                                                        { $subtract: ['$totalPaymentAmount', '$totalServiceCost'] },
                                                        '$totalServiceCost'
                                                    ]
                                                },
                                                100
                                            ]
                                        },
                                        2
                                    ]
                                },
                                0
                            ]
                        }
                    }
                },
                { $sort: { totalPolicies: -1 } }
            ]);

            // 3. ANÁLISIS DIARIO DETALLADO
            const dailyAnalysis = await Policy.aggregate([
                {
                    $match: {
                        fechaEmision: { $gte: startDate, $lte: endDate },
                        estado: { $ne: 'ELIMINADO' }
                    }
                },
                {
                    $group: {
                        _id: {
                            day: { $dayOfMonth: '$fechaEmision' },
                            month: { $month: '$fechaEmision' },
                            year: { $year: '$fechaEmision' }
                        },
                        policiesCount: { $sum: 1 },
                        servicesCount: { $sum: { $size: { $ifNull: ['$servicios', []] } } }
                    }
                },
                {
                    $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
                }
            ]);

            // 4. RESUMEN FINANCIERO
            const financialSummary = await Policy.aggregate([
                {
                    $match: {
                        fechaEmision: { $gte: startDate, $lte: endDate },
                        estado: { $ne: 'ELIMINADO' }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: {
                                $reduce: {
                                    input: { $ifNull: ['$pagos', []] },
                                    initialValue: 0,
                                    in: { $add: ['$$value', '$$this.monto'] }
                                }
                            }
                        },
                        totalCosts: {
                            $sum: {
                                $reduce: {
                                    input: { $ifNull: ['$servicios', []] },
                                    initialValue: 0,
                                    in: { $add: ['$$value', { $ifNull: ['$$this.costo', 0] }] }
                                }
                            }
                        },
                        totalServices: { $sum: { $size: { $ifNull: ['$servicios', []] } } },
                        totalPayments: { $sum: { $size: { $ifNull: ['$pagos', []] } } }
                    }
                },
                {
                    $addFields: {
                        netProfit: { $subtract: ['$totalRevenue', '$totalCosts'] },
                        profitMargin: {
                            $cond: [
                                { $gt: ['$totalRevenue', 0] },
                                {
                                    $round: [
                                        {
                                            $multiply: [
                                                {
                                                    $divide: [
                                                        { $subtract: ['$totalRevenue', '$totalCosts'] },
                                                        '$totalRevenue'
                                                    ]
                                                },
                                                100
                                            ]
                                        },
                                        2
                                    ]
                                },
                                0
                            ]
                        }
                    }
                }
            ]);

            logger.info('Datos extraídos exitosamente', {
                totalPolicies,
                aseguradorasCount: aseguradoraAnalysis.length
            });

            return {
                period: { start: startDate, end: endDate },
                totalPolicies,
                totalServices: financialSummary[0]?.totalServices || 0,
                aseguradoraAnalysis,
                dailyAnalysis,
                financialSummary: financialSummary[0] || {
                    totalRevenue: 0,
                    totalCosts: 0,
                    netProfit: 0,
                    profitMargin: 0,
                    totalServices: 0,
                    totalPayments: 0
                },
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Error obteniendo datos comprensivos:', error);
            throw error;
        }
    }

    /**
     * Genera PDF profesional con gráficas futuristas de IA
     * ACTUALIZADO para manejar análisis de ciclo de vida completo
     */
    static async generateProfessionalMonthlyPDF(ctx, data, period) {
        return new Promise(async (resolve, reject) => {
            try {
                // Debug: Ver estructura de datos
                logger.info('Estructura de datos recibida en PDF:', {
                    hasCtx: !!ctx,
                    hasData: !!data,
                    period: period,
                    totalPolicies: data?.totalPolicies,
                    totalServices: data?.totalServices,
                    hasFinancialSummary: !!data?.financialSummary,
                    financialData: data?.financialSummary ? {
                        totalRevenue: data.financialSummary.totalRevenue,
                        totalRevenueInMonth: data.financialSummary.totalRevenueInMonth
                    } : 'NO DATA',
                    hasAseguradoraAnalysis: !!data?.aseguradoraAnalysis,
                    aseguradorasCount: data?.aseguradoraAnalysis?.length || 0,
                    hasPolicyAnalysis: !!data?.policyAnalysis,
                    hasDailyAnalysis: !!data?.dailyAnalysis,
                    hasServiciosStats: !!data?.serviciosStats
                });
                // FORMATO HORIZONTAL (LANDSCAPE)
                const doc = new PDFDocument({
                    size: 'A4',
                    layout: 'landscape', // FORMATO HORIZONTAL
                    margin: 30
                });
                const chunks = [];

                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // CONFIGURACIÓN DE FUENTES Y ENCODING UTF-8
                doc.registerFont('Arial', 'Helvetica');
                doc.registerFont('Arial-Bold', 'Helvetica-Bold');

                // INICIALIZAR GENERADOR DE GRÁFICAS FUTURISTAS
                const chartGenerator = new ChartGenerator();

                // ===================
                // PÁGINA 1: PORTADA Y RESUMEN EJECUTIVO
                // ===================

                // ENCABEZADO PRINCIPAL
                doc.font('Arial-Bold')
                    .fontSize(28)
                    .fillColor('#1a365d')
                    .text('REPORTE EMPRESARIAL MENSUAL', 50, 50, { align: 'center' });

                doc.font('Arial')
                    .fontSize(16)
                    .fillColor('#2d3748')
                    .text('Sistema Inteligente de Gestión de Pólizas', 50, 85, { align: 'center' });

                doc.font('Arial-Bold')
                    .fontSize(18)
                    .fillColor('#2b6cb0')
                    .text(`Período: ${period}`, 50, 110, { align: 'center' });

                // LÍNEA SEPARADORA
                doc.strokeColor('#e2e8f0')
                    .lineWidth(2)
                    .moveTo(50, 140)
                    .lineTo(792 - 50, 140)
                    .stroke();

                // RESUMEN EJECUTIVO (4 COLUMNAS)
                const startY = 170;
                const colWidth = (792 - 100) / 4;

                // Columna 1: Pólizas ACTIVAS (nuevo vs histórico)
                doc.font('Arial-Bold')
                    .fontSize(14)
                    .fillColor('#1a365d')
                    .text('PÓLIZAS ACTIVAS', 50, startY);

                doc.font('Arial')
                    .fontSize(32)
                    .fillColor('#2b6cb0')
                    .text((data.totalPolicies || 0).toString(), 50, startY + 25);

                // Mostrar desglose si existe
                if (data.policyAnalysis) {
                    doc.font('Arial')
                        .fontSize(10)
                        .fillColor('#4a5568')
                        .text(`Nuevas: ${data.policyAnalysis.newPoliciesInMonth}`, 50, startY + 60)
                        .text(`Anteriores: ${data.policyAnalysis.previousPoliciesWithActivity}`, 50, startY + 75);
                }

                // Columna 2: Servicios
                doc.font('Arial-Bold')
                    .fontSize(14)
                    .fillColor('#1a365d')
                    .text('SERVICIOS EJECUTADOS', 50 + colWidth, startY);

                doc.font('Arial')
                    .fontSize(32)
                    .fillColor('#38a169')
                    .text((data.totalServices || 0).toString(), 50 + colWidth, startY + 25);

                // Columna 3: Ingresos
                doc.font('Arial-Bold')
                    .fontSize(14)
                    .fillColor('#1a365d')
                    .text('INGRESOS TOTALES', 50 + (colWidth * 2), startY);

                doc.font('Arial')
                    .fontSize(32)
                    .fillColor('#38a169')
                    .text(`$${this.formatCurrency(data.financialSummary?.totalRevenue || 0)}`, 50 + (colWidth * 2), startY + 25);

                // Columna 4: Utilidad
                doc.font('Arial-Bold')
                    .fontSize(14)
                    .fillColor('#1a365d')
                    .text('MARGEN DE UTILIDAD', 50 + (colWidth * 3), startY);

                const profitMargin = data.financialSummary?.profitMargin || 0;
                const marginColor = profitMargin >= 0 ? '#38a169' : '#e53e3e';
                doc.font('Arial')
                    .fontSize(32)
                    .fillColor(marginColor)
                    .text(`${profitMargin}%`, 50 + (colWidth * 3), startY + 25);

                // TABLA DE ASEGURADORAS (Formato horizontal optimizado)
                const tableStartY = 280;
                doc.font('Arial-Bold')
                    .fontSize(16)
                    .fillColor('#1a365d')
                    .text('ANÁLISIS POR ASEGURADORA', 50, tableStartY);

                // Headers de tabla
                const headerY = tableStartY + 40;
                const cols = {
                    aseguradora: 50,
                    policies: 200,
                    services: 280,
                    usage: 360,
                    revenue: 440,
                    costs: 540,
                    roi: 640,
                    status: 720
                };

                // Fondo del header
                doc.rect(45, headerY - 5, 792 - 90, 25)
                    .fill('#f7fafc')
                    .stroke('#e2e8f0');

                doc.font('Arial-Bold')
                    .fontSize(10)
                    .fillColor('#2d3748')
                    .text('ASEGURADORA', cols.aseguradora, headerY + 5)
                    .text('PÓLIZAS', cols.policies, headerY + 5)
                    .text('SERVICIOS', cols.services, headerY + 5)
                    .text('% USO', cols.usage, headerY + 5)
                    .text('INGRESOS', cols.revenue, headerY + 5)
                    .text('COSTOS', cols.costs, headerY + 5)
                    .text('ROI %', cols.roi, headerY + 5)
                    .text('ESTADO', cols.status, headerY + 5);

                // Datos de aseguradoras (ordenadas por número de pólizas)
                let currentRowY = headerY + 30;
                const aseguradoras = data.aseguradoraAnalysis || [];
                aseguradoras.slice(0, 8).forEach((aseg, index) => {
                    const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';

                    // Fondo de fila
                    doc.rect(45, currentRowY - 3, 792 - 90, 20)
                        .fill(bgColor)
                        .stroke('#e2e8f0');

                    // Determinar estado de rendimiento
                    let statusText = 'EXCELENTE';
                    let statusColor = '#38a169';

                    if (aseg.serviceUsageRate < 30) {
                        statusText = 'BAJO USO';
                        statusColor = '#e53e3e';
                    } else if (aseg.serviceUsageRate < 60) {
                        statusText = 'MODERADO';
                        statusColor = '#d69e2e';
                    }

                    doc.font('Arial')
                        .fontSize(9)
                        .fillColor('#2d3748')
                        .text(aseg._id || 'SIN ESPECIFICAR', cols.aseguradora, currentRowY)
                        .text(aseg.totalPolicies.toString(), cols.policies, currentRowY)
                        .text(aseg.totalServices.toString(), cols.services, currentRowY)
                        .text(`${aseg.serviceUsageRate}%`, cols.usage, currentRowY)
                        .text(`$${this.formatCurrency(aseg.totalPaymentAmount)}`, cols.revenue, currentRowY)
                        .text(`$${this.formatCurrency(aseg.totalServiceCost)}`, cols.costs, currentRowY)
                        .text(`${aseg.roi}%`, cols.roi, currentRowY)
                        .fillColor(statusColor)
                        .text(statusText, cols.status, currentRowY)
                        .fillColor('#2d3748');

                    currentRowY += 22;
                });

                // ===================
                // PÁGINA 2: ANÁLISIS DE CICLO DE VIDA
                // ===================
                doc.addPage();

                // TÍTULO DE PÁGINA 2
                doc.font('Arial-Bold')
                    .fontSize(20)
                    .fillColor('#1a365d')
                    .text('ANÁLISIS DE CICLO DE VIDA COMPLETO', 50, 30);

                // Mostrar análisis por antigüedad si existe
                if (data.policyAnalysis && data.policyAnalysis.byAge) {
                    doc.font('Arial-Bold')
                        .fontSize(14)
                        .fillColor('#2d3748')
                        .text('DISTRIBUCIÓN POR ANTIGÜEDAD DE PÓLIZAS', 50, 70);

                    const ageY = 100;
                    const ageColWidth = 100;

                    // Headers
                    doc.font('Arial-Bold')
                        .fontSize(11)
                        .fillColor('#4a5568')
                        .text('Mismo Mes', 50, ageY)
                        .text('1 Mes', 50 + ageColWidth, ageY)
                        .text('2 Meses', 50 + (ageColWidth * 2), ageY)
                        .text('3 Meses', 50 + (ageColWidth * 3), ageY)
                        .text('4 Meses', 50 + (ageColWidth * 4), ageY)
                        .text('5 Meses', 50 + (ageColWidth * 5), ageY)
                        .text('6+ Meses', 50 + (ageColWidth * 6), ageY);

                    // Valores
                    doc.font('Arial')
                        .fontSize(20)
                        .fillColor('#2b6cb0')
                        .text(data.policyAnalysis.byAge.month0.toString(), 50, ageY + 25)
                        .text(data.policyAnalysis.byAge.month1.toString(), 50 + ageColWidth, ageY + 25)
                        .text(data.policyAnalysis.byAge.month2.toString(), 50 + (ageColWidth * 2), ageY + 25)
                        .text(data.policyAnalysis.byAge.month3.toString(), 50 + (ageColWidth * 3), ageY + 25)
                        .text(data.policyAnalysis.byAge.month4.toString(), 50 + (ageColWidth * 4), ageY + 25)
                        .text(data.policyAnalysis.byAge.month5.toString(), 50 + (ageColWidth * 5), ageY + 25)
                        .text(data.policyAnalysis.byAge.month6Plus.toString(), 50 + (ageColWidth * 6), ageY + 25);
                }

                // ANÁLISIS FINANCIERO COMPARATIVO
                if (data.financialSummary) {
                    doc.font('Arial-Bold')
                        .fontSize(14)
                        .fillColor('#2d3748')
                        .text('ANÁLISIS FINANCIERO: HISTÓRICO VS MES ACTUAL', 50, 180);

                    // Tabla comparativa
                    const finY = 210;
                    const finCols = {
                        metric: 50,
                        historic: 250,
                        month: 450,
                        percent: 650
                    };

                    // Headers
                    doc.rect(45, finY - 5, 700, 25)
                        .fill('#f7fafc')
                        .stroke('#e2e8f0');

                    doc.font('Arial-Bold')
                        .fontSize(10)
                        .fillColor('#2d3748')
                        .text('MÉTRICA', finCols.metric, finY + 5)
                        .text('HISTÓRICO TOTAL', finCols.historic, finY + 5)
                        .text('SOLO ESTE MES', finCols.month, finY + 5)
                        .text('% DEL MES', finCols.percent, finY + 5);

                    // Filas de datos
                    const metrics = [
                        {
                            name: 'Ingresos',
                            historic: data.financialSummary.totalRevenue,
                            month: data.financialSummary.totalRevenueInMonth || 0,
                            isRevenue: true
                        },
                        {
                            name: 'Costos de Servicios',
                            historic: data.financialSummary.totalServiceCosts,
                            month: data.financialSummary.totalServiceCostsInMonth || 0,
                            isRevenue: false
                        },
                        {
                            name: 'Servicios Ejecutados',
                            historic: data.financialSummary.totalServices,
                            month: data.financialSummary.totalServicesInMonth || 0,
                            isCount: true
                        },
                        {
                            name: 'Pagos Recibidos',
                            historic: data.financialSummary.totalPayments,
                            month: data.financialSummary.totalPaymentsInMonth || 0,
                            isCount: true
                        }
                    ];

                    let currentFinY = finY + 30;
                    metrics.forEach((metric, index) => {
                        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';

                        doc.rect(45, currentFinY - 3, 700, 20)
                            .fill(bgColor)
                            .stroke('#e2e8f0');

                        const percent = metric.historic > 0
                            ? Math.round((metric.month / metric.historic) * 100)
                            : 0;

                        doc.font('Arial')
                            .fontSize(9)
                            .fillColor('#2d3748')
                            .text(metric.name, finCols.metric, currentFinY);

                        if (metric.isCount) {
                            doc.text(metric.historic.toString(), finCols.historic, currentFinY)
                                .text(metric.month.toString(), finCols.month, currentFinY);
                        } else {
                            doc.text(`$${this.formatCurrency(metric.historic)}`, finCols.historic, currentFinY)
                                .text(`$${this.formatCurrency(metric.month)}`, finCols.month, currentFinY);
                        }

                        doc.fillColor(percent > 50 ? '#38a169' : percent > 25 ? '#d69e2e' : '#e53e3e')
                            .text(`${percent}%`, finCols.percent, currentFinY);

                        currentFinY += 22;
                    });
                }

                // ===================
                // PÁGINA 3: ANÁLISIS TEMPORAL Y GRÁFICAS
                // ===================
                doc.addPage();

                // TÍTULO DE PÁGINA 3
                doc.font('Arial-Bold')
                    .fontSize(20)
                    .fillColor('#1a365d')
                    .text('ANÁLISIS TEMPORAL DETALLADO', 50, 50);

                // GRÁFICA FUTURISTA 1: DISTRIBUCIÓN POR ASEGURADORA
                try {
                    const distributionChart = await chartGenerator.generateInsuranceDistributionChart(data);
                    doc.image(distributionChart, 50, 100, { width: 350, height: 175 });
                } catch (chartError) {
                    logger.error('Error generando gráfica de distribución:', chartError);
                    doc.font('Arial')
                        .fontSize(12)
                        .fillColor('#e53e3e')
                        .text('Error al generar gráfica de distribución', 50, 120);
                }

                // GRÁFICA FUTURISTA 2: TENDENCIAS TEMPORALES
                try {
                    if (data.dailyAnalysis && data.dailyAnalysis.length > 0) {
                        const trendChart = await chartGenerator.generateDailyTrendChart(data.dailyAnalysis);
                        doc.image(trendChart, 420, 100, { width: 350, height: 175 });
                    }
                } catch (chartError) {
                    logger.error('Error generando gráfica de tendencias:', chartError);
                    doc.font('Arial')
                        .fontSize(12)
                        .fillColor('#e53e3e')
                        .text('Error al generar gráfica de tendencias', 420, 120);
                }

                // GRÁFICA FUTURISTA 3: ANÁLISIS DE SERVICIOS (DONA)
                try {
                    const serviceChart = await chartGenerator.generateServiceAnalysisChart(data.serviciosStats);
                    doc.image(serviceChart, 50, 300, { width: 200, height: 200 });
                } catch (chartError) {
                    logger.error('Error generando gráfica de servicios:', chartError);
                    doc.font('Arial')
                        .fontSize(12)
                        .fillColor('#e53e3e')
                        .text('Error al generar gráfica de servicios', 50, 320);
                }

                // GRÁFICA FUTURISTA 4: ROI FINANCIERO
                try {
                    const roiChart = await chartGenerator.generateROIChart(data.aseguradoraAnalysis);
                    doc.image(roiChart, 270, 300, { width: 400, height: 200 });
                } catch (chartError) {
                    logger.error('Error generando gráfica ROI:', chartError);
                    doc.font('Arial')
                        .fontSize(12)
                        .fillColor('#e53e3e')
                        .text('Error al generar gráfica ROI', 270, 320);
                }

                // FOOTER
                doc.font('Arial')
                    .fontSize(8)
                    .fillColor('#718096')
                    .text(
                        `Generado el ${new Date().toLocaleDateString('es-MX')} a las ${new Date().toLocaleTimeString('es-MX')} | Sistema de Gestión de Pólizas v2.0`,
                        50,
                        520,
                        { align: 'center', width: 692 }
                    );

                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Dibuja gráfica de barras mejorada para actividad diaria
     */
    static drawDailyChart(doc, dailyData, x, y, width, height) {
        if (!dailyData || dailyData.length === 0) return;

        const maxValue = Math.max(...dailyData.map(d => d.policiesCount));
        const barWidth = width / dailyData.length - 2;

        // Ejes
        doc.strokeColor('#cbd5e0')
            .lineWidth(1)
            .moveTo(x, y)
            .lineTo(x, y + height)
            .stroke()
            .moveTo(x, y + height)
            .lineTo(x + width, y + height)
            .stroke();

        // Barras
        dailyData.forEach((day, index) => {
            const barHeight = (day.policiesCount / maxValue) * height;
            const barX = x + (index * (barWidth + 2)) + 5;
            const barY = y + height - barHeight;

            // Barra con gradiente visual
            doc.rect(barX, barY, barWidth, barHeight)
                .fill('#4299e1');

            // Etiqueta del día
            doc.font('Arial')
                .fontSize(8)
                .fillColor('#2d3748')
                .text(
                    day._id.day.toString(),
                    barX + (barWidth / 2) - 5,
                    y + height + 5
                );

            // Valor encima de la barra
            if (day.policiesCount > 0) {
                doc.font('Arial')
                    .fontSize(8)
                    .fillColor('#2d3748')
                    .text(
                        day.policiesCount.toString(),
                        barX + (barWidth / 2) - 5,
                        barY - 15
                    );
            }
        });

        // Título del eje Y
        doc.font('Arial')
            .fontSize(10)
            .fillColor('#4a5568')
            .text('Pólizas', x - 30, y + height / 2, { rotate: -90 });

        // Título del eje X
        doc.font('Arial')
            .fontSize(10)
            .fillColor('#4a5568')
            .text('Días del Mes', x + width / 2 - 30, y + height + 25);
    }

    /**
     * Genera tabla de actividad diaria detallada
     */
    static generateDailyActivityTable(doc, dailyData, startX, startY) {
        if (!dailyData || dailyData.length === 0) return;

        const colWidth = 60;
        const rowHeight = 15;
        const currentX = startX;
        let currentY = startY;

        // Headers
        doc.font('Arial-Bold')
            .fontSize(9)
            .fillColor('#2d3748');

        const headers = ['Día', 'Pólizas', 'Servicios', 'Día', 'Pólizas', 'Servicios'];
        headers.forEach((header, index) => {
            doc.text(header, currentX + (index * colWidth), currentY);
        });

        currentY += rowHeight + 5;

        // Datos en dos columnas
        const half = Math.ceil(dailyData.length / 2);
        for (let i = 0; i < half; i++) {
            const leftDay = dailyData[i];
            const rightDay = dailyData[i + half];

            doc.font('Arial')
                .fontSize(8)
                .fillColor('#4a5568');

            // Columna izquierda
            if (leftDay) {
                doc.text(leftDay._id.day.toString(), startX, currentY)
                    .text(leftDay.policiesCount.toString(), startX + colWidth, currentY)
                    .text(leftDay.servicesCount.toString(), startX + (colWidth * 2), currentY);
            }

            // Columna derecha
            if (rightDay) {
                doc.text(rightDay._id.day.toString(), startX + (colWidth * 3), currentY)
                    .text(rightDay.policiesCount.toString(), startX + (colWidth * 4), currentY)
                    .text(rightDay.servicesCount.toString(), startX + (colWidth * 5), currentY);
            }

            currentY += rowHeight;
        }
    }

    /**
     * Formatea números como moneda
     */
    static formatCurrency(amount) {
        if (!amount || amount === 0) return '0';
        return new Intl.NumberFormat('es-MX').format(Math.round(amount));
    }

    /**
     * Genera resumen del reporte para el caption
     */
    static generateEnterpriseReportSummary(reportData, period) {
        const topAseguradora = reportData.aseguradoraAnalysis?.[0];

        return '📊 **REPORTE EMPRESARIAL MENSUAL**\n' +
               `📅 **Período:** ${period}\n` +
               `📈 **Pólizas Activas:** ${reportData.totalPolicies || 0}\n` +
               `🚗 **Servicios Ejecutados:** ${reportData.totalServices || 0}\n` +
               `🏢 **Top Aseguradora:** ${topAseguradora?._id || 'N/A'} (${topAseguradora?.totalPolicies || 0} pólizas)\n` +
               `💰 **Ingresos:** $${this.formatCurrency(reportData.financialSummary?.totalRevenue || 0)}\n` +
               `📊 **Margen:** ${reportData.financialSummary?.profitMargin || 0}%\n` +
               `⏰ **Generado:** ${new Date().toLocaleString('es-MX')}`;
    }

    /**
     * Obtiene el mes anterior
     */
    static getPreviousMonth() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }

    /**
     * Formatea el mes para el reporte
     */
    static formatMonth(date) {
        const months = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    /**
     * Placeholder para reportes semanales
     */
    static async handleWeeklyReport(ctx) {
        await ctx.editMessageText(
            '📅 *REPORTES SEMANALES*\n\n' +
            'Los reportes semanales están siendo rediseñados para incluir:\n\n' +
            '• Análisis de rendimiento semanal\n' +
            '• Comparativas vs semanas anteriores\n' +
            '• Métricas de productividad\n' +
            '• Tendencias de contratación\n\n' +
            'Disponible en la próxima actualización.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '⬅️ Volver', callback_data: 'admin_reports_menu' }
                    ]]
                }
            }
        );
    }

    /**
     * Placeholder para reportes personalizados
     */
    static async handleCustomReport(ctx) {
        await ctx.editMessageText(
            '📋 *REPORTES PERSONALIZADOS*\n\n' +
            'Sistema de reportes personalizados en desarrollo:\n\n' +
            '• Selección de rangos de fechas específicos\n' +
            '• Filtros por aseguradora y criterios\n' +
            '• Métricas personalizadas\n' +
            '• Exportación en múltiples formatos\n\n' +
            'Próximamente disponible.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '⬅️ Volver', callback_data: 'admin_reports_menu' }
                    ]]
                }
            }
        );
    }

    /**
     * Maneja el reporte ejecutivo diario
     */
    static async handleExecutiveReport(ctx) {
        try {
            const menuText = `
*REPORTE EJECUTIVO DIARIO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Análisis detallado día por día con:

• *Registro de pólizas por fecha*
• *Patrones de eliminación y motivos*
• *Performance por aseguradora*
• *Vista calendario completo del mes*
• *Tendencias y predicciones*
• *GRÁFICA de distribución diaria*

Selecciona el período para analizar:

• *Mes Actual* - ${this.formatMonth(new Date())}
• *Mes Anterior* - ${this.formatMonth(this.getPreviousMonth())}
• *Seleccionar Mes* - Elegir mes específico

¿Qué período deseas analizar?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('Mes Actual', 'admin_reports_executive_current'),
                    Markup.button.callback('Mes Anterior', 'admin_reports_executive_previous')
                ],
                [
                    Markup.button.callback('Seleccionar Mes', 'admin_reports_executive_select')
                ],
                [
                    Markup.button.callback('⬅️ Volver', 'admin_reports_menu')
                ]
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

    /**
     * Genera reporte ejecutivo diario para un período específico
     */
    static async generateExecutiveReportForPeriod(ctx, startDate, endDate, period) {
        try {
            await ctx.answerCbQuery('Generando reporte ejecutivo diario...');

            const loadingMessage = await ctx.editMessageText(
                '🎯 *GENERANDO REPORTE EJECUTIVO DIARIO*\n' +
                `📅 Período: ${period}\n\n` +
                '⏳ Analizando registros diarios...'
            );

            // Obtener análisis ejecutivo diario
            const executiveData = await ReportsHandlerV2.getDailyExecutiveAnalysis(startDate, endDate);

            await ctx.editMessageText(
                '🎯 *GENERANDO REPORTE EJECUTIVO DIARIO*\n' +
                `📅 Período: ${period}\n\n` +
                '📊 Creando visualizaciones y PDF...'
            );

            // Generar PDF del reporte ejecutivo
            const pdfDoc = await ReportsHandlerV2.generateExecutiveDailyPDF(executiveData, period);

            // Convertir a buffer
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));
            
            const pdfBuffer = await new Promise((resolve, reject) => {
                pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
                pdfDoc.on('error', reject);
                pdfDoc.end();
            });

            // Auditar la acción
            await AuditLogger.log(ctx.from.id, 'REPORTE_EJECUTIVO_DIARIO', {
                periodo: period,
                totalPoliciesCreated: executiveData.monthlyStats.totalPoliciesCreated,
                totalPoliciesDeleted: executiveData.monthlyStats.totalPoliciesDeleted,
                netChange: executiveData.monthlyStats.netPolicyChange,
                retentionRate: executiveData.patterns.retentionRate
            });

            // Preparar resumen para el mensaje
            const { monthlyStats, patterns } = executiveData;
            const resumenText = `
*REPORTE EJECUTIVO GENERADO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Período:** ${period}

**MÉTRICAS PRINCIPALES:**
• Pólizas Creadas: **${monthlyStats.totalPoliciesCreated}**
• Pólizas Eliminadas: **${monthlyStats.totalPoliciesDeleted}**
• Cambio Neto (Creadas - Eliminadas): **${monthlyStats.netPolicyChange > 0 ? '+' : ''}${monthlyStats.netPolicyChange}**
• Tasa de Retención (% No eliminadas): **${patterns.retentionRate}%**

**TENDENCIA:** ${patterns.growthTrend.trend}
**Servicios Registrados:** ${monthlyStats.totalServicesRegistered}

**Día Pico Registros:** ${monthlyStats.peakRegistrationDay.day} (${monthlyStats.peakRegistrationDay.policiesCreated} pólizas)

**GRÁFICA INCLUIDA:** Distribución diaria completa con barras para pólizas creadas y eliminadas por día del mes.

El reporte completo incluye análisis detallado día por día, patrones de eliminación, ranking de aseguradoras y proyecciones.
            `.trim();

            // Enviar el PDF como documento
            await ctx.replyWithDocument(
                {
                    source: pdfBuffer,
                    filename: `Reporte_Ejecutivo_Diario_${period.replace(/\s+/g, '_')}.pdf`
                },
                {
                    caption: resumenText,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📊 Nuevo Reporte', callback_data: 'admin_reports_executive' },
                            { text: '⬅️ Menú Principal', callback_data: 'admin_reports_menu' }
                        ]]
                    }
                }
            );

            logger.info('Reporte ejecutivo diario generado exitosamente', {
                period,
                totalPolicies: monthlyStats.totalPoliciesCreated,
                fileSize: pdfBuffer.length
            });

        } catch (error) {
            logger.error('Error generando reporte ejecutivo:', error);
            await ctx.editMessageText(
                '❌ *ERROR AL GENERAR REPORTE*\n\n' +
                'Hubo un problema al generar el reporte ejecutivo diario.\n' +
                'Por favor intenta nuevamente.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔄 Reintentar', callback_data: 'admin_reports_executive' },
                            { text: '⬅️ Volver', callback_data: 'admin_reports_menu' }
                        ]]
                    }
                }
            );
        }
    }

    /**
     * Muestra interfaz de selección de mes específico
     */
    static async showMonthSelection(ctx, type = 'monthly') {
        try {
            const currentDate = new Date();
            const months = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            const isExecutive = type === 'executive';
            const title = isExecutive ? 'REPORTE EJECUTIVO DIARIO' : 'REPORTE MENSUAL';
            const prefix = isExecutive ? 'admin_reports_executive_month' : 'admin_reports_month';
            const backButton = isExecutive ? 'admin_reports_executive' : 'admin_reports_monthly';

            const menuText = `
📅 *SELECCIÓN DE MES ESPECÍFICO*
${title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selecciona el mes que deseas analizar:

📈 *Año ${currentDate.getFullYear()}*
            `.trim();

            const keyboard = [];

            // Crear botones para los meses del año actual
            for (let i = 0; i < 12; i += 2) {
                const row = [];
                const monthIndex1 = i;
                const monthIndex2 = i + 1;

                row.push({
                    text: `${months[monthIndex1]}`,
                    callback_data: `${prefix}_${monthIndex1}_${currentDate.getFullYear()}`
                });

                if (monthIndex2 < 12) {
                    row.push({
                        text: `${months[monthIndex2]}`,
                        callback_data: `${prefix}_${monthIndex2}_${currentDate.getFullYear()}`
                    });
                }

                keyboard.push(row);
            }

            keyboard.push([
                { text: '⬅️ Volver', callback_data: backButton }
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error al mostrar selección de mes:', error);
            await ctx.reply('❌ Error al mostrar selección de mes.');
        }
    }

    /**
     * Genera reporte comparativo empresarial de 6 meses
     */
    static async generateComparativeReport(ctx) {
        try {
            await ctx.answerCbQuery('Generando análisis comparativo...');

            const loadingMessage = await ctx.editMessageText(
                '📊 *GENERANDO ANÁLISIS COMPARATIVO 6 MESES*\n\n' +
                '⏳ Extrayendo datos históricos...'
            );

            // Obtener datos de los últimos 6 meses
            const reports = [];
            const now = new Date();

            for (let i = 0; i < 6; i++) {
                const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

                const monthData = await ReportsHandlerV2.getComprehensiveMonthlyDataV2(startDate, endDate);
                reports.push({
                    month: this.formatMonth(startDate),
                    monthIndex: startDate.getMonth(),
                    year: startDate.getFullYear(),
                    data: monthData
                });

                // Actualizar progreso
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    loadingMessage.message_id,
                    undefined,
                    '📊 *GENERANDO ANÁLISIS COMPARATIVO 6 MESES*\n\n' +
                    `📈 Procesando mes ${i + 1}/6: ${this.formatMonth(startDate)}...`
                );
            }

            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loadingMessage.message_id,
                undefined,
                '📊 *GENERANDO ANÁLISIS COMPARATIVO 6 MESES*\n\n' +
                '📊 Generando análisis de tendencias...\n' +
                '💰 Calculando métricas comparativas...'
            );

            // Generar PDF comparativo
            const pdfBuffer = await this.generateComparativePDF(reports);
            const filename = `analisis_comparativo_6_meses_${new Date().toISOString().split('T')[0]}.pdf`;

            await ctx.replyWithDocument({
                source: pdfBuffer,
                filename
            }, {
                caption: this.generateComparativeSummary(reports),
                parse_mode: 'Markdown'
            });

            await AdminMenu.showReportsMenu(ctx);

            await AuditLogger.log(ctx, 'comparative_6_month_report_generated', 'reports', {
                monthsAnalyzed: reports.length,
                totalPolicies: reports.reduce((sum, r) => sum + r.data.totalPolicies, 0),
                totalRevenue: reports.reduce((sum, r) => sum + r.data.financialSummary.totalRevenue, 0)
            });

        } catch (error) {
            logger.error('Error al generar reporte comparativo:', error);
            await ctx.reply('❌ Error al generar el análisis comparativo. Intenta nuevamente.');
        }
    }

    /**
     * Genera PDF comparativo empresarial con gráficas futuristas de IA
     */
    static async generateComparativePDF(reports) {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    layout: 'landscape',
                    margin: 30
                });
                const chunks = [];

                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // CONFIGURACIÓN DE FUENTES
                doc.registerFont('Arial', 'Helvetica');
                doc.registerFont('Arial-Bold', 'Helvetica-Bold');

                // INICIALIZAR GENERADOR DE GRÁFICAS FUTURISTAS
                const chartGenerator = new ChartGenerator();

                // ===================
                // PÁGINA 1: RESUMEN COMPARATIVO
                // ===================

                // ENCABEZADO
                doc.font('Arial-Bold')
                    .fontSize(28)
                    .fillColor('#1a365d')
                    .text('ANÁLISIS COMPARATIVO EMPRESARIAL', 50, 50, { align: 'center' });

                doc.font('Arial')
                    .fontSize(16)
                    .fillColor('#2d3748')
                    .text('Últimos 6 Meses - Tendencias y Métricas', 50, 85, { align: 'center' });

                doc.font('Arial-Bold')
                    .fontSize(14)
                    .fillColor('#2b6cb0')
                    .text(`Período: ${reports[5].month} - ${reports[0].month}`, 50, 110, { align: 'center' });

                // LÍNEA SEPARADORA
                doc.strokeColor('#e2e8f0')
                    .lineWidth(2)
                    .moveTo(50, 140)
                    .lineTo(792 - 50, 140)
                    .stroke();

                // TABLA COMPARATIVA PRINCIPAL
                this.generateComparativeTable(doc, reports, 50, 170);

                // ===================
                // PÁGINA 2: GRÁFICAS FUTURISTAS DE IA
                // ===================
                doc.addPage();

                doc.font('Arial-Bold')
                    .fontSize(24)
                    .fillColor('#1a365d')
                    .text('ANÁLISIS PREDICTIVO EMPRESARIAL', 50, 30, { align: 'center' });

                doc.font('Arial')
                    .fontSize(14)
                    .fillColor('#4a5568')
                    .text('Inteligencia Artificial Aplicada al Crecimiento', 50, 60, { align: 'center' });

                // GRÁFICA FUTURISTA PRINCIPAL: EVOLUCIÓN COMPARATIVA
                try {
                    const comparativeChart = await chartGenerator.generateComparativeChart(reports);
                    doc.image(comparativeChart, 50, 90, { width: 700, height: 350 });
                } catch (chartError) {
                    logger.error('Error generando gráfica comparativa:', chartError);
                    doc.font('Arial')
                        .fontSize(12)
                        .fillColor('#e53e3e')
                        .text('Error al generar gráfica comparativa de evolución', 50, 150);

                    // Fallback a gráficas básicas
                    this.drawMonthlyTrendChart(doc, reports, 70, 200, 650, 150, 'EVOLUCIÓN DE PÓLIZAS (FALLBACK)');
                }

                // FOOTER
                doc.font('Arial')
                    .fontSize(8)
                    .fillColor('#718096')
                    .text(
                        `Análisis Comparativo Generado el ${new Date().toLocaleDateString('es-MX')} | Sistema de Gestión Empresarial`,
                        50,
                        520,
                        { align: 'center', width: 692 }
                    );

                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Genera tabla comparativa de los 6 meses
     */
    static generateComparativeTable(doc, reports, startX, startY) {
        const cols = {
            month: startX,
            policies: startX + 120,
            services: startX + 200,
            revenue: startX + 280,
            costs: startX + 380,
            margin: startX + 480,
            growth: startX + 560,
            efficiency: startX + 640
        };

        // Headers
        const headerY = startY;
        doc.rect(startX - 5, headerY - 5, 692, 25)
            .fill('#f7fafc')
            .stroke('#e2e8f0');

        doc.font('Arial-Bold')
            .fontSize(10)
            .fillColor('#2d3748')
            .text('MES', cols.month, headerY + 5)
            .text('PÓLIZAS', cols.policies, headerY + 5)
            .text('SERVICIOS', cols.services, headerY + 5)
            .text('INGRESOS', cols.revenue, headerY + 5)
            .text('COSTOS', cols.costs, headerY + 5)
            .text('MARGEN %', cols.margin, headerY + 5)
            .text('CRECIM. %', cols.growth, headerY + 5)
            .text('EFICIENCIA', cols.efficiency, headerY + 5);

        // Datos (orden inverso para mostrar el más reciente primero)
        let currentRowY = headerY + 30;
        reports.reverse().forEach((report, index) => {
            const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';

            // Calcular crecimiento vs mes anterior
            let growthRate = 0;
            if (index > 0) {
                const prevReport = reports[index - 1];
                const currentPolicies = report.data.totalPolicies;
                const prevPolicies = prevReport.data.totalPolicies;

                if (prevPolicies > 0) {
                    growthRate = ((currentPolicies - prevPolicies) / prevPolicies) * 100;
                }
            }

            // Calcular eficiencia (servicios por póliza)
            const efficiency = report.data.totalPolicies > 0
                ? (report.data.totalServices / report.data.totalPolicies).toFixed(2)
                : '0.00';

            // Fondo de fila
            doc.rect(startX - 5, currentRowY - 3, 692, 20)
                .fill(bgColor)
                .stroke('#e2e8f0');

            doc.font('Arial')
                .fontSize(9)
                .fillColor('#2d3748')
                .text(report.month, cols.month, currentRowY)
                .text(report.data.totalPolicies.toString(), cols.policies, currentRowY)
                .text(report.data.totalServices.toString(), cols.services, currentRowY)
                .text(`$${this.formatCurrency(report.data.financialSummary.totalRevenue)}`, cols.revenue, currentRowY)
                .text(`$${this.formatCurrency(report.data.financialSummary.totalCosts)}`, cols.costs, currentRowY)
                .text(`${report.data.financialSummary.profitMargin}%`, cols.margin, currentRowY)
                .fillColor(growthRate >= 0 ? '#38a169' : '#e53e3e')
                .text(`${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`, cols.growth, currentRowY)
                .fillColor('#2d3748')
                .text(efficiency, cols.efficiency, currentRowY);

            currentRowY += 22;
        });
    }

    /**
     * Dibuja gráfica de tendencias mensuales
     */
    static drawMonthlyTrendChart(doc, reports, x, y, width, height, title) {
        // Título
        doc.font('Arial-Bold')
            .fontSize(12)
            .fillColor('#2d3748')
            .text(title, x, y - 20);

        const data = reports.reverse().map(r => r.data.totalPolicies);
        const maxValue = Math.max(...data);
        const barWidth = width / data.length - 10;

        // Ejes
        doc.strokeColor('#cbd5e0')
            .lineWidth(1)
            .moveTo(x, y)
            .lineTo(x, y + height)
            .stroke()
            .moveTo(x, y + height)
            .lineTo(x + width, y + height)
            .stroke();

        // Barras
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * height;
            const barX = x + (index * (barWidth + 10)) + 10;
            const barY = y + height - barHeight;

            // Gradiente de color basado en valor
            const intensity = value / maxValue;
            const color = intensity > 0.7 ? '#38a169' : intensity > 0.4 ? '#3182ce' : '#ed8936';

            doc.rect(barX, barY, barWidth, barHeight)
                .fill(color);

            // Etiqueta del mes
            const monthLabel = reports[index].month.substring(0, 3);
            doc.font('Arial')
                .fontSize(8)
                .fillColor('#2d3748')
                .text(monthLabel, barX + (barWidth / 2) - 10, y + height + 5);

            // Valor encima de la barra
            if (value > 0) {
                doc.font('Arial')
                    .fontSize(8)
                    .fillColor('#2d3748')
                    .text(value.toString(), barX + (barWidth / 2) - 8, barY - 15);
            }
        });
    }

    /**
     * Dibuja gráfica de evolución de ingresos
     */
    static drawMonthlyRevenueChart(doc, reports, x, y, width, height, title) {
        // Título
        doc.font('Arial-Bold')
            .fontSize(12)
            .fillColor('#2d3748')
            .text(title, x, y - 20);

        const data = reports.map(r => r.data.financialSummary.totalRevenue);
        const maxValue = Math.max(...data);

        if (maxValue === 0) return;

        const stepX = width / (data.length - 1);

        // Ejes
        doc.strokeColor('#cbd5e0')
            .lineWidth(1)
            .moveTo(x, y)
            .lineTo(x, y + height)
            .stroke()
            .moveTo(x, y + height)
            .lineTo(x + width, y + height)
            .stroke();

        // Línea de tendencia
        doc.strokeColor('#3182ce')
            .lineWidth(3);

        data.forEach((value, index) => {
            const pointX = x + (index * stepX);
            const pointY = y + height - ((value / maxValue) * height);

            if (index === 0) {
                doc.moveTo(pointX, pointY);
            } else {
                doc.lineTo(pointX, pointY);
            }

            // Punto
            doc.circle(pointX, pointY, 3)
                .fill('#3182ce');

            // Etiqueta
            const monthLabel = reports[index].month.substring(0, 3);
            doc.font('Arial')
                .fontSize(8)
                .fillColor('#2d3748')
                .text(monthLabel, pointX - 10, y + height + 5);
        });

        doc.stroke();
    }

    /**
     * Genera resumen para caption del reporte comparativo
     */
    static generateComparativeSummary(reports) {
        const latest = reports[0];
        const oldest = reports[reports.length - 1];

        const totalPolicies = reports.reduce((sum, r) => sum + r.data.totalPolicies, 0);
        const totalRevenue = reports.reduce((sum, r) => sum + r.data.financialSummary.totalRevenue, 0);

        const growthRate = oldest.data.totalPolicies > 0
            ? (((latest.data.totalPolicies - oldest.data.totalPolicies) / oldest.data.totalPolicies) * 100).toFixed(1)
            : 0;

        return '📊 **ANÁLISIS COMPARATIVO 6 MESES**\n' +
               `📅 **Período:** ${oldest.month} - ${latest.month}\n` +
               `📈 **Total Pólizas:** ${totalPolicies}\n` +
               `💰 **Ingresos Totales:** $${this.formatCurrency(totalRevenue)}\n` +
               `📊 **Crecimiento:** ${growthRate >= 0 ? '+' : ''}${growthRate}%\n` +
               `🏆 **Mejor Mes:** ${reports.reduce((best, current) =>
                   current.data.totalPolicies > best.data.totalPolicies ? current : best
               ).month}\n` +
               `⏰ **Generado:** ${new Date().toLocaleString('es-MX')}`;
    }
}

module.exports = ReportsHandler;
