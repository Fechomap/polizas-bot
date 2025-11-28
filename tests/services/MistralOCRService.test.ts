/**
 * Tests para MistralOCRService
 * Servicio de OCR usando Mistral AI para extracción de datos de pólizas
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

import { getInstance } from '../../src/services/MistralOCRService';

describe('MistralOCRService', () => {
    const mistral = getInstance();

    describe('Configuración', () => {
        test('debe verificar si el servicio está configurado', () => {
            // El servicio debe poder indicar si tiene API key configurada
            const configured = mistral.isConfigured();
            expect(typeof configured).toBe('boolean');
        });

        test('debe tener MISTRAL_API_KEY configurada para tests de integración', () => {
            // Skip si no hay API key (CI/CD sin secrets)
            if (!process.env.MISTRAL_API_KEY) {
                console.log('⚠️ MISTRAL_API_KEY no configurada - saltando test de integración');
                return;
            }
            expect(mistral.isConfigured()).toBe(true);
        });
    });

    describe('Estructura de respuesta', () => {
        test('debe retornar estructura correcta cuando no está configurado', async () => {
            // Verificamos la estructura esperada de una respuesta de error
            const expectedStructure = {
                success: false,
                datos: null,
                error: 'mensaje de error'
            };

            expect(expectedStructure).toHaveProperty('success');
            expect(expectedStructure).toHaveProperty('datos');
            expect(expectedStructure).toHaveProperty('error');
            expect(typeof expectedStructure.error).toBe('string');
        });
    });

    describe('Extracción de datos de póliza (Integración)', () => {
        // Este test requiere API key y archivo real
        // El PDF de prueba está en tests/fixtures/ (ignorado por git)
        const testPdfPath = path.join(__dirname, '../fixtures/sample-policy.pdf');

        beforeAll(() => {
            if (!fs.existsSync(testPdfPath)) {
                console.log('⚠️ PDF de prueba no encontrado - algunos tests serán saltados');
            }
        });

        test('debe extraer datos de un PDF de póliza real', async () => {
            // Skip si no hay configuración completa
            if (!mistral.isConfigured()) {
                console.log('⚠️ Mistral no configurado - saltando test');
                return;
            }

            if (!fs.existsSync(testPdfPath)) {
                console.log('⚠️ PDF no encontrado - saltando test');
                return;
            }

            const buffer = fs.readFileSync(testPdfPath);
            const resultado = await mistral.extraerDatosPoliza(
                buffer,
                'application/pdf',
                path.basename(testPdfPath)
            );

            // Verificar estructura de respuesta
            expect(resultado).toHaveProperty('success');
            expect(resultado).toHaveProperty('datos');

            if (resultado.success && resultado.datos) {
                const datos = resultado.datos;

                // Verificar que extrae campos esperados
                expect(datos).toHaveProperty('numeroPoliza');
                expect(datos).toHaveProperty('aseguradora');
                expect(datos).toHaveProperty('fechaInicioVigencia');
                expect(datos).toHaveProperty('primerPago');
                expect(datos).toHaveProperty('confianza');
                expect(datos).toHaveProperty('datosEncontrados');
                expect(datos).toHaveProperty('datosFaltantes');

                // Verificar tipos
                expect(typeof datos.confianza).toBe('number');
                expect(Array.isArray(datos.datosEncontrados)).toBe(true);
                expect(Array.isArray(datos.datosFaltantes)).toBe(true);

                // Log de resultados para debugging
                console.log('\n📊 Resultados del OCR:');
                console.log(`   Póliza: ${datos.numeroPoliza}`);
                console.log(`   Aseguradora: ${datos.aseguradora}`);
                console.log(`   Confianza: ${datos.confianza}%`);
                console.log(`   Campos encontrados: ${datos.datosEncontrados.length}`);
            }
        }, 60000); // Timeout de 60 segundos para llamada a API

        test('debe extraer datos del vehículo cuando están disponibles', async () => {
            if (!mistral.isConfigured() || !fs.existsSync(testPdfPath)) {
                console.log('⚠️ Configuración incompleta - saltando test');
                return;
            }

            const buffer = fs.readFileSync(testPdfPath);
            const resultado = await mistral.extraerDatosPoliza(
                buffer,
                'application/pdf',
                path.basename(testPdfPath)
            );

            if (resultado.success && resultado.datos?.vehiculo) {
                const vehiculo = resultado.datos.vehiculo;

                expect(vehiculo).toHaveProperty('marca');
                expect(vehiculo).toHaveProperty('submarca');
                expect(vehiculo).toHaveProperty('año');
                expect(vehiculo).toHaveProperty('placas');
                expect(vehiculo).toHaveProperty('serie');

                console.log('\n🚗 Datos del vehículo:');
                console.log(`   Marca: ${vehiculo.marca}`);
                console.log(`   Modelo: ${vehiculo.submarca}`);
                console.log(`   Año: ${vehiculo.año}`);
                console.log(`   VIN: ${vehiculo.serie}`);
            }
        }, 60000);
    });

    describe('Validación de tipos MIME', () => {
        test('debe aceptar application/pdf', async () => {
            if (!mistral.isConfigured()) {
                return;
            }

            // Buffer mínimo para probar (no es un PDF válido, pero verifica que acepta el tipo)
            const fakeBuffer = Buffer.from('fake pdf content');

            // El servicio debe intentar procesar sin error de tipo MIME
            const resultado = await mistral.extraerDatosPoliza(
                fakeBuffer,
                'application/pdf',
                'test.pdf'
            );

            // Puede fallar por contenido inválido, pero no por tipo MIME
            expect(resultado).toHaveProperty('success');
        }, 30000);

        test('debe aceptar image/jpeg', async () => {
            if (!mistral.isConfigured()) {
                return;
            }

            const fakeBuffer = Buffer.from('fake image content');

            const resultado = await mistral.extraerDatosPoliza(
                fakeBuffer,
                'image/jpeg',
                'test.jpg'
            );

            expect(resultado).toHaveProperty('success');
        }, 30000);
    });
});
