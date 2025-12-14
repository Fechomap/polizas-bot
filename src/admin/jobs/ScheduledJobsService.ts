/**
 * ScheduledJobsService.ts
 *
 * Servicio centralizado con todas las funciones de jobs programados.
 * Elimina la necesidad de scripts externos - todo ejecuta como funciones directas.
 */

import { prisma } from '../../database/prisma';
import logger from '../../utils/logger';
import ExcelJS from 'exceljs';
import path from 'path';
import { promises as fs } from 'fs';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ICalculoEstadosResult {
    procesadas: number;
    errores: number;
    estados: {
        VIGENTE: number;
        'PERIODO DE GRACIA': number;
        VENCIDA: number;
    };
}

export interface INIVCleanupResult {
    success: boolean;
    eliminados: number;
    fallidas: number;
    nivesEliminados: Array<{
        numeroPoliza: string;
        servicios: number;
        fechaEliminacion: Date;
    }>;
}

export interface INotificationsCleanupResult {
    sent: number;
    failed: number;
    expired: number;
    total: number;
}

// ============================================================================
// UTILIDADES
// ============================================================================

function addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function diffDays(fechaObjetivo: Date, ahora: Date): number {
    return Math.ceil((fechaObjetivo.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));
}

function calcularPuntaje(
    estado: string,
    diasCobertura: number,
    diasGracia: number,
    servicios: number
): number {
    if (servicios >= 2) return 10;
    if (estado === 'VENCIDA') return 0;

    const dias = estado === 'PERIODO DE GRACIA' ? diasGracia : diasCobertura;

    let puntaje = 0;
    if (servicios === 0) {
        if (dias <= 1) puntaje = 100;
        else if (dias <= 3) puntaje = 80;
        else if (dias <= 7) puntaje = 60;
        else puntaje = 40;
    } else if (servicios === 1) {
        if (dias <= 1) puntaje = 90;
        else if (dias <= 3) puntaje = 70;
        else if (dias <= 7) puntaje = 50;
        else puntaje = 30;
    }

    if (estado === 'VIGENTE') {
        puntaje = Math.max(puntaje - 10, 0);
    }

    return puntaje;
}

// ============================================================================
// JOB 1: CÁLCULO DE ESTADOS DE PÓLIZAS
// ============================================================================

