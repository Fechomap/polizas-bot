// scripts/export.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { rimraf } = require('rimraf');
const Policy = require('../src/models/policy');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Función para limpiar directorio
const cleanDirectory = async (dir) => {
    try {
        await rimraf(dir);
        console.log(`✅ Directorio limpiado: ${dir}`);
    } catch (error) {
        console.error(`❌ Error al limpiar directorio: ${dir}`, error);
        throw error;
    }
};

// Función para esperar
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }
        console.log('✅ Intentando conectar a MongoDB para la exportación...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB para la exportación');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

const ensureDirectoryExists = async (dirPath) => {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
};

const exportData = async () => {
    try {
        const policies = await Policy.find().lean();

        if (!policies.length) {
            console.log('⚠️ No se encontraron pólizas para exportar.');
            process.exit(0);
        }

        // Crear directorio con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const backupDir = path.join(__dirname, 'backup');
        const timestampDir = path.join(backupDir, `export_${timestamp}`);
        const filesDir = path.join(timestampDir, 'files');

        // Asegurar que existe el directorio principal y crear el de exportación
        await ensureDirectoryExists(backupDir);
        await ensureDirectoryExists(timestampDir);
        await ensureDirectoryExists(filesDir);

        const rows = [];
        let totalFiles = 0;
        let processedCount = 0;

        console.log(`📊 Procesando ${policies.length} pólizas...`);

        for (const policy of policies) {
            processedCount++;
            console.log(`\nProcesando póliza ${processedCount}/${policies.length}: ${policy.numeroPoliza}`);

            // Verificar si la póliza está eliminada
            if (policy.estado === 'ELIMINADO') {
                console.log(`⚠️ Póliza ${policy.numeroPoliza} está ELIMINADA, omitiendo archivos adjuntos.`);
            } else {
                // Solo procesar archivos si no está eliminada
                const policyDir = path.join(filesDir, policy.numeroPoliza);
                await ensureDirectoryExists(policyDir);

                // Procesar archivos
                const processedFiles = { fotos: [], pdfs: [] };

                // Procesar fotos
                if (policy.archivos?.fotos?.length > 0) {
                    for (let i = 0; i < policy.archivos.fotos.length; i++) {
                        const foto = policy.archivos.fotos[i];
                        if (foto?.data) {
                            try {
                                const buffer = Buffer.from(foto.data.buffer || foto.data);
                                const fileName = `foto_${i + 1}.jpg`;
                                const filePath = path.join(policyDir, fileName);
                                await fs.writeFile(filePath, buffer);
                                processedFiles.fotos.push({
                                    nombre: fileName,
                                    contentType: foto.contentType || 'image/jpeg'
                                });
                                totalFiles++;
                                console.log(`✅ Foto ${fileName} guardada para póliza ${policy.numeroPoliza}`);
                                await delay(200);
                            } catch (err) {
                                console.error(`❌ Error al guardar foto ${i + 1} de póliza ${policy.numeroPoliza}:`, err);
                            }
                        }
                    }
                }

                // Procesar PDFs
                if (policy.archivos?.pdfs?.length > 0) {
                    for (let i = 0; i < policy.archivos.pdfs.length; i++) {
                        const pdf = policy.archivos.pdfs[i];
                        if (pdf?.data) {
                            try {
                                const buffer = Buffer.from(pdf.data.buffer || pdf.data);
                                const fileName = `documento_${i + 1}.pdf`;
                                const filePath = path.join(policyDir, fileName);
                                await fs.writeFile(filePath, buffer);
                                processedFiles.pdfs.push({
                                    nombre: fileName,
                                    contentType: pdf.contentType || 'application/pdf'
                                });
                                totalFiles++;
                                console.log(`✅ PDF ${fileName} guardado para póliza ${policy.numeroPoliza}`);
                                await delay(200);
                            } catch (err) {
                                console.error(`❌ Error al guardar PDF ${i + 1} de póliza ${policy.numeroPoliza}:`, err);
                            }
                        }
                    }
                }
            }

            // Incluir datos en el Excel, independientemente del estado
            const row = {
                TITULAR: policy.titular || '',
                'CORREO ELECTRONICO': policy.correo || '',
                CONTRASEÑA: policy.contraseña || '',
                TELEFONO: policy.telefono || '',
                CALLE: policy.calle || '',
                COLONIA: policy.colonia || '',
                MUNICIPIO: policy.municipio || '',
                ESTADO: policy.estadoRegion || '',
                CP: policy.cp || '',
                RFC: policy.rfc || '',
                MARCA: policy.marca || '',
                SUBMARCA: policy.submarca || '',
                AÑO: policy.año || '',
                COLOR: policy.color || '',
                SERIE: policy.serie || '',
                PLACAS: policy.placas || '',
                'AGENTE COTIZADOR': policy.agenteCotizador || '',
                ASEGURADORA: policy.aseguradora || '',
                '# DE POLIZA': policy.numeroPoliza || '',
                'FECHA DE EMISION': policy.fechaEmision
                    ? new Date(policy.fechaEmision).toISOString().split('T')[0]
                    : '',
                'ESTADO_POLIZA': policy.estadoPoliza || '',
                'FECHA_FIN_COBERTURA': policy.fechaFinCobertura || '',
                'FECHA_FIN_GRACIA': policy.fechaFinGracia || '',
                'DIAS_RESTANTES_COBERTURA': policy.diasRestantesCobertura || '',
                'DIAS_RESTANTES_GRACIA': policy.diasRestantesGracia || '',
                'NUM_FOTOS': policy.archivos && policy.archivos.fotos ? policy.archivos.fotos.length : 0,
                'NUM_PDFS': policy.archivos && policy.archivos.pdfs ? policy.archivos.pdfs.length : 0,
                'ESTADO_DB': policy.estado || 'ACTIVO',
            };

            const pagos = policy.pagos || [];
            for (let i = 0; i < 12; i++) {
                const pago = pagos[i];
                row[`PAGO${i + 1}_MONTO`] = pago ? pago.monto : '';
                row[`PAGO${i + 1}_FECHA`] = pago && pago.fechaPago
                    ? new Date(pago.fechaPago).toISOString().split('T')[0]
                    : '';
            }

            const servicios = policy.servicios || [];
            for (let i = 0; i < 12; i++) {
                const servicio = servicios[i];
                row[`SERVICIO${i + 1}_COSTO`] = servicio ? servicio.costo : '';
                row[`SERVICIO${i + 1}_FECHA`] = servicio && servicio.fechaServicio
                    ? new Date(servicio.fechaServicio).toISOString().split('T')[0]
                    : '';
                row[`SERVICIO${i + 1}_EXPEDIENTE`] = servicio ? servicio.numeroExpediente : '';
                row[`SERVICIO${i + 1}_ORIGEN_DESTINO`] = servicio ? servicio.origenDestino : '';
            }

            rows.push(row);

            if (processedCount % 5 === 0) {
                console.log('⏳ Pausando para evitar sobrecarga...');
                await delay(1000);
            }
        }

        // Crear y guardar el archivo Excel
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PolizasCompletas');

        const excelPath = path.join(timestampDir, 'polizas_backup.xlsx');
        XLSX.writeFile(workbook, excelPath);

        const excelPathMain = path.join(backupDir, 'polizas_backup.xlsx');
        XLSX.writeFile(workbook, excelPathMain);

        // Crear archivo de resumen con estadísticas
        const resumen = {
            fecha_exportacion: new Date().toISOString(),
            directorio_backup: timestampDir,
            total_polizas: rows.length,
            total_archivos: totalFiles,
            estados: {
                VIGENTE: rows.filter(row => row.ESTADO_POLIZA === 'VIGENTE').length,
                POR_TERMINAR: rows.filter(row => row.ESTADO_POLIZA === 'POR_TERMINAR').length,
                PERIODO_GRACIA: rows.filter(row => row.ESTADO_POLIZA === 'PERIODO_GRACIA').length,
                A_VENCER: rows.filter(row => row.ESTADO_POLIZA === 'A_VENCER').length,
                VENCIDA: rows.filter(row => row.ESTADO_POLIZA === 'VENCIDA').length
            }
        };

        await fs.writeFile(
            path.join(timestampDir, 'resumen_exportacion.json'),
            JSON.stringify(resumen, null, 2)
        );

        console.log('\n✅ Exportación completada exitosamente.');
        console.log(`📁 Directorio de backup: ${timestampDir}`);
        console.log(`📊 Pólizas exportadas: ${rows.length}`);
        console.log(`📎 Archivos exportados: ${totalFiles}`);
        console.log('📊 Estadísticas por estado:');
        console.log(`   - Vigentes: ${resumen.estados.VIGENTE}`);
        console.log(`   - Por terminar: ${resumen.estados.POR_TERMINAR}`);
        console.log(`   - En periodo de gracia: ${resumen.estados.PERIODO_GRACIA}`);
        console.log(`   - A vencer: ${resumen.estados.A_VENCER}`);
        console.log(`   - Vencidas: ${resumen.estados.VENCIDA}`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la exportación:', error);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();
    await exportData();
};

run();
