"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const policy_1 = __importDefault(require("../../models/policy"));
const logger_1 = __importDefault(require("../../utils/logger"));
class PaymentReportPDFCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
        this.colors = {
            primary: '#2E86AB',
            secondary: '#A23B72',
            accent: '#F18F01',
            success: '#C73E1D',
            text: '#2C3E50',
            lightGray: '#ECF0F1',
            white: '#FFFFFF',
            urgent: '#E74C3C',
            warning: '#F39C12',
            safe: '#27AE60',
            tableStroke: '#E74C3C'
        };
        this.layout = {
            margin: 40,
            headerHeight: 80,
            footerHeight: 40,
            lineHeight: 15,
            sectionSpacing: 20
        };
    }
    getCommandName() {
        return 'PaymentReportPDF';
    }
    getDescription() {
        return 'Genera un reporte PDF de pólizas con pagos pendientes.';
    }
    calculatePaymentDueDate(emissionDate, monthsToAdd) {
        const date = new Date(emissionDate);
        date.setMonth(date.getMonth() + monthsToAdd);
        date.setDate(date.getDate() - 1);
        const originalMonth = new Date(emissionDate).getMonth() + monthsToAdd;
        if (date.getMonth() !== originalMonth % 12) {
            date.setDate(0);
        }
        return date;
    }
    calculateMonthsCoveredByPayments(emissionDate, paymentsCount) {
        const emission = new Date(emissionDate);
        const coverageEndDate = new Date(emission);
        coverageEndDate.setMonth(coverageEndDate.getMonth() + paymentsCount);
        coverageEndDate.setDate(coverageEndDate.getDate() - 1);
        return coverageEndDate;
    }
    async calculatePendingPaymentsPolicies() {
        try {
            const policies = await policy_1.default.find({ estado: 'ACTIVO' }).lean();
            const now = new Date();
            const pendingPolicies = [];
            for (const policy of policies) {
                const { numeroPoliza, fechaEmision, pagos = [], estadoPoliza, servicios = [] } = policy;
                if (!fechaEmision)
                    continue;
                const pagosRealizados = pagos.filter((pago) => pago.estado === 'REALIZADO');
                const pagosPlanificados = pagos.filter((pago) => pago.estado === 'PLANIFICADO');
                const fechaLimiteCobertura = this.calculateMonthsCoveredByPayments(fechaEmision, pagosRealizados.length);
                let diasDeImpago = 0;
                if (now > fechaLimiteCobertura) {
                    const msImpago = now.getTime() - fechaLimiteCobertura.getTime();
                    diasDeImpago = Math.floor(msImpago / (1000 * 60 * 60 * 24));
                }
                if (diasDeImpago > 0) {
                    let montoRequerido = 0;
                    let montoReferencia = null;
                    let fuenteMonto = 'SIN_DATOS';
                    if (pagosPlanificados.length > 0) {
                        if (pagosRealizados.length === 0) {
                            if (pagosPlanificados[0]) {
                                montoRequerido = pagosPlanificados[0].monto;
                                fuenteMonto = 'PLANIFICADO_P1';
                            }
                        }
                        else {
                            if (pagosPlanificados[1]) {
                                montoRequerido = pagosPlanificados[1].monto;
                                fuenteMonto = 'PLANIFICADO_P2';
                            }
                            else if (pagosPlanificados[0]) {
                                montoRequerido = pagosPlanificados[0].monto;
                                fuenteMonto = 'PLANIFICADO_P1_FALLBACK';
                            }
                        }
                    }
                    if (montoRequerido === 0 && pagosRealizados.length > 0) {
                        const ultimoPago = pagosRealizados[pagosRealizados.length - 1];
                        montoReferencia = ultimoPago.monto;
                        fuenteMonto = 'REFERENCIA_ULTIMO_PAGO';
                    }
                    const msTranscurridos = now.getTime() - new Date(fechaEmision).getTime();
                    const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));
                    pendingPolicies.push({
                        numeroPoliza,
                        diasDeImpago,
                        montoRequerido,
                        montoReferencia,
                        fuenteMonto,
                        estadoPoliza: estadoPoliza || 'SIN_ESTADO',
                        pagosRealizados: pagosRealizados.length,
                        diasTranscurridos,
                        fechaLimiteCobertura,
                        fechaEmision: new Date(fechaEmision),
                        servicios: servicios || []
                    });
                }
            }
            return pendingPolicies.sort((a, b) => b.diasDeImpago - a.diasDeImpago);
        }
        catch (error) {
            logger_1.default.error('Error al calcular pólizas con pagos pendientes:', error);
            throw error;
        }
    }
    calculateReportStats(pendingPolicies) {
        const totalPolicies = pendingPolicies.length;
        let totalAmount = 0;
        let criticalPolicies = 0;
        let urgent = 0;
        let normal = 0;
        let polizasConCosto = 0;
        pendingPolicies.forEach(policy => {
            const amount = policy.montoRequerido || policy.montoReferencia || 0;
            totalAmount += amount;
            if (amount > 0) {
                polizasConCosto++;
            }
            const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(policy.fechaLimiteCobertura);
            if (diasHastaVencer <= 2 && diasHastaVencer > 0) {
                criticalPolicies++;
            }
            else if (diasHastaVencer <= 7 && diasHastaVencer > 0) {
                urgent++;
            }
            else if (diasHastaVencer <= 15 && diasHastaVencer > 0) {
                urgent++;
            }
            else {
                normal++;
            }
        });
        return {
            totalPolicies,
            totalAmount,
            polizasConCosto,
            criticalPolicies,
            urgencyData: {
                critical: criticalPolicies,
                urgent: urgent,
                normal
            }
        };
    }
    calculateTotalAmount(pendingPolicies) {
        return pendingPolicies.reduce((total, policy) => {
            const amount = policy.montoRequerido || policy.montoReferencia || 0;
            return total + amount;
        }, 0);
    }
    addCorporateHeader(doc, stats) {
        const { margin, headerHeight } = this.layout;
        doc.rect(0, 0, doc.page.width, headerHeight).fill(this.colors.primary);
        doc.fontSize(24)
            .font('Helvetica-Bold')
            .fill(this.colors.white)
            .text('POLIZAS BOT', margin, 20);
        doc.fontSize(16).text('REPORTE DE PAGOS PENDIENTES', margin, 45);
        const dateStr = new Date().toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        doc.fontSize(10)
            .text(`Generado: ${dateStr}`, doc.page.width - 200, 20)
            .text(`Total polizas: ${stats.totalPolicies}`, doc.page.width - 200, 35)
            .text(`Monto total: $${stats.totalAmount.toLocaleString()}`, doc.page.width - 200, 50);
    }
    addUrgencyChart(doc, urgencyData) {
        const chartY = doc.y + this.layout.sectionSpacing;
        const chartWidth = 400;
        const chartHeight = 80;
        const barHeight = 20;
        doc.fontSize(12)
            .font('Helvetica-Bold')
            .fill(this.colors.text)
            .text('DISTRIBUCION POR URGENCIA', this.layout.margin, chartY);
        const categories = [
            { label: 'Critico (<=2 dias)', count: urgencyData.critical, color: this.colors.urgent },
            { label: 'Urgente (3-15 dias)', count: urgencyData.urgent, color: this.colors.warning },
            { label: 'Normal (>15 dias)', count: urgencyData.normal, color: this.colors.safe }
        ];
        const maxCount = Math.max(...categories.map(c => c.count));
        let currentY = chartY + 25;
        categories.forEach(category => {
            const barWidth = maxCount > 0 ? (category.count / maxCount) * chartWidth : 0;
            doc.rect(this.layout.margin + 120, currentY, barWidth, barHeight).fill(category.color);
            doc.fontSize(9)
                .fill(this.colors.text)
                .text(category.label, this.layout.margin, currentY + 6);
            doc.text(`${category.count}`, this.layout.margin + 120 + barWidth + 5, currentY + 6);
            currentY += barHeight + 5;
        });
        doc.y = currentY + this.layout.sectionSpacing;
    }
    addKPISection(doc, stats) {
        const kpiY = doc.y + this.layout.sectionSpacing;
        doc.fontSize(12)
            .font('Helvetica-Bold')
            .fill(this.colors.text)
            .text('INDICADORES CLAVE', this.layout.margin, kpiY);
        const kpis = [
            {
                label: 'Total Pendiente',
                value: `$${stats.totalAmount.toLocaleString()}`,
                icon: '$',
                color: this.colors.primary
            },
            {
                label: `Promedio (${stats.polizasConCosto} c/costo)`,
                value: stats.polizasConCosto > 0
                    ? `$${Math.round(stats.totalAmount / stats.polizasConCosto).toLocaleString()}`
                    : '$0',
                icon: '#',
                color: this.colors.secondary
            },
            {
                label: 'Polizas Criticas',
                value: `${stats.criticalPolicies}`,
                icon: '!',
                color: this.colors.urgent
            }
        ];
        let currentX = this.layout.margin;
        const kpiWidth = 150;
        kpis.forEach(kpi => {
            doc.rect(currentX, kpiY + 25, kpiWidth, 60).stroke(kpi.color);
            doc.rect(currentX, kpiY + 25, kpiWidth, 60)
                .fillOpacity(0.1)
                .fill(this.colors.lightGray)
                .fillOpacity(1);
            doc.fontSize(16)
                .fill(kpi.color)
                .text(kpi.icon, currentX + 10, kpiY + 35);
            doc.fontSize(14)
                .font('Helvetica-Bold')
                .text(kpi.value, currentX + 35, kpiY + 35);
            doc.fontSize(9)
                .font('Helvetica')
                .fill(this.colors.text)
                .text(kpi.label, currentX + 10, kpiY + 60);
            currentX += kpiWidth + 20;
        });
        doc.y = kpiY + 100;
    }
    addOptimizedFooter(doc, pageNumber, metadata) {
        const footerY = doc.page.height - this.layout.footerHeight;
        doc.moveTo(this.layout.margin, footerY)
            .lineTo(doc.page.width - this.layout.margin, footerY)
            .stroke(this.colors.lightGray);
        doc.fontSize(8)
            .fill(this.colors.text)
            .text(`Pagina ${pageNumber}`, this.layout.margin, footerY + 10)
            .text(`${new Date().toISOString()}`, this.layout.margin, footerY + 25)
            .text(`Generado por Polizas Bot v${metadata.version || '2.0.0'}`, doc.page.width - 200, footerY + 10)
            .text(`${metadata.totalRecords} registros procesados`, doc.page.width - 200, footerY + 25);
    }
    async generatePDF(pendingPolicies) {
        const doc = new pdfkit_1.default({
            margin: this.layout.margin,
            size: 'A4',
            compress: true,
            bufferPages: true,
            info: {
                Title: 'Reporte de Pagos Pendientes',
                Author: 'Polizas Bot',
                Subject: 'Análisis de pagos pendientes',
                Creator: 'Polizas Bot v2.0.0',
                Producer: 'PDFKit',
                CreationDate: new Date()
            }
        });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve(pdfBuffer);
            });
            doc.on('error', reject);
            try {
                doc.font('Helvetica');
                const stats = this.calculateReportStats(pendingPolicies);
                this.addCorporateHeader(doc, stats);
                doc.y = this.layout.headerHeight + this.layout.sectionSpacing;
                if (pendingPolicies.length === 0) {
                    doc.fontSize(14);
                    doc.text('No hay polizas con pagos pendientes', { align: 'center' });
                    doc.end();
                    return;
                }
                this.addUrgencyChart(doc, stats.urgencyData);
                this.addKPISection(doc, stats);
                const grupos = this.groupByWeeklyPriority(pendingPolicies);
                let totalGeneral = 0;
                const tableTop = doc.y;
                const colWidths = {
                    poliza: 140,
                    diasVencer: 80,
                    monto: 100,
                    servicios: 80
                };
                const tableLeft = 40;
                const tableWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
                let currentY = tableTop;
                const drawHorizontalLine = (y) => {
                    doc.strokeColor(this.colors.tableStroke)
                        .lineWidth(1)
                        .moveTo(tableLeft, y)
                        .lineTo(tableLeft + tableWidth, y)
                        .stroke();
                };
                const drawVerticalLines = (y1, y2) => {
                    let x = tableLeft;
                    doc.strokeColor(this.colors.tableStroke).lineWidth(1);
                    doc.moveTo(x, y1).lineTo(x, y2).stroke();
                    for (const width of Object.values(colWidths)) {
                        x += width;
                        doc.moveTo(x, y1).lineTo(x, y2).stroke();
                    }
                };
                doc.fontSize(10).font('Helvetica-Bold');
                const headerY = currentY;
                doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5, {
                    width: colWidths.poliza - 10
                });
                doc.text('DIAS PARA VENCER', tableLeft + colWidths.poliza + 5, currentY + 5, {
                    width: colWidths.diasVencer - 10,
                    align: 'center'
                });
                doc.text('MONTO REQUERIDO', tableLeft + colWidths.poliza + colWidths.diasVencer + 5, currentY + 5, { width: colWidths.monto - 10, align: 'center' });
                doc.text('SERVICIOS', tableLeft + colWidths.poliza + colWidths.diasVencer + colWidths.monto + 5, currentY + 5, { width: colWidths.servicios - 10, align: 'center' });
                currentY += 25;
                drawHorizontalLine(headerY);
                drawHorizontalLine(currentY);
                drawVerticalLines(headerY, currentY);
                for (const [rango, items] of Object.entries(grupos)) {
                    if (items.length === 0)
                        continue;
                    currentY += 10;
                    doc.fontSize(11).font('Helvetica-Bold');
                    const prioridadText = items[0]?.prioridad === 1
                        ? 'URGENTE: '
                        : items[0]?.prioridad === 2
                            ? 'ATENCION: '
                            : items[0]?.prioridad && items[0].prioridad <= 3
                                ? 'PROGRAMAR: '
                                : 'REVISAR: ';
                    doc.text(`${prioridadText}${rango} (${items.length} polizas)`, tableLeft, currentY);
                    currentY += 20;
                    let totalGrupo = 0;
                    doc.fontSize(8).font('Helvetica');
                    const groupStartY = currentY;
                    for (const item of items) {
                        if (currentY > 720) {
                            doc.addPage();
                            currentY = 40;
                            doc.fontSize(10).font('Helvetica-Bold');
                            const newHeaderY = currentY;
                            doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5, {
                                width: colWidths.poliza - 10
                            });
                            doc.text('DIAS PARA VENCER', tableLeft + colWidths.poliza + 5, currentY + 5, {
                                width: colWidths.diasVencer - 10,
                                align: 'center'
                            });
                            doc.text('MONTO REQUERIDO', tableLeft + colWidths.poliza + colWidths.diasVencer + 5, currentY + 5, { width: colWidths.monto - 10, align: 'center' });
                            doc.text('SERVICIOS', tableLeft +
                                colWidths.poliza +
                                colWidths.diasVencer +
                                colWidths.monto +
                                5, currentY + 5, { width: colWidths.servicios - 10, align: 'center' });
                            currentY += 25;
                            drawHorizontalLine(newHeaderY);
                            drawHorizontalLine(currentY);
                            drawVerticalLines(newHeaderY, currentY);
                            doc.fontSize(8).font('Helvetica');
                        }
                        const monto = item.montoRequerido || item.montoReferencia || 0;
                        totalGrupo += monto;
                        totalGeneral += monto;
                        const rowStartY = currentY;
                        const numServicios = item.servicios?.length || 0;
                        doc.text(item.numeroPoliza, tableLeft + 3, currentY + 3, {
                            width: colWidths.poliza - 6,
                            align: 'left'
                        });
                        doc.text((item.diasHastaVencer || 0).toString(), tableLeft + colWidths.poliza + 3, currentY + 3, { width: colWidths.diasVencer - 6, align: 'center' });
                        doc.text(`$${monto.toLocaleString('es-MX')}`, tableLeft + colWidths.poliza + colWidths.diasVencer + 3, currentY + 3, { width: colWidths.monto - 6, align: 'right' });
                        doc.text(numServicios.toString(), tableLeft +
                            colWidths.poliza +
                            colWidths.diasVencer +
                            colWidths.monto +
                            3, currentY + 3, { width: colWidths.servicios - 6, align: 'center' });
                        currentY += 18;
                        drawHorizontalLine(currentY);
                        drawVerticalLines(rowStartY, currentY);
                    }
                    currentY += 8;
                    doc.fontSize(9).font('Helvetica-Bold');
                    doc.text(`Subtotal ${rango}: $${totalGrupo.toLocaleString('es-MX')}`, tableLeft, currentY);
                    currentY += 15;
                }
                currentY += 15;
                drawHorizontalLine(currentY);
                currentY += 15;
                doc.fontSize(12).font('Helvetica-Bold');
                doc.text(`TOTAL GENERAL A PAGAR: $${totalGeneral.toLocaleString('es-MX')}`, tableLeft, currentY);
                currentY += 25;
                doc.fontSize(10).font('Helvetica-Bold');
                doc.text('RESUMEN EJECUTIVO:', tableLeft, currentY);
                currentY += 15;
                doc.fontSize(9).font('Helvetica');
                const urgentes = grupos['URGENTE ESTA SEMANA (Lun-Dom)']?.length || 0;
                const proximasDos = grupos['PROXIMAS 2 SEMANAS']?.length || 0;
                doc.text(`• URGENTE ESTA SEMANA: ${urgentes} polizas`, tableLeft, currentY);
                currentY += 12;
                doc.text(`• PROXIMAS 2 SEMANAS: ${proximasDos} polizas`, tableLeft, currentY);
                currentY += 12;
                doc.text(`• TOTAL PENDIENTES: ${pendingPolicies.length} polizas`, tableLeft, currentY);
                currentY += 25;
                doc.fontSize(8).font('Helvetica-Bold');
                doc.text('EXPLICACION DE COLUMNAS:', tableLeft, currentY);
                currentY += 12;
                doc.fontSize(7).font('Helvetica');
                doc.text('• DIAS PARA VENCER: Dias restantes antes del siguiente mes sin pago', tableLeft, currentY);
                currentY += 10;
                doc.text('• MONTO REQUERIDO: Cantidad que debe pagarse para cubrir el siguiente mes', tableLeft, currentY);
                currentY += 10;
                doc.text('• SERVICIOS: Total de servicios registrados en la poliza', tableLeft, currentY);
                doc.end();
            }
            catch (error) {
                reject(error);
            }
        });
    }
    calculateDaysUntilNextMonthUnpaid(fechaLimiteCobertura) {
        const now = new Date();
        const nextMonth = new Date(fechaLimiteCobertura);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const msDiff = nextMonth.getTime() - now.getTime();
        return Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    }
    groupByWeeklyPriority(policies) {
        const now = new Date();
        const domingo = new Date(now);
        domingo.setDate(now.getDate() + (7 - now.getDay()));
        const grupos = {
            'URGENTE ESTA SEMANA (Lun-Dom)': [],
            'PROXIMAS 2 SEMANAS': [],
            'SIGUIENTES 2 SEMANAS': [],
            'MAS DE 1 MES': [],
            'YA VENCIDAS +30 DIAS': []
        };
        for (const policy of policies) {
            const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(policy.fechaLimiteCobertura);
            if (diasHastaVencer <= 7 && diasHastaVencer > 0) {
                grupos['URGENTE ESTA SEMANA (Lun-Dom)'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 1
                });
            }
            else if (diasHastaVencer <= 14 && diasHastaVencer > 7) {
                grupos['PROXIMAS 2 SEMANAS'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 2
                });
            }
            else if (diasHastaVencer <= 28 && diasHastaVencer > 14) {
                grupos['SIGUIENTES 2 SEMANAS'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 3
                });
            }
            else if (diasHastaVencer > 28) {
                grupos['MAS DE 1 MES'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 4
                });
            }
            else {
                grupos['YA VENCIDAS +30 DIAS'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 5
                });
            }
        }
        Object.keys(grupos).forEach(key => {
            grupos[key].sort((a, b) => (a.diasHastaVencer || 0) - (b.diasHastaVencer || 0));
        });
        return grupos;
    }
    async generateReport(ctx) {
        try {
            await ctx.reply('📊 Generando reportes PDF y Excel de pagos pendientes...');
            const pendingPolicies = await this.calculatePendingPaymentsPolicies();
            const pdfBuffer = await this.generatePDF(pendingPolicies);
            const PaymentReportExcelCommand = require('./PaymentReportExcelCommand');
            const excelCommand = new PaymentReportExcelCommand(this.handler);
            const excelBuffer = await excelCommand.generateExcel(pendingPolicies);
            const tempDir = path_1.default.join(__dirname, '../../temp');
            await fs_1.promises.mkdir(tempDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const pdfFileName = `reporte_pagos_pendientes_${timestamp}.pdf`;
            const pdfFilePath = path_1.default.join(tempDir, pdfFileName);
            await fs_1.promises.writeFile(pdfFilePath, pdfBuffer);
            const excelFileName = `reporte_pagos_pendientes_${timestamp}.xlsx`;
            const excelFilePath = path_1.default.join(tempDir, excelFileName);
            await fs_1.promises.writeFile(excelFilePath, excelBuffer);
            const totalAmount = this.calculateTotalAmount(pendingPolicies);
            const criticalPolicies = pendingPolicies.filter(p => {
                const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(p.fechaLimiteCobertura);
                return diasHastaVencer <= 2 && diasHastaVencer > 0;
            }).length;
            await ctx.replyWithDocument({
                source: pdfFilePath,
                filename: pdfFileName
            }, {
                caption: `📄 Reporte PDF de Pagos Pendientes\n📅 ${new Date().toLocaleString('es-MX')}\n📊 ${pendingPolicies.length} pólizas con pagos pendientes`
            });
            await ctx.replyWithDocument({
                source: excelFilePath,
                filename: excelFileName
            }, {
                caption: `📊 Reporte Excel Multi-Hoja\n📋 3 hojas: Resumen, Detalle y Análisis\n💰 Total: $${totalAmount.toLocaleString()}`
            });
            const message = `📊 **Reportes Generados Exitosamente**\n\n` +
                `📅 **Fecha:** ${new Date().toLocaleString('es-MX')}\n` +
                `📋 **Total pólizas:** ${pendingPolicies.length}\n` +
                `💰 **Monto total:** $${totalAmount.toLocaleString()}\n` +
                `🚨 **Pólizas críticas:** ${criticalPolicies}\n\n` +
                `✅ **Archivos generados:**\n` +
                `• 📄 PDF optimizado con diseño corporativo\n` +
                `• 📊 Excel multi-hoja con análisis avanzado`;
            await this.replyWithNavigation(ctx, message);
            await fs_1.promises.unlink(pdfFilePath);
            await fs_1.promises.unlink(excelFilePath);
            logger_1.default.info(`Reporte PDF de pagos pendientes generado: ${pendingPolicies.length} pólizas`);
        }
        catch (error) {
            logger_1.default.error('Error al generar reporte PDF de pagos pendientes:', error);
            await ctx.reply('❌ Error al generar el reporte PDF. Inténtalo de nuevo.');
        }
    }
}
exports.default = PaymentReportPDFCommand;