export async function calcularEstadosPolizas(): Promise<ICalculoEstadosResult> {
    logger.info('🔄 Iniciando cálculo de estados de pólizas');
    const ahora = new Date();

    const result: ICalculoEstadosResult = {
        procesadas: 0,
        errores: 0,
        estados: {
            VIGENTE: 0,
            'PERIODO DE GRACIA': 0,
            VENCIDA: 0
        }
    };

    try {
        // Obtener todas las pólizas activas con sus pagos
        const policies = await prisma.policy.findMany({
            where: { estado: 'ACTIVO' },
            include: {
                pagos: {
                    where: { estado: 'REALIZADO' }
                },
                servicios: true
            }
        });

        logger.info(`📊 Procesando ${policies.length} pólizas activas...`);

        for (const policy of policies) {
            try {
                if (!policy.fechaEmision) {
                    logger.warn(
                        `⚠️ Póliza ${policy.numeroPoliza} sin fecha de emisión, omitiendo.`
                    );
                    continue;
                }

                const numPagos = policy.pagos.length;
                const servicios = policy.servicios.length;

                let fechaFinCobertura: Date;
                let fechaFinGracia: Date;
                let diasCobertura: number;
                let diasGracia: number;
                let estado: string;

                if (numPagos === 0) {
                    fechaFinCobertura = addMonths(policy.fechaEmision, 1);
                    fechaFinGracia = new Date(fechaFinCobertura);
                    diasCobertura = diffDays(fechaFinCobertura, ahora);
                    diasGracia = diasCobertura;

                    estado = diasCobertura < 0 ? 'VENCIDA' : 'PERIODO DE GRACIA';
                } else {
                    fechaFinCobertura = addMonths(policy.fechaEmision, numPagos);
                    fechaFinGracia = addMonths(policy.fechaEmision, numPagos + 1);
                    diasCobertura = diffDays(fechaFinCobertura, ahora);
                    diasGracia = diffDays(fechaFinGracia, ahora);

                    if (diasCobertura >= 0) {
                        estado = 'VIGENTE';
                    } else {
                        estado = diasGracia >= 0 ? 'PERIODO DE GRACIA' : 'VENCIDA';
                    }
                }

                const puntaje = calcularPuntaje(estado, diasCobertura, diasGracia, servicios);

                await prisma.policy.update({
                    where: { id: policy.id },
                    data: {
                        estadoPoliza: estado,
                        fechaFinCobertura,
                        fechaFinGracia,
                        diasRestantesCobertura: diasCobertura || 0,
                        diasRestantesGracia: diasGracia || 0,
                        totalServicios: servicios || 0,
                        calificacion: puntaje || 0
                    }
                });

                result.estados[estado as keyof typeof result.estados]++;
                result.procesadas++;

                if (result.procesadas % 50 === 0) {
                    logger.info(
                        `🔄 Procesadas ${result.procesadas} de ${policies.length} pólizas...`
                    );
                }
            } catch (error) {
                logger.error(`❌ Error procesando póliza ${policy.numeroPoliza}:`, error);
                result.errores++;
            }
        }

        logger.info('✅ Cálculo de estados completado');
        logger.info(
            `📊 Resumen: VIGENTE=${result.estados.VIGENTE}, PERIODO DE GRACIA=${result.estados['PERIODO DE GRACIA']}, VENCIDA=${result.estados.VENCIDA}`
        );

        return result;
    } catch (error) {
        logger.error('❌ Error general en cálculo de estados:', error);
        throw error;
    }
}

// ============================================================================
// JOB 2: LIMPIEZA DE NIVs USADOS
// ============================================================================

export async function limpiarNIVsUsados(): Promise<INIVCleanupResult> {
    logger.info('🧹 Iniciando limpieza de NIVs usados');

    const result: INIVCleanupResult = {
        success: true,
        eliminados: 0,
        fallidas: 0,
        nivesEliminados: []
    };

    try {
        // Buscar NIVs que deben eliminarse
        const nivsParaEliminar = await prisma.policy.findMany({
            where: {
                OR: [{ tipoPoliza: 'NIV' }, { esNIV: true }, { creadoViaOBD: true }],
                estado: 'ACTIVO',
                totalServicios: { gte: 2 }
            },
            include: {
                servicios: {
                    orderBy: { fechaServicio: 'desc' },
                    take: 1
                }
            }
        });

        logger.info(`📊 NIVs encontrados para eliminar: ${nivsParaEliminar.length}`);

        if (nivsParaEliminar.length === 0) {
            logger.info('🎉 No hay NIVs que requieran eliminación');
            return result;
        }

        const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);

        for (const niv of nivsParaEliminar) {
            try {
                // Verificar que el servicio no sea muy reciente
                const ultimoServicio = niv.servicios[0];
                const fechaServicio = ultimoServicio?.fechaServicio;
                if (fechaServicio && fechaServicio > unaHoraAtras) {
                    logger.info(`⏭️ NIV ${niv.numeroPoliza} omitido - servicio reciente`);
                    continue;
                }

                await prisma.policy.update({
                    where: { id: niv.id },
                    data: {
                        estado: 'ELIMINADO',
                        fechaEliminacion: new Date(),
                        motivoEliminacion: 'NIV_USADO_CLEANUP_AUTOMATICO'
                    }
                });

                result.nivesEliminados.push({
                    numeroPoliza: niv.numeroPoliza,
                    servicios: niv.totalServicios || 0,
                    fechaEliminacion: new Date()
                });

                result.eliminados++;
                logger.info(
                    `✅ NIV eliminado: ${niv.numeroPoliza} (${niv.totalServicios} servicios)`
                );
            } catch (error) {
                logger.error(`❌ Error eliminando NIV ${niv.numeroPoliza}:`, error);
                result.fallidas++;
            }
        }

        result.success = result.fallidas === 0;
        logger.info(
            `✅ Limpieza de NIVs completada: ${result.eliminados} eliminados, ${result.fallidas} fallidas`
        );

        return result;
    } catch (error) {
        logger.error('❌ Error general en limpieza de NIVs:', error);
        result.success = false;
        throw error;
    }
}

