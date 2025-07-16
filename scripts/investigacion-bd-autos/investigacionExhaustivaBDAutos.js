// Script de investigación exhaustiva del flujo BD AUTOS
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');
const { getInstance } = require('../src/services/CloudflareStorage');

async function investigacionExhaustiva() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB\n');

        console.log('🔍 INVESTIGACIÓN EXHAUSTIVA - FLUJO BD AUTOS');
        console.log('════════════════════════════════════════════════\n');

        // 1. BUSCAR LA PÓLIZA MÁS RECIENTE (12345)
        console.log('📋 FASE 1: ANÁLISIS DE PÓLIZA 12345');
        console.log('────────────────────────────────────');

        const policy = await Policy.findOne({ numeroPoliza: '12345' }).sort({ createdAt: -1 });

        if (!policy) {
            console.log('❌ No se encontró póliza 12345');
            return;
        }

        console.log('Datos básicos:');
        console.log(`- ID: ${policy._id}`);
        console.log(`- Creada: ${policy.createdAt}`);
        console.log(`- VehicleId: ${policy.vehicleId || '❌ NO TIENE'}`);
        console.log(`- CreadoViaOBD: ${policy.creadoViaOBD || '❌ NO ESTÁ MARCADO'}`);
        console.log(`- AsignadoPor: ${policy.asignadoPor || '❌ NO TIENE'}`);

        console.log('\nDatos del titular:');
        console.log(`- Titular: ${policy.titular}`);
        console.log(`- RFC: ${policy.rfc}`);
        console.log(`- Teléfono: ${policy.telefono}`);

        console.log('\nDatos del vehículo en póliza:');
        console.log(`- Serie: ${policy.serie}`);
        console.log(`- Marca: ${policy.marca} ${policy.submarca}`);
        console.log(`- Año: ${policy.año}`);
        console.log(`- Placas: ${policy.placas}`);

        // 2. ANÁLISIS DE ARCHIVOS EN LA PÓLIZA
        console.log('\n📁 FASE 2: ANÁLISIS DE ARCHIVOS EN PÓLIZA');
        console.log('────────────────────────────────────────');

        console.log('Estructura de archivos:');
        console.log(`- policy.archivos existe: ${!!policy.archivos}`);

        if (policy.archivos) {
            console.log(`- policy.archivos.fotos (legacy): ${policy.archivos.fotos?.length || 0}`);
            console.log(`- policy.archivos.pdfs (legacy): ${policy.archivos.pdfs?.length || 0}`);
            console.log(`- policy.archivos.r2Files existe: ${!!policy.archivos.r2Files}`);

            if (policy.archivos.r2Files) {
                console.log(`  - r2Files.fotos: ${policy.archivos.r2Files.fotos?.length || 0}`);
                console.log(`  - r2Files.pdfs: ${policy.archivos.r2Files.pdfs?.length || 0}`);

                if (policy.archivos.r2Files.fotos?.length > 0) {
                    console.log('\n  Detalle de fotos en R2:');
                    policy.archivos.r2Files.fotos.forEach((foto, i) => {
                        console.log(`  Foto ${i + 1}:`);
                        console.log(`    - key: ${foto.key}`);
                        console.log(`    - url: ${foto.url}`);
                        console.log(`    - size: ${foto.size}`);
                        console.log(
                            `    - fuenteOriginal: ${foto.fuenteOriginal || 'NO ESPECIFICADA'}`
                        );
                        console.log(`    - uploadedAt: ${foto.uploadedAt}`);
                    });
                }

                if (policy.archivos.r2Files.pdfs?.length > 0) {
                    console.log('\n  Detalle de PDFs en R2:');
                    policy.archivos.r2Files.pdfs.forEach((pdf, i) => {
                        console.log(`  PDF ${i + 1}:`);
                        console.log(`    - key: ${pdf.key}`);
                        console.log(`    - url: ${pdf.url}`);
                        console.log(`    - size: ${pdf.size}`);
                    });
                }
            }
        }

        // 3. BUSCAR VEHÍCULO ASOCIADO
        console.log('\n🚗 FASE 3: ANÁLISIS DE VEHÍCULO');
        console.log('───────────────────────────────');

        // Buscar por vehicleId si existe
        let vehicleById = null;
        if (policy.vehicleId) {
            try {
                vehicleById = await Vehicle.findById(policy.vehicleId);
                console.log('✅ Vehículo encontrado por vehicleId');
            } catch (e) {
                console.log('❌ vehicleId inválido o no encontrado');
            }
        }

        // Buscar por serie
        const vehicleBySerie = await Vehicle.findOne({ serie: policy.serie });
        if (vehicleBySerie) {
            console.log('✅ Vehículo encontrado por serie');
        }

        // Usar el vehículo que encontramos
        const vehicle = vehicleById || vehicleBySerie;

        if (vehicle) {
            console.log('\nDatos del vehículo:');
            console.log(`- ID: ${vehicle._id}`);
            console.log(`- Serie: ${vehicle.serie}`);
            console.log(`- Estado: ${vehicle.estado}`);
            console.log(`- PolicyId: ${vehicle.policyId || '❌ NO TIENE'}`);
            console.log(`- Creado: ${vehicle.createdAt}`);
            console.log(`- CreadoPor: ${vehicle.creadoPor}`);

            console.log('\nArchivos del vehículo:');
            if (vehicle.archivos?.r2Files?.fotos?.length > 0) {
                console.log(`- Fotos en R2: ${vehicle.archivos.r2Files.fotos.length}`);
                vehicle.archivos.r2Files.fotos.forEach((foto, i) => {
                    console.log(`  Foto ${i + 1}: ${foto.key}`);
                });
            } else {
                console.log('- NO TIENE FOTOS EN R2');
            }
        } else {
            console.log('❌ NO SE ENCONTRÓ VEHÍCULO');
        }

        // 4. VERIFICACIÓN DE VINCULACIÓN
        console.log('\n🔗 FASE 4: VERIFICACIÓN DE VINCULACIÓN');
        console.log('─────────────────────────────────────');

        const vinculacionCorrecta = {
            polizaTieneVehicleId: !!policy.vehicleId,
            vehiculoTienePolicyId: vehicle ? !!vehicle.policyId : false,
            idsCoinciden:
                policy.vehicleId &&
                vehicle?.policyId &&
                policy.vehicleId.toString() === vehicle._id.toString() &&
                vehicle.policyId.toString() === policy._id.toString(),
            polizaMarcadaBDAutos: !!policy.creadoViaOBD,
            vehiculoEstadoCorrecto: vehicle?.estado === 'CON_POLIZA'
        };

        console.log('Estado de vinculación:');
        Object.entries(vinculacionCorrecta).forEach(([key, value]) => {
            console.log(`- ${key}: ${value ? '✅' : '❌'}`);
        });

        // 5. ANÁLISIS DEL PROBLEMA DE TRANSFERENCIA DE FOTOS
        console.log('\n📸 FASE 5: ANÁLISIS DE TRANSFERENCIA DE FOTOS');
        console.log('───────────────────────────────────────────');

        if (vehicle && vehicle.archivos?.r2Files?.fotos?.length > 0) {
            console.log(`Vehículo tiene ${vehicle.archivos.r2Files.fotos.length} fotos`);
            console.log(`Póliza tiene ${policy.archivos?.r2Files?.fotos?.length || 0} fotos`);

            if ((policy.archivos?.r2Files?.fotos?.length || 0) === 0) {
                console.log('\n❌ PROBLEMA IDENTIFICADO: Las fotos NO se transfirieron');
                console.log('Posibles causas:');
                console.log('1. Error en la función transferirFotosVehiculoAPoliza');
                console.log('2. El vehículo se cargó sin la propiedad archivos.r2Files');
                console.log('3. Error al guardar la póliza después de agregar fotos');
            }
        }

        // 6. ANÁLISIS DEL PDF
        console.log('\n📄 FASE 6: ANÁLISIS DEL PDF');
        console.log('──────────────────────────');

        const tienePDF = policy.archivos?.r2Files?.pdfs?.length > 0;
        console.log(`PDF guardado: ${tienePDF ? '✅' : '❌'}`);

        if (tienePDF) {
            const pdf = policy.archivos.r2Files.pdfs[0];
            console.log(`- Key: ${pdf.key}`);
            console.log(`- Original: ${pdf.originalName}`);
            console.log(`- Tamaño: ${pdf.size} bytes`);
        }

        // 7. DIAGNÓSTICO FINAL
        console.log('\n🏁 DIAGNÓSTICO FINAL');
        console.log('═══════════════════');

        const problemas = [];

        if (!policy.vehicleId) problemas.push('Póliza no tiene vehicleId');
        if (!policy.creadoViaOBD) problemas.push('Póliza no está marcada como BD AUTOS');
        if (vehicle && !vehicle.policyId) problemas.push('Vehículo no tiene policyId');
        if ((policy.archivos?.r2Files?.fotos?.length || 0) === 0)
            problemas.push('Fotos no se transfirieron');
        if (!vinculacionCorrecta.idsCoinciden) problemas.push('IDs no coinciden correctamente');

        if (problemas.length === 0) {
            console.log('✅ TODO PARECE ESTAR CORRECTO');
        } else {
            console.log('❌ PROBLEMAS ENCONTRADOS:');
            problemas.forEach((p, i) => console.log(`${i + 1}. ${p}`));
        }

        // 8. DATOS RAW PARA DEBUG
        console.log('\n🐛 DATOS RAW PARA DEBUG');
        console.log('──────────────────────');
        console.log('\nPóliza (primeros 500 caracteres):');
        console.log(JSON.stringify(policy, null, 2).substring(0, 500) + '...');

        if (vehicle) {
            console.log('\nVehículo (primeros 500 caracteres):');
            console.log(JSON.stringify(vehicle, null, 2).substring(0, 500) + '...');
        }
    } catch (error) {
        console.error('\n❌ ERROR EN INVESTIGACIÓN:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
investigacionExhaustiva();
