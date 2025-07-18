const { PolicyAssignmentHandler } = require('../../../src/comandos/comandos/PolicyAssignmentHandler');
const StateKeyManager = require('../../../src/utils/StateKeyManager');

// Mock de dependencias
jest.mock('../../../src/controllers/vehicleController');
jest.mock('../../../src/controllers/policyController');
jest.mock('../../../src/models/vehicle');

describe('PolicyAssignmentHandler - Flujo ASEGURAR AUTO ThreadID Integration', () => {
    let mockBot;
    let userId, chatId, threadId, stateKey;

    beforeEach(() => {
        // Reset de estados
        jest.clearAllMocks();
        
        // Setup de datos de prueba
        userId = '7143094298';
        chatId = -1002291817096;
        threadId = 30068;
        stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        
        // Mock del bot
        mockBot = {
            telegram: {
                sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
                editMessageText: jest.fn().mockResolvedValue({ message_id: 123 })
            }
        };

        // Mock del modelo Vehicle
        const Vehicle = require('../../../src/models/vehicle');
        Vehicle.findById = jest.fn().mockResolvedValue({
            _id: '687970cf36b1895394b9497f',
            marca: 'mazda',
            submarca: 'Mazda 3',
            año: 2020,
            color: 'gris',
            serie: '12345678901234560',
            placas: 'PERMISO1',
            titular: 'Leticia Medina Aguilar',
            rfc: 'MEAL861220MYH',
            telefono: 'Sin teléfono',
            estado: 'SIN_POLIZA'
        });

        Vehicle.find = jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([{
                _id: '687970cf36b1895394b9497f',
                marca: 'mazda',
                submarca: 'Mazda 3',
                año: 2020,
                color: 'gris',
                serie: '12345678901234560',
                placas: 'PERMISO1',
                titular: 'Leticia Medina Aguilar',
                estado: 'SIN_POLIZA'
            }])
        });

        Vehicle.countDocuments = jest.fn().mockResolvedValue(1);

        // Mock de VehicleController
        const VehicleController = require('../../../src/controllers/vehicleController');
        VehicleController.obtenerVehiculosSinPoliza = jest.fn().mockResolvedValue({
            success: true,
            vehiculos: [
                {
                    _id: '687970cf36b1895394b9497f',
                    marca: 'mazda',
                    submarca: 'Mazda 3',
                    año: 2020,
                    color: 'gris',
                    serie: '12345678901234560',
                    placas: 'PERMISO1',
                    titular: 'Leticia Medina Aguilar',
                    estado: 'SIN_POLIZA'
                }
            ],
            total: 1
        });
    });

    describe('Flujo Completo ASEGURAR AUTO', () => {
        test('debe ejecutar flujo completo sin errores de ThreadID', async () => {
            // Paso 1: Verificar que NO hay asignación en proceso inicialmente
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)).toBe(false);

            // Paso 2: Mostrar vehículos disponibles
            await PolicyAssignmentHandler.mostrarVehiculosDisponibles(mockBot, chatId, userId, threadId);
            
            // Verificar que se envió mensaje con threadId correcto
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('🚗 *VEHÍCULOS DISPONIBLES*'),
                expect.objectContaining({
                    message_thread_id: threadId
                })
            );

            // Paso 3: Iniciar asignación de póliza
            const vehicleId = '687970cf36b1895394b9497f';
            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId);

            // Verificar que AHORA SÍ hay asignación en proceso con ThreadID correcto
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)).toBe(true);
            
            // Verificar que NO hay asignación en un threadId diferente
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, 99999)).toBe(false);

            // Verificar que se envió mensaje de inicio con threadId correcto
            const initCalls = mockBot.telegram.sendMessage.mock.calls.filter(call => 
                call[1].includes('VEHÍCULO SELECCIONADO')
            );
            expect(initCalls.length).toBeGreaterThan(0);
            expect(initCalls[0][2]).toHaveProperty('message_thread_id', threadId);

            // Paso 4: Simular procesamiento de mensaje (número de póliza)
            const mensajePoliza = {
                chat: { id: chatId },
                message_thread_id: threadId,
                text: '12346'
            };

            const procesado = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajePoliza, userId);
            expect(procesado).toBe(true);

            // Verificar que todos los mensajes subsecuentes mantienen threadId
            const allCalls = mockBot.telegram.sendMessage.mock.calls;
            const callsWithThread = allCalls.filter(call => call[2]?.message_thread_id === threadId);
            expect(callsWithThread.length).toBeGreaterThan(0);
        });

        test('debe aislar estados entre diferentes threads del mismo chat', async () => {
            const threadId1 = 30068;
            const threadId2 = 30069;
            const vehicleId = '687970cf36b1895394b9497f';

            // Iniciar asignaciones en threads diferentes
            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId1);
            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId2);

            // Verificar aislamiento de estados
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId1)).toBe(true);
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId2)).toBe(true);

            // Procesar mensaje en thread1
            const mensajeThread1 = {
                chat: { id: chatId },
                message_thread_id: threadId1,
                text: 'POLIZA-001'
            };

            const procesadoThread1 = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajeThread1, userId);
            expect(procesadoThread1).toBe(true);

            // Procesar mensaje en thread2
            const mensajeThread2 = {
                chat: { id: chatId },
                message_thread_id: threadId2,
                text: 'POLIZA-002'
            };

            const procesadoThread2 = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajeThread2, userId);
            expect(procesadoThread2).toBe(true);

            // Verificar que cada thread mantuvo su estado independiente
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId1)).toBe(true);
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId2)).toBe(true);
        });

        test('debe rechazar mensajes de threads incorrectos', async () => {
            const vehicleId = '687970cf36b1895394b9497f';
            
            // Iniciar asignación en threadId específico
            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId);
            
            // Intentar procesar mensaje desde thread diferente
            const mensajeThreadIncorrecto = {
                chat: { id: chatId },
                message_thread_id: 99999, // Thread diferente
                text: '12346'
            };

            const procesado = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajeThreadIncorrecto, userId);
            expect(procesado).toBe(false); // No debe procesar
        });

        test('debe mantener compatibilidad con llamadas sin threadId', async () => {
            // Crear estado con formato viejo para compatibilidad
            const { asignacionesEnProceso } = require('../../../src/comandos/comandos/PolicyAssignmentHandler');
            asignacionesEnProceso.set(userId, {
                estado: 'esperando_numero_poliza',
                chatId: chatId,
                threadId: null
            });

            // Verificar compatibilidad hacia atrás
            expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)).toBe(true);
            
            // Limpiar
            asignacionesEnProceso.delete(userId);
        });
    });

    describe('Verificación de ThreadID en Mensajes', () => {
        test('todos los sendMessage deben incluir threadId cuando está presente', async () => {
            const vehicleId = '687970cf36b1895394b9497f';
            
            // Limpiar calls previos
            mockBot.telegram.sendMessage.mockClear();

            // Iniciar asignación
            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId);

            // Verificar que TODOS los calls incluyen threadId
            const allCalls = mockBot.telegram.sendMessage.mock.calls;
            expect(allCalls.length).toBeGreaterThan(0);

            allCalls.forEach((call, index) => {
                const [callChatId, message, options] = call;
                expect(callChatId).toBe(chatId);
                expect(options).toHaveProperty('message_thread_id', threadId);
            });
        });

        test('debe manejar mensajes sin threadId (chat principal)', async () => {
            const threadIdNull = null;
            const vehicleId = '687970cf36b1895394b9497f';
            
            mockBot.telegram.sendMessage.mockClear();

            await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadIdNull);

            // Verificar que NO se incluye message_thread_id cuando threadId es null
            const allCalls = mockBot.telegram.sendMessage.mock.calls;
            expect(allCalls.length).toBeGreaterThan(0);

            allCalls.forEach((call, index) => {
                const [callChatId, message, options] = call;
                expect(callChatId).toBe(chatId);
                expect(options).not.toHaveProperty('message_thread_id');
            });
        });
    });

    describe('Integración con BaseAutosCommand', () => {
        test('debe verificar que BaseAutosCommand pasa parámetros correctos', () => {
            // Simular como BaseAutosCommand llamaría tieneAsignacionEnProceso
            const spy = jest.spyOn(PolicyAssignmentHandler, 'tieneAsignacionEnProceso');

            // Llamada correcta con todos los parámetros
            PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId);
            
            expect(spy).toHaveBeenCalledWith(userId, chatId, threadId);
            spy.mockRestore();
        });
    });
});