/**
 * Tests para MistralVisionService y PlacasValidator
 * OCR de tarjetas de circulación y validación de placas
 */

import { describe, test, expect, beforeAll, jest } from '@jest/globals';

describe('MistralVisionService', () => {
    let visionService: any;

    beforeAll(async () => {
        const { getInstance } = await import('../../src/services/MistralVisionService');
        visionService = getInstance();
    });

    describe('Configuración', () => {
        test('debe estar disponible como singleton', () => {
            expect(visionService).toBeDefined();
            expect(typeof visionService.isConfigured).toBe('function');
        });

        test('debe tener métodos de OCR de imagen', () => {
            expect(typeof visionService.extraerDatosTarjetaCirculacion).toBe('function');
            expect(typeof visionService.detectarPlacasEnFoto).toBe('function');
        });

        test('isConfigured debe retornar boolean', () => {
            const configured = visionService.isConfigured();
            expect(typeof configured).toBe('boolean');
            console.log(`MistralVision configurado: ${configured}`);
        });
    });

    describe('Extracción de datos de tarjeta (si está configurado)', () => {
        test('debe manejar imagen inválida sin crashear', async () => {
            if (!visionService.isConfigured()) {
                console.log('⚠️ Saltando test - MistralVision no configurado');
                return;
            }

            // Buffer de imagen falsa (no válida)
            const fakeImageBuffer = Buffer.from('fake image data');

            const resultado = await visionService.extraerDatosTarjetaCirculacion(
                fakeImageBuffer,
                'image/jpeg'
            );

            // Debe retornar error pero no crashear
            expect(resultado).toBeDefined();
            expect(resultado.success).toBe(false);
            console.log('Resultado de imagen inválida:', resultado.error);
        });

        test('debe retornar estructura correcta', async () => {
            if (!visionService.isConfigured()) {
                console.log('⚠️ Saltando test - MistralVision no configurado');
                return;
            }

            const fakeImageBuffer = Buffer.from('test');
            const resultado = await visionService.extraerDatosTarjetaCirculacion(fakeImageBuffer);

            expect(resultado).toHaveProperty('success');
            expect(resultado).toHaveProperty('datos');

            if (resultado.success && resultado.datos) {
                expect(resultado.datos).toHaveProperty('serie');
                expect(resultado.datos).toHaveProperty('marca');
                expect(resultado.datos).toHaveProperty('submarca');
                expect(resultado.datos).toHaveProperty('año');
                expect(resultado.datos).toHaveProperty('color');
                expect(resultado.datos).toHaveProperty('placas');
                expect(resultado.datos).toHaveProperty('confianza');
                expect(resultado.datos).toHaveProperty('datosEncontrados');
                expect(resultado.datos).toHaveProperty('datosFaltantes');
            }
        });
    });
});

