// scripts/import.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Policy = require('../src/models/policy');

// Función para esperar
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }
        console.log('✅ Intentando conectar a MongoDB para la importación...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB para la importación');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

const findLatestExport = async (backupDir) => {
    try {
        const entries = await fs.readdir(backupDir, { withFileTypes: true });
        const exportDirs = entries
            .filter(entry => entry.isDirectory() && entry.name.startsWith('export_'))
            .map(entry => entry.name)
            .sort()
            .reverse();
        if (exportDirs.length === 0) {
            throw new Error('No se encontraron directorios de exportación en: ' + backupDir);
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
            throw new Error(`No se encontró el archivo Excel en el directorio de exportación más reciente: ${latestExportDir}`);
        }
    } catch (error) {
        throw error;
    }
};

const convertirFecha = (fecha) => {
    if (!fecha) return null;
    try {
        if (typeof fecha === 'string' && fecha.includes('-')) {
            const date = new Date(fecha);
            return !isNaN(date) ? date : null;
        }
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'number') {
            const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
            return !isNaN(date) ? date : null;
        }
        const partes = fecha.split('/');
        if (partes.length === 3) {
            const [dia, mes, anio] = partes;
            const anioCompleto = anio.length === 2 ? `20${anio}` : anio;
            const fechaFormateada = `${anioCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            const date = new Date(fechaFormateada);
            return !isNaN(date) ? date : null;
        }
    } catch (error) {
        console.error('Error al convertir fecha:', fecha, error);
        return null;
    }
    return null;
};

const toUpperIfExists = (value) => {
    if (value == null || value === '') return '';
    return String(value).toUpperCase().trim().replace(/[\r\n\t]/g, '');
};

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
        } catch (err) {
            console.error(`❌ El directorio de archivos no existe: ${filesDir}`);
            process.exit(1);
        }
        const workbook = XLSX.readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
        console.log(`📊 Datos leídos desde Excel: ${data.length} registros`);

        let insertedCount = 0;
        let updatedCount = 0;
        let processedCount = 0;
        let totalFiles = 0;
        let policiesWithoutFiles = 0;

        // Contadores por estado (tomados del Excel)
        const estadisticas = {
            VIGENTE: 0,
            POR_TERMINAR: 0,
            PERIODO_GRACIA: 0,
            A_VENCER: 0,
            VENCIDA: 0
        };

        for (const item of data) {
            processedCount++;
            console.log(`\nProcesando registro ${processedCount}/${data.length}`);

            // Procesar pagos
            const pagos = [];
            for (let i = 1; i <= 12; i++) {
                const monto = item[`PAGO${i}_MONTO`];
                const fecha = item[`PAGO${i}_FECHA`];
                if (monto || fecha) {
                    pagos.push({
                        monto: monto || 0,
                        fechaPago: convertirFecha(fecha)
                    });
                }
            }

            // Procesar servicios
            const servicios = [];
            for (let i = 1; i <= 12; i++) {
                const costo = item[`SERVICIO${i}_COSTO`];
                const fecha = item[`SERVICIO${i}_FECHA`];
                const expediente = item[`SERVICIO${i}_EXPEDIENTE`];
                const origenDestino = item[`SERVICIO${i}_ORIGEN_DESTINO`];
                if (costo || fecha || expediente || origenDestino) {
                    servicios.push({
                        numeroServicio: i,
                        costo: costo || 0,
                        fechaServicio: convertirFecha(fecha),
                        numeroExpediente: expediente || '',
                        origenDestino: origenDestino || ''
                    });
                }
            }

            const numeroPoliza = toUpperIfExists(item['# DE POLIZA']);
            if (!numeroPoliza) {
                console.log('⚠️ Registro sin número de póliza, saltando...');
                continue;
            }

            // Procesar archivos
            const archivos = { fotos: [], pdfs: [] };
            const policyDir = path.join(filesDir, numeroPoliza);
            try {
                await fs.access(policyDir);
                const files = await fs.readdir(policyDir);
                for (const file of files) {
                    const filePath = path.join(policyDir, file);
                    const fileData = await fs.readFile(filePath);
                    if (file.startsWith('foto_')) {
                        archivos.fotos.push({
                            data: fileData,
                            contentType: 'image/jpeg'
                        });
                        totalFiles++;
                        console.log(`✅ Foto ${file} cargada para póliza ${numeroPoliza}`);
                    } else if (file.startsWith('documento_')) {
                        archivos.pdfs.push({
                            data: fileData,
                            contentType: 'application/pdf'
                        });
                        totalFiles++;
                        console.log(`✅ PDF ${file} cargado para póliza ${numeroPoliza}`);
                    }
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    policiesWithoutFiles++;
                    console.log(`⚠️ No se encontraron archivos para la póliza ${numeroPoliza}`);
                } else {
                    console.error(`❌ Error al procesar archivos de póliza ${numeroPoliza}:`, err);
                }
            }

            const fechaEmision = convertirFecha(item['FECHA DE EMISION']);

            // Se arma el objeto de la póliza
            const policyData = {
                titular: toUpperIfExists(item['TITULAR']),
                correo: item['CORREO ELECTRONICO']?.toLowerCase() || '',
                contraseña: item['CONTRASEÑA'] || '',
                telefono: item['TELEFONO'] || '',
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
                fechaEmision: fechaEmision,
                pagos,
                servicios,
                archivos,
                estado: toUpperIfExists(item['ESTADO_POLIZA']) || '' // Usar el estado del Excel directamente
            };

            // Limpieza del número de póliza si tiene problemas
            if (policyData.numeroPoliza.length > 20 || /[\r\n\t]/.test(policyData.numeroPoliza)) {
                console.log(`⚠️ Detectado problema en número de póliza: "${policyData.numeroPoliza}"`);
                policyData.numeroPoliza = policyData.numeroPoliza.trim().replace(/[\r\n\t]/g, '');
                console.log(`   Corregido a: "${policyData.numeroPoliza}"`);
            }

            // Actualizar estadísticas basadas en el estado del Excel
            const estadoExcel = policyData.estado;
            if (estadisticas.hasOwnProperty(estadoExcel)) {
                estadisticas[estadoExcel]++;
            }

            try {
                const result = await Policy.findOneAndUpdate(
                    { numeroPoliza: numeroPoliza },
                    policyData,
                    { upsert: true, new: true }
                );

                if (result.isNew) {
                    insertedCount++;
                    console.log(`✅ Póliza ${numeroPoliza} insertada con ${archivos.fotos.length} fotos y ${archivos.pdfs.length} PDFs`);
                } else {
                    updatedCount++;
                    console.log(`✅ Póliza ${numeroPoliza} actualizada con ${archivos.fotos.length} fotos y ${archivos.pdfs.length} PDFs`);
                }
                if (processedCount % 2 === 0) {
                    console.log('⏳ Pausando para evitar sobrecarga...');
                    await delay(1000);
                }
            } catch (err) {
                console.error(`❌ Error al procesar la póliza ${numeroPoliza}:`, err);
            }
        }

        console.log('\n✅ Importación completada:');
        console.log(`📥 Pólizas insertadas: ${insertedCount}`);
        console.log(`🔄 Pólizas actualizadas: ${updatedCount}`);
        console.log(`📎 Archivos procesados: ${totalFiles}`);
        console.log(`⚠️ Pólizas sin archivos encontrados: ${policiesWithoutFiles}`);

        console.log('\n📊 Estadísticas por estado:');
        console.log(`   - Vigente: ${estadisticas.VIGENTE}`);
        console.log(`   - Por terminar: ${estadisticas.POR_TERMINAR}`);
        console.log(`   - En periodo de gracia: ${estadisticas.PERIODO_GRACIA}`);
        console.log(`   - A vencer: ${estadisticas.A_VENCER}`);
        console.log(`   - Vencida: ${estadisticas.VENCIDA}`);

        try {
            const resumen = {
                fecha_importacion: new Date().toISOString(),
                directorio_origen: exportDirName,
                total_polizas: insertedCount + updatedCount,
                insertadas: insertedCount,
                actualizadas: updatedCount,
                total_archivos: totalFiles,
                polizas_sin_archivos: policiesWithoutFiles,
                estados: estadisticas
            };

            await fs.writeFile(
                path.join(backupDir, 'resumen_importacion.json'),
                JSON.stringify(resumen, null, 2)
            );
            console.log('📄 Archivo de resumen guardado');
        } catch (error) {
            console.error('❌ Error al guardar resumen:', error);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la importación:', error);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();
    await importData();
};

run();