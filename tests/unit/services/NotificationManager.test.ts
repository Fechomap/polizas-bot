// tests/unit/services/NotificationManager.test.ts
import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { Telegraf } from 'telegraf';
import { NotificationManager } from '../../../src/services/NotificationManager';
import * as policyController from '../../../src/controllers/policyController';
import ScheduledNotification from '../../../src/models/scheduledNotification';
import logger from '../../../src/utils/logger';

// Mock de las dependencias
jest.mock('../../../src/controllers/policyController');
jest.mock('../../../src/models/scheduledNotification');
jest.mock('../../../src/utils/logger');

const mockPolicyController = policyController as jest.Mocked<typeof policyController>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('NotificationManager - Vehicle Photos Integration', () => {
    let notificationManager: NotificationManager;
    let mockBot: jest.Mocked<Telegraf>;
    let mockTelegram: any;

    beforeEach(() => {
        // Mock del bot de Telegram
        mockTelegram = {
            sendPhoto: jest.fn() as any,
            sendMessage: jest.fn() as any
        };

        mockBot = {
            telegram: mockTelegram
        } as any;

        // Crear instancia del NotificationManager
        notificationManager = new NotificationManager(mockBot);

        // Mock logger methods
        (mockLogger.info as jest.MockedFunction<any>) = jest.fn();
        (mockLogger.warn as jest.MockedFunction<any>) = jest.fn();
        (mockLogger.error as jest.MockedFunction<any>) = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
        notificationManager.stop();
    });

    describe('sendVehiclePhotos', () => {
        const mockNotification = {
            _id: 'test-notification-id',
            numeroPoliza: 'TEST-123',
            expedienteNum: 'EXP-456',
            marcaModelo: 'TOYOTA COROLLA (2020)',
            colorVehiculo: 'BLANCO',
            targetGroupId: -1002212807945,
            tipoNotificacion: 'CONTACTO'
        } as any;

        test('debería enviar 2 fotos máximo cuando la póliza tiene fotos disponibles', async () => {
            // Mock de la póliza con 3 fotos (debe tomar solo 2)
            const mockPolicy = {
                numeroPoliza: 'TEST-123',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://example.com/foto1.jpg' },
                            { url: 'https://example.com/foto2.jpg' },
                            { url: 'https://example.com/foto3.jpg' }
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(mockPolicy as any);
            (mockTelegram.sendPhoto as any).mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            // Verificar que se llamó sendPhoto exactamente 2 veces
            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);

            // Verificar las llamadas con las URLs y captions correctos
            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                1,
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 TEST-123 - TOYOTA COROLLA (2020) (1/2)' }
            );

            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                2,
                -1002212807945,
                'https://example.com/foto2.jpg',
                { caption: '📸 TEST-123 - TOYOTA COROLLA (2020) (2/2)' }
            );

            // Verificar logs
            expect(mockLogger.info).toHaveBeenCalledWith(
                '[PHOTOS] Enviando 2 foto(s) del vehículo TEST-123'
            );
        });

        test('debería enviar solo 1 foto cuando la póliza tiene 1 foto', async () => {
            const mockPolicy = {
                numeroPoliza: 'TEST-123',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://example.com/foto1.jpg' }
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(mockPolicy as any);
            (mockTelegram.sendPhoto as any).mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(1);
            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 TEST-123 - TOYOTA COROLLA (2020) (1/1)' }
            );
        });

        test('debería manejar gracefully cuando no hay fotos', async () => {
            const mockPolicy = {
                numeroPoliza: 'TEST-123',
                archivos: {
                    r2Files: {
                        fotos: []
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(mockPolicy as any);

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                '[PHOTOS] No hay fotos disponibles para póliza TEST-123'
            );
        });

        test('debería manejar gracefully cuando la póliza no existe', async () => {
            mockPolicyController.getPolicyByNumber.mockResolvedValue(null);

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith('[PHOTOS] Póliza no encontrada: TEST-123');
        });

        test('debería continuar enviando fotos aunque una falle', async () => {
            const mockPolicy = {
                numeroPoliza: 'TEST-123',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://example.com/foto1.jpg' },
                            { url: 'https://example.com/foto2.jpg' }
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(mockPolicy as any);

            // La primera foto falla, la segunda debe enviarse exitosamente
            mockTelegram.sendPhoto
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ message_id: 124 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error enviando foto 1 para TEST-123:',
                expect.any(Error)
            );
        });

        test('debería manejar notificación sin número de póliza', async () => {
            const notificationSinPoliza = {
                ...mockNotification,
                numeroPoliza: undefined
            };

            await notificationManager.sendVehiclePhotos(notificationSinPoliza as any);

            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                '[PHOTOS] No se puede obtener fotos sin número de póliza para test-notification-id'
            );
        });

        test('debería usar "Vehículo" como fallback cuando no hay marcaModelo', async () => {
            const mockPolicy = {
                numeroPoliza: 'TEST-123',
                archivos: {
                    r2Files: {
                        fotos: [{ url: 'https://example.com/foto1.jpg' }]
                    }
                }
            };

            const notificationSinModelo = {
                ...mockNotification,
                marcaModelo: undefined
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(mockPolicy as any);
            (mockTelegram.sendPhoto as any).mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(notificationSinModelo as any);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 TEST-123 - Vehículo (1/1)' }
            );
        });
    });

    describe('sendPhotoWithTimeout', () => {
        test('debería enviar foto exitosamente dentro del timeout', async () => {
            (mockTelegram.sendPhoto as any).mockResolvedValue({ message_id: 123 });

            const result = await notificationManager.sendPhotoWithTimeout(
                -123456,
                'https://example.com/foto.jpg',
                { caption: 'Test photo' },
                5000
            );

            expect(result).toEqual({ message_id: 123 });
            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -123456,
                'https://example.com/foto.jpg',
                { caption: 'Test photo' }
            );
        });

        test('debería fallar con timeout si la operación toma demasiado tiempo', async () => {
            // Mock que nunca resuelve para simular timeout
            mockTelegram.sendPhoto.mockImplementation(() => new Promise(() => {}));

            await expect(
                notificationManager.sendPhotoWithTimeout(
                    -123456,
                    'https://example.com/foto.jpg',
                    { caption: 'Test photo' },
                    100 // timeout muy corto para testing
                )
            ).rejects.toThrow('Timeout enviando foto después de 100ms');
        });

        test('debería fallar si el bot no está disponible', async () => {
            const managerSinBot = new NotificationManager();

            await expect(
                managerSinBot.sendPhotoWithTimeout(
                    -123456,
                    'https://example.com/foto.jpg',
                    { caption: 'Test photo' },
                    5000
                )
            ).rejects.toThrow('Bot no disponible');
        });
    });

    describe('sendNotification - Integration with Photos', () => {
        test('debería enviar fotos antes del mensaje para notificaciones de CONTACTO', async () => {
            const mockNotification = {
                _id: 'test-notification-id',
                numeroPoliza: 'TEST-123',
                expedienteNum: 'EXP-456',
                marcaModelo: 'TOYOTA COROLLA (2020)',
                colorVehiculo: 'BLANCO',
                targetGroupId: -1002212807945,
                tipoNotificacion: 'CONTACTO',
                origenDestino: 'CDMX - GUADALAJARA',
                placas: 'ABC-123'
            };

            const mockPolicy = {
                numeroPoliza: 'TEST-123',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://example.com/foto1.jpg' },
                            { url: 'https://example.com/foto2.jpg' }
                        ]
                    }
                }
            };

            // Mock del modelo ScheduledNotification
            const mockUpdatedNotification = {
                ...mockNotification,
                status: 'PROCESSING',
                processingStartedAt: expect.any(Date),
                markAsSent: jest.fn() as any
            };

            (ScheduledNotification.findOneAndUpdate as any).mockResolvedValue(mockUpdatedNotification);
            mockPolicyController.getPolicyByNumber.mockResolvedValue(mockPolicy as any);
            (mockTelegram.sendPhoto as any).mockResolvedValue({ message_id: 123 });
            (mockTelegram.sendMessage as any).mockResolvedValue({ message_id: 124 });

            await notificationManager.sendNotification('test-notification-id');

            // Verificar que se enviaron las fotos primero
            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
            
            // Verificar que se envió el mensaje después
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
            expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
                -1002212807945,
                expect.stringContaining('⚠️ SERVICIO EN CONTACTO ⚠️'),
                { parse_mode: 'HTML' }
            );

            // Verificar que se marcó como enviada
            expect(mockUpdatedNotification.markAsSent).toHaveBeenCalled();
        });

        test('NO debería enviar fotos para notificaciones de TÉRMINO', async () => {
            const mockNotification = {
                _id: 'test-notification-id',
                numeroPoliza: 'TEST-123',
                expedienteNum: 'EXP-456',
                marcaModelo: 'TOYOTA COROLLA (2020)',
                colorVehiculo: 'BLANCO',
                targetGroupId: -1002212807945,
                tipoNotificacion: 'TERMINO'
            };

            const mockUpdatedNotification = {
                ...mockNotification,
                status: 'PROCESSING',
                processingStartedAt: expect.any(Date),
                markAsSent: jest.fn() as any
            };

            (ScheduledNotification.findOneAndUpdate as any).mockResolvedValue(mockUpdatedNotification);
            (mockTelegram.sendMessage as any).mockResolvedValue({ message_id: 124 });

            await notificationManager.sendNotification('test-notification-id');

            // Verificar que NO se enviaron fotos
            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
            
            // Verificar que se envió solo el mensaje
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
            expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
                -1002212807945,
                expect.stringContaining('✅ SERVICIO EN TÉRMINO ✅'),
                { parse_mode: 'HTML' }
            );
        });
    });
});