// ============================================================================
// JOB 3: LIMPIEZA DE NOTIFICACIONES OBSOLETAS
// ============================================================================

export async function limpiarNotificacionesObsoletas(): Promise<INotificationsCleanupResult> {
    logger.info('🧹 Iniciando limpieza de notificaciones obsoletas');

    const result: INotificationsCleanupResult = {
        sent: 0,
        failed: 0,
        expired: 0,
        total: 0
    };

    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        // Eliminar notificaciones SENT de más de 7 días
        const deletedSent = await prisma.scheduledNotification.deleteMany({
            where: {
                status: 'SENT',
                sentAt: { lt: sevenDaysAgo }
            }
        });
        result.sent = deletedSent.count;
        logger.info(`🗑️ Notificaciones SENT eliminadas: ${result.sent}`);

        // Eliminar notificaciones FAILED de más de 7 días
        const deletedFailed = await prisma.scheduledNotification.deleteMany({
            where: {
                status: 'FAILED',
                updatedAt: { lt: sevenDaysAgo }
            }
        });
        result.failed = deletedFailed.count;
        logger.info(`🗑️ Notificaciones FAILED eliminadas: ${result.failed}`);

        // Eliminar notificaciones PENDING expiradas
        const deletedExpired = await prisma.scheduledNotification.deleteMany({
            where: {
                status: 'PENDING',
                scheduledDate: { lt: oneDayAgo }
            }
        });
        result.expired = deletedExpired.count;
        logger.info(`🗑️ Notificaciones PENDING expiradas eliminadas: ${result.expired}`);

        result.total = result.sent + result.failed + result.expired;
        logger.info(`✅ Limpieza de notificaciones completada. Total eliminadas: ${result.total}`);

        return result;
    } catch (error) {
        logger.error('❌ Error en limpieza de notificaciones:', error);
        throw error;
    }
}

// ============================================================================
// JOB 4: EXPORTAR PÓLIZAS A EXCEL
// ============================================================================

