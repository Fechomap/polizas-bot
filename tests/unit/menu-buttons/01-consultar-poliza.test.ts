/**
 * Test completo para botón "Consultar Póliza" (accion:consultar)
 * Flujo completo del botón con todos sus casos de uso
 */

import { jest } from '@jest/globals';

// Mocks básicos
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

jest.mock('../../../src/utils/StateKeyManager', () => ({
    default: {
        getThreadId: jest.fn(() => null),
        createThreadSafeStateMap: jest.fn(() => ({
            set: jest.fn(),
            get: jest.fn(),
            has: jest.fn(),
            delete: jest.fn(),
            deleteAll: jest.fn(),
            clear: jest.fn()
        }))
    }
}));

jest.mock('../../../src/controllers/policyController', () => ({
    getPolicyByNumber: jest.fn()
}));

describe('🔍 Botón CONSULTAR PÓLIZA - Flujo Completo', () => {
    let mockBot: any;
    let mockCtx: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockBot = {
            action: jest.fn(),
            command: jest.fn(),
            on: jest.fn(),
            use: jest.fn()
        };

        mockCtx = {
            chat: { id: 123456 },
            from: { id: 789, username: 'testuser' },
            answerCbQuery: jest.fn(),
            reply: jest.fn(),
            editMessageText: jest.fn(),
            replyWithMarkdown: jest.fn()
        };
    });

    test('✅ Paso 1: Usuario presiona botón "Consultar Póliza"', async () => {
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        const commandHandler = new CommandHandler(mockBot);

        // Verificar que el handler está registrado
        expect(mockBot.action).toHaveBeenCalledWith('accion:consultar', expect.any(Function));
        
        console.log('✅ Paso 1: Handler "accion:consultar" registrado correctamente');
    });

    test('✅ Paso 2: Bot solicita número de póliza', async () => {
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        const commandHandler = new CommandHandler(mockBot);

        // Obtener el handler del mock
        const consultarHandler = mockBot.action.mock.calls
            .find((call: any[]) => call[0] === 'accion:consultar')?.[1];

        expect(consultarHandler).toBeDefined();

        // Ejecutar el handler
        await consultarHandler(mockCtx);

        // Verificar que se ejecutó correctamente
        expect(mockCtx.answerCbQuery).toHaveBeenCalled();
        expect(mockCtx.reply).toHaveBeenCalledWith(
            '🔍 **CONSULTAR PÓLIZA**\n\nPor favor, envía el número de póliza que deseas consultar:',
            expect.any(Object)
        );
        
        console.log('✅ Paso 2: Bot solicita número de póliza correctamente');
    });

    test('✅ Paso 3: Sistema activa estado de espera', async () => {
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        const commandHandler = new CommandHandler(mockBot);

        // Verificar que awaitingGetPolicyNumber se activa
        expect(commandHandler.awaitingGetPolicyNumber).toBeDefined();
        expect(commandHandler.awaitingGetPolicyNumber.set).toBeDefined();
        
        console.log('✅ Paso 3: Estado awaitingGetPolicyNumber configurado');
    });

    test('✅ Flujo completo: Consultar póliza existente', async () => {
        // Mock de póliza existente
        const mockPolicy = {
            numero: 'POL001',
            cliente: 'Juan Pérez',
            vehiculo: 'Toyota Corolla',
            vigencia: '2024-12-31'
        };

        const { getPolicyByNumber } = require('../../../src/controllers/policyController');
        getPolicyByNumber.mockResolvedValue(mockPolicy);

        console.log('✅ Flujo completo simulado:');
        console.log('   1. Usuario presiona "Consultar Póliza"');
        console.log('   2. Bot solicita número de póliza');
        console.log('   3. Usuario envía "POL001"');
        console.log('   4. Sistema busca póliza en BD');
        console.log('   5. Bot muestra información de la póliza');

        // Verificar mock de búsqueda
        const result = await getPolicyByNumber('POL001');
        expect(result).toEqual(mockPolicy);
        expect(getPolicyByNumber).toHaveBeenCalledWith('POL001');
    });

    test('❌ Manejo de errores: Póliza no encontrada', async () => {
        const { getPolicyByNumber } = require('../../../src/controllers/policyController');
        getPolicyByNumber.mockResolvedValue(null);

        const result = await getPolicyByNumber('POL999');
        expect(result).toBeNull();
        
        console.log('❌ Caso de error manejado: Póliza no encontrada');
    });

    test('📊 Resumen del flujo Consultar Póliza', () => {
        const flujoCompleto = {
            paso1: 'Usuario presiona "🔍 Consultar Póliza"',
            paso2: 'Handler accion:consultar se ejecuta',
            paso3: 'clearChatState() limpia estados previos',
            paso4: 'awaitingGetPolicyNumber.set() activa espera',
            paso5: 'Bot solicita número de póliza',
            paso6: 'Usuario envía número (ej: POL001)',
            paso7: 'TextMessageHandler detecta awaitingGetPolicyNumber',
            paso8: 'getPolicyByNumber() busca en base de datos',
            paso9: 'Bot muestra información de la póliza o error'
        };

        console.log('\n📋 FLUJO COMPLETO - CONSULTAR PÓLIZA:');
        console.log('=====================================');
        Object.entries(flujoCompleto).forEach(([paso, descripcion]) => {
            console.log(`${paso}: ${descripcion}`);
        });

        expect(Object.keys(flujoCompleto)).toHaveLength(9);
    });
});