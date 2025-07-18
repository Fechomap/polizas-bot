"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConnected = exports.closeDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }
        console.log('Intentando conectar a MongoDB...');
        const conn = await mongoose_1.default.connect(mongoURI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4
        });
        console.log(`MongoDB conectado: ${conn.connection.host}`);
        mongoose_1.default.connection.on('error', err => {
            console.error('Error de conexión MongoDB:', err);
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.warn('MongoDB desconectado');
        });
    }
    catch (error) {
        console.error('Error conectando a MongoDB Atlas:', error);
        throw error;
    }
};
const closeDB = async () => {
    try {
        await mongoose_1.default.connection.close();
        console.log('Conexión a MongoDB cerrada');
    }
    catch (error) {
        console.error('Error cerrando conexión a MongoDB:', error);
        throw error;
    }
};
exports.closeDB = closeDB;
const isConnected = () => {
    return mongoose_1.default.connection.readyState === 1;
};
exports.isConnected = isConnected;
exports.default = connectDB;
