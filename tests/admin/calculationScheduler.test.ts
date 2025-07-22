/**
 * @jest-environment node
 */

import CalculationScheduler from '../../src/admin/utils/calculationScheduler';
import { Telegraf } from 'telegraf';
import * as cron from 'node-cron';

// Mock de node-cron
jest.mock('node-cron');
const mockCron = cron as jest.Mocked<typeof cron>;

// Mock de Telegraf
const mockBot = {
  telegram: {
    sendMessage: jest.fn().mockResolvedValue({}),
  }
} as unknown as Telegraf;

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

// Mock de AutoCleanupService
jest.mock('../../src/services/AutoCleanupService', () => {
  return jest.fn().mockImplementation(() => ({
    executeAutoCleanup: jest.fn().mockResolvedValue({
      success: true,
      stats: {
        automaticDeletions: 0,
        expiredPoliciesFound: 0,
        errors: 0,
      },
      expiredPolicies: []
    })
  }));
});

describe('CalculationScheduler - NIV Cleanup Tests', () => {
  let scheduler: CalculationScheduler;
  let mockScheduledTask: jest.Mocked<cron.ScheduledTask>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock del ScheduledTask
    mockScheduledTask = {
      start: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn()
    } as any;

    // Mock de cron.schedule que retorna el ScheduledTask mockeado
    mockCron.schedule.mockReturnValue(mockScheduledTask);

    // Mock de variables de entorno para las pruebas
    process.env.ADMIN_CHAT_ID = '123456789';
    process.env.ADMIN_THREAD_ID = '987654321';

    scheduler = new CalculationScheduler(mockBot);
  });

  afterEach(() => {
    // Limpiar variables de entorno
    delete process.env.ADMIN_CHAT_ID;
    delete process.env.ADMIN_THREAD_ID;
  });

  describe('Programación de Jobs', () => {
    test('debe programar el job de limpieza NIVs a las 3:15 AM', () => {
      scheduler.initialize();

      // Verificar que cron.schedule fue llamado con el horario correcto para NIV cleanup
      const nivCleanupCall = mockCron.schedule.mock.calls.find(call => 
        call[0] === '15 3 * * *'
      );

      expect(nivCleanupCall).toBeDefined();
      expect(nivCleanupCall![0]).toBe('15 3 * * *'); // 3:15 AM diario
      expect(nivCleanupCall![2]).toEqual({
        scheduled: true,
        timezone: 'America/Mexico_City'
      });
    });

    test('debe programar todos los jobs en el orden correcto', () => {
      scheduler.initialize();

      // Verificar que se programaron todos los jobs
      expect(mockCron.schedule).toHaveBeenCalledTimes(4);
      
      // Verificar los horarios de cada job
      const calls = mockCron.schedule.mock.calls;
      
      // Cálculo diario - 3:00 AM
      expect(calls[0][0]).toBe('0 3 * * *');
      
      // Limpieza NIVs - 3:15 AM
      expect(calls[1][0]).toBe('15 3 * * *');
      
      // Auto cleanup pólizas - 3:30 AM  
      expect(calls[2][0]).toBe('30 3 * * *');
      
      // Limpieza semanal - Domingos 4:00 AM
      expect(calls[3][0]).toBe('0 4 * * 0');
    });

    test('debe usar la zona horaria de México para todos los jobs', () => {
      scheduler.initialize();

      const calls = mockCron.schedule.mock.calls;
      calls.forEach(call => {
        expect(call[2]).toEqual({
          scheduled: true,
          timezone: 'America/Mexico_City'
        });
      });
    });
  });

  describe('Simulación de Ejecución a las 3:15 AM', () => {
    test('debe ejecutar la limpieza de NIVs cuando se dispara el cron', async () => {
      // Spy en executeScript antes de inicializar para simular la ejecución del script
      const executeScriptSpy = jest.spyOn(scheduler as any, 'executeScript')
        .mockResolvedValue('✅ NIVs eliminados exitosamente: 2\n🎉 CLEANUP COMPLETADO EXITOSAMENTE!');

      scheduler.initialize();

      // Obtener la función callback del job de NIVs (segundo job programado)
      const nivCleanupCallback = mockCron.schedule.mock.calls[1][1] as () => Promise<void>;
      
      // Ejecutar el callback como si fuera disparado por el cron a las 3:15 AM
      await nivCleanupCallback();

      // Verificar que se ejecutó el script
      expect(executeScriptSpy).toHaveBeenCalledWith('cleanup-nivs-usados.js');
      expect(executeScriptSpy).toHaveBeenCalledTimes(1);

      executeScriptSpy.mockRestore();
    });

    test('debe enviar notificación de inicio cuando ejecuta limpieza NIVs', async () => {
      // Mock executeScript para simular respuesta exitosa
      jest.spyOn(scheduler as any, 'executeScript')
        .mockResolvedValue('NIVs eliminados exitosamente: 1\n');

      scheduler.initialize();
      
      // Obtener y ejecutar el callback del job de NIVs
      const nivCleanupCallback = mockCron.schedule.mock.calls[1][1] as () => Promise<void>;
      await nivCleanupCallback();

      // Verificar que se envió mensaje de inicio
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456789',
        '🧹 *Limpieza Automática NIVs Usados*\\n\\n⏳ Eliminando NIVs con servicios\\.\\.\\.',
        { parse_mode: 'MarkdownV2' }
      );
    });

    test('debe enviar notificación de éxito con estadísticas', async () => {
      // Mock executeScript con respuesta que incluye estadísticas
      jest.spyOn(scheduler as any, 'executeScript')
        .mockResolvedValue('NIVs eliminados exitosamente: 3\n🎉 CLEANUP COMPLETADO EXITOSAMENTE!');

      scheduler.initialize();
      
      const nivCleanupCallback = mockCron.schedule.mock.calls[1][1] as () => Promise<void>;
      await nivCleanupCallback();

      // Verificar mensaje de éxito
      const successCall = (mockBot.telegram.sendMessage as jest.Mock).mock.calls.find(call => 
        call[1].includes('✅ *Limpieza NIVs Completada*')
      );

      expect(successCall).toBeDefined();
      expect(successCall[1]).toContain('🗑️ NIVs eliminados: 3');
    });

    test('debe manejar errores en la ejecución del script', async () => {
      // Mock executeScript para simular error
      jest.spyOn(scheduler as any, 'executeScript')
        .mockRejectedValue(new Error('Script falló con código 1: Error de conexión'));

      scheduler.initialize();
      
      const nivCleanupCallback = mockCron.schedule.mock.calls[1][1] as () => Promise<void>;
      await nivCleanupCallback();

      // Verificar mensaje de error
      const errorCall = (mockBot.telegram.sendMessage as jest.Mock).mock.calls.find(call => 
        call[1].includes('❌ *Error en Limpieza NIVs*')
      );

      expect(errorCall).toBeDefined();
      expect(errorCall[1]).toContain('Script falló con código 1: Error de conexión');
    });
  });

  describe('Gestión de Jobs', () => {
    test('debe agregar el job de NIV cleanup a la lista de jobs activos', () => {
      scheduler.initialize();

      const jobStats = scheduler.getJobStats();
      expect(jobStats.activeJobs).toBe(4);
      expect(jobStats.jobs).toContain('nivCleanup');
    });

    test('debe detener el job de NIV cleanup cuando se detienen todos los jobs', () => {
      scheduler.initialize();
      scheduler.stopAllJobs();

      expect(mockScheduledTask.stop).toHaveBeenCalledTimes(4); // Todos los jobs
    });
  });

  describe('Ejecución Manual', () => {
    test('debe permitir ejecución manual de limpieza NIVs', async () => {
      const executeNIVCleanupSpy = jest.spyOn(scheduler as any, 'executeNIVCleanup')
        .mockResolvedValue(undefined);

      await scheduler.executeManualNIVCleanup();

      expect(executeNIVCleanupSpy).toHaveBeenCalledTimes(1);
      executeNIVCleanupSpy.mockRestore();
    });
  });

  describe('Validación de Horarios', () => {
    test('debe verificar que el job de NIVs se ejecuta entre cálculo diario (3:00) y auto cleanup (3:30)', () => {
      scheduler.initialize();

      const calls = mockCron.schedule.mock.calls;
      
      // Extraer horarios
      const calculationTime = calls[0][0]; // '0 3 * * *' - 3:00 AM
      const nivCleanupTime = calls[1][0]; // '15 3 * * *' - 3:15 AM  
      const autoCleanupTime = calls[2][0]; // '30 3 * * *' - 3:30 AM

      // Verificar orden cronológico
      expect(calculationTime).toBe('0 3 * * *');   // 3:00 AM
      expect(nivCleanupTime).toBe('15 3 * * *');   // 3:15 AM
      expect(autoCleanupTime).toBe('30 3 * * *');  // 3:30 AM
      
      // El job de NIVs debe ejecutarse después del cálculo diario 
      // pero antes de la limpieza automática de pólizas
      const calculationMinute = parseInt(calculationTime.split(' ')[1]) * 60 + parseInt(calculationTime.split(' ')[0]);
      const nivCleanupMinute = parseInt(nivCleanupTime.split(' ')[1]) * 60 + parseInt(nivCleanupTime.split(' ')[0]);
      const autoCleanupMinute = parseInt(autoCleanupTime.split(' ')[1]) * 60 + parseInt(autoCleanupTime.split(' ')[0]);

      expect(nivCleanupMinute).toBeGreaterThan(calculationMinute);
      expect(nivCleanupMinute).toBeLessThan(autoCleanupMinute);
    });

    test('debe validar que todos los jobs usan cron expressions válidas', () => {
      scheduler.initialize();

      const calls = mockCron.schedule.mock.calls;
      
      calls.forEach(call => {
        const cronExpression = call[0];
        
        // Validar formato básico de cron expression (5 campos)
        const parts = cronExpression.split(' ');
        expect(parts).toHaveLength(5);
        
        // Validar que son números válidos o wildcards
        parts.forEach((part, index) => {
          if (part !== '*') {
            const num = parseInt(part);
            expect(num).not.toBeNaN();
            
            // Validaciones específicas por campo
            switch(index) {
              case 0: // minutos (0-59)
                expect(num).toBeGreaterThanOrEqual(0);
                expect(num).toBeLessThanOrEqual(59);
                break;
              case 1: // horas (0-23)
                expect(num).toBeGreaterThanOrEqual(0);
                expect(num).toBeLessThanOrEqual(23);
                break;
              case 4: // día de semana (0-7)
                if (part !== '*') {
                  expect(num).toBeGreaterThanOrEqual(0);
                  expect(num).toBeLessThanOrEqual(7);
                }
                break;
            }
          }
        });
      });
    });
  });
});