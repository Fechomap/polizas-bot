// src/comandos/comandos/PaymentReportPDFCommand.js
/**
 * Comando para generar reporte PDF de pólizas con pagos pendientes
 * Lógica mejorada: calcula días de impago por período específico (no acumulativo)
 */

const BaseCommand = require('./BaseCommand');
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const Policy = require('../../models/policy');
const logger = require('../../utils/logger');

class PaymentReportPDFCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'PaymentReportPDF';
    }

    getDescription() {
        return 'Genera un reporte PDF de pólizas con pagos pendientes.';
    }

    /**
     * Calcula el día anterior del mismo número de mes
     * Ej: emisión 5 enero → pago requerido 4 febrero
     */
    calculatePaymentDueDate(emissionDate, monthsToAdd) {
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
    calculateMonthsCoveredByPayments(emissionDate, paymentsCount) {
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
    async calculatePendingPaymentsPolicies() {
        try {
            const policies = await Policy.find({ estado: 'ACTIVO' }).lean();
            const now = new Date();
            const pendingPolicies = [];

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
                const pagosRealizados = pagos.filter(pago => pago.estado === 'REALIZADO');
                const pagosPlanificados = pagos.filter(pago => pago.estado === 'PLANIFICADO');

                // Calcular fecha límite de cobertura basada en pagos realizados
                const fechaLimiteCobertura = this.calculateMonthsCoveredByPayments(
                    fechaEmision,
                    pagosRealizados.length
                );

                // Calcular días de impago (si la fecha actual supera la cobertura)
                let diasDeImpago = 0;
                if (now > fechaLimiteCobertura) {
                    const msImpago = now - fechaLimiteCobertura;
                    diasDeImpago = Math.floor(msImpago / (1000 * 60 * 60 * 24));
                }

                // Solo incluir pólizas con impago > 0
                if (diasDeImpago > 0) {
                    // LÓGICA CORREGIDA DE PAGOS PLANIFICADOS:
                    // - 0 pagos realizados → usar Pago 1 (primer mes)
                    // - 1+ pagos realizados → usar Pago 2 (meses 2-12)
                    let montoRequerido = 0;
                    let montoReferencia = null;
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
                    const msTranscurridos = now - new Date(fechaEmision);
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

    /**
     * Genera el PDF del reporte
     */
    async generatePDF(pendingPolicies) {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve(pdfBuffer);
            });

            doc.on('error', reject);

            try {
                // Encabezado
                doc.fontSize(18).font('Helvetica-Bold');
                doc.text('REPORTE DE PÓLIZAS CON PAGOS PENDIENTES', { align: 'center' });
                doc.moveDown();

                doc.fontSize(12).font('Helvetica');
                doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, { align: 'center' });
                doc.text(`Total de pólizas: ${pendingPolicies.length}`, { align: 'center' });
                doc.moveDown(2);

                if (pendingPolicies.length === 0) {
                    doc.fontSize(14);
                    doc.text('🎉 No hay pólizas con pagos pendientes', { align: 'center' });
                    doc.end();
                    return;
                }

                // Agrupar por prioridad semanal
                const grupos = this.groupByWeeklyPriority(pendingPolicies);
                let totalGeneral = 0;

                // Configuración de tabla con cuadrícula
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

                // Función para dibujar línea horizontal
                const drawHorizontalLine = y => {
                    doc.moveTo(tableLeft, y)
                        .lineTo(tableLeft + tableWidth, y)
                        .stroke();
                };

                // Función para dibujar líneas verticales
                const drawVerticalLines = (y1, y2) => {
                    let x = tableLeft;
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
                doc.text('DIAS PARA\nVENCER', tableLeft + colWidths.poliza + 5, currentY + 5, {
                    width: colWidths.diasVencer - 10
                });
                doc.text(
                    'MONTO\nREQUERIDO',
                    tableLeft + colWidths.poliza + colWidths.diasVencer + 5,
                    currentY + 5,
                    { width: colWidths.monto - 10 }
                );
                doc.text(
                    'SERVICIOS',
                    tableLeft + colWidths.poliza + colWidths.diasVencer + colWidths.monto + 5,
                    currentY + 5,
                    { width: colWidths.servicios - 10 }
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
                                : items[0]?.prioridad <= 3
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

                            // Redibujar encabezados en nueva página
                            doc.fontSize(10).font('Helvetica-Bold');
                            const newHeaderY = currentY;
                            doc.text('NUMERO DE POLIZA', tableLeft + 5, currentY + 5, {
                                width: colWidths.poliza - 10
                            });
                            doc.text(
                                'DIAS PARA\\nVENCER',
                                tableLeft + colWidths.poliza + 5,
                                currentY + 5,
                                { width: colWidths.diasVencer - 10 }
                            );
                            doc.text(
                                'MONTO\\nREQUERIDO',
                                tableLeft + colWidths.poliza + colWidths.diasVencer + 5,
                                currentY + 5,
                                { width: colWidths.monto - 10 }
                            );
                            doc.text(
                                'SERVICIOS',
                                tableLeft +
                                    colWidths.poliza +
                                    colWidths.diasVencer +
                                    colWidths.monto +
                                    5,
                                currentY + 5,
                                { width: colWidths.servicios - 10 }
                            );
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

                        // Calcular número de servicios
                        const numServicios = item.servicios?.length || 0;

                        // Contenido de las celdas
                        doc.text(item.numeroPoliza, tableLeft + 3, currentY + 3, {
                            width: colWidths.poliza - 6
                        });
                        doc.text(
                            (item.diasHastaVencer || 0).toString(),
                            tableLeft + colWidths.poliza + 3,
                            currentY + 3,
                            { width: colWidths.diasVencer - 6 }
                        );
                        doc.text(
                            `$${monto.toLocaleString('es-MX')}`,
                            tableLeft + colWidths.poliza + colWidths.diasVencer + 3,
                            currentY + 3,
                            { width: colWidths.monto - 6 }
                        );
                        doc.text(
                            numServicios.toString(),
                            tableLeft +
                                colWidths.poliza +
                                colWidths.diasVencer +
                                colWidths.monto +
                                3,
                            currentY + 3,
                            { width: colWidths.servicios - 6 }
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

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Calcula cuántos días faltan para que una póliza caiga en el siguiente mes sin pago
     */
    calculateDaysUntilNextMonthUnpaid(fechaLimiteCobertura) {
        const now = new Date();
        const nextMonth = new Date(fechaLimiteCobertura);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const msDiff = nextMonth - now;
        return Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    }

    /**
     * Agrupa por prioridad semanal - URGENTE: las que caen en impago esta semana
     */
    groupByWeeklyPriority(policies) {
        const now = new Date();
        const domingo = new Date(now);
        domingo.setDate(now.getDate() + (7 - now.getDay())); // Próximo domingo

        const grupos = {
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
            grupos[key].sort((a, b) => a.diasHastaVencer - b.diasHastaVencer);
        });

        return grupos;
    }

    /**
     * Genera el reporte completo y lo guarda
     */
    async generateReport(ctx) {
        try {
            await ctx.reply('📊 Generando reporte PDF de pagos pendientes...');

            // Calcular datos
            const pendingPolicies = await this.calculatePendingPaymentsPolicies();

            // Generar PDF
            const pdfBuffer = await this.generatePDF(pendingPolicies);

            // Guardar archivo temporal
            const tempDir = path.join(__dirname, '../../temp');
            await fs.mkdir(tempDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const fileName = `reporte_pagos_pendientes_${timestamp}.pdf`;
            const filePath = path.join(tempDir, fileName);

            await fs.writeFile(filePath, pdfBuffer);

            // Enviar archivo
            await ctx.replyWithDocument(
                {
                    source: filePath,
                    filename: fileName
                },
                {
                    caption: `📋 Reporte de Pagos Pendientes\n📅 ${new Date().toLocaleString('es-MX')}\n📊 ${pendingPolicies.length} pólizas con pagos pendientes`
                }
            );

            // Limpiar archivo temporal
            await fs.unlink(filePath);

            logger.info(
                `Reporte PDF de pagos pendientes generado: ${pendingPolicies.length} pólizas`
            );
        } catch (error) {
            logger.error('Error al generar reporte PDF de pagos pendientes:', error);
            await ctx.reply('❌ Error al generar el reporte PDF. Inténtalo de nuevo.');
        }
    }
}

module.exports = PaymentReportPDFCommand;
