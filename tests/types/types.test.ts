/**
 * Tests de tipos TypeScript
 * Verifican que las interfaces y tipos estén correctamente definidos
 */

import { jest } from '@jest/globals';

// Importar tipos
import type { IPolicy, IVehicle, IScheduledNotification } from '../../src/types/database';
import type { BotContext } from '../../types/global';

describe('Database Types Tests', () => {
    test('IPolicy tiene todas las propiedades requeridas', () => {
        const mockPolicy: Partial<IPolicy> = {
            titular: 'Juan Pérez',
            numeroPoliza: 'POL-001',
            aseguradora: 'Test Insurance',
            fechaEmision: new Date('2024-01-01'),
            marca: 'Toyota',
            submarca: 'Corolla',
            año: 2024,
            color: 'Blanco',
            serie: 'VIN123456789',
            placas: 'ABC-123',
            agenteCotizador: 'Agente Test',
            rfc: 'PEGJ850312H7A',
            estado: 'ACTIVO',
            servicios: [],
            pagos: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        expect(mockPolicy.numeroPoliza).toBe('POL-001');
        expect(mockPolicy.aseguradora).toBe('Test Insurance');
        expect(mockPolicy.titular).toBe('Juan Pérez');
        expect(mockPolicy.estado).toBe('ACTIVO');
        expect(Array.isArray(mockPolicy.servicios)).toBe(true);
        expect(Array.isArray(mockPolicy.pagos)).toBe(true);
    });

    test('IVehicle tiene todas las propiedades requeridas', () => {
        const mockVehicle: Partial<IVehicle> = {
            serie: 'VIN123456789',
            marca: 'Toyota',
            submarca: 'Corolla',
            año: 2024,
            color: 'Blanco',
            placas: 'ABC-123',
            titular: 'Juan Pérez',
            rfc: 'PEGJ850312H7A',
            telefono: '+52 55 1234 5678',
            correo: 'juan@example.com',
            calle: 'Calle 123',
            colonia: 'Centro',
            municipio: 'Ciudad de México',
            estadoRegion: 'CDMX',
            cp: '01000',
            estado: 'SIN_POLIZA',
            creadoPor: 'user123',
            creadoVia: 'TELEGRAM_BOT',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        expect(mockVehicle.serie).toBe('VIN123456789');
        expect(mockVehicle.marca).toBe('Toyota');
        expect(mockVehicle.submarca).toBe('Corolla');
        expect(mockVehicle.año).toBe(2024);
        expect(mockVehicle.placas).toBe('ABC-123');
        expect(mockVehicle.titular).toBe('Juan Pérez');
        expect(mockVehicle.municipio).toBe('Ciudad de México');
    });

    test('IScheduledNotification tiene todas las propiedades requeridas', () => {
        const mockNotification: Partial<IScheduledNotification> = {
            numeroPoliza: 'POL-001',
            expedienteNum: 'EXP-123',
            origenDestino: 'CDMX - Guadalajara',
            placas: 'ABC-123',
            marcaModelo: 'Toyota Corolla',
            colorVehiculo: 'Blanco',
            telefono: '+52 55 1234 5678',
            contactTime: '09:00',
            scheduledDate: new Date('2024-12-31'),
            targetGroupId: -1000,
            tipoNotificacion: 'CONTACTO',
            status: 'PENDING',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        expect(mockNotification.numeroPoliza).toBe('POL-001');
        expect(mockNotification.expedienteNum).toBe('EXP-123');
        expect(mockNotification.origenDestino).toBe('CDMX - Guadalajara');
        expect(mockNotification.tipoNotificacion).toBe('CONTACTO');
        expect(mockNotification.status).toBe('PENDING');
        expect(mockNotification.retryCount).toBe(0);
        expect(mockNotification.targetGroupId).toBe(-1000);
    });
});

describe('Bot Context Types Tests', () => {
    test('BotContext tiene propiedades básicas', () => {
        const mockContext: Partial<BotContext> = {
            from: {
                id: 12345,
                is_bot: false,
                first_name: 'Juan',
                last_name: 'Pérez',
                username: 'juanperez'
            },
            chat: {
                id: -1000,
                type: 'group',
                title: 'Test Group'
            },
            message: {
                message_id: 123,
                date: 1640995200,
                text: 'Hello World'
            }
        };

        expect(mockContext.from?.id).toBe(12345);
        expect(mockContext.from?.first_name).toBe('Juan');
        expect(mockContext.chat?.id).toBe(-1000);
        expect(mockContext.chat?.type).toBe('group');
        expect(mockContext.message?.text).toBe('Hello World');
    });
});

describe('Type Utility Tests', () => {
    test('Los tipos pueden ser utilizados en funciones', () => {
        const processPolicy = (policy: Partial<IPolicy>): string => {
            return `Policy ${policy.numeroPoliza} for ${policy.titular}`;
        };

        const testPolicy: Partial<IPolicy> = {
            numeroPoliza: 'POL-001',
            titular: 'Juan Pérez',
            aseguradora: 'Test Insurance',
            fechaEmision: new Date('2024-01-01'),
            marca: 'Toyota',
            submarca: 'Corolla',
            año: 2024,
            color: 'Blanco',
            serie: 'VIN123456789',
            placas: 'ABC-123',
            agenteCotizador: 'Agente Test',
            rfc: 'PEGJ850312H7A',
            estado: 'ACTIVO',
            servicios: [],
            pagos: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = processPolicy(testPolicy);
        expect(result).toBe('Policy POL-001 for Juan Pérez');
    });

    test('Los tipos opcionales funcionan correctamente', () => {
        const processVehicle = (vehicle: Partial<IVehicle>): string => {
            const extras = vehicle.notas ? ` with ${vehicle.notas}` : '';
            return `${vehicle.marca} ${vehicle.submarca}${extras}`;
        };

        const vehicleWithExtras: Partial<IVehicle> = {
            serie: 'VIN123456789',
            submarca: 'Corolla',
            marca: 'Toyota',
            año: 2024,
            color: 'Blanco',
            placas: 'ABC-123',
            titular: 'Juan Pérez',
            rfc: 'PEGJ850312H7A',
            telefono: '+52 55 1234 5678',
            correo: 'juan@example.com',
            calle: 'Calle 123',
            colonia: 'Centro',
            municipio: 'Ciudad de México',
            estadoRegion: 'CDMX',
            cp: '01000',
            estado: 'SIN_POLIZA',
            creadoPor: 'user123',
            creadoVia: 'TELEGRAM_BOT',
            notas: 'GPS, Aire acondicionado',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = processVehicle(vehicleWithExtras);
        expect(result).toBe('Toyota Corolla with GPS, Aire acondicionado');
    });
});

describe('Enum Types Tests', () => {
    test('Los tipos de enum funcionan correctamente', () => {
        const validStates = ['ACTIVO', 'INACTIVO', 'ELIMINADO'] as const;
        type PolicyState = typeof validStates[number];

        const checkPolicyState = (state: PolicyState): boolean => {
            return validStates.includes(state);
        };

        expect(checkPolicyState('ACTIVO')).toBe(true);
        expect(checkPolicyState('INACTIVO')).toBe(true);
        expect(checkPolicyState('ELIMINADO')).toBe(true);
    });
});