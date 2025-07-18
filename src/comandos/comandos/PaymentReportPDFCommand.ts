// src/comandos/comandos/PaymentReportPDFCommand.ts
/**
 * 📄 COMANDO OPTIMIZADO: Reporte PDF de Pagos Pendientes
 *
 * MEJORAS IMPLEMENTADAS (FASE 3):
 * ✅ Diseño visual moderno con colores corporativos
 * ✅ Headers con gradientes y branding
 * ✅ Gráficos de resumen y urgencia
 * ✅ Compresión y optimización
 * ✅ Navegación persistente integrada
 *
 * Lógica mejorada: calcula días de impago por período específico (no acumulativo)
 */

import BaseCommand from './BaseCommand';
import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import path from 'path';
import Policy from '../../models/policy';
import logger from '../../utils/logger';

// Interfaces TypeScript
interface Colors {
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    text: string;
    lightGray: string;
    white: string;
    urgent: string;
    warning: string;
    safe: string;
    tableStroke: string;
}

interface Layout {
    margin: number;
    headerHeight: number;
    footerHeight: number;
    lineHeight: number;
    sectionSpacing: number;
}

interface Servicio {
    nombre?: string;
    tipo?: string;
    [key: string]: any;
}

interface Pago {
    estado: 'REALIZADO' | 'PLANIFICADO' | 'PENDIENTE';
    monto: number;
    fecha?: Date;
    [key: string]: any;
}

interface PolicyData {
    numeroPoliza: string;
    fechaEmision: string | Date;
    pagos?: Pago[];
    estadoPoliza?: string;
    servicios?: Servicio[];
    estado: string;
    [key: string]: any;
}

interface PendingPolicy {
    numeroPoliza: string;
    diasDeImpago: number;
    montoRequerido: number;
    montoReferencia: number | null;
    fuenteMonto: string;
    estadoPoliza: string;
    pagosRealizados: number;
    diasTranscurridos: number;
    fechaLimiteCobertura: Date;
    fechaEmision: Date;
    servicios: Servicio[];
    diasHastaVencer?: number;
    prioridad?: number;
}

interface ReportStats {
    totalPolicies: number;
    totalAmount: number;
    polizasConCosto: number;
    criticalPolicies: number;
    urgencyData: {
        critical: number;
        urgent: number;
        normal: number;
    };
}

interface UrgencyData {
    critical: number;
    urgent: number;
    normal: number;
}

interface KPI {
    label: string;
    value: string;
    icon: string;
    color: string;
}

interface ColWidths {
    poliza: number;
    diasVencer: number;
    monto: number;
    servicios: number;
}

interface GroupedPolicies {
    [key: string]: PendingPolicy[];
}

interface ReportMetadata {
    version?: string;
    totalRecords: number;
}

interface TelegramContext {
    reply: (message: string) => Promise<any>;
    replyWithDocument: (document: any, options?: any) => Promise<any>;
}

class PaymentReportPDFCommand extends BaseCommand {
    private colors: Colors;
    private layout: Layout;

