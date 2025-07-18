const { VehicleRegistrationHandler } = require('../../../src/comandos/comandos/VehicleRegistrationHandler');
const StateKeyManager = require('../../../src/utils/StateKeyManager');

// Mock de dependencias
jest.mock('../../../src/controllers/vehicleController');

describe('VehicleRegistrationHandler - Thread Safety', () => {
    let mockBot;

    beforeEach(() => {
        // Reset de estados
        jest.clearAllMocks();
        
        // Mock del bot
        mockBot = {
            telegram: {
                sendMessage: jest.fn().mockResolvedValue({ message_id: 123 })
            }
        };
    });

    describe('Thread ID Management', () => {
        test('debe usar StateKeyManager para crear claves thread-safe', async () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId = 30024;

            // Spy en StateKeyManager
            const getContextKeySpy = jest.spyOn(StateKeyManager, 'getContextKey');

            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId);

            // Verificar que se llamó con los parámetros correctos
            expect(getContextKeySpy).toHaveBeenCalledWith(chatId, threadId);
        });

        test('debe preservar threadId en el estado del registro', async () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId = 30024;

            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId);

            // Verificar que el usuario tiene registro en proceso en este contexto específico
            const tieneRegistro = VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId);
            expect(tieneRegistro).toBe(true);

            // Verificar que NO tiene registro en un threadId diferente
            const tieneRegistroOtroThread = VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, 99999);
            expect(tieneRegistroOtroThread).toBe(false);
        });

        test('debe enviar mensajes con message_thread_id cuando threadId está presente', async () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId = 30024;

            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId);

            // Verificar que se envió el mensaje con threadId
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('🚗 *REGISTRO DE AUTO*'),
                expect.objectContaining({
                    message_thread_id: threadId,
                    parse_mode: 'Markdown'
                })
            );
        });

        test('debe manejar múltiples registros en diferentes threads del mismo chat', async () => {
            const userId1 = '123456789';
            const userId2 = '987654321';
            const chatId = -1002291817096;
            const threadId1 = 30024;
            const threadId2 = 30025;

            // Iniciar registros en diferentes threads
            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId1, threadId1);
            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId2, threadId2);

            // Verificar que ambos registros coexisten
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId1, chatId, threadId1)).toBe(true);
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId2, chatId, threadId2)).toBe(true);

            // Verificar aislamiento entre threads
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId1, chatId, threadId2)).toBe(false);
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId2, chatId, threadId1)).toBe(false);
        });

        test('debe procesar mensajes solo en el thread correcto', async () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId = 30024;

            // Iniciar registro en thread específico
            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId);

            // Simular mensaje en el thread correcto
            const mensajeThreadCorrecto = {
                chat: { id: chatId },
                message_thread_id: threadId,
                text: 'ABC1234567890DEFG'
            };

            // Simular mensaje en thread diferente
            const mensajeThreadIncorrecto = {
                chat: { id: chatId },
                message_thread_id: 99999,
                text: 'ABC1234567890DEFG'
            };

            // Mock de VehicleController para evitar errores
            const VehicleController = require('../../../src/controllers/vehicleController');
            VehicleController.buscarVehiculo = jest.fn().mockResolvedValue({ success: false });

            // Procesar mensaje en thread correcto - debe funcionar
            const procesadoCorrecto = await VehicleRegistrationHandler.procesarMensaje(
                mockBot, 
                mensajeThreadCorrecto, 
                userId
            );
            expect(procesadoCorrecto).toBe(true);

            // Procesar mensaje en thread incorrecto - debe ser ignorado
            const procesadoIncorrecto = await VehicleRegistrationHandler.procesarMensaje(
                mockBot, 
                mensajeThreadIncorrecto, 
                userId
            );
            expect(procesadoIncorrecto).toBe(false);
        });

        test('debe cancelar registro solo en el thread específico', async () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId1 = 30024;
            const threadId2 = 30025;

            // Iniciar registros en dos threads diferentes
            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId1);
            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId2);

            // Verificar que ambos existen
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId1)).toBe(true);
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId2)).toBe(true);

            // Cancelar solo el registro del thread1
            VehicleRegistrationHandler.cancelarRegistro(userId, chatId, threadId1);

            // Verificar que solo se canceló el correcto
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId1)).toBe(false);
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId2)).toBe(true);
        });

        test('debe manejar threadId null correctamente (chat principal)', async () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId = null;

            await VehicleRegistrationHandler.iniciarRegistro(mockBot, chatId, userId, threadId);

            // Verificar que funciona sin threadId
            expect(VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadId)).toBe(true);

            // Verificar que el mensaje se envía sin message_thread_id
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                chatId,
                expect.stringContaining('🚗 *REGISTRO DE AUTO*'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.any(Object)
                })
            );

            // Verificar que NO tiene message_thread_id
            const lastCall = mockBot.telegram.sendMessage.mock.calls[0];
            expect(lastCall[2]).not.toHaveProperty('message_thread_id');
        });
    });

    describe('Integration with StateKeyManager', () => {
        test('debe usar Map thread-safe para el almacenamiento', () => {
            // Verificar que el Map funciona correctamente con claves thread-safe
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId1 = 30024;
            const threadId2 = 30025;

            const key1 = `${userId}:${StateKeyManager.getContextKey(chatId, threadId1)}`;
            const key2 = `${userId}:${StateKeyManager.getContextKey(chatId, threadId2)}`;

            // Las claves deben ser diferentes para diferentes threads
            expect(key1).not.toBe(key2);
            
            // Las claves deben contener la información correcta
            expect(key1).toContain(userId);
            expect(key1).toContain(chatId.toString());
            expect(key1).toContain(threadId1.toString());
            
            expect(key2).toContain(userId);
            expect(key2).toContain(chatId.toString());
            expect(key2).toContain(threadId2.toString());
        });

        test('debe generar claves de estado consistentes', () => {
            const userId = '123456789';
            const chatId = -1002291817096;
            const threadId = 30024;

            // Generar clave dos veces con los mismos parámetros
            const key1 = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
            const key2 = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;

            // Deben ser idénticas
            expect(key1).toBe(key2);

            // Verificar formato esperado
            expect(key1).toContain(userId);
            expect(key1).toContain(chatId.toString());
            expect(key1).toContain(threadId.toString());
        });
    });
});