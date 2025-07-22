// tests/unit/edge-cases/notification-photos-edge-cases.test.ts
import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { Telegraf } from 'telegraf';
import { NotificationManager } from '../../../src/services/NotificationManager';
import * as policyController from '../../../src/controllers/policyController';

jest.mock('../../../src/controllers/policyController');
jest.mock('../../../src/utils/logger');

const mockPolicyController = policyController as jest.Mocked<typeof policyController>;

describe('NotificationManager - Edge Cases para Fotos', () => {
    let notificationManager: NotificationManager;
    let mockBot: jest.Mocked<Telegraf>;
    let mockTelegram: any;

    beforeEach(() => {
        mockTelegram = {
            sendPhoto: jest.fn(),
            sendMessage: jest.fn()
        };

        mockBot = {
            telegram: mockTelegram
        } as any;

        notificationManager = new NotificationManager(mockBot);
        jest.clearAllMocks();
    });

    afterEach(() => {
        notificationManager.stop();
    });

    describe('Casos Edge - Datos Malformados', () => {
        test('debería manejar póliza con estructura de archivos malformada', async () => {
            const mockNotification = {
                _id: 'edge-case-1',
                numeroPoliza: 'EDGE-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945
            } as any;

            // Póliza con estructura de archivos parcialmente corrupta
            const corruptedPolicyData = {
                numeroPoliza: 'EDGE-001',
                archivos: {
                    // r2Files es undefined
                    fotos: [] // Solo tiene fotos legacy
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(corruptedPolicyData as any);

            await notificationManager.sendVehiclePhotos(mockNotification);

            // No debe enviar fotos y no debe fallar
            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
        });

        test('debería manejar fotos con URLs inválidas o vacías', async () => {
            const mockNotification = {
                _id: 'edge-case-2',
                numeroPoliza: 'EDGE-002',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                marcaModelo: 'TEST VEHICLE'
            } as any;

            const policyWithInvalidUrls = {
                numeroPoliza: 'EDGE-002',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: '' }, // URL vacía
                            { url: null }, // URL null
                            { url: 'not-a-valid-url' }, // URL malformada
                            { url: 'https://valid-url.com/foto.jpg' } // URL válida
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyWithInvalidUrls as any);
            
            // Mock para que las primeras 3 fallen y la 4ta tenga éxito
            mockTelegram.sendPhoto
                .mockRejectedValueOnce(new Error('Invalid URL'))
                .mockRejectedValueOnce(new Error('Null URL'))
                .mockRejectedValueOnce(new Error('Malformed URL'))
                .mockResolvedValueOnce({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            // Debe intentar enviar máximo 2 fotos
            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
        });

        test('debería manejar fotos con metadatos incompletos', async () => {
            const mockNotification = {
                _id: 'edge-case-3',
                numeroPoliza: 'EDGE-003',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945
            } as any;

            const policyWithIncompletePhotos = {
                numeroPoliza: 'EDGE-003',
                archivos: {
                    r2Files: {
                        fotos: [
                            { 
                                url: 'https://example.com/foto1.jpg'
                                // Sin otros metadatos
                            },
                            {
                                // Solo algunos campos
                                url: 'https://example.com/foto2.jpg',
                                key: 'fotos/test/foto2.jpg'
                                // Sin size, contentType, etc.
                            }
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyWithIncompletePhotos as any);
            mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 EDGE-003 - Vehículo (1/2)' }
            );
        });
    });

    describe('Casos Edge - Errores de Red y Timeouts', () => {
        test('debería recuperarse de errores intermitentes de red', async () => {
            const mockNotification = {
                _id: 'network-test-1',
                numeroPoliza: 'NET-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                marcaModelo: 'NETWORK TEST'
            } as any;

            const policyData = {
                numeroPoliza: 'NET-001',
                archivos: {
                    r2Files: {
                        fotos: [
                            { url: 'https://example.com/foto1.jpg' },
                            { url: 'https://example.com/foto2.jpg' }
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyData as any);
            
            // Primera foto falla con error de red, segunda tiene éxito
            mockTelegram.sendPhoto
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValueOnce({ message_id: 124 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
            
            // Debe continuar y enviar la segunda foto
            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                2,
                -1002212807945,
                'https://example.com/foto2.jpg',
                { caption: '📸 NET-001 - NETWORK TEST (2/2)' }
            );
        });

        test('debería manejar timeout en sendPhotoWithTimeout', async () => {
            // Test del timeout específico
            mockTelegram.sendPhoto.mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 200)) // 200ms delay
            );

            const promise = notificationManager.sendPhotoWithTimeout(
                -123456,
                'https://slow-server.com/foto.jpg',
                { caption: 'Test timeout' },
                50 // timeout de 50ms, menor que el delay
            );

            await expect(promise).rejects.toThrow('Timeout enviando foto después de 50ms');
        });

        test('debería manejar bot desconectado durante envío de fotos', async () => {
            const mockNotification = {
                _id: 'bot-disconnect-test',
                numeroPoliza: 'BOT-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945
            } as any;

            const policyData = {
                numeroPoliza: 'BOT-001',
                archivos: {
                    r2Files: {
                        fotos: [{ url: 'https://example.com/foto1.jpg' }]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyData as any);

            // Simular bot desconectado
            const managerWithoutBot = new NotificationManager();

            await managerWithoutBot.sendVehiclePhotos(mockNotification);

            // No debe llamar a sendPhoto porque no hay bot
            expect(mockTelegram.sendPhoto).not.toHaveBeenCalled();
        });
    });

    describe('Casos Edge - Volúmenes Grandes de Fotos', () => {
        test('debería limitar correctamente a 2 fotos cuando hay muchas disponibles', async () => {
            const mockNotification = {
                _id: 'volume-test-1',
                numeroPoliza: 'VOL-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                marcaModelo: 'VOLUME TEST'
            } as any;

            // Póliza con 10 fotos (debe tomar solo las primeras 2)
            const policyWithManyPhotos = {
                numeroPoliza: 'VOL-001',
                archivos: {
                    r2Files: {
                        fotos: Array.from({ length: 10 }, (_, i) => ({
                            url: `https://example.com/foto${i + 1}.jpg`,
                            key: `fotos/vol/foto${i + 1}.jpg`,
                            size: 1024 * (i + 1),
                            contentType: 'image/jpeg'
                        }))
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyWithManyPhotos as any);
            mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            // Debe enviar exactamente 2 fotos, no más
            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(2);
            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                1,
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 VOL-001 - VOLUME TEST (1/2)' }
            );
            expect(mockTelegram.sendPhoto).toHaveBeenNthCalledWith(
                2,
                -1002212807945,
                'https://example.com/foto2.jpg',
                { caption: '📸 VOL-001 - VOLUME TEST (2/2)' }
            );
        });
    });

    describe('Casos Edge - Datos Especiales en Caption', () => {
        test('debería manejar caracteres especiales en números de póliza y modelos', async () => {
            const mockNotification = {
                _id: 'special-chars-test',
                numeroPoliza: 'SPECIAL-001/&@#',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                marcaModelo: 'TOYOTA COROLLA & CO. (2021) <SPECIAL>'
            } as any;

            const policyData = {
                numeroPoliza: 'SPECIAL-001/&@#',
                archivos: {
                    r2Files: {
                        fotos: [{ url: 'https://example.com/foto1.jpg' }]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyData as any);
            mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 SPECIAL-001/&@# - TOYOTA COROLLA & CO. (2021) <SPECIAL> (1/1)' }
            );
        });

        test('debería manejar strings muy largos en caption', async () => {
            const veryLongModel = 'A'.repeat(200); // String muy largo
            const mockNotification = {
                _id: 'long-string-test',
                numeroPoliza: 'LONG-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945,
                marcaModelo: veryLongModel
            } as any;

            const policyData = {
                numeroPoliza: 'LONG-001',
                archivos: {
                    r2Files: {
                        fotos: [{ url: 'https://example.com/foto1.jpg' }]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyData as any);
            mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            const expectedCaption = `📸 LONG-001 - ${veryLongModel} (1/1)`;
            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: expectedCaption }
            );
        });

        test('debería manejar campos undefined/null en marcaModelo', async () => {
            const testCases = [
                { marcaModelo: undefined, expected: 'Vehículo' },
                { marcaModelo: null, expected: 'Vehículo' },
                { marcaModelo: '', expected: 'Vehículo' },
                { marcaModelo: '   ', expected: '   ' } // Espacios se mantienen
            ];

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const mockNotification = {
                    _id: `null-test-${i}`,
                    numeroPoliza: `NULL-00${i}`,
                    tipoNotificacion: 'CONTACTO',
                    targetGroupId: -1002212807945,
                    marcaModelo: testCase.marcaModelo
                } as any;

                const policyData = {
                    numeroPoliza: `NULL-00${i}`,
                    archivos: {
                        r2Files: {
                            fotos: [{ url: `https://example.com/foto${i}.jpg` }]
                        }
                    }
                };

                mockPolicyController.getPolicyByNumber.mockResolvedValue(policyData as any);
                mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 + i });

                await notificationManager.sendVehiclePhotos(mockNotification);

                expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                    -1002212807945,
                    `https://example.com/foto${i}.jpg`,
                    { caption: `📸 NULL-00${i} - ${testCase.expected} (1/1)` }
                );

                // Limpiar mock para próxima iteración
                mockTelegram.sendPhoto.mockClear();
                mockPolicyController.getPolicyByNumber.mockClear();
            }
        });
    });

    describe('Casos Edge - Performance y Memoria', () => {
        test('debería manejar fotos con tamaños de metadatos grandes', async () => {
            const mockNotification = {
                _id: 'large-metadata-test',
                numeroPoliza: 'META-001',
                tipoNotificacion: 'CONTACTO',
                targetGroupId: -1002212807945
            } as any;

            const policyWithLargeMetadata = {
                numeroPoliza: 'META-001',
                archivos: {
                    r2Files: {
                        fotos: [
                            {
                                url: 'https://example.com/foto1.jpg',
                                key: 'fotos/meta/foto1.jpg',
                                size: 10 * 1024 * 1024, // 10MB
                                contentType: 'image/jpeg',
                                metadata: {
                                    // Metadatos grandes
                                    description: 'A'.repeat(10000),
                                    tags: Array.from({ length: 1000 }, (_, i) => `tag${i}`),
                                    largeObject: {
                                        data: 'B'.repeat(5000)
                                    }
                                }
                            }
                        ]
                    }
                }
            };

            mockPolicyController.getPolicyByNumber.mockResolvedValue(policyWithLargeMetadata as any);
            mockTelegram.sendPhoto.mockResolvedValue({ message_id: 123 });

            await notificationManager.sendVehiclePhotos(mockNotification);

            expect(mockTelegram.sendPhoto).toHaveBeenCalledTimes(1);
            expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
                -1002212807945,
                'https://example.com/foto1.jpg',
                { caption: '📸 META-001 - Vehículo (1/1)' }
            );
        });
    });
});