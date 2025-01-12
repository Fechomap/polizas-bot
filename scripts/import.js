// scripts/import.js

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importar el modelo de póliza
const Policy = require('../src/models/policy');

// Función para conectar a MongoDB
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

// Función para convertir fecha
const convertirFecha = (fecha) => {
    if (!fecha) return null;

    // Si ya es un objeto Date
    if (fecha instanceof Date) {
        return fecha;
    }

    // Si es un número (serial de Excel)
    if (typeof fecha === 'number') {
        // Excel serial date starts on 1899-12-30
        const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
        return date;
    }

    // Si es una cadena, intentar parsearla
    if (typeof fecha === 'string') {
        const partes = fecha.split('/');
        if (partes.length === 3) {
            const [dia, mes, anio] = partes;
            // Asegurarse de que el año tenga 4 dígitos
            const anioCompleto = anio.length === 2 ? `20${anio}` : anio;
            const fechaFormateada = `${anioCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            const date = new Date(fechaFormateada);
            if (!isNaN(date)) {
                return date;
            }
        }
    }

    // Si no se pudo convertir, retornar null
    return null;
};

// Función auxiliar para convertir texto a mayúsculas si existe
const toUpperIfExists = (value) => {
    // Si es null o undefined, retornar string vacío
    if (value == null) return '';
    
    // Convertir a string y luego a mayúsculas
    return String(value).toUpperCase();
};

// Función para importar datos desde Excel
const importData = async () => {
    try {
        const filePath = path.join(__dirname, 'polizas.xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

        console.log(`📄 Datos leídos desde Excel: ${data.length} registros`);

        const policies = data.map(item => {
            const fechaEmision = convertirFecha(item['FECHA DE EMISON']);
            return {
                titular: toUpperIfExists(item['TITULAR']),
                correo: (item['CORREO ELECTRONICO'] && item['CORREO ELECTRONICO'].toLowerCase() !== 'sin correo')
                    ? item['CORREO ELECTRONICO'].toLowerCase()
                    : '',
                contraseña: item['CONTRASEÑA'] || null,
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
                fechaEmision: fechaEmision instanceof Date && !isNaN(fechaEmision) ? fechaEmision : null,
                archivos: { fotos: [], pdfs: [] },
                adicionales: {},
            };
        });

        // Filtramos las pólizas que tengan numeroPoliza no vacío
        const validPolicies = policies.filter(p => p.numeroPoliza);
        console.log(`📋 Pólizas válidas para insertar: ${validPolicies.length}`);

        if (validPolicies.length === 0) {
            console.log('⚠️ No hay pólizas válidas para importar.');
            process.exit(0);
        }

        let insertedCount = 0;
        let duplicateCount = 0;

        // Insertamos registro por registro, verificando duplicados
        for (const p of validPolicies) {
            try {
                // Buscar si ya existe
                const existing = await Policy.findOne({ numeroPoliza: p.numeroPoliza });
                if (existing) {
                    console.log(`⚠️ Duplicado: ${p.numeroPoliza}`);
                    duplicateCount++;
                    continue;
                }
                // Crear si no existe
                await Policy.create(p);
                insertedCount++;
            } catch (err) {
                console.error(`Error al insertar la póliza ${p.numeroPoliza}:`, err.message);
            }
        }

        console.log(`✅ Se insertaron ${insertedCount} póliza(s).`);
        console.log(`⚠️ Se descartaron ${duplicateCount} duplicado(s).`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la importación:', error);
        process.exit(1);
    }
};

// Ejecutar la importación
const run = async () => {
    await connectDB();
    await importData();
};

run();