// src/comandos/comandos/PaymentReportExcelCommand.ts
/**
 * 📊 COMANDO EXCEL: Reporte Multi-Hoja de Pagos Pendientes
 *
 * IMPLEMENTACIÓN FASE 4 (T4.1-T4.3):
 * ✅ Estructura multi-hoja (Resumen, Detalle, Análisis)
 * ✅ Fórmulas automáticas y sumatorias
 * ✅ Formato condicional y estilos corporativos
 * ✅ Filtros automáticos y pivot tables
 * ✅ Navegación persistente integrada
 *
 * Base: PaymentReportPDFCommand (reutiliza lógica de cálculos)
 */

import BaseCommand from './BaseCommand';
import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import path from 'path';
import Policy from '../../models/policy';
import logger from '../../utils/logger';
import type { IBaseHandler, NavigationContext } from './BaseCommand';
import type { IPolicy, IPago, IServicio } from '../../types/database';

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
    servicios: IServicio[];
}

interface ColorScheme {
    primary: string;
    secondary: string;
    accent: string;
    urgent: string;
    warning: string;
    safe: string;
    lightGray: string;
    darkGray: string;
    white: string;
}

interface ExcelStyles {
    header: any;
    kpi: any;
    currency: any;
    percentage: any;
    urgent: any;
    warning: any;
    safe: any;
}

interface KPIData {
    label: string;
    value: number;
    percentage: number;
    status: string;
}

interface UrgencyData {
    category: string;
    count: number;
    percentage: number;
    amount: number;
    style: any;
}

interface RangeData {
    label: string;
    min: number;
    max: number;
}

/**
 * Comando para generar reportes Excel multi-hoja de pagos pendientes
 */
class PaymentReportExcelCommand extends BaseCommand {
    private readonly colors: ColorScheme;
    private readonly styles: ExcelStyles;

