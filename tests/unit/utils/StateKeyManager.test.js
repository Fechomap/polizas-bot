const StateKeyManager = require('../../../src/utils/StateKeyManager');

describe('StateKeyManager - Gestión de estados thread-safe', () => {
    describe('getContextKey - Generación de claves', () => {
        test('debe generar clave sin threadId', () => {
            const resultado = StateKeyManager.getContextKey(12345);
            expect(resultado).toBe('12345');
        });

        test('debe generar clave con threadId numérico', () => {
            const resultado = StateKeyManager.getContextKey(12345, 67890);
            expect(resultado).toBe('12345:67890');
        });

        test('debe manejar chatId negativos (grupos)', () => {
            const resultado = StateKeyManager.getContextKey(-100123456789, 999);
            expect(resultado).toBe('-100123456789:999');
        });

        test('debe manejar threadId como string', () => {
            const resultado = StateKeyManager.getContextKey('12345', 'abc123');
            expect(resultado).toBe('12345:abc123');
        });

        test('debe ignorar threadId null/undefined', () => {
            expect(StateKeyManager.getContextKey(12345, null)).toBe('12345');
            expect(StateKeyManager.getContextKey(12345, undefined)).toBe('12345');
        });

        test('debe manejar valores edge cases', () => {
            // threadId=0 es falsy, por lo que no se incluye
            expect(StateKeyManager.getContextKey(0, 0)).toBe('0');
            // threadId='' es falsy, por lo que no se incluye  
            expect(StateKeyManager.getContextKey('', '')).toBe('');
            // Solo threadId con valor truthy se incluye
            expect(StateKeyManager.getContextKey(0, 1)).toBe('0:1');
        });
    });

    describe('parseContextKey - Parsing de claves', () => {
        test('debe parsear clave simple', () => {
            const resultado = StateKeyManager.parseContextKey('12345');
            expect(resultado).toEqual({
                chatId: '12345',
                threadId: null
            });
        });

        test('debe parsear clave compuesta', () => {
            const resultado = StateKeyManager.parseContextKey('12345:67890');
            expect(resultado).toEqual({
                chatId: '12345',
                threadId: '67890'
            });
        });

        test('debe manejar múltiples separadores (:)', () => {
            const resultado = StateKeyManager.parseContextKey('12345:67890:extra');
            expect(resultado).toEqual({
                chatId: '12345',
                threadId: '67890'
            });
        });

        test('debe manejar strings vacíos', () => {
            const resultado = StateKeyManager.parseContextKey('');
            expect(resultado).toEqual({
                chatId: '',
                threadId: null
            });
        });
    });

    describe('getThreadId - Extracción de threadId de contexto Telegraf', () => {
        test('debe extraer threadId de mensaje normal', () => {
            const ctx = {
                message: { message_thread_id: 123 }
            };
            const resultado = StateKeyManager.getThreadId(ctx);
            expect(resultado).toBe(123);
        });

        test('debe extraer threadId de callback query', () => {
            const ctx = {
                callbackQuery: {
                    message: { message_thread_id: 456 }
                }
            };
            const resultado = StateKeyManager.getThreadId(ctx);
            expect(resultado).toBe(456);
        });

        test('debe priorizar mensaje sobre callbackQuery', () => {
            const ctx = {
                message: { message_thread_id: 123 },
                callbackQuery: {
                    message: { message_thread_id: 456 }
                }
            };
            const resultado = StateKeyManager.getThreadId(ctx);
            expect(resultado).toBe(123);
        });

        test('debe retornar null para contextos vacíos', () => {
            expect(StateKeyManager.getThreadId({})).toBeNull();
            expect(StateKeyManager.getThreadId({ message: {} })).toBeNull();
            expect(StateKeyManager.getThreadId({ callbackQuery: {} })).toBeNull();
            expect(StateKeyManager.getThreadId({ callbackQuery: { message: {} } })).toBeNull();
        });

        test('debe manejar valores null/undefined', () => {
            // Ahora que arreglamos el bug, debe manejar null/undefined correctamente
            expect(StateKeyManager.getThreadId(null)).toBeNull();
            expect(StateKeyManager.getThreadId(undefined)).toBeNull();
            
            // También debe manejar otros tipos no válidos
            expect(StateKeyManager.getThreadId('string')).toBeNull();
            expect(StateKeyManager.getThreadId(123)).toBeNull();
            expect(StateKeyManager.getThreadId(true)).toBeNull();
        });
    });

    describe('createThreadSafeStateMap - Mapas thread-safe', () => {
        let mapa;

        beforeEach(() => {
            mapa = StateKeyManager.createThreadSafeStateMap();
        });

        test('debe crear mapa funcional', () => {
            expect(mapa).toBeDefined();
            expect(typeof mapa.set).toBe('function');
            expect(typeof mapa.get).toBe('function');
            expect(typeof mapa.delete).toBe('function');
            expect(typeof mapa.has).toBe('function');
            expect(typeof mapa.clear).toBe('function');
        });

        test('debe almacenar y recuperar datos sin threadId', () => {
            const chatId = 12345;
            const data = { test: 'data' };
            
            mapa.set(chatId, data);
            const resultado = mapa.get(chatId);
            
            expect(resultado).toEqual(data);
        });

        test('debe almacenar y recuperar datos con threadId', () => {
            const chatId = 12345;
            const threadId = 67890;
            const data = { test: 'data con thread' };
            
            mapa.set(chatId, data, threadId);
            const resultado = mapa.get(chatId, threadId);
            
            expect(resultado).toEqual(data);
        });

        test('debe mantener datos separados por threadId', () => {
            const chatId = 12345;
            const data1 = { tipo: 'hilo1' };
            const data2 = { tipo: 'hilo2' };
            
            mapa.set(chatId, data1, 111);
            mapa.set(chatId, data2, 222);
            
            expect(mapa.get(chatId, 111)).toEqual(data1);
            expect(mapa.get(chatId, 222)).toEqual(data2);
            expect(mapa.get(chatId)).toBeUndefined(); // Sin threadId
        });

        test('debe sobrescribir datos existentes', () => {
            const chatId = 12345;
            const threadId = 67890;
            
            mapa.set(chatId, 'primer dato', threadId);
            mapa.set(chatId, 'segundo dato', threadId);
            
            expect(mapa.get(chatId, threadId)).toBe('segundo dato');
        });

        test('debe verificar existencia con has()', () => {
            const chatId = 12345;
            const threadId = 67890;
            
            expect(mapa.has(chatId, threadId)).toBe(false);
            
            mapa.set(chatId, 'data', threadId);
            expect(mapa.has(chatId, threadId)).toBe(true);
        });

        test('debe eliminar entradas específicas', () => {
            const chatId = 12345;
            const threadId = 67890;
            
            mapa.set(chatId, 'data', threadId);
            expect(mapa.has(chatId, threadId)).toBe(true);
            
            mapa.delete(chatId, threadId);
            expect(mapa.has(chatId, threadId)).toBe(false);
            expect(mapa.get(chatId, threadId)).toBeUndefined();
        });

        test('debe limpiar todo el mapa', () => {
            mapa.set(123, 'data1');
            mapa.set(456, 'data2', 789);
            
            expect(mapa.has(123)).toBe(true);
            expect(mapa.has(456, 789)).toBe(true);
            
            mapa.clear();
            
            expect(mapa.has(123)).toBe(false);
            expect(mapa.has(456, 789)).toBe(false);
        });

        test('debe manejar tipos de datos complejos', () => {
            const chatId = 12345;
            const datosComplejos = {
                array: [1, 2, 3],
                objeto: { nested: true },
                funcion: () => 'test',
                fecha: new Date(),
                undefined: undefined,
                null: null
            };
            
            mapa.set(chatId, datosComplejos);
            const resultado = mapa.get(chatId);
            
            expect(resultado).toEqual(datosComplejos);
            expect(resultado.array).toEqual([1, 2, 3]);
            expect(resultado.objeto.nested).toBe(true);
            expect(typeof resultado.funcion).toBe('function');
        });
    });

    describe('Integración - Casos de uso reales', () => {
        test('debe simular flujo completo de callback', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();
            
            // Simular contexto de Telegram
            const ctx = {
                chat: { id: -123456789 },
                message: { message_thread_id: 999 },
                callbackQuery: { data: 'ocupar_POL-001' }
            };
            
            const chatId = ctx.chat.id;
            const threadId = StateKeyManager.getThreadId(ctx);
            
            // Almacenar estado pendiente
            const estadoPendiente = {
                numeroPoliza: 'POL-001',
                usuario: 'test_user',
                timestamp: Date.now()
            };
            
            mapa.set(chatId, estadoPendiente, threadId);
            
            // Verificar que se puede recuperar
            const estadoRecuperado = mapa.get(chatId, threadId);
            expect(estadoRecuperado).toEqual(estadoPendiente);
            
            // Simular cleanup al finalizar
            mapa.delete(chatId, threadId);
            expect(mapa.has(chatId, threadId)).toBe(false);
        });
    });
});