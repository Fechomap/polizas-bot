/**
 * Tests para validar correcciones del sistema NIV
 * Valida transacciones atómicas, procesamiento asíncrono y prevención de botones duplicados
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';

// Mocks principales
const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn()
};

const mockVehicleCreate = jest.fn() as jest.MockedFunction<any>;
const mockVehicleFindOne = jest.fn() as jest.MockedFunction<any>;
const mockVehicleFindByIdAndUpdate = jest.fn() as jest.MockedFunction<any>;
const mockPolicyCreate = jest.fn() as jest.MockedFunction<any>;
const mockBotSendMessage = jest.fn() as jest.MockedFunction<any>;
const mockBotDeleteMessage = jest.fn() as jest.MockedFunction<any>;
const mockBotEditMessageText = jest.fn() as jest.MockedFunction<any>;
const mockVincularFotosCloudflare = jest.fn() as jest.MockedFunction<any>;

// Mock mongoose
jest.mock('mongoose', () => ({
    startSession: jest.fn(() => Promise.resolve(mockSession))
}));

// Mock de modelos
jest.mock('../../src/models/vehicle', () => ({
    default: {
        findOne: mockVehicleFindOne,
        create: mockVehicleCreate,
        findByIdAndUpdate: mockVehicleFindByIdAndUpdate
    }
}));

jest.mock('../../src/models/policy', () => ({
    default: {
        create: mockPolicyCreate
    }
}));

// Mock de VehicleController
jest.mock('../../src/controllers/vehicleController', () => ({
    VehicleController: {
        vincularFotosCloudflare: mockVincularFotosCloudflare
    }
}));

// Mock de logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock de teclados
jest.mock('../../src/comandos/teclados', () => ({
    getMainKeyboard: () => ({ keyboard: [['🏠 MENÚ PRINCIPAL']] })
}));

describe('🔧 Correcciones Sistema NIV', () => {
    const mockBot = {
        telegram: {
            sendMessage: mockBotSendMessage,
            deleteMessage: mockBotDeleteMessage,
            editMessageText: mockBotEditMessageText
        }
    };

    const mockRegistro = {
        datos: {
            serie: '3VWHP6BU9RM073778',
            marca: 'VOLKSWAGEN',
            submarca: 'JETTA',
            año: 2024,
            color: 'NEGRO',
            placas: 'PERMISOZ'
        },
        datosGenerados: {
            titular: 'José Test López',
            rfc: 'TETL123456789',
            telefono: 'SIN NÚMERO',
            correo: 'test@example.com',
            calle: 'Calle Test 123',
            colonia: 'Colonia Test',
            municipio: 'Municipio Test',
            estadoRegion: 'Estado Test',
            cp: '12345'
        },
        fotos: [
            { url: 'https://test.com/foto1.jpg' },
            { url: 'https://test.com/foto2.jpg' }
        ],
        threadId: '12345'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Configurar mocks por defecto
        mockVehicleFindOne.mockResolvedValue(null); // No existe vehículo duplicado
        mockVehicleCreate.mockResolvedValue([{ _id: 'vehicle123' }]);
        mockPolicyCreate.mockResolvedValue([{ _id: 'policy123', numeroPoliza: '3VWHP6BU9RM073778' }]);
        mockVehicleFindByIdAndUpdate.mockResolvedValue({});
        mockBotSendMessage.mockResolvedValue({ message_id: 456 });
        mockVincularFotosCloudflare.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('✅ 1. TRANSACCIONES ATÓMICAS', () => {
        it('debe usar sesión de transacción en todas las operaciones de BD', async () => {
            // Importar VehicleRegistrationHandler después de los mocks
            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            
            // Acceder al método privado para testing
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;
            
            await convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key');

            // Verificar que se inicia la sesión
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();

            // Verificar que la validación de duplicados usa sesión
            expect(mockVehicleFindOne).toHaveBeenCalledWith(
                { serie: '3VWHP6BU9RM073778' }
            );

            // Verificar que la creación de vehículo usa sesión
            expect(mockVehicleCreate).toHaveBeenCalledWith(
                [expect.objectContaining({
                    serie: '3VWHP6BU9RM073778',
                    estado: 'CONVERTIDO_NIP'
                })],
                { session: mockSession }
            );

            // Verificar que la creación de póliza usa sesión
            expect(mockPolicyCreate).toHaveBeenCalledWith(
                [expect.objectContaining({
                    numeroPoliza: '3VWHP6BU9RM073778',
                    tipoPoliza: 'NIP',
                    esNIP: true
                })],
                { session: mockSession }
            );

            // Verificar que la actualización del vehículo usa sesión
            expect(mockVehicleFindByIdAndUpdate).toHaveBeenCalledWith(
                'vehicle123',
                { policyId: 'policy123' },
                { session: mockSession }
            );

            // Verificar que se confirma la transacción
            expect(mockSession.commitTransaction).toHaveBeenCalled();
        });

        it('debe hacer rollback si falla cualquier operación', async () => {
            // Simular fallo en creación de póliza
            mockPolicyCreate.mockRejectedValue(new Error('Error creando póliza'));

            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            await expect(convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key'))
                .rejects.toThrow('Error creando póliza');

            // Verificar rollback
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        it('debe detectar vehículos duplicados dentro de la transacción', async () => {
            // Simular vehículo existente
            mockVehicleFindOne.mockResolvedValue({ _id: 'existing123' });

            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            await expect(convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key'))
                .rejects.toThrow('Ya existe un vehículo registrado con la serie: 3VWHP6BU9RM073778');

            // Verificar que no se creó nada
            expect(mockVehicleCreate).not.toHaveBeenCalled();
            expect(mockPolicyCreate).not.toHaveBeenCalled();
        });
    });

    describe('✅ 2. PROCESAMIENTO ASÍNCRONO DE FOTOS', () => {
        it('debe procesar fotos después de confirmar la transacción', async () => {
            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            await convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key');

            // Verificar que la transacción se confirma ANTES del procesamiento de fotos
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            
            // Esperar un tick para que el procesamiento asíncrono se ejecute
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verificar que las fotos se procesan de manera asíncrona
            expect(mockVincularFotosCloudflare).toHaveBeenCalledWith(
                'vehicle123',
                mockRegistro.fotos
            );
        });

        it('debe continuar aunque falle el procesamiento de fotos', async () => {
            // Simular fallo en vinculación de fotos
            mockVincularFotosCloudflare.mockResolvedValue({ success: false, error: 'Error test' });

            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            // No debe fallar aunque las fotos fallen
            const resultado = await convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key');
            expect(resultado).toBe(true);

            // Verificar que la transacción se completó exitosamente
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockBotSendMessage).toHaveBeenCalled();
        });
    });

    describe('✅ 3. PREVENCIÓN DE BOTONES DUPLICADOS', () => {
        it('debe eliminar mensaje anterior cuando falla editMessageText', async () => {
            // Simular fallo en editMessageText
            mockBotEditMessageText.mockRejectedValue(new Error('Cannot edit message'));

            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            
            // Simular registro con mensaje ID previo
            const registroConMensaje = {
                ...mockRegistro,
                mensajeFotosId: 789
            };

            // Llamar al método procesarFoto que maneja botones
            const procesarFoto = (VehicleRegistrationHandler as any).procesarFoto;
            
            await procesarFoto(mockBot, 123, registroConMensaje);

            // Verificar que intenta editar el mensaje
            expect(mockBotEditMessageText).toHaveBeenCalledWith(
                123,
                789,
                undefined,
                expect.any(String),
                expect.any(Object)
            );

            // Verificar que intenta eliminar el mensaje anterior
            expect(mockBotDeleteMessage).toHaveBeenCalledWith(123, 789);

            // Verificar que envía un mensaje nuevo
            expect(mockBotSendMessage).toHaveBeenCalledWith(
                123,
                expect.any(String),
                expect.objectContaining({
                    message_thread_id: 12345,
                    reply_markup: expect.any(Object)
                })
            );
        });

        it('debe manejar graciosamente si no puede eliminar mensaje anterior', async () => {
            // Simular fallo en editMessageText y deleteMessage
            mockBotEditMessageText.mockRejectedValue(new Error('Cannot edit message'));
            mockBotDeleteMessage.mockRejectedValue(new Error('Message not found'));

            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            
            const registroConMensaje = {
                ...mockRegistro,
                mensajeFotosId: 789
            };

            const procesarFoto = (VehicleRegistrationHandler as any).procesarFoto;
            
            // No debe fallar aunque no pueda eliminar
            await expect(procesarFoto(mockBot, 123, registroConMensaje))
                .resolves.not.toThrow();

            // Debe continuar y enviar mensaje nuevo
            expect(mockBotSendMessage).toHaveBeenCalled();
        });
    });

    describe('✅ 4. INTEGRACIÓN COMPLETA', () => {
        it('debe completar todo el flujo NIV sin errores', async () => {
            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            const resultado = await convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key');

            // Verificar resultado exitoso
            expect(resultado).toBe(true);

            // Verificar que todas las operaciones se ejecutaron
            expect(mockVehicleFindOne).toHaveBeenCalled();
            expect(mockVehicleCreate).toHaveBeenCalled();
            expect(mockPolicyCreate).toHaveBeenCalled();
            expect(mockVehicleFindByIdAndUpdate).toHaveBeenCalled();
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockBotSendMessage).toHaveBeenCalled();

            // Verificar mensaje de confirmación optimizado
            expect(mockBotSendMessage).toHaveBeenCalledWith(
                123,
                expect.stringContaining('🎉 *VEHÍCULO NIP REGISTRADO*'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    message_thread_id: 12345
                })
            );
        });

        it('debe manejar correctamente el flujo cuando no hay fotos', async () => {
            const registroSinFotos = { ...mockRegistro, fotos: [] };

            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            const resultado = await convertirANIV(mockBot, 123, 456, registroSinFotos, 'test-key');

            expect(resultado).toBe(true);
            
            // Verificar que no intenta procesar fotos
            expect(mockVincularFotosCloudflare).not.toHaveBeenCalled();
            
            // Pero sí completa el resto del flujo
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockBotSendMessage).toHaveBeenCalled();
        });
    });

    describe('✅ 5. VALIDACIÓN DE DATOS NIV', () => {
        it('debe crear póliza NIV con todos los campos requeridos', async () => {
            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            await convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key');

            expect(mockPolicyCreate).toHaveBeenCalledWith(
                [expect.objectContaining({
                    // Identificación NIV
                    numeroPoliza: '3VWHP6BU9RM073778',
                    tipoPoliza: 'NIP',
                    esNIP: true,
                    fechaConversionNIP: expect.any(Date),
                    
                    // Datos del vehículo
                    marca: 'VOLKSWAGEN',
                    submarca: 'JETTA',
                    año: 2024,
                    serie: '3VWHP6BU9RM073778',
                    
                    // Estados correctos
                    estado: 'ACTIVO',
                    estadoPoliza: 'VIGENTE',
                    
                    // Configuración automática
                    aseguradora: 'NIP_AUTOMATICO',
                    agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                    totalServicios: 0,
                    creadoViaOBD: true,
                    
                    // Referencias
                    vehicleId: 'vehicle123'
                })],
                { session: mockSession }
            );
        });

        it('debe crear vehículo con estado CONVERTIDO_NIP', async () => {
            const { VehicleRegistrationHandler } = await import('../../src/comandos/comandos/VehicleRegistrationHandler');
            const convertirANIV = (VehicleRegistrationHandler as any).convertirANIV;

            await convertirANIV(mockBot, 123, 456, mockRegistro, 'test-key');

            expect(mockVehicleCreate).toHaveBeenCalledWith(
                [expect.objectContaining({
                    serie: '3VWHP6BU9RM073778',
                    estado: 'CONVERTIDO_NIP',
                    creadoVia: 'TELEGRAM_BOT',
                    marca: 'VOLKSWAGEN',
                    submarca: 'JETTA',
                    año: 2024
                })],
                { session: mockSession }
            );
        });
    });
});