    constructor(handler: any) {
        super(handler);

        // 🎨 CONFIGURACIÓN DE DISEÑO CORPORATIVO
        this.colors = {
            primary: '#2E86AB', // Azul corporativo
            secondary: '#A23B72', // Magenta
            accent: '#F18F01', // Naranja
            success: '#C73E1D', // Rojo/urgente
            text: '#2C3E50', // Gris oscuro
            lightGray: '#ECF0F1', // Gris claro
            white: '#FFFFFF',
            urgent: '#E74C3C', // Rojo urgente
            warning: '#F39C12', // Amarillo advertencia
            safe: '#27AE60', // Verde seguro
            tableStroke: '#E74C3C' // Color estándar para TODAS las tablas (naranja/rojo)
        };

        // 📏 CONFIGURACIÓN DE LAYOUT
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

    /**
     * Calcula el día anterior del mismo número de mes
     * Ej: emisión 5 enero → pago requerido 4 febrero
     */
    calculatePaymentDueDate(emissionDate: string | Date, monthsToAdd: number): Date {
        const date = new Date(emissionDate);
        date.setMonth(date.getMonth() + monthsToAdd);

        // Restar un día para el pago requerido
        date.setDate(date.getDate() - 1);

        // Manejar casos de fin de mes (ej: 30 de febrero → 28/29 febrero)
        const originalMonth = new Date(emissionDate).getMonth() + monthsToAdd;
        if (date.getMonth() !== originalMonth % 12) {
            // Se pasó al siguiente mes, ajustar al último día del mes correcto
            date.setDate(0);
        }

        return date;
    }

    /**
     * Calcula correctamente los días cubiertos por meses reales
     */
    calculateMonthsCoveredByPayments(emissionDate: string | Date, paymentsCount: number): Date {
        const emission = new Date(emissionDate);
        const coverageEndDate = new Date(emission);

        // Agregar meses según la cantidad de pagos realizados
        coverageEndDate.setMonth(coverageEndDate.getMonth() + paymentsCount);

        // Restar un día para obtener el último día cubierto
        coverageEndDate.setDate(coverageEndDate.getDate() - 1);

        return coverageEndDate;
    }

    /**
     * Lógica corregida: cálculo real por meses y lógica correcta de pagos planificados
     */
    async calculatePendingPaymentsPolicies(): Promise<PendingPolicy[]> {
        try {
            const policies: PolicyData[] = await Policy.find({ estado: 'ACTIVO' }).lean();
            const now = new Date();
            const pendingPolicies: PendingPolicy[] = [];

            for (const policy of policies) {
                const {
                    numeroPoliza,
                    fechaEmision,
                    pagos = [],
                    estadoPoliza,
                    servicios = []
                } = policy;

                if (!fechaEmision) continue;

                // Filtrar SOLO pagos REALIZADOS (dinero real recibido)
                const pagosRealizados = pagos.filter((pago: Pago) => pago.estado === 'REALIZADO');
                const pagosPlanificados = pagos.filter(
                    (pago: Pago) => pago.estado === 'PLANIFICADO'
                );

                // Calcular fecha límite de cobertura basada en pagos realizados
                const fechaLimiteCobertura = this.calculateMonthsCoveredByPayments(
                    fechaEmision,
                    pagosRealizados.length
                );

                // Calcular días de impago (si la fecha actual supera la cobertura)
                let diasDeImpago = 0;
                if (now > fechaLimiteCobertura) {
                    const msImpago = now.getTime() - fechaLimiteCobertura.getTime();
                    diasDeImpago = Math.floor(msImpago / (1000 * 60 * 60 * 24));
                }

                // Solo incluir pólizas con impago > 0
                if (diasDeImpago > 0) {
                    // LÓGICA CORREGIDA DE PAGOS PLANIFICADOS:
                    // - 0 pagos realizados → usar Pago 1 (primer mes)
                    // - 1+ pagos realizados → usar Pago 2 (meses 2-12)
                    let montoRequerido = 0;
                    let montoReferencia: number | null = null;
                    let fuenteMonto = 'SIN_DATOS';

                    if (pagosPlanificados.length > 0) {
                        if (pagosRealizados.length === 0) {
                            // Sin pagos realizados → necesita Pago 1 (primer mes)
                            if (pagosPlanificados[0]) {
                                montoRequerido = pagosPlanificados[0].monto;
                                fuenteMonto = 'PLANIFICADO_P1';
                            }
                        } else {
                            // Ya hay pagos realizados → necesita Pago 2 (meses subsecuentes)
                            if (pagosPlanificados[1]) {
                                montoRequerido = pagosPlanificados[1].monto;
                                fuenteMonto = 'PLANIFICADO_P2';
                            } else if (pagosPlanificados[0]) {
                                // Fallback: usar Pago 1 si no existe Pago 2
                                montoRequerido = pagosPlanificados[0].monto;
                                fuenteMonto = 'PLANIFICADO_P1_FALLBACK';
                            }
                        }
                    }

                    // Fallback: usar último pago realizado como referencia si no hay planificados
                    if (montoRequerido === 0 && pagosRealizados.length > 0) {
                        const ultimoPago = pagosRealizados[pagosRealizados.length - 1];
                        montoReferencia = ultimoPago.monto;
                        fuenteMonto = 'REFERENCIA_ULTIMO_PAGO';
                    }

                    // Calcular días transcurridos desde emisión
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

            // Ordenar por días de impago (descendente)
            return pendingPolicies.sort((a, b) => b.diasDeImpago - a.diasDeImpago);
        } catch (error) {
            logger.error('Error al calcular pólizas con pagos pendientes:', error);
            throw error;
        }
    }

    // 🎨 MÉTODOS DE DISEÑO OPTIMIZADO (FASE 3)

    /**
     * 📊 Calcula estadísticas para el reporte
     * @param pendingPolicies - Pólizas con pagos pendientes
     * @returns Estadísticas calculadas
     */
    calculateReportStats(pendingPolicies: PendingPolicy[]): ReportStats {
        const totalPolicies = pendingPolicies.length;
        let totalAmount = 0;
        let criticalPolicies = 0;
        let urgent = 0;
        let normal = 0;
        let polizasConCosto = 0; // Contador de pólizas con costo > 0

        pendingPolicies.forEach(policy => {
            const amount = policy.montoRequerido || policy.montoReferencia || 0;
            totalAmount += amount;

            // Contar solo pólizas con costo > 0 para el promedio real
            if (amount > 0) {
                polizasConCosto++;
            }

            // Calcular días hasta vencer para determinar urgencia real
            const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(
                policy.fechaLimiteCobertura
            );

            // Calcular urgencia basada en días HASTA VENCER - CRITICAS: <=2 días para vencer
            if (diasHastaVencer <= 2 && diasHastaVencer > 0) {
                criticalPolicies++;
            } else if (diasHastaVencer <= 7 && diasHastaVencer > 0) {
                urgent++;
            } else if (diasHastaVencer <= 15 && diasHastaVencer > 0) {
                urgent++;
            } else {
                normal++;
            }
        });

        return {
            totalPolicies,
            totalAmount,
            polizasConCosto, // Para cálculo de promedio real
            criticalPolicies, // Solo <=2 días
            urgencyData: {
                critical: criticalPolicies, // <=2 días
                urgent: urgent, // 3-15 días
                normal // >15 días
            }
        };
    }

    /**
     * 💰 Calcula el monto total de todas las pólizas pendientes
     * @param pendingPolicies - Pólizas con pagos pendientes
     * @returns Monto total
     */
    calculateTotalAmount(pendingPolicies: PendingPolicy[]): number {
        return pendingPolicies.reduce((total, policy) => {
            const amount = policy.montoRequerido || policy.montoReferencia || 0;
            return total + amount;
        }, 0);
    }

    /**
     * 🏢 Genera header corporativo con gradiente y branding
     * @param doc - Documento PDF
     * @param stats - Estadísticas del reporte
     */
    addCorporateHeader(doc: PDFDocument, stats: ReportStats): void {
        const { margin, headerHeight } = this.layout;

        // Fondo con gradiente corporativo
        doc.rect(0, 0, doc.page.width, headerHeight).fill(this.colors.primary);

        // Logo/Branding (SIN EMOJIS para evitar problemas de encoding)
        doc.fontSize(24)
            .font('Helvetica-Bold')
            .fill(this.colors.white)
            .text('POLIZAS BOT', margin, 20);

        // Título del reporte
        doc.fontSize(16).text('REPORTE DE PAGOS PENDIENTES', margin, 45);

        // Fecha y estadísticas en header
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
     * 📊 Genera gráfico de barras de urgencia
     * @param doc - Documento PDF
     * @param urgencyData - Datos de urgencia
     */
    addUrgencyChart(doc: PDFDocument, urgencyData: UrgencyData): void {
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

            // Barra de color
            doc.rect(this.layout.margin + 120, currentY, barWidth, barHeight).fill(category.color);

            // Etiqueta
            doc.fontSize(9)
                .fill(this.colors.text)
                .text(category.label, this.layout.margin, currentY + 6);

            // Cantidad
            doc.text(`${category.count}`, this.layout.margin + 120 + barWidth + 5, currentY + 6);

            currentY += barHeight + 5;
        });

        doc.y = currentY + this.layout.sectionSpacing;
    }

    /**
     * 🔢 Genera sección de KPIs principales
     * @param doc - Documento PDF
     * @param stats - Estadísticas calculadas
     */
    addKPISection(doc: PDFDocument, stats: ReportStats): void {
        const kpiY = doc.y + this.layout.sectionSpacing;

        doc.fontSize(12)
            .font('Helvetica-Bold')
            .fill(this.colors.text)
            .text('INDICADORES CLAVE', this.layout.margin, kpiY);

        const kpis: KPI[] = [
            {
                label: 'Total Pendiente',
                value: `$${stats.totalAmount.toLocaleString()}`,
                icon: '$',
                color: this.colors.primary
            },
            {
                label: `Promedio (${stats.polizasConCosto} c/costo)`,
                value:
                    stats.polizasConCosto > 0
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
            // Caja de KPI
            doc.rect(currentX, kpiY + 25, kpiWidth, 60).stroke(kpi.color);

            // Fondo ligero
            doc.rect(currentX, kpiY + 25, kpiWidth, 60)
                .fillOpacity(0.1)
                .fill(this.colors.lightGray)
                .fillOpacity(1); // Restaurar opacidad normal

            // Icono y valor
            doc.fontSize(16)
                .fill(kpi.color)
                .text(kpi.icon, currentX + 10, kpiY + 35);

            doc.fontSize(14)
                .font('Helvetica-Bold')
                .text(kpi.value, currentX + 35, kpiY + 35);

            // Label
            doc.fontSize(9)
                .font('Helvetica')
                .fill(this.colors.text)
                .text(kpi.label, currentX + 10, kpiY + 60);

            currentX += kpiWidth + 20;
        });

        doc.y = kpiY + 100;
    }

    /**
     * 🦶 Genera footer optimizado con metadata
     * @param doc - Documento PDF
     * @param pageNumber - Número de página
     * @param metadata - Metadatos del reporte
     */
    addOptimizedFooter(doc: PDFDocument, pageNumber: number, metadata: ReportMetadata): void {
        const footerY = doc.page.height - this.layout.footerHeight;

        // Línea separadora
        doc.moveTo(this.layout.margin, footerY)
            .lineTo(doc.page.width - this.layout.margin, footerY)
            .stroke(this.colors.lightGray);

        // Información del footer (SIN EMOJIS)
        doc.fontSize(8)
            .fill(this.colors.text)
            .text(`Pagina ${pageNumber}`, this.layout.margin, footerY + 10)
            .text(`${new Date().toISOString()}`, this.layout.margin, footerY + 25)
            .text(
                `Generado por Polizas Bot v${metadata.version || '2.0.0'}`,
                doc.page.width - 200,
                footerY + 10
            )
            .text(
                `${metadata.totalRecords} registros procesados`,
                doc.page.width - 200,
                footerY + 25
            );
    }

    /**
     * Genera el PDF del reporte OPTIMIZADO
     */
    async generatePDF(pendingPolicies: PendingPolicy[]): Promise<Buffer> {
        // 📄 Configuración optimizada del documento con compresión y UTF-8
        const doc = new PDFDocument({
            margin: this.layout.margin,
            size: 'A4',
            compress: true, // ✅ Compresión activada
            bufferPages: true, // Para mejor manejo de caracteres
            info: {
                Title: 'Reporte de Pagos Pendientes',
                Author: 'Polizas Bot',
                Subject: 'Análisis de pagos pendientes',
                Creator: 'Polizas Bot v2.0.0',
                Producer: 'PDFKit',
                CreationDate: new Date()
            }
        });
        const chunks: Buffer[] = [];

        doc.on('data', chunk => chunks.push(chunk));

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve(pdfBuffer);
            });

            doc.on('error', reject);

            try {
                // Configurar fuente estándar para evitar problemas de encoding
                doc.font('Helvetica');

                // HEADER CORPORATIVO CON ESTADÍSTICAS (SIN EMOJIS)
                const stats = this.calculateReportStats(pendingPolicies);
                this.addCorporateHeader(doc, stats);

                // Posicionar después del header corporativo
                doc.y = this.layout.headerHeight + this.layout.sectionSpacing;

                if (pendingPolicies.length === 0) {
                    doc.fontSize(14);
                    doc.text('No hay polizas con pagos pendientes', { align: 'center' });
                    doc.end();
                    return;
                }

                // 📊 SECCIONES DE ANÁLISIS VISUAL
                this.addUrgencyChart(doc, stats.urgencyData);
                this.addKPISection(doc, stats);

                // Agrupar por prioridad semanal
                const grupos = this.groupByWeeklyPriority(pendingPolicies);
                let totalGeneral = 0;

                // Configuración de tabla con cuadrícula
                const tableTop = doc.y;
                const colWidths: ColWidths = {
                    poliza: 140,
                    diasVencer: 80,
                    monto: 100,
                    servicios: 80
                };
                const tableLeft = 40;
                const tableWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
                let currentY = tableTop;

                // Función para dibujar línea horizontal con color estándar
                const drawHorizontalLine = (y: number): void => {
                    doc.strokeColor(this.colors.tableStroke)
                        .lineWidth(1)
                        .moveTo(tableLeft, y)
                        .lineTo(tableLeft + tableWidth, y)
                        .stroke();
                };

                // Función para dibujar líneas verticales con color estándar
                const drawVerticalLines = (y1: number, y2: number): void => {
                    let x = tableLeft;
                    doc.strokeColor(this.colors.tableStroke).lineWidth(1);

                    // Línea izquierda
                    doc.moveTo(x, y1).lineTo(x, y2).stroke();

                    // Líneas entre columnas
                    for (const width of Object.values(colWidths)) {
                        x += width;
                        doc.moveTo(x, y1).lineTo(x, y2).stroke();
                    }
                };

                // Encabezados de tabla
                doc.fontSize(10).font('Helvetica-Bold');
                const headerY = currentY;
                doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5, {
                    width: colWidths.poliza - 10
                });
                doc.text('DIAS PARA VENCER', tableLeft + colWidths.poliza + 5, currentY + 5, {
                    width: colWidths.diasVencer - 10,
                    align: 'center'
                });
                doc.text(
                    'MONTO REQUERIDO',
                    tableLeft + colWidths.poliza + colWidths.diasVencer + 5,
                    currentY + 5,
                    { width: colWidths.monto - 10, align: 'center' }
                );
                doc.text(
                    'SERVICIOS',
                    tableLeft + colWidths.poliza + colWidths.diasVencer + colWidths.monto + 5,
                    currentY + 5,
                    { width: colWidths.servicios - 10, align: 'center' }
                );

                currentY += 25;

                // Dibujar bordes del encabezado
                drawHorizontalLine(headerY);
                drawHorizontalLine(currentY);
                drawVerticalLines(headerY, currentY);

                // Generar contenido por grupos
                for (const [rango, items] of Object.entries(grupos)) {
                    if (items.length === 0) continue; // Saltar grupos vacíos

                    // Encabezado de grupo con prioridad (SIN ICONOS para evitar caracteres extraños)
                    currentY += 10;
                    doc.fontSize(11).font('Helvetica-Bold');
                    const prioridadText =
                        items[0]?.prioridad === 1
                            ? 'URGENTE: '
                            : items[0]?.prioridad === 2
                              ? 'ATENCION: '
                              : items[0]?.prioridad && items[0].prioridad <= 3
                                ? 'PROGRAMAR: '
                                : 'REVISAR: ';
                    doc.text(
                        `${prioridadText}${rango} (${items.length} polizas)`,
                        tableLeft,
                        currentY
                    );
                    currentY += 20;

                    let totalGrupo = 0;
                    doc.fontSize(8).font('Helvetica');

                    const groupStartY = currentY;

                    for (const item of items) {
                        // Verificar si necesitamos nueva página
                        if (currentY > 720) {
                            doc.addPage();
                            currentY = 40;

                            // Redibujar encabezados en nueva página CON MISMO COLOR Y FORMATO
                            doc.fontSize(10).font('Helvetica-Bold');
                            const newHeaderY = currentY;
                            doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5, {
                                width: colWidths.poliza - 10
                            });
                            doc.text(
                                'DIAS PARA VENCER',
                                tableLeft + colWidths.poliza + 5,
                                currentY + 5,
                                {
                                    width: colWidths.diasVencer - 10,
                                    align: 'center'
                                }
                            );
                            doc.text(
                                'MONTO REQUERIDO',
                                tableLeft + colWidths.poliza + colWidths.diasVencer + 5,
                                currentY + 5,
                                { width: colWidths.monto - 10, align: 'center' }
                            );
                            doc.text(
                                'SERVICIOS',
                                tableLeft +
                                    colWidths.poliza +
                                    colWidths.diasVencer +
                                    colWidths.monto +
                                    5,
                                currentY + 5,
                                { width: colWidths.servicios - 10, align: 'center' }
                            );
                            currentY += 25;

                            // USAR LAS MISMAS FUNCIONES DE COLOR
                            drawHorizontalLine(newHeaderY);
                            drawHorizontalLine(currentY);
                            drawVerticalLines(newHeaderY, currentY);
                            doc.fontSize(8).font('Helvetica');
                        }

                        const monto = item.montoRequerido || item.montoReferencia || 0;
                        totalGrupo += monto;
                        totalGeneral += monto;

                        const rowStartY = currentY;

                        // Calcular número de servicios
                        const numServicios = item.servicios?.length || 0;

                        // Contenido de las celdas con mejor alineación
                        doc.text(item.numeroPoliza, tableLeft + 3, currentY + 3, {
                            width: colWidths.poliza - 6,
                            align: 'left'
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
                            numServicios.toString(),
                            tableLeft +
                                colWidths.poliza +
                                colWidths.diasVencer +
                                colWidths.monto +
                                3,
                            currentY + 3,
                            { width: colWidths.servicios - 6, align: 'center' }
                        );

                        currentY += 18;

                        // Dibujar líneas de la fila
                        drawHorizontalLine(currentY);
                        drawVerticalLines(rowStartY, currentY);
                    }

                    // Subtotal del grupo
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
                drawHorizontalLine(currentY);
                currentY += 15;
                doc.fontSize(12).font('Helvetica-Bold');
                doc.text(
                    `TOTAL GENERAL A PAGAR: $${totalGeneral.toLocaleString('es-MX')}`,
                    tableLeft,
                    currentY
                );

                // Resumen ejecutivo
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
                doc.text(
                    `• TOTAL PENDIENTES: ${pendingPolicies.length} polizas`,
                    tableLeft,
                    currentY
                );

                // Leyenda
                currentY += 25;
                doc.fontSize(8).font('Helvetica-Bold');
                doc.text('EXPLICACION DE COLUMNAS:', tableLeft, currentY);
                currentY += 12;
                doc.fontSize(7).font('Helvetica');
                doc.text(
                    '• DIAS PARA VENCER: Dias restantes antes del siguiente mes sin pago',
                    tableLeft,
                    currentY
                );
                currentY += 10;
                doc.text(
                    '• MONTO REQUERIDO: Cantidad que debe pagarse para cubrir el siguiente mes',
                    tableLeft,
                    currentY
                );
                currentY += 10;
                doc.text(
                    '• SERVICIOS: Total de servicios registrados en la poliza',
                    tableLeft,
                    currentY
                );

                // Footer eliminado para evitar páginas en blanco

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Calcula cuántos días faltan para que una póliza caiga en el siguiente mes sin pago
     */
    calculateDaysUntilNextMonthUnpaid(fechaLimiteCobertura: Date): number {
        const now = new Date();
        const nextMonth = new Date(fechaLimiteCobertura);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const msDiff = nextMonth.getTime() - now.getTime();
        return Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    }

    /**
     * Agrupa por prioridad semanal - URGENTE: las que caen en impago esta semana
     */
    groupByWeeklyPriority(policies: PendingPolicy[]): GroupedPolicies {
        const now = new Date();
        const domingo = new Date(now);
        domingo.setDate(now.getDate() + (7 - now.getDay())); // Próximo domingo

        const grupos: GroupedPolicies = {
            'URGENTE ESTA SEMANA (Lun-Dom)': [],
            'PROXIMAS 2 SEMANAS': [],
            'SIGUIENTES 2 SEMANAS': [],
            'MAS DE 1 MES': [],
            'YA VENCIDAS +30 DIAS': []
        };

        for (const policy of policies) {
            const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(
                policy.fechaLimiteCobertura
            );

            // PRIORIDAD 1: Las que vencen esta semana (lunes a domingo)
            if (diasHastaVencer <= 7 && diasHastaVencer > 0) {
                grupos['URGENTE ESTA SEMANA (Lun-Dom)'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 1
                });
            }
            // PRIORIDAD 2: Próximas 2 semanas
            else if (diasHastaVencer <= 14 && diasHastaVencer > 7) {
                grupos['PROXIMAS 2 SEMANAS'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 2
                });
            }
            // PRIORIDAD 3: Siguientes 2 semanas
            else if (diasHastaVencer <= 28 && diasHastaVencer > 14) {
                grupos['SIGUIENTES 2 SEMANAS'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 3
                });
            }
            // PRIORIDAD 4: Más de 1 mes
            else if (diasHastaVencer > 28) {
                grupos['MAS DE 1 MES'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 4
                });
            }
            // PRIORIDAD 5: Ya están muy vencidas (+30 días de impago)
            else {
                grupos['YA VENCIDAS +30 DIAS'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 5
                });
            }
        }

        // Ordenar cada grupo por días hasta vencer (ascendente - más urgente primero)
        Object.keys(grupos).forEach(key => {
            grupos[key].sort((a, b) => (a.diasHastaVencer || 0) - (b.diasHastaVencer || 0));
        });

        return grupos;
    }

    /**
     * Genera el reporte completo y lo guarda
     */
    async generateReport(ctx: TelegramContext): Promise<void> {
        try {
            await ctx.reply('📊 Generando reportes PDF y Excel de pagos pendientes...');

            // Calcular datos
            const pendingPolicies = await this.calculatePendingPaymentsPolicies();

            // Generar PDF
            const pdfBuffer = await this.generatePDF(pendingPolicies);

            // Generar Excel usando el comando Excel
            const PaymentReportExcelCommand = require('./PaymentReportExcelCommand');
            const excelCommand = new PaymentReportExcelCommand(this.handler);
            const excelBuffer = await excelCommand.generateExcel(pendingPolicies);

            // Guardar archivos temporales
            const tempDir = path.join(__dirname, '../../temp');
            await fs.mkdir(tempDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

            // Archivo PDF
            const pdfFileName = `reporte_pagos_pendientes_${timestamp}.pdf`;
            const pdfFilePath = path.join(tempDir, pdfFileName);
            await fs.writeFile(pdfFilePath, pdfBuffer);

            // Archivo Excel
            const excelFileName = `reporte_pagos_pendientes_${timestamp}.xlsx`;
            const excelFilePath = path.join(tempDir, excelFileName);
            await fs.writeFile(excelFilePath, excelBuffer);

            // Calcular estadísticas para los mensajes
            const totalAmount = this.calculateTotalAmount(pendingPolicies);
            const criticalPolicies = pendingPolicies.filter(p => {
                const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(
                    p.fechaLimiteCobertura
                );
                return diasHastaVencer <= 2 && diasHastaVencer > 0;
            }).length;

            // Enviar archivo PDF
            await ctx.replyWithDocument(
                {
                    source: pdfFilePath,
                    filename: pdfFileName
                },
                {
                    caption: `📄 Reporte PDF de Pagos Pendientes\n📅 ${new Date().toLocaleString('es-MX')}\n📊 ${pendingPolicies.length} pólizas con pagos pendientes`
                }
            );

            // Enviar archivo Excel
            await ctx.replyWithDocument(
                {
                    source: excelFilePath,
                    filename: excelFileName
                },
                {
                    caption: `📊 Reporte Excel Multi-Hoja\n📋 3 hojas: Resumen, Detalle y Análisis\n💰 Total: $${totalAmount.toLocaleString()}`
                }
            );

            // Mensaje final con navegación persistente
            const message =
                `📊 **Reportes Generados Exitosamente**\n\n` +
                `📅 **Fecha:** ${new Date().toLocaleString('es-MX')}\n` +
                `📋 **Total pólizas:** ${pendingPolicies.length}\n` +
                `💰 **Monto total:** $${totalAmount.toLocaleString()}\n` +
                `🚨 **Pólizas críticas:** ${criticalPolicies}\n\n` +
                `✅ **Archivos generados:**\n` +
                `• 📄 PDF optimizado con diseño corporativo\n` +
                `• 📊 Excel multi-hoja con análisis avanzado`;

            await this.replyWithNavigation(ctx, message);

            // Limpiar archivos temporales
            await fs.unlink(pdfFilePath);
            await fs.unlink(excelFilePath);

            logger.info(
                `Reporte PDF de pagos pendientes generado: ${pendingPolicies.length} pólizas`
            );
        } catch (error) {
            logger.error('Error al generar reporte PDF de pagos pendientes:', error);
            await ctx.reply('❌ Error al generar el reporte PDF. Inténtalo de nuevo.');
        }
    }
}

export default PaymentReportPDFCommand;
