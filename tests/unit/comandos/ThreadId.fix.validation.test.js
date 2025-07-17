const { PolicyAssignmentHandler } = require('../../../src/comandos/comandos/PolicyAssignmentHandler');
const StateKeyManager = require('../../../src/utils/StateKeyManager');

// Mock de dependencias
jest.mock('../../../src/models/vehicle');

describe('VALIDACIÓN CRÍTICA: ThreadID Fix para ASEGURAR AUTO', () => {
    let mockBot;
    const userId = '7143094298';
    const chatId = -1002291817096;
    const threadId = 30068;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockBot = {
            telegram: {
                sendMessage: jest.fn().mockResolvedValue({ message_id: 123 })
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
    });

    test('✅ CRÍTICO: tieneAsignacionEnProceso debe usar stateKey thread-safe', () => {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        
        // Verificar que inicialmente NO hay asignación
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)).toBe(false);
        
        // Simular que se guarda estado con stateKey (formato nuevo)
        const { asignacionesEnProceso } = require('../../../src/comandos/comandos/PolicyAssignmentHandler');
        asignacionesEnProceso.set(stateKey, {
            estado: 'esperando_numero_poliza',
            chatId: chatId,
            threadId: threadId
        });
        
        // Ahora SÍ debe encontrar la asignación
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)).toBe(true);
        
        // NO debe encontrarla en un thread diferente
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, 99999)).toBe(false);
        
        // Limpiar
        asignacionesEnProceso.delete(stateKey);
    });

    test('✅ CRÍTICO: iniciarAsignacion debe guardar con stateKey thread-safe', async () => {
        const vehicleId = '687970cf36b1895394b9497f';
        
        // Iniciar asignación
        const resultado = await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId);
        expect(resultado).toBe(true);
        
        // Verificar que se guardó con el formato correcto
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId)).toBe(true);
        
        // Verificar que el mensaje se envió con threadId correcto
        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
            chatId,
            expect.stringContaining('🚗 *VEHÍCULO SELECCIONADO*'),
            expect.objectContaining({
                message_thread_id: threadId
            })
        );
    });

    test('✅ CRÍTICO: procesarMensaje debe funcionar con stateKey thread-safe', async () => {
        const vehicleId = '687970cf36b1895394b9497f';
        
        // Primero iniciar asignación
        await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId);
        
        // Simular mensaje de número de póliza
        const mensaje = {
            chat: { id: chatId },
            message_thread_id: threadId,
            text: '12346'
        };
        
        mockBot.telegram.sendMessage.mockClear();
        
        // Procesar mensaje
        const procesado = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensaje, userId);
        expect(procesado).toBe(true);
        
        // Verificar que se procesó y se envió respuesta con threadId correcto
        expect(mockBot.telegram.sendMessage).toHaveBeenCalled();
        const lastCall = mockBot.telegram.sendMessage.mock.calls[0];
        expect(lastCall[2]).toHaveProperty('message_thread_id', threadId);
    });

    test('✅ CRÍTICO: aislamiento completo entre threads', async () => {
        const threadId1 = 30068;
        const threadId2 = 30069;
        const vehicleId = '687970cf36b1895394b9497f';
        
        // Iniciar asignaciones en ambos threads
        await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId1);
        await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadId2);
        
        // Verificar que ambos existen independientemente
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId1)).toBe(true);
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId2)).toBe(true);
        
        // Procesar mensajes en cada thread
        const mensajeThread1 = {
            chat: { id: chatId },
            message_thread_id: threadId1,
            text: 'POLIZA-001'
        };
        
        const mensajeThread2 = {
            chat: { id: chatId },
            message_thread_id: threadId2,
            text: 'POLIZA-002'
        };
        
        mockBot.telegram.sendMessage.mockClear();
        
        // Procesar en thread1
        const procesado1 = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajeThread1, userId);
        expect(procesado1).toBe(true);
        
        // Procesar en thread2
        const procesado2 = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajeThread2, userId);
        expect(procesado2).toBe(true);
        
        // Verificar que ambos threads mantienen sus estados independientes
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId1)).toBe(true);
        expect(PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadId2)).toBe(true);
    });

    test('✅ CRÍTICO: rechazo de mensajes de threads incorrectos', async () => {
        const vehicleId = '687970cf36b1895394b9497f';
        const threadIdCorrecto = 30068;
        const threadIdIncorrecto = 99999;
        
        // Iniciar asignación en thread específico
        await PolicyAssignmentHandler.iniciarAsignacion(mockBot, chatId, userId, vehicleId, threadIdCorrecto);
        
        // Intentar procesar mensaje desde thread incorrecto
        const mensajeIncorrecto = {
            chat: { id: chatId },
            message_thread_id: threadIdIncorrecto,
            text: '12346'
        };
        
        const procesado = await PolicyAssignmentHandler.procesarMensaje(mockBot, mensajeIncorrecto, userId);
        expect(procesado).toBe(false); // Debe rechazar el mensaje
    });

    test('✅ VALIDACIÓN: Estados de debug en logs coinciden con implementación', () => {
        // Verificar que las claves de estado generadas coinciden con las del log real
        const stateKeyGenerada = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const stateKeyEsperada = '7143094298:-1002291817096:30068';
        
        expect(stateKeyGenerada).toBe(stateKeyEsperada);
        
        console.log('✅ StateKey correcta:', stateKeyGenerada);
        console.log('✅ Coincide con logs reales del bot');
    });
});