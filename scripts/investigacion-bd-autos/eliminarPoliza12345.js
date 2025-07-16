// Script para eliminar completamente la póliza 12345 y su vehículo asociado
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');

async function eliminarPoliza12345() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB');

        // 1. Buscar y eliminar la póliza 12345
        const policy = await Policy.findOne({ numeroPoliza: '12345' });
        if (policy) {
            console.log('📋 Póliza encontrada:', policy._id);
            console.log('- VehicleId asociado:', policy.vehicleId);

            // Eliminar físicamente la póliza
            await Policy.deleteOne({ _id: policy._id });
            console.log('✅ Póliza 12345 eliminada físicamente');
        } else {
            console.log('❌ No se encontró la póliza 12345');
        }

        // 2. Buscar y eliminar el vehículo asociado
        const vehicle = await Vehicle.findOne({ serie: '12345678901234567' });
        if (vehicle) {
            console.log('\n🚗 Vehículo encontrado:', vehicle._id);
            console.log('- Serie:', vehicle.serie);
            console.log('- Estado:', vehicle.estado);
            console.log('- PolicyId:', vehicle.policyId);

            // Eliminar físicamente el vehículo
            await Vehicle.deleteOne({ _id: vehicle._id });
            console.log('✅ Vehículo eliminado físicamente');
        } else {
            console.log('❌ No se encontró el vehículo');
        }

        // 3. Verificar que se eliminaron
        const policyCheck = await Policy.findOne({ numeroPoliza: '12345' });
        const vehicleCheck = await Vehicle.findOne({ serie: '12345678901234567' });

        console.log('\n🔍 VERIFICACIÓN FINAL:');
        console.log('- Póliza 12345 existe:', !!policyCheck);
        console.log('- Vehículo existe:', !!vehicleCheck);

        if (!policyCheck && !vehicleCheck) {
            console.log('\n✅ Eliminación completa exitosa');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
eliminarPoliza12345();
