// tests/unit/comandos/thread-safety.test.js
const StateKeyManager = require('../../../src/utils/StateKeyManager');

describe('Thread Safety Tests - Verificación exhaustiva de thread_ids', () => {
    
    describe('StateKeyManager - Generación de claves', () => {
        it('debe generar claves únicas para diferentes thread_ids', () => {
            const chatId = 123456;
            const threadId1 = 111;
            const threadId2 = 222;
            
            const key1 = StateKeyManager.getContextKey(chatId, threadId1);
            const key2 = StateKeyManager.getContextKey(chatId, threadId2);
            const keyNoThread = StateKeyManager.getContextKey(chatId, null);
            
            expect(key1).toBe('123456:111');
            expect(key2).toBe('123456:222');
            expect(keyNoThread).toBe('123456');
            expect(key1).not.toBe(key2);
            expect(key1).not.toBe(keyNoThread);
        });

        it('debe extraer threadId correctamente del contexto', () => {
            // Contexto con mensaje normal
            const ctxWithMessage = {
                message: { message_thread_id: 777 }
            };
            expect(StateKeyManager.getThreadId(ctxWithMessage)).toBe(777);

            // Contexto con callback query
            const ctxWithCallback = {
                callbackQuery: {
                    message: { message_thread_id: 888 }
                }
            };
            expect(StateKeyManager.getThreadId(ctxWithCallback)).toBe(888);

            // Contexto sin threadId
            const ctxNoThread = { message: {} };
            expect(StateKeyManager.getThreadId(ctxNoThread)).toBe(null);
        });

        it('debe parsear claves de contexto correctamente', () => {
            const key1 = '123456:777';
            const key2 = '123456';
            
            const parsed1 = StateKeyManager.parseContextKey(key1);
            const parsed2 = StateKeyManager.parseContextKey(key2);
            
            expect(parsed1.chatId).toBe('123456');
            expect(parsed1.threadId).toBe('777');
            expect(parsed2.chatId).toBe('123456');
            expect(parsed2.threadId).toBe(null);
        });
    });

    describe('StateKeyManager - Thread Safe State Map', () => {
        let stateMap;

        beforeEach(() => {
            stateMap = StateKeyManager.createThreadSafeStateMap();
        });

        it('debe mantener estados separados para diferentes threads', () => {
            const chatId = 123456;
            const threadId1 = 111;
            const threadId2 = 222;
            
            // Establecer datos en thread 1
            stateMap.set(chatId, 'POLIZA-001', threadId1);
            
            // Establecer datos en thread 2
            stateMap.set(chatId, 'POLIZA-002', threadId2);
            
            // Verificar que los datos estén separados
            expect(stateMap.get(chatId, threadId1)).toBe('POLIZA-001');
            expect(stateMap.get(chatId, threadId2)).toBe('POLIZA-002');
            
            // Verificar que no se mezclen
            expect(stateMap.get(chatId, threadId1)).not.toBe('POLIZA-002');
            expect(stateMap.get(chatId, threadId2)).not.toBe('POLIZA-001');
        });

        it('debe eliminar solo el estado del thread específico', () => {
            const chatId = 123456;
            const threadId1 = 111;
            const threadId2 = 222;
            
            // Establecer datos en ambos threads
            stateMap.set(chatId, 'POLIZA-001', threadId1);
            stateMap.set(chatId, 'POLIZA-002', threadId2);
            
            // Eliminar solo thread 1
            stateMap.delete(chatId, threadId1);
            
            // Verificar que thread 1 se eliminó pero thread 2 permanece
            expect(stateMap.has(chatId, threadId1)).toBe(false);
            expect(stateMap.has(chatId, threadId2)).toBe(true);
            expect(stateMap.get(chatId, threadId2)).toBe('POLIZA-002');
        });

        it('debe manejar datos complejos con objetos', () => {
            const chatId = 567890;
            const threadId = 123;
            
            const complexData = {
                numeroPoliza: 'COMPLEX-001',
                origenDestino: 'CDMX - Puebla',
                usarFechaActual: true,
                coordenadas: {
                    origen: { lat: 19.4326, lng: -99.1332 },
                    destino: { lat: 19.0414, lng: -98.2063 }
                }
            };
            
            stateMap.set(chatId, complexData, threadId);
            const retrieved = stateMap.get(chatId, threadId);
            
            expect(retrieved).toEqual(complexData);
            expect(retrieved.numeroPoliza).toBe('COMPLEX-001');
            expect(retrieved.coordenadas.origen.lat).toBe(19.4326);
        });

        it('debe limpiar todos los estados de un chat', () => {
            const chatId = 345678;
            const threadId1 = 555;
            const threadId2 = 666;
            
            // Establecer múltiples estados en diferentes threads
            stateMap.set(chatId, 'DATA-1', threadId1);
            stateMap.set(chatId, 'DATA-2', threadId2);
            stateMap.set(chatId, 'DATA-MAIN', null);
            
            // Verificar que todos están establecidos
            expect(stateMap.has(chatId, threadId1)).toBe(true);
            expect(stateMap.has(chatId, threadId2)).toBe(true);
            expect(stateMap.has(chatId, null)).toBe(true);
            
            // Limpiar todos los estados del chat
            const deletedCount = stateMap.deleteAll(chatId);
            
            // Verificar que todos se limpiaron
            expect(deletedCount).toBe(3);
            expect(stateMap.has(chatId, threadId1)).toBe(false);
            expect(stateMap.has(chatId, threadId2)).toBe(false);
            expect(stateMap.has(chatId, null)).toBe(false);
        });

        it('debe obtener todos los estados de un chat', () => {
            const chatId = 456789;
            const threadId1 = 777;
            const threadId2 = 888;
            
            // Establecer estados en múltiples threads
            stateMap.set(chatId, 'VALUE-1', threadId1);
            stateMap.set(chatId, 'VALUE-2', threadId2);
            stateMap.set(chatId, 'VALUE-MAIN', null);
            
            const allStates = stateMap.getAllByChatId(chatId);
            
            expect(allStates).toHaveLength(3);
            
            // Verificar que contiene todos los estados
            const threadIds = allStates.map(state => state.threadId);
            const values = allStates.map(state => state.value);
            
            expect(threadIds).toContain(threadId1.toString());
            expect(threadIds).toContain(threadId2.toString());
            expect(threadIds).toContain(null);
            expect(values).toContain('VALUE-1');
            expect(values).toContain('VALUE-2');
            expect(values).toContain('VALUE-MAIN');
        });

        it('no debe haber interferencia entre diferentes chats', () => {
            const chatId1 = 111111;
            const chatId2 = 222222;
            const threadId = 999;
            
            stateMap.set(chatId1, 'CHAT1-DATA', threadId);
            stateMap.set(chatId2, 'CHAT2-DATA', threadId);
            
            expect(stateMap.get(chatId1, threadId)).toBe('CHAT1-DATA');
            expect(stateMap.get(chatId2, threadId)).toBe('CHAT2-DATA');
            
            // Limpiar chat1 no debe afectar chat2
            stateMap.deleteAll(chatId1);
            expect(stateMap.has(chatId1, threadId)).toBe(false);
            expect(stateMap.has(chatId2, threadId)).toBe(true);
            expect(stateMap.get(chatId2, threadId)).toBe('CHAT2-DATA');
        });
    });

    describe('Casos de uso del mundo real', () => {
        let stateMap;

        beforeEach(() => {
            stateMap = StateKeyManager.createThreadSafeStateMap();
        });

        it('debe manejar múltiples usuarios en diferentes threads del mismo grupo', () => {
            const groupChatId = 999888777;
            const thread1 = 1001; // Thread de soporte técnico
            const thread2 = 1002; // Thread de ventas
            const thread3 = 1003; // Thread general
            
            // Usuario 1 en thread de soporte técnico consultando póliza
            stateMap.set(groupChatId, { estado: 'consultando', poliza: 'SOPORTE-001' }, thread1);
            
            // Usuario 2 en thread de ventas añadiendo servicio
            stateMap.set(groupChatId, {
                estado: 'añadiendo_servicio',
                numeroPoliza: 'VENTA-001',
                origenDestino: 'Toluca - CDMX'
            }, thread2);
            
            // Usuario 3 en thread general subiendo archivos
            stateMap.set(groupChatId, { estado: 'subiendo_archivo', poliza: 'GENERAL-001' }, thread3);
            
            // Verificar que cada thread mantiene su estado independiente
            const state1 = stateMap.get(groupChatId, thread1);
            const state2 = stateMap.get(groupChatId, thread2);
            const state3 = stateMap.get(groupChatId, thread3);
            
            expect(state1.estado).toBe('consultando');
            expect(state2.estado).toBe('añadiendo_servicio');
            expect(state3.estado).toBe('subiendo_archivo');
            
            expect(state1.poliza).toBe('SOPORTE-001');
            expect(state2.numeroPoliza).toBe('VENTA-001');
            expect(state3.poliza).toBe('GENERAL-001');
        });

        it('debe prevenir contaminación entre threads concurrentes', async () => {
            const chatId = 777666555;
            const thread1 = 2001;
            const thread2 = 2002;
            
            // Simular procesamiento concurrente
            const promises = [
                // Thread 1: Usuario añadiendo pago
                new Promise(resolve => {
                    stateMap.set(chatId, { tipo: 'pago', estado: 'esperando_poliza' }, thread1);
                    setTimeout(() => {
                        stateMap.set(chatId, { tipo: 'pago', estado: 'procesando', poliza: 'PAGO-001' }, thread1);
                        resolve();
                    }, 10);
                }),
                
                // Thread 2: Usuario añadiendo servicio
                new Promise(resolve => {
                    stateMap.set(chatId, { tipo: 'servicio', estado: 'esperando_poliza' }, thread2);
                    setTimeout(() => {
                        stateMap.set(chatId, { tipo: 'servicio', estado: 'procesando', poliza: 'SERVICIO-002' }, thread2);
                        resolve();
                    }, 5);
                })
            ];
            
            await Promise.all(promises);
            
            // Verificar que no hubo interferencia
            const state1 = stateMap.get(chatId, thread1);
            const state2 = stateMap.get(chatId, thread2);
            
            expect(state1.tipo).toBe('pago');
            expect(state1.poliza).toBe('PAGO-001');
            expect(state2.tipo).toBe('servicio');
            expect(state2.poliza).toBe('SERVICIO-002');
        });

        it('debe manejar limpieza selectiva de threads', () => {
            const chatId = 888777666;
            const threads = [1001, 1002, 1003, 1004];
            
            // Establecer estados en múltiples threads
            threads.forEach(threadId => {
                stateMap.set(chatId, {
                    threadId,
                    estado: 'activo',
                    timestamp: Date.now()
                }, threadId);
            });
            
            // Verificar que todos están activos
            threads.forEach(threadId => {
                expect(stateMap.has(chatId, threadId)).toBe(true);
            });
            
            // Limpiar solo threads específicos
            stateMap.delete(chatId, 1001);
            stateMap.delete(chatId, 1003);
            
            // Verificar limpieza selectiva
            expect(stateMap.has(chatId, 1001)).toBe(false);
            expect(stateMap.has(chatId, 1002)).toBe(true);
            expect(stateMap.has(chatId, 1003)).toBe(false);
            expect(stateMap.has(chatId, 1004)).toBe(true);
            
            // Verificar que los datos restantes siguen correctos
            expect(stateMap.get(chatId, 1002).threadId).toBe(1002);
            expect(stateMap.get(chatId, 1004).threadId).toBe(1004);
        });
    });

    describe('Casos extremos y edge cases', () => {
        let stateMap;

        beforeEach(() => {
            stateMap = StateKeyManager.createThreadSafeStateMap();
        });

        it('debe manejar thread_ids como strings y números', () => {
            const chatId = 123456;
            const threadIdNumber = 777;
            const threadIdString = '888';
            
            stateMap.set(chatId, 'NUMBER-THREAD', threadIdNumber);
            stateMap.set(chatId, 'STRING-THREAD', threadIdString);
            
            expect(stateMap.get(chatId, threadIdNumber)).toBe('NUMBER-THREAD');
            expect(stateMap.get(chatId, threadIdString)).toBe('STRING-THREAD');
            
            // Verificar que no se mezclan
            expect(stateMap.get(chatId, threadIdNumber)).not.toBe('STRING-THREAD');
            expect(stateMap.get(chatId, threadIdString)).not.toBe('NUMBER-THREAD');
        });

        it('debe manejar thread_ids null y undefined', () => {
            const chatId = 654321;
            
            stateMap.set(chatId, 'NULL-THREAD', null);
            stateMap.set(chatId, 'UNDEFINED-THREAD', undefined);
            
            // En StateKeyManager, null y undefined se tratan igual (ambos como ausencia de threadId)
            expect(stateMap.get(chatId, null)).toBe('UNDEFINED-THREAD');
            expect(stateMap.get(chatId, undefined)).toBe('UNDEFINED-THREAD');
            
            // Verificar que ambos refieren al mismo estado
            expect(stateMap.get(chatId, null)).toBe(stateMap.get(chatId, undefined));
        });

        it('debe manejar chat_ids como strings y números', () => {
            const chatIdNumber = 123456;
            const chatIdString = '654321';
            const threadId = 999;
            
            stateMap.set(chatIdNumber, 'NUMBER-CHAT', threadId);
            stateMap.set(chatIdString, 'STRING-CHAT', threadId);
            
            expect(stateMap.get(chatIdNumber, threadId)).toBe('NUMBER-CHAT');
            expect(stateMap.get(chatIdString, threadId)).toBe('STRING-CHAT');
        });

        it('debe manejar datos grandes sin problemas de memoria', () => {
            const chatId = 789012;
            const threadId = 555;
            
            // Crear un objeto grande
            const largeData = {
                numeroPoliza: 'LARGE-001',
                servicios: Array.from({length: 1000}, (_, i) => ({
                    id: i,
                    descripcion: `Servicio ${i}`,
                    fecha: new Date().toISOString()
                })),
                metadata: {
                    procesado: true,
                    timestamp: Date.now()
                }
            };
            
            stateMap.set(chatId, largeData, threadId);
            const retrieved = stateMap.get(chatId, threadId);
            
            expect(retrieved.numeroPoliza).toBe('LARGE-001');
            expect(retrieved.servicios).toHaveLength(1000);
            expect(retrieved.servicios[0].id).toBe(0);
            expect(retrieved.servicios[999].id).toBe(999);
        });
    });
});