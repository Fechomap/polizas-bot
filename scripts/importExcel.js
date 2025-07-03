// node scripts/importExcel.js scripts/backup/polizas_backup.xlsx
// scripts/importExcel.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Policy = require('../src/models/policy');

// Conectar a MongoDB
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) throw new Error('MONGO_URI no está definida');
        console.log('✅ Conectando a MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error al conectar:', error.message);
        process.exit(1);
    }
};

// Convertir fechas desde Excel o strings
const convertirFecha = (fecha) => {
    if (!fecha) return null;
    try {
        if (typeof fecha === 'string') {
            const date = new Date(fecha);
            return isNaN(date) ? null : date;
        }
        if (typeof fecha === 'number') { // Fechas como número de serie de Excel
            const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
            return isNaN(date) ? null : date;
        }
    } catch (error) {
        console.warn(`⚠️ Fecha inválida: ${fecha}`);
        return null;
    }
    return null;
};

// Normalizar texto a mayúsculas
const toUpperIfExists = (value) => {
    return value == null ? '' : String(value).toUpperCase().trim();
};

// Importar datos desde Excel
const importExcel = async (excelPath) => {
    try {
        console.log(`📄 Leyendo Excel: ${excelPath}`);
        const workbook = XLSX.readFile(excelPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
        console.log(`📊 ${data.length} registros encontrados`);

        let inserted = 0;
        let updated = 0;

        for (const item of data) {
            const numeroPoliza = toUpperIfExists(item['# DE POLIZA']);
            if (!numeroPoliza) {
                console.log('⚠️ Registro sin número de póliza, omitiendo...');
                continue;
            }

            // --- OBTENER POLICY EXISTENTE PARA CONSERVAR ESTADO ---
            const existingPolicy = await Policy.findOne({ numeroPoliza }).lean();

            // Obtener posible estado desde Excel
            const newStateFromExcel = toUpperIfExists(item['ESTADO_DB']);
            let finalState;
            if (newStateFromExcel) {
                finalState = newStateFromExcel;
            } else if (existingPolicy) {
                finalState = existingPolicy.estado;
            } else {
                finalState = 'ACTIVO';
            }

            // Procesar pagos
            const pagos = [];
            for (let i = 1; i <= 12; i++) {
                const monto = item[`PAGO${i}_MONTO`];
                const fecha = item[`PAGO${i}_FECHA`];
                if (monto || fecha) {
                    pagos.push({
                        monto: Number(monto) || 0,
                        fechaPago: convertirFecha(fecha),
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
                        costo: Number(costo) || 0,
                        fechaServicio: convertirFecha(fecha),
                        numeroExpediente: toUpperIfExists(expediente),
                        origenDestino: toUpperIfExists(origenDestino),
                    });
                }
            }

            // Construir datos de la póliza (solo los campos del Excel)
            const policyData = {
                titular: toUpperIfExists(item['TITULAR']),
                correo: item['CORREO ELECTRONICO']?.toLowerCase() || '',
                contraseña: item['CONTRASEÑA'] || '',
                telefono: toUpperIfExists(item['TELEFONO']),
                calle: toUpperIfExists(item['CALLE']),
                colonia: toUpperIfExists(item['COLONIA']),
                municipio: toUpperIfExists(item['MUNICIPIO']),
                estadoRegion: toUpperIfExists(item['ESTADO']),
                cp: toUpperIfExists(item['CP']),
                rfc: toUpperIfExists(item['RFC']),
                marca: toUpperIfExists(item['MARCA']),
                submarca: toUpperIfExists(item['SUBMARCA']),
                año: item['AÑO'] ? Number(item['AÑO']) : null,
                color: toUpperIfExists(item['COLOR']),
                serie: toUpperIfExists(item['SERIE']),
                placas: toUpperIfExists(item['PLACAS']),
                agenteCotizador: toUpperIfExists(item['AGENTE COTIZADOR']),
                aseguradora: toUpperIfExists(item['ASEGURADORA']),
                numeroPoliza,
                fechaEmision: convertirFecha(item['FECHA DE EMISION']),
                estado: finalState,
                pagos,
                servicios,
            };

            // Actualizar o insertar usando $set para no sobrescribir campos adicionales que no vienen en el Excel
            try {
                const result = await Policy.findOneAndUpdate(
                    { numeroPoliza },
                    { $set: policyData },
                    { upsert: true, new: true }
                );

                if (!existingPolicy) {
                    inserted++;
                    console.log(`✅ Póliza ${numeroPoliza} insertada`);
                } else {
                    updated++;
                    console.log(`✅ Póliza ${numeroPoliza} actualizada`);
                }
            } catch (error) {
                console.error(`❌ Error con póliza ${numeroPoliza}:`, error.message);
            }
        }

        console.log('\n✅ Importación finalizada:');
        console.log(`📥 Pólizas insertadas: ${inserted}`);
        console.log(`🔄 Pólizas actualizadas: ${updated}`);
        console.log('\n⚠️ RECORDATORIO: Para calcular estados y calificaciones, ejecuta:');
        console.log('   node scripts/estados.js');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la importación:', error.message);
        process.exit(1);
    }
};

// Ejecutar el script
const run = async () => {
    await connectDB();
    const excelPath = process.argv[2];
    if (!excelPath) {
        console.error('❌ Proporciona la ruta del archivo Excel: node importExcel.js <ruta>');
        process.exit(1);
    }
    await importExcel(excelPath);
};

run();
