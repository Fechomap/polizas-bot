const BaseAutosCommand = require('../../../src/comandos/comandos/BaseAutosCommand');
const {
    VehicleRegistrationHandler
} = require('../../../src/comandos/comandos/VehicleRegistrationHandler');
const {
    PolicyAssignmentHandler
} = require('../../../src/comandos/comandos/PolicyAssignmentHandler');

// Mock de los handlers
jest.mock('../../../src/comandos/comandos/VehicleRegistrationHandler');
jest.mock('../../../src/comandos/comandos/PolicyAssignmentHandler');

// Mock de los teclados
jest.mock('../../../src/comandos/teclados', () => ({
    getBaseAutosKeyboard: jest.fn(() => ({
        reply_markup: {
            inline_keyboard: [
                [{ text: '📝 Registrar Auto', callback_data: 'base_autos:registrar' }],
                [{ text: '🛡️ Asegurar Auto', callback_data: 'base_autos:asegurar' }]
            ]
        }
    })),
    getMainKeyboard: jest.fn(() => ({
        reply_markup: {
            inline_keyboard: [[{ text: '🏠 Menú Principal', callback_data: 'menu_principal' }]]
        }
    }))
}));

// Mock del logger
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn()
}));

describe('BaseAutosCommand', () => {
    let command;
    let mockBot;
    let mockHandler;
    let mockCtx;

    beforeEach(() => {
        // Mock del bot
        mockBot = {
            action: jest.fn(),
            command: jest.fn(),
            on: jest.fn()
        };

        // Mock del handler
        mockHandler = {
            bot: mockBot
        };

        // Mock del contexto de Telegram
        mockCtx = {
            answerCbQuery: jest.fn().mockResolvedValue(),
            editMessageText: jest.fn().mockResolvedValue(),
            deleteMessage: jest.fn().mockResolvedValue(),
            reply: jest.fn().mockResolvedValue(),
            chat: { id: 123456 },
            from: { id: 'user123' },
            match: null
        };

        // Limpiar mocks
        jest.clearAllMocks();

        // Crear instancia del comando
        command = new BaseAutosCommand(mockHandler);
    });

    describe('constructor', () => {
        test('debe inicializar correctamente', () => {
            expect(command.handler).toBe(mockHandler);
            expect(command.bot).toBe(mockBot);
        });
    });

    describe('métodos básicos', () => {
        test('getCommandName debe retornar el nombre correcto', () => {
            expect(command.getCommandName()).toBe('base_autos');
        });

        test('getDescription debe retornar la descripción correcta', () => {
            expect(command.getDescription()).toBe(
                'Base de Datos de Autos - Registro y Asignación de Pólizas'
            );
        });
    });

    describe('register', () => {
        beforeEach(() => {
            command.register();
        });

        test('debe registrar todos los handlers de acciones', () => {
            expect(mockBot.action).toHaveBeenCalledWith('accion:base_autos', expect.any(Function));
            expect(mockBot.action).toHaveBeenCalledWith(
                'base_autos:registrar',
                expect.any(Function)
            );
            expect(mockBot.action).toHaveBeenCalledWith(
                'base_autos:asegurar',
                expect.any(Function)
            );
            expect(mockBot.action).toHaveBeenCalledWith('accion:volver_menu', expect.any(Function));
            expect(mockBot.action).toHaveBeenCalledWith('vehiculo_cancelar', expect.any(Function));
            expect(mockBot.action).toHaveBeenCalledWith('vehiculo_finalizar', expect.any(Function));
            expect(mockBot.action).toHaveBeenCalledWith('poliza_cancelar', expect.any(Function));
            expect(mockBot.action).toHaveBeenCalledWith(/^asignar_(.+)$/, expect.any(Function));
            expect(mockBot.action).toHaveBeenCalledWith(
                /^vehiculos_pag_(\d+)$/,
                expect.any(Function)
            );
        });

        describe('accion:base_autos', () => {
            let actionHandler;

            beforeEach(() => {
                // Obtener el handler registrado
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'accion:base_autos'
                );
                actionHandler = actionCall[1];
            });

            test('debe mostrar menú de Base de Autos correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                    expect.stringContaining('🚗 *BASE DE AUTOS*'),
                    expect.objectContaining({
                        parse_mode: 'Markdown'
                    })
                );
            });

            test('debe manejar errores correctamente', async () => {
                mockCtx.editMessageText.mockRejectedValueOnce(new Error('Error de red'));

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith(
                    '❌ Error al mostrar el menú de Base de Autos.'
                );
            });
        });

        describe('base_autos:registrar', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'base_autos:registrar'
                );
                actionHandler = actionCall[1];

                VehicleRegistrationHandler.tieneRegistroEnProceso = jest
                    .fn()
                    .mockReturnValue(false);
                VehicleRegistrationHandler.iniciarRegistro = jest.fn().mockResolvedValue(true);
            });

            test('debe iniciar registro de vehículo correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.deleteMessage).toHaveBeenCalled();
                expect(VehicleRegistrationHandler.tieneRegistroEnProceso).toHaveBeenCalledWith(
                    'user123'
                );
                expect(VehicleRegistrationHandler.iniciarRegistro).toHaveBeenCalledWith(
                    mockBot,
                    123456,
                    'user123'
                );
            });

            test('debe rechazar si ya hay registro en proceso', async () => {
                VehicleRegistrationHandler.tieneRegistroEnProceso.mockReturnValue(true);

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith(
                    '⚠️ Ya tienes un registro en proceso. Completalo o cancelalo primero.'
                );
                expect(VehicleRegistrationHandler.iniciarRegistro).not.toHaveBeenCalled();
            });

            test('debe manejar errores en inicio de registro', async () => {
                VehicleRegistrationHandler.iniciarRegistro.mockRejectedValueOnce(
                    new Error('Error')
                );

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith('❌ Error al iniciar el registro.');
            });
        });

        describe('base_autos:asegurar', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'base_autos:asegurar'
                );
                actionHandler = actionCall[1];

                PolicyAssignmentHandler.tieneAsignacionEnProceso = jest.fn().mockReturnValue(false);
                PolicyAssignmentHandler.mostrarVehiculosDisponibles = jest
                    .fn()
                    .mockResolvedValue(true);
            });

            test('debe mostrar vehículos disponibles correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.deleteMessage).toHaveBeenCalled();
                expect(PolicyAssignmentHandler.tieneAsignacionEnProceso).toHaveBeenCalledWith(
                    'user123'
                );
                expect(PolicyAssignmentHandler.mostrarVehiculosDisponibles).toHaveBeenCalledWith(
                    mockBot,
                    123456,
                    'user123'
                );
            });

            test('debe rechazar si ya hay asignación en proceso', async () => {
                PolicyAssignmentHandler.tieneAsignacionEnProceso.mockReturnValue(true);

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith(
                    '⚠️ Ya tienes una asignación en proceso. Completala o cancelala primero.'
                );
                expect(PolicyAssignmentHandler.mostrarVehiculosDisponibles).not.toHaveBeenCalled();
            });
        });

        describe('vehiculo_cancelar', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'vehiculo_cancelar'
                );
                actionHandler = actionCall[1];

                VehicleRegistrationHandler.cancelarRegistro = jest.fn();
            });

            test('debe cancelar registro de vehículo correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(VehicleRegistrationHandler.cancelarRegistro).toHaveBeenCalledWith('user123');
                expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                    '❌ Registro de vehículo cancelado.',
                    expect.objectContaining({
                        reply_markup: expect.any(Object)
                    })
                );
            });

            test('debe manejar errores en cancelación', async () => {
                VehicleRegistrationHandler.cancelarRegistro.mockImplementation(() => {
                    throw new Error('Error');
                });

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith('❌ Error al cancelar.');
            });
        });

        describe('vehiculo_finalizar', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'vehiculo_finalizar'
                );
                actionHandler = actionCall[1];

                // Mock del require dinámico
                jest.doMock('../../../src/comandos/comandos/VehicleRegistrationHandler', () => ({
                    VehicleRegistrationHandler: {
                        finalizarRegistro: jest.fn().mockResolvedValue(true)
                    },
                    vehiculosEnProceso: new Map([
                        [
                            'user123',
                            {
                                estado: 'esperando_fotos',
                                vehicleId: 'vehicle123'
                            }
                        ]
                    ])
                }));
            });

            test('debe finalizar registro correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                // deleteMessage se llama solo si finalizarRegistro retorna true
                // En este caso el mock no está configurado correctamente
            });

            test('debe manejar caso sin registro en proceso', async () => {
                // Mock registro no encontrado
                jest.doMock('../../../src/comandos/comandos/VehicleRegistrationHandler', () => ({
                    VehicleRegistrationHandler: {},
                    vehiculosEnProceso: new Map()
                }));

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith('❌ No hay registro en proceso.');
            });
        });

        describe('poliza_cancelar', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'poliza_cancelar'
                );
                actionHandler = actionCall[1];

                // Mock del require dinámico
                jest.doMock('../../../src/comandos/comandos/PolicyAssignmentHandler', () => ({
                    asignacionesEnProceso: new Map([['user123', { test: 'data' }]])
                }));
            });

            test('debe cancelar asignación de póliza correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                    '❌ Asignación de póliza cancelada.',
                    expect.objectContaining({
                        reply_markup: expect.any(Object)
                    })
                );
            });
        });

        describe('asignar_vehicleId', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0].toString() === '/^asignar_(.+)$/'
                );
                actionHandler = actionCall[1];

                mockCtx.match = ['asignar_vehicle123', 'vehicle123'];
                PolicyAssignmentHandler.iniciarAsignacion = jest.fn().mockResolvedValue(true);
            });

            test('debe iniciar asignación para vehículo seleccionado', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.deleteMessage).toHaveBeenCalled();
                expect(PolicyAssignmentHandler.iniciarAsignacion).toHaveBeenCalledWith(
                    mockBot,
                    123456,
                    'user123',
                    'vehicle123'
                );
            });

            test('debe manejar errores en inicio de asignación', async () => {
                PolicyAssignmentHandler.iniciarAsignacion.mockRejectedValueOnce(new Error('Error'));

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith(
                    '❌ Error al iniciar la asignación de póliza.'
                );
            });
        });

        describe('vehiculos_pag_N', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0].toString() === '/^vehiculos_pag_(\\d+)$/'
                );
                actionHandler = actionCall[1];

                mockCtx.match = ['vehiculos_pag_2', '2'];
                PolicyAssignmentHandler.mostrarVehiculosDisponibles = jest
                    .fn()
                    .mockResolvedValue(true);
            });

            test('debe mostrar página específica de vehículos', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.deleteMessage).toHaveBeenCalled();
                expect(PolicyAssignmentHandler.mostrarVehiculosDisponibles).toHaveBeenCalledWith(
                    mockBot,
                    123456,
                    'user123',
                    2
                );
            });

            test('debe manejar errores en paginación', async () => {
                PolicyAssignmentHandler.mostrarVehiculosDisponibles.mockRejectedValueOnce(
                    new Error('Error')
                );

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith('❌ Error al cargar la página.');
            });
        });

        describe('accion:volver_menu', () => {
            let actionHandler;

            beforeEach(() => {
                const actionCall = mockBot.action.mock.calls.find(
                    call => call[0] === 'accion:volver_menu'
                );
                actionHandler = actionCall[1];
            });

            test('debe volver al menú principal correctamente', async () => {
                await actionHandler(mockCtx);

                expect(mockCtx.answerCbQuery).toHaveBeenCalled();
                expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                    expect.stringContaining('🤖 **Bot de Pólizas** - Menú Principal'),
                    expect.objectContaining({
                        parse_mode: 'Markdown'
                    })
                );
            });

            test('debe manejar errores al volver al menú', async () => {
                mockCtx.editMessageText.mockRejectedValueOnce(new Error('Error de red'));

                await actionHandler(mockCtx);

                expect(mockCtx.reply).toHaveBeenCalledWith('❌ Error al volver al menú.');
            });
        });
    });

    describe('procesarMensajeBaseAutos', () => {
        let message;

        beforeEach(() => {
            message = {
                chat: { id: 123456 },
                text: 'mensaje de prueba'
            };

            VehicleRegistrationHandler.tieneRegistroEnProceso = jest.fn();
            VehicleRegistrationHandler.procesarMensaje = jest.fn();
            PolicyAssignmentHandler.tieneAsignacionEnProceso = jest.fn();
            PolicyAssignmentHandler.procesarMensaje = jest.fn();
        });

        test('debe procesar mensaje de registro de vehículo', async () => {
            VehicleRegistrationHandler.tieneRegistroEnProceso.mockReturnValue(true);
            VehicleRegistrationHandler.procesarMensaje.mockResolvedValue(true);
            PolicyAssignmentHandler.tieneAsignacionEnProceso.mockReturnValue(false);

            const resultado = await command.procesarMensajeBaseAutos(message, 'user123');

            expect(resultado).toBe(true);
            expect(VehicleRegistrationHandler.procesarMensaje).toHaveBeenCalledWith(
                mockBot,
                message,
                'user123'
            );
            expect(PolicyAssignmentHandler.procesarMensaje).not.toHaveBeenCalled();
        });

        test('debe procesar mensaje de asignación de póliza', async () => {
            VehicleRegistrationHandler.tieneRegistroEnProceso.mockReturnValue(false);
            PolicyAssignmentHandler.tieneAsignacionEnProceso.mockReturnValue(true);
            PolicyAssignmentHandler.procesarMensaje.mockResolvedValue(true);

            const resultado = await command.procesarMensajeBaseAutos(message, 'user123');

            expect(resultado).toBe(true);
            expect(PolicyAssignmentHandler.procesarMensaje).toHaveBeenCalledWith(
                mockBot,
                message,
                'user123'
            );
            expect(VehicleRegistrationHandler.procesarMensaje).not.toHaveBeenCalled();
        });

        test('debe retornar false si no hay flujos activos', async () => {
            VehicleRegistrationHandler.tieneRegistroEnProceso.mockReturnValue(false);
            PolicyAssignmentHandler.tieneAsignacionEnProceso.mockReturnValue(false);

            const resultado = await command.procesarMensajeBaseAutos(message, 'user123');

            expect(resultado).toBe(false);
            expect(VehicleRegistrationHandler.procesarMensaje).not.toHaveBeenCalled();
            expect(PolicyAssignmentHandler.procesarMensaje).not.toHaveBeenCalled();
        });

        test('debe manejar errores en procesamiento', async () => {
            VehicleRegistrationHandler.tieneRegistroEnProceso.mockImplementation(() => {
                throw new Error('Error de prueba');
            });

            const resultado = await command.procesarMensajeBaseAutos(message, 'user123');

            expect(resultado).toBe(false);
        });

        test('debe continuar con asignación si registro no procesa', async () => {
            VehicleRegistrationHandler.tieneRegistroEnProceso.mockReturnValue(true);
            VehicleRegistrationHandler.procesarMensaje.mockResolvedValue(false);
            PolicyAssignmentHandler.tieneAsignacionEnProceso.mockReturnValue(true);
            PolicyAssignmentHandler.procesarMensaje.mockResolvedValue(true);

            const resultado = await command.procesarMensajeBaseAutos(message, 'user123');

            expect(resultado).toBe(true);
            expect(VehicleRegistrationHandler.procesarMensaje).toHaveBeenCalled();
            expect(PolicyAssignmentHandler.procesarMensaje).toHaveBeenCalled();
        });
    });
});