export interface IExportResult {
    success: boolean;
    filePath: string;
    totalExported: number;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

export async function exportarPolizasExcel(): Promise<IExportResult> {
    logger.info('📊 Iniciando exportación de pólizas a Excel');

    const scriptsPath = path.join(__dirname, '../../../scripts');
    const backupDir = path.join(scriptsPath, 'backup');
    await ensureDirectoryExists(backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const excelPath = path.join(backupDir, `polizas_backup_${timestamp}.xlsx`);

    try {
        const totalPolicies = await prisma.policy.count();

        if (!totalPolicies) {
            logger.warn('⚠️ No se encontraron pólizas para exportar');
            return { success: true, filePath: '', totalExported: 0 };
        }

        logger.info(`📊 Exportando ${totalPolicies} pólizas...`);

        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            filename: excelPath,
            useStyles: true,
            useSharedStrings: true
        });

        const worksheet = workbook.addWorksheet('Polizas');

        // Columnas completas (igual que el script original)
        worksheet.columns = [
            { header: 'TITULAR', key: 'titular', width: 20 },
            { header: 'CORREO ELECTRONICO', key: 'correo', width: 25 },
            { header: 'CONTRASEÑA', key: 'contrasena', width: 15 },
            { header: 'TELEFONO', key: 'telefono', width: 15 },
            { header: 'CALLE', key: 'calle', width: 20 },
            { header: 'COLONIA', key: 'colonia', width: 20 },
            { header: 'MUNICIPIO', key: 'municipio', width: 20 },
            { header: 'ESTADO', key: 'estadoRegion', width: 20 },
            { header: 'CP', key: 'cp', width: 10 },
            { header: 'RFC', key: 'rfc', width: 15 },
            { header: 'MARCA', key: 'marca', width: 15 },
            { header: 'SUBMARCA', key: 'submarca', width: 15 },
            { header: 'AÑO', key: 'anio', width: 10 },
            { header: 'COLOR', key: 'color', width: 15 },
            { header: 'SERIE', key: 'serie', width: 25 },
            { header: 'PLACAS', key: 'placas', width: 15 },
            { header: 'AGENTE COTIZADOR', key: 'agenteCotizador', width: 20 },
            { header: 'ASEGURADORA', key: 'aseguradora', width: 20 },
            { header: '# DE POLIZA', key: 'numeroPoliza', width: 20 },
            { header: 'FECHA DE EMISION', key: 'fechaEmision', width: 15 },
            { header: 'ESTADO_POLIZA', key: 'estadoPoliza', width: 15 },
            { header: 'FECHA_FIN_COBERTURA', key: 'fechaFinCobertura', width: 15 },
            { header: 'FECHA_FIN_GRACIA', key: 'fechaFinGracia', width: 15 },
            { header: 'DIAS_RESTANTES_COBERTURA', key: 'diasRestantesCobertura', width: 10 },
            { header: 'DIAS_RESTANTES_GRACIA', key: 'diasRestantesGracia', width: 10 },
            { header: 'NUM_FOTOS', key: 'numFotos', width: 10 },
            { header: 'NUM_PDFS', key: 'numPdfs', width: 10 },
            { header: 'ESTADO_DB', key: 'estadoDB', width: 10 },
            { header: 'SERVICIOS', key: 'totalServicios', width: 10 },
            { header: 'CALIFICACION', key: 'calificacion', width: 10 },
            // Columnas de pagos (hasta 12)
            ...Array.from({ length: 12 }).flatMap((_, i) => [
                { header: `PAGO${i + 1}_MONTO`, key: `pago${i + 1}Monto`, width: 12 },
                { header: `PAGO${i + 1}_FECHA`, key: `pago${i + 1}Fecha`, width: 12 }
            ]),
            // Columnas de servicios (hasta 12)
            ...Array.from({ length: 12 }).flatMap((_, i) => [
                { header: `SERVICIO${i + 1}_COSTO`, key: `servicio${i + 1}Costo`, width: 12 },
                { header: `SERVICIO${i + 1}_FECHA`, key: `servicio${i + 1}Fecha`, width: 12 },
                {
                    header: `SERVICIO${i + 1}_EXPEDIENTE`,
                    key: `servicio${i + 1}Expediente`,
                    width: 15
                },
                {
                    header: `SERVICIO${i + 1}_ORIGEN_DESTINO`,
                    key: `servicio${i + 1}OrigenDestino`,
                    width: 20
                }
            ])
        ];

        // Estilo encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.height = 25;
        headerRow.eachCell(cell => {
            cell.style = {
                font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                }
            };
        });
        headerRow.commit();

        // Formato de fechas
        worksheet.getColumn('fechaEmision').numFmt = 'dd/mm/yyyy';
        worksheet.getColumn('fechaFinCobertura').numFmt = 'dd/mm/yyyy';
        worksheet.getColumn('fechaFinGracia').numFmt = 'dd/mm/yyyy';
        for (let i = 1; i <= 12; i++) {
            const pagoFechaCol = worksheet.getColumn(`pago${i}Fecha`);
            const servicioFechaCol = worksheet.getColumn(`servicio${i}Fecha`);
            if (pagoFechaCol) pagoFechaCol.numFmt = 'dd/mm/yyyy';
            if (servicioFechaCol) servicioFechaCol.numFmt = 'dd/mm/yyyy';
        }