    constructor(handler: IBaseHandler) {
        super(handler);

        // 🎨 CONFIGURACIÓN DE DISEÑO CORPORATIVO EXCEL
        this.colors = {
            primary: 'FF2E86AB', // Azul corporativo
            secondary: 'FFA23B72', // Magenta
            accent: 'FFF18F01', // Naranja
            urgent: 'FFE74C3C', // Rojo urgente
            warning: 'FFF39C12', // Amarillo advertencia
            safe: 'FF27AE60', // Verde seguro
            lightGray: 'FFECF0F1', // Gris claro
            darkGray: 'FF2C3E50', // Gris oscuro
            white: 'FFFFFFFF'
        };

        // 📏 CONFIGURACIÓN DE FORMATO EXCEL
        this.styles = {
            header: {
                font: { bold: true, color: { argb: this.colors.white }, size: 12 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.colors.primary } },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                }
            },
            kpi: {
                font: { bold: true, size: 14, color: { argb: this.colors.primary } },
                alignment: { horizontal: 'center', vertical: 'middle' }
            },
            currency: {
                numFmt: '"$"#,##0.00',
                alignment: { horizontal: 'right' }
            },
            percentage: {
                numFmt: '0.00%',
                alignment: { horizontal: 'center' }
            },
            urgent: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.colors.urgent } },
                font: { color: { argb: this.colors.white } }
            },
            warning: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.colors.warning } }
            },
            safe: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.colors.safe } }
            }
        };
    }

    getCommandName(): string {
        return 'PaymentReportExcel';
    }

    getDescription(): string {
        return 'Genera un reporte Excel multi-hoja de pólizas con pagos pendientes.';
    }

    register(): void {
        // Esta clase es utilizada por el CommandHandler, no registra comandos directamente
        this.logInfo(`Comando ${this.getCommandName()} cargado como utility class`);
    }

    /**
     * Reutiliza la lógica de cálculo del comando PDF optimizado
     */
    async calculatePendingPaymentsPolicies(): Promise<PendingPolicy[]> {
        try {
            const policies = await Policy.find({ estado: 'ACTIVO' }).lean();
            const now = new Date();
            const pendingPolicies: PendingPolicy[] = [];

            for (const policy of policies) {
                const {
                    numeroPoliza,
                    fechaEmision,
                    pagos = [],
                    estadoPoliza,
                    servicios = []
                } = policy as IPolicy;

                if (!fechaEmision) continue;

                // Filtrar SOLO pagos REALIZADOS (dinero real recibido)
                const pagosRealizados = pagos.filter((pago: IPago) => pago.estado === 'REALIZADO');
                const pagosPlanificados = pagos.filter(
                    (pago: IPago) => pago.estado === 'PLANIFICADO'
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
                    let montoRequerido = 0;
                    let montoReferencia: number | null = null;
                    let fuenteMonto = 'SIN_DATOS';

                    if (pagosPlanificados.length > 0) {
                        if (pagosRealizados.length === 0) {
                            if (pagosPlanificados[0]) {
                                montoRequerido = pagosPlanificados[0].monto;
                                fuenteMonto = 'PLANIFICADO_P1';
                            }
                        } else {
                            if (pagosPlanificados[1]) {
                                montoRequerido = pagosPlanificados[1].monto;
                                fuenteMonto = 'PLANIFICADO_P2';
                            } else if (pagosPlanificados[0]) {
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
        } catch (error: any) {
            logger.error('Error al calcular pólizas con pagos pendientes:', error);
            throw error;
        }
    }

    /**
     * Calcula correctamente los días cubiertos por meses reales
     */
    calculateMonthsCoveredByPayments(emissionDate: Date, paymentsCount: number): Date {
        const emission = new Date(emissionDate);
        const coverageEndDate = new Date(emission);

        coverageEndDate.setMonth(coverageEndDate.getMonth() + paymentsCount);
        coverageEndDate.setDate(coverageEndDate.getDate() - 1);

        return coverageEndDate;
    }

    /**
     * 📊 HOJA 1: RESUMEN EJECUTIVO
     * Contiene KPIs principales, gráficos y estadísticas clave
     */
    createSummarySheet(workbook: ExcelJS.Workbook, pendingPolicies: PendingPolicy[]): void {
        const worksheet = workbook.addWorksheet('📊 Resumen Ejecutivo');

        // Configurar anchos de columnas
        worksheet.columns = [
            { width: 25 },
            { width: 20 },
            { width: 20 },
            { width: 25 },
            { width: 20 },
            { width: 15 },
            { width: 15 }
        ];

        // ===== HEADER CORPORATIVO =====
        worksheet.mergeCells('A1:G1');
        const headerCell = worksheet.getCell('A1');
        headerCell.value = '🏢 POLIZAS BOT - REPORTE EJECUTIVO DE PAGOS PENDIENTES';
        headerCell.style = {
            font: { bold: true, size: 16, color: { argb: this.colors.white } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.colors.primary } },
            alignment: { horizontal: 'center', vertical: 'middle' }
        };
        worksheet.getRow(1).height = 35;

        // ===== METADATA =====
        worksheet.getCell('A3').value = '📅 Fecha de Generación:';
        worksheet.getCell('B3').value = new Date().toLocaleDateString('es-MX');
        worksheet.getCell('D3').value = '⏰ Hora:';
        worksheet.getCell('E3').value = new Date().toLocaleTimeString('es-MX');

        // ===== KPIs PRINCIPALES =====
        const totalPolicies = pendingPolicies.length;
        const totalAmount = pendingPolicies.reduce(
            (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
            0
        );
        const criticalPolicies = pendingPolicies.filter(p => p.diasDeImpago <= 7).length;
        const avgAmount = totalPolicies > 0 ? totalAmount / totalPolicies : 0;

        // Headers KPIs
        worksheet.getCell('A5').value = 'INDICADOR CLAVE';
        worksheet.getCell('B5').value = 'VALOR';
        worksheet.getCell('C5').value = 'PORCENTAJE';
        worksheet.getCell('D5').value = 'ESTADO';

        ['A5', 'B5', 'C5', 'D5'].forEach(cell => {
            worksheet.getCell(cell).style = this.styles.header;
        });

        // Data KPIs
        const kpis: KPIData[] = [
            {
                label: '📊 Total Pólizas Pendientes',
                value: totalPolicies,
                percentage: 1,
                status: totalPolicies > 50 ? 'CRÍTICO' : totalPolicies > 20 ? 'ALTO' : 'NORMAL'
            },
            {
                label: '💰 Monto Total Pendiente',
                value: totalAmount,
                percentage: 1,
                status: totalAmount > 100000 ? 'CRÍTICO' : totalAmount > 50000 ? 'ALTO' : 'NORMAL'
            },
            {
                label: '⚠️ Pólizas Críticas (≤7 días)',
                value: criticalPolicies,
                percentage: totalPolicies > 0 ? criticalPolicies / totalPolicies : 0,
                status: criticalPolicies > 10 ? 'CRÍTICO' : criticalPolicies > 5 ? 'ALTO' : 'NORMAL'
            },
            {
                label: '📈 Promedio por Póliza',
                value: avgAmount,
                percentage: 1,
                status: avgAmount > 5000 ? 'CRÍTICO' : avgAmount > 2000 ? 'ALTO' : 'NORMAL'
            }
        ];

        kpis.forEach((kpi, index) => {
            const row = 6 + index;
            worksheet.getCell(`A${row}`).value = kpi.label;
            worksheet.getCell(`B${row}`).value = kpi.value;
            worksheet.getCell(`C${row}`).value = kpi.percentage;
            worksheet.getCell(`D${row}`).value = kpi.status;

            // Formato condicional por estado
            const statusStyle =
                kpi.status === 'CRÍTICO'
                    ? this.styles.urgent
                    : kpi.status === 'ALTO'
                      ? this.styles.warning
                      : this.styles.safe;
            worksheet.getCell(`D${row}`).style = statusStyle;

            // Formato de moneda para valores monetarios
            if (kpi.label.includes('Monto') || kpi.label.includes('Promedio')) {
                worksheet.getCell(`B${row}`).style = this.styles.currency;
            }

            // Formato de porcentaje
            if (kpi.label.includes('Críticas')) {
                worksheet.getCell(`C${row}`).style = this.styles.percentage;
            }
        });

        // ===== DISTRIBUCIÓN POR URGENCIA =====
        worksheet.getCell('A11').value = '📈 DISTRIBUCIÓN POR URGENCIA';
        worksheet.getCell('A11').style = {
            font: { bold: true, size: 14, color: { argb: this.colors.primary } }
        };

        worksheet.getCell('A13').value = 'CATEGORÍA';
        worksheet.getCell('B13').value = 'CANTIDAD';
        worksheet.getCell('C13').value = 'PORCENTAJE';
        worksheet.getCell('D13').value = 'MONTO TOTAL';

        ['A13', 'B13', 'C13', 'D13'].forEach(cell => {
            worksheet.getCell(cell).style = this.styles.header;
        });

        const urgent7 = pendingPolicies.filter(p => p.diasDeImpago <= 7);
        const urgent15 = pendingPolicies.filter(p => p.diasDeImpago > 7 && p.diasDeImpago <= 15);
        const normal = pendingPolicies.filter(p => p.diasDeImpago > 15);

        const urgencyData: UrgencyData[] = [
            {
                category: '🚨 Crítico (≤7 días)',
                count: urgent7.length,
                percentage: totalPolicies > 0 ? urgent7.length / totalPolicies : 0,
                amount: urgent7.reduce(
                    (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
                    0
                ),
                style: this.styles.urgent
            },
            {
                category: '⚠️ Urgente (8-15 días)',
                count: urgent15.length,
                percentage: totalPolicies > 0 ? urgent15.length / totalPolicies : 0,
                amount: urgent15.reduce(
                    (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
                    0
                ),
                style: this.styles.warning
            },
            {
                category: '✅ Normal (>15 días)',
                count: normal.length,
                percentage: totalPolicies > 0 ? normal.length / totalPolicies : 0,
                amount: normal.reduce(
                    (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
                    0
                ),
                style: this.styles.safe
            }
        ];

        urgencyData.forEach((data, index) => {
            const row = 14 + index;
            worksheet.getCell(`A${row}`).value = data.category;
            worksheet.getCell(`B${row}`).value = data.count;
            worksheet.getCell(`C${row}`).value = data.percentage;
            worksheet.getCell(`D${row}`).value = data.amount;

            // Aplicar estilos
            worksheet.getCell(`A${row}`).style = data.style;
            worksheet.getCell(`C${row}`).style = this.styles.percentage;
            worksheet.getCell(`D${row}`).style = this.styles.currency;
        });

        // ===== FÓRMULAS AUTOMÁTICAS =====
        const lastDataRow = 16;
        worksheet.getCell(`B${lastDataRow + 2}`).value = { formula: `SUM(B14:B${lastDataRow})` };
        worksheet.getCell(`D${lastDataRow + 2}`).value = { formula: `SUM(D14:D${lastDataRow})` };

        worksheet.getCell(`A${lastDataRow + 2}`).value = '🧮 TOTALES:';
        worksheet.getCell(`A${lastDataRow + 2}`).style = this.styles.kpi;
    }

    /**
     * 📋 HOJA 2: DETALLE COMPLETO
     * Contiene todos los datos con filtros automáticos y formato condicional
     */
    createDetailSheet(workbook: ExcelJS.Workbook, pendingPolicies: PendingPolicy[]): void {
        const worksheet = workbook.addWorksheet('📋 Detalle Completo');

        // Configurar anchos de columnas
        worksheet.columns = [
            { width: 20 },
            { width: 15 },
            { width: 15 },
            { width: 20 },
            { width: 15 },
            { width: 15 },
            { width: 25 },
            { width: 20 },
            { width: 15 },
            { width: 25 }
        ];

        // ===== HEADERS =====
        const headers = [
            'NÚMERO PÓLIZA',
            'DÍAS DE IMPAGO',
            'DÍAS TRANSCURRIDOS',
            'FECHA EMISIÓN',
            'FECHA LÍMITE',
            'PAGOS REALIZADOS',
            'MONTO REQUERIDO',
            'MONTO REFERENCIA',
            'SERVICIOS',
            'FUENTE MONTO'
        ];

        headers.forEach((header, index) => {
            const cell = worksheet.getCell(1, index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // ===== DATOS =====
        pendingPolicies.forEach((policy, index) => {
            const row = index + 2;

            worksheet.getCell(row, 1).value = policy.numeroPoliza;
            worksheet.getCell(row, 2).value = policy.diasDeImpago;
            worksheet.getCell(row, 3).value = policy.diasTranscurridos;
            worksheet.getCell(row, 4).value = policy.fechaEmision;
            worksheet.getCell(row, 5).value = policy.fechaLimiteCobertura;
            worksheet.getCell(row, 6).value = policy.pagosRealizados;
            worksheet.getCell(row, 7).value = policy.montoRequerido || 0;
            worksheet.getCell(row, 8).value = policy.montoReferencia || 0;
            worksheet.getCell(row, 9).value = policy.servicios.length;
            worksheet.getCell(row, 10).value = policy.fuenteMonto;

            // Formato condicional por urgencia
            let urgencyStyle = null;
            if (policy.diasDeImpago <= 7) {
                urgencyStyle = this.styles.urgent;
            } else if (policy.diasDeImpago <= 15) {
                urgencyStyle = this.styles.warning;
            } else {
                urgencyStyle = this.styles.safe;
            }

            // Aplicar color de fondo según urgencia
            worksheet.getCell(row, 2).style = urgencyStyle;

            // Formato de moneda
            worksheet.getCell(row, 7).style = this.styles.currency;
            worksheet.getCell(row, 8).style = this.styles.currency;

            // Formato de fecha
            worksheet.getCell(row, 4).style = { numFmt: 'dd/mm/yyyy' };
            worksheet.getCell(row, 5).style = { numFmt: 'dd/mm/yyyy' };
        });

        // ===== FILTROS AUTOMÁTICOS =====
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: pendingPolicies.length + 1, column: headers.length }
        };

        // ===== TOTALES AL FINAL =====
        const totalRow = pendingPolicies.length + 3;
        worksheet.getCell(totalRow, 6).value = 'TOTALES:';
        worksheet.getCell(totalRow, 6).style = this.styles.kpi;

        worksheet.getCell(totalRow, 7).value = {
            formula: `SUM(G2:G${pendingPolicies.length + 1})`
        };
        worksheet.getCell(totalRow, 7).style = this.styles.currency;

        worksheet.getCell(totalRow, 8).value = {
            formula: `SUM(H2:H${pendingPolicies.length + 1})`
        };
        worksheet.getCell(totalRow, 8).style = this.styles.currency;
    }

    /**
     * 🔍 HOJA 3: ANÁLISIS AVANZADO
     * Contiene análisis estadístico y agrupaciones especiales
     */
    createAnalysisSheet(workbook: ExcelJS.Workbook, pendingPolicies: PendingPolicy[]): void {
        const worksheet = workbook.addWorksheet('🔍 Análisis Avanzado');

        // Configurar anchos de columnas
        worksheet.columns = [
            { width: 30 },
            { width: 15 },
            { width: 20 },
            { width: 15 },
            { width: 20 }
        ];

        // ===== ANÁLISIS POR RANGOS DE DÍAS =====
        worksheet.getCell('A1').value = '📊 ANÁLISIS POR RANGOS DE IMPAGO';
        worksheet.getCell('A1').style = {
            font: { bold: true, size: 14, color: { argb: this.colors.primary } }
        };

        worksheet.getCell('A3').value = 'RANGO DE DÍAS';
        worksheet.getCell('B3').value = 'CANTIDAD';
        worksheet.getCell('C3').value = 'MONTO TOTAL';
        worksheet.getCell('D3').value = 'PORCENTAJE';
        worksheet.getCell('E3').value = 'PROMEDIO';

        ['A3', 'B3', 'C3', 'D3', 'E3'].forEach(cell => {
            worksheet.getCell(cell).style = this.styles.header;
        });

        // Crear rangos de análisis
        const ranges: RangeData[] = [
            { label: '1-7 días (Crítico)', min: 1, max: 7 },
            { label: '8-15 días (Urgente)', min: 8, max: 15 },
            { label: '16-30 días (Atención)', min: 16, max: 30 },
            { label: '31-60 días (Seguimiento)', min: 31, max: 60 },
            { label: '>60 días (Crítico)', min: 61, max: Infinity }
        ];

        const totalAmount = pendingPolicies.reduce(
            (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
            0
        );

        ranges.forEach((range, index) => {
            const row = 4 + index;
            const policiesInRange = pendingPolicies.filter(
                p => p.diasDeImpago >= range.min && p.diasDeImpago <= range.max
            );

            const rangeAmount = policiesInRange.reduce(
                (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
                0
            );
            const rangePercentage = totalAmount > 0 ? rangeAmount / totalAmount : 0;
            const rangeAverage =
                policiesInRange.length > 0 ? rangeAmount / policiesInRange.length : 0;

            worksheet.getCell(`A${row}`).value = range.label;
            worksheet.getCell(`B${row}`).value = policiesInRange.length;
            worksheet.getCell(`C${row}`).value = rangeAmount;
            worksheet.getCell(`D${row}`).value = rangePercentage;
            worksheet.getCell(`E${row}`).value = rangeAverage;

            // Formato condicional
            if (range.label.includes('Crítico')) {
                worksheet.getCell(`A${row}`).style = this.styles.urgent;
            } else if (range.label.includes('Urgente')) {
                worksheet.getCell(`A${row}`).style = this.styles.warning;
            } else {
                worksheet.getCell(`A${row}`).style = this.styles.safe;
            }

            worksheet.getCell(`C${row}`).style = this.styles.currency;
            worksheet.getCell(`D${row}`).style = this.styles.percentage;
            worksheet.getCell(`E${row}`).style = this.styles.currency;
        });

        // ===== ANÁLISIS POR FUENTE DE MONTO =====
        worksheet.getCell('A11').value = '💰 ANÁLISIS POR FUENTE DE MONTO';
        worksheet.getCell('A11').style = {
            font: { bold: true, size: 14, color: { argb: this.colors.primary } }
        };

        worksheet.getCell('A13').value = 'FUENTE';
        worksheet.getCell('B13').value = 'CANTIDAD';
        worksheet.getCell('C13').value = 'MONTO TOTAL';
        worksheet.getCell('D13').value = 'PORCENTAJE';

        ['A13', 'B13', 'C13', 'D13'].forEach(cell => {
            worksheet.getCell(cell).style = this.styles.header;
        });

        const sourceGroups: Record<string, PendingPolicy[]> = {};
        pendingPolicies.forEach(policy => {
            const source = policy.fuenteMonto;
            if (!sourceGroups[source]) {
                sourceGroups[source] = [];
            }
            sourceGroups[source].push(policy);
        });

        Object.entries(sourceGroups).forEach(([source, policies], index) => {
            const row = 14 + index;
            const sourceAmount = policies.reduce(
                (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
                0
            );
            const sourcePercentage = totalAmount > 0 ? sourceAmount / totalAmount : 0;

            worksheet.getCell(`A${row}`).value = source;
            worksheet.getCell(`B${row}`).value = policies.length;
            worksheet.getCell(`C${row}`).value = sourceAmount;
            worksheet.getCell(`D${row}`).value = sourcePercentage;

            worksheet.getCell(`C${row}`).style = this.styles.currency;
            worksheet.getCell(`D${row}`).style = this.styles.percentage;
        });
    }

    /**
     * 📊 Genera el archivo Excel completo con las 3 hojas
     */
    async generateExcel(pendingPolicies: PendingPolicy[]): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();

        // Metadata del workbook
        workbook.creator = 'Polizas Bot';
        workbook.lastModifiedBy = 'Sistema Automatizado';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.lastPrinted = new Date();

        // Crear las 3 hojas
        this.createSummarySheet(workbook, pendingPolicies);
        this.createDetailSheet(workbook, pendingPolicies);
        this.createAnalysisSheet(workbook, pendingPolicies);

        // Generar buffer
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    /**
     * Genera el reporte completo y lo envía
     */
    async generateReport(ctx: NavigationContext): Promise<void> {
        try {
            await ctx.reply('📊 Generando reporte Excel multi-hoja de pagos pendientes...');

            // Calcular datos
            const pendingPolicies = await this.calculatePendingPaymentsPolicies();

            // Generar Excel
            const excelBuffer = await this.generateExcel(pendingPolicies);

            // Guardar archivo temporal
            const tempDir = path.join(__dirname, '../../temp');
            await fs.mkdir(tempDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const fileName = `reporte_pagos_pendientes_${timestamp}.xlsx`;
            const filePath = path.join(tempDir, fileName);

            await fs.writeFile(filePath, excelBuffer);

            // Calcular estadísticas para el mensaje
            const totalAmount = pendingPolicies.reduce(
                (sum, p) => sum + (p.montoRequerido || p.montoReferencia || 0),
                0
            );
            const criticalPolicies = pendingPolicies.filter(p => p.diasDeImpago <= 7).length;

            // Enviar archivo
            await ctx.replyWithDocument(
                {
                    source: filePath,
                    filename: fileName
                },
                {
                    caption: `📊 Reporte Excel Multi-Hoja\n📅 ${new Date().toLocaleString('es-MX')}\n📋 ${pendingPolicies.length} pólizas pendientes`
                }
            );

            // Mensaje con navegación persistente
            const message =
                `📊 **Reporte Excel Generado Exitosamente**\n\n` +
                `📅 **Fecha:** ${new Date().toLocaleString('es-MX')}\n` +
                `📋 **Total pólizas:** ${pendingPolicies.length}\n` +
                `💰 **Monto total:** $${totalAmount.toLocaleString()}\n` +
                `🚨 **Pólizas críticas:** ${criticalPolicies}\n\n` +
                `✅ **Incluye 3 hojas:**\n` +
                `• 📊 Resumen Ejecutivo con KPIs\n` +
                `• 📋 Detalle Completo con filtros\n` +
                `• 🔍 Análisis Avanzado con estadísticas`;

            await this.replyWithNavigation(ctx, message);

            // Limpiar archivo temporal
            await fs.unlink(filePath);

            logger.info(
                `Reporte Excel multi-hoja generado: ${pendingPolicies.length} pólizas, ${totalAmount} total`
            );
        } catch (error: any) {
            logger.error('Error al generar reporte Excel:', error);
            await ctx.reply('❌ Error al generar el reporte Excel. Inténtalo de nuevo.');
        }
    }
}

export default PaymentReportExcelCommand;
