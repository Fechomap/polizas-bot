// Script para reparar la póliza 12345 y vincularla correctamente con el vehículo
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');

async function repararPoliza() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB');

        // 1. Buscar la póliza 12345
        const policy = await Policy.findOne({ numeroPoliza: '12345' });
        if (!policy) {
            console.log('❌ No se encontró la póliza 12345');
            return;
        }

        console.log('📋 Póliza encontrada:', policy._id);

        // 2. Buscar el vehículo por serie
        const vehicle = await Vehicle.findOne({ serie: policy.serie });
        if (!vehicle) {
            console.log('❌ No se encontró vehículo con serie:', policy.serie);
            return;
        }

        console.log('🚗 Vehículo encontrado:', vehicle._id);
        console.log('- Estado actual:', vehicle.estado);
        console.log('- PolicyId actual:', vehicle.policyId);
        console.log('- Fotos en R2:', vehicle.archivos?.r2Files?.fotos?.length || 0);

        // 3. Actualizar el vehículo con el policyId
        if (!vehicle.policyId) {
            vehicle.policyId = policy._id;
            await vehicle.save();
            console.log('✅ PolicyId actualizado en el vehículo');
        }

        // 4. Actualizar la póliza con el vehicleId y marcarla como creada via BD AUTOS
        let policyUpdated = false;

        if (!policy.vehicleId) {
            policy.vehicleId = vehicle._id;
            policyUpdated = true;
            console.log('✅ VehicleId agregado a la póliza');
        }

        if (!policy.creadoViaOBD) {
            policy.creadoViaOBD = true;
            policyUpdated = true;
            console.log('✅ Marcada como creada via BD AUTOS');
        }

        // 5. Transferir las fotos del vehículo a la póliza
        if (vehicle.archivos?.r2Files?.fotos && vehicle.archivos.r2Files.fotos.length > 0) {
            // Inicializar estructura de archivos si no existe
            if (!policy.archivos) {
                policy.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
            }
            if (!policy.archivos.r2Files) {
                policy.archivos.r2Files = { fotos: [], pdfs: [] };
            }

            // Verificar si ya tiene fotos
            const fotosExistentes = policy.archivos.r2Files.fotos.length;

            if (fotosExistentes === 0) {
                // Copiar las referencias de las fotos del vehículo
                const fotosTransferidas = [];
                for (const foto of vehicle.archivos.r2Files.fotos) {
                    fotosTransferidas.push({
                        url: foto.url,
                        key: foto.key,
                        size: foto.size || 0,
                        contentType: foto.contentType || 'image/jpeg',
                        uploadedAt: foto.uploadedAt || new Date(),
                        originalName: foto.originalName || 'foto_vehiculo.jpg',
                        fuenteOriginal: 'vehiculo_bd_autos_reparacion'
                    });
                }

                // Agregar las fotos a la póliza
                policy.archivos.r2Files.fotos.push(...fotosTransferidas);
                policyUpdated = true;

                console.log(
                    `✅ ${fotosTransferidas.length} fotos transferidas del vehículo a la póliza`
                );
            } else {
                console.log(`ℹ️ La póliza ya tiene ${fotosExistentes} fotos, no se transferirán`);
            }
        }

        // 6. Guardar cambios en la póliza si hubo actualizaciones
        if (policyUpdated) {
            await policy.save();
            console.log('💾 Póliza actualizada correctamente');
        }

        // 7. Mostrar resumen final
        console.log('\n📊 RESUMEN FINAL:');
        console.log('Póliza 12345:');
        console.log('- VehicleId:', policy.vehicleId);
        console.log('- CreadoViaOBD:', policy.creadoViaOBD);
        console.log('- Fotos:', policy.archivos?.r2Files?.fotos?.length || 0);
        console.log('- PDFs:', policy.archivos?.r2Files?.pdfs?.length || 0);
        console.log('\nVehículo:');
        console.log('- PolicyId:', vehicle.policyId);
        console.log('- Estado:', vehicle.estado);

        console.log('\n✅ Reparación completada exitosamente');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
repararPoliza();
