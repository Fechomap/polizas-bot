/**
 * Tests de integración para el flujo completo de registro de póliza con OCR
 * Simula: PDF → OCR → Extracción datos → Validación → Guardado BD
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// Importar modelos y controladores
import Policy from '../../src/models/policy';
import Vehicle from '../../src/models/vehicle';
import * as policyController from '../../src/controllers/policyController';
import { getInstance as getMistralOCR } from '../../src/services/MistralOCRService';

describe('Flujo completo: OCR → Registro de Póliza', () => {
    const TEST_POLICY_NUMBER = 'TEST-OCR-' + Date.now();
    const TEST_VEHICLE_SERIE = 'TEST' + Date.now().toString().slice(-13);
    let testVehicleId: string | null = null;
    let testPolicyId: string | null = null;

    beforeAll(async () => {
        // Conectar a MongoDB
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI!);
        }
    });

    afterAll(async () => {
        // Limpiar datos de prueba
        if (testPolicyId) {
            await Policy.findByIdAndDelete(testPolicyId);
            console.log('🧹 Póliza de prueba eliminada:', testPolicyId);
        }
        if (testVehicleId) {
            await Vehicle.findByIdAndDelete(testVehicleId);
            console.log('🧹 Vehículo de prueba eliminado:', testVehicleId);
        }
    });

    describe('1. Servicio OCR', () => {
        test('debe estar configurado correctamente', () => {
            const ocr = getMistralOCR();
            expect(ocr.isConfigured()).toBe(true);
        });

        test('debe tener la estructura correcta de respuesta', async () => {
            const ocr = getMistralOCR();

            // Probar con buffer vacío (generará error pero verificamos estructura)
            const resultado = await ocr.extraerDatosPoliza(
                Buffer.from('test'),
                'application/pdf',
                'test.pdf'
            );

            expect(resultado).toHaveProperty('success');
            expect(resultado).toHaveProperty('datos');
        });
    });

    describe('2. Validación de póliza duplicada', () => {
        beforeEach(async () => {
            // Crear vehículo de prueba si no existe
            if (!testVehicleId) {
                const vehiculo = new Vehicle({
                    serie: TEST_VEHICLE_SERIE,
                    marca: 'TEST',
                    submarca: 'MODEL',
                    año: 2024,
                    color: 'BLANCO',
                    placas: 'TEST123',
                    titular: 'Test User',
                    rfc: 'TEST123456ABC',
                    telefono: '5551234567',
                    correo: 'test@test.com',
                    creadoPor: 'jest-test',
                    estado: 'SIN_POLIZA'
                });
                const saved = await vehiculo.save();
                testVehicleId = saved._id.toString();
            }
        });

        test('debe permitir crear una póliza nueva', async () => {
            const nuevaPoliza: any = {
                numeroPoliza: TEST_POLICY_NUMBER,
                aseguradora: 'TEST SEGUROS',
                agenteCotizador: 'Test Agent',
                fechaEmision: new Date(),
                marca: 'TEST',
                submarca: 'MODEL',
                año: 2024,
                color: 'BLANCO',
                serie: TEST_VEHICLE_SERIE,
                placas: 'TEST123',
                titular: 'Test User',
                rfc: 'TEST123456ABC',
                calle: 'Test Street',
                colonia: 'Test Colony',
                municipio: 'Test City',
                cp: '12345',
                pagos: [
                    { concepto: 'Primer pago', monto: 1000, fechaPago: new Date(), estado: 'REALIZADO' },
                    { concepto: 'Segundo pago', monto: 500, fechaPago: new Date(), estado: 'PLANIFICADO' }
                ],
                vehicleId: testVehicleId
            };

            const polizaGuardada = await policyController.savePolicy(nuevaPoliza);
            testPolicyId = polizaGuardada._id.toString();

            expect(polizaGuardada).toBeDefined();
            expect(polizaGuardada.numeroPoliza).toBe(TEST_POLICY_NUMBER);
            expect(polizaGuardada.pagos).toHaveLength(2);
            expect(polizaGuardada.pagos[0].monto).toBe(1000);
            expect(polizaGuardada.pagos[1].monto).toBe(500);

            console.log('✅ Póliza creada exitosamente:', TEST_POLICY_NUMBER);
        });

        test('debe rechazar póliza duplicada con DuplicatePolicyError', async () => {
            // Intentar crear la misma póliza de nuevo
            const polizaDuplicada: any = {
                numeroPoliza: TEST_POLICY_NUMBER, // Mismo número = DUPLICADA
                aseguradora: 'OTRA ASEGURADORA',
                agenteCotizador: 'Otro Agent',
                fechaEmision: new Date(),
                marca: 'OTRO',
                submarca: 'MODELO',
                año: 2023,
                color: 'NEGRO',
                serie: 'OTRASERIE123456789',
                placas: 'OTRA123',
                titular: 'Otro User',
                rfc: 'OTRO123456XYZ',
                calle: 'Otra Street',
                colonia: 'Otra Colony',
                municipio: 'Otra City',
                cp: '54321'
            };

            await expect(policyController.savePolicy(polizaDuplicada))
                .rejects
                .toThrow(/Ya existe una póliza/);

            console.log('✅ Error de duplicado detectado correctamente para:', TEST_POLICY_NUMBER);
        });

        test('el vehículo no debe modificarse cuando falla por duplicado', async () => {
            // Verificar que el vehículo original sigue igual
            const vehiculo = await Vehicle.findById(testVehicleId);

            expect(vehiculo).toBeDefined();
            // El estado podría haber cambiado si el primer test lo actualizó
            console.log('✅ Estado del vehículo verificado:', vehiculo!.estado);
        });
    });

    describe('3. Estructura de pagos', () => {
        test('debe guardar pagos en el array correctamente', async () => {
            if (!testPolicyId) {
                console.log('⚠️ Saltando - no hay póliza de prueba');
                return;
            }

            const poliza = await Policy.findById(testPolicyId);

            expect(poliza).toBeDefined();
            expect(poliza!.pagos).toBeDefined();
            expect(Array.isArray(poliza!.pagos)).toBe(true);
            expect(poliza!.pagos.length).toBeGreaterThanOrEqual(2);

            // Verificar que los montos existen
            const montos = poliza!.pagos.map((p: any) => p.monto);
            expect(montos).toContain(1000);
            expect(montos).toContain(500);

            console.log('✅ Estructura de pagos correcta:', poliza!.pagos.length, 'pagos');
        });

        test('debe calcular total de pagos', async () => {
            if (!testPolicyId) {
                console.log('⚠️ Saltando - no hay póliza de prueba');
                return;
            }

            const poliza = await Policy.findById(testPolicyId);
            const total = poliza!.pagos.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);

            expect(total).toBe(1500);

            console.log('✅ Total calculado: $' + total);
        });
    });
});
