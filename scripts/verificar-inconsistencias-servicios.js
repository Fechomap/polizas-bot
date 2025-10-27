// Verifica inconsistencias entre arrays de servicios y contadores
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar modelo
const Policy = require('./models/policy');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
        process.exit(1);
    }
};

async function verificarInconsistencias() {
    await connectDB();

    console.log('\n🔍 INVESTIGACIÓN: Inconsistencias en conteo de servicios\n');
    console.log('='.repeat(80));

    // 1. Pólizas activas con servicios y registros
    const polizasActivas = await Policy.find({ estado: 'ACTIVO' })
        .select('numeroPoliza servicios registros totalServicios servicioCounter registroCounter')
        .lean();

    console.log(`\n📊 Total pólizas ACTIVAS: ${polizasActivas.length}\n`);

    const problemas = {
        totalServiciosDesincronizado: [],
        servicioCounterDesincronizado: [],
        registroCounterDesincronizado: [],
        conDosOMasServicios: [],
        contadorAltoArrayBajo: []
    };

    for (const p of polizasActivas) {
        const serviciosReales = (p.servicios || []).length;
        const registrosReales = (p.registros || []).length;
        const totalServicios = p.totalServicios || 0;
        const servicioCounter = p.servicioCounter || 0;
        const registroCounter = p.registroCounter || 0;

        // PROBLEMA 1: totalServicios no coincide con array real
        if (totalServicios !== serviciosReales) {
            problemas.totalServiciosDesincronizado.push({
                numeroPoliza: p.numeroPoliza,
                totalServicios,
                serviciosReales,
                diferencia: Math.abs(totalServicios - serviciosReales)
            });
        }

        // PROBLEMA 2: servicioCounter no coincide con array real
        if (servicioCounter !== serviciosReales && serviciosReales > 0) {
            problemas.servicioCounterDesincronizado.push({
                numeroPoliza: p.numeroPoliza,
                servicioCounter,
                serviciosReales,
                diferencia: Math.abs(servicioCounter - serviciosReales)
            });
        }

        // PROBLEMA 3: registroCounter no coincide con array real
        if (registroCounter !== registrosReales && registrosReales > 0) {
            problemas.registroCounterDesincronizado.push({
                numeroPoliza: p.numeroPoliza,
                registroCounter,
                registrosReales,
                diferencia: Math.abs(registroCounter - registrosReales)
            });
        }

        // PROBLEMA 4: Pólizas con >= 2 servicios (candidatas a eliminación)
        if (serviciosReales >= 2) {
            problemas.conDosOMasServicios.push({
                numeroPoliza: p.numeroPoliza,
                serviciosReales,
                registrosReales,
                totalServicios,
                servicioCounter
            });
        }

        // PROBLEMA 5: Contador alto pero array bajo (EL MÁS CRÍTICO)
        if (servicioCounter >= 2 && serviciosReales < 2) {
            problemas.contadorAltoArrayBajo.push({
                numeroPoliza: p.numeroPoliza,
                servicioCounter,
                serviciosReales,
                totalServicios,
                registrosReales
            });
        }
    }

    // REPORTAR HALLAZGOS
    console.log('\n🚨 PROBLEMA #1: totalServicios desincronizado con array real');
    console.log(`   Encontradas: ${problemas.totalServiciosDesincronizado.length} pólizas`);
    if (problemas.totalServiciosDesincronizado.length > 0) {
        console.log('\n   Ejemplos (primeras 10):');
        problemas.totalServiciosDesincronizado.slice(0, 10).forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.numeroPoliza}`);
            console.log(`      • totalServicios campo: ${p.totalServicios}`);
            console.log(`      • servicios.length real: ${p.serviciosReales}`);
            console.log(`      • Diferencia: ${p.diferencia}`);
        });
    }

    console.log('\n🚨 PROBLEMA #2: servicioCounter desincronizado con array real');
    console.log(`   Encontradas: ${problemas.servicioCounterDesincronizado.length} pólizas`);
    if (problemas.servicioCounterDesincronizado.length > 0) {
        console.log('\n   Ejemplos (primeras 10):');
        problemas.servicioCounterDesincronizado.slice(0, 10).forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.numeroPoliza}`);
            console.log(`      • servicioCounter: ${p.servicioCounter}`);
            console.log(`      • servicios.length real: ${p.serviciosReales}`);
            console.log(`      • Diferencia: ${p.diferencia}`);
        });
    }

    console.log('\n🚨 PROBLEMA #3: registroCounter desincronizado con array real');
    console.log(`   Encontradas: ${problemas.registroCounterDesincronizado.length} pólizas`);

    console.log('\n⚠️  PROBLEMA #4: Pólizas con >= 2 servicios (serán eliminadas)');
    console.log(`   Encontradas: ${problemas.conDosOMasServicios.length} pólizas`);
    if (problemas.conDosOMasServicios.length > 0) {
        console.log('\n   Ejemplos (primeras 10):');
        problemas.conDosOMasServicios.slice(0, 10).forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.numeroPoliza}`);
            console.log(`      • servicios.length: ${p.serviciosReales}`);
            console.log(`      • registros.length: ${p.registrosReales}`);
            console.log(`      • totalServicios: ${p.totalServicios}`);
        });
    }

    console.log('\n🔥 PROBLEMA #5 (CRÍTICO): servicioCounter >= 2 pero servicios.length < 2');
    console.log('   ⚠️  ESTAS PODRÍAN EXPLICAR LAS ELIMINACIONES INCORRECTAS');
    console.log(`   Encontradas: ${problemas.contadorAltoArrayBajo.length} pólizas`);
    if (problemas.contadorAltoArrayBajo.length > 0) {
        console.log('\n   TODOS LOS CASOS:');
        problemas.contadorAltoArrayBajo.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.numeroPoliza}`);
            console.log(`      • servicioCounter: ${p.servicioCounter} ⚠️`);
            console.log(`      • servicios.length REAL: ${p.serviciosReales} ✓`);
            console.log(`      • totalServicios: ${p.totalServicios}`);
            console.log(`      • registros.length: ${p.registrosReales}`);
            console.log(`      📌 Si la eliminación usa servicioCounter en vez de $size, ¡AQUÍ ESTÁ EL BUG!`);
        });
    }

    // VERIFICAR QUÉ USA LA ELIMINACIÓN AUTOMÁTICA
    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 VERIFICACIÓN: ¿Qué campo usa la eliminación automática?');
    console.log('\n   Según AutoCleanupService.ts línea 111:');
    console.log('   Query: { estado: \'ACTIVO\', $expr: { $gte: [{ $size: \'$servicios\' }, 2] } }');
    console.log('\n   ✓ USA: $size: \'$servicios\' (cuenta el array directamente)');
    console.log('   ✓ NO USA: totalServicios ni servicioCounter');
    console.log('\n   CONCLUSIÓN: Si hay pólizas eliminadas con < 2 servicios reales,');
    console.log('   el problema NO es la query de eliminación, sino:');
    console.log('   1. Race condition que corrompe el array servicios');
    console.log('   2. Algún proceso que elimina elementos del array');
    console.log('   3. Algún proceso que confunde registros con servicios');

    console.log('\n' + '='.repeat(80));
    console.log('\n📊 RESUMEN FINAL:');
    console.log(`   • Total pólizas activas: ${polizasActivas.length}`);
    console.log(`   • Inconsistencias totalServicios: ${problemas.totalServiciosDesincronizado.length}`);
    console.log(`   • Inconsistencias servicioCounter: ${problemas.servicioCounterDesincronizado.length}`);
    console.log(`   • Inconsistencias registroCounter: ${problemas.registroCounterDesincronizado.length}`);
    console.log(`   • Pólizas con >= 2 servicios: ${problemas.conDosOMasServicios.length}`);
    console.log(`   • ⚠️  Contador alto, array bajo: ${problemas.contadorAltoArrayBajo.length}`);

    await mongoose.disconnect();
    console.log('\n✅ Análisis completado\n');
}

verificarInconsistencias().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
