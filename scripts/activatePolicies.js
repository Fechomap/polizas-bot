// scripts/activatePolicies.js
// colocar archivo excel con el nombre de activaciones en la raiz de scripts

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importamos el modelo de Policy
const Policy = require('../src/models/policy');

// Función para esperar (útil para pausas)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Conectar a MongoDB
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB para activación de pólizas...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

// Verificar si existe el archivo Excel
const checkExcelFile = async () => {
    const excelPath = path.join(__dirname, 'activaciones.xlsx');
    
    try {
        await fs.access(excelPath);
        console.log(`✅ Archivo Excel encontrado: ${excelPath}`);
        return excelPath;
    } catch (error) {
        console.error('❌ No se encontró el archivo activaciones.xlsx en la carpeta scripts');
        process.exit(1);
    }
};

// Leer los números de póliza del archivo Excel
const readPolicyNumbers = async (excelPath) => {
    try {
        console.log('📄 Leyendo archivo Excel...');
        
        const workbook = XLSX.readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convertir a JSON
        const data = XLSX.utils.sheet_to_json(sheet, { header: 'A' });
        
        // Extraer los números de póliza (considerando que pueden estar en cualquier columna)
        const policyNumbers = [];
        
        for (const row of data) {
            // Buscar el número de póliza en cualquier columna
            for (const key in row) {
                if (row[key] && typeof row[key] === 'string') {
                    policyNumbers.push(row[key].trim().toUpperCase());
                    break; // Tomamos solo el primer valor de cada fila
                } else if (row[key] && typeof row[key] === 'number') {
                    policyNumbers.push(String(row[key]).trim());
                    break;
                }
            }
        }
        
        // Eliminar duplicados
        const uniquePolicyNumbers = [...new Set(policyNumbers)];
        
        console.log(`📊 Se encontraron ${uniquePolicyNumbers.length} números de póliza en el Excel`);
        return uniquePolicyNumbers;
    } catch (error) {
        console.error('❌ Error al leer el archivo Excel:', error);
        process.exit(1);
    }
};

// Activar las pólizas
const activatePolicies = async (policyNumbers) => {
    console.log('🔄 Iniciando proceso de activación de pólizas...');
    
    // Contadores para el informe final
    const results = {
        total: policyNumbers.length,
        found: 0,
        notFound: 0,
        alreadyActive: 0,
        activated: 0,
        errors: 0,
        notFoundList: [],
        errorsList: []
    };
    
    // Crear directorio para resultados
    const resultsDir = path.join(__dirname, 'resultados_activacion');
    try {
        await fs.mkdir(resultsDir, { recursive: true });
    } catch (error) {
        console.log('El directorio de resultados ya existe o no se pudo crear');
    }
    
    const totalPolicies = policyNumbers.length;
    let processedCount = 0;
    
    for (const numeroPoliza of policyNumbers) {
        processedCount++;
        console.log(`\nProcesando póliza ${processedCount}/${totalPolicies}: ${numeroPoliza}`);
        
        try {
            // Buscar la póliza sin filtrar por estado
            const policy = await Policy.findOne({ numeroPoliza });
            
            if (!policy) {
                console.log(`❌ Póliza no encontrada: ${numeroPoliza}`);
                results.notFound++;
                results.notFoundList.push(numeroPoliza);
                continue;
            }
            
            results.found++;
            
            // Verificar el estado actual
            if (policy.estado === 'ACTIVO') {
                console.log(`ℹ️ La póliza ${numeroPoliza} ya está activa`);
                results.alreadyActive++;
                continue;
            }
            
            // Activar la póliza
            policy.estado = 'ACTIVO';
            policy.fechaEliminacion = null;
            policy.motivoEliminacion = '';
            
            await policy.save();
            
            console.log(`✅ Póliza ${numeroPoliza} activada exitosamente`);
            results.activated++;
            
            // Pequeña pausa cada 10 pólizas para no sobrecargar
            if (processedCount % 10 === 0) {
                console.log('⏳ Pausando brevemente para evitar sobrecarga...');
                await delay(500);
            }
        } catch (error) {
            console.error(`❌ Error al procesar la póliza ${numeroPoliza}:`, error);
            results.errors++;
            results.errorsList.push({ numeroPoliza, error: error.message });
        }
    }
    
    return results;
};

