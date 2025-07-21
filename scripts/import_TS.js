// scripts/import_TS.js
// Versión TypeScript-compatible con conexión directa a MongoDB
require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;

// Esquemas flexibles para compatibilidad TypeScript
const PolicySchema = new mongoose.Schema({}, { strict: false });
const Policy = mongoose.model('Policy', PolicySchema);

// Función para esperar
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Conexión directa a MongoDB compatible con TypeScript
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }
        console.log('✅ Intentando conectar a MongoDB para la importación (TypeScript Compatible)...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB para la importación');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    }
};

// Buscar la exportación más reciente con validación mejorada
const findLatestExport = async backupDir => {
    try {
        // Verificar que el directorio de backup existe
        try {
            await fs.access(backupDir);
        } catch (err) {
            throw new Error(`El directorio de backup no existe: ${backupDir}`);
        }

        const entries = await fs.readdir(backupDir, { withFileTypes: true });
        const exportDirs = entries
            .filter(entry => entry.isDirectory() && entry.name.startsWith('export_'))
            .map(entry => entry.name)
            .sort()
            .reverse();

        if (exportDirs.length === 0) {
            throw new Error(`No se encontraron directorios de exportación en: ${backupDir}`);
        }

        const latestExportDir = exportDirs[0];
        const exportDirPath = path.join(backupDir, latestExportDir);
        const excelPath = path.join(exportDirPath, 'polizas_backup.xlsx');
        
        try {
            await fs.access(excelPath);
            return {
                excelPath,
                exportDir: exportDirPath,
                exportDirName: latestExportDir
            };
        } catch (err) {
            throw new Error(
                `No se encontró el archivo Excel en el directorio de exportación más reciente: ${latestExportDir}`
            );
        }
    } catch (error) {
        throw error;
    }
};

