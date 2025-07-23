// scripts/importExcel_TS.js
// Versión TypeScript-compatible con conexión directa a MongoDB
// Uso: node scripts/importExcel_TS.js scripts/backup/polizas_backup.xlsx
require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');

// Esquemas flexibles para compatibilidad TypeScript
const PolicySchema = new mongoose.Schema({}, { strict: false });
const Policy = mongoose.model('Policy', PolicySchema);

// Conectar a MongoDB con conexión directa compatible con TypeScript
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }
        console.log('✅ Conectando a MongoDB (TypeScript Compatible)...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    }
};

// Convertir fechas desde Excel o strings con manejo de errores mejorado
const convertirFecha = fecha => {
    if (!fecha) return null;
    try {
        if (typeof fecha === 'string') {
            // Intentar parsear string de fecha
            const date = new Date(fecha);
            return isNaN(date.getTime()) ? null : date;
        }
        if (typeof fecha === 'number') {
            // Fechas como número de serie de Excel
            const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
            return isNaN(date.getTime()) ? null : date;
        }
        // Si es un objeto Date válido
        if (fecha instanceof Date) {
            return isNaN(fecha.getTime()) ? null : fecha;
        }
    } catch (error) {
        console.warn(`⚠️ Error al convertir fecha: ${fecha}`, error.message);
        return null;
    }
    return null;
};

// Normalizar texto a mayúsculas con validación mejorada
const toUpperIfExists = value => {
    if (value == null || value === undefined) return '';
    try {
        return String(value).toUpperCase().trim();
    } catch (error) {
        console.warn(`⚠️ Error al normalizar texto: ${value}`, error.message);
        return '';
    }
};

// Validar número de póliza
const isValidPolicyNumber = numeroPoliza => {
    return numeroPoliza && typeof numeroPoliza === 'string' && numeroPoliza.trim().length > 0;
};

