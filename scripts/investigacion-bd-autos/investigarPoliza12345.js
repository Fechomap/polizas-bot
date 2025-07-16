// Script para investigar archivos de la póliza 12345
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const Vehicle = require('../src/models/vehicle');
const { getInstance } = require('../src/services/CloudflareStorage');

async function investigar() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB');

        // 1. Buscar la póliza 12345
        const policy = await Policy.findOne({ numeroPoliza: '12345' });
        if (!policy) {
            console.log('❌ No se encontró la póliza 12345');
            return;
        }

        console.log('\n📋 INFORMACIÓN DE LA PÓLIZA:');
        console.log('ID:', policy._id);
        console.log('Número:', policy.numeroPoliza);
        console.log('Aseguradora:', policy.aseguradora);
        console.log('Serie vehículo:', policy.serie);
        console.log('Creada:', policy.createdAt);
        console.log('Metadata vehicleId:', policy.vehicleId);
        console.log('Creada via BD AUTOS:', policy.creadoViaOBD);

        // 2. Investigar estructura de archivos
        console.log('\n📁 ESTRUCTURA DE ARCHIVOS:');
        console.log('policy.archivos existe:', !!policy.archivos);

        if (policy.archivos) {
            console.log('- fotos (legacy):', policy.archivos.fotos?.length || 0);
            console.log('- pdfs (legacy):', policy.archivos.pdfs?.length || 0);
            console.log('- r2Files existe:', !!policy.archivos.r2Files);

            if (policy.archivos.r2Files) {
                console.log('  - r2Files.fotos:', policy.archivos.r2Files.fotos?.length || 0);
                console.log('  - r2Files.pdfs:', policy.archivos.r2Files.pdfs?.length || 0);

                // Detalles de archivos R2
                if (policy.archivos.r2Files.fotos?.length > 0) {
                    console.log('\n📸 FOTOS EN R2:');
                    policy.archivos.r2Files.fotos.forEach((foto, i) => {
                        console.log(`  Foto ${i + 1}:`);
                        console.log(`    - URL: ${foto.url}`);
                        console.log(`    - Key: ${foto.key}`);
                        console.log(`    - Size: ${foto.size} bytes`);
                        console.log(`    - Uploaded: ${foto.uploadedAt}`);
                        console.log(`    - Original: ${foto.originalName}`);
                    });
                }

                if (policy.archivos.r2Files.pdfs?.length > 0) {
                    console.log('\n📄 PDFs EN R2:');
                    policy.archivos.r2Files.pdfs.forEach((pdf, i) => {
                        console.log(`  PDF ${i + 1}:`);
                        console.log(`    - URL: ${pdf.url}`);
                        console.log(`    - Key: ${pdf.key}`);
                        console.log(`    - Size: ${pdf.size} bytes`);
                        console.log(`    - Uploaded: ${pdf.uploadedAt}`);
                        console.log(`    - Original: ${pdf.originalName}`);
                    });
                }
            }
        }

        // 3. Buscar el vehículo asociado
        if (policy.vehicleId) {
            console.log('\n🚗 BUSCANDO VEHÍCULO ASOCIADO:');
            const vehicle = await Vehicle.findById(policy.vehicleId);

            if (vehicle) {
                console.log('Vehículo encontrado:');
                console.log('- Serie:', vehicle.serie);
                console.log('- Marca:', vehicle.marca, vehicle.submarca);
                console.log('- Estado:', vehicle.estado);
                console.log('- PolicyId:', vehicle.policyId);

                // Archivos del vehículo
                if (vehicle.archivos) {
                    console.log('\n📁 ARCHIVOS DEL VEHÍCULO:');
                    console.log('- fotos (legacy):', vehicle.archivos.fotos?.length || 0);

                    if (vehicle.archivos.r2Files) {
                        console.log(
                            '- r2Files.fotos:',
                            vehicle.archivos.r2Files.fotos?.length || 0
                        );

                        if (vehicle.archivos.r2Files.fotos?.length > 0) {
                            console.log('\n📸 FOTOS DEL VEHÍCULO EN R2:');
                            vehicle.archivos.r2Files.fotos.forEach((foto, i) => {
                                console.log(`  Foto ${i + 1}:`);
                                console.log(`    - Key: ${foto.key}`);
                                console.log(`    - URL: ${foto.url}`);
                            });
                        }
                    }
                }
            } else {
                console.log('❌ No se encontró el vehículo con ID:', policy.vehicleId);
            }
        }

        // 4. Buscar vehículo por serie para ver si tiene fotos
        console.log('\n🔍 BUSCANDO VEHÍCULO POR SERIE:');
        const vehicleBySerie = await Vehicle.findOne({ serie: policy.serie });

        if (vehicleBySerie) {
            console.log('Vehículo encontrado por serie:');
            console.log('- ID:', vehicleBySerie._id);
            console.log('- Estado:', vehicleBySerie.estado);
            console.log('- PolicyId:', vehicleBySerie.policyId);
            console.log('- Creado:', vehicleBySerie.createdAt);

            if (vehicleBySerie.archivos?.r2Files?.fotos?.length > 0) {
                console.log('\n📸 FOTOS DEL VEHÍCULO EN R2:');
                vehicleBySerie.archivos.r2Files.fotos.forEach((foto, i) => {
                    console.log(`  Foto ${i + 1}:`);
                    console.log(`    - Key: ${foto.key}`);
                    console.log(`    - URL: ${foto.url}`);
                    console.log(`    - Uploaded: ${foto.uploadedAt}`);
                });
            }

            // Verificar si el vehículo tiene el ID de la póliza correcta
            if (
                vehicleBySerie.policyId &&
                vehicleBySerie.policyId.toString() !== policy._id.toString()
            ) {
                console.log('\n⚠️ ADVERTENCIA: El vehículo tiene un policyId diferente!');
                console.log('  - PolicyId en vehículo:', vehicleBySerie.policyId);
                console.log('  - ID de póliza actual:', policy._id);
            }
        } else {
            console.log('❌ No se encontró vehículo con serie:', policy.serie);
        }

        // 5. Análisis del problema
        console.log('\n📊 ANÁLISIS DEL PROBLEMA:');
        console.log('1. La póliza 12345 NO tiene archivos asociados (0 fotos, 0 PDFs)');
        console.log('2. La póliza NO tiene vehicleId en metadata');
        console.log('3. La póliza NO está marcada como creadoViaOBD');
        console.log('\nEsto sugiere que:');
        console.log('- La póliza puede haber sido creada manualmente o por otro método');
        console.log('- Los archivos del vehículo original no se transfirieron a la póliza');
        console.log('- Puede haber archivos huérfanos en Cloudflare del vehículo');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Desconectado de MongoDB');
    }
}

// Ejecutar
investigar();