// Conversión de fechas con manejo de errores mejorado
const convertirFecha = fecha => {
    if (!fecha) return null;
    try {
        // Fecha como string ISO
        if (typeof fecha === 'string' && fecha.includes('-')) {
            const date = new Date(fecha);
            return !isNaN(date.getTime()) ? date : null;
        }
        
        // Fecha ya es objeto Date
        if (fecha instanceof Date) {
            return !isNaN(fecha.getTime()) ? fecha : null;
        }
        
        // Fecha como número de serie de Excel
        if (typeof fecha === 'number') {
            const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
            return !isNaN(date.getTime()) ? date : null;
        }
        
        // Fecha como string en formato dd/mm/yyyy
        if (typeof fecha === 'string' && fecha.includes('/')) {
            const partes = fecha.split('/');
            if (partes.length === 3) {
                const [dia, mes, anio] = partes;
                const anioCompleto = anio.length === 2 ? `20${anio}` : anio;
                const fechaFormateada = `${anioCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
                const date = new Date(fechaFormateada);
                return !isNaN(date.getTime()) ? date : null;
            }
        }
    } catch (error) {
        console.warn(`⚠️ Error al convertir fecha: ${fecha}`, error.message);
        return null;
    }
    return null;
};

// Normalizar texto con validación mejorada
const toUpperIfExists = value => {
    if (value == null || value === '') return '';
    try {
        return String(value)
            .toUpperCase()
            .trim()
            .replace(/[\r\n\t]/g, '');
    } catch (error) {
        console.warn(`⚠️ Error al normalizar texto: ${value}`, error.message);
        return '';
    }
};

// Función principal de importación con manejo de errores mejorado
const importData = async () => {
    try {
        const backupDir = path.join(__dirname, 'backup');
        const { excelPath, exportDir, exportDirName } = await findLatestExport(backupDir);
        
        console.log(`🔍 Usando la exportación más reciente: ${exportDirName}`);
        console.log(`📄 Leyendo archivo Excel: ${excelPath}`);
        
        const filesDir = path.join(exportDir, 'files');
        console.log(`🗂️ Directorio de archivos: ${filesDir}`);
        
        try {
            await fs.access(filesDir);
            console.log('✅ Directorio de archivos encontrado');
        } catch (err) {
            console.warn(`⚠️ El directorio de archivos no existe: ${filesDir}. Continuando sin archivos.`);
        }

        // Leer archivo Excel con validación
        const workbook = XLSX.readFile(excelPath);
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('El archivo Excel no contiene hojas de trabajo');
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
        
        console.log(`📊 Datos leídos desde Excel: ${data.length} registros de la hoja: ${sheetName}`);

        if (data.length === 0) {
            console.log('⚠️ No se encontraron datos para importar');
            return;
        }

        let insertedCount = 0;
        let updatedCount = 0;
        let processedCount = 0;
        let totalFiles = 0;
        let policiesWithoutFiles = 0;
        let errorCount = 0;

        // Contadores por estado (tomados del Excel)
        const estadisticas = {
            VIGENTE: 0,
            POR_TERMINAR: 0,
            PERIODO_GRACIA: 0,
            A_VENCER: 0,
            VENCIDA: 0,
            ACTIVO: 0,
            ELIMINADO: 0,
            OTROS: 0
        };

        console.log('🔄 Iniciando procesamiento de registros...');

        for (const item of data) {
            try {
                processedCount++;
                
                if (processedCount % 25 === 0) {
                    console.log(`📊 Procesando registro ${processedCount}/${data.length}`);
                }

                const numeroPoliza = toUpperIfExists(item['# DE POLIZA']);
                if (!numeroPoliza) {
                    console.log(`⚠️ Registro ${processedCount} sin número de póliza, saltando...`);
                    continue;
                }

                // Procesar pagos con validación
                const pagos = [];
                for (let i = 1; i <= 12; i++) {
                    const monto = item[`PAGO${i}_MONTO`];
                    const fecha = item[`PAGO${i}_FECHA`];
                    
                    if (monto || fecha) {
                        const pagoData = {
                            numeroMembresia: i,
                            monto: Number(monto) || 0,
                            fechaPago: convertirFecha(fecha),
                            estado: 'REALIZADO', // Asumimos que los pagos importados están realizados
                            metodoPago: 'IMPORTADO'
                        };
                        
                        // Solo agregar si tiene monto válido
                        if (pagoData.monto > 0) {
                            pagos.push(pagoData);
                        }
                    }
                }

                // Procesar servicios con validación
                const servicios = [];
                for (let i = 1; i <= 12; i++) {
                    const costo = item[`SERVICIO${i}_COSTO`];
                    const fecha = item[`SERVICIO${i}_FECHA`];
                    const expediente = item[`SERVICIO${i}_EXPEDIENTE`];
                    const origenDestino = item[`SERVICIO${i}_ORIGEN_DESTINO`];
                    
                    if (costo || fecha || expediente || origenDestino) {
                        const servicioData = {
                            numeroServicio: i,
                            costo: Number(costo) || 0,
                            fechaServicio: convertirFecha(fecha),
                            numeroExpediente: toUpperIfExists(expediente),
                            origenDestino: toUpperIfExists(origenDestino),
                            estado: 'COMPLETADO'
                        };
                        
                        // Solo agregar si tiene información relevante
                        if (servicioData.costo > 0 || servicioData.numeroExpediente || servicioData.origenDestino) {
                            servicios.push(servicioData);
                        }
                    }
                }

                // Procesar archivos con manejo de errores mejorado
                const archivos = { fotos: [], pdfs: [] };
                const policyDir = path.join(filesDir, numeroPoliza);
                
                try {
                    await fs.access(policyDir);
                    const files = await fs.readdir(policyDir);
                    
                    for (const file of files) {
                        try {
                            const filePath = path.join(policyDir, file);
                            const fileData = await fs.readFile(filePath);
                            
                            if (file.startsWith('foto_') && file.endsWith('.jpg')) {
                                archivos.fotos.push({
                                    data: fileData,
                                    contentType: 'image/jpeg',
                                    filename: file,
                                    size: fileData.length
                                });
                                totalFiles++;
                                console.log(`✅ Foto ${file} cargada para póliza ${numeroPoliza}`);
                            } else if (file.startsWith('documento_') && file.endsWith('.pdf')) {
                                archivos.pdfs.push({
                                    data: fileData,
                                    contentType: 'application/pdf',
                                    filename: file,
                                    size: fileData.length
                                });
                                totalFiles++;
                                console.log(`✅ PDF ${file} cargado para póliza ${numeroPoliza}`);
                            }
                        } catch (fileErr) {
                            console.error(`❌ Error al procesar archivo ${file} de póliza ${numeroPoliza}:`, fileErr.message);
                            errorCount++;
                        }
                    }
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        policiesWithoutFiles++;
                        console.log(`⚠️ No se encontraron archivos para la póliza ${numeroPoliza}`);
                    } else {
                        console.error(`❌ Error al acceder al directorio de archivos de póliza ${numeroPoliza}:`, err.message);
                        errorCount++;
                    }
                }

                // Construir objeto de póliza con validación de tipos
                const policyData = {
                    titular: toUpperIfExists(item['TITULAR']),
                    correo: item['CORREO ELECTRONICO'] ? String(item['CORREO ELECTRONICO']).toLowerCase().trim() : '',
                    contraseña: item['CONTRASEÑA'] ? String(item['CONTRASEÑA']) : '',
                    telefono: toUpperIfExists(item['TELEFONO']),
                    calle: toUpperIfExists(item['CALLE']),
                    colonia: toUpperIfExists(item['COLONIA']),
                    municipio: toUpperIfExists(item['MUNICIPIO']),
                    estadoRegion: toUpperIfExists(item['ESTADO']),
                    cp: toUpperIfExists(item['CP']),
                    rfc: toUpperIfExists(item['RFC']),
                    marca: toUpperIfExists(item['MARCA']),
                    submarca: toUpperIfExists(item['SUBMARCA']),
                    año: item['AÑO'] ? parseInt(item['AÑO'], 10) : null,
                    color: toUpperIfExists(item['COLOR']),
                    serie: toUpperIfExists(item['SERIE']),
                    placas: toUpperIfExists(item['PLACAS']),
                    agenteCotizador: toUpperIfExists(item['AGENTE COTIZADOR']),
                    aseguradora: toUpperIfExists(item['ASEGURADORA']),
                    numeroPoliza: numeroPoliza,
                    fechaEmision: convertirFecha(item['FECHA DE EMISION']),
                    pagos,
                    servicios,
                    archivos,
                    estado: toUpperIfExists(item['ESTADO_POLIZA'] || item['ESTADO_DB']) || 'ACTIVO',
                    // Campos adicionales para compatibilidad TypeScript
                    fechaImportacion: new Date(),
                    versionImportacion: 'TypeScript_Compatible_Import_v1.0'
                };

                // Limpieza del número de póliza si tiene problemas
                if (policyData.numeroPoliza.length > 20 || /[\r\n\t]/.test(policyData.numeroPoliza)) {
                    console.log(`⚠️ Detectado problema en número de póliza: "${policyData.numeroPoliza}"`);
                    policyData.numeroPoliza = policyData.numeroPoliza.trim().replace(/[\r\n\t]/g, '');
                    console.log(`   Corregido a: "${policyData.numeroPoliza}"`);
                }

                // Actualizar estadísticas basadas en el estado
                const estado = policyData.estado;
                if (estadisticas.hasOwnProperty(estado)) {
                    estadisticas[estado]++;
                } else {
                    estadisticas.OTROS++;
                }

                // Limpiar campos vacíos
                Object.keys(policyData).forEach(key => {
                    if (policyData[key] === '' || policyData[key] === null) {
                        delete policyData[key];
                    }
                });

                // Insertar o actualizar la póliza
                const existingPolicy = await Policy.findOne({ numeroPoliza: numeroPoliza });
                
                const result = await Policy.findOneAndUpdate(
                    { numeroPoliza: numeroPoliza },
                    { $set: policyData },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (!existingPolicy) {
                    insertedCount++;
                    console.log(
                        `✅ Póliza ${numeroPoliza} insertada con ${archivos.fotos.length} fotos y ${archivos.pdfs.length} PDFs`
                    );
                } else {
                    updatedCount++;
                    console.log(
                        `🔄 Póliza ${numeroPoliza} actualizada con ${archivos.fotos.length} fotos y ${archivos.pdfs.length} PDFs`
                    );
                }

                // Pausa para evitar sobrecarga
                if (processedCount % 10 === 0) {
                    console.log('⏳ Pausando para evitar sobrecarga...');
                    await delay(1000);
                }

            } catch (err) {
                errorCount++;
                console.error(`❌ Error al procesar registro ${processedCount} (póliza ${item['# DE POLIZA'] || 'sin número'}):`, err.message);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ IMPORTACIÓN COMPLETADA - RESUMEN:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📥 Pólizas insertadas (nuevas): ${insertedCount}`);
        console.log(`🔄 Pólizas actualizadas: ${updatedCount}`);
        console.log(`📎 Archivos procesados: ${totalFiles}`);
        console.log(`⚠️ Pólizas sin archivos: ${policiesWithoutFiles}`);
        console.log(`❌ Errores durante procesamiento: ${errorCount}`);
        console.log('🎯 Versión: TypeScript Compatible Import');

        console.log('\n📊 Estadísticas por estado:');
        Object.keys(estadisticas).forEach(estado => {
            if (estadisticas[estado] > 0) {
                console.log(`   - ${estado}: ${estadisticas[estado]}`);
            }
        });

        // Guardar resumen
        try {
            const resumen = {
                fecha_importacion: new Date().toISOString(),
                directorio_origen: exportDirName,
                total_polizas: insertedCount + updatedCount,
                insertadas: insertedCount,
                actualizadas: updatedCount,
                total_archivos: totalFiles,
                polizas_sin_archivos: policiesWithoutFiles,
                errores_procesamiento: errorCount,
                version: 'TypeScript_Compatible_Import_v1.0',
                estados: estadisticas
            };

            await fs.writeFile(
                path.join(backupDir, 'resumen_importacion.json'),
                JSON.stringify(resumen, null, 2)
            );
            console.log('\n📄 Archivo de resumen guardado exitosamente');
        } catch (error) {
            console.error('❌ Error al guardar resumen:', error);
        }

        console.log('\n📋 PASOS SIGUIENTES RECOMENDADOS:');
        console.log('   1. Ejecutar cálculo de estados: node scripts/estados.js');
        console.log('   2. Verificar integridad: node scripts/verificar-sistema-bd-autos_TS.js');
        console.log('   3. Generar nuevo backup: node scripts/exportExcel_TS.js');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error crítico durante la importación:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    }
};

// Función principal con manejo de errores
const run = async () => {
    try {
        await connectDB();
        await importData();
    } catch (error) {
        console.error('❌ Error durante la ejecución del script:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    } finally {
        try {
            await mongoose.connection.close();
            console.log('✅ Conexión a MongoDB cerrada correctamente.');
        } catch (err) {
            console.error('❌ Error al cerrar la conexión a MongoDB:', err);
        }
    }
};

run();