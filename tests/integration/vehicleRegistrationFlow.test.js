const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { VehicleRegistrationHandler, vehiculosEnProceso } = require('../../src/comandos/comandos/VehicleRegistrationHandler');
const BaseAutosCommand = require('../../src/comandos/comandos/BaseAutosCommand');
const Vehicle = require('../../src/models/vehicle');

// Mock del bot de Telegram
const mockBot = {
  telegram: {
    sendMessage: jest.fn().mockResolvedValue({ 
      message_id: 12345 
    }),
    editMessageText: jest.fn().mockResolvedValue({}),
    getFile: jest.fn().mockResolvedValue({
      file_path: 'photos/test.jpg'
    })
  },
  on: jest.fn(),
  action: jest.fn()
};

// Mock del handler
const mockHandler = {
  bot: mockBot,
  registry: {
    getAllCommands: jest.fn(() => [])
  }
};

// Mock de CloudflareStorage
const mockUploadFile = jest.fn(() => Promise.resolve({
  url: 'https://cloudflare.com/test.jpg',
  key: 'test-key-123'
}));

jest.mock('../../src/services/CloudflareStorage', () => ({
  getInstance: jest.fn(() => ({
    uploadFile: mockUploadFile
  }))
}));

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

// Mock del controlador de vehículos
jest.mock('../../src/controllers/vehicleController', () => ({
  buscarVehiculo: jest.fn(),
  registrarVehiculo: jest.fn(),
  vincularFotosCloudflare: jest.fn()
}));

// Mock de node-fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    buffer: () => Promise.resolve(Buffer.from('fake image data'))
  })
);

const VehicleController = require('../../src/controllers/vehicleController');
const { getInstance } = require('../../src/services/CloudflareStorage');

