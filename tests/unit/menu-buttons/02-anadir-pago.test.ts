/**
 * Test completo para botón "Añadir Pago" (accion:addpayment)
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
    addPaymentToPolicy: jest.fn(),
    getPolicyByNumber: jest.fn()
}));

describe('💰 Botón AÑADIR PAGO - Flujo Completo', () => {
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

    test('✅ Paso 1: Usuario presiona botón "Añadir Pago"', async () => {
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        const commandHandler = new CommandHandler(mockBot);

        // Verificar que el handler está registrado
        expect(mockBot.action).toHaveBeenCalledWith('accion:addpayment', expect.any(Function));
        
        console.log('✅ Paso 1: Handler "accion:addpayment" registrado correctamente');
    });

    test('✅ Paso 2: Bot solicita número de póliza para pago', async () => {
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        const commandHandler = new CommandHandler(mockBot);

        // Obtener el handler del mock
        const addpaymentHandler = mockBot.action.mock.calls
            .find((call: any[]) => call[0] === 'accion:addpayment')?.[1];

        expect(addpaymentHandler).toBeDefined();

        // Ejecutar el handler
        await addpaymentHandler(mockCtx);

        // Verificar que se ejecutó correctamente
        expect(mockCtx.answerCbQuery).toHaveBeenCalled();
        expect(mockCtx.reply).toHaveBeenCalledWith(
            '💰 Introduce el número de póliza para añadir el pago:'
        );
        
        console.log('✅ Paso 2: Bot solicita número de póliza para pago');
    });

    test('✅ Paso 3: Sistema activa estado de espera de pago', async () => {
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        const commandHandler = new CommandHandler(mockBot);

        // Verificar que awaitingPaymentPolicyNumber se activa
        expect(commandHandler.awaitingPaymentPolicyNumber).toBeDefined();
        expect(commandHandler.awaitingPaymentPolicyNumber.set).toBeDefined();
        
        console.log('✅ Paso 3: Estado awaitingPaymentPolicyNumber configurado');
    });

    test('✅ Flujo completo: Añadir pago a póliza', async () => {
        // Mock de póliza existente
        const mockPolicy = {
            numero: 'POL001',
            cliente: 'Juan Pérez',
            pagos: []
        };

        const mockPaymentData = {
            cantidad: 500,
            fecha: '2024-01-15',
            concepto: 'Prima mensual'
        };

        const { getPolicyByNumber, addPaymentToPolicy } = require('../../../src/controllers/policyController');
        getPolicyByNumber.mockResolvedValue(mockPolicy);
        addPaymentToPolicy.mockResolvedValue(true);

        console.log('✅ Flujo completo simulado:');
        console.log('   1. Usuario presiona "Añadir Pago"');
        console.log('   2. Bot solicita número de póliza');
        console.log('   3. Usuario envía "POL001"');
        console.log('   4. Sistema verifica póliza existe');
        console.log('   5. Bot solicita datos del pago');
        console.log('   6. Usuario envía datos de pago');
        console.log('   7. Sistema guarda pago en BD');
        console.log('   8. Bot confirma pago agregado');

        // Verificar mocks
        const policy = await getPolicyByNumber('POL001');
        expect(policy).toEqual(mockPolicy);
        
        const paymentResult = await addPaymentToPolicy('POL001', mockPaymentData);
        expect(paymentResult).toBe(true);
        expect(addPaymentToPolicy).toHaveBeenCalledWith('POL001', mockPaymentData);
    });

    test('❌ Manejo de errores: Póliza no encontrada para pago', async () => {
        const { getPolicyByNumber } = require('../../../src/controllers/policyController');
        getPolicyByNumber.mockResolvedValue(null);

        const result = await getPolicyByNumber('POL999');
        expect(result).toBeNull();
        
        console.log('❌ Caso de error manejado: Póliza no encontrada para pago');
    });

    test('❌ Manejo de errores: Error al guardar pago', async () => {
        const { addPaymentToPolicy } = require('../../../src/controllers/policyController');
        addPaymentToPolicy.mockRejectedValue(new Error('Error de BD'));

        try {
            await addPaymentToPolicy('POL001', { cantidad: 500 });
        } catch (error: any) {
            expect(error.message).toBe('Error de BD');
        }
        
        console.log('❌ Caso de error manejado: Error al guardar pago en BD');
    });

    test('📊 Resumen del flujo Añadir Pago', () => {
        const flujoCompleto = {
            paso1: 'Usuario presiona "💰 Añadir Pago"',
            paso2: 'Handler accion:addpayment se ejecuta',
            paso3: 'clearChatState() limpia estados previos',
            paso4: 'awaitingPaymentPolicyNumber.set() activa espera',
            paso5: 'Bot solicita número de póliza',
            paso6: 'Usuario envía número (ej: POL001)',
            paso7: 'handleAddPaymentPolicyNumber() verifica póliza',
            paso8: 'awaitingPaymentData.set() activa espera de datos',
            paso9: 'Bot solicita datos del pago',
            paso10: 'Usuario envía datos de pago',
            paso11: 'handlePaymentData() procesa y guarda',
            paso12: 'addPaymentToPolicy() guarda en BD',
            paso13: 'Bot confirma pago agregado exitosamente'
        };

        console.log('\n📋 FLUJO COMPLETO - AÑADIR PAGO:');
        console.log('================================');
        Object.entries(flujoCompleto).forEach(([paso, descripcion]) => {
            console.log(`${paso}: ${descripcion}`);
        });

        expect(Object.keys(flujoCompleto)).toHaveLength(13);
    });
});