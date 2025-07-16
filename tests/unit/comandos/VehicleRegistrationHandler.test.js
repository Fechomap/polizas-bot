const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { VehicleRegistrationHandler, vehiculosEnProceso } = require('../../../src/comandos/comandos/VehicleRegistrationHandler');
const Vehicle = require('../../../src/models/vehicle');

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
  uploadFile: jest.fn(() => Promise.resolve({
    url: 'https://example.com/test.jpg',
    key: 'test-key-123'
  }))
}));

// Mock del controlador de vehículos
jest.mock('../../../src/controllers/vehicleController', () => ({
  buscarVehiculo: jest.fn(),
  registrarVehiculo: jest.fn(),
  agregarFotos: jest.fn()
}));

const VehicleController = require('../../../src/controllers/vehicleController');

describe('VehicleRegistrationHandler', () => {
  let mongoServer;
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
      const resultado = await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      
      expect(resultado).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🚗 *REGISTRO DE AUTO*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }
            ]]
          }
        })
      );
      
      expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId)).toBe(true);
    });

    test('debe limpiar registro previo si existe', async () => {
      // Crear registro previo
      vehiculosEnProceso.set(userId, { test: 'data' });
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
      
      const resultado = await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      
      expect(resultado).toBe(false);
    });
  });

  describe('procesarMensaje', () => {
    beforeEach(async () => {
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      jest.clearAllMocks();
    });

    test('debe retornar false si no hay registro en proceso', async () => {
      const otroUserId = 'otroUser';
      const msg = { chat: { id: chatId }, text: 'test' };
      
      const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, otroUserId);
      
      expect(resultado).toBe(false);
    });

    describe('procesarSerie', () => {
      test('debe procesar serie válida correctamente', async () => {
        VehicleController.buscarVehiculo.mockResolvedValue({ success: false });
        
        const msg = { chat: { id: chatId }, text: '1HGBH41JXMN109186' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Serie: *1HGBH41JXMN109186*'),
          expect.any(Object)
        );
        
        const registro = vehiculosEnProceso.get(userId);
        expect(registro.datos.serie).toBe('1HGBH41JXMN109186');
        expect(registro.estado).toBe('esperando_marca');
      });

      test('debe rechazar serie con longitud incorrecta', async () => {
        const msg = { chat: { id: chatId }, text: '123456' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ El número de serie debe tener exactamente 17 caracteres'),
          expect.any(Object)
        );
      });

      test('debe rechazar serie duplicada', async () => {
        VehicleController.buscarVehiculo.mockResolvedValue({
          success: true,
          vehiculo: {
            marca: 'Toyota',
            submarca: 'Corolla',
            año: 2022,
            color: 'Negro',
            titular: 'Juan Test'
          }
        });
        
        const msg = { chat: { id: chatId }, text: '1HGBH41JXMN109186' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
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
        const msgSerie = { chat: { id: chatId }, text: '1HGBH41JXMN109186' };
        await VehicleRegistrationHandler.procesarMensaje(mockBot, msgSerie, userId);
        jest.clearAllMocks();
      });

      test('debe procesar marca válida', async () => {
        const msg = { chat: { id: chatId }, text: 'Toyota' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Marca: *Toyota*'),
          expect.any(Object)
        );
        
        const registro = vehiculosEnProceso.get(userId);
        expect(registro.datos.marca).toBe('Toyota');
        expect(registro.estado).toBe('esperando_submarca');
      });

      test('debe rechazar marca muy corta', async () => {
        const msg = { chat: { id: chatId }, text: 'A' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
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
        registro.datos = { serie: 'TEST123', marca: 'Toyota', submarca: 'Corolla' };
      });

      test('debe procesar año válido', async () => {
        const msg = { chat: { id: chatId }, text: '2023' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Año: *2023*'),
          expect.any(Object)
        );
        
        const registro = vehiculosEnProceso.get(userId);
        expect(registro.datos.año).toBe(2023);
      });

      test('debe rechazar año futuro inválido', async () => {
        const añoFuturo = new Date().getFullYear() + 5;
        const msg = { chat: { id: chatId }, text: añoFuturo.toString() };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ El año debe ser un número válido'),
          expect.any(Object)
        );
      });

      test('debe rechazar año muy antiguo', async () => {
        const msg = { chat: { id: chatId }, text: '1800' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ El año debe ser un número válido'),
          expect.any(Object)
        );
      });
    });

    describe('procesarPlacas', () => {
      beforeEach(async () => {
        // Configurar registro hasta placas
        const registro = vehiculosEnProceso.get(userId);
        registro.estado = 'esperando_placas';
        registro.datos = {
          serie: '1HGBH41JXMN109186',
          marca: 'Toyota',
          submarca: 'Corolla',
          año: 2023,
          color: 'Blanco'
        };
        
        VehicleController.registrarVehiculo.mockResolvedValue({
          success: true,
          vehicle: {
            _id: 'vehicleId123',
            serie: '1HGBH41JXMN109186',
            marca: 'Toyota',
            submarca: 'Corolla',
            año: 2023,
            color: 'Blanco',
            placas: 'ABC-123-D'
          },
          datosGenerados: {
            titular: 'Juan Pérez García',
            telefono: '+52 55 1234 5678'
          }
        });
      });

      test('debe procesar placas y crear vehículo', async () => {
        const msg = { chat: { id: chatId }, text: 'ABC-123-D' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(VehicleController.registrarVehiculo).toHaveBeenCalledWith(
          expect.objectContaining({
            serie: '1HGBH41JXMN109186',
            placas: 'ABC-123-D'
          }),
          userId
        );
        
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ *AUTO REGISTRADO*'),
          expect.objectContaining({
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Finalizar', callback_data: 'vehiculo_finalizar' }],
                [{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]
              ]
            }
          })
        );
        
        const registro = vehiculosEnProceso.get(userId);
        expect(registro.estado).toBe('esperando_fotos');
        expect(registro.vehicleId).toBe('vehicleId123');
      });

      test('debe manejar "SIN PLACAS"', async () => {
        const msg = { chat: { id: chatId }, text: 'SIN PLACAS' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(VehicleController.registrarVehiculo).toHaveBeenCalledWith(
          expect.objectContaining({
            placas: ''
          }),
          userId
        );
      });

      test('debe manejar error en registro de vehículo', async () => {
        VehicleController.registrarVehiculo.mockResolvedValue({
          success: false,
          error: 'Error de prueba'
        });
        
        const msg = { chat: { id: chatId }, text: 'ABC-123-D' };
        const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
        
        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ Error al registrar vehículo: Error de prueba')
        );
        expect(vehiculosEnProceso.has(userId)).toBe(false);
      });
    });
  });

  describe('procesarFotos', () => {
    beforeEach(async () => {
      // Configurar registro en estado de fotos
      vehiculosEnProceso.set(userId, {
        estado: 'esperando_fotos',
        vehicleId: 'vehicleId123',
        vehicleData: { _id: 'vehicleId123', marca: 'Toyota' },
        datosGenerados: { titular: 'Juan Test' }
      });
    });

    test('debe procesar foto correctamente', async () => {
      VehicleController.agregarFotos.mockResolvedValue({
        success: true,
        totalFotos: 1
      });
      
      mockBot.telegram.getFile.mockResolvedValue({
        file_path: 'photos/file123.jpg'
      });
      
      // Mock de fetch global para la descarga de la foto
      global.fetch = jest.fn().mockResolvedValue({
        buffer: () => Promise.resolve(Buffer.from('fake image data'))
      });
      
      const msg = {
        chat: { id: chatId },
        photo: [
          { file_id: 'photo_small' },
          { file_id: 'photo_large' }
        ]
      };
      
      const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
      
      expect(resultado).toBe(true);
      expect(mockBot.telegram.getFile).toHaveBeenCalledWith('photo_large');
      expect(VehicleController.agregarFotos).toHaveBeenCalledWith(
        'vehicleId123',
        expect.arrayContaining([
          expect.objectContaining({
            originalname: expect.stringMatching(/foto_\d+\.jpg/),
            mimetype: 'image/jpeg'
          })
        ])
      );
      
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('✅ Foto guardada exitosamente')
      );
    });

    test('debe rechazar mensaje sin foto', async () => {
      const msg = { chat: { id: chatId }, text: 'mensaje sin foto' };
      const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
      
      expect(resultado).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('📸 Por favor envía una foto del vehículo')
      );
    });

    test('debe manejar error al guardar foto', async () => {
      VehicleController.agregarFotos.mockResolvedValue({
        success: false,
        error: 'Error al subir'
      });
      
      mockBot.telegram.getFile.mockResolvedValue({
        file_path: 'photos/file123.jpg'
      });
      
      global.fetch = jest.fn().mockResolvedValue({
        buffer: () => Promise.resolve(Buffer.from('fake image data'))
      });
      
      const msg = {
        chat: { id: chatId },
        photo: [{ file_id: 'photo_id' }]
      };
      
      const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msg, userId);
      
      expect(resultado).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ Error al guardar foto: Error al subir')
      );
    });
  });

  describe('finalizarRegistro', () => {
    test('debe finalizar registro exitosamente con fotos', async () => {
      const registro = {
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
      
      const resultado = await VehicleRegistrationHandler.finalizarRegistro(mockBot, chatId, userId, registro);
      
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
      
      const registro = { vehicleData: { _id: 'test' } };
      const resultado = await VehicleRegistrationHandler.finalizarRegistro(mockBot, chatId, userId, registro);
      
      expect(resultado).toBe(true);
    });
  });

  describe('métodos utilitarios', () => {
    test('tieneRegistroEnProceso debe retornar estado correcto', () => {
      expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId)).toBe(false);
      
      vehiculosEnProceso.set(userId, { test: 'data' });
      expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId)).toBe(true);
    });

    test('cancelarRegistro debe limpiar estado', () => {
      vehiculosEnProceso.set(userId, { test: 'data' });
      
      VehicleRegistrationHandler.cancelarRegistro(userId);
      expect(vehiculosEnProceso.has(userId)).toBe(false);
    });

    test('getEstadisticasRegistros debe retornar datos correctos', () => {
      vehiculosEnProceso.set('user1', {
        estado: 'esperando_serie',
        iniciado: new Date(),
        datos: { marca: 'Toyota' }
      });
      vehiculosEnProceso.set('user2', {
        estado: 'esperando_marca',
        iniciado: new Date(),
        datos: {}
      });
      
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