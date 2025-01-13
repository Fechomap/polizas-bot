// scripts/export.js
// scripts/exportWithFiles.js

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const Policy = require('../src/models/policy');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB para la exportación...');
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

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

        // Crear directorio para el backup
        const backupDir = path.join(__dirname, 'backup');
        const filesDir = path.join(backupDir, 'files');
        await ensureDirectoryExists(backupDir);
        await ensureDirectoryExists(filesDir);

        const rows = [];
        let totalFiles = 0;

        for (const policy of policies) {
            const {
                titular,
                correo,
                contraseña,
                telefono,
                calle,
                colonia,
                municipio,
                estado,
                cp,
                rfc,
                marca,
                submarca,
                año,
                color,
                serie,
                placas,
                agenteCotizador,
                aseguradora,
                numeroPoliza,
                fechaEmision,
                pagos = [],
                servicios = [],
                archivos = { fotos: [], pdfs: [] }
            } = policy;

            // Procesar archivos
            const processedFiles = {
                fotos: [],
                pdfs: []
            };

            // Crear directorio específico para esta póliza
            const policyDir = path.join(filesDir, numeroPoliza);
            await ensureDirectoryExists(policyDir);

            // Procesar fotos
            if (archivos.fotos && archivos.fotos.length > 0) {
                for (let i = 0; i < archivos.fotos.length; i++) {
                    const foto = archivos.fotos[i];
                    if (foto && foto.data) {
                        const fileName = `foto_${i + 1}.${foto.contentType.split('/')[1]}`;
                        const filePath = path.join(policyDir, fileName);
                        await fs.writeFile(filePath, foto.data);
                        processedFiles.fotos.push({
                            nombre: fileName,
                            contentType: foto.contentType
                        });
                        totalFiles++;
                    }
                }
            }

            // Procesar PDFs
            if (archivos.pdfs && archivos.pdfs.length > 0) {
                for (let i = 0; i < archivos.pdfs.length; i++) {
                    const pdf = archivos.pdfs[i];
                    if (pdf && pdf.data) {
                        const fileName = `documento_${i + 1}.pdf`;
                        const filePath = path.join(policyDir, fileName);
                        await fs.writeFile(filePath, pdf.data);
                        processedFiles.pdfs.push({
                            nombre: fileName,
                            contentType: pdf.contentType
                        });
                        totalFiles++;
                    }
                }
            }

            // Datos base de la póliza (igual que antes)
            const row = {
                TITULAR: titular || '',
                'CORREO ELECTRONICO': correo || '',
                CONTRASEÑA: contraseña || '',
                TELEFONO: telefono || '',
                CALLE: calle || '',
                COLONIA: colonia || '',
                MUNICIPIO: municipio || '',
                ESTADO: estado || '',
                CP: cp || '',
                RFC: rfc || '',
                MARCA: marca || '',
                SUBMARCA: submarca || '',
                AÑO: año || '',
                COLOR: color || '',
                SERIE: serie || '',
                PLACAS: placas || '',
                'AGENTE COTIZADOR': agenteCotizador || '',
                ASEGURADORA: aseguradora || '',
                '# DE POLIZA': numeroPoliza || '',
                'FECHA DE EMISION': fechaEmision
                    ? fechaEmision.toISOString().split('T')[0]
                    : ''
            };

            // Agregar información de archivos
            row['FOTOS'] = JSON.stringify(processedFiles.fotos);
            row['PDFS'] = JSON.stringify(processedFiles.pdfs);

            // Procesar pagos y servicios (igual que antes)
            for (let i = 0; i < 12; i++) {
                const pago = pagos[i];
                row[`PAGO${i + 1}_MONTO`] = pago ? pago.monto : '';
                row[`PAGO${i + 1}_FECHA`] = pago && pago.fechaPago
                    ? pago.fechaPago.toISOString().split('T')[0]
                    : '';
            }

            for (let i = 0; i < 12; i++) {
                const servicio = servicios[i];
                row[`SERVICIO${i + 1}_COSTO`] = servicio ? servicio.costo : '';
                row[`SERVICIO${i + 1}_FECHA`] = servicio && servicio.fechaServicio
                    ? servicio.fechaServicio.toISOString().split('T')[0]
                    : '';
                row[`SERVICIO${i + 1}_EXPEDIENTE`] = servicio ? servicio.numeroExpediente : '';
                row[`SERVICIO${i + 1}_ORIGEN_DESTINO`] = servicio ? servicio.origenDestino : '';
            }

            rows.push(row);
        }

        // Crear archivo Excel
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PolizasCompletas');
        
        // Guardar Excel en el directorio de backup
        const excelPath = path.join(backupDir, 'polizas_backup.xlsx');
        XLSX.writeFile(workbook, excelPath);

        console.log(`✅ Exportación completada exitosamente.`);
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