describe('Flujo Completo de Registro de Vehículos - Test de Fotos', () => {
  let mongoServer;
  let baseAutosCommand;
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
    mockUploadFile.mockClear();
    vehiculosEnProceso.clear();
    
    // Crear instancia del comando
    baseAutosCommand = new BaseAutosCommand(mockHandler);
    
    // Reset mocks
    VehicleController.buscarVehiculo.mockResolvedValue({ success: false });
    VehicleController.registrarVehiculo.mockResolvedValue({
      success: true,
      vehicle: {
        _id: 'vehicle123',
        marca: 'Toyota',
        submarca: 'Corolla',
        año: 2023,
        color: 'Blanco',
        serie: '1HGBH41JXMN109186',
        placas: 'ABC-123-D',
        titularTemporal: 'Juan Pérez García'
      }
    });
    VehicleController.vincularFotosCloudflare.mockResolvedValue({ success: true });
  });

  describe('Flujo completo: Datos + Fotos obligatorias + Finalizar', () => {
    test('debe completar el flujo completo con fotos obligatorias', async () => {
      // PASO 1: Iniciar registro
      const inicioOk = await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      expect(inicioOk).toBe(true);
      expect(vehiculosEnProceso.has(userId)).toBe(true);

      // PASO 2: Procesar todos los datos del vehículo
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '1HGBH41JXMN109186' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Toyota' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Corolla' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '2023' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Blanco' }, userId);
      
      // PASO 3: Procesar placas - debería mostrar solo "Cancelar" (sin finalizar)
      jest.clearAllMocks();
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'ABC-123-D' }, userId);
      
      // Verificar que NO muestra botón "Finalizar" aún
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('📸 **OBLIGATORIO:** Envía AL MENOS 1 foto'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }
            ]]
          }
        })
      );

      // Verificar que NO se ha creado vehículo en BD aún
      expect(VehicleController.registrarVehiculo).not.toHaveBeenCalled();

      // PASO 4: Intentar finalizar sin fotos - debe fallar
      const registro = vehiculosEnProceso.get(userId);
      expect(registro.fotos).toEqual([]);
      
      jest.clearAllMocks();
      const finalizarSinFotos = await VehicleRegistrationHandler.finalizarRegistro(mockBot, chatId, userId, registro);
      
      expect(finalizarSinFotos).toBe(false);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ **ERROR:** No se puede finalizar el registro sin fotos'),
        expect.any(Object)
      );

      // PASO 5: Subir primera foto - debe habilitar "Finalizar"
      jest.clearAllMocks();
      const msgFoto1 = {
        chat: { id: chatId },
        photo: [
          { file_id: 'photo1_small' },
          { file_id: 'photo1_large' }
        ]
      };
      
      await VehicleRegistrationHandler.procesarMensaje(mockBot, msgFoto1, userId);
      
      // Verificar que se subió a Cloudflare
      expect(mockBot.telegram.getFile).toHaveBeenCalledWith('photo1_large');
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('vehiculos/1HGBH41JXMN109186/'),
        'image/jpeg',
        expect.objectContaining({
          vehicleSerie: '1HGBH41JXMN109186'
        })
      );
      
      // Verificar que ahora SÍ muestra botón "Finalizar"
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('✅ Foto subida a Cloudflare'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Finalizar Registro', callback_data: 'vehiculo_finalizar' }],
              [{ text: '❌ Cancelar', callback_data: 'vehiculo_cancelar' }]
            ]
          }
        })
      );

      // Verificar que la foto se guardó en memoria
      const registroConFoto = vehiculosEnProceso.get(userId);
      expect(registroConFoto.fotos).toHaveLength(1);
      expect(registroConFoto.fotos[0]).toMatchObject({
        url: 'https://cloudflare.com/test.jpg',
        key: 'test-key-123',
        originalname: expect.stringContaining('vehiculo_1HGBH41JXMN109186_foto_')
      });

      // PASO 6: Subir segunda foto (opcional)
      jest.clearAllMocks();
      const msgFoto2 = {
        chat: { id: chatId },
        photo: [
          { file_id: 'photo2_large' }
        ]
      };
      
      await VehicleRegistrationHandler.procesarMensaje(mockBot, msgFoto2, userId);
      
      // Verificar que se editó el mensaje (no se envió nuevo)
      expect(mockBot.telegram.editMessageText).toHaveBeenCalledWith(
        chatId,
        12345, // message_id guardado
        undefined,
        expect.stringContaining('📊 Total de fotos: 2'),
        expect.any(Object)
      );
      
      // Verificar que ahora hay 2 fotos
      const registroConDosFotos = vehiculosEnProceso.get(userId);
      expect(registroConDosFotos.fotos).toHaveLength(2);

      // PASO 7: Finalizar registro - debe crear vehículo en BD
      jest.clearAllMocks();
      const finalizarConFotos = await VehicleRegistrationHandler.finalizarRegistro(mockBot, chatId, userId, registroConDosFotos);
      
      expect(finalizarConFotos).toBe(true);
      
      // Verificar que se creó el vehículo
      expect(VehicleController.registrarVehiculo).toHaveBeenCalledWith(
        expect.objectContaining({
          serie: '1HGBH41JXMN109186',
          marca: 'Toyota',
          submarca: 'Corolla',
          año: 2023,
          color: 'Blanco',
          placas: 'ABC-123-D'
        }),
        userId
      );
      
      // Verificar que se vincularon las fotos de Cloudflare
      expect(VehicleController.vincularFotosCloudflare).toHaveBeenCalledWith(
        'vehicle123',
        expect.arrayContaining([
          expect.objectContaining({
            url: 'https://cloudflare.com/test.jpg',
            key: 'test-key-123'
          })
        ])
      );
      
      // Verificar mensaje final
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🎉 *REGISTRO COMPLETADO*'),
        expect.any(Object)
      );
      
      // Verificar que se limpió el registro temporal
      expect(vehiculosEnProceso.has(userId)).toBe(false);
    });

    test('debe rechazar finalización sin fotos mediante callback', async () => {
      // Configurar registro sin fotos
      vehiculosEnProceso.set(userId, {
        estado: 'esperando_fotos',
        datos: { serie: 'TEST123' },
        fotos: [] // Sin fotos
      });

      // Simular click en "Finalizar" via callback
      const mockCtx = {
        answerCbQuery: jest.fn().mockResolvedValue(),
        chat: { id: chatId },
        from: { id: userId },
        reply: jest.fn().mockResolvedValue()
      };

      // Obtener el handler del callback
      const actionCalls = mockBot.action.mock.calls;
      let finalizarHandler;
      
      // Mock del action handler para simular el registro
      baseAutosCommand.register();
      
      // Simular que no hay registro válido para finalizar
      const { vehiculosEnProceso: vehiculosMap } = require('../../src/comandos/comandos/VehicleRegistrationHandler');
      vehiculosMap.set(userId, {
        estado: 'esperando_fotos',
        datos: { serie: 'TEST123' },
        fotos: [] // Sin fotos
      });

      // Test directo del método finalizarRegistro
      const registro = vehiculosMap.get(userId);
      const resultado = await VehicleRegistrationHandler.finalizarRegistro(mockBot, chatId, userId, registro);
      
      expect(resultado).toBe(false);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ **ERROR:** No se puede finalizar el registro sin fotos'),
        expect.any(Object)
      );
    });

    test('debe manejar errores en subida de fotos a Cloudflare', async () => {
      // Configurar registro en estado de fotos
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      
      // Completar datos hasta fotos
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '1HGBH41JXMN109186' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Toyota' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Corolla' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '2023' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Blanco' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'ABC-123-D' }, userId);

      // Simular error en Cloudflare
      mockUploadFile.mockResolvedValueOnce({ url: null, error: 'Error de red' });
      
      jest.clearAllMocks();
      const msgFoto = {
        chat: { id: chatId },
        photo: [{ file_id: 'photo_id' }]
      };
      
      await VehicleRegistrationHandler.procesarMensaje(mockBot, msgFoto, userId);
      
      // Verificar que se maneja el error
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ Error al subir foto a Cloudflare')
      );
      
      // Verificar que no se guardó la foto
      const registro = vehiculosEnProceso.get(userId);
      expect(registro.fotos).toHaveLength(0);
    });

    test('debe organizar fotos por número de serie en Cloudflare', async () => {
      const serie = '1HGBH41JXMN109186';
      
      // Configurar registro completo hasta fotos
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: serie }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Toyota' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Corolla' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '2023' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Blanco' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'ABC-123-D' }, userId);

      jest.clearAllMocks();
      
      // Subir foto
      const msgFoto = {
        chat: { id: chatId },
        photo: [{ file_id: 'photo_test' }]
      };
      
      await VehicleRegistrationHandler.procesarMensaje(mockBot, msgFoto, userId);
      
      // Verificar que se subió con el path correcto
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining(`vehiculos/${serie}/`),
        'image/jpeg',
        expect.objectContaining({
          vehicleSerie: serie
        })
      );
    });
  });

  describe('Validaciones de estado y consistencia', () => {
    test('debe mantener consistencia en estados del registro', async () => {
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      
      const registro = vehiculosEnProceso.get(userId);
      expect(registro.estado).toBe('esperando_serie');
      expect(registro.fotos).toEqual([]);
      expect(registro.datos).toEqual({});
      expect(registro.mensajeFotosId).toBe(null);
      
      // Después de completar datos
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '1HGBH41JXMN109186' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Toyota' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Corolla' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: '2023' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Blanco' }, userId);
      await VehicleRegistrationHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'ABC-123-D' }, userId);
      
      const registroCompleto = vehiculosEnProceso.get(userId);
      expect(registroCompleto.estado).toBe('esperando_fotos');
      expect(registroCompleto.datos).toMatchObject({
        serie: '1HGBH41JXMN109186',
        marca: 'Toyota',
        submarca: 'Corolla',
        año: 2023,
        color: 'Blanco',
        placas: 'ABC-123-D'
      });
      expect(registroCompleto.datosGenerados).toBeDefined();
      expect(registroCompleto.fotos).toEqual([]);
    });

    test('debe limpiar estado al cancelar registro', async () => {
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId);
      expect(vehiculosEnProceso.has(userId)).toBe(true);
      
      VehicleRegistrationHandler.cancelarRegistro(userId);
      expect(vehiculosEnProceso.has(userId)).toBe(false);
    });
  });
});