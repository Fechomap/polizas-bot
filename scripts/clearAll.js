// scripts/clearAll.js

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importa el modelo de póliza
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

// Ejecutar
(async () => {
    await connectDB();
    await clearAll();
})();