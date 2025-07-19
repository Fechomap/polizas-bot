/**
 * Test completo para StateKeyManager - TypeScript moderno
 * Sistema crítico de gestión de estados thread-safe para bot de pólizas
 */

import { jest } from '@jest/globals';

// Mock del logger
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Importar después de los mocks
import StateKeyManager from '../../../src/utils/StateKeyManager';

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
            const resultado = StateKeyManager.getThreadId(ctx as any);
            expect(resultado).toBe(123);
        });

        test('debe extraer threadId de callback query', () => {
            const ctx = {
                callbackQuery: {
                    message: { message_thread_id: 456 }
                }
            };
            const resultado = StateKeyManager.getThreadId(ctx as any);
            expect(resultado).toBe(456);
        });

        test('debe priorizar mensaje sobre callbackQuery', () => {
            const ctx = {
                message: { message_thread_id: 123 },
                callbackQuery: {
                    message: { message_thread_id: 456 }
                }
            };
            const resultado = StateKeyManager.getThreadId(ctx as any);
            expect(resultado).toBe(123);
        });

        test('debe retornar null para contextos vacíos', () => {
            expect(StateKeyManager.getThreadId({} as any)).toBeNull();
            expect(StateKeyManager.getThreadId({ message: {} } as any)).toBeNull();
            expect(StateKeyManager.getThreadId({ callbackQuery: {} } as any)).toBeNull();
            expect(StateKeyManager.getThreadId({ callbackQuery: { message: {} } } as any)).toBeNull();
        });

        test('debe manejar valores null/undefined', () => {
            // Ahora que arreglamos el bug, debe manejar null/undefined correctamente
            expect(StateKeyManager.getThreadId(null as any)).toBeNull();
            expect(StateKeyManager.getThreadId(undefined as any)).toBeNull();

            // También debe manejar otros tipos no válidos
            expect(StateKeyManager.getThreadId('string' as any)).toBeNull();
            expect(StateKeyManager.getThreadId(123 as any)).toBeNull();
            expect(StateKeyManager.getThreadId(true as any)).toBeNull();
        });
    });

    describe('createThreadSafeStateMap - Mapas thread-safe', () => {
        let mapa: any;

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

    describe('Métodos Adicionales del StateKeyManager', () => {
        let mapa: any;

        beforeEach(() => {
            mapa = StateKeyManager.createThreadSafeStateMap();
        });

        test('debe eliminar todos los estados de un chatId', () => {
            const chatId = 12345;

            mapa.set(chatId, 'data sin thread');
            mapa.set(chatId, 'data thread 1', 111);
            mapa.set(chatId, 'data thread 2', 222);
            mapa.set(67890, 'otro chat'); // Diferente chatId

            const eliminados = mapa.deleteAll(chatId);

            expect(eliminados).toBe(3);
            expect(mapa.has(chatId)).toBe(false);
            expect(mapa.has(chatId, 111)).toBe(false);
            expect(mapa.has(chatId, 222)).toBe(false);
            expect(mapa.has(67890)).toBe(true); // Otro chat intacto
        });

        test('debe obtener todos los valores de un chatId', () => {
            const chatId = 12345;

            mapa.set(chatId, 'data principal');
            mapa.set(chatId, 'data thread 1', 111);
            mapa.set(chatId, 'data thread 2', 222);

            const resultados = mapa.getAllByChatId(chatId);

            expect(resultados).toHaveLength(3);
            expect(resultados).toEqual(
                expect.arrayContaining([
                    { threadId: null, value: 'data principal' },
                    { threadId: '111', value: 'data thread 1' },
                    { threadId: '222', value: 'data thread 2' }
                ])
            );
        });

        test('debe obtener tamaño del mapa', () => {
            expect(mapa.size()).toBe(0);

            mapa.set(123, 'data1');
            mapa.set(456, 'data2', 789);

            expect(mapa.size()).toBe(2);
        });

        test('debe obtener mapa interno para debugging', () => {
            mapa.set(123, 'data1');
            mapa.set(456, 'data2', 789);

            const mapaInterno = mapa.getInternalMap();

            expect(mapaInterno).toBeInstanceOf(Map);
            expect(mapaInterno.get('123')).toBe('data1');
            expect(mapaInterno.get('456:789')).toBe('data2');
        });
    });

    describe('Validación de claves de contexto', () => {
        test('debe validar claves correctas', () => {
            expect(StateKeyManager.isValidContextKey('12345')).toBe(true);
            expect(StateKeyManager.isValidContextKey('12345:67890')).toBe(true);
            expect(StateKeyManager.isValidContextKey('-100123456789')).toBe(true);
            expect(StateKeyManager.isValidContextKey('-100123456789:999')).toBe(true);
        });

        test('debe rechazar claves inválidas', () => {
            expect(StateKeyManager.isValidContextKey('')).toBe(false);
            expect(StateKeyManager.isValidContextKey(':123')).toBe(false);
            expect(StateKeyManager.isValidContextKey('123:456:789')).toBe(false);
            expect(StateKeyManager.isValidContextKey(null as any)).toBe(false);
            expect(StateKeyManager.isValidContextKey(undefined as any)).toBe(false);
            expect(StateKeyManager.isValidContextKey(123 as any)).toBe(false);
        });
    });

    describe('Generación de claves temporales', () => {
        test('debe generar claves temporales únicas', () => {
            const temp1 = StateKeyManager.generateTempKey();
            const temp2 = StateKeyManager.generateTempKey();

            expect(temp1).not.toBe(temp2);
            expect(temp1).toMatch(/^temp:\d+:[a-z0-9]+$/);
            expect(temp2).toMatch(/^temp:\d+:[a-z0-9]+$/);
        });

        test('debe generar claves temporales con prefijo personalizado', () => {
            const temp = StateKeyManager.generateTempKey('custom');

            expect(temp).toMatch(/^custom:\d+:[a-z0-9]+$/);
        });
    });

    describe('Normalización de IDs', () => {
        test('debe normalizar IDs correctamente', () => {
            expect(StateKeyManager.normalizeId(12345)).toBe('12345');
            expect(StateKeyManager.normalizeId('67890')).toBe('67890');
            expect(StateKeyManager.normalizeId('  123  ')).toBe('123');
            expect(StateKeyManager.normalizeId(-100123456789)).toBe('-100123456789');
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
            const threadId = StateKeyManager.getThreadId(ctx as any);

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

        test('debe manejar múltiples usuarios y threads simultáneamente', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();

            // Usuario 1 en chat privado
            mapa.set(12345, { estado: 'registro', paso: 1 });

            // Usuario 2 en grupo con diferentes threads
            mapa.set(-987654321, { estado: 'consulta', poliza: 'POL-001' }, 111);
            mapa.set(-987654321, { estado: 'ocupar', poliza: 'POL-002' }, 222);

            // Usuario 3 en otro chat privado
            mapa.set(54321, { estado: 'reporte', tipo: 'pdf' });

            // Verificar separación correcta
            expect(mapa.get(12345)).toEqual({ estado: 'registro', paso: 1 });
            expect(mapa.get(-987654321, 111)).toEqual({ estado: 'consulta', poliza: 'POL-001' });
            expect(mapa.get(-987654321, 222)).toEqual({ estado: 'ocupar', poliza: 'POL-002' });
            expect(mapa.get(54321)).toEqual({ estado: 'reporte', tipo: 'pdf' });

            // Sin interferencia entre usuarios
            expect(mapa.get(-987654321)).toBeUndefined(); // Sin thread específico
            expect(mapa.get(12345, 111)).toBeUndefined(); // Thread en chat incorrecto

            expect(mapa.size()).toBe(4);
        });

        test('debe simular limpieza masiva al finalizar sesión', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();
            const chatId = -123456789;

            // Simular múltiples operaciones en un grupo
            mapa.set(chatId, 'estado general');
            mapa.set(chatId, 'thread 1', 111);
            mapa.set(chatId, 'thread 2', 222);
            mapa.set(chatId, 'thread 3', 333);

            // Otros chats no afectados
            mapa.set(99999, 'otro chat');

            expect(mapa.size()).toBe(5);

            // Limpieza completa del chat
            const eliminados = mapa.deleteAll(chatId);

            expect(eliminados).toBe(4);
            expect(mapa.size()).toBe(1);
            expect(mapa.get(99999)).toBe('otro chat');
        });
    });

    describe('Edge Cases y Robustez', () => {
        test('debe manejar IDs extremos', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();

            // IDs muy grandes (límites de JavaScript)
            const bigChatId = Number.MAX_SAFE_INTEGER;
            const bigThreadId = Number.MAX_SAFE_INTEGER - 1;

            mapa.set(bigChatId, 'big data', bigThreadId);
            expect(mapa.get(bigChatId, bigThreadId)).toBe('big data');

            // IDs negativos muy pequeños
            const negativeChatId = Number.MIN_SAFE_INTEGER;
            mapa.set(negativeChatId, 'negative data');
            expect(mapa.get(negativeChatId)).toBe('negative data');
        });

        test('debe manejar strings como IDs', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();

            mapa.set('chat_string', 'data1');
            mapa.set('chat_string', 'data2', 'thread_string');

            expect(mapa.get('chat_string')).toBe('data1');
            expect(mapa.get('chat_string', 'thread_string')).toBe('data2');
        });

        test('debe manejar valores null y undefined en datos', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();

            mapa.set(123, null);
            mapa.set(456, undefined);

            expect(mapa.get(123)).toBeNull();
            expect(mapa.get(456)).toBeUndefined();
            expect(mapa.has(123)).toBe(true);
            expect(mapa.has(456)).toBe(true);
        });

        test('debe ser thread-safe con operaciones concurrentes', () => {
            const mapa = StateKeyManager.createThreadSafeStateMap();
            const chatId = 12345;

            // Simular operaciones concurrentes
            const operaciones = [];
            for (let i = 0; i < 100; i++) {
                operaciones.push(() => mapa.set(chatId, `data_${i}`, i));
            }

            // Ejecutar operaciones
            operaciones.forEach(op => op());

            // Verificar que todas se almacenaron
            expect(mapa.size()).toBe(100);
            for (let i = 0; i < 100; i++) {
                expect(mapa.get(chatId, i)).toBe(`data_${i}`);
            }
        });
    });
});