// Generar informe de resultados
const generateReport = async (results) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(__dirname, 'resultados_activacion', `reporte_activacion_${timestamp}.json`);
    const excelPath = path.join(__dirname, 'resultados_activacion', `reporte_activacion_${timestamp}.xlsx`);
    
    // Guardar reporte en JSON
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    
    // Crear reporte Excel
    const workbook = XLSX.utils.book_new();
    
    // Hoja de resumen
    const summaryData = [
        { Métrica: 'Total de pólizas procesadas', Valor: results.total },
        { Métrica: 'Pólizas encontradas', Valor: results.found },
        { Métrica: 'Pólizas no encontradas', Valor: results.notFound },
        { Métrica: 'Pólizas ya activas', Valor: results.alreadyActive },
        { Métrica: 'Pólizas activadas exitosamente', Valor: results.activated },
        { Métrica: 'Errores en procesamiento', Valor: results.errors }
    ];
    
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
    
    // Hoja de pólizas no encontradas
    if (results.notFoundList.length > 0) {
        const notFoundData = results.notFoundList.map(num => ({ 'Número de Póliza': num }));
        const notFoundSheet = XLSX.utils.json_to_sheet(notFoundData);
        XLSX.utils.book_append_sheet(workbook, notFoundSheet, 'No Encontradas');
    }
    
    // Hoja de errores
    if (results.errorsList.length > 0) {
        const errorsData = results.errorsList.map(item => ({
            'Número de Póliza': item.numeroPoliza,
            'Error': item.error
        }));
        const errorsSheet = XLSX.utils.json_to_sheet(errorsData);
        XLSX.utils.book_append_sheet(workbook, errorsSheet, 'Errores');
    }
    
    // Guardar Excel
    XLSX.writeFile(workbook, excelPath);
    
    return {
        jsonReport: reportPath,
        excelReport: excelPath
    };
};

// Función principal
const run = async () => {
    try {
        console.log('🚀 Iniciando proceso de activación de pólizas desde Excel');
        
        // Conectar a la base de datos
        await connectDB();
        
        // Verificar y leer el archivo Excel
        const excelPath = await checkExcelFile();
        const policyNumbers = await readPolicyNumbers(excelPath);
        
        if (policyNumbers.length === 0) {
            console.log('⚠️ No se encontraron números de póliza en el archivo Excel');
            process.exit(0);
        }
        
        // Confirmar antes de proceder
        console.log(`\n⚠️ Se van a procesar ${policyNumbers.length} pólizas para activación.`);
        console.log('🔄 Iniciando en 5 segundos... (Ctrl+C para cancelar)');
        await delay(5000);
        
        // Activar las pólizas
        const results = await activatePolicies(policyNumbers);
        
        // Generar y guardar informe
        const reports = await generateReport(results);
        
        // Resumen final
        console.log('\n✅ Proceso completado');
        console.log('📊 Resumen:');
        console.log(`   - Total de pólizas procesadas: ${results.total}`);
        console.log(`   - Pólizas encontradas: ${results.found}`);
        console.log(`   - Pólizas no encontradas: ${results.notFound}`);
        console.log(`   - Pólizas ya activas: ${results.alreadyActive}`);
        console.log(`   - Pólizas activadas exitosamente: ${results.activated}`);
        console.log(`   - Errores en procesamiento: ${results.errors}`);
        console.log(`\n📄 Reporte guardado en:`);
        console.log(`   - JSON: ${reports.jsonReport}`);
        console.log(`   - Excel: ${reports.excelReport}`);
        
        // Cerrar conexión a MongoDB
        await mongoose.connection.close();
        console.log('\n👋 Conexión a MongoDB cerrada');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en el proceso:', error);
        
        // Intentar cerrar conexión a MongoDB
        try {
            await mongoose.connection.close();
            console.log('👋 Conexión a MongoDB cerrada');
        } catch (e) {
            // Ignorar error si ya está cerrada
        }
        
        process.exit(1);
    }
};

// Ejecutar
run();