        const batchSize = 100;
        let skip = 0;
        let processed = 0;

        while (true) {
            const policies = await prisma.policy.findMany({
                include: {
                    pagos: { where: { estado: 'REALIZADO' }, orderBy: { fechaPago: 'asc' } },
                    servicios: { orderBy: { fechaServicio: 'asc' } },
                    archivosR2: true
                },
                skip,
                take: batchSize,
                orderBy: { createdAt: 'desc' }
            });

            if (policies.length === 0) break;

            for (const doc of policies) {
                const numFotos = doc.archivosR2?.filter(a => a.tipo === 'FOTO').length || 0;
                const numPdfs = doc.archivosR2?.filter(a => a.tipo === 'PDF').length || 0;

                const rowData: Record<string, unknown> = {
                    titular: doc.titular ?? '',
                    correo: doc.correo ?? '',
                    contrasena: doc.contrasena ?? '',
                    telefono: doc.telefono ?? '',
                    calle: doc.calle || '',
                    colonia: doc.colonia || '',
                    municipio: doc.municipio || '',
                    estadoRegion: doc.estadoRegion ?? '',
                    cp: doc.cp || '',
                    rfc: doc.rfc || '',
                    marca: doc.marca || '',
                    submarca: doc.submarca || '',
                    anio: doc.anio || '',
                    color: doc.color || '',
                    serie: doc.serie || '',
                    placas: doc.placas || '',
                    agenteCotizador: doc.agenteCotizador || '',
                    aseguradora: doc.aseguradora || '',
                    numeroPoliza: doc.numeroPoliza || '',
                    fechaEmision: doc.fechaEmision ? new Date(doc.fechaEmision) : null,
                    estadoPoliza: doc.estadoPoliza ?? '',
                    fechaFinCobertura: doc.fechaFinCobertura
                        ? new Date(doc.fechaFinCobertura)
                        : null,
                    fechaFinGracia: doc.fechaFinGracia ? new Date(doc.fechaFinGracia) : null,
                    diasRestantesCobertura: doc.diasRestantesCobertura ?? 0,
                    diasRestantesGracia: doc.diasRestantesGracia ?? 0,
                    numFotos,
                    numPdfs,
                    estadoDB: doc.estado,
                    totalServicios: doc.servicios?.length ?? doc.totalServicios ?? 0,
                    calificacion: doc.calificacion ?? 0
                };

                // Pagos (hasta 12)
                const pagos = doc.pagos || [];
                for (let i = 0; i < 12; i++) {
                    const pago = pagos[i];
                    rowData[`pago${i + 1}Monto`] = pago ? pago.monto : '';
                    rowData[`pago${i + 1}Fecha`] = pago?.fechaPago
                        ? new Date(pago.fechaPago)
                        : null;
                }

                // Servicios (hasta 12)
                const servicios = doc.servicios || [];
                for (let i = 0; i < 12; i++) {
                    const servicio = servicios[i];
                    rowData[`servicio${i + 1}Costo`] = servicio ? servicio.costo : '';
                    rowData[`servicio${i + 1}Fecha`] = servicio?.fechaServicio
                        ? new Date(servicio.fechaServicio)
                        : null;
                    rowData[`servicio${i + 1}Expediente`] = servicio?.numeroExpediente ?? '';
                    rowData[`servicio${i + 1}OrigenDestino`] = servicio?.origenDestino ?? '';
                }

                const row = worksheet.addRow(rowData);
                row.commit();
                processed++;
            }

            if (processed % 200 === 0) {
                logger.info(`📊 Exportadas ${processed}/${totalPolicies} pólizas...`);
            }
            skip += batchSize;
        }

        // Filtro automático
        const totalColumns = worksheet.columns.length;
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: totalColumns }
        };

        worksheet.commit();
        await workbook.commit();

        logger.info(`✅ Exportación completada: ${processed} pólizas en ${excelPath}`);
        return { success: true, filePath: excelPath, totalExported: processed };
    } catch (error) {
        logger.error('❌ Error en exportación Excel:', error);
        throw error;
    }
}

