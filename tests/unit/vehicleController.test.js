const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const VehicleController = require('../../src/controllers/vehicleController');
const Vehicle = require('../../src/models/vehicle');

// Mock del generador de datos mexicanos
jest.mock('../../src/utils/mexicanDataGenerator', () => ({
    generarDatosMexicanosCompletos: jest.fn(() => ({
        titular: 'Juan Pérez García',
        rfc: 'PEGJ850312H7A',
        telefono: '+52 55 1234 5678',
        correo: 'juan.perez123@gmail.com',
        calle: 'Calle Reforma 123',
        colonia: 'Centro',
        municipio: 'Ciudad de México',
        estadoRegion: 'Ciudad de México',
        cp: '06000'
    }))
}));

// Mock de CloudflareStorage
jest.mock('../../src/services/CloudflareStorage', () => ({
    uploadFile: jest.fn(() =>
        Promise.resolve({
            url: 'https://example.com/test.jpg',
            key: 'test-key-123'
        })
    )
}));

describe('VehicleController', () => {
    let mongoServer;

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
    });

    describe('registrarVehiculo', () => {
        test('debe registrar un vehículo exitosamente', async () => {
            const vehicleData = {
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D'
            };

            const resultado = await VehicleController.registrarVehiculo(
                vehicleData,
                'user123',
                'TELEGRAM_BOT'
            );

            expect(resultado.success).toBe(true);
            expect(resultado.vehicle).toBeDefined();
            expect(resultado.datosGenerados).toBeDefined();

            // Verificar datos del vehículo
            expect(resultado.vehicle.serie).toBe(vehicleData.serie);
            expect(resultado.vehicle.marca).toBe(vehicleData.marca);
            expect(resultado.vehicle.submarca).toBe(vehicleData.submarca);
            expect(resultado.vehicle.año).toBe(vehicleData.año);
            expect(resultado.vehicle.color).toBe(vehicleData.color);
            expect(resultado.vehicle.placas).toBe(vehicleData.placas);

            // Verificar estado inicial
            expect(resultado.vehicle.estado).toBe('SIN_POLIZA');
            expect(resultado.vehicle.creadoPor).toBe('user123');

            // Verificar datos temporales generados
            expect(resultado.vehicle.titular).toBe('Juan Pérez García');
            expect(resultado.vehicle.rfc).toBe('PEGJ850312H7A');
        });

        test('debe fallar con serie duplicada', async () => {
            const vehicleData = {
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D'
            };

            // Registrar primer vehículo
            await VehicleController.registrarVehiculo(vehicleData, 'user123');

            // Intentar registrar segundo vehículo con misma serie
            const resultado = await VehicleController.registrarVehiculo(vehicleData, 'user456');

            expect(resultado.success).toBe(false);
            expect(resultado.error).toContain('Ya existe un vehículo registrado con la serie');
        });

        test('debe fallar con placas duplicadas', async () => {
            const vehicleData1 = {
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D'
            };

            const vehicleData2 = {
                serie: '2HGBH41JXMN109187',
                marca: 'Toyota',
                submarca: 'Corolla',
                año: 2022,
                color: 'Negro',
                placas: 'ABC-123-D' // Mismas placas
            };

            await VehicleController.registrarVehiculo(vehicleData1, 'user123');
            const resultado = await VehicleController.registrarVehiculo(vehicleData2, 'user456');

            expect(resultado.success).toBe(false);
            expect(resultado.error).toContain('Ya existe un vehículo registrado con las placas');
        });

        test('debe convertir serie y placas a mayúsculas', async () => {
            const vehicleData = {
                serie: '1hgbh41jxmn109186', // minúsculas
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'abc-123-d' // minúsculas
            };

            const resultado = await VehicleController.registrarVehiculo(vehicleData, 'user123');

            expect(resultado.success).toBe(true);
            expect(resultado.vehicle.serie).toBe('1HGBH41JXMN109186');
            expect(resultado.vehicle.placas).toBe('ABC-123-D');
        });
    });

    describe('agregarFotos', () => {
        let vehicleId;

        beforeEach(async () => {
            const vehicleData = {
                serie: '1HGBH41JXMN109186',
                marca: 'Honda',
                submarca: 'Civic',
                año: 2023,
                color: 'Blanco',
                placas: 'ABC-123-D'
            };

            const resultado = await VehicleController.registrarVehiculo(vehicleData, 'user123');
            vehicleId = resultado.vehicle._id;
        });

        test('debe agregar fotos exitosamente usando Cloudflare', async () => {
            const files = [
                {
                    originalname: 'foto1.jpg',
                    mimetype: 'image/jpeg',
                    size: 1024,
                    buffer: Buffer.from('fake image data')
                }
            ];

            const resultado = await VehicleController.agregarFotos(vehicleId, files, true);

            expect(resultado.success).toBe(true);
            expect(resultado.fotosGuardadas).toHaveLength(1);
            expect(resultado.totalFotos).toBe(1);
        });

        test('debe fallar con vehículo inexistente', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const files = [
                {
                    originalname: 'foto1.jpg',
                    mimetype: 'image/jpeg',
                    size: 1024
                }
            ];

            const resultado = await VehicleController.agregarFotos(fakeId, files);

            expect(resultado.success).toBe(false);
            expect(resultado.error).toBe('Vehículo no encontrado');
        });
    });

    describe('getVehiculosSinPoliza', () => {
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
                    correo: 'juan@test.com',
                    creadoPor: 'user123',
                    estado: 'SIN_POLIZA'
                },
                {
                    serie: '2HGBH41JXMN109187',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2022,
                    color: 'Negro',
                    placas: 'XYZ-456-E',
                    titular: 'María García',
                    rfc: 'GARM900215M2A',
                    telefono: '+52 55 9876 5432',
                    correo: 'maria@test.com',
                    creadoPor: 'user456',
                    estado: 'CON_POLIZA'
                }
            ];

            await Vehicle.insertMany(vehicles);
        });

        test('debe retornar solo vehículos sin póliza', async () => {
            const resultado = await VehicleController.getVehiculosSinPoliza();

            expect(resultado.success).toBe(true);
            expect(resultado.vehiculos).toHaveLength(1);
            expect(resultado.vehiculos[0].estado).toBe('SIN_POLIZA');
            expect(resultado.vehiculos[0].marca).toBe('Honda');
            expect(resultado.pagination.total).toBe(1);
        });

        test('debe manejar paginación correctamente', async () => {
            const resultado = await VehicleController.getVehiculosSinPoliza(10, 1);

            expect(resultado.success).toBe(true);
            expect(resultado.pagination.pagina).toBe(1);
            expect(resultado.pagination.limite).toBe(10);
            expect(resultado.pagination.totalPaginas).toBe(1);
        });
    });

    describe('buscarVehiculo', () => {
        beforeEach(async () => {
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
                correo: 'juan@test.com',
                creadoPor: 'user123',
                estado: 'SIN_POLIZA'
            };

            await new Vehicle(vehicleData).save();
        });

        test('debe encontrar vehículo por serie completa', async () => {
            const resultado = await VehicleController.buscarVehiculo('1HGBH41JXMN109186');

            expect(resultado.success).toBe(true);
            expect(resultado.vehiculo).toBeDefined();
            expect(resultado.vehiculo.marca).toBe('Honda');
        });

        test('debe encontrar vehículo por placas', async () => {
            const resultado = await VehicleController.buscarVehiculo('ABC-123-D');

            expect(resultado.success).toBe(true);
            expect(resultado.vehiculo).toBeDefined();
            expect(resultado.vehiculo.placas).toBe('ABC-123-D');
        });

        test('debe retornar null si no encuentra vehículo', async () => {
            const resultado = await VehicleController.buscarVehiculo('INEXISTENTE');

            expect(resultado.success).toBe(true);
            expect(resultado.vehiculo).toBeNull();
        });
    });

    describe('marcarConPoliza', () => {
        let vehicleId;

        beforeEach(async () => {
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
                correo: 'juan@test.com',
                creadoPor: 'user123',
                estado: 'SIN_POLIZA'
            };

            const vehicle = await new Vehicle(vehicleData).save();
            vehicleId = vehicle._id;
        });

        test('debe marcar vehículo como con póliza', async () => {
            const resultado = await VehicleController.marcarConPoliza(vehicleId, 'poliza123');

            expect(resultado.success).toBe(true);

            // Verificar que el estado cambió
            const vehicle = await Vehicle.findById(vehicleId);
            expect(vehicle.estado).toBe('CON_POLIZA');
        });

        test('debe fallar con vehículo inexistente', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const resultado = await VehicleController.marcarConPoliza(fakeId, 'poliza123');

            expect(resultado.success).toBe(false);
            expect(resultado.error).toBe('Vehículo no encontrado');
        });
    });

    describe('getEstadisticas', () => {
        beforeEach(async () => {
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
                    correo: 'juan@test.com',
                    creadoPor: 'user123',
                    estado: 'SIN_POLIZA'
                },
                {
                    serie: '2HGBH41JXMN109187',
                    marca: 'Honda',
                    submarca: 'Accord',
                    año: 2022,
                    color: 'Negro',
                    placas: 'XYZ-456-E',
                    titular: 'María García',
                    rfc: 'GARM900215M2A',
                    telefono: '+52 55 9876 5432',
                    correo: 'maria@test.com',
                    creadoPor: 'user456',
                    estado: 'CON_POLIZA'
                },
                {
                    serie: '3HGBH41JXMN109188',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2021,
                    color: 'Rojo',
                    placas: 'QWE-789-F',
                    titular: 'Carlos López',
                    rfc: 'LOPC800101H1B',
                    telefono: '+52 55 5555 5555',
                    correo: 'carlos@test.com',
                    creadoPor: 'user789',
                    estado: 'ELIMINADO'
                }
            ];

            await Vehicle.insertMany(vehicles);
        });

        test('debe retornar estadísticas correctas', async () => {
            const resultado = await VehicleController.getEstadisticas();

            expect(resultado.success).toBe(true);
            expect(resultado.estadisticas.sinPoliza).toBe(1);
            expect(resultado.estadisticas.conPoliza).toBe(1);
            expect(resultado.estadisticas.eliminados).toBe(1);
            expect(resultado.estadisticas.total).toBe(3);

            // Verificar estadísticas por marca
            expect(resultado.estadisticas.porMarca.length).toBeGreaterThanOrEqual(1);
            const hondaStats = resultado.estadisticas.porMarca.find(m => m._id === 'Honda');
            expect(hondaStats).toBeDefined();
            expect(hondaStats.count).toBe(2);
        });
    });
});
