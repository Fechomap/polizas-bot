/**
 * Test de integración para asignación de pólizas - CORREGIDO
 * Enfocado en la relación vehículo-póliza y flujos reales
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Vehicle from '../../src/models/vehicle';
import Policy from '../../src/models/policy';

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Template de póliza completa para tests
const createValidPolicyData = (overrides: any = {}) => ({
    // Datos del titular
    titular: 'Juan Pérez García',
    rfc: 'PEGJ850312H7A',
    calle: 'Av. Reforma 123',
    colonia: 'Centro',
    municipio: 'Ciudad de México',
    cp: '06000',
    
    // Datos del vehículo
    marca: 'Honda',
    submarca: 'Civic',
    año: 2023,
    color: 'Blanco',
    serie: '1HGBH41JXMN109186',
    placas: 'ABC-123-D',
    
    // Datos de la póliza
    agenteCotizador: 'María González',
    aseguradora: 'GNP Seguros',
    numeroPoliza: 'POL-2024-001',
    fechaEmision: new Date('2024-01-15'),
    
    // Campos numéricos requeridos
    diasRestantesCobertura: 365,
    diasRestantesGracia: 30,
    calificacion: 5,
    totalServicios: 0,
    servicioCounter: 0,
    registroCounter: 1,
    
    // Arrays requeridos
    pagos: [],
    registros: [],
    servicios: [],
    
    // Archivos requeridos
    archivos: {
        fotos: [],
        pdfs: [],
        r2Files: {
            fotos: [],
            pdfs: []
        }
    },
    
    // Estado y BD AUTOS
    estado: 'ACTIVO',
    creadoViaOBD: true,
    creadoPor: '12345',
    
    ...overrides
});

describe('Policy Assignment - Integración de Pólizas CORREGIDA', () => {
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
        await Policy.deleteMany({});
        jest.clearAllMocks();
    });

    describe('Creación de pólizas', () => {
        test('debe crear una póliza completa', async () => {
            const policyData = createValidPolicyData();

            const policy = new Policy(policyData);
            await policy.save();

            const savedPolicy = await Policy.findOne({ numeroPoliza: 'POL-2024-001' });
            expect(savedPolicy).toBeDefined();
            expect(savedPolicy?.aseguradora).toBe('GNP SEGUROS'); // El modelo convierte a mayúsculas
            expect(savedPolicy?.titular).toBe('Juan Pérez García');
            expect(savedPolicy?.marca).toBe('HONDA'); // El modelo convierte a mayúsculas
        });

        test('debe validar número de póliza único', async () => {
            // Crear primera póliza
            const policy1 = createValidPolicyData();
            await Policy.create(policy1);

            // Intentar crear segunda con mismo número
            const policy2 = createValidPolicyData({
                numeroPoliza: 'POL-2024-001', // Duplicado
                aseguradora: 'AXA Seguros',
                titular: 'María García'
            });

            await expect(Policy.create(policy2)).rejects.toThrow();
        });
    });

    describe('Asignación vehículo-póliza', () => {
        test('debe asignar póliza a vehículo correctamente', async () => {
            // Crear vehículo
            const vehicle = await Vehicle.create({
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
            });

            // Crear póliza
            const policyData = createValidPolicyData({
                vehicleId: vehicle._id
            });
            const policy = await Policy.create(policyData);

            // Cambiar estado del vehículo
            vehicle.estado = 'CON_POLIZA';
            await vehicle.save();

            // Verificar asignación
            const updatedPolicy = await Policy.findById(policy._id).populate('vehicleId');
            const updatedVehicle = await Vehicle.findById(vehicle._id);

            expect(updatedPolicy?.vehicleId).toBeDefined();
            expect(updatedVehicle?.estado).toBe('CON_POLIZA');
        });

        test('debe encontrar pólizas activas por vehículo', async () => {
            // Crear vehículo
            const vehicle = await Vehicle.create({
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
                estado: 'CON_POLIZA'
            });

            // Crear póliza activa
            await Policy.create(createValidPolicyData({
                numeroPoliza: 'POL-2024-001',
                vehicleId: vehicle._id,
                estado: 'ACTIVO'
            }));

            // Crear póliza inactiva
            await Policy.create(createValidPolicyData({
                numeroPoliza: 'POL-2023-001',
                vehicleId: vehicle._id,
                estado: 'ELIMINADO'
            }));

            const polizasActivas = await Policy.find({
                vehicleId: vehicle._id,
                estado: 'ACTIVO'
            });

            const polizasEliminadas = await Policy.find({
                vehicleId: vehicle._id,
                estado: 'ELIMINADO'
            });

            expect(polizasActivas).toHaveLength(1);
            expect(polizasEliminadas).toHaveLength(1);
            expect(polizasActivas[0].numeroPoliza).toBe('POL-2024-001');
        });
    });

    describe('Consultas y reportes', () => {
        beforeEach(async () => {
            // Crear datos de prueba
            const vehicles = await Vehicle.create([
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
                    estado: 'CON_POLIZA',
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
                    estado: 'SIN_POLIZA',
                    creadoPor: '67890'
                }
            ]);

            // Crear pólizas
            await Policy.create([
                createValidPolicyData({
                    numeroPoliza: 'POL-2024-001',
                    aseguradora: 'GNP Seguros',
                    vehicleId: vehicles[0]._id,
                    estado: 'ACTIVO'
                }),
                createValidPolicyData({
                    numeroPoliza: 'POL-2024-002',
                    aseguradora: 'AXA Seguros',
                    estado: 'INACTIVO'
                })
            ]);
        });

        test('debe obtener estadísticas de pólizas por aseguradora', async () => {
            const statsGNP = await Policy.countDocuments({ aseguradora: 'GNP Seguros' });
            const statsAXA = await Policy.countDocuments({ aseguradora: 'AXA Seguros' });

            expect(statsGNP).toBe(1);
            expect(statsAXA).toBe(1);
        });

        test('debe obtener cantidad de pólizas creadas', async () => {
            const policies = await Policy.find({});
            const totalPolicies = policies.length;

            expect(totalPolicies).toBe(2); // 2 pólizas creadas
        });

        test('debe encontrar vehículos sin póliza', async () => {
            const vehiculosSinPoliza = await Vehicle.find({ estado: 'SIN_POLIZA' });
            expect(vehiculosSinPoliza).toHaveLength(1);
            expect(vehiculosSinPoliza[0].marca).toBe('Toyota');
        });

        test('debe obtener pólizas con información del vehículo', async () => {
            const polizasConVehiculo = await Policy.find({})
                .populate('vehicleId')
                .exec();

            const polizaConVehiculo = polizasConVehiculo.find(p => p.vehicleId);
            expect(polizaConVehiculo).toBeDefined();
            
            const vehiculo = polizaConVehiculo!.vehicleId as any;
            expect(vehiculo.marca).toBe('Honda'); // Vehicle no convierte a mayúsculas
            expect(vehiculo.submarca).toBe('Civic');
        });
    });

    describe('Validaciones de negocio', () => {
        test('debe validar campos requeridos', async () => {
            const policyIncompleta = new Policy({
                numeroPoliza: 'POL-2024-001',
                aseguradora: 'GNP Seguros'
                // Faltan muchos campos requeridos
            });

            await expect(policyIncompleta.save()).rejects.toThrow();
        });

        test('debe validar estados permitidos', async () => {
            const policyData = createValidPolicyData({
                estado: 'ESTADO_INVALIDO' as any
            });

            const policy = new Policy(policyData);
            await expect(policy.save()).rejects.toThrow();
        });
    });

    describe('Operaciones de actualización', () => {
        test('debe actualizar estado de póliza', async () => {
            const policyData = createValidPolicyData({
                estado: 'INACTIVO'
            });
            const policy = await Policy.create(policyData);

            policy.estado = 'ACTIVO';
            await policy.save();

            const updatedPolicy = await Policy.findById(policy._id);
            expect(updatedPolicy?.estado).toBe('ACTIVO');
        });

        test('debe mantener historial de modificaciones', async () => {
            const policyData = createValidPolicyData();
            const policy = await Policy.create(policyData);

            const originalUpdatedAt = policy.updatedAt;

            // Esperar para diferencia en timestamp
            await new Promise(resolve => setTimeout(resolve, 10));

            policy.aseguradora = 'Nueva Aseguradora';
            await policy.save();

            expect(policy.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe('Cleanup y eliminación', () => {
        test('debe eliminar póliza y actualizar vehículo asociado', async () => {
            // Crear vehículo con póliza
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
                estado: 'CON_POLIZA',
                creadoPor: '12345'
            });

            const policyData = createValidPolicyData({
                vehicleId: vehicle._id
            });
            const policy = await Policy.create(policyData);

            // Eliminar póliza
            await Policy.findByIdAndDelete(policy._id);

            // Actualizar estado del vehículo
            vehicle.estado = 'SIN_POLIZA';
            await vehicle.save();

            const deletedPolicy = await Policy.findById(policy._id);
            const updatedVehicle = await Vehicle.findById(vehicle._id);

            expect(deletedPolicy).toBeNull();
            expect(updatedVehicle?.estado).toBe('SIN_POLIZA');
        });
    });
});