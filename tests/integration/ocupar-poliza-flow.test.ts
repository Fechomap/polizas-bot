/**
 * @fileoverview Test de integración para el flujo completo de "ocupar póliza"
 * Verifica que todos los componentes del flujo funcionen correctamente
 */

// Mock del NotificationManager antes de importar
jest.mock('../../src/services/NotificationManager');

import OcuparPolizaCallback from '../../src/comandos/comandos/OcuparPolizaCallback';
import StateKeyManager from '../../src/utils/StateKeyManager';
import flowStateManager from '../../src/utils/FlowStateManager';
import * as policyController from '../../src/controllers/policyController';
import HereMapsService from '../../src/services/HereMapsService';
import { getInstance } from '../../src/services/NotificationManager';

// Mock del contexto de Telegram
const createMockContext = () => ({
    chat: { id: -1002291817096 },
    message: { message_thread_id: 16282 },
    reply: jest.fn().mockResolvedValue({ message_id: Date.now() }),
    telegram: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: Date.now() })
    },
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
    match: null
});

// Mock del handler
const createMockHandler = () => {
    const mockHandler = {
        awaitingPhoneNumber: StateKeyManager.createThreadSafeStateMap<string>(),
        awaitingOrigenDestino: StateKeyManager.createThreadSafeStateMap<string>(),
        awaitingOrigen: StateKeyManager.createThreadSafeStateMap<string>(),
        awaitingDestino: StateKeyManager.createThreadSafeStateMap<string>(),
        awaitingServiceData: StateKeyManager.createThreadSafeStateMap<string>(),
        awaitingServicePolicyNumber: StateKeyManager.createThreadSafeStateMap<boolean>(),
        uploadTargets: StateKeyManager.createThreadSafeStateMap<string>(),
        // Estados adicionales que usa cleanupAllStates
        awaitingContactTime: StateKeyManager.createThreadSafeStateMap<string>(),
        pendingLeyendas: StateKeyManager.createThreadSafeStateMap<string>(),
        polizaCache: StateKeyManager.createThreadSafeStateMap<any>(),
        messageIds: StateKeyManager.createThreadSafeStateMap<number>(),
        scheduledServiceInfo: StateKeyManager.createThreadSafeStateMap<any>(),
        registry: {
            registerCallback: jest.fn(),
            getAllCommands: jest.fn().mockReturnValue([])
        },
        clearChatState: jest.fn()
    };
    
    // Sobrescribir el método clearChatState para que también limpie los estados mock
    mockHandler.clearChatState = jest.fn().mockImplementation((chatId: number, threadId: string | null) => {
        if (threadId) {
            mockHandler.awaitingPhoneNumber.delete(chatId, threadId);
            mockHandler.awaitingOrigenDestino.delete(chatId, threadId);
            mockHandler.awaitingOrigen.delete(chatId, threadId);
            mockHandler.awaitingDestino.delete(chatId, threadId);
            mockHandler.awaitingServiceData.delete(chatId, threadId);
            mockHandler.awaitingServicePolicyNumber.delete(chatId, threadId);
            mockHandler.uploadTargets.delete(chatId, threadId);
            mockHandler.awaitingContactTime.delete(chatId, threadId);
            mockHandler.pendingLeyendas.delete(chatId, threadId);
            mockHandler.polizaCache.delete(chatId, threadId);
            mockHandler.messageIds.delete(chatId, threadId);
            mockHandler.scheduledServiceInfo.delete(chatId, threadId);
        }
    });
    
    return mockHandler;
};

// Mock de la póliza de prueba
const mockPolicy = {
    numeroPoliza: '677206567',
    aseguradora: 'GNP',
    marca: 'RENAULT',
    submarca: 'LOGAN',
    año: 2017,
    telefono: '5578833150',
    titular: 'Jéssica Navarro Guerra',
    estado: 'ACTIVO'
};

