// scripts/import.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Policy = require('../src/models/policy');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB para la importación...');
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Conectado a MongoDB para la importación');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

const convertirFecha = (fecha) => {
    if (!fecha) return null;
    
    try {
        // Si es una fecha ISO (formato del export)
        if (typeof fecha === 'string' && fecha.includes('-')) {
            const date = new Date(fecha);
            return !isNaN(date) ? date : null;
        }
        
        // Otros formatos de fecha...
        if (fecha instanceof Date) return fecha;
        
        if (typeof fecha === 'number') {
            const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
            return date;
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
    if (value == null) return '';
    return String(value).toUpperCase();
};

const importData = async () => {
    try {
        const filePath = path.join(__dirname, 'polizas_backup.xlsx'); // Cambiado a polizas_backup.xlsx
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

        console.log(`📄 Datos leídos desde Excel: ${data.length} registros`);

        const policies = data.map(item => {
            // Procesar pagos
            const pagos = [];
            for (let i = 1; i <= 12; i++) {
                const monto = item[`PAGO${i}_MONTO`];
                const fecha = item[`PAGO${i}_FECHA`];
                if (monto || fecha) {
                    pagos.push({
                        monto: monto || null,
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
                        costo: costo || null,
                        fechaServicio: convertirFecha(fecha),
                        numeroExpediente: expediente || null,
                        origenDestino: origenDestino || null
                    });
                }
            }

            return {
                titular: toUpperIfExists(item['TITULAR']),
                correo: (item['CORREO ELECTRONICO'] && 
                        item['CORREO ELECTRONICO'].toLowerCase() !== 'sin correo')
                    ? item['CORREO ELECTRONICO'].toLowerCase()
                    : '',
                contraseña: item['CONTRASEÑA'] || null,
                telefono: item['TELEFONO'] || '', // Agregado campo teléfono
                calle: toUpperIfExists(item['CALLE']),
                colonia: toUpperIfExists(item['COLONIA']),
                municipio: toUpperIfExists(item['MUNICIPIO']),
                estado: toUpperIfExists(item['ESTADO']),
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
                numeroPoliza: toUpperIfExists(item['# DE POLIZA']),
                fechaEmision: convertirFecha(item['FECHA DE EMISION']),
                pagos,
                servicios,
                archivos: { fotos: [], pdfs: [] },
                adicionales: {}
            };
        });

        const validPolicies = policies.filter(p => p.numeroPoliza);
        console.log(`📋 Pólizas válidas para insertar: ${validPolicies.length}`);

        if (validPolicies.length === 0) {
            console.log('⚠️ No hay pólizas válidas para importar.');
            process.exit(0);
        }

        let insertedCount = 0;
        let updatedCount = 0;

        for (const p of validPolicies) {
            try {
                // Buscar si ya existe y actualizar, o crear si no existe
                const result = await Policy.findOneAndUpdate(
                    { numeroPoliza: p.numeroPoliza },
                    p,
                    { upsert: true, new: true }
                );
                
                if (result.isNew) {
                    insertedCount++;
                } else {
                    updatedCount++;
                }
            } catch (err) {
                console.error(`Error al procesar la póliza ${p.numeroPoliza}:`, err.message);
            }
        }

        console.log(`✅ Se insertaron ${insertedCount} póliza(s) nueva(s).`);
        console.log(`✅ Se actualizaron ${updatedCount} póliza(s) existente(s).`);
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