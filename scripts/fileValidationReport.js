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

// Importar modelos usando el wrapper
const Policy = require('./models/policy');

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
        // Usar MONGO_URI como variable principal, MONGODB_URI como fallback
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/polizas';
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
        console.error('URI utilizada:', process.env.MONGO_URI || process.env.MONGODB_URI || 'localhost');
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
 * Validar archivos de una póliza (versión completa)
 */
function validarArchivos(poliza) {
    const conteos = contarArchivos(poliza);
    
    // Verificar si tiene al menos 1 foto y 1 PDF
    const tieneFotos = conteos.totalFotos > 0;
    const tienePdf = conteos.totalPdfs > 0;
    
    // Incluir en reporte si le falta fotos O PDFs (o ambos)
    const debeIncluirse = !tieneFotos || !tienePdf;
    
    return {
        ...conteos,
        tieneFotos,
        tienePdf,
        debeIncluirse
    };
}

/**
 * Procesar lote de pólizas de forma asíncrona
 */
async function procesarLotePolizas(lote) {
    const polizasConProblemas = [];
    
    // Procesar todas las pólizas del lote en paralelo
    const resultados = await Promise.all(
        lote.map(async (poliza) => {
            try {
                const validacion = validarArchivos(poliza);
                
                // Solo incluir si debe aparecer en el reporte
                if (validacion.debeIncluirse) {
                    return {
                        numeroPoliza: poliza.numeroPoliza,
                        tieneFotos: validacion.tieneFotos ? '✓' : 'X',
                        tienePdf: validacion.tienePdf ? '✓' : 'X',
                        
                        // Determinar severidad para colores
                        severidad: (!validacion.tieneFotos && !validacion.tienePdf) ? 'CRITICO' : 
                                  !validacion.tieneFotos ? 'SIN_FOTOS' : 'SIN_PDF'
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error procesando póliza ${poliza.numeroPoliza}:`, error);
                return null;
            }
        })
    );
    
    // Filtrar resultados nulos
    return resultados.filter(resultado => resultado !== null);
}

/**
 * Procesar todas las pólizas
 */
async function procesarPolizas() {
    console.log('🔍 Iniciando análisis de pólizas...');
    
    const totalPolizas = await Policy.countDocuments({ estado: 'ACTIVO' });
    console.log(`📊 Total de pólizas activas: ${totalPolizas}`);
    
    if (totalPolizas === 0) {
        console.log('⚠️ No se encontraron pólizas activas');
        return [];
    }
    
    const polizasConProblemas = [];
    let procesadas = 0;
    
    // Procesar en lotes optimizados para eficiencia
    const BATCH_SIZE = 50; // Reducido para mejor performance
    
    for (let offset = 0; offset < totalPolizas; offset += BATCH_SIZE) {
        try {
            console.log(`📈 Procesando lote ${Math.floor(offset/BATCH_SIZE) + 1}/${Math.ceil(totalPolizas/BATCH_SIZE)}...`);
            
            const lote = await Policy.find({ estado: 'ACTIVO' })
                .select('numeroPoliza titular aseguradora tipoPoliza esNIP archivos createdAt')
                .skip(offset)
                .limit(BATCH_SIZE)
                .lean();
            
            // Procesar lote en paralelo
            const problemasLote = await procesarLotePolizas(lote);
            polizasConProblemas.push(...problemasLote);
            
            procesadas += lote.length;
            
            // Mostrar progreso cada lote
            console.log(`📈 Progreso: ${procesadas}/${totalPolizas} (${polizasConProblemas.length} con problemas)`);
            
        } catch (error) {
            console.error(`Error procesando lote en offset ${offset}:`, error);
        }
    }
    
    console.log(`\n✅ Análisis completado:`);
    console.log(`📊 Total procesadas: ${procesadas}`);
    console.log(`⚠️ CON PROBLEMAS: ${polizasConProblemas.length}`);
    console.log(`✅ COMPLETAS: ${procesadas - polizasConProblemas.length}`);
    
    return polizasConProblemas;
}

/**
 * Generar archivo Excel
 */
async function generarExcel(polizasConProblemas) {
    console.log('📝 Generando archivo Excel...');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Validación de Archivos');
    
    // Configurar columnas (solo 3 columnas necesarias)
    worksheet.columns = [
        { header: 'NUMERO_POLIZA', key: 'numeroPoliza', width: 20 },
        { header: 'FOTOS', key: 'tieneFotos', width: 10 },
        { header: 'PDF', key: 'tienePdf', width: 10 }
    ];
    
    // Estilo del encabezado
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
    };
    
    // Agregar datos con sistema de semáforo
    polizasConProblemas.forEach(poliza => {
        const row = worksheet.addRow(poliza);
        
        // Sistema de colores tipo semáforo
        if (poliza.severidad === 'CRITICO') {
            // Sin fotos Y sin PDF - Rojo
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFF6B6B' } // Rojo suave
            };
        } else if (poliza.severidad === 'SIN_FOTOS') {
            // Sin fotos pero con PDF - Naranja
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFA726' } // Naranja
            };
        } else if (poliza.severidad === 'SIN_PDF') {
            // Sin PDF pero con fotos - Amarillo
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFF59' } // Amarillo
            };
        }
    });
    
    // Agregar resumen al final
    const resumenRow = worksheet.addRow({});
    resumenRow.getCell(1).value = 'RESUMEN:';
    resumenRow.getCell(1).font = { bold: true };
    
    const estadisticasRow = worksheet.addRow({
        numeroPoliza: `Total con problemas: ${polizasConProblemas.length}`,
        tieneFotos: `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
        tienePdf: 'Sin fotos O sin PDF'
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
            console.log('\n🎉 ¡Excelente! Todas las pólizas activas tienen fotos Y PDFs.');
            
            // Crear Excel vacío con mensaje
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sin Problemas');
            worksheet.addRow(['✅ TODAS LAS PÓLIZAS TIENEN FOTOS Y PDFs']);
            worksheet.addRow([`Fecha de verificación: ${new Date().toLocaleString('es-MX')}`]);
            worksheet.addRow(['Criterio: Al menos 1 foto Y 1 PDF por póliza activa']);
            
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