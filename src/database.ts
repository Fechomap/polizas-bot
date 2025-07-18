// src/database.ts
import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Conecta a la base de datos MongoDB
 * @returns Promise<void>
 * @throws Error si no se puede conectar o falta la URI
 */
const connectDB = async (): Promise<void> => {
    try {
        const mongoURI: string | undefined = process.env.MONGO_URI;

        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('Intentando conectar a MongoDB...');

        const conn = await mongoose.connect(mongoURI, {
            // Opciones de conexión modernas
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4 // Use IPv4, skip trying IPv6
        });

        console.log(`MongoDB conectado: ${conn.connection.host}`);

        // Log del estado de la conexión
        mongoose.connection.on('error', err => {
            console.error('Error de conexión MongoDB:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB desconectado');
        });
    } catch (error) {
        console.error('Error conectando a MongoDB Atlas:', error);
        throw error;
    }
};

/**
 * Cierra la conexión a la base de datos
 * @returns Promise<void>
 */
export const closeDB = async (): Promise<void> => {
    try {
        await mongoose.connection.close();
        console.log('Conexión a MongoDB cerrada');
    } catch (error) {
        console.error('Error cerrando conexión a MongoDB:', error);
        throw error;
    }
};

/**
 * Verifica si la base de datos está conectada
 * @returns boolean
 */
export const isConnected = (): boolean => {
    return mongoose.connection.readyState === 1;
};

export default connectDB;
