// scripts/export.js

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

// Función para exportar datos a Excel con 1 fila por póliza,
// hasta 12 pagos (cada uno con 2 columnas: monto y fecha)
// y hasta 12 servicios (cada uno con 3 columnas: costo, fecha, expediente).
const exportData = async () => {
    try {
        const policies = await Policy.find().lean();

        if (!policies.length) {
            console.log('⚠️ No se encontraron pólizas para exportar.');
            process.exit(0);
        }

        // Máximo de pagos y servicios a exportar en columnas
        const MAX_PAGOS = 12;
        const MAX_SERVICIOS = 12;

        const rows = [];

        for (const policy of policies) {
            const {
                titular,
                correo,
                contraseña,
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
                servicios = []
            } = policy;

            // Datos base de la póliza
            const row = {
                TITULAR: titular || '',
                'CORREO ELECTRONICO': correo || '',
                CONTRASEÑA: contraseña || '',
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
                    : '',
            
                // NUEVA COLUMNA "TELEFONO"
                TELEFONO: policy.telefono || ''
            };

            //
            // 1) Expandir columnas de PAGOS
            //
            for (let i = 0; i < MAX_PAGOS; i++) {
                const pago = pagos[i];
                const colMonto = `PAGO${i + 1}_MONTO`;
                const colFecha = `PAGO${i + 1}_FECHA`;

                if (pago) {
                    row[colMonto] = pago.monto ?? '';
                    row[colFecha] = pago.fechaPago
                        ? pago.fechaPago.toISOString().split('T')[0]
                        : '';
                } else {
                    row[colMonto] = '';
                    row[colFecha] = '';
                }
            }

            //
            // 2) Expandir columnas de SERVICIOS
            //
            for (let i = 0; i < MAX_SERVICIOS; i++) {
                const servicio = servicios[i];
                const colCosto = `SERVICIO${i + 1}_COSTO`;
                const colFecha = `SERVICIO${i + 1}_FECHA`;
                const colExped = `SERVICIO${i + 1}_EXPEDIENTE`;
                const colOrigDest = `SERVICIO${i + 1}_ORIGEN_DESTINO`; // <-- COLUMNA NUEVA
            
                if (servicio) {
                    row[colCosto] = servicio.costo ?? '';
                    row[colFecha] = servicio.fechaServicio
                        ? servicio.fechaServicio.toISOString().split('T')[0]
                        : '';
                    row[colExped] = servicio.numeroExpediente ?? '';
                    row[colOrigDest] = servicio.origenDestino ?? '';  // <-- LLENAR con el nuevo campo
                } else {
                    row[colCosto] = '';
                    row[colFecha] = '';
                    row[colExped] = '';
                    row[colOrigDest] = ''; // <-- Dejar vacío si no existe
                }
            }

            rows.push(row);
        }

        // Crear un nuevo libro de trabajo
        const workbook = XLSX.utils.book_new();
        // Convertir 'rows' a una hoja de Excel
        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Agregar la hoja al libro de trabajo
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PolizasConPagosServicios');

        // Definir la ruta del archivo exportado
        const exportPath = path.join(__dirname, 'polizas_backup.xlsx');

        // Escribir el archivo Excel
        XLSX.writeFile(workbook, exportPath);
        console.log(`✅ Exportación completada exitosamente. Archivo guardado en ${exportPath}`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la exportación:', error);
        process.exit(1);
    }
};

// Ejecutar la exportación
const run = async () => {
    await connectDB();
    await exportData();
};

run();