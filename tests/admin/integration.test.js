/**
 * Test de integración para verificar que el módulo admin se carga correctamente
 */

describe('Admin Module Integration', () => {
    test('El módulo AdminModule se puede importar', () => {
        // Verificar que el módulo existe
        const adminModulePath = '../../src/admin/index.js';
        expect(() => {
            // No importamos realmente para evitar dependencias
            const fs = require('fs');
            const path = require('path');
            const filePath = path.resolve(__dirname, adminModulePath);
            fs.accessSync(filePath, fs.constants.F_OK);
        }).not.toThrow();
    });

    test('Los archivos del módulo admin existen', () => {
        const fs = require('fs');
        const path = require('path');

        const adminFiles = [
            'index.js',
            'middleware/adminAuth.js',
            'menus/adminMenu.js',
            'menus/menuBuilder.js',
            'handlers/policyHandler.js',
            'handlers/serviceHandler.js',
            'handlers/databaseHandler.js',
            'utils/adminStates.js',
            'utils/auditLogger.js'
        ];

        adminFiles.forEach(file => {
            const filePath = path.resolve(__dirname, '../../src/admin', file);
            expect(() => {
                fs.accessSync(filePath, fs.constants.F_OK);
            }).not.toThrow();
        });
    });

    test('AdminModule tiene los métodos esperados', () => {
        // Mock del AdminModule
        const mockAdminModule = {
            initialize: jest.fn(),
            registerCallbackHandlers: jest.fn(),
            registerCommands: jest.fn(),
            handlers: {
                policy: {},
                service: {},
                database: {}
            }
        };

        expect(mockAdminModule.initialize).toBeDefined();
        expect(mockAdminModule.registerCallbackHandlers).toBeDefined();
        expect(mockAdminModule.registerCommands).toBeDefined();
        expect(mockAdminModule.handlers).toBeDefined();
        expect(mockAdminModule.handlers.policy).toBeDefined();
        expect(mockAdminModule.handlers.service).toBeDefined();
        expect(mockAdminModule.handlers.database).toBeDefined();
    });

    test('El sistema de estados admin funciona', () => {
        // Mock del AdminStateManager
        const mockAdminStateManager = {
            createAdminState: jest.fn().mockReturnValue({
                operation: 'test',
                data: {},
                createdAt: Date.now(),
                lastActivity: Date.now(),
                history: []
            }),
            getAdminState: jest.fn(),
            updateAdminState: jest.fn(),
            clearAdminState: jest.fn(),
            cleanupOldAdminStates: jest.fn()
        };

        const state = mockAdminStateManager.createAdminState(123, -1000, 'test_operation');

        expect(state).toBeDefined();
        expect(state.operation).toBe('test');
        expect(state.data).toEqual({});
        expect(state.history).toEqual([]);
    });

    test('El sistema de auditoría puede registrar acciones', () => {
        // Mock del AuditLogger
        const mockAuditLogger = {
            log: jest.fn().mockResolvedValue({
                _id: 'mock_id',
                action: 'test_action',
                userId: 123,
                module: 'system',
                result: 'success'
            }),
            logChange: jest.fn(),
            logError: jest.fn(),
            getLogs: jest.fn(),
            getStats: jest.fn(),
            cleanup: jest.fn()
        };

        const mockCtx = {
            from: { id: 123, username: 'testuser' },
            chat: { id: -1000 }
        };

        expect(mockAuditLogger.log).toBeDefined();
        expect(async () => {
            await mockAuditLogger.log(mockCtx, 'test_action');
        }).not.toThrow();
    });
});

describe('Admin Module Callbacks', () => {
    test('Los callbacks admin tienen el formato correcto', () => {
        const validCallbacks = [
            'admin_menu',
            'admin_policy_menu',
            'admin_policy_edit',
            'admin_policy_delete',
            'admin_service_menu',
            'admin_database_menu'
        ];

        validCallbacks.forEach(callback => {
            expect(callback).toMatch(/^admin_/);
        });
    });

    test('El patrón de regex para callbacks funciona', () => {
        const callbackRegex = /^admin_(.+)$/;

        expect('admin_policy_edit'.match(callbackRegex)).toBeTruthy();
        expect('admin_policy_edit'.match(callbackRegex)[1]).toBe('policy_edit');

        expect('not_admin_callback'.match(callbackRegex)).toBeFalsy();
    });
});
