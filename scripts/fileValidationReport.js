// scripts/fileValidationReport.js
/**
 * 📋 SCRIPT DE VALIDACIÓN DE ARCHIVOS
 * 
 * Genera un reporte Excel de pólizas que NO cumplen con los requisitos mínimos:
 * - Mínimo 2 fotos del vehículo
 * - Mínimo 1 PDF de la póliza
 * 
 * Solo reporta las pólizas con problemas para facilitar la corrección.
 */

const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const path = require('path');
require('dotenv').config();

// Importar modelos
const Policy = require('../src/models/policy');

/**
 * Configuración de validación
 */
const VALIDATION_RULES = {
    MIN_FOTOS: 2,
    MIN_PDFS: 1
};

/**
 * Conectar a MongoDB
 */
async function connectDB() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/polizas';
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
        process.exit(1);
    }
}

/**
 * Contar archivos en una póliza (legacy + R2)
 */
function contarArchivos(poliza) {
    const archivos = poliza.archivos || {};
    
    // Archivos legacy (MongoDB Buffer)
    const legacyFotos = (archivos.fotos || []).length;
    const legacyPdfs = (archivos.pdfs || []).length;
    
    // Archivos R2 (Cloudflare)
    const r2Fotos = (archivos.r2Files?.fotos || []).length;
    const r2Pdfs = (archivos.r2Files?.pdfs || []).length;
    
    return {
        legacyFotos,
        legacyPdfs,
        r2Fotos,
        r2Pdfs,
        totalFotos: legacyFotos + r2Fotos,
        totalPdfs: legacyPdfs + r2Pdfs
    };
}

/**
 * Validar archivos de una póliza
 */
function validarArchivos(poliza) {
    const conteos = contarArchivos(poliza);
    const errores = [];
    
    // Validar fotos mínimas
    if (conteos.totalFotos < VALIDATION_RULES.MIN_FOTOS) {
        errores.push(`Solo ${conteos.totalFotos} foto(s), mínimo ${VALIDATION_RULES.MIN_FOTOS}`);
    }
    
    // Validar PDF mínimo
    if (conteos.totalPdfs < VALIDATION_RULES.MIN_PDFS) {
        errores.push(`Solo ${conteos.totalPdfs} PDF(s), mínimo ${VALIDATION_RULES.MIN_PDFS}`);
    }
    
    // Validar integridad de archivos legacy
    if (poliza.archivos?.fotos) {
        poliza.archivos.fotos.forEach((foto, index) => {
            if (!foto.data || !Buffer.isBuffer(foto.data) || foto.data.length === 0) {
                errores.push(`Foto legacy ${index + 1} corrupta`);
            }
        });
    }
    
    if (poliza.archivos?.pdfs) {
        poliza.archivos.pdfs.forEach((pdf, index) => {
            if (!pdf.data || !Buffer.isBuffer(pdf.data) || pdf.data.length === 0) {
                errores.push(`PDF legacy ${index + 1} corrupto`);
            }
        });
    }
    
    // Validar URLs R2
    if (poliza.archivos?.r2Files?.fotos) {
        poliza.archivos.r2Files.fotos.forEach((foto, index) => {
            if (!foto.url || !foto.key) {
                errores.push(`Foto R2 ${index + 1} sin URL/key`);
            }
        });
    }
    
    if (poliza.archivos?.r2Files?.pdfs) {
        poliza.archivos.r2Files.pdfs.forEach((pdf, index) => {
            if (!pdf.url || !pdf.key) {
                errores.push(`PDF R2 ${index + 1} sin URL/key`);
            }
        });
    }
    
    return {
        ...conteos,
        valido: errores.length === 0,
        errores: errores.join('; ')
    };
}

/**
 * Procesar todas las pólizas
 */
async function procesarPolizas() {
    console.log('🔍 Iniciando análisis de pólizas...');
    
    const totalPolizas = await Policy.countDocuments({ estado: 'ACTIVO' });
    console.log(`📊 Total de pólizas activas: ${totalPolizas}`);
    
    const polizasConProblemas = [];
    let procesadas = 0;
    let conProblemas = 0;
    
    // Procesar en lotes para eficiencia
    const BATCH_SIZE = 100;
    
    for (let offset = 0; offset < totalPolizas; offset += BATCH_SIZE) {
        const lote = await Policy.find({ estado: 'ACTIVO' })
            .select('numeroPoliza titular aseguradora tipoPoliza esNIP archivos createdAt')
            .skip(offset)
            .limit(BATCH_SIZE)
            .lean();
        
        for (const poliza of lote) {
            procesadas++;
            
            const validacion = validarArchivos(poliza);
            
            if (!validacion.valido) {
                conProblemas++;
                
                polizasConProblemas.push({
                    numeroPoliza: poliza.numeroPoliza,
                    titular: poliza.titular || 'Sin titular',
                    aseguradora: poliza.aseguradora || 'Sin aseguradora',
                    tipoPoliza: poliza.tipoPoliza || 'REGULAR',
                    esNIP: poliza.esNIP ? 'SÍ' : 'NO',
                    
                    // Conteos detallados
                    fotosLegacy: validacion.legacyFotos,
                    pdfsLegacy: validacion.legacyPdfs,
                    fotosR2: validacion.r2Fotos,
                    pdfsR2: validacion.r2Pdfs,
                    
                    // Totales
                    totalFotos: validacion.totalFotos,
                    totalPdfs: validacion.totalPdfs,
                    
                    // Estado de validación
                    estado: 'ERROR',
                    errores: validacion.errores,
                    
                    // Metadatos
                    fechaCreacion: poliza.createdAt ? new Date(poliza.createdAt).toISOString().split('T')[0] : 'Desconocida'
                });
            }
        }
        
        // Mostrar progreso
        if (procesadas % 500 === 0 || procesadas === totalPolizas) {
            console.log(`📈 Progreso: ${procesadas}/${totalPolizas} (${conProblemas} con problemas)`);
        }
    }
    
    console.log(`\n✅ Análisis completado:`);
    console.log(`📊 Total procesadas: ${procesadas}`);
    console.log(`⚠️ Con problemas: ${conProblemas}`);
    console.log(`✅ Sin problemas: ${procesadas - conProblemas}`);
    
    return polizasConProblemas;
}

