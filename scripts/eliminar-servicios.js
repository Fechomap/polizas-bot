// scripts/eliminar-servicios.js
const mongoose = require('mongoose');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importar el modelo de póliza
const Policy = require('./models/policy');

// Crear interfaz para leer entradas del usuario
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Función para esperar input del usuario
const pregunta = query => new Promise(resolve => rl.question(query, resolve));

// Variable global para modo DRY RUN
let DRY_RUN = false;

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

// Función para mostrar detalles básicos de la póliza
const mostrarDetallePoliza = policy => {
    console.log('\n📋 DETALLES DE LA PÓLIZA ENCONTRADA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔤 Número de Póliza: ${policy.numeroPoliza}`);
    console.log(`👤 Titular: ${policy.titular}`);
    console.log(`🚗 Vehículo: ${policy.marca} ${policy.submarca} (${policy.año})`);
    console.log(`🔢 Serie: ${policy.serie}`);
    console.log(`🏢 Aseguradora: ${policy.aseguradora}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Función para mostrar servicios registrados
const mostrarServicios = servicios => {
    console.log('\n🔧 SERVICIOS REGISTRADOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!servicios || servicios.length === 0) {
        console.log('❌ No se encontraron servicios registrados en esta póliza.');
        return false;
    }

    servicios.forEach((servicio, index) => {
        console.log(`\n[${index + 1}] SERVICIO #${servicio.numeroServicio || 'Sin número'}`);
        console.log(`    💰 Costo: $${servicio.costo || 'N/A'}`);
        console.log(`    📅 Fecha: ${formatDate(servicio.fechaServicio)}`);
        console.log(`    📄 Expediente: ${servicio.numeroExpediente || 'N/A'}`);
        console.log(`    🗺️  Origen/Destino: ${servicio.origenDestino || 'N/A'}`);
        console.log(`    🆔 ID MongoDB: ${servicio._id || 'SIN ID - USARÁ ÍNDICE'}`);
        console.log(`    📍 Índice en array: ${index}`);
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return true;
};

// Función para seleccionar servicio a eliminar
const seleccionarServicio = async servicios => {
    while (true) {
        const seleccion = await pregunta('\n🎯 Selecciona el número del servicio a eliminar (1-' + servicios.length + '): ');
        const indice = parseInt(seleccion) - 1;

        if (isNaN(indice) || indice < 0 || indice >= servicios.length) {
            console.log('❌ Selección inválida. Por favor, ingresa un número válido.');
            continue;
        }

        return { servicio: servicios[indice], indice };
    }
};

// Función para mostrar resumen del servicio a eliminar
const mostrarResumenEliminacion = (servicio, indice) => {
    console.log('\n⚠️  SERVICIO SELECCIONADO PARA ELIMINACIÓN:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔢 Número de Servicio: ${servicio.numeroServicio || 'Sin número'}`);
    console.log(`💰 Costo: $${servicio.costo || 'N/A'}`);
    console.log(`📅 Fecha: ${formatDate(servicio.fechaServicio)}`);
    console.log(`📄 Número de Expediente: ${servicio.numeroExpediente || 'N/A'}`);
    console.log(`🗺️  Origen/Destino: ${servicio.origenDestino || 'N/A'}`);
    console.log(`🆔 ID MongoDB: ${servicio._id || 'SIN ID - USARÁ ÍNDICE'}`);
    console.log(`📍 Posición en array: ${indice}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Función para eliminar servicio
const eliminarServicio = async (numeroPoliza, servicio, indice) => {
    try {
        if (DRY_RUN) {
            console.log('\n🧪 MODO DRY RUN - NO SE REALIZARÁN CAMBIOS REALES');
            console.log(`✅ Se SIMULA la eliminación del servicio en posición ${indice} de la póliza ${numeroPoliza}`);
            return { success: true, modified: 1, dryRun: true };
        }

        let resultado;

        // Si el servicio tiene _id, usar ese método
        if (servicio._id) {
            resultado = await Policy.updateOne(
                { numeroPoliza },
                { $pull: { servicios: { _id: servicio._id } } }
            );
        } else {
            // Si no tiene _id, usar $unset para eliminar por índice
            // Primero obtener la póliza completa
            const policy = await Policy.findOne({ numeroPoliza });
            if (!policy || !policy.servicios || policy.servicios.length <= indice) {
                return { success: false, error: 'Servicio no encontrado o índice inválido' };
            }

            // Crear nuevo array sin el servicio en el índice especificado
            const nuevosServicios = policy.servicios.filter((_, index) => index !== indice);

            // Actualizar con el nuevo array
            resultado = await Policy.updateOne(
                { numeroPoliza },
                { $set: { servicios: nuevosServicios } }
            );
        }

        return {
            success: resultado.modifiedCount > 0,
            modified: resultado.modifiedCount,
            dryRun: false
        };
    } catch (error) {
        console.error('❌ Error eliminando servicio:', error);
        return { success: false, error: error.message };
    }
};

// Función principal
const eliminarServicioMain = async () => {
    try {
        // Mostrar banner
        console.log('\n🔧 HERRAMIENTA PARA ELIMINACIÓN DE SERVICIOS INDIVIDUALES');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Determinar modo de ejecución
        const args = process.argv.slice(2);
        DRY_RUN = args.includes('--dry-run') || args.includes('-d');

        if (DRY_RUN) {
            console.log('🧪 EJECUTANDO EN MODO DRY RUN (SIMULACIÓN)');
            console.log('📝 No se realizarán cambios reales en la base de datos');
        } else {
            console.log('⚠️  EJECUTANDO EN MODO PRODUCCIÓN');
            console.log('⚠️  Los cambios serán PERMANENTES e IRREVERSIBLES');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Conectar a MongoDB
        const connected = await connectDB();
        if (!connected) {
            console.error('❌ No se pudo conectar a la base de datos. Abortando operación.');
            rl.close();
            process.exit(1);
        }

        // Pedir número de póliza
        let numeroPoliza = await pregunta('🔤 Ingresa el número de póliza: ');
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

        // Mostrar servicios
        const tieneServicios = mostrarServicios(policy.servicios);
        if (!tieneServicios) {
            console.log('\n✅ No hay servicios para eliminar. Operación finalizada.');
            rl.close();
            process.exit(0);
        }

        // Seleccionar servicio a eliminar
        const { servicio, indice } = await seleccionarServicio(policy.servicios);

        // Mostrar resumen
        mostrarResumenEliminacion(servicio, indice);

        // Primera confirmación
        const confirmacion1 = await pregunta(
            '\n⚠️  ¿Estás seguro de que deseas eliminar este servicio? (s/n): '
        );

        if (confirmacion1.toLowerCase() !== 's') {
            console.log('✅ Operación cancelada. El servicio NO ha sido eliminado.');
            rl.close();
            process.exit(0);
        }

        // Segunda confirmación usando datos del servicio
        const confirmacionTexto = servicio._id ?
            servicio._id.toString().slice(-6) :
            `${servicio.numeroServicio || indice + 1}-${servicio.costo}`;

        const confirmacion2 = await pregunta(
            `\n⚠️  CONFIRMACIÓN FINAL: Escribe "${confirmacionTexto}" para confirmar: `
        );

        if (confirmacion2.trim() !== confirmacionTexto) {
            console.log('❌ La confirmación no coincide. Operación cancelada por seguridad.');
            rl.close();
            process.exit(1);
        }

        // Eliminar servicio
        console.log('\n🗑️  Eliminando servicio...');
        const resultado = await eliminarServicio(numeroPoliza, servicio, indice);

        if (resultado.success) {
            if (resultado.dryRun) {
                console.log('\n🧪 SIMULACIÓN COMPLETADA EXITOSAMENTE');
                console.log('✅ En modo producción, el servicio sería eliminado correctamente.');
            } else {
                console.log('\n✅ ÉXITO: El servicio ha sido ELIMINADO PERMANENTEMENTE');
            }

            console.log('\n📝 Resumen de la eliminación:');
            console.log(`   - Póliza: ${numeroPoliza}`);
            console.log(`   - Servicio eliminado: #${servicio.numeroServicio || 'Sin número'}`);
            console.log(`   - Costo: $${servicio.costo || 'N/A'}`);
            console.log(`   - Fecha: ${formatDate(servicio.fechaServicio)}`);
            console.log(`   - Expediente: ${servicio.numeroExpediente || 'N/A'}`);
            console.log(`   - Origen/Destino: ${servicio.origenDestino || 'N/A'}`);
        } else {
            console.log(`❌ Error: No se pudo eliminar el servicio. ${resultado.error || ''}`);
        }

    } catch (error) {
        console.error('❌ Error durante la operación:', error);
    } finally {
        rl.close();
        try {
            await mongoose.connection.close();
            console.log('\n✅ Conexión a MongoDB cerrada correctamente.');
        } catch (err) {
            console.error('❌ Error al cerrar la conexión a MongoDB:', err);
        }
        process.exit(0);
    }
};

// Mostrar ayuda si se solicita
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('\n🔧 HERRAMIENTA PARA ELIMINACIÓN DE SERVICIOS INDIVIDUALES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📖 USO:');
    console.log('   node scripts/eliminar-servicios.js [opciones]');
    console.log('\n⚙️  OPCIONES:');
    console.log('   --dry-run, -d    Ejecutar en modo simulación (no hace cambios reales)');
    console.log('   --help, -h       Mostrar esta ayuda');
    console.log('\n📝 EJEMPLOS:');
    console.log('   # Modo simulación (recomendado primero)');
    console.log('   node scripts/eliminar-servicios.js --dry-run');
    console.log('\n   # Modo producción (cambios permanentes)');
    console.log('   node scripts/eliminar-servicios.js');
    console.log('\n⚠️  ADVERTENCIA:');
    console.log('   - Este script elimina ÚNICAMENTE servicios individuales');
    console.log('   - NO elimina pólizas completas ni otros datos');
    console.log('   - Los cambios en modo producción son IRREVERSIBLES');
    console.log('   - Siempre ejecuta primero con --dry-run para verificar');
    process.exit(0);
}

// Ejecutar la función principal
eliminarServicioMain();
