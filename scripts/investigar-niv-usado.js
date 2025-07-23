// scripts/investigar-niv-usado.js
/**
 * 🔍 INVESTIGAR NIV USADO QUE SIGUE ACTIVO
 *
 * Analiza el estado actual de un NIV específico para entender
 * por qué sigue activo después de tener servicios
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar modelos usando wrapper
const Policy = require('./models/policy');

/**
 * Conectar a MongoDB
 */
async function connectDB() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
}

/**
 * Investigar NIV específico
 */
async function investigarNIV(numeroPoliza) {
    console.log(`🔍 Investigando NIV: ${numeroPoliza}`);

    const poliza = await Policy.findOne({ numeroPoliza })
        .select('numeroPoliza estado tipoPoliza esNIP totalServicios servicios registros createdAt creadoViaOBD');

    if (!poliza) {
        console.log(`❌ NIV no encontrado: ${numeroPoliza}`);
        return null;
    }

    console.log('\n📋 INFORMACIÓN DETALLADA:');
    console.log(`  Número de póliza: ${poliza.numeroPoliza}`);
    console.log(`  Estado: ${poliza.estado}`);
    console.log(`  Tipo póliza: ${poliza.tipoPoliza}`);
    console.log(`  Es NIP: ${poliza.esNIP}`);
    console.log(`  Creado vía OBD: ${poliza.creadoViaOBD}`);
    console.log(`  Total servicios: ${poliza.totalServicios}`);
    console.log(`  Servicios registrados: ${poliza.servicios?.length || 0}`);
    console.log(`  Registros: ${poliza.registros?.length || 0}`);
    console.log(`  Fecha creación: ${poliza.createdAt}`);

    // Analizar servicios
    if (poliza.servicios && poliza.servicios.length > 0) {
        console.log('\n🚗 SERVICIOS DETALLADOS:');
        poliza.servicios.forEach((servicio, index) => {
            console.log(`  Servicio ${index + 1}:`);
            console.log(`    - Número: ${servicio.numeroServicio}`);
            console.log(`    - Fecha: ${servicio.fechaServicio}`);
            console.log(`    - Expediente: ${servicio.numeroExpediente}`);
            console.log(`    - Costo: $${servicio.costo}`);
            console.log(`    - Origen/Destino: ${servicio.origenDestino}`);
        });
    }

    // Verificar si debería eliminarse
    console.log('\n❓ ANÁLISIS DE ELIMINACIÓN:');
    const esNIV = poliza.tipoPoliza === 'NIV' || poliza.tipoPoliza === 'NIP' || poliza.esNIP;
    const estaActiva = poliza.estado === 'ACTIVO';
    const tieneServicios = (poliza.totalServicios || 0) >= 1;

    console.log(`  ✓ Es NIV: ${esNIV ? 'SÍ' : 'NO'}`);
    console.log(`  ✓ Está activa: ${estaActiva ? 'SÍ' : 'NO'}`);
    console.log(`  ✓ Tiene servicios: ${tieneServicios ? 'SÍ' : 'NO'} (${poliza.totalServicios || 0})`);

    const deberiaEliminarse = esNIV && estaActiva && tieneServicios;
    console.log(`  🎯 DEBERÍA ELIMINARSE: ${deberiaEliminarse ? '🔴 SÍ' : '🟢 NO'}`);

    if (deberiaEliminarse) {
        console.log('\n⚠️  ESTE NIV DEBERÍA HABERSE ELIMINADO AUTOMÁTICAMENTE');
    }

    return {
        numeroPoliza: poliza.numeroPoliza,
        esNIV,
        estaActiva,
        tieneServicios,
        totalServicios: poliza.totalServicios || 0,
        deberiaEliminarse
    };
}

/**
 * Buscar todos los NIVs con servicios que siguen activos
 */
async function buscarNIVsActivosConServicios() {
    console.log('\n🔍 Buscando todos los NIVs activos con servicios...');

    const nivesActivos = await Policy.find({
        $or: [
            { tipoPoliza: 'NIV' },
            { tipoPoliza: 'NIP' },
            { esNIP: true }
        ],
        estado: 'ACTIVO',
        totalServicios: { $gte: 1 }
    }).select('numeroPoliza totalServicios servicios estado createdAt');

    console.log(`📊 NIVs activos con servicios encontrados: ${nivesActivos.length}`);

    if (nivesActivos.length > 0) {
        console.log('\n📋 LISTADO DE NIVs QUE DEBERÍAN ELIMINARSE:');
        nivesActivos.forEach((niv, index) => {
            console.log(`  ${index + 1}. ${niv.numeroPoliza} - ${niv.totalServicios} servicios`);
        });
    }

    return nivesActivos;
}

/**
 * Función principal
 */
async function main() {
    try {
        console.log('🚀 Investigando NIV usado que sigue activo\n');

        await connectDB();

        // Investigar NIV específico mencionado
        const nivEspecifico = 'JM1BPCML3P1615320';
        await investigarNIV(nivEspecifico);

        // Buscar todos los NIVs con el mismo problema
        const nivesProblematicos = await buscarNIVsActivosConServicios();

        console.log('\n📊 RESUMEN:');
        console.log(`Total NIVs que deberían eliminarse: ${nivesProblematicos.length}`);

        if (nivesProblematicos.length > 0) {
            console.log('\n💡 RECOMENDACIÓN:');
            console.log('Crear job automático a las 3:00 AM para eliminar NIVs usados');
            console.log('Criterios: NIV + ACTIVO + totalServicios >= 1');
        } else {
            console.log('\n🎉 No hay NIVs que requieran eliminación automática');
        }

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error en investigación:', error);
        process.exit(1);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { main, investigarNIV, buscarNIVsActivosConServicios };
