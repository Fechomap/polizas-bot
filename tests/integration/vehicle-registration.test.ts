/**
 * Test de integración moderno para registro de vehículos
 * Diseñado para ser funcional y robusto con TypeScript
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Vehicle from '../../src/models/vehicle';

// Mock de CloudflareStorage
jest.mock('../../src/services/CloudflareStorage', () => ({
    getInstance: jest.fn(() => ({
        uploadFile: jest.fn(() =>
            Promise.resolve({
                url: 'https://test.r2.com/vehicle-photo.jpg',
                key: 'vehicles/test/photo.jpg',
                size: 100000,
                contentType: 'image/jpeg'
            })
        ),
        isConfigured: jest.fn(() => true)
    }))
}));

// Mock del generador de datos mexicanos
jest.mock('../../src/utils/mexicanDataGenerator', () => ({
    generarDatosMexicanosCompletos: jest.fn(() => ({
        titular: 'Juan Pérez García',
        rfc: 'PEGJ850312H7A',
        telefono: '+52 55 1234 5678',
        correo: 'juan.perez@email.com',
        calle: 'Av. Reforma 123',
        colonia: 'Centro',
        municipio: 'Ciudad de México',
        estadoRegion: 'CDMX',
        cp: '06000'
    }))
}));

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock del bot de Telegram
const createMockBot = () => ({
    telegram: {
        sendMessage: jest.fn(() => Promise.resolve({ message_id: 123 })),
        editMessageText: jest.fn(() => Promise.resolve({})),
        getFile: jest.fn(() => Promise.resolve({ file_path: 'photos/test.jpg' })),
        getFileLink: jest.fn(() => Promise.resolve({ href: 'https://api.telegram.org/file/bot123/photos/test.jpg' }))
    }
} as any);

// Mock de contexto de Telegram (simplificado para evitar errores de tipado)
const createMockContext = (chatId: number, text?: string) => ({
    chat: { id: chatId, type: 'private', first_name: 'Test User' },
    message: text ? { text, chat: { id: chatId, type: 'private' } } : undefined,
    from: { id: 12345, first_name: 'Test', is_bot: false }
} as any);

describe('Vehicle Registration - Integración Moderna', () => {
    let mongoServer: MongoMemoryServer;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        await Vehicle.deleteMany({});
        jest.clearAllMocks();
    });

    describe('Flujo básico de registro', () => {
        test('debe crear un vehículo básico correctamente', async () => {
            // Crear vehículo directamente en BD para prueba de integración
            const vehicleData = {
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez García',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345',
                estado: 'SIN_POLIZA'
            };

            const vehicle = new Vehicle(vehicleData);
            await vehicle.save();

            // Verificar que se guardó correctamente
            const savedVehicle = await Vehicle.findOne({ serie: '1HGBH41JXMN109186' });
            expect(savedVehicle).toBeDefined();
            expect(savedVehicle?.marca).toBe('Honda');
            expect(savedVehicle?.submarca).toBe('Civic');
            expect(savedVehicle?.estado).toBe('SIN_POLIZA');
        });

        test('debe validar serie única', async () => {
            // Crear primer vehículo
            const vehicle1 = new Vehicle({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345',
                estado: 'SIN_POLIZA'
            });
            await vehicle1.save();

            // Intentar crear segundo con misma serie debe fallar
            const vehicle2 = new Vehicle({
                serie: '1HGBH41JXMN109186', // Serie duplicada
                marca: 'Toyota',
                submarca: 'Corolla',
                año: 2022,
                color: 'Negro',
                placas: 'XYZ-456-E',
                titular: 'María García',
                rfc: 'GARM900215M2A',
                telefono: '+52 55 9876 5432',
                correo: 'maria.garcia@email.com',
                creadoPor: '67890',
                estado: 'SIN_POLIZA'
            });

            await expect(vehicle2.save()).rejects.toThrow();
        });

        test('debe manejar diferentes estados de vehículo', async () => {
            const vehicle = new Vehicle({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345',
                estado: 'SIN_POLIZA'
            });
            await vehicle.save();

            // Cambiar estado a CON_POLIZA
            vehicle.estado = 'CON_POLIZA';
            await vehicle.save();

            const updatedVehicle = await Vehicle.findById(vehicle._id);
            expect(updatedVehicle?.estado).toBe('CON_POLIZA');
        });
    });

    describe('Búsquedas y consultas', () => {
        beforeEach(async () => {
            // Crear vehículos de prueba
            const vehicles = [
                {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Honda',
                    submarca: 'Civic',
                    año: 2023,
                    color: 'Blanco',
                    placas: 'ABC-123-D',
                    titular: 'Juan Pérez',
                    rfc: 'PEGJ850312H7A',
                    telefono: '+52 55 1234 5678',
                    correo: 'juan.perez@email.com',
                    estado: 'SIN_POLIZA',
                    creadoPor: '12345'
                },
                {
                    serie: '2HGBH41JXMN109187',
                    marca: 'Honda',
                    submarca: 'Accord',
                    año: 2022,
                    color: 'Negro',
                    placas: 'DEF-456-G',
                    titular: 'María García',
                    rfc: 'GARM900215M2A',
                    telefono: '+52 55 9876 5432',
                    correo: 'maria.garcia@email.com',
                    estado: 'CON_POLIZA',
                    creadoPor: '12345'
                },
                {
                    serie: '3HGBH41JXMN109188',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2021,
                    color: 'Azul',
                    placas: 'GHI-789-J',
                    titular: 'Carlos López',
                    rfc: 'LOPC950118H1B',
                    telefono: '+52 55 5555 5555',
                    correo: 'carlos.lopez@email.com',
                    estado: 'SIN_POLIZA',
                    creadoPor: '67890'
                }
            ];

            await Vehicle.insertMany(vehicles);
        });

        test('debe buscar vehículos por estado', async () => {
            const vehiculosSinPoliza = await Vehicle.find({ estado: 'SIN_POLIZA' });
            const vehiculosConPoliza = await Vehicle.find({ estado: 'CON_POLIZA' });

            expect(vehiculosSinPoliza).toHaveLength(2);
            expect(vehiculosConPoliza).toHaveLength(1);
        });

        test('debe buscar vehículos por marca', async () => {
            const vehiculosHonda = await Vehicle.find({ marca: 'Honda' });
            const vehiculosToyota = await Vehicle.find({ marca: 'Toyota' });

            expect(vehiculosHonda).toHaveLength(2);
            expect(vehiculosToyota).toHaveLength(1);
        });

        test('debe buscar por serie específica', async () => {
            const vehicle = await Vehicle.findOne({ serie: '1HGBH41JXMN109186' });

            expect(vehicle).toBeDefined();
            expect(vehicle?.marca).toBe('Honda');
            expect(vehicle?.submarca).toBe('Civic');
        });

        test('debe contar vehículos por usuario', async () => {
            const vehiculosUsuario1 = await Vehicle.countDocuments({ creadoPor: '12345' });
            const vehiculosUsuario2 = await Vehicle.countDocuments({ creadoPor: '67890' });

            expect(vehiculosUsuario1).toBe(2);
            expect(vehiculosUsuario2).toBe(1);
        });
    });

    describe('Validaciones de datos', () => {
        test('debe validar campos requeridos', async () => {
            const vehicleIncompleto = new Vehicle({
                // Falta serie (requerida)
                marca: 'Honda',
                submarca: 'Civic'
            });

            await expect(vehicleIncompleto.save()).rejects.toThrow();
        });

        test('debe validar formato de año', async () => {
            const vehicle = new Vehicle({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 1800, // Año inválido
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345'
            });

            await expect(vehicle.save()).rejects.toThrow();
        });

        test('debe validar estados permitidos', async () => {
            const vehicle = new Vehicle({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                estado: 'ESTADO_INVALIDO' as any, // Estado no permitido
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345'
            });

            await expect(vehicle.save()).rejects.toThrow();
        });
    });

    describe('Operaciones de actualización', () => {
        test('debe actualizar información del vehículo', async () => {
            const vehicle = await Vehicle.create({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345',
                estado: 'SIN_POLIZA'
            });

            // Actualizar color y placas
            vehicle.color = 'Negro';
            vehicle.placas = 'NEW-123-X';
            await vehicle.save();

            const updatedVehicle = await Vehicle.findById(vehicle._id);
            expect(updatedVehicle?.color).toBe('Negro');
            expect(updatedVehicle?.placas).toBe('NEW-123-X');
        });

        test('debe mantener timestamps de modificación', async () => {
            const vehicle = await Vehicle.create({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345'
            });

            const originalUpdatedAt = vehicle.updatedAt;

            // Esperar un momento para asegurar diferencia en timestamp
            await new Promise(resolve => setTimeout(resolve, 10));

            vehicle.color = 'Rojo';
            await vehicle.save();

            expect(vehicle.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe('Limpieza y eliminación', () => {
        test('debe eliminar vehículo específico', async () => {
            const vehicle = await Vehicle.create({
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                correo: 'juan.perez@email.com',
                creadoPor: '12345'
            });

            await Vehicle.findByIdAndDelete(vehicle._id);

            const deletedVehicle = await Vehicle.findById(vehicle._id);
            expect(deletedVehicle).toBeNull();
        });

        test('debe limpiar todos los vehículos de prueba', async () => {
            await Vehicle.create([
                {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Honda',
                    submarca: 'Civic',
                    año: 2023,
                    color: 'Blanco',
                    placas: 'ABC-123-D',
                    titular: 'Juan Pérez',
                    rfc: 'PEGJ850312H7A',
                    telefono: '+52 55 1234 5678',
                    correo: 'juan.perez@email.com',
                    creadoPor: '12345'
                },
                {
                    serie: '2HGBH41JXMN109187',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2022,
                    color: 'Negro',
                    placas: 'DEF-456-G',
                    titular: 'María García',
                    rfc: 'GARM900215M2A',
                    telefono: '+52 55 9876 5432',
                    correo: 'maria.garcia@email.com',
                    creadoPor: '67890'
                }
            ]);

            await Vehicle.deleteMany({});

            const remainingVehicles = await Vehicle.find({});
            expect(remainingVehicles).toHaveLength(0);
        });
    });
});