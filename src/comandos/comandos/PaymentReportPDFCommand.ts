// src/comandos/comandos/PaymentReportPDFCommand.ts
/**
 * Comando refactorizado para generar reporte PDF de pagos pendientes
 * Delegación a servicios especializados siguiendo SRP
 */

import BaseCommand from './BaseCommand';
import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import path from 'path';
import {
    getPaymentCalculatorService,
    type IPendingPolicy,
    type IReportStats,
    type IGroupedPolicies
} from '../../services/PaymentCalculatorService';
import logger from '../../utils/logger';

// Configuración de diseño
interface IColors {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    lightGray: string;
    white: string;
    urgent: string;
    warning: string;
    safe: string;
    tableStroke: string;
}

interface ILayout {
    margin: number;
    headerHeight: number;
    footerHeight: number;
    lineHeight: number;
    sectionSpacing: number;
}

interface IColWidths {
    poliza: number;
    diasVencer: number;
    monto: number;
    servicios: number;
}

// Servicio singleton
const calculatorService = getPaymentCalculatorService();

/**
 * Comando para generar reporte PDF de pagos pendientes - Refactorizado
 */
class PaymentReportPDFCommand extends BaseCommand {
    private colors: IColors;
    private layout: ILayout;

    constructor(handler: any) {
        super(handler);

        this.colors = {
            primary: '#2E86AB',
            secondary: '#A23B72',
            accent: '#F18F01',
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

    getCommandName(): string {
        return 'PaymentReportPDF';
    }

    getDescription(): string {
        return 'Genera un reporte PDF de pólizas con pagos pendientes.';
    }

    register(): void {
        this.logInfo(`Comando ${this.getCommandName()} cargado correctamente`);
    }

    /**
     * Genera el reporte completo
     */
    async generateReport(ctx: any): Promise<void> {
        try {
            await ctx.reply('Generando reportes PDF y Excel de pagos pendientes...');

            const pendingPolicies = await calculatorService.calculatePendingPaymentsPolicies();
            const pdfBuffer = await this.generatePDF(pendingPolicies);

            // Generar Excel
            const PaymentReportExcelCommand = require('./PaymentReportExcelCommand').default;
            const excelCommand = new PaymentReportExcelCommand(this.handler);
            const excelBuffer = await excelCommand.generateExcel(pendingPolicies);

            // Guardar archivos temporales
            const tempDir = path.join(__dirname, '../../temp');
            await fs.mkdir(tempDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const pdfFilePath = path.join(tempDir, `reporte_pagos_${timestamp}.pdf`);
            const excelFilePath = path.join(tempDir, `reporte_pagos_${timestamp}.xlsx`);

            await fs.writeFile(pdfFilePath, pdfBuffer);
            await fs.writeFile(excelFilePath, excelBuffer);

            const totalAmount = calculatorService.calculateTotalAmount(pendingPolicies);

            await ctx.replyWithDocument(
                { source: pdfFilePath, filename: `reporte_pagos_${timestamp}.pdf` },
                { caption: `Reporte PDF - ${pendingPolicies.length} polizas pendientes` }
            );

            await ctx.replyWithDocument(
                { source: excelFilePath, filename: `reporte_pagos_${timestamp}.xlsx` },
                { caption: `Reporte Excel - Total: $${totalAmount.toLocaleString()}` }
            );

            const message =
                `**Reportes Generados**\n\n` +
                `Fecha: ${new Date().toLocaleString('es-MX')}\n` +
                `Polizas: ${pendingPolicies.length}\n` +
                `Monto total: $${totalAmount.toLocaleString()}`;

            await this.replyWithNavigation(ctx, message);

            await fs.unlink(pdfFilePath);
            await fs.unlink(excelFilePath);

            logger.info(`Reporte PDF generado: ${pendingPolicies.length} polizas`);
        } catch (error) {
            logger.error('Error generando reporte PDF:', error);
            await ctx.reply('Error al generar el reporte. Intentalo de nuevo.');
        }
    }

    /**
     * Genera el buffer del PDF
     */
    async generatePDF(pendingPolicies: IPendingPolicy[]): Promise<Buffer> {
        const doc = new PDFDocument({
            margin: this.layout.margin,
            size: 'A4',
            compress: true,
            bufferPages: true,
            info: {
                Title: 'Reporte de Pagos Pendientes',
                Author: 'Polizas Bot',
                Creator: 'Polizas Bot v2.0.0',
                CreationDate: new Date()
            }
        });

        const chunks: Buffer[] = [];
        doc.on('data', chunk => chunks.push(chunk));

        return new Promise((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            try {
                doc.font('Helvetica');
                const stats = calculatorService.calculateReportStats(pendingPolicies);

                this.addCorporateHeader(doc, stats);
                doc.y = this.layout.headerHeight + this.layout.sectionSpacing;

                if (pendingPolicies.length === 0) {
                    doc.fontSize(14).text('No hay polizas con pagos pendientes', {
                        align: 'center'
                    });
                    doc.end();
                    return;
                }

                this.addUrgencyChart(doc, stats.urgencyData);
                this.addKPISection(doc, stats);

                const grupos = calculatorService.groupByWeeklyPriority(pendingPolicies);
                this.addPolicyTable(doc, grupos);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Header corporativo
     */
    private addCorporateHeader(doc: InstanceType<typeof PDFDocument>, stats: IReportStats): void {
        doc.rect(0, 0, doc.page.width, this.layout.headerHeight).fill(this.colors.primary);

        doc.fontSize(24)
            .font('Helvetica-Bold')
            .fill(this.colors.white)
            .text('POLIZAS BOT', this.layout.margin, 20);

        doc.fontSize(16).text('REPORTE DE PAGOS PENDIENTES', this.layout.margin, 45);

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

    /**
     * Gráfico de urgencia
     */
    private addUrgencyChart(
        doc: InstanceType<typeof PDFDocument>,
        urgencyData: { critical: number; urgent: number; normal: number }
    ): void {
        const chartY = doc.y + this.layout.sectionSpacing;
        const chartWidth = 400;
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

        const maxCount = Math.max(...categories.map(c => c.count), 1);
        let currentY = chartY + 25;

        categories.forEach(category => {
            const barWidth = (category.count / maxCount) * chartWidth;
            doc.rect(this.layout.margin + 120, currentY, barWidth, barHeight).fill(category.color);
            doc.fontSize(9)
                .fill(this.colors.text)
                .text(category.label, this.layout.margin, currentY + 6)
                .text(`${category.count}`, this.layout.margin + 125 + barWidth, currentY + 6);
            currentY += barHeight + 5;
        });

        doc.y = currentY + this.layout.sectionSpacing;
    }

    /**
     * Sección de KPIs
     */
    private addKPISection(doc: InstanceType<typeof PDFDocument>, stats: IReportStats): void {
        const kpiY = doc.y + this.layout.sectionSpacing;

        doc.fontSize(12)
            .font('Helvetica-Bold')
            .fill(this.colors.text)
            .text('INDICADORES CLAVE', this.layout.margin, kpiY);

        const kpis = [
            {
                label: 'Total Pendiente',
                value: `$${stats.totalAmount.toLocaleString()}`,
                color: this.colors.primary
            },
            {
                label: `Promedio (${stats.polizasConCosto} c/costo)`,
                value:
                    stats.polizasConCosto > 0
                        ? `$${Math.round(stats.totalAmount / stats.polizasConCosto).toLocaleString()}`
                        : '$0',
                color: this.colors.secondary
            },
            {
                label: 'Polizas Criticas',
                value: `${stats.criticalPolicies}`,
                color: this.colors.urgent
            }
        ];

        let currentX = this.layout.margin;
        const kpiWidth = 150;

        kpis.forEach(kpi => {
            doc.rect(currentX, kpiY + 25, kpiWidth, 60).stroke(kpi.color);
            doc.fontSize(14)
                .font('Helvetica-Bold')
                .fill(kpi.color)
                .text(kpi.value, currentX + 10, kpiY + 40);
            doc.fontSize(9)
                .font('Helvetica')
                .fill(this.colors.text)
                .text(kpi.label, currentX + 10, kpiY + 60);
            currentX += kpiWidth + 20;
        });

        doc.y = kpiY + 100;
    }

    /**
     * Tabla de pólizas
     */
    private addPolicyTable(doc: InstanceType<typeof PDFDocument>, grupos: IGroupedPolicies): void {
        const colWidths: IColWidths = { poliza: 140, diasVencer: 80, monto: 100, servicios: 80 };
        const tableLeft = 40;
        const tableWidth = Object.values(colWidths).reduce((sum, w) => sum + w, 0);
        let currentY = doc.y;
        let totalGeneral = 0;

        const drawLine = (y: number): void => {
            doc.strokeColor(this.colors.tableStroke)
                .lineWidth(1)
                .moveTo(tableLeft, y)
                .lineTo(tableLeft + tableWidth, y)
                .stroke();
        };

        // Headers
        doc.fontSize(10).font('Helvetica-Bold');
        const headerY = currentY;
        doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5, { width: colWidths.poliza - 10 });
        doc.text('DIAS VENCER', tableLeft + colWidths.poliza + 5, currentY + 5, {
            width: colWidths.diasVencer - 10,
            align: 'center'
        });
        doc.text('MONTO', tableLeft + colWidths.poliza + colWidths.diasVencer + 5, currentY + 5, {
            width: colWidths.monto - 10,
            align: 'center'
        });
        doc.text(
            'SERVICIOS',
            tableLeft + colWidths.poliza + colWidths.diasVencer + colWidths.monto + 5,
            currentY + 5,
            { width: colWidths.servicios - 10, align: 'center' }
        );

        currentY += 25;
        drawLine(headerY);
        drawLine(currentY);

        for (const [rango, items] of Object.entries(grupos)) {
            if (items.length === 0) continue;

            currentY += 10;
            doc.fontSize(11).font('Helvetica-Bold');
            const prioridadText =
                items[0]?.prioridad === 1
                    ? 'URGENTE: '
                    : items[0]?.prioridad === 2
                      ? 'ATENCION: '
                      : 'REVISAR: ';
            doc.text(`${prioridadText}${rango} (${items.length} polizas)`, tableLeft, currentY);
            currentY += 20;

            let totalGrupo = 0;
            doc.fontSize(8).font('Helvetica');

            for (const item of items) {
                if (currentY > 720) {
                    doc.addPage();
                    currentY = 40;
                    doc.fontSize(10).font('Helvetica-Bold');
                    doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5);
                    currentY += 25;
                    drawLine(currentY - 25);
                    drawLine(currentY);
                    doc.fontSize(8).font('Helvetica');
                }

                const monto = item.montoRequerido || item.montoReferencia || 0;
                totalGrupo += monto;
                totalGeneral += monto;

                doc.text(item.numeroPoliza, tableLeft + 3, currentY + 3, {
                    width: colWidths.poliza - 6
                });
                doc.text(
                    (item.diasHastaVencer || 0).toString(),
                    tableLeft + colWidths.poliza + 3,
                    currentY + 3,
                    { width: colWidths.diasVencer - 6, align: 'center' }
                );
                doc.text(
                    `$${monto.toLocaleString('es-MX')}`,
                    tableLeft + colWidths.poliza + colWidths.diasVencer + 3,
                    currentY + 3,
                    { width: colWidths.monto - 6, align: 'right' }
                );
                doc.text(
                    (item.servicios?.length || 0).toString(),
                    tableLeft + colWidths.poliza + colWidths.diasVencer + colWidths.monto + 3,
                    currentY + 3,
                    { width: colWidths.servicios - 6, align: 'center' }
                );

                currentY += 18;
                drawLine(currentY);
            }

            currentY += 8;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text(
                `Subtotal ${rango}: $${totalGrupo.toLocaleString('es-MX')}`,
                tableLeft,
                currentY
            );
            currentY += 15;
        }

        // Total general
        currentY += 15;
        drawLine(currentY);
        currentY += 15;
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`TOTAL GENERAL: $${totalGeneral.toLocaleString('es-MX')}`, tableLeft, currentY);
    }
}

export default PaymentReportPDFCommand;
