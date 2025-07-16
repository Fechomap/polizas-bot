// Script para eliminar completamente la póliza 12345 y su vehículo asociado
// Este script es específico para limpiar el entorno de pruebas BD AUTOS
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');

async function eliminarPoliza12345Completa() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB\n');

        console.log('🔍 FASE 1: BÚSQUEDA Y ANÁLISIS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 1. Buscar la póliza 12345
        const policy = await Policy.findOne({ numeroPoliza: '12345' });
        if (!policy) {
            console.log('❌ No se encontró la póliza 12345');
            return;
        }

        console.log('📋 Póliza encontrada:');
        console.log(`   - ID: ${policy._id}`);
        console.log(`   - Número: ${policy.numeroPoliza}`);
        console.log(`   - Serie vehículo: ${policy.serie}`);
        console.log(`   - Titular: ${policy.titular}`);
        console.log(`   - VehicleId: ${policy.vehicleId || 'No tiene'}`);
        console.log(`   - Creada via BD AUTOS: ${policy.creadoViaOBD ? 'Sí' : 'No'}`);
        console.log(`   - Fotos R2: ${policy.archivos?.r2Files?.fotos?.length || 0}`);
        console.log(`   - PDFs R2: ${policy.archivos?.r2Files?.pdfs?.length || 0}`);

        // 2. Buscar vehículos relacionados
        console.log('\n🚗 Buscando vehículos relacionados...');

        // Buscar por serie
        const vehicleBySerie = await Vehicle.findOne({ serie: policy.serie });
        // Buscar por vehicleId si existe
        const vehicleById = policy.vehicleId ? await Vehicle.findById(policy.vehicleId) : null;
        // Buscar por policyId
        const vehicleByPolicyId = await Vehicle.findOne({ policyId: policy._id });

        const vehiculosEncontrados = [];
        if (vehicleBySerie) vehiculosEncontrados.push(vehicleBySerie);
        if (vehicleById && !vehiculosEncontrados.find(v => v._id.equals(vehicleById._id))) {
            vehiculosEncontrados.push(vehicleById);
        }
        if (
            vehicleByPolicyId &&
            !vehiculosEncontrados.find(v => v._id.equals(vehicleByPolicyId._id))
        ) {
            vehiculosEncontrados.push(vehicleByPolicyId);
        }

        console.log(`   - Vehículos encontrados: ${vehiculosEncontrados.length}`);

        vehiculosEncontrados.forEach((v, i) => {
            console.log(`\n   Vehículo ${i + 1}:`);
            console.log(`   - ID: ${v._id}`);
            console.log(`   - Serie: ${v.serie}`);
            console.log(`   - Estado: ${v.estado}`);
            console.log(`   - PolicyId: ${v.policyId || 'No tiene'}`);
            console.log(`   - Fotos R2: ${v.archivos?.r2Files?.fotos?.length || 0}`);
        });

        // 3. Listar archivos en Cloudflare que se perderían
        console.log('\n☁️ ARCHIVOS EN CLOUDFLARE QUE SE MANTENDRÁN:');
        console.log('(Los archivos en R2 no se eliminan automáticamente)');

        const archivosCloudflare = [];

        // Archivos de la póliza
        if (policy.archivos?.r2Files?.fotos) {
            policy.archivos.r2Files.fotos.forEach(f => {
                archivosCloudflare.push(`Foto póliza: ${f.key}`);
            });
        }
        if (policy.archivos?.r2Files?.pdfs) {
            policy.archivos.r2Files.pdfs.forEach(f => {
                archivosCloudflare.push(`PDF póliza: ${f.key}`);
            });
        }

        // Archivos de los vehículos
        vehiculosEncontrados.forEach(v => {
            if (v.archivos?.r2Files?.fotos) {
                v.archivos.r2Files.fotos.forEach(f => {
                    archivosCloudflare.push(`Foto vehículo: ${f.key}`);
                });
            }
        });

        if (archivosCloudflare.length > 0) {
            archivosCloudflare.forEach(a => console.log(`   - ${a}`));
        } else {
            console.log('   - No hay archivos en Cloudflare');
        }

        // 4. Confirmación antes de eliminar
        console.log('\n⚠️  RESUMEN DE ELIMINACIÓN:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📋 Póliza a eliminar: ${policy.numeroPoliza}`);
        console.log(`🚗 Vehículos a eliminar: ${vehiculosEncontrados.length}`);
        console.log(`☁️ Archivos en R2 (permanecerán): ${archivosCloudflare.length}`);

        console.log('\n🗑️ FASE 2: ELIMINACIÓN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 5. Eliminar póliza
        await Policy.deleteOne({ _id: policy._id });
        console.log('✅ Póliza 12345 eliminada');

        // 6. Eliminar vehículos
        for (const vehicle of vehiculosEncontrados) {
            await Vehicle.deleteOne({ _id: vehicle._id });
            console.log(`✅ Vehículo ${vehicle._id} eliminado`);
        }

        // 7. Verificación final
        console.log('\n🔍 FASE 3: VERIFICACIÓN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const policyCheck = await Policy.findOne({ numeroPoliza: '12345' });
        const vehicleCheck = await Vehicle.findOne({ serie: policy.serie });

        console.log('Verificación en base de datos:');
        console.log(`   - Póliza 12345 existe: ${!!policyCheck ? '❌ SÍ' : '✅ NO'}`);
        console.log(`   - Vehículo existe: ${!!vehicleCheck ? '❌ SÍ' : '✅ NO'}`);

        if (!policyCheck && !vehicleCheck) {
            console.log('\n✅ ELIMINACIÓN COMPLETA EXITOSA');
            console.log('   La póliza 12345 y sus vehículos asociados han sido eliminados.');
            console.log(
                '   Nota: Los archivos en Cloudflare R2 permanecen para evitar pérdida de datos.'
            );
        } else {
            console.log('\n⚠️ ADVERTENCIA: Algunos elementos no se eliminaron correctamente');
        }
    } catch (error) {
        console.error('\n❌ ERROR:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
console.log('🧹 SCRIPT DE LIMPIEZA PARA PÓLIZA 12345 (BD AUTOS)');
console.log('════════════════════════════════════════════════════\n');
eliminarPoliza12345Completa();