describe('Flujo de Ocupar Póliza - Integración Completa', () => {
    let ocuparPoliza: OcuparPolizaCallback;
    let mockHandler: any;
    let mockContext: any;

    beforeEach(() => {
        // Limpiar todos los mocks
        jest.clearAllMocks();
        
        // Crear nuevas instancias
        mockHandler = createMockHandler();
        mockContext = createMockContext();
        
        // Mock de HERE Maps Service
        jest.spyOn(HereMapsService.prototype, 'calculateRoute').mockResolvedValue({
            distanciaKm: 42.5,
            tiempoMinutos: 35,
            googleMapsUrl: 'https://www.google.com/maps/dir/19.437,-98.961/19.837,-99.213',
            aproximado: false
        });
        
        jest.spyOn(HereMapsService.prototype, 'reverseGeocode').mockResolvedValue({
            colonia: 'Centro',
            municipio: 'Municipio Test',
            estado: 'Estado Test',
            pais: 'México',
            codigoPostal: '12345',
            ubicacionCorta: 'Centro - Municipio Test',
            direccionCompleta: 'Calle Test 123, Centro, Municipio Test',
            fallback: false
        });
        
        jest.spyOn(HereMapsService.prototype, 'generateGoogleMapsUrl').mockReturnValue(
            'https://www.google.com/maps/dir/19.437,-98.961/19.837,-99.213'
        );
        
        ocuparPoliza = new OcuparPolizaCallback(mockHandler);
        
        // Limpiar estados del FlowStateManager
        flowStateManager.clearAllStates(-1002291817096, '16282');
        
        // Mock de getPolicyByNumber con registros
        const mockPolicyWithRegistros = {
            ...mockPolicy,
            registros: [{
                numeroRegistro: 1,
                numeroExpediente: '21010038',
                origenDestino: 'Barrio Hojalateros - Chimalhuacán - Salitrillo - Huehuetoca',
                rutaInfo: {
                    tiempoMinutos: 67,
                    distanciaKm: 68.18
                }
            }]
        };
        
        jest.spyOn(policyController, 'getPolicyByNumber')
            .mockResolvedValue(mockPolicyWithRegistros as any);
            
        // Mock de funciones de servicio
        jest.spyOn(policyController, 'calcularHorasAutomaticas').mockReturnValue({
            fechaContactoProgramada: new Date('2025-07-20T18:00:00.000Z'),
            fechaTerminoProgramada: new Date('2025-07-20T20:00:00.000Z'),
            minutosContacto: 60,
            minutosTermino: 180,
            tiempoTrayectoBase: 67,
            factorMultiplicador: 1.6
        });
        
        jest.spyOn(policyController, 'convertirRegistroAServicio').mockResolvedValue({
            updatedPolicy: mockPolicyWithRegistros as any,
            numeroServicio: 123
        });
        
        jest.spyOn(policyController, 'marcarRegistroNoAsignado').mockResolvedValue(mockPolicyWithRegistros as any);
        
        // Mock de NotificationManager
        const mockNotificationManager = {
            isInitialized: true,
            scheduleNotification: jest.fn().mockResolvedValue({ _id: 'mock-notification-id' })
        };
        
        const mockedGetInstance = getInstance as jest.MockedFunction<typeof getInstance>;
        mockedGetInstance.mockReturnValue(mockNotificationManager as any);
    });

    afterEach(() => {
        // Limpiar estados después de cada test
        flowStateManager.clearAllStates(-1002291817096, '16282');
        jest.restoreAllMocks();
    });

    describe('Paso 1: handleOrigen', () => {
        beforeEach(() => {
            // Configurar estado inicial: esperar coordenadas de origen
            mockHandler.awaitingOrigen.set(-1002291817096, '677206567', '16282');
        });

        it('debe procesar correctamente coordenadas de origen como texto', async () => {
            const coordenadas = '19.437008155948053, -98.96147458721242';
            
            const result = await ocuparPoliza.handleOrigen(
                mockContext, 
                coordenadas, 
                '16282'
            );

            expect(result).toBe(true);
            
            // Verificar que se envió respuesta correcta
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('✅ Origen registrado'),
                { parse_mode: 'Markdown' }
            );

            // Verificar que se guardó en FlowStateManager
            const savedState = flowStateManager.getState(-1002291817096, '677206567', '16282');
            expect(savedState).toBeTruthy();
            expect(savedState?.origenCoords).toEqual({
                lat: 19.437008155948053,
                lng: -98.96147458721242
            });

            // Verificar transición de estados
            expect(mockHandler.awaitingOrigen.has(-1002291817096, '16282')).toBe(false);
            expect(mockHandler.awaitingDestino.has(-1002291817096, '16282')).toBe(true);
        });

        it('debe rechazar coordenadas en formato inválido', async () => {
            const coordenadasInvalidas = 'coordenadas inválidas';
            
            const result = await ocuparPoliza.handleOrigen(
                mockContext, 
                coordenadasInvalidas, 
                '16282'
            );

            expect(result).toBe(false);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Formato inválido'),
                { parse_mode: 'Markdown' }
            );

            // Verificar que no se guardó nada
            const savedState = flowStateManager.getState(-1002291817096, '677206567', '16282');
            expect(savedState?.origenCoords).toBeFalsy();
        });

        it('debe procesar ubicación de Telegram', async () => {
            const telegramLocation = {
                location: {
                    latitude: 19.437008155948053,
                    longitude: -98.96147458721242
                }
            };
            
            const result = await ocuparPoliza.handleOrigen(
                mockContext, 
                telegramLocation, 
                '16282'
            );

            expect(result).toBe(true);
            
            // Verificar que se guardó la ubicación correctamente
            const savedState = flowStateManager.getState(-1002291817096, '677206567', '16282');
            expect(savedState?.origenCoords).toEqual({
                lat: 19.437008155948053,
                lng: -98.96147458721242
            });
        });
    });

    describe('Paso 2: handleDestino', () => {
        beforeEach(async () => {
            // Configurar estado: ya tenemos origen guardado
            flowStateManager.saveState(-1002291817096, '677206567', {
                origenCoords: {
                    lat: 19.437008155948053,
                    lng: -98.96147458721242
                }
            }, '16282');
            
            // Configurar estado: esperar coordenadas de destino
            mockHandler.awaitingDestino.set(-1002291817096, '677206567', '16282');
        });

        it('debe procesar correctamente el flujo completo hasta el final', async () => {
            const coordenadasDestino = '19.83658153882097, -99.21283398134835';
            
            const result = await ocuparPoliza.handleDestino(
                mockContext, 
                coordenadasDestino, 
                '16282'
            );

            expect(result).toBe(true);

            // Verificar que se llamó a getPolicyByNumber
            expect(policyController.getPolicyByNumber).toHaveBeenCalledWith('677206567');

            // Verificar que se intentó enviar leyenda al grupo
            expect(mockContext.telegram.sendMessage).toHaveBeenCalledWith(
                -1002212807945, // ID del grupo target
                expect.stringContaining('🔥 A L E R T A')
            );

            // Verificar respuesta al usuario con opciones de servicio
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('✅ Destino registrado'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    link_preview_options: { is_disabled: true }
                })
            );

            // Verificar que se guardaron datos completos en FlowStateManager
            const finalState = flowStateManager.getState(-1002291817096, '677206567', '16282');
            expect(finalState).toBeTruthy();
            expect(finalState?.origenCoords).toBeTruthy();
            expect(finalState?.destinoCoords).toBeTruthy();
            expect(finalState?.rutaInfo).toBeTruthy();

            // Verificar limpieza de estados
            expect(mockHandler.awaitingDestino.has(-1002291817096, '16282')).toBe(false);
        });

        it('debe manejar error cuando no hay coordenadas de origen', async () => {
            // Limpiar estado de origen
            flowStateManager.clearState(-1002291817096, '677206567', '16282');
            
            const coordenadasDestino = '19.83658153882097, -99.21283398134835';
            
            const result = await ocuparPoliza.handleDestino(
                mockContext, 
                coordenadasDestino, 
                '16282'
            );

            expect(result).toBe(false);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Error: No se encontraron las coordenadas del origen')
            );
        });

        it('debe procesar ubicación de Telegram como destino', async () => {
            const telegramLocation = {
                location: {
                    latitude: 19.83658153882097,
                    longitude: -99.21283398134835
                }
            };
            
            const result = await ocuparPoliza.handleDestino(
                mockContext, 
                telegramLocation, 
                '16282'
            );

            expect(result).toBe(true);
            
            // Verificar que se procesó la ubicación
            const finalState = flowStateManager.getState(-1002291817096, '677206567', '16282');
            expect(finalState?.destinoCoords).toEqual({
                lat: 19.83658153882097,
                lng: -99.21283398134835
            });
        });
    });

    describe('Limpieza de Estados', () => {
        beforeEach(() => {
            // Configurar estados simulando un flujo completo
            flowStateManager.saveState(-1002291817096, '677206567', {
                origenCoords: { lat: 19.4, lng: -98.9 },
                destinoCoords: { lat: 19.8, lng: -99.2 }
            }, '16282');
            
            mockHandler.awaitingOrigen.set(-1002291817096, '677206567', '16282');
            mockHandler.awaitingDestino.set(-1002291817096, '677206567', '16282');
        });

        it('debe limpiar todos los estados correctamente', () => {
            // Verificar que hay estados antes de limpiar
            expect(flowStateManager.hasState(-1002291817096, '677206567', '16282')).toBe(true);
            expect(mockHandler.awaitingOrigen.has(-1002291817096, '16282')).toBe(true);
            expect(mockHandler.awaitingDestino.has(-1002291817096, '16282')).toBe(true);

            // Ejecutar limpieza
            ocuparPoliza.cleanupAllStates(-1002291817096, '16282');

            // Verificar que se limpiaron todos los estados
            expect(flowStateManager.hasState(-1002291817096, '677206567', '16282')).toBe(false);
            expect(mockHandler.awaitingOrigen.has(-1002291817096, '16282')).toBe(false);
            expect(mockHandler.awaitingDestino.has(-1002291817096, '16282')).toBe(false);
            
            // Verificar que se llamó a clearChatState del handler principal
            expect(mockHandler.clearChatState).toHaveBeenCalledWith(-1002291817096, '16282');
        });
    });

    describe('Integración Completa del Flujo', () => {
        it('debe ejecutar el flujo completo origen->destino->leyenda sin errores', async () => {
            // PASO 1: Configurar origen
            mockHandler.awaitingOrigen.set(-1002291817096, '677206567', '16282');
            
            const origenResult = await ocuparPoliza.handleOrigen(
                mockContext, 
                '19.437008155948053, -98.96147458721242', 
                '16282'
            );
            
            expect(origenResult).toBe(true);
            
            // PASO 2: Verificar transición de estado
            expect(mockHandler.awaitingOrigen.has(-1002291817096, '16282')).toBe(false);
            expect(mockHandler.awaitingDestino.has(-1002291817096, '16282')).toBe(true);
            
            // PASO 3: Procesar destino
            const destinoResult = await ocuparPoliza.handleDestino(
                mockContext, 
                '19.83658153882097, -99.21283398134835', 
                '16282'
            );
            
            expect(destinoResult).toBe(true);
            
            // PASO 4: Verificar estado final
            const finalState = flowStateManager.getState(-1002291817096, '677206567', '16282');
            expect(finalState).toMatchObject({
                origenCoords: {
                    lat: 19.437008155948053,
                    lng: -98.96147458721242
                },
                destinoCoords: {
                    lat: 19.83658153882097,
                    lng: -99.21283398134835
                }
            });
            
            // PASO 5: Verificar que se enviaron todos los mensajes esperados
            expect(mockContext.reply).toHaveBeenCalledTimes(2); // Origen + Destino
            expect(mockContext.telegram.sendMessage).toHaveBeenCalledTimes(1); // Leyenda al grupo
            
            // PASO 6: Verificar limpieza de estados
            expect(mockHandler.awaitingDestino.has(-1002291817096, '16282')).toBe(false);
            
            console.log('✅ Flujo completo ejecutado exitosamente');
        });
    });

    describe('Flujo Completo con Botón ASIGNADO', () => {
        it('debe ejecutar el flujo completo: origen->destino->servicio->ASIGNADO con notificaciones', async () => {
            // PASO 1-3: Ejecutar flujo completo hasta servicio
            mockHandler.awaitingOrigen.set(-1002291817096, '677206567', '16282');
            
            await ocuparPoliza.handleOrigen(
                mockContext, 
                '19.437008155948053, -98.96147458721242', 
                '16282'
            );
            
            await ocuparPoliza.handleDestino(
                mockContext, 
                '19.83658153882097, -99.21283398134835', 
                '16282'
            );

            // PASO 4: Simular registro de servicio (simplificado para test)
            // En el flujo real, el usuario haría clic en "registrar servicio" y luego ingresaría el expediente
            // Para el test, simulamos que ya se completó este paso y se tiene el registro preparado

            // PASO 5: Simular clic en botón ASIGNADO
            const asignadoContext = {
                ...mockContext,
                match: ['asig_yes_677206567_1', '677206567', '1'],
                editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
                answerCbQuery: jest.fn().mockResolvedValue(undefined)
            };

            // Simular el callback asig_yes que debería estar registrado
            let asignadoCallback: any = null;
            
            // Capturar el callback registrado
            const originalRegisterCallback = mockHandler.registry.registerCallback;
            mockHandler.registry.registerCallback = jest.fn().mockImplementation((pattern, handler) => {
                if (pattern.toString().includes('asig_yes')) {
                    asignadoCallback = handler;
                }
                return originalRegisterCallback(pattern, handler);
            });

            // Re-registrar callbacks para capturar asig_yes
            ocuparPoliza.register();

            // Verificar que se registró el callback
            expect(asignadoCallback).toBeTruthy();

            // PASO 6: Ejecutar callback de ASIGNADO
            await asignadoCallback(asignadoContext);

            // VERIFICACIONES FINALES
            
            // Verificar que se llamó a calcularHorasAutomaticas
            expect(policyController.calcularHorasAutomaticas).toHaveBeenCalledWith(
                expect.any(Date),
                67 // tiempoTrayecto del mock
            );

            // Verificar que se convirtió el registro a servicio
            expect(policyController.convertirRegistroAServicio).toHaveBeenCalledWith(
                '677206567',
                1,
                expect.any(Date), // fechaContactoProgramada
                expect.any(Date)  // fechaTerminoProgramada
            );

            // Verificar respuesta de confirmación
            expect(asignadoContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('✅ *Registro convertido a Servicio #123*'),
                { parse_mode: 'Markdown' }
            );

            // Verificar que se programaron notificaciones
            const mockNotificationManager = jest.mocked(getInstance)();
            expect(mockNotificationManager.scheduleNotification).toHaveBeenCalledTimes(2); // CONTACTO + TERMINO
            
            // Verificar notificación de CONTACTO
            expect(mockNotificationManager.scheduleNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    numeroPoliza: '677206567',
                    targetGroupId: -1002212807945,
                    expedienteNum: '21010038',
                    tipoNotificacion: 'CONTACTO'
                })
            );

            // Verificar notificación de TÉRMINO
            expect(mockNotificationManager.scheduleNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    numeroPoliza: '677206567',
                    targetGroupId: -1002212807945,
                    expedienteNum: '21010038',
                    tipoNotificacion: 'TERMINO'
                })
            );

            // Verificar que se removieron los botones
            expect(asignadoContext.editMessageReplyMarkup).toHaveBeenCalledWith({ inline_keyboard: [] });
            expect(asignadoContext.answerCbQuery).toHaveBeenCalled();

            console.log('✅ Flujo completo con ASIGNADO ejecutado exitosamente');
        });

        it('debe manejar el botón NO ASIGNADO correctamente', async () => {
            // Simular clic en botón NO ASIGNADO
            const noAsignadoContext = {
                ...mockContext,
                match: ['asig_no_677206567_1', '677206567', '1'],
                editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
                answerCbQuery: jest.fn().mockResolvedValue(undefined)
            };

            // Capturar el callback registrado
            let noAsignadoCallback: any = null;
            const originalRegisterCallback = mockHandler.registry.registerCallback;
            mockHandler.registry.registerCallback = jest.fn().mockImplementation((pattern, handler) => {
                if (pattern.toString().includes('asig_no')) {
                    noAsignadoCallback = handler;
                }
                return originalRegisterCallback(pattern, handler);
            });

            // Re-registrar callbacks
            ocuparPoliza.register();

            // Verificar que se registró el callback
            expect(noAsignadoCallback).toBeTruthy();

            // Ejecutar callback de NO ASIGNADO
            await noAsignadoCallback(noAsignadoContext);

            // Verificaciones
            expect(policyController.marcarRegistroNoAsignado).toHaveBeenCalledWith('677206567', 1);
            
            expect(noAsignadoContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('✅ Registro 1 marcado como *NO ASIGNADO*'),
                { parse_mode: 'Markdown' }
            );

            expect(noAsignadoContext.editMessageReplyMarkup).toHaveBeenCalledWith({ inline_keyboard: [] });
            expect(noAsignadoContext.answerCbQuery).toHaveBeenCalled();

            console.log('✅ Flujo NO ASIGNADO ejecutado exitosamente');
        });
    });
});