/**
 * Generar archivo Excel
 */
async function generarExcel(polizasConProblemas) {
    console.log('📝 Generando archivo Excel...');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Validación de Archivos');
    
    // Configurar columnas
    worksheet.columns = [
        { header: 'NUMERO_POLIZA', key: 'numeroPoliza', width: 20 },
        { header: 'TITULAR', key: 'titular', width: 25 },
        { header: 'ASEGURADORA', key: 'aseguradora', width: 20 },
        { header: 'TIPO_POLIZA', key: 'tipoPoliza', width: 12 },
        { header: 'ES_NIP', key: 'esNIP', width: 8 },
        { header: 'FOTOS_LEGACY', key: 'fotosLegacy', width: 12 },
        { header: 'PDFS_LEGACY', key: 'pdfsLegacy', width: 11 },
        { header: 'FOTOS_R2', key: 'fotosR2', width: 10 },
        { header: 'PDFS_R2', key: 'pdfsR2', width: 9 },
        { header: 'TOTAL_FOTOS', key: 'totalFotos', width: 12 },
        { header: 'TOTAL_PDFS', key: 'totalPdfs', width: 11 },
        { header: 'ESTADO', key: 'estado', width: 10 },
        { header: 'ERRORES', key: 'errores', width: 50 },
        { header: 'FECHA_CREACION', key: 'fechaCreacion', width: 15 }
    ];
    
    // Estilo del encabezado
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
    };
    
    // Agregar datos
    polizasConProblemas.forEach(poliza => {
        const row = worksheet.addRow(poliza);
        
        // Colorear filas según severidad
        if (poliza.totalFotos === 0 && poliza.totalPdfs === 0) {
            // Sin archivos - Rojo
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFE6E6' }
            };
        } else if (poliza.totalFotos < VALIDATION_RULES.MIN_FOTOS || poliza.totalPdfs < VALIDATION_RULES.MIN_PDFS) {
            // Faltan archivos - Amarillo
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFF99' }
            };
        }
    });
    
    // Agregar resumen al final
    const resumenRow = worksheet.addRow({});
    resumenRow.getCell(1).value = 'RESUMEN:';
    resumenRow.getCell(1).font = { bold: true };
    
    const estadisticasRow = worksheet.addRow({
        numeroPoliza: `Total con problemas: ${polizasConProblemas.length}`,
        titular: `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
        aseguradora: 'Criterios: ≥2 fotos, ≥1 PDF'
    });
    estadisticasRow.font = { bold: true };
    
    // Guardar archivo
    const excelPath = path.join(__dirname, 'file-validation-report.xlsx');
    await workbook.xlsx.writeFile(excelPath);
    
    console.log(`✅ Archivo Excel generado: ${excelPath}`);
    return excelPath;
}

/**
 * Función principal
 */
async function main() {
    try {
        console.log('🚀 Iniciando validación de archivos de pólizas...\n');
        
        await connectDB();
        
        const polizasConProblemas = await procesarPolizas();
        
        if (polizasConProblemas.length === 0) {
            console.log('\n🎉 ¡Excelente! Todas las pólizas activas tienen sus archivos completos.');
            
            // Crear Excel vacío con mensaje
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sin Problemas');
            worksheet.addRow(['✅ TODAS LAS PÓLIZAS TIENEN SUS ARCHIVOS COMPLETOS']);
            worksheet.addRow([`Fecha de verificación: ${new Date().toLocaleString('es-MX')}`]);
            worksheet.addRow(['Criterios: Mínimo 2 fotos y 1 PDF por póliza']);
            
            const excelPath = path.join(__dirname, 'file-validation-report.xlsx');
            await workbook.xlsx.writeFile(excelPath);
        } else {
            await generarExcel(polizasConProblemas);
        }
        
        console.log('\n✅ Proceso completado exitosamente.');
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Error en el proceso:', error);
        process.exit(1);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { main, validarArchivos, contarArchivos };