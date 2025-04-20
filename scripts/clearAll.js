// scripts/clearAll.js
const mongoose = require('mongoose');
const path = require('path');
const readline = require('readline'); // Para capturar la confirmación del usuario
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Policy = require('../src/models/policy');

// Función para conectar a MongoDB
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB para formatear la base de datos...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB para el formateo');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

// Función para eliminar todos los documentos de la colección
const clearAll = async () => {
    try {
        const result = await Policy.deleteMany({});
        console.log(`🗑️ Eliminados ${result.deletedCount} documentos de la colección Policy.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al eliminar los documentos:', error);
        process.exit(1);
    }
};

// Preguntar al usuario antes de proceder
const askConfirmation = async (question) => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
};

// Ejecutar con doble confirmación
(async () => {
    await connectDB();

    console.log('⚠️ ADVERTENCIA: Vas a eliminar TODOS los documentos de la colección Policy.');
    console.log('Esta acción es irreversible.');

    const confirm1 = await askConfirmation('👉 Escribe "CONFIRMAR" para continuar: ');
    if (confirm1 !== 'CONFIRMAR') {
        console.log('❌ Operación cancelada.');
        process.exit(0);
    }

    const confirm2 = await askConfirmation('🔁 Confirma nuevamente escribiendo "CONFIRMAR": ');
    if (confirm2 !== 'CONFIRMAR') {
        console.log('❌ Operación cancelada.');
        process.exit(0);
    }

    console.log('✅ Confirmación doble recibida. Procediendo con la eliminación...');
    await clearAll();
})();