describe('PlacasValidator', () => {
    let validator: any;

    beforeAll(async () => {
        const { getInstance } = await import('../../src/services/PlacasValidator');
        validator = getInstance();
    });

    describe('Normalización de placas', () => {
        test('debe normalizar placas correctamente', () => {
            expect(validator.normalizar('ABC-123-D')).toBe('ABC123D');
            expect(validator.normalizar('abc 123 d')).toBe('ABC123D');
            expect(validator.normalizar('  ABC--123--D  ')).toBe('ABC123D');
            expect(validator.normalizar('')).toBe('');
            expect(validator.normalizar(null)).toBe('');
        });

        test('debe manejar caracteres especiales', () => {
            expect(validator.normalizar('ÁBC-123')).toBe('BC123'); // Sin acentos
            expect(validator.normalizar('A.B.C-1.2.3')).toBe('ABC123');
        });
    });

    describe('Cálculo de similitud', () => {
        test('debe retornar 100% para placas idénticas', () => {
            expect(validator.calcularSimilitud('ABC123D', 'ABC123D')).toBe(100);
            expect(validator.calcularSimilitud('ABC-123-D', 'abc 123 d')).toBe(100);
        });

        test('debe calcular similitud parcial', () => {
            const similitud = validator.calcularSimilitud('ABC123D', 'ABC124D');
            expect(similitud).toBeGreaterThan(80);
            expect(similitud).toBeLessThan(100);
            console.log(`Similitud ABC123D vs ABC124D: ${similitud}%`);
        });

        test('debe retornar 0% para placas muy diferentes', () => {
            const similitud = validator.calcularSimilitud('ABC123', 'XYZ999');
            expect(similitud).toBeLessThan(50);
            console.log(`Similitud ABC123 vs XYZ999: ${similitud}%`);
        });

        test('debe manejar strings vacíos', () => {
            expect(validator.calcularSimilitud('', '')).toBe(100);
            expect(validator.calcularSimilitud('ABC', '')).toBe(0);
            expect(validator.calcularSimilitud('', 'ABC')).toBe(0);
        });
    });

    describe('Comparación con referencia', () => {
        test('debe detectar coincidencia exacta', () => {
            const resultado = validator.compararConReferencia(
                'ABC-123-D',
                ['ABC123D']
            );

            expect(resultado.coinciden).toBe(true);
            expect(resultado.similitud).toBe(100);
            console.log('Coincidencia exacta:', resultado.detalles);
        });

        test('debe detectar coincidencia cercana', () => {
            const resultado = validator.compararConReferencia(
                'ABC-123-D',
                ['ABC-123-E'] // Último caracter diferente
            );

            expect(resultado.similitud).toBeGreaterThan(80);
            console.log('Coincidencia cercana:', resultado.detalles);
        });

        test('debe rechazar placas muy diferentes', () => {
            const resultado = validator.compararConReferencia(
                'ABC-123-D',
                ['XYZ-999-A']
            );

            expect(resultado.coinciden).toBe(false);
            expect(resultado.similitud).toBeLessThan(50);
            console.log('No coincide:', resultado.detalles);
        });

        test('debe manejar lista vacía de placas', () => {
            const resultado = validator.compararConReferencia(
                'ABC-123-D',
                []
            );

            expect(resultado.coinciden).toBe(false);
            expect(resultado.similitud).toBe(0);
        });

        test('debe encontrar mejor coincidencia en lista', () => {
            const resultado = validator.compararConReferencia(
                'ABC-123-D',
                ['XYZ-999-A', 'ABC-123-E', 'DEF-456-F']
            );

            expect(resultado.similitud).toBeGreaterThan(50);
            console.log('Mejor coincidencia en lista:', resultado.detalles);
        });
    });

    describe('Validación de formato', () => {
        test('debe validar formatos mexicanos comunes', () => {
            expect(validator.esFormatoValido('ABC-123-D')).toBe(true);
            expect(validator.esFormatoValido('ABC1234')).toBe(true);
            expect(validator.esFormatoValido('AB12345')).toBe(true);
            expect(validator.esFormatoValido('123ABC')).toBe(true);
        });

        test('debe rechazar formatos inválidos', () => {
            expect(validator.esFormatoValido('')).toBe(false);
            expect(validator.esFormatoValido('A')).toBe(false);
            expect(validator.esFormatoValido('AB')).toBe(false);
        });
    });

    describe('Formateo de placas', () => {
        test('debe formatear placas al estilo mexicano', () => {
            const formateada = validator.formatear('ABC123D');
            expect(formateada).toBeDefined();
            console.log(`Formateo de ABC123D: ${formateada}`);
        });

        test('debe mantener placas cortas sin cambios', () => {
            expect(validator.formatear('ABC')).toBe('ABC');
        });
    });
});

describe('Integración VehicleOCRHandler', () => {
    test('debe exportar las constantes correctas', async () => {
        const { ESTADOS_OCR_VEHICULO } = await import(
            '../../src/comandos/comandos/VehicleOCRHandler'
        );

        expect(ESTADOS_OCR_VEHICULO).toBeDefined();
        expect(ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA).toBe('esperando_tarjeta');
        expect(ESTADOS_OCR_VEHICULO.CONFIRMANDO_DATOS).toBe('confirmando_datos');
        expect(ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE).toBe('esperando_dato');
        expect(ESTADOS_OCR_VEHICULO.ESPERANDO_FOTOS_VEHICULO).toBe('esperando_fotos');
        expect(ESTADOS_OCR_VEHICULO.VALIDANDO_PLACAS).toBe('validando_placas');
        expect(ESTADOS_OCR_VEHICULO.COMPLETADO).toBe('completado');
    });

    test('debe exportar la clase VehicleOCRHandler', async () => {
        const { VehicleOCRHandler } = await import(
            '../../src/comandos/comandos/VehicleOCRHandler'
        );

        expect(VehicleOCRHandler).toBeDefined();
        expect(typeof VehicleOCRHandler.iniciarRegistroOCR).toBe('function');
        expect(typeof VehicleOCRHandler.procesarImagen).toBe('function');
        expect(typeof VehicleOCRHandler.procesarTexto).toBe('function');
        expect(typeof VehicleOCRHandler.confirmarDatos).toBe('function');
        expect(typeof VehicleOCRHandler.finalizarRegistro).toBe('function');
        expect(typeof VehicleOCRHandler.tieneRegistroEnProceso).toBe('function');
        expect(typeof VehicleOCRHandler.cancelarRegistro).toBe('function');
    });
});
