// scripts/deletePolicy.js
const mongoose = require('mongoose');
const path = require('path');
const readline = require('readline');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importar el modelo de póliza
const Policy = require('../src/models/policy');

// Crear interfaz para leer entradas del usuario
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Función para esperar input del usuario
const pregunta = query => new Promise(resolve => rl.question(query, resolve));

// Función para conectar a MongoDB
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
        return true;
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        return false;
    }
};

// Función para formatear fechas
const formatDate = fecha => {
    if (!fecha) return 'N/A';
    const date = new Date(fecha);
    if (isNaN(date.getTime())) return 'Fecha inválida';
    return date.toISOString().split('T')[0];
};

// Función para mostrar detalles de la póliza encontrada
const mostrarDetallePoliza = policy => {
    console.log('\n📋 DETALLES DE LA PÓLIZA ENCONTRADA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔤 Número de Póliza: ${policy.numeroPoliza}`);
    console.log(`👤 Titular: ${policy.titular}`);
    console.log(`📧 Correo: ${policy.correo || 'No registrado'}`);
    console.log(`📱 Teléfono: ${policy.telefono || 'No registrado'}`);
    console.log(`📝 RFC: ${policy.rfc}`);

    console.log('\n🚗 DATOS DEL VEHÍCULO:');
    console.log(`🚙 Marca/Submarca: ${policy.marca} - ${policy.submarca}`);
    console.log(`📅 Año: ${policy.año}`);
    console.log(`🎨 Color: ${policy.color}`);
    console.log(`🔢 Serie: ${policy.serie}`);
    console.log(`🚓 Placas: ${policy.placas}`);

    console.log('\n📄 DATOS DE LA PÓLIZA:');
    console.log(`🏢 Aseguradora: ${policy.aseguradora}`);
    console.log(`👨‍💼 Agente: ${policy.agenteCotizador}`);
    console.log(`📆 Fecha emisión: ${formatDate(policy.fechaEmision)}`);
    console.log(`🔄 Estado: ${policy.estado || 'ACTIVO'}`);

    // Mostrar pagos
    const pagos = policy.pagos || [];
    console.log(`\n💰 Pagos registrados: ${pagos.length}`);
    if (pagos.length > 0) {
        pagos.forEach((pago, index) => {
            console.log(`  - Pago #${index + 1}: $${pago.monto} (${formatDate(pago.fechaPago)})`);
        });
    }

    // Mostrar servicios
    const servicios = policy.servicios || [];
    console.log(`\n🔧 Servicios registrados: ${servicios.length}`);
    if (servicios.length > 0) {
        servicios.forEach((servicio, index) => {
            console.log(
                `  - Servicio #${servicio.numeroServicio || index + 1}: $${servicio.costo} (${formatDate(servicio.fechaServicio)})`
            );
            if (servicio.origenDestino) {
                console.log(`    Origen/Destino: ${servicio.origenDestino}`);
            }
        });
    }

    // Mostrar archivos
    const fotos = policy.archivos?.fotos || [];
    const pdfs = policy.archivos?.pdfs || [];
    console.log('\n📁 ARCHIVOS ADJUNTOS:');
    console.log(`📸 Fotos: ${fotos.length}`);
    console.log(`📄 PDFs: ${pdfs.length}`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Función principal
const deletePolicy = async () => {
    try {
        // Conectar a MongoDB
        const connected = await connectDB();
        if (!connected) {
            console.error('❌ No se pudo conectar a la base de datos. Abortando operación.');
            rl.close();
            process.exit(1);
        }

        console.log('\n🔄 Herramienta para eliminación PERMANENTE de pólizas');
        console.log(
            '⚠️  ADVERTENCIA: Esta acción es irreversible y eliminará todos los datos asociados.'
        );
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Pedir número de póliza
        let numeroPoliza = await pregunta('🔤 Ingresa el número de póliza a eliminar: ');
        numeroPoliza = numeroPoliza.trim().toUpperCase();

        if (!numeroPoliza) {
            console.log('❌ No ingresaste un número de póliza válido. Operación cancelada.');
            rl.close();
            process.exit(1);
        }

        console.log(`\n🔍 Buscando póliza con número: ${numeroPoliza}...`);

        // Buscar la póliza en la base de datos
        const policy = await Policy.findOne({ numeroPoliza });

        if (!policy) {
            console.log(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
            rl.close();
            process.exit(1);
        }

        // Mostrar detalles de la póliza
        mostrarDetallePoliza(policy);

        // Primera confirmación
        const confirmacion1 = await pregunta(
            '\n⚠️  ¿Estás seguro de que deseas ELIMINAR PERMANENTEMENTE esta póliza? (s/n): '
        );

        if (confirmacion1.toLowerCase() !== 's') {
            console.log('✅ Operación cancelada. La póliza NO ha sido eliminada.');
            rl.close();
            process.exit(0);
        }

        // Segunda confirmación con el número de póliza
        const confirmacion2 = await pregunta(
            `\n⚠️  CONFIRMACIÓN FINAL: Escribe exactamente el número de póliza (${numeroPoliza}) para confirmar la eliminación: `
        );

        if (confirmacion2.trim().toUpperCase() !== numeroPoliza) {
            console.log('❌ El número de póliza no coincide. Operación cancelada por seguridad.');
            rl.close();
            process.exit(1);
        }

        // Eliminar la póliza
        console.log('🗑️  Eliminando póliza...');
        const resultado = await Policy.deleteOne({ numeroPoliza });

        if (resultado.deletedCount === 1) {
            console.log(
                `\n✅ ÉXITO: La póliza ${numeroPoliza} ha sido ELIMINADA PERMANENTEMENTE de la base de datos.`
            );
            console.log('📝 Resumen de la eliminación:');
            console.log(`   - Titular: ${policy.titular}`);
            console.log(`   - Vehículo: ${policy.marca} ${policy.submarca} (${policy.año})`);
            console.log(`   - Aseguradora: ${policy.aseguradora}`);
            console.log(`   - Fotos eliminadas: ${policy.archivos?.fotos?.length || 0}`);
            console.log(`   - PDFs eliminados: ${policy.archivos?.pdfs?.length || 0}`);
            console.log(`   - Pagos eliminados: ${policy.pagos?.length || 0}`);
            console.log(`   - Servicios eliminados: ${policy.servicios?.length || 0}`);
        } else {
            console.log(`❌ Error: No se pudo eliminar la póliza ${numeroPoliza}.`);
        }
    } catch (error) {
        console.error('❌ Error durante la operación:', error);
    } finally {
        rl.close();
        try {
            await mongoose.connection.close();
            console.log('✅ Conexión a MongoDB cerrada correctamente.');
        } catch (err) {
            console.error('❌ Error al cerrar la conexión a MongoDB:', err);
        }
        process.exit(0);
    }
};

// Ejecutar la función principal
deletePolicy();
