// scripts/export.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { rimraf } = require('rimraf'); // Cambio en la importación
const Policy = require('../src/models/policy');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Función para limpiar directorio
const cleanDirectory = async (dir) => {
    try {
        await rimraf(dir); // rimraf ahora retorna una promesa directamente
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

        // Usar siempre el mismo directorio
        const backupDir = path.join(__dirname, 'backup');
        const filesDir = path.join(backupDir, 'files');

        // Limpiar directorios existentes
        console.log('🗑️ Limpiando directorios anteriores...');
        await cleanDirectory(backupDir);
        await delay(1000); // Esperar 1 segundo

        // Crear directorios nuevos
        await ensureDirectoryExists(backupDir);
        await ensureDirectoryExists(filesDir);

        const rows = [];
        let totalFiles = 0;
        let processedCount = 0;

        console.log(`📊 Procesando ${policies.length} pólizas...`);

        for (const policy of policies) {
            processedCount++;
            console.log(`\nProcesando póliza ${processedCount}/${policies.length}: ${policy.numeroPoliza}`);

            const policyDir = path.join(filesDir, policy.numeroPoliza);
            await ensureDirectoryExists(policyDir);

            // Procesar archivos
            const processedFiles = {
                fotos: [],
                pdfs: []
            };

            // Procesar fotos
            if (policy.archivos?.fotos?.length > 0) {
                for (let i = 0; i < policy.archivos.fotos.length; i++) {
                    const foto = policy.archivos.fotos[i];
                    if (foto?.data) {
                        try {
                            // Convertir BSON Binary a Buffer
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
                            await delay(500); // Pequeña pausa entre cada foto
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
                            // Convertir BSON Binary a Buffer
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
                            await delay(500); // Pequeña pausa entre cada PDF
                        } catch (err) {
                            console.error(`❌ Error al guardar PDF ${i + 1} de póliza ${policy.numeroPoliza}:`, err);
                        }
                    }
                }
            }

            // Crear fila de Excel
            const row = {
                TITULAR: policy.titular || '',
                'CORREO ELECTRONICO': policy.correo || '',
                CONTRASEÑA: policy.contraseña || '',
                TELEFONO: policy.telefono || '',
                CALLE: policy.calle || '',
                COLONIA: policy.colonia || '',
                MUNICIPIO: policy.municipio || '',
                ESTADO: policy.estado || '',
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
                'FOTOS': JSON.stringify(processedFiles.fotos),
                'PDFS': JSON.stringify(processedFiles.pdfs)
            };

            // Procesar pagos
            const pagos = policy.pagos || [];
            for (let i = 0; i < 12; i++) {
                const pago = pagos[i];
                row[`PAGO${i + 1}_MONTO`] = pago ? pago.monto : '';
                row[`PAGO${i + 1}_FECHA`] = pago && pago.fechaPago
                    ? new Date(pago.fechaPago).toISOString().split('T')[0]
                    : '';
            }

            // Procesar servicios
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

            // Añadir delay cada 5 pólizas
            if (processedCount % 5 === 0) {
                console.log('⏳ Pausando para evitar sobrecarga...');
                await delay(2000); // 2 segundos
            }
        }

        // Crear y guardar Excel
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PolizasCompletas');
        const excelPath = path.join(backupDir, 'polizas_backup.xlsx');
        XLSX.writeFile(workbook, excelPath);

        console.log(`\n✅ Exportación completada exitosamente.`);
        console.log(`📁 Directorio de backup: ${backupDir}`);
        console.log(`📊 Pólizas exportadas: ${rows.length}`);
        console.log(`📎 Archivos exportados: ${totalFiles}`);
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