// ============================================================================
// JOB 5: VALIDACIÓN DE ARCHIVOS
// ============================================================================

export interface IValidationResult {
    success: boolean;
    filePath: string;
    totalProblems: number;
    totalProcessed: number;
}

export async function validarArchivosPolizas(): Promise<IValidationResult> {
    logger.info('🔍 Iniciando validación de archivos de pólizas');

    const scriptsPath = path.join(__dirname, '../../../scripts');
    const excelPath = path.join(scriptsPath, 'file-validation-report.xlsx');

    try {
        const totalPolizas = await prisma.policy.count({ where: { estado: 'ACTIVO' } });

        if (totalPolizas === 0) {
            logger.warn('⚠️ No se encontraron pólizas activas');
            return { success: true, filePath: '', totalProblems: 0, totalProcessed: 0 };
        }

        const polizasConProblemas: Array<{
            numeroPoliza: string;
            tieneFotos: string;
            tienePdf: string;
            severidad: string;
        }> = [];

        let procesadas = 0;
        const BATCH_SIZE = 100;

        for (let skip = 0; skip < totalPolizas; skip += BATCH_SIZE) {
            const lote = await prisma.policy.findMany({
                where: { estado: 'ACTIVO' },
                select: { numeroPoliza: true, archivosR2: true },
                skip,
                take: BATCH_SIZE
            });

            for (const poliza of lote) {
                const fotos = poliza.archivosR2?.filter(a => a.tipo === 'FOTO').length || 0;
                const pdfs = poliza.archivosR2?.filter(a => a.tipo === 'PDF').length || 0;
                const tieneFotos = fotos > 0;
                const tienePdf = pdfs > 0;

                if (!tieneFotos || !tienePdf) {
                    polizasConProblemas.push({
                        numeroPoliza: poliza.numeroPoliza,
                        tieneFotos: tieneFotos ? '✓' : 'X',
                        tienePdf: tienePdf ? '✓' : 'X',
                        severidad:
                            !tieneFotos && !tienePdf
                                ? 'CRITICO'
                                : !tieneFotos
                                  ? 'SIN_FOTOS'
                                  : 'SIN_PDF'
                    });
                }
            }

            procesadas += lote.length;
            if (procesadas % 200 === 0) {
                logger.info(`📈 Validadas ${procesadas}/${totalPolizas} pólizas...`);
            }
        }

        // Generar Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Validación de Archivos');

        worksheet.columns = [
            { header: 'NUMERO_POLIZA', key: 'numeroPoliza', width: 20 },
            { header: 'FOTOS', key: 'tieneFotos', width: 10 },
            { header: 'PDF', key: 'tienePdf', width: 10 }
        ];

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };

        polizasConProblemas.forEach(poliza => {
            const row = worksheet.addRow(poliza);
            if (poliza.severidad === 'CRITICO') {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
            } else if (poliza.severidad === 'SIN_FOTOS') {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFA726' } };
            } else {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF59' } };
            }
        });

        await workbook.xlsx.writeFile(excelPath);

        logger.info(
            `✅ Validación completada: ${polizasConProblemas.length} con problemas de ${procesadas}`
        );
        return {
            success: true,
            filePath: excelPath,
            totalProblems: polizasConProblemas.length,
            totalProcessed: procesadas
        };
    } catch (error) {
        logger.error('❌ Error en validación de archivos:', error);
        throw error;
    }
}

// ============================================================================
// EXPORTAR SERVICIO SINGLETON
// ============================================================================

export const ScheduledJobsService = {
    calcularEstadosPolizas,
    limpiarNIVsUsados,
    limpiarNotificacionesObsoletas,
    exportarPolizasExcel,
    validarArchivosPolizas
};

export default ScheduledJobsService;
