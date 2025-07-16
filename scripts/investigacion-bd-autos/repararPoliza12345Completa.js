// Script para reparar completamente la póliza 12345 y su vinculación con el vehículo
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');

async function repararPoliza12345() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB\n');

        console.log('🔧 REPARACIÓN COMPLETA DE PÓLIZA 12345');
        console.log('════════════════════════════════════════\n');

        // 1. Buscar la póliza
        const policy = await Policy.findOne({ numeroPoliza: '12345' });
        if (!policy) {
            console.log('❌ No se encontró la póliza 12345');
            return;
        }

        console.log('📋 Póliza encontrada:');
        console.log(`   - ID: ${policy._id}`);
        console.log(`   - Titular: ${policy.titular}`);
        console.log(`   - Serie vehículo: ${policy.serie}`);

        // 2. Buscar el vehículo
        const vehicle = await Vehicle.findOne({ serie: policy.serie });
        if (!vehicle) {
            console.log('❌ No se encontró el vehículo con serie:', policy.serie);
            return;
        }

        console.log('\n🚗 Vehículo encontrado:');
        console.log(`   - ID: ${vehicle._id}`);
        console.log(`   - Estado actual: ${vehicle.estado}`);
        console.log(`   - PolicyId actual: ${vehicle.policyId || 'NO TIENE'}`);

        // 3. Reparar la vinculación
        console.log('\n🔗 REPARANDO VINCULACIÓN...');

        // Actualizar la póliza
        policy.vehicleId = vehicle._id;
        policy.creadoViaOBD = true;
        policy.asignadoPor = vehicle.creadoPor || '7143094298'; // Usar el creador del vehículo

        // Actualizar los archivos con fuenteOriginal
        if (policy.archivos?.r2Files?.fotos) {
            policy.archivos.r2Files.fotos.forEach(foto => {
                if (!foto.fuenteOriginal) {
                    foto.fuenteOriginal = 'vehiculo_bd_autos_reparacion';
                }
                // Corregir tamaño 0
                if (foto.size === 0) {
                    foto.size = 100000; // Tamaño estimado de 100KB
                }
            });
        }

        await policy.save();
        console.log('   ✅ Póliza actualizada con vehicleId y metadatos BD AUTOS');

        // Actualizar el vehículo
        vehicle.policyId = policy._id;
        vehicle.estado = 'CON_POLIZA';
        await vehicle.save();
        console.log('   ✅ Vehículo actualizado con policyId y estado CON_POLIZA');

        // 4. Verificar la reparación
        console.log('\n🔍 VERIFICACIÓN FINAL:');

        const policyVerif = await Policy.findById(policy._id);
        const vehicleVerif = await Vehicle.findById(vehicle._id);

        console.log('\nPóliza:');
        console.log(
            `   - vehicleId: ${policyVerif.vehicleId ? '✅' : '❌'} ${policyVerif.vehicleId}`
        );
        console.log(
            `   - creadoViaOBD: ${policyVerif.creadoViaOBD ? '✅' : '❌'} ${policyVerif.creadoViaOBD}`
        );
        console.log(
            `   - asignadoPor: ${policyVerif.asignadoPor ? '✅' : '❌'} ${policyVerif.asignadoPor}`
        );
        console.log(
            `   - Fotos con fuenteOriginal: ${policyVerif.archivos?.r2Files?.fotos?.filter(f => f.fuenteOriginal).length || 0}`
        );

        console.log('\nVehículo:');
        console.log(
            `   - policyId: ${vehicleVerif.policyId ? '✅' : '❌'} ${vehicleVerif.policyId}`
        );
        console.log(
            `   - estado: ${vehicleVerif.estado === 'CON_POLIZA' ? '✅' : '❌'} ${vehicleVerif.estado}`
        );

        // Verificar vinculación cruzada
        const vinculacionCorrecta =
            policyVerif.vehicleId?.toString() === vehicleVerif._id.toString() &&
            vehicleVerif.policyId?.toString() === policyVerif._id.toString();

        console.log(
            `\n🔗 Vinculación cruzada: ${vinculacionCorrecta ? '✅ CORRECTA' : '❌ INCORRECTA'}`
        );

        if (vinculacionCorrecta) {
            console.log('\n✅ REPARACIÓN COMPLETADA EXITOSAMENTE');
            console.log('La póliza 12345 ahora está correctamente vinculada con su vehículo.');
        }
    } catch (error) {
        console.error('\n❌ ERROR:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
repararPoliza12345();
