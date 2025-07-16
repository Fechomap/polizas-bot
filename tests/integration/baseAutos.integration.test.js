const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { VehicleRegistrationHandler } = require('../../src/comandos/comandos/VehicleRegistrationHandler');
const { PolicyAssignmentHandler } = require('../../src/comandos/comandos/PolicyAssignmentHandler');
const Vehicle = require('../../src/models/vehicle');

// Mock del bot de Telegram
const mockBot = {
  telegram: {
    sendMessage: jest.fn(),
    getFile: jest.fn()
  },
  on: jest.fn(),
  action: jest.fn(),
  command: jest.fn()
};

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
  uploadFile: jest.fn(() => Promise.resolve({
    url: 'https://example.com/test.jpg',
    key: 'test-key-123'
  }))
}));

// Mock de policyController
jest.mock('../../src/controllers/policyController', () => ({
  buscarPorNumeroPoliza: jest.fn(() => null),
  crearPoliza: jest.fn(() => Promise.resolve({
    success: true,
    poliza: { _id: 'poliza123' }
  }))
}));

describe('Base de Autos - Flujo de Integración Completo', () => {
  let mongoServer;
  const chatId = 123456;
  const userId1 = 'user123'; // Persona 1 - Registra autos
  const userId2 = 'user456'; // Persona 2 - Asigna pólizas

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
    
    // Limpiar registros activos
    VehicleRegistrationHandler.cancelarRegistro(userId1);
    VehicleRegistrationHandler.cancelarRegistro(userId2);
  });

  describe('Flujo Completo: Registro de Auto + Asignación de Póliza', () => {
    test('debe completar el flujo completo desde registro hasta asignación', async () => {
      // FASE 1: Persona 1 registra un auto
      console.log('=== FASE 1: REGISTRO DE AUTO ===');
      
      // 1. Iniciar registro
      const inicioRegistro = await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId1);
      expect(inicioRegistro).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🚗 *REGISTRO DE AUTO*'),
        expect.any(Object)
      );

      // 2. Procesar serie
      const msgSerie = { chat: { id: chatId }, text: '1HGBH41JXMN109186' };
      const resultadoSerie = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgSerie, userId1);
      expect(resultadoSerie).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('✅ Serie: *1HGBH41JXMN109186*'),
        expect.any(Object)
      );

      // 3. Procesar marca
      const msgMarca = { chat: { id: chatId }, text: 'Honda' };
      const resultadoMarca = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgMarca, userId1);
      expect(resultadoMarca).toBe(true);

      // 4. Procesar modelo
      const msgModelo = { chat: { id: chatId }, text: 'Civic' };
      const resultadoModelo = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgModelo, userId1);
      expect(resultadoModelo).toBe(true);

      // 5. Procesar año
      const msgAño = { chat: { id: chatId }, text: '2023' };
      const resultadoAño = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgAño, userId1);
      expect(resultadoAño).toBe(true);

      // 6. Procesar color
      const msgColor = { chat: { id: chatId }, text: 'Blanco' };
      const resultadoColor = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgColor, userId1);
      expect(resultadoColor).toBe(true);

      // 7. Procesar placas - esto debería crear el vehículo
      const msgPlacas = { chat: { id: chatId }, text: 'ABC-123-D' };
      const resultadoPlacas = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgPlacas, userId1);
      expect(resultadoPlacas).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('✅ *AUTO REGISTRADO*'),
        expect.any(Object)
      );

      // 8. Finalizar registro (sin fotos para simplificar)
      const msgFinalizar = { chat: { id: chatId }, text: '✅ Finalizar' };
      const resultadoFinalizar = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgFinalizar, userId1);
      expect(resultadoFinalizar).toBe(true);

      // Verificar que el vehículo se guardó correctamente
      const vehiculosEnDB = await Vehicle.find({});
      expect(vehiculosEnDB).toHaveLength(1);
      
      const vehiculo = vehiculosEnDB[0];
      expect(vehiculo.serie).toBe('1HGBH41JXMN109186');
      expect(vehiculo.marca).toBe('Honda');
      expect(vehiculo.submarca).toBe('Civic');
      expect(vehiculo.año).toBe(2023);
      expect(vehiculo.color).toBe('Blanco');
      expect(vehiculo.placas).toBe('ABC-123-D');
      expect(vehiculo.estado).toBe('SIN_POLIZA');
      expect(vehiculo.titular).toBe('Juan Pérez García');

      console.log('✅ FASE 1 COMPLETADA - Auto registrado exitosamente');

      // FASE 2: Persona 2 asigna póliza
      console.log('=== FASE 2: ASIGNACIÓN DE PÓLIZA ===');

      // 1. Mostrar vehículos disponibles
      const mostrarVehiculos = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(mockBot, chatId, userId2);
      expect(mostrarVehiculos).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🚗 *VEHÍCULOS DISPONIBLES PARA ASEGURAR*'),
        expect.any(Object)
      );

      // 2. Iniciar asignación para el vehículo creado
      const iniciarAsignacion = await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId2, vehiculo._id);
      expect(iniciarAsignacion).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🚗 *AUTO SELECCIONADO*'),
        expect.any(Object)
      );

      // 3. Procesar número de póliza
      const msgNumPoliza = { chat: { id: chatId }, text: 'POL-2024-001234' };
      const resultadoNumPoliza = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgNumPoliza, userId2);
      expect(resultadoNumPoliza).toBe(true);

      // 4. Procesar aseguradora
      const msgAseguradora = { chat: { id: chatId }, text: 'GNP Seguros' };
      const resultadoAseguradora = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgAseguradora, userId2);
      expect(resultadoAseguradora).toBe(true);

      // 5. Procesar agente
      const msgAgente = { chat: { id: chatId }, text: 'María González' };
      const resultadoAgente = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgAgente, userId2);
      expect(resultadoAgente).toBe(true);

      // 6. Procesar fecha emisión
      const msgFechaEmision = { chat: { id: chatId }, text: '15/01/2024' };
      const resultadoFechaEmision = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgFechaEmision, userId2);
      expect(resultadoFechaEmision).toBe(true);

      // 7. Procesar fecha fin
      const msgFechaFin = { chat: { id: chatId }, text: '15/01/2025' };
      const resultadoFechaFin = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgFechaFin, userId2);
      expect(resultadoFechaFin).toBe(true);

      // 8. Saltar pagos
      const msgContinuar = { chat: { id: chatId }, text: 'CONTINUAR' };
      const resultadoContinuar = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgContinuar, userId2);
      expect(resultadoContinuar).toBe(true);

      // 9. Finalizar sin PDF
      const msgFinalizarPoliza = { chat: { id: chatId }, text: 'CONTINUAR' };
      const resultadoFinalizarPoliza = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgFinalizarPoliza, userId2);
      expect(resultadoFinalizarPoliza).toBe(true);

      // Verificar que el vehículo cambió de estado
      const vehiculoActualizado = await Vehicle.findById(vehiculo._id);
      expect(vehiculoActualizado.estado).toBe('CON_POLIZA');

      console.log('✅ FASE 2 COMPLETADA - Póliza asignada exitosamente');
      console.log('🎉 FLUJO COMPLETO EXITOSO');

      // Verificaciones finales
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*'),
        expect.any(Object)
      );
    });

    test('debe manejar múltiples registros simultáneos de diferentes usuarios', async () => {
      const userId3 = 'user789';
      
      // Iniciar registros simultáneos
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId1);
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId3);
      
      // Verificar que ambos tienen registros activos
      expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId1)).toBe(true);
      expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId3)).toBe(true);
      
      // Procesar serie para usuario 1
      const msgSerie1 = { chat: { id: chatId }, text: '1HGBH41JXMN109186' };
      const resultado1 = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgSerie1, userId1);
      expect(resultado1).toBe(true);
      
      // Procesar serie diferente para usuario 3
      const msgSerie3 = { chat: { id: chatId }, text: '2HGBH41JXMN109187' };
      const resultado3 = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgSerie3, userId3);
      expect(resultado3).toBe(true);
      
      // Verificar que los registros son independientes
      const stats = VehicleRegistrationHandler.getEstadisticasRegistros();
      expect(stats.registrosActivos).toBe(2);
    });

    test('debe validar que no se pueda registrar serie duplicada', async () => {
      // Crear vehículo existente
      const vehiculoExistente = new Vehicle({
        serie: '1HGBH41JXMN109186',
        marca: 'Toyota',
        submarca: 'Corolla',
        año: 2022,
        color: 'Negro',
        placas: 'XYZ-456-E',
        titular: 'María García',
        rfc: 'GARM900215M2A',
        telefono: '+52 55 9876 5432',
        correo: 'maria@test.com',
        creadoPor: 'user999',
        estado: 'SIN_POLIZA'
      });
      await vehiculoExistente.save();

      // Intentar registrar con misma serie
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId1);
      
      const msgSerie = { chat: { id: chatId }, text: '1HGBH41JXMN109186' };
      const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgSerie, userId1);
      
      expect(resultado).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ Ya existe un vehículo registrado con esta serie'),
        expect.any(Object)
      );
    });

    test('debe validar formato de fechas en asignación de póliza', async () => {
      // Crear vehículo para asegurar
      const vehiculo = new Vehicle({
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
      });
      await vehiculo.save();

      // Iniciar asignación y llegar hasta fecha
      await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId2, vehiculo._id);
      
      // Procesar datos hasta fecha emisión
      await PolicyAssignmentHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'POL-123' }, userId2);
      await PolicyAssignmentHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'GNP' }, userId2);
      await PolicyAssignmentHandler.procesarMensaje(mockBot, { chat: { id: chatId }, text: 'Agente Test' }, userId2);
      
      // Probar fecha inválida
      const msgFechaInvalida = { chat: { id: chatId }, text: '32/13/2024' };
      const resultadoInvalido = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgFechaInvalida, userId2);
      
      expect(resultadoInvalido).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ Fecha inválida'),
        expect.any(Object)
      );
    });
  });

  describe('Manejo de Errores y Casos Edge', () => {
    test('debe manejar cancelación de registro', async () => {
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId1);
      
      const msgCancelar = { chat: { id: chatId }, text: '❌ Cancelar' };
      const resultado = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgCancelar, userId1);
      
      expect(resultado).toBe(true);
      expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId1)).toBe(false);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        '❌ Cancelado.',
        expect.any(Object)
      );
    });

    test('debe manejar cancelación de asignación', async () => {
      // Crear vehículo
      const vehiculo = new Vehicle({
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
      });
      await vehiculo.save();

      await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId2, vehiculo._id);
      
      const msgCancelar = { chat: { id: chatId }, text: '❌ Cancelar' };
      const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msgCancelar, userId2);
      
      expect(resultado).toBe(true);
      expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId2)).toBe(false);
    });

    test('debe validar VIN de 17 caracteres', async () => {
      await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId1);
      
      // VIN muy corto
      const msgVinCorto = { chat: { id: chatId }, text: '123456' };
      const resultadoCorto = await VehicleRegistrationHandler.procesarMensaje(mockBot, msgVinCorto, userId1);
      
      expect(resultadoCorto).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('❌ El número de serie debe tener exactamente 17 caracteres'),
        expect.any(Object)
      );
    });
  });
});