// Importar datos desde Excel con manejo de errores mejorado
const importExcel = async excelPath => {
    try {
        console.log(`📄 Leyendo archivo Excel: ${excelPath}`);

        // Verificar que el archivo existe
        try {
            require('fs').accessSync(excelPath);
        } catch (err) {
            throw new Error(`El archivo ${excelPath} no existe o no es accesible`);
        }

        const workbook = XLSX.readFile(excelPath);

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('El archivo Excel no contiene hojas de trabajo');
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

        console.log(`📊 ${data.length} registros encontrados en la hoja: ${workbook.SheetNames[0]}`);

        if (data.length === 0) {
            console.log('⚠️ No se encontraron datos para importar');
            return;
        }

        let inserted = 0;
        let updated = 0;
        let errors = 0;
        let skipped = 0;

        console.log('🔄 Iniciando procesamiento de registros...');

        for (const [index, item] of data.entries()) {
            try {
                const numeroPoliza = toUpperIfExists(item['# DE POLIZA']);

                if (!isValidPolicyNumber(numeroPoliza)) {
                    console.log(`⚠️ Registro ${index + 1} sin número de póliza válido, omitiendo...`);
                    skipped++;
                    continue;
                }

                if ((index + 1) % 50 === 0) {
                    console.log(`📊 Procesando registro ${index + 1}/${data.length} (${numeroPoliza})`);
                }

                // --- OBTENER POLICY EXISTENTE PARA CONSERVAR ESTADO ---
                const existingPolicy = await Policy.findOne({ numeroPoliza }).lean();

                // Obtener posible estado desde Excel
                const newStateFromExcel = toUpperIfExists(item['ESTADO_DB']);
                let finalState;
                if (newStateFromExcel && ['ACTIVO', 'ELIMINADO', 'SUSPENDIDO'].includes(newStateFromExcel)) {
                    finalState = newStateFromExcel;
                } else if (existingPolicy && existingPolicy.estado) {
                    finalState = existingPolicy.estado;
                } else {
                    finalState = 'ACTIVO';
                }

                // Procesar pagos con validación mejorada
                const pagos = [];
                for (let i = 1; i <= 12; i++) {
                    const monto = item[`PAGO${i}_MONTO`];
                    const fecha = item[`PAGO${i}_FECHA`];

                    if (monto || fecha) {
                        const pagoData = {
                            numeroMembresia: i,
                            monto: Number(monto) || 0,
                            fechaPago: convertirFecha(fecha),
                            estado: 'REALIZADO', // Asumimos que los pagos en Excel están realizados
                            metodoPago: 'IMPORTADO_EXCEL'
                        };

                        // Solo agregar si tiene monto válido
                        if (pagoData.monto > 0) {
                            pagos.push(pagoData);
                        }
                    }
                }

                // Procesar servicios con validación mejorada
                const servicios = [];
                for (let i = 1; i <= 12; i++) {
                    const costo = item[`SERVICIO${i}_COSTO`];
                    const fecha = item[`SERVICIO${i}_FECHA`];
                    const expediente = item[`SERVICIO${i}_EXPEDIENTE`];
                    const origenDestino = item[`SERVICIO${i}_ORIGEN_DESTINO`];

                    if (costo || fecha || expediente || origenDestino) {
                        const servicioData = {
                            numeroServicio: i,
                            costo: Number(costo) || 0,
                            fechaServicio: convertirFecha(fecha),
                            numeroExpediente: toUpperIfExists(expediente),
                            origenDestino: toUpperIfExists(origenDestino),
                            estado: 'COMPLETADO'
                        };

                        // Solo agregar si tiene información relevante
                        if (servicioData.costo > 0 || servicioData.numeroExpediente || servicioData.origenDestino) {
                            servicios.push(servicioData);
                        }
                    }
                }

                // Construir datos de la póliza con validación de tipos
                const policyData = {
                    titular: toUpperIfExists(item['TITULAR']),
                    correo: item['CORREO ELECTRONICO'] ? String(item['CORREO ELECTRONICO']).toLowerCase().trim() : '',
                    contraseña: item['CONTRASEÑA'] ? String(item['CONTRASEÑA']) : '',
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
                    // Campos adicionales para compatibilidad TypeScript
                    fechaImportacion: new Date(),
                    versionImportacion: 'TypeScript_Compatible_v1.0'
                };

                // Limpiar campos vacíos para evitar datos innecesarios
                Object.keys(policyData).forEach(key => {
                    if (policyData[key] === '' || policyData[key] === null) {
                        delete policyData[key];
                    }
                });

                // Actualizar o insertar usando $set para no sobrescribir campos adicionales
                const result = await Policy.findOneAndUpdate(
                    { numeroPoliza },
                    { $set: policyData },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (!existingPolicy) {
                    inserted++;
                    console.log(`✅ Póliza ${numeroPoliza} insertada (nueva)`);
                } else {
                    updated++;
                    console.log(`🔄 Póliza ${numeroPoliza} actualizada`);
                }

            } catch (error) {
                errors++;
                console.error(`❌ Error procesando registro ${index + 1} (${item['# DE POLIZA'] || 'sin número'}):`, error.message);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ IMPORTACIÓN COMPLETADA - RESUMEN:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📥 Pólizas insertadas (nuevas): ${inserted}`);
        console.log(`🔄 Pólizas actualizadas: ${updated}`);
        console.log(`⚠️ Registros omitidos: ${skipped}`);
        console.log(`❌ Errores de procesamiento: ${errors}`);
        console.log(`📊 Total procesado: ${inserted + updated + skipped + errors}/${data.length}`);
        console.log('🎯 Versión: TypeScript Compatible');

        if (errors > 0) {
            console.log(`\n⚠️ Se encontraron ${errors} errores durante la importación. Revisa los logs anteriores.`);
        }

        console.log('\n📋 PASOS SIGUIENTES RECOMENDADOS:');
        console.log('   1. Ejecutar cálculo de estados: node scripts/estados.js');
        console.log('   2. Verificar integridad: node scripts/verificar-sistema-bd-autos_TS.js');
        console.log('   3. Generar backup: node scripts/exportExcel_TS.js');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error crítico durante la importación:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    }
};

// Función principal con validación de argumentos
const run = async () => {
    try {
        await connectDB();

        const excelPath = process.argv[2];
        if (!excelPath) {
            console.error('❌ Falta la ruta del archivo Excel');
            console.log('📋 Uso correcto: node scripts/importExcel_TS.js <ruta_del_archivo.xlsx>');
            console.log('📋 Ejemplo: node scripts/importExcel_TS.js scripts/backup/polizas_backup.xlsx');
            process.exit(1);
        }

        // Validar extensión del archivo
        const validExtensions = ['.xlsx', '.xls'];
        const fileExtension = path.extname(excelPath).toLowerCase();
        if (!validExtensions.includes(fileExtension)) {
            console.error(`❌ Extensión de archivo no válida: ${fileExtension}`);
            console.log(`📋 Extensiones válidas: ${validExtensions.join(', ')}`);
            process.exit(1);
        }

        await importExcel(excelPath);
    } catch (error) {
        console.error('❌ Error durante la ejecución del script:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    } finally {
        try {
            await mongoose.connection.close();
            console.log('✅ Conexión a MongoDB cerrada correctamente.');
        } catch (err) {
            console.error('❌ Error al cerrar la conexión a MongoDB:', err);
        }
    }
};

run();
