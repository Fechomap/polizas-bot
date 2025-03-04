// scripts/exportExcel.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const Policy = require('../src/models/policy');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

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

// Función para calcular el estado actual de la póliza
const calcularEstadoPoliza = (policy) => {
    const now = new Date();
    const fechaEmision = new Date(policy.fechaEmision);
    const pagos = policy.pagos || [];
    
    // Calcular la fecha límite del mes de emisión (último día del mes)
    const fechaLimitePrimerMes = new Date(fechaEmision);
    fechaLimitePrimerMes.setMonth(fechaEmision.getMonth() + 1);
    fechaLimitePrimerMes.setDate(0); // Último día del mes de emisión

    // Determinar la fecha de cobertura real en función de los pagos
    let fechaCobertura = new Date(fechaEmision);
    fechaCobertura.setMonth(fechaEmision.getMonth() + pagos.length);

    // Calcular la fecha de vencimiento (período de gracia de 1 mes después de la cobertura)
    const fechaVencimiento = new Date(fechaCobertura);
    fechaVencimiento.setMonth(fechaCobertura.getMonth() + 1);

    // Calcular días restantes
    const diasHastaFinCobertura = Math.ceil((fechaCobertura - now) / (1000 * 60 * 60 * 24));
    const diasHastaVencimiento = Math.ceil((fechaVencimiento - now) / (1000 * 60 * 60 * 24));

    // Determinar el estado de la póliza
    let estado = '';

    if (pagos.length === 0 && now > fechaLimitePrimerMes) {
        estado = "VENCIDA";
    } else if (diasHastaFinCobertura > 7) {
        estado = "VIGENTE";
    } else if (diasHastaFinCobertura > 0) {
        estado = "POR_TERMINAR";
    } else if (diasHastaVencimiento > 0) {
        estado = "PERIODO_GRACIA";
    } else {
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

const exportExcel = async () => {
    try {
        console.log('🔍 Buscando pólizas en la base de datos...');
        const policies = await Policy.find().lean();

        if (!policies.length) {
            console.log('⚠️ No se encontraron pólizas para exportar.');
            process.exit(0);
        }

        console.log(`📊 Encontradas ${policies.length} pólizas. Procesando datos...`);

        // Asegurar que existe el directorio para el Excel
        const backupDir = path.join(__dirname, 'backup');
        await ensureDirectoryExists(backupDir);

        const rows = [];
        let processedCount = 0;
        let totalFotos = 0;
        let totalPdfs = 0;

        for (const policy of policies) {
            processedCount++;
            
            // Contar archivos para estadísticas
            const numFotos = policy.archivos?.fotos?.length || 0;
            const numPdfs = policy.archivos?.pdfs?.length || 0;
            totalFotos += numFotos;
            totalPdfs += numPdfs;

            // Calcular estado de la póliza
            const estadoPoliza = calcularEstadoPoliza(policy);

            // Crear fila de Excel con todos los datos de la póliza
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
                // Datos de estado y fechas importantes
                'ESTADO_POLIZA': estadoPoliza.estado,
                'FECHA_FIN_COBERTURA': estadoPoliza.fechaCobertura,
                'FECHA_FIN_GRACIA': estadoPoliza.fechaVencimiento,
                'DIAS_RESTANTES_COBERTURA': estadoPoliza.diasHastaFinCobertura,
                'DIAS_RESTANTES_GRACIA': estadoPoliza.diasHastaVencimiento,
                // Conteo de archivos (sin exportar su contenido)
                'NUM_FOTOS': numFotos,
                'NUM_PDFS': numPdfs,
                'ESTADO_DB': policy.estado || 'ACTIVO'
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

            // Mostrar progreso cada 20 pólizas
            if (processedCount % 20 === 0 || processedCount === policies.length) {
                console.log(`⏳ Procesadas ${processedCount}/${policies.length} pólizas...`);
            }
        }

        // Crear y guardar Excel (solo con timestamp)
        console.log('📝 Generando archivo Excel...');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PolizasCompletas');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const excelPath = path.join(backupDir, `polizas_backup_${timestamp}.xlsx`);
        XLSX.writeFile(workbook, excelPath);

        // Eliminado: Ya no guardamos la versión sin timestamp

        // Crear estadísticas
        const stats = {
            VIGENTE: rows.filter(row => row.ESTADO_POLIZA === 'VIGENTE').length,
            POR_TERMINAR: rows.filter(row => row.ESTADO_POLIZA === 'POR_TERMINAR').length,
            PERIODO_GRACIA: rows.filter(row => row.ESTADO_POLIZA === 'PERIODO_GRACIA').length,
            VENCIDA: rows.filter(row => row.ESTADO_POLIZA === 'VENCIDA').length
        };

        console.log(`\n✅ Exportación completada exitosamente.`);
        console.log(`📊 Resumen:`);
        console.log(`   - Total pólizas: ${rows.length}`);
        console.log(`   - Archivos en la base de datos: ${totalFotos} fotos, ${totalPdfs} PDFs`);
        console.log(`   - Vigentes: ${stats.VIGENTE}`);
        console.log(`   - Por terminar: ${stats.POR_TERMINAR}`);
        console.log(`   - En periodo de gracia: ${stats.PERIODO_GRACIA}`);
        console.log(`   - Vencidas: ${stats.VENCIDA}`);
        console.log(`📁 Archivo Excel guardado en: ${excelPath}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la exportación:', error);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();
    await exportExcel();
};

run();