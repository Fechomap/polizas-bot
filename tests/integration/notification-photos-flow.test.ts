// tests/integration/notification-photos-flow.test.ts
import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { Telegraf } from 'telegraf';
import { getInstance as getNotificationManager } from '../../src/services/NotificationManager';
import ScheduledNotification from '../../src/models/scheduledNotification';
import Policy from '../../src/models/policy';
import mongoose from 'mongoose';

// Mock del logger para evitar logs en tests
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('Notification Photos Flow - Integration Tests', () => {
    let mockBot: jest.Mocked<Telegraf>;
    let mockTelegram: any;

    beforeEach(() => {
        // Mock completo del bot de Telegram
        mockTelegram = {
            sendPhoto: jest.fn() as any,
            sendMessage: jest.fn() as any
        };

        mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 });
        mockTelegram.sendMessage.mockResolvedValue({ message_id: 124 });

        mockBot = {
            telegram: mockTelegram,
            on: jest.fn(),
            command: jest.fn(),
            use: jest.fn()
        } as any;

        // Limpiar mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Flujo completo: Notificación de Contacto con Fotos', () => {
        test('debería ejecutar el flujo completo de notificación de contacto con fotos', async () => {
            // Setup: Crear datos de prueba
            const testPolicyData = {
                numeroPoliza: 'INTEGRATION-TEST-001',
                archivos: {
                    r2Files: {
                        fotos: [
                            {
                                url: 'https://test-storage.com/foto1.jpg',
                                key: 'fotos/test/foto1.jpg',
                                size: 1024,
                                contentType: 'image/jpeg'
                            },
                            {
                                url: 'https://test-storage.com/foto2.jpg',
                                key: 'fotos/test/foto2.jpg',
                                size: 2048,
                                contentType: 'image/jpeg'
                            }
                        ]
                    }
                }
            };

            const testNotificationData = {
                numeroPoliza: 'INTEGRATION-TEST-001',
                expedienteNum: 'EXP-INTEGRATION-001',
                tipoNotificacion: 'CONTACTO',
                marcaModelo: 'HONDA CIVIC (2021)',
                colorVehiculo: 'AZUL',
                placas: 'ABC-123',
                targetGroupId: -1002212807945,
                scheduledDate: new Date(Date.now() + 1000), // 1 segundo en el futuro
                contactTime: '14:30',
                status: 'PENDING',
                origenDestino: 'CIUDAD DE MÉXICO - TOLUCA'
            };

            // Mock de las consultas a la base de datos
            const mockPolicy = jest.spyOn(Policy, 'findOne').mockResolvedValue(testPolicyData as any);

            const mockNotificationUpdate = jest.spyOn(ScheduledNotification, 'findOneAndUpdate')
                .mockResolvedValue({
                    ...testNotificationData,
                    _id: 'mock-notification-id',
                    status: 'PROCESSING',
                    processingStartedAt: new Date(),
                    markAsSent: jest.fn() as any
                } as any);

            // Ejecutar: Obtener instancia del manager y enviar notificación
            const notificationManager = getNotificationManager(mockBot);
            await notificationManager.sendNotification('mock-notification-id');

            // Verificar: Secuencia correcta de envíos
            
            // 1. Verificar que se enviaron exactamente 2 fotos
            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
            
            // 2. Verificar primera foto
            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                1,
                -1002212807945,
                'https://test-storage.com/foto1.jpg',
                { caption: '📸 INTEGRATION-TEST-001 - HONDA CIVIC (2021) (1/2)' }
            );

            // 3. Verificar segunda foto
            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                2,
                -1002212807945,
                'https://test-storage.com/foto2.jpg',
                { caption: '📸 INTEGRATION-TEST-001 - HONDA CIVIC (2021) (2/2)' }
            );

            // 4. Verificar mensaje de contacto enviado después de las fotos
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
            const messageCall = mockTelegram.sendMessage.mock.calls[0];
            
            expect(messageCall[0]).toBe(-1002212807945); // Chat ID
            expect(messageCall[1]).toContain('🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨'); // Amarillo
            expect(messageCall[1]).toContain('⚠️ SERVICIO EN CONTACTO ⚠️');
            expect(messageCall[1]).toContain('EXP-INTEGRATION-001');
            expect(messageCall[1]).toContain('HONDA CIVIC (2021) AZUL');
            expect(messageCall[1]).toContain('ABC-123');
            expect(messageCall[1]).toContain('TOLUCA'); // Solo destino final
            expect(messageCall[2]).toEqual({ parse_mode: 'HTML' });

            // 5. Verificar consultas a la base de datos
            expect(mockNotificationUpdate).toHaveBeenCalledWith(
                {
                    _id: 'mock-notification-id',
                    status: { $in: ['PENDING', 'SCHEDULED'] }
                },
                {
                    $set: {
                        status: 'PROCESSING',
                        processingStartedAt: expect.any(Date)
                    }
                },
                { new: true }
            );

            expect(mockPolicy).toHaveBeenCalledWith({
                numeroPoliza: 'INTEGRATION-TEST-001',
                estado: 'ACTIVO'
            });

            // Cleanup mocks
            mockPolicy.mockRestore();
            mockNotificationUpdate.mockRestore();
        }, 10000); // Timeout extendido para integration test

        test('debería manejar correctamente notificación de contacto sin fotos', async () => {
            const testPolicyDataSinFotos = {
                numeroPoliza: 'INTEGRATION-TEST-002',
                archivos: {
                    r2Files: {
                        fotos: [] // Sin fotos
                    }
                }
            };

            const testNotificationData = {
                numeroPoliza: 'INTEGRATION-TEST-002',
                expedienteNum: 'EXP-INTEGRATION-002',
                tipoNotificacion: 'CONTACTO',
                marcaModelo: 'FORD FOCUS (2019)',
                targetGroupId: -1002212807945,
                status: 'PENDING'
            };

            const mockPolicy = jest.spyOn(Policy, 'findOne').mockResolvedValue(testPolicyDataSinFotos as any);
            const mockNotificationUpdate = jest.spyOn(ScheduledNotification, 'findOneAndUpdate')
                .mockResolvedValue({
                    ...testNotificationData,
                    _id: 'mock-notification-id-2',
                    status: 'PROCESSING',
                    markAsSent: jest.fn() as any
                } as any);

            const notificationManager = getNotificationManager(mockBot);
            await notificationManager.sendNotification('mock-notification-id-2');

            // Verificar que NO se enviaron fotos
            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
            
            // Verificar que sí se envió el mensaje
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
            expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('⚠️ SERVICIO EN CONTACTO ⚠️');

            mockPolicy.mockRestore();
            mockNotificationUpdate.mockRestore();
        });

        test('debería manejar notificación de TÉRMINO sin enviar fotos', async () => {
            const testNotificationTermino = {
                numeroPoliza: 'INTEGRATION-TEST-003',
                expedienteNum: 'EXP-INTEGRATION-003',
                tipoNotificacion: 'TERMINO',
                marcaModelo: 'NISSAN SENTRA (2020)',
                targetGroupId: -1002212807945,
                status: 'PENDING'
            };

            const mockNotificationUpdate = jest.spyOn(ScheduledNotification, 'findOneAndUpdate')
                .mockResolvedValue({
                    ...testNotificationTermino,
                    _id: 'mock-notification-id-3',
                    status: 'PROCESSING',
                    markAsSent: jest.fn() as any
                } as any);

            const notificationManager = getNotificationManager(mockBot);
            await notificationManager.sendNotification('mock-notification-id-3');

            // Verificar que NO se enviaron fotos (porque es TÉRMINO)
            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
            
            // Verificar mensaje de término en verde
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
            const messageContent = mockTelegram.sendMessage.mock.calls[0][1];
            expect(messageContent).toContain('🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩');
            expect(messageContent).toContain('✅ SERVICIO EN TÉRMINO ✅');

            mockNotificationUpdate.mockRestore();
        });
    });

    describe('Manejo de errores en el flujo de fotos', () => {
        test('debería continuar con el mensaje aunque falle el envío de fotos', async () => {
            const testPolicyData = {
                numeroPoliza: 'ERROR-TEST-001',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://invalid-url.com/foto1.jpg' }
                        ]
                    }
                }
            };

            const testNotificationData = {
                numeroPoliza: 'ERROR-TEST-001',
                expedienteNum: 'EXP-ERROR-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                status: 'PENDING'
            };

            const mockPolicy = jest.spyOn(Policy, 'findOne').mockResolvedValue(testPolicyData as any);
            const mockNotificationUpdate = jest.spyOn(ScheduledNotification, 'findOneAndUpdate')
                .mockResolvedValue({
                    ...testNotificationData,
                    _id: 'mock-error-notification-id',
                    status: 'PROCESSING',
                    markAsSent: jest.fn() as any
                } as any);

            // Simular error en sendPhoto
            mockTelegram.sendPhoto.mockRejectedValue(new Error('Network error'));

            const notificationManager = getNotificationManager(mockBot);
            await notificationManager.sendNotification('mock-error-notification-id');

            // Verificar que intentó enviar la foto (y falló)
            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(1);
            
            // Verificar que continuó y envió el mensaje a pesar del error
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
            expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('⚠️ SERVICIO EN CONTACTO ⚠️');

            mockPolicy.mockRestore();
            mockNotificationUpdate.mockRestore();
        });

        test('debería manejar timeout en el envío de fotos', async () => {
            const testPolicyData = {
                numeroPoliza: 'TIMEOUT-TEST-001',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://slow-server.com/foto1.jpg' }
                        ]
                    }
                }
            };

            const testNotificationData = {
                numeroPoliza: 'TIMEOUT-TEST-001',
                expedienteNum: 'EXP-TIMEOUT-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                status: 'PENDING'
            };

            const mockPolicy = jest.spyOn(Policy, 'findOne').mockResolvedValue(testPolicyData as any);
            const mockNotificationUpdate = jest.spyOn(ScheduledNotification, 'findOneAndUpdate')
                .mockResolvedValue({
                    ...testNotificationData,
                    _id: 'mock-timeout-notification-id',
                    status: 'PROCESSING',
                    markAsSent: jest.fn() as any
                } as any);

            // Simular timeout: Promise que nunca resuelve
            mockTelegram.sendPhoto.mockImplementation(() => new Promise(() => {}));

            const notificationManager = getNotificationManager(mockBot);
            
            // El test debe completarse rápidamente incluso con timeout
            await notificationManager.sendNotification('mock-timeout-notification-id');

            // Verificar que se envió el mensaje principal
            expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);

            mockPolicy.mockRestore();
            mockNotificationUpdate.mockRestore();
        }, 15000); // Timeout más largo para este test específico
    });
});