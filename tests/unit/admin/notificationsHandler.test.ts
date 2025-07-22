// tests/unit/admin/notificationsHandler.test.ts
import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { Context } from 'telegraf';
import NotificationsHandler from '../../../src/admin/handlers/notificationsHandler';
import * as NotificationManager from '../../../src/services/NotificationManager';
import ScheduledNotification from '../../../src/models/scheduledNotification';
import AdminMenu from '../../../src/admin/menus/adminMenu';

// Mock de las dependencias
jest.mock('../../../src/services/NotificationManager');
jest.mock('../../../src/models/scheduledNotification');
jest.mock('../../../src/admin/menus/adminMenu');
jest.mock('../../../src/utils/logger');

describe('NotificationsHandler', () => {
    let mockCtx: any;
    let notificationsHandler: NotificationsHandler;

    beforeEach(() => {
        // Mock del contexto de Telegram
        mockCtx = {
            answerCbQuery: jest.fn(),
            editMessageText: jest.fn(),
            reply: jest.fn(),
            callbackQuery: { data: 'test' }
        };

        notificationsHandler = new NotificationsHandler();

        // Limpiar mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('handleAction', () => {
        test('debería manejar action "menu" correctamente', async () => {
            (AdminMenu.showNotificationsMenu as any) = jest.fn();

            await notificationsHandler.handleAction(mockCtx, 'menu');

            expect(AdminMenu.showNotificationsMenu).toHaveBeenCalledWith(mockCtx);
        });

        test('debería manejar action "list" correctamente', async () => {
            const mockNotifications = [
                {
                    _id: 'test1',
                    numeroPoliza: 'TEST-001',
                    expedienteNum: 'EXP-001',
                    tipoNotificacion: 'CONTACTO',
                    status: 'PENDING',
                    scheduledDate: new Date('2024-01-15T14:30:00.000Z'),
                    marcaModelo: 'TOYOTA COROLLA (2020)'
                },
                {
                    _id: 'test2',
                    numeroPoliza: 'TEST-002', 
                    expedienteNum: 'EXP-002',
                    tipoNotificacion: 'TERMINO',
                    status: 'SCHEDULED',
                    scheduledDate: new Date('2024-01-15T16:00:00.000Z'),
                    marcaModelo: 'HONDA CIVIC (2019)'
                }
            ];

            (ScheduledNotification.find as any) = jest.fn().mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockNotifications)
            });

            await notificationsHandler.handleAction(mockCtx, 'list');

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(ScheduledNotification.find).toHaveBeenCalledWith({
                scheduledDate: {
                    $gte: expect.any(Date),
                    $lt: expect.any(Date)
                }
            });
            expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                expect.stringContaining('📋 *Notificaciones de HOY'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        test('debería manejar when no hay notificaciones del día', async () => {
            (ScheduledNotification.find as any) = jest.fn().mockReturnValue({
                sort: jest.fn().mockResolvedValue([])
            });

            await notificationsHandler.handleAction(mockCtx, 'list');

            expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                '📅 No hay notificaciones programadas para hoy.',
                expect.objectContaining({
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.arrayContaining([
                            expect.arrayContaining([
                                expect.objectContaining({
                                    text: '⬅️ Volver',
                                    callback_data: 'admin_notifications_menu'
                                })
                            ])
                        ])
                    })
                })
            );
        });

        test('debería manejar action "today" correctamente', async () => {
            const mockPendingNotifications = [
                {
                    _id: 'pending1',
                    numeroPoliza: 'PENDING-001',
                    expedienteNum: 'EXP-PENDING-001',
                    tipoNotificacion: 'CONTACTO',
                    scheduledDate: new Date('2024-01-15T15:30:00.000Z'),
                    marcaModelo: 'NISSAN SENTRA (2021)'
                }
            ];

            const mockNotificationManagerInstance = {
                getPendingNotifications: jest.fn().mockResolvedValue(mockPendingNotifications)
            };

            (NotificationManager.getInstance as any) = jest.fn().mockReturnValue(mockNotificationManagerInstance);

            await notificationsHandler.handleAction(mockCtx, 'today');

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(mockNotificationManagerInstance.getPendingNotifications).toHaveBeenCalled();
            expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                expect.stringContaining('⏰ *Notificaciones PENDIENTES para HOY'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        test('debería manejar action "edit" correctamente', async () => {
            const mockPendingNotifications = [
                {
                    _id: 'edit1',
                    numeroPoliza: 'EDIT-001',
                    expedienteNum: 'EXP-EDIT-001',
                    tipoNotificacion: 'CONTACTO',
                    scheduledDate: new Date('2024-01-15T17:00:00.000Z')
                }
            ];

            const mockNotificationManagerInstance = {
                getPendingNotifications: jest.fn().mockResolvedValue(mockPendingNotifications)
            };

            (NotificationManager.getInstance as any) = jest.fn().mockReturnValue(mockNotificationManagerInstance);

            await notificationsHandler.handleAction(mockCtx, 'edit');

            expect(mockCtx.answerCbQuery).toHaveBeenCalled();
            expect(mockNotificationManagerInstance.getPendingNotifications).toHaveBeenCalled();
            expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                expect.stringContaining('✏️ *EDITAR NOTIFICACIONES*'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.arrayContaining([
                            expect.arrayContaining([
                                expect.objectContaining({
                                    text: expect.stringContaining('🟨 EXP-EDIT-001'),
                                    callback_data: 'admin_notifications_edit_edit1'
                                })
                            ])
                        ])
                    })
                })
            );
        });

        test('debería manejar when no hay notificaciones pendientes para editar', async () => {
            const mockNotificationManagerInstance = {
                getPendingNotifications: jest.fn().mockResolvedValue([])
            };

            (NotificationManager.getInstance as any) = jest.fn().mockReturnValue(mockNotificationManagerInstance);

            await notificationsHandler.handleAction(mockCtx, 'edit');

            expect(mockCtx.editMessageText).toHaveBeenCalledWith(
                '📅 No hay notificaciones pendientes para editar.',
                expect.objectContaining({
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.arrayContaining([
                            expect.arrayContaining([
                                expect.objectContaining({
                                    text: '⬅️ Volver',
                                    callback_data: 'admin_notifications_menu'
                                })
                            ])
                        ])
                    })
                })
            );
        });

        test('debería manejar action inválida', async () => {
            await notificationsHandler.handleAction(mockCtx, 'invalid_action');

            expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
                'Opción no disponible', 
                { show_alert: true }
            );
        });

        test('debería manejar errores correctamente', async () => {
            const error = new Error('Database error');
            (ScheduledNotification.find as any) = jest.fn().mockImplementation(() => {
                throw error;
            });

            await notificationsHandler.handleAction(mockCtx, 'list');

            expect(mockCtx.answerCbQuery).toHaveBeenCalledWith(
                'Error al procesar la solicitud',
                { show_alert: true }
            );
        });
    });

    describe('Formato de mensajes', () => {
        test('debería formatear correctamente emojis por tipo de notificación', async () => {
            const mockNotifications = [
                {
                    _id: 'contacto1',
                    numeroPoliza: 'CONTACTO-001',
                    expedienteNum: 'EXP-CONTACTO-001',
                    tipoNotificacion: 'CONTACTO',
                    status: 'PENDING',
                    scheduledDate: new Date('2024-01-15T14:30:00.000Z'),
                    marcaModelo: 'TOYOTA COROLLA'
                },
                {
                    _id: 'termino1',
                    numeroPoliza: 'TERMINO-001',
                    expedienteNum: 'EXP-TERMINO-001', 
                    tipoNotificacion: 'TERMINO',
                    status: 'SCHEDULED',
                    scheduledDate: new Date('2024-01-15T16:00:00.000Z'),
                    marcaModelo: 'HONDA CIVIC'
                }
            ];

            (ScheduledNotification.find as any) = jest.fn().mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockNotifications)
            });

            await notificationsHandler.handleAction(mockCtx, 'list');

            const messageCall = mockCtx.editMessageText.mock.calls[0];
            const message = messageCall[0] as string;

            // Verificar que contiene emojis correctos para cada tipo
            expect(message).toContain('⏳🟨'); // PENDING + CONTACTO
            expect(message).toContain('🕒🟩'); // SCHEDULED + TERMINO
        });

        test('debería limitar a 10 notificaciones en modo edición', async () => {
            // Crear array de 15 notificaciones
            const manyNotifications = Array.from({ length: 15 }, (_, i) => ({
                _id: `many${i}`,
                numeroPoliza: `MANY-${i.toString().padStart(3, '0')}`,
                expedienteNum: `EXP-MANY-${i.toString().padStart(3, '0')}`,
                tipoNotificacion: 'CONTACTO',
                scheduledDate: new Date(`2024-01-15T${(14 + i).toString().padStart(2, '0')}:00:00.000Z`)
            }));

            const mockNotificationManagerInstance = {
                getPendingNotifications: jest.fn().mockResolvedValue(manyNotifications)
            };

            (NotificationManager.getInstance as any) = jest.fn().mockReturnValue(mockNotificationManagerInstance);

            await notificationsHandler.handleAction(mockCtx, 'edit');

            const messageCall = mockCtx.editMessageText.mock.calls[0];
            const replyMarkup = messageCall[1] as any;
            
            // Debería tener 10 botones de notificaciones + 1 botón de volver = 11 total
            expect(replyMarkup.reply_markup.inline_keyboard).toHaveLength(11);
        });
    });

    describe('Integración con NotificationManager', () => {
        test('debería usar getInstance para obtener NotificationManager', async () => {
            const mockNotificationManagerInstance = {
                getPendingNotifications: jest.fn().mockResolvedValue([])
            };

            (NotificationManager.getInstance as any) = jest.fn().mockReturnValue(mockNotificationManagerInstance);

            await notificationsHandler.handleAction(mockCtx, 'today');

            expect(NotificationManager.getInstance).toHaveBeenCalled();
            expect(mockNotificationManagerInstance.getPendingNotifications).toHaveBeenCalled();
        });
    });
});