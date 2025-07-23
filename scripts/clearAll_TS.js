// scripts/clearAll_TS.js
// Versión TypeScript-compatible con conexión directa a MongoDB
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const readline = require('readline'); // Para capturar la confirmación del usuario

// Esquemas flexibles para compatibilidad TypeScript
const PolicySchema = new mongoose.Schema({}, { strict: false });
const Policy = mongoose.model('Policy', PolicySchema);

// Función para conectar a MongoDB con conexión directa
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB para formatear la base de datos (TypeScript Compatible)...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB para el formateo');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    }
};

// Función para eliminar todos los documentos de la colección con manejo de errores mejorado
const clearAll = async () => {
    try {
        console.log('🔄 Iniciando eliminación masiva de documentos...');
        const result = await Policy.deleteMany({});
        console.log(`🗑️ Eliminados ${result.deletedCount} documentos de la colección Policy.`);
        console.log('✅ Formateo de base de datos completado exitosamente.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al eliminar los documentos:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    }
};

// Preguntar al usuario antes de proceder con validación mejorada
const askConfirmation = async question => {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
};

// Ejecutar con triple confirmación para mayor seguridad
(async () => {
    try {
        await connectDB();

        console.log('\n⚠️  ADVERTENCIA CRÍTICA: Vas a eliminar TODOS los documentos de la colección Policy.');
        console.log('🚨 Esta acción es IRREVERSIBLE y borrará TODA la información de pólizas.');
        console.log('📊 Se recomienda hacer un backup antes de proceder.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Primera confirmación
        const confirm1 = await askConfirmation('👉 Escribe "CONFIRMAR" para continuar: ');
        if (confirm1 !== 'CONFIRMAR') {
            console.log('❌ Operación cancelada por el usuario.');
            process.exit(0);
        }

        // Segunda confirmación
        const confirm2 = await askConfirmation('🔁 Confirma nuevamente escribiendo "CONFIRMAR": ');
        if (confirm2 !== 'CONFIRMAR') {
            console.log('❌ Operación cancelada por el usuario.');
            process.exit(0);
        }

        // Tercera confirmación final
        const confirm3 = await askConfirmation('🚨 CONFIRMACIÓN FINAL - Escribe "ELIMINAR_TODO" para proceder: ');
        if (confirm3 !== 'ELIMINAR_TODO') {
            console.log('❌ Operación cancelada por seguridad. No se ha eliminado ningún dato.');
            process.exit(0);
        }

        console.log('✅ Triple confirmación recibida. Procediendo con la eliminación masiva...');
        await clearAll();
    } catch (error) {
        console.error('❌ Error durante la ejecución del script:', error);
        console.error('📋 Stack trace:', error.stack);
        process.exit(1);
    } finally {
        try {
            await mongoose.connection.close();
            console.log('✅ Conexión a MongoDB cerrada correctamente.');
        } catch (err) {
            console.error('❌ Error al cerrar la conexión a MongoDB:', err);
        }
    }
})();
