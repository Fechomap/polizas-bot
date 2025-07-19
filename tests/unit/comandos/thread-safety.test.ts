// tests/unit/comandos/thread-safety.test.ts
import { jest } from '@jest/globals';
import StateKeyManager from '../../../src/utils/StateKeyManager';
import { Context } from 'telegraf';

interface ThreadState {
    estado?: string;
    poliza?: string;
    numeroPoliza?: string;
    threadId?: number;
    vehiculo?: any;
    timestamp?: number;
}

interface ParsedContextKey {
    chatId: string;
    threadId: string | null;
}

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
            } as unknown as Context;
            expect(StateKeyManager.getThreadId(ctxWithMessage)).toBe(777);

            // Contexto con callback query
            const ctxWithCallback = {
                callbackQuery: {
                    message: { message_thread_id: 888 }
                }
            } as unknown as Context;
            expect(StateKeyManager.getThreadId(ctxWithCallback)).toBe(888);

            // Contexto sin threadId
            const ctxNoThread = { message: {} } as unknown as Context;
            expect(StateKeyManager.getThreadId(ctxNoThread)).toBe(null);
        });

        it('debe parsear claves de contexto correctamente', () => {
            const key1 = '123456:777';
            const key2 = '123456';

            const parsed1 = StateKeyManager.parseContextKey(key1) as ParsedContextKey;
            const parsed2 = StateKeyManager.parseContextKey(key2) as ParsedContextKey;

            expect(parsed1.chatId).toBe('123456');
            expect(parsed1.threadId).toBe('777');
            expect(parsed2.chatId).toBe('123456');
            expect(parsed2.threadId).toBe(null);
        });
    });

    describe('StateKeyManager - Thread Safe State Map', () => {
        let stateMap: ReturnType<typeof StateKeyManager.createThreadSafeStateMap>;

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
                coordenadas: {
                    origen: { lat: 19.4326, lng: -99.1332 },
                    destino: { lat: 19.3793, lng: -99.1585 }
                },
                servicios: ['GPS', 'Asistencia Vial', 'Seguro Ampliado']
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
            stateMap.set(chatId, 'DATA-MAIN', null); // Thread principal

            // Verificar que todos existen
            expect(stateMap.has(chatId, threadId1)).toBe(true);
            expect(stateMap.has(chatId, threadId2)).toBe(true);
            expect(stateMap.has(chatId, null)).toBe(true);

            // Eliminar todos los estados del chat
            const deletedCount = stateMap.deleteAll(chatId);

            // Verificar eliminación
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

            // Obtener todos los estados
            const allStates = stateMap.getAllInChat(chatId);

            // Verificar resultados
            expect(Object.keys(allStates).length).toBe(3);
            
            // Extraer threadIds y values para verificaciones
            const threadIds = Object.keys(allStates).map(key => {
                const parsed = StateKeyManager.parseContextKey(key) as ParsedContextKey;
                return parsed.threadId;
            });
            
            const values = Object.values(allStates);

            expect(threadIds).toContain('777');
            expect(threadIds).toContain('888');
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

            stateMap.deleteAll(chatId1);
            expect(stateMap.has(chatId1, threadId)).toBe(false);
            expect(stateMap.has(chatId2, threadId)).toBe(true);
            expect(stateMap.get(chatId2, threadId)).toBe('CHAT2-DATA');
        });
    });

    describe('Casos de uso del mundo real', () => {
        let stateMap: ReturnType<typeof StateKeyManager.createThreadSafeStateMap>;

        beforeEach(() => {
            stateMap = StateKeyManager.createThreadSafeStateMap();
        });

        it('debe manejar múltiples usuarios en diferentes threads del mismo grupo', () => {
            const groupChatId = 999888777;
            const thread1 = 1001; // Thread de soporte técnico
            const thread2 = 1002; // Thread de ventas
            const thread3 = 1003; // Thread general

            // Simular diferentes usuarios en threads
            stateMap.set(groupChatId, {
                estado: 'consultando',
                poliza: 'SOPORTE-001',
                vehiculo: { marca: 'Toyota', año: 2022 }
            } as ThreadState, thread1);

            stateMap.set(groupChatId, {
                estado: 'añadiendo_servicio',
                numeroPoliza: 'VENTA-001',
                servicios: ['Asistencia vial', 'GPS']
            } as ThreadState, thread2);

            stateMap.set(groupChatId, {
                estado: 'subiendo_archivo',
                poliza: 'GENERAL-001',
                archivos: ['archivo1.pdf']
            } as ThreadState, thread3);

            // Obtener estados
            const state1 = stateMap.get(groupChatId, thread1) as ThreadState;
            const state2 = stateMap.get(groupChatId, thread2) as ThreadState;
            const state3 = stateMap.get(groupChatId, thread3) as ThreadState;

            expect(state1.estado).toBe('consultando');
            expect(state2.estado).toBe('añadiendo_servicio');
            expect(state3.estado).toBe('subiendo_archivo');

            expect(state1.poliza).toBe('SOPORTE-001');
            expect(state2.numeroPoliza).toBe('VENTA-001');
            expect(state3.poliza).toBe('GENERAL-001');
        });

        it('debe prevenir contaminación entre threads concurrentes', async () => {
            const chatId = 333222111;
            const threads = [2001, 2002, 2003, 2004, 2005];
            
            // Simular operaciones concurrentes
            await Promise.all(threads.map(async (threadId) => {
                // Simulación de operaciones asincrónicas
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
                
                stateMap.set(
                    chatId,
                    {
                        estado: `estado_${threadId}`,
                        vehiculo: { id: `vehiculo_${threadId}` },
                        timestamp: Date.now()
                    } as ThreadState,
                    threadId
                );
            }));
            
            // Verificar cada thread individualmente
            threads.forEach(threadId => {
                const state = stateMap.get(chatId, threadId) as ThreadState;
                expect(state.estado).toBe(`estado_${threadId}`);
                expect(state.vehiculo.id).toBe(`vehiculo_${threadId}`);
            });
            
            // Verificar sin contaminación cruzada
            for (let i = 0; i < threads.length; i++) {
                for (let j = 0; j < threads.length; j++) {
                    if (i !== j) {
                        const state_i = stateMap.get(chatId, threads[i]) as ThreadState;
                        const state_j = stateMap.get(chatId, threads[j]) as ThreadState;
                        expect(state_i.vehiculo.id).not.toBe(state_j.vehiculo.id);
                    }
                }
            }
        });
        
        it('debe soportar operaciones de limpieza selectiva', () => {
            const chatId = 444333222;
            const threads = [1001, 1002, 1003, 1004, 1005];
            
            // Configurar datos en múltiples threads
            threads.forEach(threadId => {
                stateMap.set(
                    chatId,
                    {
                        threadId,
                        estado: 'activo',
                        timestamp: Date.now()
                    } as ThreadState,
                    threadId
                );
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
            const state1002 = stateMap.get(chatId, 1002) as ThreadState;
            const state1004 = stateMap.get(chatId, 1004) as ThreadState;
            
            expect(state1002.threadId).toBe(1002);
            expect(state1004.threadId).toBe(1004);
        });
    });

    describe('Casos extremos y edge cases', () => {
        let stateMap: ReturnType<typeof StateKeyManager.createThreadSafeStateMap>;

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

            interface LargeData {
                numeroPoliza: string;
                servicios: Array<{
                    id: number;
                    descripcion: string;
                    fecha: string;
                }>;
                metadata: {
                    procesado: boolean;
                    timestamp: number;
                };
            }

            // Crear un objeto grande
            const largeData: LargeData = {
                numeroPoliza: 'LARGE-001',
                servicios: Array.from({ length: 1000 }, (_, i) => ({
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
            const retrieved = stateMap.get(chatId, threadId) as LargeData;

            expect(retrieved.numeroPoliza).toBe('LARGE-001');
            expect(retrieved.servicios).toHaveLength(1000);
            expect(retrieved.servicios[0].id).toBe(0);
            expect(retrieved.servicios[999].id).toBe(999);
        });
    });
});
