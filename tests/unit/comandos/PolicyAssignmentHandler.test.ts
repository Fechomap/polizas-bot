import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
    PolicyAssignmentHandler,
    asignacionesEnProceso
} from '../../../src/comandos/comandos/PolicyAssignmentHandler';
import Vehicle from '../../../src/models/vehicle';

// Mock del bot de Telegram
const mockBot = {
    telegram: {
        sendMessage: jest.fn()
    }
};

// Mock del controlador de vehículos
jest.mock('../../../src/controllers/vehicleController', () => ({
    getVehiculosSinPoliza: jest.fn(),
    buscarVehiculo: jest.fn(),
    marcarConPoliza: jest.fn()
}));

// Mock del controlador de pólizas
jest.mock('../../../src/controllers/policyController', () => ({
    buscarPorNumeroPoliza: jest.fn(),
    crearPoliza: jest.fn()
}));

// Mock de getMainKeyboard
jest.mock('../../../src/comandos/teclados', () => ({
    getMainKeyboard: jest.fn(() => ({
        reply_markup: {
            inline_keyboard: [[{ text: 'Menú Principal', callback_data: 'menu_principal' }]]
        }
    }))
}));

const VehicleController = require('../../../src/controllers/vehicleController');
const policyController = require('../../../src/controllers/policyController');

interface MockVehiculo {
    _id: string;
    marca: string;
    submarca: string;
    año: number;
    color: string;
    serie: string;
    placas: string;
    titular: string;
    rfc?: string;
    telefono?: string;
    estado?: string;
    createdAt?: Date;
}

interface PaginationResponse {
    pagina: number;
    totalPaginas: number;
    total: number;
}

