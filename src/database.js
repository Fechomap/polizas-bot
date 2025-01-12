// src/database.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('Intentando conectar a MongoDB...');
        const conn = await mongoose.connect(mongoURI, {
            // Las opciones deprecadas han sido eliminadas
        });

        console.log(`MongoDB conectado: ${conn.connection.host}`);
    } catch (error) {
        console.error('Error conectando a MongoDB Atlas:', error);
        throw error;
    }
};

module.exports = connectDB;