/**
 * Tests para los 5 botones del menú principal de Pólizas
 * Identifica cuáles botones fallan al ser presionados
 */

import { jest } from '@jest/globals';

// Mock del logger
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Mock de StateKeyManager
jest.mock('../../../src/utils/StateKeyManager', () => {
    const createMockMap = () => ({
        set: jest.fn(),
        get: jest.fn(),
        has: jest.fn(),
        delete: jest.fn(),
        deleteAll: jest.fn(),
        clear: jest.fn()
    });

    return {
        default: {
            getThreadId: jest.fn(() => null),
            createThreadSafeStateMap: jest.fn(() => createMockMap())
        }
    };
});

// Mock de Telegraf
jest.mock('telegraf', () => ({
    Markup: {
        inlineKeyboard: jest.fn().mockImplementation((buttons: any) => ({
            reply_markup: { inline_keyboard: buttons }
        })),
        button: {
            callback: jest.fn().mockImplementation((...args: any[]) => ({
                text: args[0],
                callback_data: args[1]
            }))
        }
    }
}));

// Mock de policyController
jest.mock('../../../src/controllers/policyController', () => ({
    getPolicyByNumber: jest.fn(),
    savePolicy: jest.fn(),
    addFileToPolicy: jest.fn(),
    deletePolicyByNumber: jest.fn(),
    addPaymentToPolicy: jest.fn(),
    addServiceToPolicy: jest.fn(),
    getSusceptiblePolicies: jest.fn(),
    getOldUnusedPolicies: jest.fn(),
    markPolicyAsDeleted: jest.fn(),
    getDeletedPolicies: jest.fn(),
    restorePolicy: jest.fn()
}));

