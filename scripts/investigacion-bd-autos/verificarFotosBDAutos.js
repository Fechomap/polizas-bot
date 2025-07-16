// Script para verificar específicamente las fotos BD AUTOS
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/database');
const Policy = require('../src/models/policy');
const { getInstance } = require('../src/services/CloudflareStorage');

async function verificarFotosBDAutos() {
    try {
        await connectDB();
        console.log('✅ Conectado a MongoDB\n');

        console.log('🔍 VERIFICANDO FOTOS BD AUTOS');
        console.log('═════════════════════════════');

        // Buscar pólizas BD AUTOS
        const polizasBD = await Policy.find({ creadoViaOBD: true });
        console.log(`📊 Pólizas BD AUTOS encontradas: ${polizasBD.length}`);

        if (polizasBD.length === 0) {
            console.log('❌ No se encontraron pólizas BD AUTOS');
            return;
        }

        const storage = getInstance();

        for (const poliza of polizasBD) {
            console.log(`\n📋 Verificando póliza: ${poliza.numeroPoliza}`);
            console.log(`   - Fotos en archivos.r2Files.fotos: ${poliza.archivos?.r2Files?.fotos?.length || 0}`);

            if (poliza.archivos?.r2Files?.fotos?.length > 0) {
                console.log('\n🖼️ VERIFICANDO FOTOS:');
                
                for (let i = 0; i < poliza.archivos.r2Files.fotos.length; i++) {
                    const foto = poliza.archivos.r2Files.fotos[i];
                    console.log(`\n   Foto ${i + 1}:`);
                    console.log(`   - Key: ${foto.key}`);
                    console.log(`   - Original name: ${foto.originalName}`);
                    console.log(`   - Size: ${foto.size} bytes`);
                    console.log(`   - Content type: ${foto.contentType}`);
                    console.log(`   - Fuente: ${foto.fuenteOriginal || 'No especificada'}`);

                    try {
                        // Intentar generar URL firmada
                        console.log(`   - Generando URL firmada...`);
                        const urlFirmada = await storage.getSignedUrl(foto.key, 3600);
                        console.log(`   - ✅ URL firmada generada correctamente`);

                        // Intentar descargar
                        console.log(`   - Intentando descargar...`);
                        const response = await require('node-fetch')(urlFirmada);
                        
                        console.log(`   - Response status: ${response.status}`);
                        console.log(`   - Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);

                        if (response.ok) {
                            const buffer = await response.buffer();
                            console.log(`   - ✅ Descarga exitosa: ${buffer.length} bytes`);
                            console.log(`   - Primeros 20 bytes: ${buffer.slice(0, 20).toString('hex')}`);
                        } else {
                            console.log(`   - ❌ Error en respuesta: ${response.status} ${response.statusText}`);
                            const errorText = await response.text();
                            console.log(`   - Error details: ${errorText}`);
                        }
                    } catch (error) {
                        console.log(`   - ❌ Error accediendo foto: ${error.message}`);
                        console.log(`   - Stack: ${error.stack}`);
                    }
                }
            } else {
                console.log('   - No hay fotos en R2 para esta póliza');
            }
        }

        console.log('\n✅ Verificación de fotos completada');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n📡 Desconectado de MongoDB');
    }
}

console.log('🖼️ SCRIPT DE VERIFICACIÓN DE FOTOS BD AUTOS');
console.log('═══════════════════════════════════════════════');
verificarFotosBDAutos();