describe('PolicyAssignmentHandler', () => {
    let mongoServer: MongoMemoryServer;
    const chatId = 123456;
    const userId = 'user123';

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
        asignacionesEnProceso.clear();
    });

    describe('mostrarVehiculosDisponibles', () => {
        test('debe mostrar vehículos disponibles correctamente', async () => {
            const mockVehiculos: MockVehiculo[] = [
                {
                    _id: 'vehicle1',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2023,
                    color: 'Blanco',
                    serie: '1HGBH41JXMN109186',
                    placas: 'ABC-123-D',
                    titular: 'Juan Pérez',
                    createdAt: new Date()
                },
                {
                    _id: 'vehicle2',
                    marca: 'Honda',
                    submarca: 'Civic',
                    año: 2022,
                    color: 'Negro',
                    serie: '2HGBH41JXMN109187',
                    placas: '',
                    titular: 'María García',
                    createdAt: new Date()
                }
            ];

            VehicleController.getVehiculosSinPoliza.mockResolvedValue({
                success: true,
                vehiculos: mockVehiculos,
                pagination: {
                    pagina: 1,
                    totalPaginas: 1,
                    total: 2
                }
            });

            const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                mockBot,
                chatId,
                userId
            );

            expect(resultado).toBe(true);
            expect(VehicleController.getVehiculosSinPoliza).toHaveBeenCalledWith(10, 1);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('🚗 *VEHÍCULOS DISPONIBLES PARA ASEGURAR*'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: expect.arrayContaining([
                            [{ text: '1. Toyota Corolla', callback_data: 'asignar_vehicle1' }],
                            [{ text: '2. Honda Civic', callback_data: 'asignar_vehicle2' }]
                        ])
                    }
                })
            );
        });

        test('debe manejar lista vacía de vehículos', async () => {
            VehicleController.getVehiculosSinPoliza.mockResolvedValue({
                success: true,
                vehiculos: [],
                pagination: {
                    pagina: 1,
                    totalPaginas: 0,
                    total: 0
                }
            });

            const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                mockBot,
                chatId,
                userId
            );

            expect(resultado).toBe(true);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('No hay vehículos sin póliza disponibles')
            );
        });

        test('debe manejar error en consulta', async () => {
            VehicleController.getVehiculosSinPoliza.mockResolvedValue({
                success: false,
                error: 'Error de base de datos'
            });

            const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                mockBot,
                chatId,
                userId
            );

            expect(resultado).toBe(false);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                '❌ Error: Error de base de datos'
            );
        });

        test('debe manejar paginación correctamente', async () => {
            const mockVehiculos: MockVehiculo[] = Array.from({ length: 5 }, (_, i) => ({
                _id: `vehicle${i + 11}`,
                marca: 'Toyota',
                submarca: 'Corolla',
                año: 2023,
                color: 'Blanco',
                serie: `1HGBH41JXMN1091${i + 1}`,
                placas: `ABC-${i + 1}`,
                titular: `Usuario ${i + 1}`,
                createdAt: new Date()
            }));

            VehicleController.getVehiculosSinPoliza.mockResolvedValue({
                success: true,
                vehiculos: mockVehiculos,
                pagination: {
                    pagina: 2,
                    totalPaginas: 3,
                    total: 25
                }
            });

            const resultado = await PolicyAssignmentHandler.mostrarVehiculosPagina(
                mockBot,
                chatId,
                userId,
                2
            );

            expect(resultado).toBe(true);

            const callArgs = mockBot.telegram.sendMessage.mock.calls[0];
            const reply_markup = callArgs[2].reply_markup;

            // Verificar botones de navegación
            const botones = reply_markup.inline_keyboard;
            const navegacionBtn = botones.find(row =>
                row.some(btn => btn.text === '⬅️ Anterior' || btn.text === 'Siguiente ➡️')
            );
            expect(navegacionBtn).toBeDefined();
            expect(navegacionBtn).toEqual(
                expect.arrayContaining([
                    { text: '⬅️ Anterior', callback_data: 'vehiculos_pag_1' },
                    { text: 'Siguiente ➡️', callback_data: 'vehiculos_pag_3' }
                ])
            );
        });
    });

    describe('iniciarAsignacion', () => {
        let mockVehiculo: MockVehiculo;

        beforeEach(() => {
            mockVehiculo = {
                _id: 'vehicle123',
                marca: 'Toyota',
                submarca: 'Corolla',
                año: 2023,
                color: 'Blanco',
                serie: '1HGBH41JXMN109186',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                estado: 'SIN_POLIZA'
            };
        });

        test('debe iniciar asignación correctamente', async () => {
            // Mock de Vehicle.findById
            jest.doMock('../../../src/models/vehicle', () => ({
                findById: jest.fn().mockResolvedValue(mockVehiculo)
            }));

            Vehicle.findById = jest.fn().mockResolvedValue(mockVehiculo);

            const resultado = await PolicyAssignmentHandler.iniciarAsignacion(
                mockBot,
                chatId,
                userId,
                'vehicle123'
            );

            expect(resultado).toBe(true);
            expect(Vehicle.findById).toHaveBeenCalledWith('vehicle123');
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('VEHÍCULO SELECCIONADO'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );

            const asignacion = asignacionesEnProceso.get(userId);
            expect(asignacion.estado).toBe('esperando_numero_poliza');
            expect(asignacion.vehiculo).toEqual(mockVehiculo);
        });

        test('debe rechazar vehículo no encontrado', async () => {
            jest.doMock('../../../src/models/vehicle', () => ({
                findById: jest.fn().mockResolvedValue(null)
            }));

            Vehicle.findById = jest.fn().mockResolvedValue(null);

            const resultado = await PolicyAssignmentHandler.iniciarAsignacion(
                mockBot,
                chatId,
                userId,
                'vehicle_inexistente'
            );

            expect(resultado).toBe(false);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('❌ No se encontró el vehículo')
            );
        });

        test('debe rechazar vehículo con póliza', async () => {
            mockVehiculo.estado = 'CON_POLIZA';
            Vehicle.findById = jest.fn().mockResolvedValue(mockVehiculo);

            const resultado = await PolicyAssignmentHandler.iniciarAsignacion(
                mockBot,
                chatId,
                userId,
                'vehicle123'
            );

            expect(resultado).toBe(false);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('❌ Este vehículo ya tiene póliza asignada')
            );
        });

        test('debe limpiar asignación previa', async () => {
            // Crear asignación previa
            asignacionesEnProceso.set(userId, { test: 'data' });

            jest.doMock('../../../src/models/vehicle', () => ({
                findById: jest.fn().mockResolvedValue(mockVehiculo)
            }));

            Vehicle.findById = jest.fn().mockResolvedValue(mockVehiculo);
            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, 'vehicle123');

            const asignacion = asignacionesEnProceso.get(userId);
            expect(asignacion.test).toBeUndefined();
            expect(asignacion.estado).toBe('esperando_numero_poliza');
        });
    });

    describe('procesarMensaje', () => {
        let mockVehiculo: MockVehiculo;

        beforeEach(() => {
            mockVehiculo = {
                _id: 'vehicle123',
                marca: 'Toyota',
                submarca: 'Corolla',
                año: 2023,
                color: 'Blanco',
                serie: '1HGBH41JXMN109186',
                placas: 'ABC-123-D',
                titular: 'Juan Pérez',
                rfc: 'PEGJ850312H7A',
                telefono: '+52 55 1234 5678',
                estado: 'SIN_POLIZA'
            };

            asignacionesEnProceso.set(userId, {
                estado: 'esperando_numero_poliza',
                chatId,
                vehiculo: mockVehiculo
            });
        });

        test('debe rechazar mensaje si no hay asignación en proceso', async () => {
            asignacionesEnProceso.clear();
            const resultado = await PolicyAssignmentHandler.procesarMensaje(
                mockBot,
                { chat: { id: chatId }, text: 'ABC123' },
                userId
            );

            expect(resultado).toBe(false);
        });

        describe('Estado: esperando_numero_poliza', () => {
            test('debe procesar número de póliza correctamente', async () => {
                policyController.buscarPorNumeroPoliza.mockResolvedValue({
                    success: true,
                    policy: null
                });

                const msg = { chat: { id: chatId }, text: 'ABC123' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(policyController.buscarPorNumeroPoliza).toHaveBeenCalledWith('ABC123');
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('📅 Ingresa la fecha de inicio de vigencia')
                );

                const asignacion = asignacionesEnProceso.get(userId);
                expect(asignacion.estado).toBe('esperando_fecha_inicio');
                expect(asignacion.numeroPoliza).toBe('ABC123');
            });

            test('debe rechazar póliza duplicada', async () => {
                policyController.buscarPorNumeroPoliza.mockResolvedValue({
                    success: true,
                    policy: { _id: 'existente' }
                });

                const msg = { chat: { id: chatId }, text: 'POL_DUPLICADA' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Ya existe una póliza')
                );
                expect(asignacionesEnProceso.get(userId).estado).toBe('esperando_numero_poliza');
            });
        });

        describe('Estado: esperando_fecha_inicio', () => {
            beforeEach(() => {
                asignacionesEnProceso.set(userId, {
                    estado: 'esperando_fecha_inicio',
                    chatId,
                    vehiculo: mockVehiculo,
                    numeroPoliza: 'ABC123'
                });
            });

            test('debe procesar fecha de inicio válida', async () => {
                const msg = { chat: { id: chatId }, text: '15/01/2024' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('📅 Ingresa la fecha fin')
                );

                const asignacion = asignacionesEnProceso.get(userId);
                expect(asignacion.estado).toBe('esperando_fecha_fin');
                expect(asignacion.fechaInicio).toBeInstanceOf(Date);
            });

            test('debe rechazar fecha inválida', async () => {
                const msg = { chat: { id: chatId }, text: 'fecha_invalida' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Formato de fecha incorrecto')
                );
            });
        });

        describe('Estado: esperando_fecha_fin', () => {
            beforeEach(() => {
                asignacionesEnProceso.set(userId, {
                    estado: 'esperando_fecha_fin',
                    chatId,
                    vehiculo: mockVehiculo,
                    numeroPoliza: 'ABC123',
                    fechaInicio: new Date('2024-01-15')
                });
            });

            test('debe procesar fecha de fin válida', async () => {
                const msg = { chat: { id: chatId }, text: '15/01/2025' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('🏢 Ingresa el nombre de la aseguradora')
                );

                const asignacion = asignacionesEnProceso.get(userId);
                expect(asignacion.estado).toBe('esperando_aseguradora');
                expect(asignacion.fechaFin).toBeInstanceOf(Date);
            });

            test('debe rechazar fecha anterior a fecha de inicio', async () => {
                const msg = { chat: { id: chatId }, text: '01/01/2024' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ La fecha fin no puede ser anterior a la fecha inicio')
                );
            });
        });

        describe('Estado: esperando_aseguradora', () => {
            beforeEach(() => {
                asignacionesEnProceso.set(userId, {
                    estado: 'esperando_aseguradora',
                    chatId,
                    vehiculo: mockVehiculo,
                    numeroPoliza: 'ABC123',
                    fechaInicio: new Date('2024-01-15'),
                    fechaFin: new Date('2025-01-15')
                });
            });

            test('debe procesar aseguradora correctamente', async () => {
                const msg = { chat: { id: chatId }, text: 'MAPFRE' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('💲 Ingresa el primer pago')
                );

                const asignacion = asignacionesEnProceso.get(userId);
                expect(asignacion.estado).toBe('esperando_primer_pago');
                expect(asignacion.aseguradora).toBe('MAPFRE');
            });
        });

        describe('Estado: esperando_primer_pago', () => {
            beforeEach(() => {
                asignacionesEnProceso.set(userId, {
                    estado: 'esperando_primer_pago',
                    chatId,
                    vehiculo: mockVehiculo,
                    numeroPoliza: 'ABC123',
                    fechaInicio: new Date('2024-01-15'),
                    fechaFin: new Date('2025-01-15'),
                    aseguradora: 'MAPFRE',
                    pagos: []
                });
            });

            test('debe procesar primer pago correctamente', async () => {
                const msg = { chat: { id: chatId }, text: '5000,15/01/2024' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('¿Deseas agregar otro pago?')
                );

                const asignacion = asignacionesEnProceso.get(userId);
                expect(asignacion.estado).toBe('esperando_respuesta_mas_pagos');
                expect(asignacion.pagos).toHaveLength(1);
                expect(asignacion.pagos[0]).toMatchObject({
                    monto: 5000,
                    fecha: expect.any(Date)
                });
            });

            test('debe rechazar formato de pago inválido', async () => {
                const msg = { chat: { id: chatId }, text: 'formato_invalido' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Formato incorrecto')
                );
            });
        });

        describe('Estado: esperando_respuesta_mas_pagos', () => {
            beforeEach(() => {
                asignacionesEnProceso.set(userId, {
                    estado: 'esperando_respuesta_mas_pagos',
                    chatId,
                    vehiculo: mockVehiculo,
                    numeroPoliza: 'ABC123',
                    fechaInicio: new Date('2024-01-15'),
                    fechaFin: new Date('2025-01-15'),
                    aseguradora: 'MAPFRE',
                    pagos: [
                        {
                            monto: 5000,
                            fecha: new Date('2024-01-15')
                        }
                    ]
                });
            });

            test('debe permitir agregar otro pago', async () => {
                const msg = { chat: { id: chatId }, text: 'SI' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('💲 Ingresa el siguiente pago')
                );

                const asignacion = asignacionesEnProceso.get(userId);
                expect(asignacion.estado).toBe('esperando_siguiente_pago');
            });

            test('debe permitir finalizar pagos', async () => {
                const msg = { chat: { id: chatId }, text: 'NO' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('📋 *RESUMEN DE PÓLIZA*')
                );
            });
        });

        describe('Estado: esperando_confirmacion', () => {
            beforeEach(() => {
                asignacionesEnProceso.set(userId, {
                    estado: 'esperando_confirmacion',
                    chatId,
                    vehiculo: mockVehiculo,
                    numeroPoliza: 'ABC123',
                    fechaInicio: new Date('2024-01-15'),
                    fechaFin: new Date('2025-01-15'),
                    aseguradora: 'MAPFRE',
                    pagos: [
                        {
                            monto: 5000,
                            fecha: new Date('2024-01-15')
                        }
                    ],
                    totalPagado: 5000
                });
            });

            test('debe confirmar y crear póliza', async () => {
                policyController.crearPoliza.mockResolvedValue({
                    success: true,
                    policy: { _id: 'nueva_poliza' }
                });

                VehicleController.marcarConPoliza.mockResolvedValue({
                    success: true
                });

                const msg = { chat: { id: chatId }, text: 'CONFIRMAR' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(policyController.crearPoliza).toHaveBeenCalled();
                expect(VehicleController.marcarConPoliza).toHaveBeenCalledWith(
                    'vehicle123',
                    'nueva_poliza'
                );
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Póliza registrada correctamente')
                );
            });

            test('debe solicitar archivo PDF', async () => {
                asignacionesEnProceso.get(userId).estado = 'esperando_archivo';

                const msg = { chat: { id: chatId }, text: 'CONTINUAR' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('📎 Por favor envía un archivo PDF')
                );
            });

            test('debe manejar error en creación de póliza', async () => {
                policyController.crearPoliza.mockResolvedValue({
                    success: false,
                    error: 'Error de base de datos'
                });

                const msg = { chat: { id: chatId }, text: 'CONTINUAR' };
                const resultado = await PolicyAssignmentHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Error al crear póliza: Error de base de datos')
                );
            });
        });
    });

    describe('métodos de validación', () => {
        describe('validarFecha', () => {
            test('debe validar fechas correctas', () => {
                expect(PolicyAssignmentHandler.validarFecha('15/01/2024')).toBeInstanceOf(Date);
                expect(PolicyAssignmentHandler.validarFecha('1/1/2024')).toBeInstanceOf(Date);
                expect(PolicyAssignmentHandler.validarFecha('31/12/2023')).toBeInstanceOf(Date);
            });

            test('debe rechazar fechas inválidas', () => {
                expect(PolicyAssignmentHandler.validarFecha('32/01/2024')).toBeNull();
                expect(PolicyAssignmentHandler.validarFecha('01/13/2024')).toBeNull();
                expect(PolicyAssignmentHandler.validarFecha('2024-01-15')).toBeNull();
                expect(PolicyAssignmentHandler.validarFecha('fecha_invalida')).toBeNull();
                expect(PolicyAssignmentHandler.validarFecha('29/02/2023')).toBeNull(); // No es año bisiesto
            });

            test('debe validar año bisiesto correctamente', () => {
                expect(PolicyAssignmentHandler.validarFecha('29/02/2024')).toBeInstanceOf(Date);
                expect(PolicyAssignmentHandler.validarFecha('29/02/2023')).toBeNull();
            });
        });

        describe('validarPago', () => {
            test('debe validar pagos correctos', () => {
                const pago1 = PolicyAssignmentHandler.validarPago('5000,15/01/2024');
                expect(pago1).toMatchObject({
                    monto: 5000,
                    fecha: expect.any(Date)
                });

                const pago2 = PolicyAssignmentHandler.validarPago('1500.50,31/12/2023');
                expect(pago2).toMatchObject({
                    monto: 1500.5,
                    fecha: expect.any(Date)
                });
            });

            test('debe rechazar pagos inválidos', () => {
                expect(PolicyAssignmentHandler.validarPago('monto_invalido,15/01/2024')).toBeNull();
                expect(PolicyAssignmentHandler.validarPago('5000,fecha_invalida')).toBeNull();
                expect(PolicyAssignmentHandler.validarPago('5000')).toBeNull();
                expect(PolicyAssignmentHandler.validarPago('-100,15/01/2024')).toBeNull();
                expect(PolicyAssignmentHandler.validarPago('0,15/01/2024')).toBeNull();
            });
        });
    });

    describe('métodos utilitarios', () => {
        test('tieneAsignacionEnProceso debe retornar estado correcto', () => {
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)).toBe(false);

            asignacionesEnProceso.set(userId, { test: 'data' });
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)).toBe(true);
        });
    });
});
