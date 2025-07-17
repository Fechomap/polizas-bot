// Script para verificar el estado actual de BD AUTOS
require('dotenv').config();
const mongoose = require('mongoose');

async function verificarEstado() {
    console.log('🔍 VERIFICANDO ESTADO BD AUTOS');
    console.log('==============================');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB conectado');

        const Vehicle = require('../src/models/vehicle');
        const Policy = require('../src/models/policy');

        // Buscar todos los registros
        console.log('\n📊 CONTEO DE REGISTROS:');
        const totalVehiculos = await Vehicle.countDocuments();
        const totalPolizas = await Policy.countDocuments();
        const vehiculosBD = await Vehicle.countDocuments({ creadoViaOBD: true });
        const polizasBD = await Policy.countDocuments({ creadoViaOBD: true });

        console.log(`- Total vehículos: ${totalVehiculos}`);
        console.log(`- Total pólizas: ${totalPolizas}`);
        console.log(`- Vehículos BD AUTOS: ${vehiculosBD}`);
        console.log(`- Pólizas BD AUTOS: ${polizasBD}`);

        // Buscar pólizas BD AUTOS
        console.log('\n📄 PÓLIZAS BD AUTOS:');
        const polizas = await Policy.find({ creadoViaOBD: true }).sort({ createdAt: -1 });

        for (const poliza of polizas) {
            console.log(`\n- Póliza: ${poliza.numeroPoliza}`);
            console.log(`  - ID: ${poliza._id}`);
            console.log(`  - Aseguradora: ${poliza.aseguradora}`);
            console.log(`  - Vehicle ID: ${poliza.vehicleId}`);
            console.log(`  - Fecha: ${poliza.createdAt}`);
            console.log(`  - PDFs: ${poliza.archivos?.r2Files?.pdfs?.length || 0}`);
            console.log(`  - Fotos: ${poliza.archivos?.r2Files?.fotos?.length || 0}`);

            // Verificar vinculación con vehículo
            if (poliza.vehicleId) {
                const vehiculo = await Vehicle.findById(poliza.vehicleId);
                if (vehiculo) {
                    console.log(`  - Vehículo vinculado: ${vehiculo.serie} (${vehiculo.marca})`);
                    console.log(`  - Estado vehículo: ${vehiculo.estado}`);
                } else {
                    console.log('  - ❌ Vehículo no encontrado');
                }
            }

            // Verificar archivos PDF
            if (poliza.archivos?.r2Files?.pdfs?.length > 0) {
                const pdf = poliza.archivos.r2Files.pdfs[0];
                console.log(`  - PDF: ${pdf.originalName} (${pdf.size} bytes)`);
                console.log(`  - PDF Key: ${pdf.key}`);

                // Verificar contenido del PDF
                const { getInstance } = require('../src/services/CloudflareStorage');
                const storage = getInstance();

                try {
                    const fileName = pdf.key;
                    console.log(`  - Verificando archivo: ${fileName}`);

                    // Usar el mismo método que usa el bot
                    const urlFirmada = await storage.getSignedUrl(fileName);
                    const response = await require('node-fetch')(urlFirmada);
                    const buffer = await response.buffer();

                    console.log(`  - Tamaño real: ${buffer.length} bytes`);
                    console.log(`  - Header: ${buffer.slice(0, 20).toString()}`);
                    console.log(
                        `  - ¿PDF válido? ${buffer.slice(0, 4).toString().startsWith('%PDF') ? '✅ SÍ' : '❌ NO'}`
                    );

                    if (!buffer.slice(0, 4).toString().startsWith('%PDF') && buffer.length < 200) {
                        console.log(`  - Contenido completo: ${buffer.toString()}`);
                    }
                } catch (error) {
                    console.log(`  - ❌ Error verificando PDF: ${error.message}`);
                }
            }
        }

        // Buscar vehículos BD AUTOS
        console.log('\n🚗 VEHÍCULOS BD AUTOS:');
        const vehiculos = await Vehicle.find({ creadoViaOBD: true }).sort({ createdAt: -1 });

        for (const vehiculo of vehiculos) {
            console.log(`\n- Vehículo: ${vehiculo.serie}`);
            console.log(`  - ID: ${vehiculo._id}`);
            console.log(`  - Marca: ${vehiculo.marca} ${vehiculo.submarca}`);
            console.log(`  - Estado: ${vehiculo.estado}`);
            console.log(`  - Policy ID: ${vehiculo.policyId}`);
            console.log(`  - Fecha: ${vehiculo.createdAt}`);
        }

        console.log('\n✅ Verificación completada');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Desconectado de MongoDB');
    }
}

verificarEstado();
