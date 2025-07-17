// Script para eliminar completamente las pólizas de prueba BD AUTOS
// Pólizas: 12345 y 123456
// Este script es específico para limpiar el entorno de pruebas BD AUTOS
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');

const POLIZAS_PRUEBA = ['12345', '123456'];

async function eliminarPolizasPrueba() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB\n');

        console.log('🔍 FASE 1: BÚSQUEDA Y ANÁLISIS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const resultados = [];

        // 1. Buscar todas las pólizas de prueba
        for (const numeroPoliza of POLIZAS_PRUEBA) {
            console.log(`\n📋 Analizando póliza: ${numeroPoliza}`);

            const policy = await Policy.findOne({ numeroPoliza });
            if (!policy) {
                console.log(`❌ No se encontró la póliza ${numeroPoliza}`);
                continue;
            }

            console.log(`   - ID: ${policy._id}`);
            console.log(`   - Número: ${policy.numeroPoliza}`);
            console.log(`   - Serie vehículo: ${policy.serie}`);
            console.log(`   - Titular: ${policy.titular}`);
            console.log(`   - VehicleId: ${policy.vehicleId || 'No tiene'}`);
            console.log(`   - Creada via BD AUTOS: ${policy.creadoViaOBD ? 'Sí' : 'No'}`);
            console.log(`   - Fotos R2: ${policy.archivos?.r2Files?.fotos?.length || 0}`);
            console.log(`   - PDFs R2: ${policy.archivos?.r2Files?.pdfs?.length || 0}`);

            // 2. Buscar vehículos relacionados
            console.log('   🚗 Buscando vehículos relacionados...');

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
                console.log(`     Vehículo ${i + 1}:`);
                console.log(`     - ID: ${v._id}`);
                console.log(`     - Serie: ${v.serie}`);
                console.log(`     - Estado: ${v.estado}`);
                console.log(`     - PolicyId: ${v.policyId || 'No tiene'}`);
                console.log(`     - Fotos R2: ${v.archivos?.r2Files?.fotos?.length || 0}`);
            });

            // 3. Listar archivos en Cloudflare
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

            console.log(`   - Archivos en R2: ${archivosCloudflare.length}`);
            if (archivosCloudflare.length > 0) {
                archivosCloudflare.forEach(a => console.log(`     - ${a}`));
            }

            resultados.push({
                numeroPoliza,
                policy,
                vehiculosEncontrados,
                archivosCloudflare
            });
        }

        if (resultados.length === 0) {
            console.log('\n❌ No se encontraron pólizas de prueba para eliminar');
            return;
        }

        // 4. Resumen antes de eliminar
        console.log('\n⚠️  RESUMEN DE ELIMINACIÓN:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        let totalPolicies = 0;
        let totalVehicles = 0;
        let totalArchivos = 0;

        resultados.forEach(r => {
            totalPolicies++;
            totalVehicles += r.vehiculosEncontrados.length;
            totalArchivos += r.archivosCloudflare.length;
            console.log(
                `📋 ${r.numeroPoliza}: ${r.vehiculosEncontrados.length} vehículos, ${r.archivosCloudflare.length} archivos R2`
            );
        });

        console.log('\n📊 TOTALES:');
        console.log(`   - Pólizas a eliminar: ${totalPolicies}`);
        console.log(`   - Vehículos a eliminar: ${totalVehicles}`);
        console.log(`   - Archivos en R2 (permanecerán): ${totalArchivos}`);

        console.log('\n🗑️ FASE 2: ELIMINACIÓN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 5. Eliminar todo
        for (const resultado of resultados) {
            console.log(`\n🔄 Eliminando póliza ${resultado.numeroPoliza}...`);

            // Eliminar póliza
            await Policy.deleteOne({ _id: resultado.policy._id });
            console.log(`✅ Póliza ${resultado.numeroPoliza} eliminada`);

            // Eliminar vehículos
            for (const vehicle of resultado.vehiculosEncontrados) {
                await Vehicle.deleteOne({ _id: vehicle._id });
                console.log(`✅ Vehículo ${vehicle._id} eliminado`);
            }
        }

        // 6. Verificación final
        console.log('\n🔍 FASE 3: VERIFICACIÓN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        let eliminacionExitosa = true;

        for (const numeroPoliza of POLIZAS_PRUEBA) {
            const policyCheck = await Policy.findOne({ numeroPoliza });
            console.log(`   - Póliza ${numeroPoliza} existe: ${!!policyCheck ? '❌ SÍ' : '✅ NO'}`);

            if (policyCheck) {
                eliminacionExitosa = false;
            }
        }

        // Verificar que no haya vehículos BD AUTOS huérfanos
        const vehiculosOBD = await Vehicle.find({ creadoViaOBD: true });
        console.log(`   - Vehículos BD AUTOS restantes: ${vehiculosOBD.length}`);

        if (vehiculosOBD.length > 0) {
            console.log('   ⚠️ Vehículos BD AUTOS encontrados:');
            vehiculosOBD.forEach(v => {
                console.log(`     - ${v.serie} (${v.estado})`);
            });
        }

        if (eliminacionExitosa) {
            console.log('\n✅ ELIMINACIÓN COMPLETA EXITOSA');
            console.log('   Las pólizas de prueba y sus vehículos asociados han sido eliminados.');
            console.log(
                '   Nota: Los archivos en Cloudflare R2 permanecen para evitar pérdida de datos.'
            );
        } else {
            console.log('\n⚠️ ADVERTENCIA: Algunos elementos no se eliminaron correctamente');
        }

        // 7. Estadísticas finales
        console.log('\n📊 ESTADÍSTICAS FINALES:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const totalPoliciesDB = await Policy.countDocuments();
        const totalVehiclesDB = await Vehicle.countDocuments();
        const bdAutosPolicies = await Policy.countDocuments({ creadoViaOBD: true });
        const bdAutosVehicles = await Vehicle.countDocuments({ creadoViaOBD: true });

        console.log(`   - Total pólizas en DB: ${totalPoliciesDB}`);
        console.log(`   - Total vehículos en DB: ${totalVehiclesDB}`);
        console.log(`   - Pólizas BD AUTOS: ${bdAutosPolicies}`);
        console.log(`   - Vehículos BD AUTOS: ${bdAutosVehicles}`);
    } catch (error) {
        console.error('\n❌ ERROR:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
console.log('🧹 SCRIPT DE LIMPIEZA PARA PÓLIZAS DE PRUEBA BD AUTOS');
console.log('════════════════════════════════════════════════════════');
console.log('📋 Pólizas a eliminar: 12345, 123456');
console.log('🎯 Objetivo: Limpiar entorno de pruebas BD AUTOS\n');
eliminarPolizasPrueba();
