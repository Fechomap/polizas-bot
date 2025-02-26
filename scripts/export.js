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

// Función para calcular estado actual de la póliza
const calcularEstadoPoliza = (policy) => {
    const now = new Date();
    const fechaEmision = new Date(policy.fechaEmision);
    const pagos = policy.pagos || [];
    
    // Calcular fecha límite del primer mes (cobertura inicial)
    const fechaLimitePrimerMes = new Date(fechaEmision);
    fechaLimitePrimerMes.setMonth(fechaLimitePrimerMes.getMonth() + 1);
    
    // Calcular fecha de cobertura real basada en emisión y pagos
    let fechaCobertura = new Date(fechaEmision);
    
    // Cada pago da un mes de cobertura real
    if (pagos.length > 0) {
        // La cobertura real es "pagos.length" meses desde la emisión
        fechaCobertura = new Date(fechaEmision);
        fechaCobertura.setMonth(fechaEmision.getMonth() + pagos.length);
    } else {
        // Si no hay pagos, solo hay el mes inicial desde emisión
        fechaCobertura = new Date(fechaEmision);
        fechaCobertura.setMonth(fechaEmision.getMonth() + 1);
    }
    
    // El periodo de gracia es un mes adicional después de la cobertura real
    const fechaVencimiento = new Date(fechaCobertura);
    fechaVencimiento.setMonth(fechaCobertura.getMonth() + 1);
    
    // Calcular días restantes hasta el fin de la cobertura
    const diasHastaFinCobertura = Math.ceil((fechaCobertura - now) / (1000 * 60 * 60 * 24));
    
    // Calcular días restantes hasta fin del periodo de gracia
    const diasHastaVencimiento = Math.ceil((fechaVencimiento - now) / (1000 * 60 * 60 * 24));
    
    // Verificar si ya pasó más de un mes desde la emisión y no tiene pagos
    const sinPagoYFueraDePlazo = pagos.length === 0 && now > fechaLimitePrimerMes;
    
    let estado = '';
    
    if (sinPagoYFueraDePlazo) {
        // Sin pagos y ya pasó el primer mes + periodo de gracia
        estado = "FUERA_DE_COBERTURA";
    } else if (diasHastaFinCobertura > 7) {
        // Más de una semana hasta fin de cobertura real
        estado = "VIGENTE";
    } else if (diasHastaFinCobertura > 0) {
        // A punto de terminar cobertura real
        estado = "POR_TERMINAR";
    } else if (diasHastaVencimiento > 0) {
        // En periodo de gracia
        estado = "PERIODO_GRACIA";
    } else {
        // Vencida (pasó periodo de gracia)
        estado = "VENCIDA";
    }

    return {
        estado,
        fechaCobertura: fechaCobertura.toISOString().split('T')[0],
        fechaVencimiento: fechaVencimiento.toISOString().split('T')[0],
        diasHastaFinCobertura,
        diasHastaVencimiento,
        fechaLimitePrimerMes: fechaLimitePrimerMes.toISOString().split('T')[0]
    };
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

            // Calcular estado de la póliza
            const estadoPoliza = calcularEstadoPoliza(policy);

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
                // Nuevos campos para el estado de la póliza
                'ESTADO_POLIZA': estadoPoliza.estado,
                'FECHA_FIN_COBERTURA': estadoPoliza.fechaCobertura,
                'FECHA_FIN_GRACIA': estadoPoliza.fechaVencimiento,
                'DIAS_RESTANTES_COBERTURA': estadoPoliza.diasHastaFinCobertura,
                'DIAS_RESTANTES_GRACIA': estadoPoliza.diasHastaVencimiento,
                // Guardar también los archivos
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

        // Crear un archivo de resumen con estadísticas
        const resumen = {
            fecha_exportacion: new Date().toISOString(),
            total_polizas: rows.length,
            total_archivos: totalFiles,
            estados: {
                VIGENTE: rows.filter(row => row.ESTADO_POLIZA === 'VIGENTE').length,
                POR_TERMINAR: rows.filter(row => row.ESTADO_POLIZA === 'POR_TERMINAR').length,
                PERIODO_GRACIA: rows.filter(row => row.ESTADO_POLIZA === 'PERIODO_GRACIA').length,
                VENCIDA: rows.filter(row => row.ESTADO_POLIZA === 'VENCIDA').length,
                FUERA_DE_COBERTURA: rows.filter(row => row.ESTADO_POLIZA === 'FUERA_DE_COBERTURA').length,
            }
        };

        await fs.writeFile(
            path.join(backupDir, 'resumen_exportacion.json'),
            JSON.stringify(resumen, null, 2)
        );

        console.log(`\n✅ Exportación completada exitosamente.`);
        console.log(`📁 Directorio de backup: ${backupDir}`);
        console.log(`📊 Pólizas exportadas: ${rows.length}`);
        console.log(`📎 Archivos exportados: ${totalFiles}`);
        console.log(`📊 Estadísticas por estado:`);
        console.log(`   - Vigentes: ${resumen.estados.VIGENTE}`);
        console.log(`   - Por terminar: ${resumen.estados.POR_TERMINAR}`);
        console.log(`   - En periodo de gracia: ${resumen.estados.PERIODO_GRACIA}`);
        console.log(`   - Vencidas: ${resumen.estados.VENCIDA}`);
        console.log(`   - Fuera de cobertura: ${resumen.estados.FUERA_DE_COBERTURA}`);
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