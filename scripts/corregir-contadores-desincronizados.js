// Script para corregir inconsistencias en contadores de servicios
// Ejecutar DESPUÉS de implementar las operaciones atómicas
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

async function corregirContadores() {
    await connectDB();

    console.log('\n🔧 CORRECCIÓN DE CONTADORES DESINCRONIZADOS\n');
    console.log('='.repeat(80));

    try {
        // Buscar todas las pólizas activas
        const polizas = await Policy.find({ estado: 'ACTIVO' })
            .select('numeroPoliza servicios registros totalServicios servicioCounter registroCounter')
            .lean();

        console.log(`\n📊 Total pólizas activas: ${polizas.length}\n`);

        let corregidas = 0;
        let sinCambios = 0;
        const errores = [];

        for (const poliza of polizas) {
            const serviciosReales = (poliza.servicios || []).length;
            const registrosReales = (poliza.registros || []).length;
            const totalServicios = poliza.totalServicios || 0;
            const servicioCounter = poliza.servicioCounter || 0;
            const registroCounter = poliza.registroCounter || 0;

            // Detectar inconsistencias
            const necesitaCorreccion =
                totalServicios !== serviciosReales ||
                servicioCounter < serviciosReales ||
                registroCounter < registrosReales;

            if (necesitaCorreccion) {
                try {
                    // CORRECCIÓN 1: totalServicios debe reflejar el tamaño del array
                    const updateData = {};

                    if (totalServicios !== serviciosReales) {
                        updateData.totalServicios = serviciosReales;
                    }

                    // CORRECCIÓN 2: servicioCounter debe ser al menos el tamaño del array
                    // (puede ser mayor si se eliminaron servicios)
                    if (servicioCounter < serviciosReales) {
                        updateData.servicioCounter = serviciosReales;
                    }

                    // CORRECCIÓN 3: registroCounter debe ser al menos el tamaño del array
                    if (registroCounter < registrosReales) {
                        updateData.registroCounter = registrosReales;
                    }

                    // Aplicar corrección
                    await Policy.findByIdAndUpdate(poliza._id, updateData);

                    console.log(`✅ ${poliza.numeroPoliza}`);
                    console.log(`   • totalServicios: ${totalServicios} → ${serviciosReales}`);
                    if (updateData.servicioCounter) {
                        console.log(
                            `   • servicioCounter: ${servicioCounter} → ${updateData.servicioCounter}`
                        );
                    }
                    if (updateData.registroCounter) {
                        console.log(
                            `   • registroCounter: ${registroCounter} → ${updateData.registroCounter}`
                        );
                    }

                    corregidas++;
                } catch (error) {
                    console.error(`❌ Error corrigiendo ${poliza.numeroPoliza}:`, error.message);
                    errores.push({
                        numeroPoliza: poliza.numeroPoliza,
                        error: error.message
                    });
                }
            } else {
                sinCambios++;
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n📊 RESUMEN:');
        console.log(`   • Pólizas corregidas: ${corregidas}`);
        console.log(`   • Pólizas sin cambios: ${sinCambios}`);
        console.log(`   • Errores: ${errores.length}`);

        if (errores.length > 0) {
            console.log('\n❌ ERRORES:');
            errores.forEach((e, i) => {
                console.log(`   ${i + 1}. ${e.numeroPoliza}: ${e.error}`);
            });
        }

        console.log('\n✅ Corrección completada\n');

        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error en corrección:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

corregirContadores().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
