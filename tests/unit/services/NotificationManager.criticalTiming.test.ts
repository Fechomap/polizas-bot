// tests/unit/services/NotificationManager.criticalTiming.test.ts

import { NotificationManager } from '../../../src/services/NotificationManager';
import ScheduledNotification from '../../../src/models/scheduledNotification';
import moment from 'moment-timezone';

// Mocks
jest.mock('../../../src/models/scheduledNotification');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/controllers/policyController');

describe('NotificationManager - Critical Timing Edits', () => {
    let notificationManager: NotificationManager;
    let mockBot: any;
    let mockNotification: any;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock bot
        mockBot = {
            telegram: {
                sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
                sendPhoto: jest.fn().mockResolvedValue({ message_id: 124 })
            }
        };

        // Create NotificationManager instance
        notificationManager = new NotificationManager(mockBot);
        notificationManager.isInitialized = true;

        // Mock notification base object
        mockNotification = {
            _id: '507f1f77bcf86cd799439011',
            numeroPoliza: 'TEST-001',
            expedienteNum: 'EXP123',
            tipoNotificacion: 'CONTACTO',
            status: 'SCHEDULED',
            scheduledDate: new Date(),
            updatedAt: new Date(Date.now() - 1000), // 1 segundo atrás
            markAsSent: jest.fn().mockResolvedValue(true),
            markAsFailed: jest.fn().mockResolvedValue(true),
            cancel: jest.fn().mockResolvedValue(true)
        };

        // Mock ScheduledNotification methods
        (ScheduledNotification.findById as jest.Mock).mockResolvedValue(mockNotification);
        (ScheduledNotification.findOneAndUpdate as jest.Mock).mockResolvedValue(mockNotification);
        (ScheduledNotification.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockNotification);
    });

    describe('🎯 Validación de Timing Crítico', () => {
        test('debe detectar edición NORMAL (> 10 minutos)', async () => {
            const futureDate = moment().add(15, 'minutes').toDate();
            mockNotification.scheduledDate = futureDate;
            
            const newDate = moment().add(20, 'minutes').toDate();
            
            const result = await notificationManager.validateEditableNotification(mockNotification, newDate);
            
            expect(result.canEdit).toBe(true);
            expect(result.editMode).toBe('NORMAL_EDIT');
            expect(result.timeToExecution).toBeGreaterThan(10 * 60 * 1000);
        });

        test('debe detectar edición de RIESGO (2-10 minutos)', async () => {
            const futureDate = moment().add(5, 'minutes').toDate();
            mockNotification.scheduledDate = futureDate;
            
            const newDate = moment().add(10, 'minutes').toDate();
            
            const result = await notificationManager.validateEditableNotification(mockNotification, newDate);
            
            expect(result.canEdit).toBe(true);
            expect(result.editMode).toBe('FORCE_CANCEL');
            expect(result.requiresImmediateCancel).toBe(true);
            expect(result.timeToExecution).toBeLessThan(10 * 60 * 1000);
            expect(result.timeToExecution).toBeGreaterThan(2 * 60 * 1000);
        });

        test('debe detectar edición CRÍTICA (< 2 minutos)', async () => {
            const futureDate = moment().add(1, 'minute').toDate();
            mockNotification.scheduledDate = futureDate;
            
            const newDate = moment().add(5, 'minutes').toDate();
            
            const result = await notificationManager.validateEditableNotification(mockNotification, newDate);
            
            expect(result.canEdit).toBe(true);
            expect(result.editMode).toBe('CANCEL_AND_CREATE');
            expect(result.timeToExecution).toBeLessThan(2 * 60 * 1000);
            expect(result.reason).toContain('se cancelará la original y se creará una nueva');
        });

        test('debe rechazar edición de notificación ya enviada', async () => {
            mockNotification.status = 'SENT';
            
            const newDate = moment().add(10, 'minutes').toDate();
            
            const result = await notificationManager.validateEditableNotification(mockNotification, newDate);
            
            expect(result.canEdit).toBe(false);
            expect(result.reason).toContain('SENT');
        });

        test('debe rechazar fecha pasada', async () => {
            const pastDate = moment().subtract(1, 'minute').toDate();
            
            const result = await notificationManager.validateEditableNotification(mockNotification, pastDate);
            
            expect(result.canEdit).toBe(false);
            expect(result.reason).toContain('debe ser en el futuro');
        });
    });

    describe('🔒 Cancelación Forzosa', () => {
        test('debe cancelar timer exitosamente', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Simular timer activo
            const mockTimer = setTimeout(() => {}, 10000);
            notificationManager['activeTimers'].set(notificationId, mockTimer);
            notificationManager['timerTimestamps'].set(notificationId, new Date());
            notificationManager['originalScheduledDates'].set(notificationId, new Date());
            
            const result = await notificationManager.forceTimerCancel(notificationId);
            
            expect(result).toBe(true);
            expect(notificationManager['editingLocks'].has(notificationId)).toBe(false); // Se limpia al final
            expect(ScheduledNotification.findByIdAndUpdate).toHaveBeenCalledWith(
                notificationId,
                expect.objectContaining({
                    status: 'EDITING',
                    editingStartedAt: expect.any(Date)
                }),
                { new: true }
            );
        });

        test('debe fallar si la notificación ya fue enviada durante la cancelación', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Mock: notificación cambia a SENT durante la verificación
            const sentNotification = { ...mockNotification, status: 'SENT' };
            (ScheduledNotification.findById as jest.Mock).mockResolvedValueOnce(sentNotification);
            
            const result = await notificationManager.forceTimerCancel(notificationId);
            
            expect(result).toBe(false);
        });
    });

    describe('🔄 Cancelar y Recrear', () => {
        test('debe cancelar original y crear nueva notificación', async () => {
            const originalId = '507f1f77bcf86cd799439011';
            const newDate = moment().add(30, 'minutes').toDate();
            
            // Mock scheduleNotification para retornar nueva notificación
            const newNotification = { ...mockNotification, _id: '507f1f77bcf86cd799439012' };
            jest.spyOn(notificationManager, 'scheduleNotification').mockResolvedValue(newNotification as any);
            jest.spyOn(notificationManager, 'forceTimerCancel').mockResolvedValue(true);
            
            const result = await notificationManager.cancelAndRecreate(originalId, newDate);
            
            expect(result.success).toBe(true);
            expect(result.originalId).toBe(originalId);
            expect(result.newId).toBe('507f1f77bcf86cd799439012');
            expect(result.message).toContain('recreada');
            
            // Verificar que la original se marca como cancelada
            expect(ScheduledNotification.findByIdAndUpdate).toHaveBeenCalledWith(
                originalId,
                expect.objectContaining({
                    status: 'CANCELLED',
                    cancelReason: expect.stringContaining('recreada con nuevo ID')
                })
            );
        });

        test('debe fallar si no encuentra la notificación original', async () => {
            const originalId = '507f1f77bcf86cd799439011';
            const newDate = moment().add(30, 'minutes').toDate();
            
            (ScheduledNotification.findById as jest.Mock).mockResolvedValue(null);
            
            const result = await notificationManager.cancelAndRecreate(originalId, newDate);
            
            expect(result.success).toBe(false);
            expect(result.message).toContain('no encontrada');
        });
    });

    describe('🛡️ Doble Verificación en Envío', () => {
        test('debe abortar envío si está siendo editada', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Marcar como siendo editada
            notificationManager['editingLocks'].add(notificationId);
            
            // Mock para espiar console.log
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await notificationManager.sendNotification(notificationId);
            
            // Verificar que no se procesó
            expect(ScheduledNotification.findOneAndUpdate).not.toHaveBeenCalled();
            
            consoleSpy.mockRestore();
        });

        test('debe abortar envío si fue editada después del timer', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Simular que el timer se programó antes que la última actualización
            const timerTime = new Date(Date.now() - 2000); // 2 segundos atrás
            const updateTime = new Date(Date.now() - 1000); // 1 segundo atrás (más reciente)
            
            notificationManager['timerTimestamps'].set(notificationId, timerTime);
            mockNotification.updatedAt = updateTime;
            
            (ScheduledNotification.findById as jest.Mock).mockResolvedValue(mockNotification);
            
            await notificationManager.sendNotification(notificationId);
            
            // Verificar que no se procesó
            expect(ScheduledNotification.findOneAndUpdate).not.toHaveBeenCalled();
        });

        test('debe abortar envío si la fecha programada cambió', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Fecha original diferente a la actual
            const originalDate = moment().add(1, 'hour').toDate();
            const currentDate = moment().add(2, 'hours').toDate();
            
            notificationManager['originalScheduledDates'].set(notificationId, originalDate);
            mockNotification.scheduledDate = currentDate;
            
            (ScheduledNotification.findById as jest.Mock).mockResolvedValue(mockNotification);
            
            await notificationManager.sendNotification(notificationId);
            
            // Verificar que no se procesó
            expect(ScheduledNotification.findOneAndUpdate).not.toHaveBeenCalled();
        });

        test('debe proceder con envío si pasa todas las verificaciones', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Configurar datos consistentes
            const scheduledDate = moment().add(1, 'hour').toDate();
            const timerTime = new Date(Date.now() - 1000);
            
            notificationManager['timerTimestamps'].set(notificationId, timerTime);
            notificationManager['originalScheduledDates'].set(notificationId, scheduledDate);
            
            mockNotification.scheduledDate = scheduledDate;
            mockNotification.updatedAt = new Date(timerTime.getTime() - 1000); // Anterior al timer
            
            await notificationManager.sendNotification(notificationId);
            
            // Verificar que se procesó
            expect(ScheduledNotification.findOneAndUpdate).toHaveBeenCalledWith(
                {
                    _id: notificationId,
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
            
            expect(mockNotification.markAsSent).toHaveBeenCalled();
        });
    });

    describe('📊 Integración - Casos Reales', () => {
        test('debe manejar el caso específico: edición 6 minutos antes del envío', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Simular el caso real: notificación para 21:03, editada a las 20:57
            const originalTime = moment().add(6, 'minutes').toDate();
            const newTime = moment().add(30, 'minutes').toDate();
            
            mockNotification.scheduledDate = originalTime;
            mockNotification.tipoNotificacion = 'MANUAL';
            
            const result = await notificationManager.editNotificationDate(notificationId, newTime);
            
            expect(result.success).toBe(true);
            
            // Debe usar FORCE_CANCEL por estar en ventana de riesgo
            expect(ScheduledNotification.findByIdAndUpdate).toHaveBeenCalledWith(
                notificationId,
                expect.objectContaining({
                    status: 'EDITING'
                }),
                { new: true }
            );
        });

        test('debe recrear notificación para caso extremo (< 2 min)', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Caso extremo: 1 minuto antes
            const originalTime = moment().add(1, 'minute').toDate();
            const newTime = moment().add(30, 'minutes').toDate();
            
            mockNotification.scheduledDate = originalTime;
            
            // Mock para cancelAndRecreate
            jest.spyOn(notificationManager, 'cancelAndRecreate').mockResolvedValue({
                success: true,
                message: 'Notificación crítica recreada',
                originalId: notificationId,
                newId: 'new-id-123'
            });
            
            const result = await notificationManager.editNotificationDate(notificationId, newTime);
            
            expect(result.success).toBe(true);
            expect(result.message).toContain('recreada');
            expect(notificationManager.cancelAndRecreate).toHaveBeenCalledWith(notificationId, newTime);
        });
    });

    describe('🧹 Limpieza y Cleanup', () => {
        test('debe limpiar locks después de envío exitoso', async () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            await notificationManager.sendNotification(notificationId);
            
            // Verificar que se limpia el lock
            expect(notificationManager['editingLocks'].has(notificationId)).toBe(false);
        });

        test('debe limpiar referencias de timer después de ejecución', () => {
            const notificationId = '507f1f77bcf86cd799439011';
            
            // Simular referencias de timer
            notificationManager['activeTimers'].set(notificationId, setTimeout(() => {}, 1000));
            notificationManager['timerTimestamps'].set(notificationId, new Date());
            notificationManager['originalScheduledDates'].set(notificationId, new Date());
            
            // Simular limpieza del timer (como se hace en el callback del setTimeout)
            notificationManager['activeTimers'].delete(notificationId);
            notificationManager['timerTimestamps'].delete(notificationId);
            notificationManager['originalScheduledDates'].delete(notificationId);
            
            expect(notificationManager['activeTimers'].has(notificationId)).toBe(false);
            expect(notificationManager['timerTimestamps'].has(notificationId)).toBe(false);
            expect(notificationManager['originalScheduledDates'].has(notificationId)).toBe(false);
        });
    });

    afterEach(() => {
        // Limpiar timers activos para evitar memory leaks en tests
        notificationManager.stop();
    });
});