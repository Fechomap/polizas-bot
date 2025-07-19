import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
    VehicleRegistrationHandler,
    vehiculosEnProceso
} from '../../../src/comandos/comandos/VehicleRegistrationHandler';
import Vehicle from '../../../src/models/vehicle';
import { Context } from 'telegraf';

// Mock del bot de Telegram
const mockBot = {
    telegram: {
        sendMessage: jest.fn(),
        getFile: jest.fn()
    }
};

// Mock del generador de datos mexicanos
jest.mock('../../../src/utils/mexicanDataGenerator', () => ({
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
jest.mock('../../../src/services/CloudflareStorage', () => ({
    uploadFile: jest.fn(() =>
        Promise.resolve({
            url: 'https://example.com/test.jpg',
            key: 'test-key-123'
        })
    )
}));

// Mock del controlador de vehículos
jest.mock('../../../src/controllers/vehicleController', () => ({
    buscarVehiculo: jest.fn(),
    registrarVehiculo: jest.fn(),
    agregarFotos: jest.fn()
}));

const VehicleController = require('../../../src/controllers/vehicleController');

interface VehiculoDatos {
    serie?: string;
    marca?: string;
    submarca?: string;
    año?: number;
    color?: string;
    placas?: string;
    titular?: string;
    rfc?: string;
    telefono?: string;
}

interface VehiculoRegistro {
    estado?: string;
    chatId?: number;
    datos?: VehiculoDatos;
    fotos?: Array<{
        url: string;
        key: string;
        originalname?: string;
    }>;
    test?: string;
    iniciado?: Date;
}

interface TelegramMessage {
    chat: {
        id: number;
    };
    text?: string;
    photo?: Array<{
        file_id: string;
    }>;
    document?: {
        file_id: string;
        file_name?: string;
    };
    message_thread_id?: number;
}

describe('VehicleRegistrationHandler', () => {
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
        vehiculosEnProceso.clear();
    });

    describe('iniciarRegistro', () => {
        test('debe iniciar registro exitosamente', async () => {
            const resultado = await VehicleRegistrationHandler.iniciarRegistro(
                mockBot,
                chatId,
                userId
            );

            expect(resultado).toBe(true);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('🚗 *REGISTRO DE AUTO*'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]
                        ]
                    }
                })
            );

            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId)).toBe(true);
        });

        test('debe limpiar registro previo si existe', async () => {
            // Crear registro previo
            vehiculosEnProceso.set(userId, { test: 'data' } as VehiculoRegistro);
            expect(vehiculosEnProceso.has(userId)).toBe(true);

            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);

            // Debe tener un nuevo registro, no el anterior
            const registro = vehiculosEnProceso.get(userId);
            expect(registro).toBeDefined();
            expect(registro.test).toBeUndefined();
        });

        test('debe manejar errores en inicio de registro', async () => {
            // Simular error en sendMessage
            mockBot.telegram.sendMessage.mockRejectedValueOnce(new Error('Error de red'));

            const resultado = await VehicleRegistrationHandler.iniciarRegistro(
                mockBot,
                chatId,
                userId
            );

            expect(resultado).toBe(false);
        });
    });

    describe('procesarMensaje', () => {
        beforeEach(async () => {
            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
            jest.clearAllMocks();
        });

        test('debe rechazar mensaje si no hay registro en proceso', async () => {
            vehiculosEnProceso.clear();
            const msg = { chat: { id: chatId }, text: 'texto' } as TelegramMessage;
            const resultado = await VehicleRegistrationHandler.procesarMensaje(
                mockBot,
                msg,
                userId
            );

            expect(resultado).toBe(false);
        });

        test('debe rechazar mensaje para otro usuario', async () => {
            const otroUserId = 'otro_user';
            const msg = { chat: { id: chatId }, text: 'texto' } as TelegramMessage;
            const resultado = await VehicleRegistrationHandler.procesarMensaje(
                mockBot,
                msg,
                otroUserId
            );

            expect(resultado).toBe(false);
        });

        describe('procesarSerie', () => {
            test('debe procesar serie válida correctamente', async () => {
                VehicleController.buscarVehiculo.mockResolvedValue({ success: false });

                const msg = { chat: { id: chatId }, text: '1HGBH41JXMN109186' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Serie validada correctamente'),
                    expect.any(Object)
                );

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.datos?.serie).toBe('1HGBH41JXMN109186');
                expect(registro.estado).toBe('esperando_marca');
            });

            test('debe rechazar serie con longitud incorrecta', async () => {
                const msg = { chat: { id: chatId }, text: '123456' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining(
                        '❌ El número de serie debe tener exactamente 17 caracteres'
                    ),
                    expect.any(Object)
                );
            });

            test('debe rechazar serie duplicada', async () => {
                VehicleController.buscarVehiculo.mockResolvedValue({
                    success: true,
                    vehiculo: {
                        marca: 'Toyota',
                        submarca: 'Corolla'
                    }
                });

                const msg = { chat: { id: chatId }, text: '1HGBH41JXMN109186' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Ya existe un vehículo registrado con esta serie'),
                    expect.any(Object)
                );
            });
        });

        describe('procesarMarca', () => {
            beforeEach(async () => {
                // Avanzar al estado de marca
                VehicleController.buscarVehiculo.mockResolvedValue({ success: false });
                const msg = { chat: { id: chatId }, text: '1HGBH41JXMN109186' } as TelegramMessage;
                await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
                jest.clearAllMocks();

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.estado).toBe('esperando_marca');
            });

            test('debe procesar marca válida correctamente', async () => {
                const msg = { chat: { id: chatId }, text: 'Toyota' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Marca registrada correctamente'),
                    expect.any(Object)
                );

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.datos?.marca).toBe('Toyota');
                expect(registro.estado).toBe('esperando_submarca');
            });

            test('debe rechazar marca muy corta', async () => {
                const msg = { chat: { id: chatId }, text: 'A' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ La marca debe tener al menos 2 caracteres'),
                    expect.any(Object)
                );
            });
        });

        describe('procesarAño', () => {
            beforeEach(async () => {
                // Avanzar al estado de año
                const registro = vehiculosEnProceso.get(userId);
                registro.estado = 'esperando_año';
                registro.datos = {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Toyota',
                    submarca: 'Corolla'
                };
            });

            test('debe procesar año válido correctamente', async () => {
                const msg = { chat: { id: chatId }, text: '2023' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Año registrado correctamente'),
                    expect.any(Object)
                );

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.datos?.año).toBe(2023);
            });

            test('debe rechazar año inválido', async () => {
                const msg = { chat: { id: chatId }, text: 'año_inválido' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Formato de año incorrecto'),
                    expect.any(Object)
                );
            });

            test('debe rechazar año futuro', async () => {
                const añoFuturo = new Date().getFullYear() + 2;
                const msg = { chat: { id: chatId }, text: añoFuturo.toString() } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ El año no puede ser futuro'),
                    expect.any(Object)
                );
            });

            test('debe rechazar año muy antiguo', async () => {
                const msg = { chat: { id: chatId }, text: '1900' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ El año no puede ser anterior a 1950'),
                    expect.any(Object)
                );
            });
        });

        describe('procesarPlacas', () => {
            beforeEach(async () => {
                // Avanzar al estado de placas
                const registro = vehiculosEnProceso.get(userId);
                registro.estado = 'esperando_placas';
                registro.datos = {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2023,
                    color: 'Blanco'
                };
            });

            test('debe procesar placas correctamente', async () => {
                const msg = { chat: { id: chatId }, text: 'ABC-123-D' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Placas registradas correctamente'),
                    expect.any(Object)
                );

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.datos?.placas).toBe('ABC-123-D');
            });

            test('debe aceptar "PERMISO" como placas válidas', async () => {
                const msg = { chat: { id: chatId }, text: 'PERMISO' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Permiso registrado correctamente'),
                    expect.any(Object)
                );

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.datos?.placas).toBe('PERMISO');
            });
        });

        describe('procesarFotos', () => {
            beforeEach(async () => {
                // Avanzar al estado de fotos
                const registro = vehiculosEnProceso.get(userId);
                registro.estado = 'esperando_fotos';
                registro.datos = {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2023,
                    color: 'Blanco',
                    placas: 'ABC-123-D'
                };
                registro.fotos = [];
            });

            test('debe procesar foto correctamente', async () => {
                const fileBuffer = Buffer.from('fake image data');
                mockBot.telegram.getFile.mockResolvedValue({
                    file_path: 'photos/file_123.jpg',
                    buffer: () => Promise.resolve(fileBuffer)
                });

                const CloudflareStorage = require('../../../src/services/CloudflareStorage');
                CloudflareStorage.uploadFile.mockResolvedValue({
                    url: 'https://example.com/test.jpg',
                    key: 'test-key-123'
                });

                const msg = {
                    chat: { id: chatId },
                    photo: [{ file_id: 'photo_id' }]
                } as TelegramMessage;

                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.getFile).toHaveBeenCalledWith('photo_id');
                expect(CloudflareStorage.uploadFile).toHaveBeenCalledWith(
                    fileBuffer,
                    expect.any(String)
                );
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ Foto recibida y guardada'),
                    expect.any(Object)
                );

                const registro = vehiculosEnProceso.get(userId);
                expect(registro.fotos).toHaveLength(1);
                expect(registro.fotos?.[0]).toMatchObject({
                    url: 'https://example.com/test.jpg',
                    key: 'test-key-123'
                });
            });

            test('debe continuar cuando se recibe el mensaje FINALIZAR', async () => {
                const registro = vehiculosEnProceso.get(userId);
                registro.fotos = [
                    {
                        url: 'https://example.com/test.jpg',
                        key: 'test-key-123'
                    }
                ];

                const msg = { chat: { id: chatId }, text: 'FINALIZAR' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('📝 *DATOS DEL TITULAR*'),
                    expect.any(Object)
                );
            });

            test('debe rechazar finalización sin fotos', async () => {
                const msg = { chat: { id: chatId }, text: 'FINALIZAR' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Debes enviar al menos una foto'),
                    expect.any(Object)
                );
            });

            test('debe manejar error en procesamiento de foto', async () => {
                mockBot.telegram.getFile.mockResolvedValue({
                    file_path: 'photos/file_123.jpg',
                    buffer: () => Promise.reject(new Error('Error al obtener archivo'))
                });

                const msg = {
                    chat: { id: chatId },
                    photo: [{ file_id: 'photo_id' }]
                } as TelegramMessage;

                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Error al guardar foto')
                );
            });
        });

        describe('procesarConfirmacion', () => {
            beforeEach(async () => {
                // Avanzar al estado de confirmación final
                const registro = vehiculosEnProceso.get(userId);
                registro.estado = 'esperando_confirmacion';
                registro.datos = {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2023,
                    color: 'Blanco',
                    placas: 'ABC-123-D',
                    titular: 'Juan Pérez',
                    rfc: 'PEGJ850312H7A',
                    telefono: '+52 55 1234 5678'
                };
                registro.fotos = [
                    {
                        url: 'https://example.com/test.jpg',
                        key: 'test-key-123'
                    }
                ];
            });

            test('debe confirmar y registrar vehículo correctamente', async () => {
                VehicleController.registrarVehiculo.mockResolvedValue({
                    success: true,
                    vehiculo: { _id: 'vehicle_id_123' }
                });

                VehicleController.agregarFotos.mockResolvedValue({ success: true });

                const msg = { chat: { id: chatId }, text: 'CONFIRMAR' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(VehicleController.registrarVehiculo).toHaveBeenCalledWith(
                    expect.objectContaining({
                        serie: '1HGBH41JXMN109186',
                        marca: 'Toyota'
                    })
                );
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('✅ *VEHÍCULO REGISTRADO*'),
                    expect.any(Object)
                );
                expect(vehiculosEnProceso.has(userId)).toBe(false);
            });

            test('debe manejar error en registro de vehículo', async () => {
                VehicleController.registrarVehiculo.mockResolvedValue({
                    success: false,
                    error: 'Error de base de datos'
                });

                const msg = { chat: { id: chatId }, text: 'CONFIRMAR' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('❌ Error al registrar vehículo: Error de base de datos')
                );
            });

            test('debe permitir edición de datos', async () => {
                const msg = { chat: { id: chatId }, text: 'EDITAR' } as TelegramMessage;
                const resultado = await VehicleRegistrationHandler.procesarMensaje(
                    mockBot,
                    msg,
                    userId
                );

                expect(resultado).toBe(true);
                expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                    chatId,
                    expect.stringContaining('🖋 *EDICIÓN DE DATOS*'),
                    expect.any(Object)
                );
            });
        });

        test('debe manejar error en subida de archivo', async () => {
            const registro = vehiculosEnProceso.get(userId);
            registro.estado = 'esperando_fotos';
            
            mockBot.telegram.getFile.mockResolvedValue({
                file_path: 'photos/file_123.jpg',
                buffer: () => Promise.resolve(Buffer.from('fake image data'))
            });

            const CloudflareStorage = require('../../../src/services/CloudflareStorage');
            CloudflareStorage.uploadFile.mockRejectedValue(new Error('Error al subir'));

            const msg = {
                chat: { id: chatId },
                photo: [{ file_id: 'photo_id' }]
            } as TelegramMessage;

            const resultado = await VehicleRegistrationHandler.procesarMensaje(
                mockBot,
                msg,
                userId
            );

            expect(resultado).toBe(true);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('❌ Error al guardar foto: Error al subir')
            );
        });
    });

    describe('finalizarRegistro', () => {
        test('debe finalizar registro exitosamente con fotos', async () => {
            const registro: VehiculoRegistro = {
                datos: {
                    serie: '1HGBH41JXMN109186',
                    marca: 'Toyota',
                    submarca: 'Corolla',
                    año: 2023,
                    color: 'Blanco',
                    placas: 'ABC-123-D'
                },
                fotos: [
                    {
                        url: 'https://cloudflare.com/test.jpg',
                        key: 'test-key-123',
                        originalname: 'vehiculo_test_foto_1.jpg'
                    }
                ]
            };

            const resultado = await VehicleRegistrationHandler.finalizarRegistro(
                mockBot,
                chatId,
                userId,
                registro
            );

            expect(resultado).toBe(true);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('🎉 *REGISTRO COMPLETADO*'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
            expect(vehiculosEnProceso.has(userId)).toBe(false);
        });

        test('debe manejar error en finalización', async () => {
            mockBot.telegram.sendMessage.mockRejectedValueOnce(new Error('Error de red'));

            const registro = { vehicleData: { _id: 'test' } } as unknown as VehiculoRegistro;
            const resultado = await VehicleRegistrationHandler.finalizarRegistro(
                mockBot,
                chatId,
                userId,
                registro
            );

            expect(resultado).toBe(true);
        });
    });

    describe('métodos utilitarios', () => {
        test('tieneRegistroEnProceso debe retornar estado correcto', () => {
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId)).toBe(false);

            vehiculosEnProceso.set(userId, { test: 'data' } as VehiculoRegistro);
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId)).toBe(true);
        });

        test('cancelarRegistro debe limpiar estado', () => {
            vehiculosEnProceso.set(userId, { test: 'data' } as VehiculoRegistro);

            VehicleRegistrationHandler.cancelarRegistro(userId);
            expect(vehiculosEnProceso.has(userId)).toBe(false);
        });

        test('getEstadisticasRegistros debe retornar datos correctos', () => {
            vehiculosEnProceso.set('user1', {
                estado: 'esperando_serie',
                iniciado: new Date(),
                datos: { marca: 'Toyota' }
            } as VehiculoRegistro);
            
            vehiculosEnProceso.set('user2', {
                estado: 'esperando_marca',
                iniciado: new Date(),
                datos: {}
            } as VehiculoRegistro);

            const stats = VehicleRegistrationHandler.getEstadisticasRegistros();

            expect(stats.registrosActivos).toBe(2);
            expect(stats.registros).toHaveLength(2);
            expect(stats.registros[0]).toMatchObject({
                userId: 'user1',
                estado: 'esperando_serie',
                marca: 'Toyota'
            });
            expect(stats.registros[1]).toMatchObject({
                userId: 'user2',
                estado: 'esperando_marca',
                marca: 'Sin especificar'
            });
        });
    });
});
