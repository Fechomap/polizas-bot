/**
 * Test funcional para AdminStateManager - Gestión de estados administrativos
 */

import { jest } from '@jest/globals';
import adminStateManager from '../../src/admin/utils/adminStates';

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('AdminStateManager - Gestión de Estados', () => {
    const testUserId = 123456;
    const testChatId = -1000;
    
    beforeEach(() => {
        // Limpiar todos los estados antes de cada test
        adminStateManager.clearAdminState(testUserId, testChatId);
        jest.clearAllMocks();
    });

    describe('createAdminState() - Creación de estados', () => {
        test('Debe crear un estado admin con datos básicos', () => {
            const operation = 'test_operation';
            const data = { field: 'value' };
            
            const state = adminStateManager.createAdminState(testUserId, testChatId, operation, data);
            
            expect(state).toBeDefined();
            expect(state.operation).toBe(operation);
            expect(state.data).toEqual(data);
            expect(state.createdAt).toBeGreaterThan(0);
            expect(state.lastActivity).toBeGreaterThan(0);
            expect(state.history).toEqual([]);
        });

        test('Debe crear estado con datos vacíos por defecto', () => {
            const operation = 'test_operation';
            
            const state = adminStateManager.createAdminState(testUserId, testChatId, operation);
            
            expect(state.data).toEqual({});
            expect(state.operation).toBe(operation);
        });
    });

    describe('getAdminState() - Obtención de estados', () => {
        test('Debe retornar el estado existente', () => {
            const operation = 'test_operation';
            const originalData = { field: 'value' };
            
            // Crear estado
            adminStateManager.createAdminState(testUserId, testChatId, operation, originalData);
            
            // Obtener estado
            const state = adminStateManager.getAdminState(testUserId, testChatId);
            
            expect(state).toBeDefined();
            expect(state!.operation).toBe(operation);
            expect(state!.data).toEqual(originalData);
        });

        test('Debe retornar undefined si no existe estado', () => {
            const state = adminStateManager.getAdminState(999999, -9999);
            
            expect(state).toBeUndefined();
        });

        test('Debe actualizar lastActivity al acceder', async () => {
            adminStateManager.createAdminState(testUserId, testChatId, 'test');
            const originalTime = adminStateManager.getAdminState(testUserId, testChatId)!.lastActivity;
            
            // Esperar un poco y acceder de nuevo
            await new Promise(resolve => setTimeout(resolve, 10));
            const state = adminStateManager.getAdminState(testUserId, testChatId);
            expect(state!.lastActivity).toBeGreaterThanOrEqual(originalTime);
        });
    });

    describe('updateAdminState() - Actualización de estados', () => {
        test('Debe actualizar datos existentes', () => {
            adminStateManager.createAdminState(testUserId, testChatId, 'test', { field1: 'value1' });
            
            const updates = { field2: 'value2', field3: 'value3' };
            const updatedState = adminStateManager.updateAdminState(testUserId, testChatId, updates);
            
            expect(updatedState).toBeDefined();
            expect(updatedState!.data).toEqual({
                field1: 'value1',
                field2: 'value2',
                field3: 'value3'
            });
        });

        test('Debe guardar historial de cambios', () => {
            const originalData = { field1: 'original' };
            const createdState = adminStateManager.createAdminState(testUserId, testChatId, 'test', originalData);
            
            const updates = { field1: 'updated' };
            const updatedState = adminStateManager.updateAdminState(testUserId, testChatId, updates);
            
            expect(updatedState!.history).toHaveLength(1);
            expect(updatedState!.history[0].previousData).toEqual({ field1: 'original' });
            expect(updatedState!.history[0].timestamp).toBeGreaterThan(0);
            expect(updatedState!.data.field1).toBe('updated');
        });

        test('Debe retornar null si no existe el estado', () => {
            const result = adminStateManager.updateAdminState(999999, -9999, { field: 'value' });
            
            expect(result).toBeNull();
        });
    });

    describe('clearAdminState() - Limpieza de estados', () => {
        test('Debe limpiar estado existente', () => {
            adminStateManager.createAdminState(testUserId, testChatId, 'test');
            
            // Verificar que existe
            expect(adminStateManager.getAdminState(testUserId, testChatId)).toBeDefined();
            
            // Limpiar
            adminStateManager.clearAdminState(testUserId, testChatId);
            
            // Verificar que ya no existe
            expect(adminStateManager.getAdminState(testUserId, testChatId)).toBeUndefined();
        });

        test('Debe ejecutarse sin error aunque no exista el estado', () => {
            expect(() => {
                adminStateManager.clearAdminState(999999, -9999);
            }).not.toThrow();
        });
    });

    describe('getAdminStats() - Estadísticas', () => {
        test('Debe retornar estadísticas correctas', () => {
            // Limpiar estados primero
            adminStateManager.clearAdminState(testUserId, testChatId);
            adminStateManager.clearAdminState(testUserId + 1, testChatId);
            adminStateManager.clearAdminState(testUserId + 2, testChatId);
            
            // Crear varios estados
            adminStateManager.createAdminState(testUserId, testChatId, 'operation1');
            adminStateManager.createAdminState(testUserId + 1, testChatId, 'operation2');
            adminStateManager.createAdminState(testUserId + 2, testChatId, 'operation1');
            
            const stats = adminStateManager.getAdminStats();
            
            expect(stats.activeStates).toBe(3);
            expect(stats.operations.operation1).toBe(2);
            expect(stats.operations.operation2).toBe(1);
        });

        test('Debe retornar estadísticas vacías si no hay estados', () => {
            // Limpiar todos los estados existentes
            adminStateManager.clearAdminState(testUserId, testChatId);
            adminStateManager.clearAdminState(testUserId + 1, testChatId);
            adminStateManager.clearAdminState(testUserId + 2, testChatId);
            
            const stats = adminStateManager.getAdminStats();
            
            expect(stats.activeStates).toBe(0);
            expect(stats.operations).toEqual({});
        });
    });

    describe('cleanupOldAdminStates() - Limpieza automática', () => {
        test('Debe ejecutarse sin errores', () => {
            adminStateManager.createAdminState(testUserId, testChatId, 'test');
            
            expect(() => {
                adminStateManager.cleanupOldAdminStates();
            }).not.toThrow();
        });
    });

    describe('createStateKey() - Generación de claves', () => {
        test('Debe generar claves consistentes', () => {
            const key1 = adminStateManager.createStateKey(123, -1000);
            const key2 = adminStateManager.createStateKey(123, -1000);
            
            expect(key1).toBe(key2);
            expect(key1).toBe('123:-1000');
        });
    });
});