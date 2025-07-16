const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { PolicyAssignmentHandler, asignacionesEnProceso } = require('../../../src/comandos/comandos/PolicyAssignmentHandler');
const Vehicle = require('../../../src/models/vehicle');

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

describe('PolicyAssignmentHandler', () => {
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
    asignacionesEnProceso.clear();
  });

  describe('mostrarVehiculosDisponibles', () => {
    test('debe mostrar vehículos disponibles correctamente', async () => {
      const mockVehiculos = [
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

      const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(mockBot, chatId, userId);

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
        pagination: { pagina: 1, totalPaginas: 1, total: 0 }
      });

      const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(mockBot, chatId, userId);

      expect(resultado).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('📋 *NO HAY VEHÍCULOS DISPONIBLES*'),
        expect.any(Object)
      );
    });

    test('debe manejar error al consultar vehículos', async () => {
      VehicleController.getVehiculosSinPoliza.mockResolvedValue({
        success: false,
        error: 'Error de base de datos'
      });

      const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(mockBot, chatId, userId);

      expect(resultado).toBe(false);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        '❌ Error: Error de base de datos'
      );
    });

    test('debe manejar paginación correctamente', async () => {
      const mockVehiculos = Array.from({ length: 5 }, (_, i) => ({
        _id: `vehicle${i + 11}`,
        marca: 'Toyota',
        submarca: 'Corolla',
        año: 2023,
        color: 'Blanco',
        serie: `SERIE${i + 11}`,
        placas: `ABC-${i + 11}-D`,
        titular: `Usuario ${i + 11}`,
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

      const resultado = await PolicyAssignmentHandler.mostrarVehiculosDisponibles(mockBot, chatId, userId, 2);

      expect(resultado).toBe(true);
      expect(VehicleController.getVehiculosSinPoliza).toHaveBeenCalledWith(10, 2);
      
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
    let mockVehiculo;

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

      const resultado = await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, 'vehicle123');

      expect(resultado).toBe(true);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('🚗 *VEHÍCULO SELECCIONADO*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancelar', callback_data: 'poliza_cancelar' }
            ]]
          }
        })
      );

      expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)).toBe(true);
      const asignacion = asignacionesEnProceso.get(userId);
      expect(asignacion.estado).toBe('esperando_numero_poliza');
      expect(asignacion.vehiculo).toEqual(mockVehiculo);
    });

    test('debe rechazar vehículo no encontrado', async () => {
      jest.doMock('../../../src/models/vehicle', () => ({
        findById: jest.fn().mockResolvedValue(null)
      }));

      const resultado = await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, 'inexistente');

      expect(resultado).toBe(false);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        chatId,
        '❌ Vehículo no encontrado.'
      );
    });

    test('debe rechazar vehículo ya asegurado', async () => {
      mockVehiculo.estado = 'CON_POLIZA';
      
      jest.doMock('../../../src/models/vehicle', () => ({
        findById: jest.fn().mockResolvedValue(mockVehiculo)
      }));

      const resultado = await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, 'vehicle123');

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

      await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, 'vehicle123');

      const asignacion = asignacionesEnProceso.get(userId);
      expect(asignacion.test).toBeUndefined();
      expect(asignacion.estado).toBe('esperando_numero_poliza');
    });
  });

  describe('procesarMensaje', () => {
    beforeEach(() => {
      // Crear asignación en proceso
      asignacionesEnProceso.set(userId, {
        estado: 'esperando_numero_poliza',
        chatId: chatId,
        vehiculo: {
          _id: 'vehicle123',
          marca: 'Toyota',
          submarca: 'Corolla'
        },
        datosPoliza: {},
        iniciado: new Date()
      });
    });

    test('debe retornar false si no hay asignación en proceso', async () => {
      const otroUserId = 'otroUser';
      const msg = { chat: { id: chatId }, text: 'test' };

      const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, otroUserId);

      expect(resultado).toBe(false);
    });

    describe('procesarNumeroPoliza', () => {
      test('debe procesar número de póliza válido', async () => {
        policyController.buscarPorNumeroPoliza.mockResolvedValue(null);

        const msg = { chat: { id: chatId }, text: 'POL-2024-001234' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(policyController.buscarPorNumeroPoliza).toHaveBeenCalledWith('POL-2024-001234');
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Número de póliza: *POL-2024-001234*'),
          expect.any(Object)
        );

        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion.datosPoliza.numeroPoliza).toBe('POL-2024-001234');
        expect(asignacion.estado).toBe('esperando_aseguradora');
      });

      test('debe rechazar número de póliza muy corto', async () => {
        const msg = { chat: { id: chatId }, text: '123' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ El número de póliza debe tener al menos 5 caracteres')
        );
      });

      test('debe rechazar número de póliza duplicado', async () => {
        policyController.buscarPorNumeroPoliza.mockResolvedValue({ _id: 'existing' });

        const msg = { chat: { id: chatId }, text: 'POL-EXISTENTE' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ Ya existe una póliza con este número')
        );
      });
    });

    describe('procesarAseguradora', () => {
      beforeEach(() => {
        const asignacion = asignacionesEnProceso.get(userId);
        asignacion.estado = 'esperando_aseguradora';
        asignacion.datosPoliza = { numeroPoliza: 'POL-123' };
      });

      test('debe procesar aseguradora válida', async () => {
        const msg = { chat: { id: chatId }, text: 'GNP Seguros' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Aseguradora: *GNP Seguros*'),
          expect.any(Object)
        );

        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion.datosPoliza.aseguradora).toBe('GNP Seguros');
        expect(asignacion.estado).toBe('esperando_agente');
      });

      test('debe rechazar aseguradora muy corta', async () => {
        const msg = { chat: { id: chatId }, text: 'A' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ La aseguradora debe tener al menos 2 caracteres')
        );
      });
    });

    describe('procesarFechaEmision', () => {
      beforeEach(() => {
        const asignacion = asignacionesEnProceso.get(userId);
        asignacion.estado = 'esperando_fecha_emision';
      });

      test('debe procesar fecha válida', async () => {
        const msg = { chat: { id: chatId }, text: '15/01/2024' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Fecha de emisión: *15/01/2024*'),
          expect.any(Object)
        );

        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion.datosPoliza.fechaEmision).toBeInstanceOf(Date);
        expect(asignacion.estado).toBe('esperando_fecha_fin');
      });

      test('debe rechazar fecha inválida', async () => {
        const msg = { chat: { id: chatId }, text: '32/13/2024' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ Fecha inválida')
        );
      });

      test('debe rechazar formato de fecha incorrecto', async () => {
        const msg = { chat: { id: chatId }, text: '2024-01-15' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ Fecha inválida')
        );
      });
    });

    describe('procesarPagos', () => {
      beforeEach(() => {
        const asignacion = asignacionesEnProceso.get(userId);
        asignacion.estado = 'esperando_pagos';
      });

      test('debe procesar pago válido', async () => {
        const msg = { chat: { id: chatId }, text: '5000,15/01/2024' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ Pago agregado: $5,000 -')
        );

        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion.datosPoliza.pagos).toHaveLength(1);
        expect(asignacion.datosPoliza.pagos[0]).toMatchObject({
          monto: 5000,
          fecha: expect.any(Date)
        });
      });

      test('debe permitir continuar sin pagos', async () => {
        const msg = { chat: { id: chatId }, text: 'CONTINUAR' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('⏭️ Pagos omitidos'),
          expect.any(Object)
        );

        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion.estado).toBe('esperando_pdf');
      });

      test('debe rechazar formato de pago inválido', async () => {
        const msg = { chat: { id: chatId }, text: 'formato_incorrecto' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('❌ Formato de pago inválido')
        );
      });

      test('debe agregar múltiples pagos', async () => {
        // Primer pago
        let msg = { chat: { id: chatId }, text: '3000,15/01/2024' };
        await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        // Segundo pago
        msg = { chat: { id: chatId }, text: '2000,15/02/2024' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        
        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion.datosPoliza.pagos).toHaveLength(2);
        expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
          chatId,
          expect.stringContaining('💰 Total pagos: 2')
        );
      });
    });

    describe('procesarPDF', () => {
      beforeEach(() => {
        const asignacion = asignacionesEnProceso.get(userId);
        asignacion.estado = 'esperando_pdf';
        asignacion.datosPoliza = {
          numeroPoliza: 'POL-123',
          aseguradora: 'GNP',
          agenteCotizador: 'Juan Agente',
          fechaEmision: new Date(),
          fechaFinCobertura: new Date()
        };
      });

      test('debe continuar sin PDF', async () => {
        policyController.crearPoliza.mockResolvedValue({
          success: true,
          poliza: { _id: 'poliza123' }
        });
        VehicleController.marcarConPoliza.mockResolvedValue(true);

        const msg = { chat: { id: chatId }, text: 'CONTINUAR' };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        expect(policyController.crearPoliza).toHaveBeenCalled();
        expect(VehicleController.marcarConPoliza).toHaveBeenCalled();
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*'),
          expect.any(Object)
        );
        expect(asignacionesEnProceso.has(userId)).toBe(false);
      });

      test('debe procesar PDF correctamente', async () => {
        policyController.crearPoliza.mockResolvedValue({
          success: true,
          poliza: { _id: 'poliza123' }
        });
        VehicleController.marcarConPoliza.mockResolvedValue(true);

        const msg = {
          chat: { id: chatId },
          document: {
            file_id: 'pdf123',
            file_name: 'poliza.pdf',
            file_size: 1024,
            mime_type: 'application/pdf'
          }
        };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

        expect(resultado).toBe(true);
        
        const asignacion = asignacionesEnProceso.get(userId);
        expect(asignacion).toBeUndefined(); // Debe estar limpia porque se finalizó
        
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          chatId,
          expect.stringContaining('✅ PDF guardado: poliza.pdf')
        );
      });

      test('debe rechazar archivo que no es PDF', async () => {
        const msg = {
          chat: { id: chatId },
          document: {
            file_id: 'doc123',
            file_name: 'archivo.txt',
            mime_type: 'text/plain'
          }
        };
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

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
        const resultado = await PolicyAssignmentHandler.procesarMensaje(mockBot, msg, userId);

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
          monto: 1500.50,
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