// Cargar variables de entorno desde .env
require('dotenv').config();
const mongoose = require('mongoose');

/**
 * LISTADO DE PÓLIZAS NIV SIN FOTOS
 * 
 * PROPÓSITO: Generar listado limpio de NIVs sin fotos para carga manual
 * 
 * SALIDA: Lista de números de serie NIV para subir fotos manualmente
 */

async function listNIVWithoutPhotos() {
    try {
        // Buscar URI de MongoDB en diferentes formatos
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.log('❌ Configura MONGODB_URI o MONGO_URI en las variables de entorno');
            return;
        }
        
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB\n');
        
        const Policy = require('../dist/models/policy').default;
        
        console.log('📋 LISTADO DE PÓLIZAS NIV SIN FOTOS');
        console.log('='.repeat(50));
        
        // Buscar solo las pólizas NIV ACTIVAS (no eliminadas)
        const polizasNIV = await Policy.find({ 
            esNIV: true,
            estado: 'ACTIVO'  // Solo pólizas activas
        }).sort({ fechaEmision: 1 });
        
        if (polizasNIV.length === 0) {
            console.log('⚠️  No se encontraron pólizas NIV ACTIVAS en el sistema');
            return;
        }
        
        // Filtrar pólizas sin fotos
        const polizasSinFotos = [];
        
        for (const poliza of polizasNIV) {
            const r2Fotos = poliza.archivos?.r2Files?.fotos?.length || 0;
            const legacyFotos = poliza.archivos?.fotos?.length || 0;
            const totalFotos = r2Fotos + legacyFotos;
            
            if (totalFotos === 0) {
                polizasSinFotos.push({
                    numeroPoliza: poliza.numeroPoliza,
                    titular: poliza.titular,
                    marca: poliza.marca,
                    submarca: poliza.submarca,
                    año: poliza.año,
                    fechaCreacion: poliza.fechaEmision
                });
            }
        }
        
        if (polizasSinFotos.length === 0) {
            console.log('✅ Todas las pólizas NIV tienen fotos');
            return;
        }
        
        // LISTADO PRINCIPAL PARA CARGA MANUAL
        console.log(`📊 RESUMEN: ${polizasSinFotos.length} pólizas NIV sin fotos de ${polizasNIV.length} totales\n`);
        
        console.log('🎯 LISTADO PARA CARGA MANUAL:');
        console.log('-'.repeat(30));
        
        polizasSinFotos.forEach((poliza, index) => {
            console.log(`${index + 1}. ${poliza.numeroPoliza}`);
        });
        
        console.log('\n📋 LISTADO DETALLADO:');
        console.log('-'.repeat(80));
        console.log('N° | SERIE NIV         | TITULAR              | VEHÍCULO        | FECHA');
        console.log('-'.repeat(80));
        
        polizasSinFotos.forEach((poliza, index) => {
            const num = String(index + 1).padStart(2, ' ');
            const serie = poliza.numeroPoliza.padEnd(17, ' ');
            const titular = (poliza.titular || 'Sin titular').substring(0, 20).padEnd(20, ' ');
            const vehiculo = `${poliza.marca || ''} ${poliza.submarca || ''} ${poliza.año || ''}`.substring(0, 15).padEnd(15, ' ');
            const fecha = poliza.fechaCreacion ? poliza.fechaCreacion.toISOString().substring(0, 10) : 'N/A';
            
            console.log(`${num} | ${serie} | ${titular} | ${vehiculo} | ${fecha}`);
        });
        
        console.log('-'.repeat(80));
        
        // LISTA SIMPLE PARA COPIAR/PEGAR
        console.log('\n📝 LISTA SIMPLE (para copiar/pegar):');
        console.log('-'.repeat(30));
        const listaSerie = polizasSinFotos.map(p => p.numeroPoliza).join('\n');
        console.log(listaSerie);
        
        // ESTADÍSTICAS ADICIONALES
        console.log('\n📊 ESTADÍSTICAS:');
        console.log(`- Total pólizas NIV: ${polizasNIV.length}`);
        console.log(`- Pólizas con fotos: ${polizasNIV.length - polizasSinFotos.length}`);
        console.log(`- Pólizas sin fotos: ${polizasSinFotos.length}`);
        console.log(`- Porcentaje sin fotos: ${((polizasSinFotos.length / polizasNIV.length) * 100).toFixed(1)}%`);
        
        // ANÁLISIS POR AÑO
        const porAño = {};
        polizasSinFotos.forEach(p => {
            const año = p.año || 'N/A';
            porAño[año] = (porAño[año] || 0) + 1;
        });
        
        console.log('\n📈 DISTRIBUCIÓN POR AÑO:');
        Object.entries(porAño).sort().forEach(([año, cantidad]) => {
            console.log(`- ${año}: ${cantidad} pólizas`);
        });
        
        console.log('\n💡 INSTRUCCIONES PARA CARGA MANUAL:');
        console.log('1. Usa la "LISTA SIMPLE" de arriba');
        console.log('2. Para cada serie NIV, busca las fotos originales');
        console.log('3. En el bot, usa "Subir Archivos" para cada póliza');
        console.log('4. Las fotos se guardarán correctamente en la póliza NIV');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    listNIVWithoutPhotos();
}

module.exports = { listNIVWithoutPhotos };