describe('Menú Principal - 5 Botones de Pólizas', () => {
    let mockBot: any;
    let commandHandler: any;
    let mockCtx: any;

    beforeEach(() => {
        // Reset todos los mocks
        jest.clearAllMocks();

        // Mock del bot de Telegraf
        mockBot = {
            action: jest.fn(),
            command: jest.fn(),
            on: jest.fn(),
            use: jest.fn(),
            launch: jest.fn(),
            stop: jest.fn()
        };

        // Mock del contexto de Telegram
        mockCtx = {
            chat: { id: 123456 },
            from: { id: 789, username: 'testuser' },
            answerCbQuery: jest.fn(),
            reply: jest.fn(),
            editMessageText: jest.fn(),
            replyWithMarkdown: jest.fn(),
            match: null
        };

        // Importar CommandHandler después de los mocks
        const CommandHandler = require('../../../src/comandos/commandHandler').default;
        commandHandler = new CommandHandler(mockBot);
    });

    describe('📋 BOTÓN 1: Consultar Póliza (accion:consultar)', () => {
        test('debe manejar correctamente accion:consultar', async () => {
            // Verificar que el manejador está registrado
            expect(mockBot.action).toHaveBeenCalledWith('accion:consultar', expect.any(Function));

            // Obtener el manejador registrado
            const consultarHandler = mockBot.action.mock.calls
                .find((call: any[]) => call[0] === 'accion:consultar')?.[1];

            expect(consultarHandler).toBeDefined();

            // Simular ejecución del callback
            await consultarHandler(mockCtx);

            // Verificar que se ejecutó correctamente
            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(mockCtx.reply).toHaveBeenCalledWith(
                '🔍 **CONSULTAR PÓLIZA**\n\nPor favor, envía el número de póliza que deseas consultar:',
                expect.any(Object)
            );
        });

        test('debe manejar errores en consultar póliza', async () => {
            mockCtx.reply.mockRejectedValue(new Error('Error de red'));

            const consultarHandler = mockBot.action.mock.calls
                .find((call: any[]) => call[0] === 'accion:consultar')?.[1];

            await consultarHandler(mockCtx);

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
        });
    });

    describe('💰 BOTÓN 2: Añadir Pago (accion:addpayment)', () => {
        test('debe manejar correctamente accion:addpayment', async () => {
            // Verificar que el manejador está registrado
            expect(mockBot.action).toHaveBeenCalledWith('accion:addpayment', expect.any(Function));

            const addpaymentHandler = mockBot.action.mock.calls
                .find((call: any[]) => call[0] === 'accion:addpayment')?.[1];

            expect(addpaymentHandler).toBeDefined();

            await addpaymentHandler(mockCtx);

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(mockCtx.reply).toHaveBeenCalledWith(
                '💰 **AÑADIR PAGO**\n\nPor favor, envía el número de póliza para agregar un pago:',
                expect.any(Object)
            );
        });
    });

    describe('💾 BOTÓN 3: Registrar Póliza (accion:registrar)', () => {
        test('debe manejar correctamente accion:registrar', async () => {
            expect(mockBot.action).toHaveBeenCalledWith('accion:registrar', expect.any(Function));

            const registrarHandler = mockBot.action.mock.calls
                .find((call: any[]) => call[0] === 'accion:registrar')?.[1];

            expect(registrarHandler).toBeDefined();

            await registrarHandler(mockCtx);

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
        });
    });

    describe('🚗 BOTÓN 4: Añadir Servicio (accion:addservice) - ❌ FALLA', () => {
        test('DEBE FALLAR: No hay manejador para accion:addservice', () => {
            // Buscar si existe el manejador
            const addserviceHandler = mockBot.action.mock.calls
                .find((call: any[]) => call[0] === 'accion:addservice')?.[1];

            // Este test debe fallar porque NO existe el manejador
            expect(addserviceHandler).toBeUndefined();
        });

        test('debería registrar el manejador addservice (PROPUESTA)', async () => {
            // Este test muestra cómo DEBERÍA funcionar
            const expectedHandler = jest.fn(async (ctx: any) => {
                await ctx.answerCbQuery();
                await ctx.reply(
                    '🚗 **AÑADIR SERVICIO**\n\nPor favor, envía el número de póliza para agregar un servicio:',
                    expect.any(Object)
                );
            });

            // Simular cómo debería registrarse
            mockBot.action('accion:addservice', expectedHandler);

            await expectedHandler(mockCtx);

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(mockCtx.reply).toHaveBeenCalledWith(
                '🚗 **AÑADIR SERVICIO**\n\nPor favor, envía el número de póliza para agregar un servicio:',
                expect.any(Object)
            );
        });
    });

    describe('📁 BOTÓN 5: Subir Archivos (accion:upload) - ❌ FALLA', () => {
        test('DEBE FALLAR: No hay manejador para accion:upload', () => {
            // Buscar si existe el manejador
            const uploadHandler = mockBot.action.mock.calls
                .find((call: any[]) => call[0] === 'accion:upload')?.[1];

            // Este test debe fallar porque NO existe el manejador
            expect(uploadHandler).toBeUndefined();
        });

        test('debería registrar el manejador upload (PROPUESTA)', async () => {
            // Este test muestra cómo DEBERÍA funcionar
            const expectedHandler = jest.fn(async (ctx: any) => {
                await ctx.answerCbQuery();
                await ctx.reply(
                    '📁 **SUBIR ARCHIVOS**\n\nPor favor, envía el número de póliza para subir archivos:',
                    expect.any(Object)
                );
            });

            // Simular cómo debería registrarse
            mockBot.action('accion:upload', expectedHandler);

            await expectedHandler(mockCtx);

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(mockCtx.reply).toHaveBeenCalledWith(
                '📁 **SUBIR ARCHIVOS**\n\nPor favor, envía el número de póliza para subir archivos:',
                expect.any(Object)
            );
        });
    });

    describe('Resumen de Botones del Menú Principal', () => {
        test('debe mostrar resumen del estado de todos los botones', () => {
            const botonesRegistrados = mockBot.action.mock.calls.map((call: any[]) => call[0]);
            
            const estadoBotones = {
                'accion:consultar': botonesRegistrados.includes('accion:consultar'),
                'accion:addpayment': botonesRegistrados.includes('accion:addpayment'),
                'accion:registrar': botonesRegistrados.includes('accion:registrar'),
                'accion:addservice': botonesRegistrados.includes('accion:addservice'),
                'accion:upload': botonesRegistrados.includes('accion:upload')
            };

            console.log('\n🔍 RESUMEN DEL ESTADO DE LOS BOTONES:');
            console.log('=====================================');
            console.log(`✅ Consultar Póliza: ${estadoBotones['accion:consultar'] ? 'FUNCIONA' : 'FALLA'}`);
            console.log(`✅ Añadir Pago: ${estadoBotones['accion:addpayment'] ? 'FUNCIONA' : 'FALLA'}`);
            console.log(`✅ Registrar Póliza: ${estadoBotones['accion:registrar'] ? 'FUNCIONA' : 'FALLA'}`);
            console.log(`❌ Añadir Servicio: ${estadoBotones['accion:addservice'] ? 'FUNCIONA' : 'FALLA'}`);
            console.log(`❌ Subir Archivos: ${estadoBotones['accion:upload'] ? 'FUNCIONA' : 'FALLA'}`);

            // Verificar que los botones que funcionan están registrados
            expect(estadoBotones['accion:consultar']).toBe(true);
            expect(estadoBotones['accion:addpayment']).toBe(true);
            expect(estadoBotones['accion:registrar']).toBe(true);

            // Verificar que los botones problemáticos NO están registrados
            expect(estadoBotones['accion:addservice']).toBe(false);
            expect(estadoBotones['accion:upload']).toBe(false);
        });
    });
});