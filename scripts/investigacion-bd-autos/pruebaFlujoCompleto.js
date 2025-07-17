// Script para probar el flujo completo BD AUTOS con las correcciones
require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

async function pruebaFlujoCompleto() {
    console.log('🔍 PRUEBA DE FLUJO COMPLETO BD AUTOS');
    console.log('====================================');

    try {
        // Conectar a MongoDB
        console.log('📡 Conectando a MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB conectado');

        // Verificar modelos
        const Vehicle = require('../src/models/vehicle');
        const Policy = require('../src/models/policy');

        console.log('\n🔧 Verificando modelos...');
        console.log('✅ Vehicle model cargado');
        console.log('✅ Policy model cargado');

        // Buscar registros BD AUTOS existentes
        console.log('\n🔍 Buscando registros BD AUTOS...');
        const vehiculosBD = await Vehicle.find({
            creadoViaOBD: true
        })
            .sort({ createdAt: -1 })
            .limit(5);

        const polizasBD = await Policy.find({
            creadoViaOBD: true
        })
            .sort({ createdAt: -1 })
            .limit(5);

        console.log(`📊 Vehículos BD AUTOS encontrados: ${vehiculosBD.length}`);
        console.log(`📊 Pólizas BD AUTOS encontradas: ${polizasBD.length}`);

        // Mostrar el último registro
        if (vehiculosBD.length > 0) {
            const ultimoVehiculo = vehiculosBD[0];
            console.log('\n🚗 ÚLTIMO VEHÍCULO REGISTRADO:');
            console.log(`- ID: ${ultimoVehiculo._id}`);
            console.log(`- Serie: ${ultimoVehiculo.serie}`);
            console.log(`- Marca: ${ultimoVehiculo.marca}`);
            console.log(`- Modelo: ${ultimoVehiculo.submarca}`);
            console.log(`- Estado: ${ultimoVehiculo.estado}`);
            console.log(`- Fecha: ${ultimoVehiculo.createdAt}`);

            // Verificar si tiene póliza
            if (ultimoVehiculo.policyId) {
                console.log(`- Póliza ID: ${ultimoVehiculo.policyId}`);

                const polizaVinculada = await Policy.findById(ultimoVehiculo.policyId);
                if (polizaVinculada) {
                    console.log('\n📄 PÓLIZA VINCULADA:');
                    console.log(`- Número: ${polizaVinculada.numeroPoliza}`);
                    console.log(`- Aseguradora: ${polizaVinculada.aseguradora}`);
                    console.log(`- Fecha: ${polizaVinculada.fechaEmision}`);
                    console.log(
                        `- Archivos PDF: ${polizaVinculada.archivos?.r2Files?.pdfs?.length || 0}`
                    );
                    console.log(
                        `- Archivos Fotos: ${polizaVinculada.archivos?.r2Files?.fotos?.length || 0}`
                    );

                    // Verificar tamaño de archivos
                    if (polizaVinculada.archivos?.r2Files?.pdfs?.length > 0) {
                        const pdf = polizaVinculada.archivos.r2Files.pdfs[0];
                        console.log(`- PDF tamaño: ${pdf.size} bytes`);
                        console.log(`- PDF nombre: ${pdf.originalName}`);
                    }
                }
            }
        }

        // Verificar estado de archivos en R2
        console.log('\n☁️ VERIFICANDO ARCHIVOS EN R2...');
        const { getInstance } = require('../src/services/CloudflareStorage');
        const storage = getInstance();

        // Verificar PDF más reciente
        if (polizasBD.length > 0) {
            const ultimaPoliza = polizasBD[0];
            console.log(`📄 Verificando archivos de póliza ${ultimaPoliza.numeroPoliza}...`);

            if (ultimaPoliza.archivos?.r2Files?.pdfs?.length > 0) {
                const pdf = ultimaPoliza.archivos.r2Files.pdfs[0];
                try {
                    const urlFirmada = await storage.getSignedUrl(pdf.key);
                    console.log(`✅ PDF accesible: ${pdf.originalName}`);
                    console.log(`📊 Tamaño: ${pdf.size} bytes`);

                    // Intentar descargar una muestra del PDF
                    const response = await require('node-fetch')(urlFirmada);
                    const buffer = await response.buffer();
                    const header = buffer.slice(0, 4).toString();
                    console.log(`🔍 Header: ${header}`);
                    console.log(`📝 ¿PDF válido? ${header.startsWith('%PDF') ? '✅ SÍ' : '❌ NO'}`);

                    if (!header.startsWith('%PDF') && buffer.length < 1000) {
                        console.log(`⚠️ Contenido: ${buffer.toString()}`);
                    }
                } catch (error) {
                    console.error(`❌ Error accediendo PDF: ${error.message}`);
                }
            }
        }

        console.log('\n✅ Prueba completada exitosamente');
    } catch (error) {
        console.error('❌ Error en prueba:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Desconectado de MongoDB');
    }
}

pruebaFlujoCompleto();
