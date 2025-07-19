/**
 * Test completo para HereMapsService - TypeScript moderno y funcional
 * Servicio crítico para cálculo de costos y manejo de coordenadas
 */

import { jest } from '@jest/globals';

// Mock de node-fetch - Simplificado para evitar errores de tipado
const mockFetch = jest.fn() as any;
jest.mock('node-fetch', () => ({
    default: mockFetch
}));

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Importar el servicio después de los mocks
import HereMapsService from '../../src/services/HereMapsService';

// Helper para crear mock Response simplificado
const createMockResponse = (data: any, ok: boolean = true): any => ({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
});

describe('HereMapsService - Test Completo', () => {
    let hereMapsService: HereMapsService;
    const originalEnv = process.env.HERE_MAPS_API_KEY;

    beforeEach(() => {
        // Configurar API key para tests
        process.env.HERE_MAPS_API_KEY = 'test-api-key-12345';
        hereMapsService = new HereMapsService();
        mockFetch.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        // Restaurar variable de entorno
        process.env.HERE_MAPS_API_KEY = originalEnv;
    });

    describe('Constructor e inicialización', () => {
        test('debe inicializar correctamente con API key', () => {
            const service = new HereMapsService();
            expect(service).toBeInstanceOf(HereMapsService);
        });

        test('debe manejar falta de API key', () => {
            delete process.env.HERE_MAPS_API_KEY;
            const service = new HereMapsService();
            expect(service).toBeInstanceOf(HereMapsService);
        });
    });

    describe('parseCoordinates - Parseado de coordenadas (CRÍTICO)', () => {
        describe('Coordenadas directas', () => {
            test('debe parsear coordenadas válidas básicas', () => {
                const result = hereMapsService.parseCoordinates('19.1234,-99.5678');
                expect(result).toEqual({ lat: 19.1234, lng: -99.5678 });
            });

            test('debe parsear coordenadas con espacios', () => {
                const result = hereMapsService.parseCoordinates('19.1234, -99.5678');
                expect(result).toEqual({ lat: 19.1234, lng: -99.5678 });
            });

            test('debe parsear coordenadas negativas', () => {
                const result = hereMapsService.parseCoordinates('-19.1234,-99.5678');
                expect(result).toEqual({ lat: -19.1234, lng: -99.5678 });
            });

            test('debe parsear coordenadas con decimales', () => {
                const result = hereMapsService.parseCoordinates('19.432648,-99.133209');
                expect(result).toEqual({ lat: 19.432648, lng: -99.133209 });
            });

            test('debe parsear coordenadas enteras', () => {
                const result = hereMapsService.parseCoordinates('19,-99');
                expect(result).toEqual({ lat: 19, lng: -99 });
            });
        });

        describe('Validación de rangos', () => {
            test('debe rechazar latitud fuera de rango (> 90)', () => {
                expect(hereMapsService.parseCoordinates('91.0,0.0')).toBeNull();
                expect(hereMapsService.parseCoordinates('180.0,0.0')).toBeNull();
            });

            test('debe rechazar latitud fuera de rango (< -90)', () => {
                expect(hereMapsService.parseCoordinates('-91.0,0.0')).toBeNull();
                expect(hereMapsService.parseCoordinates('-180.0,0.0')).toBeNull();
            });

            test('debe rechazar longitud fuera de rango (> 180)', () => {
                expect(hereMapsService.parseCoordinates('0.0,181.0')).toBeNull();
                expect(hereMapsService.parseCoordinates('0.0,200.0')).toBeNull();
            });

            test('debe rechazar longitud fuera de rango (< -180)', () => {
                expect(hereMapsService.parseCoordinates('0.0,-181.0')).toBeNull();
                expect(hereMapsService.parseCoordinates('0.0,-200.0')).toBeNull();
            });

            test('debe aceptar coordenadas en los límites válidos', () => {
                expect(hereMapsService.parseCoordinates('90,180')).toEqual({ lat: 90, lng: 180 });
                expect(hereMapsService.parseCoordinates('-90,-180')).toEqual({ lat: -90, lng: -180 });
                expect(hereMapsService.parseCoordinates('0,0')).toEqual({ lat: 0, lng: 0 });
            });
        });

        describe('URLs de Google Maps (Casos reales de usuarios)', () => {
            test('debe parsear URL con formato @ (embed)', () => {
                const url = 'https://www.google.com/maps/@19.4326,-99.1332,15z';
                const result = hereMapsService.parseCoordinates(url);
                expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
            });

            test('debe parsear URL con formato !3d!4d (place)', () => {
                const url = 'https://www.google.com/maps/place/@19.4326,-99.1332,15z/data=!3d19.4326!4d-99.1332';
                const result = hereMapsService.parseCoordinates(url);
                expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
            });

            test('debe parsear URL con parámetro q', () => {
                const url = 'https://www.google.com/maps?q=19.4326,-99.1332';
                const result = hereMapsService.parseCoordinates(url);
                expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
            });

            test('debe parsear URL compleja de Google Maps', () => {
                const url = 'https://www.google.com/maps/place/Ciudad+de+M%C3%A9xico,+CDMX/@19.4326,-99.1332,10z/data=!3d19.4326!4d-99.1332!4m5!3m4!1s0x85ce0026db097507:0x54061076265ee841!8m2!3d19.4284700!4d-99.1276600';
                const result = hereMapsService.parseCoordinates(url);
                expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
            });
        });

        describe('Entradas inválidas', () => {
            test('debe retornar null para entradas inválidas', () => {
                expect(hereMapsService.parseCoordinates('invalid')).toBeNull();
                expect(hereMapsService.parseCoordinates('19.1234')).toBeNull();
                expect(hereMapsService.parseCoordinates('')).toBeNull();
                expect(hereMapsService.parseCoordinates('   ')).toBeNull();
                expect(hereMapsService.parseCoordinates('abc,def')).toBeNull();
                expect(hereMapsService.parseCoordinates('19.1234,abc')).toBeNull();
            });

            test('debe manejar entradas null/undefined', () => {
                expect(hereMapsService.parseCoordinates(null as any)).toBeNull();
                expect(hereMapsService.parseCoordinates(undefined as any)).toBeNull();
            });

            test('debe manejar tipos incorretos', () => {
                expect(hereMapsService.parseCoordinates(123 as any)).toBeNull();
                expect(hereMapsService.parseCoordinates({} as any)).toBeNull();
                expect(hereMapsService.parseCoordinates([] as any)).toBeNull();
            });
        });

        describe('Coordenadas México típicas (Casos reales)', () => {
            test('debe validar coordenadas de ciudades mexicanas', () => {
                // Coordenadas típicas de ciudades mexicanas usadas en el sistema
                const cdmx = hereMapsService.parseCoordinates('19.4326,-99.1332');
                const guadalajara = hereMapsService.parseCoordinates('20.6597,-103.3496');
                const monterrey = hereMapsService.parseCoordinates('25.6866,-100.3161');
                const cancun = hereMapsService.parseCoordinates('21.1619,-86.8515');

                expect(cdmx).toEqual({ lat: 19.4326, lng: -99.1332 });
                expect(guadalajara).toEqual({ lat: 20.6597, lng: -103.3496 });
                expect(monterrey).toEqual({ lat: 25.6866, lng: -100.3161 });
                expect(cancun).toEqual({ lat: 21.1619, lng: -86.8515 });
            });
        });
    });

    describe('calculateRoute - Cálculo de rutas (SISTEMA DE COSTOS)', () => {
        const origenValido = { lat: 19.4326, lng: -99.1332 };
        const destinoValido = { lat: 19.5, lng: -99.2 };

        const mockRouteResponse = {
            routes: [
                {
                    sections: [
                        {
                            summary: {
                                length: 15000, // 15 km en metros
                                duration: 1800 // 30 minutos en segundos
                            }
                        }
                    ]
                }
            ]
        };

        test('debe calcular ruta usando fallback Haversine', async () => {
            // En el entorno de test, se usa fallback Haversine
            const result = await hereMapsService.calculateRoute(origenValido, destinoValido);

            expect(result).toMatchObject({
                googleMapsUrl: 'https://www.google.com/maps/dir/19.4326,-99.1332/19.5,-99.2'
            });
            expect(result.distanciaKm).toBeGreaterThan(0);
            expect(result.tiempoMinutos).toBeGreaterThan(0);
            expect(result.aproximado).toBe(true); // Usando fallback
        });

        test('debe generar URL de Google Maps correcta', async () => {
            const result = await hereMapsService.calculateRoute(origenValido, destinoValido);
            
            expect(result.googleMapsUrl).toBe('https://www.google.com/maps/dir/19.4326,-99.1332/19.5,-99.2');
        });

        test('debe manejar respuesta sin rutas y usar fallback', async () => {
            const emptyResponse = { routes: [] };
            mockFetch.mockResolvedValueOnce(createMockResponse(emptyResponse));

            const result = await hereMapsService.calculateRoute(origenValido, destinoValido);

            expect(result).toHaveProperty('aproximado', true);
            expect(result).toHaveProperty('distanciaKm');
            expect(result).toHaveProperty('tiempoMinutos');
            expect(result).toHaveProperty('googleMapsUrl');
            expect(result.distanciaKm).toBeGreaterThan(0);
        });

        test('debe usar fallback Haversine en errores de red', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await hereMapsService.calculateRoute(origenValido, destinoValido);

            expect(result).toHaveProperty('aproximado', true);
            expect(result.distanciaKm).toBeGreaterThan(0);
            expect(result.tiempoMinutos).toBeGreaterThan(0);
            expect(result.googleMapsUrl).toContain('https://www.google.com/maps/dir/');
        });

        test('debe usar fallback en errores de API', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse({}, false));

            const result = await hereMapsService.calculateRoute(origenValido, destinoValido);

            expect(result).toHaveProperty('aproximado', true);
        });

        test('debe validar coordenadas de origen', async () => {
            await expect(
                hereMapsService.calculateRoute(null as any, destinoValido)
            ).rejects.toThrow('Invalid coordinates provided');

            await expect(
                hereMapsService.calculateRoute({ lat: 'invalid' } as any, destinoValido)
            ).rejects.toThrow('Invalid coordinates provided');

            await expect(
                hereMapsService.calculateRoute({ lat: 19.4326 } as any, destinoValido)
            ).rejects.toThrow('Invalid coordinates provided');
        });

        test('debe validar coordenadas de destino', async () => {
            await expect(
                hereMapsService.calculateRoute(origenValido, null as any)
            ).rejects.toThrow('Invalid coordinates provided');

            await expect(
                hereMapsService.calculateRoute(origenValido, { lng: -99.1332 } as any)
            ).rejects.toThrow('Invalid coordinates provided');
        });

        test('debe rechazar cuando no hay API key', async () => {
            delete process.env.HERE_MAPS_API_KEY;
            const serviceWithoutKey = new HereMapsService();

            await expect(
                serviceWithoutKey.calculateRoute(origenValido, destinoValido)
            ).rejects.toThrow('HERE Maps API key not configured');
        });
    });

    describe('processUserInput - Flujo completo del usuario (INTEGRACIÓN)', () => {
        const mockRouteResponse = {
            routes: [
                {
                    sections: [
                        {
                            summary: {
                                length: 10000, // 10 km
                                duration: 1200 // 20 minutos
                            }
                        }
                    ]
                }
            ]
        };

        test('debe procesar entrada de coordenadas exitosamente', async () => {
            const result = await hereMapsService.processUserInput(
                '19.1234,-99.5678',
                '19.5678,-99.1234'
            );

            expect(result.error).toBeNull();
            expect(result.origen).toEqual({ lat: 19.1234, lng: -99.5678 });
            expect(result.destino).toEqual({ lat: 19.5678, lng: -99.1234 });
            expect(result.rutaInfo).toBeDefined();
            expect(result.rutaInfo?.distanciaKm).toBeGreaterThan(0);
            expect(result.rutaInfo?.tiempoMinutos).toBeGreaterThan(0);
            expect(result.rutaInfo?.aproximado).toBe(true); // Usando fallback en test
        });

        test('debe manejar URLs de Google Maps como entrada', async () => {
            mockFetch.mockResolvedValueOnce(createMockResponse(mockRouteResponse));

            const result = await hereMapsService.processUserInput(
                'https://www.google.com/maps/@19.1234,-99.5678,15z',
                'https://www.google.com/maps?q=19.5678,-99.1234'
            );

            expect(result.error).toBeNull();
            expect(result.origen).toEqual({ lat: 19.1234, lng: -99.5678 });
            expect(result.destino).toEqual({ lat: 19.5678, lng: -99.1234 });
        });

        test('debe manejar origen inválido', async () => {
            const result = await hereMapsService.processUserInput(
                'origen-invalido',
                '19.5678,-99.1234'
            );

            expect(result.error).toContain('No se pudieron extraer coordenadas del origen');
            expect(result.origen).toBeNull();
            expect(result.destino).toBeNull();
            expect(result.rutaInfo).toBeNull();
        });

        test('debe manejar destino inválido', async () => {
            const result = await hereMapsService.processUserInput(
                '19.1234,-99.5678',
                'destino-invalido'
            );

            expect(result.error).toContain('No se pudieron extraer coordenadas del destino');
            expect(result.origen).toEqual({ lat: 19.1234, lng: -99.5678 });
            expect(result.destino).toBeNull();
            expect(result.rutaInfo).toBeNull();
        });

        test('debe usar fallback cuando calculateRoute falla', async () => {
            mockFetch.mockRejectedValueOnce(new Error('API Error'));

            const result = await hereMapsService.processUserInput(
                '19.1234,-99.5678',
                '19.5678,-99.1234'
            );

            expect(result.error).toBeNull();
            expect(result.origen).toBeDefined();
            expect(result.destino).toBeDefined();
            expect(result.rutaInfo).toBeDefined();
            expect(result.rutaInfo?.aproximado).toBe(true);
        });

        test('debe manejar entradas vacías', async () => {
            const result = await hereMapsService.processUserInput('', '19.5678,-99.1234');

            expect(result.error).toContain('No se pudieron extraer coordenadas del origen');
        });
    });

    describe('Integración con Sistema de Costos (CRÍTICO PARA NEGOCIO)', () => {
        test('debe calcular costo correctamente con distancia real', async () => {
            // Simular entrada de usuario típica del sistema
            const origenUsuario = '19.4326,-99.1332'; // CDMX Centro
            const destinoUsuario = 'https://www.google.com/maps/@19.5,-99.2,15z';

            const result = await hereMapsService.processUserInput(origenUsuario, destinoUsuario);

            // Verificar que el flujo completo funciona
            expect(result.error).toBeNull();
            expect(result.rutaInfo?.distanciaKm).toBeGreaterThan(0);
            expect(result.rutaInfo?.tiempoMinutos).toBeGreaterThan(0);

            // CRÍTICO: Simular cálculo de costo como en handleServiceData.ts
            const distanciaKm = result.rutaInfo?.distanciaKm || 0;
            const costoCalculado = Math.round((distanciaKm * 20 + 650) * 100) / 100;

            expect(costoCalculado).toBeGreaterThan(650); // Costo base + distancia
            expect(typeof costoCalculado).toBe('number');
        });

        test('debe funcionar con fallback para costos aproximados', async () => {
            // Simular falla de API - sistema debe seguir funcionando
            mockFetch.mockRejectedValueOnce(new Error('Service unavailable'));

            const result = await hereMapsService.processUserInput('19.4326,-99.1332', '19.5,-99.2');

            // Debe usar fallback Haversine y seguir calculando costos
            expect(result.error).toBeNull();
            expect(result.rutaInfo?.aproximado).toBe(true);
            expect(result.rutaInfo?.distanciaKm).toBeGreaterThan(0);
            expect(result.rutaInfo?.googleMapsUrl).toContain('google.com/maps');

            // Sistema de costos debe funcionar incluso con aproximación
            const distanciaKm = result.rutaInfo?.distanciaKm || 0;
            const costoCalculado = Math.round((distanciaKm * 20 + 650) * 100) / 100;
            expect(costoCalculado).toBeGreaterThan(650); // Costo base + algo de distancia
        });

        test('debe manejar casos edge del sistema real', async () => {
            // Casos que pueden ocurrir en producción
            const casosReales = [
                '19.4326,-99.1332',                                    // Coordenadas simples
                'https://goo.gl/maps/abc123',                         // URL corta (debe fallar gracefully)
                '19.432648, -99.133209',                              // Con espacios extras
                'https://www.google.com/maps/@19.4326,-99.1332,15z'   // URL completa
            ];

            for (const origen of casosReales) {
                const destino = '19.5,-99.2';
                
                // Simular respuesta exitosa para casos válidos
                if (origen.includes('19.')) {
                    mockFetch.mockResolvedValueOnce(createMockResponse({
                        routes: [{ sections: [{ summary: { length: 5000, duration: 600 } }] }]
                    }));
                }

                const result = await hereMapsService.processUserInput(origen, destino);
                
                // Casos válidos deben funcionar
                if (origen.includes('19.') && !origen.includes('goo.gl')) {
                    expect(result.error).toBeNull();
                    expect(result.rutaInfo?.distanciaKm).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('Robustez y Manejo de Errores', () => {
        test('debe manejar diferentes tipos de errores de red', async () => {
            const erroresComunes = [
                new Error('ECONNREFUSED'),
                new Error('ETIMEDOUT'),
                new Error('Network Error'),
                new Error('Service Unavailable')
            ];

            for (const error of erroresComunes) {
                mockFetch.mockRejectedValueOnce(error);

                const result = await hereMapsService.calculateRoute(
                    { lat: 19.4326, lng: -99.1332 },
                    { lat: 19.5, lng: -99.2 }
                );

                expect(result).toHaveProperty('aproximado', true);
                expect(result.distanciaKm).toBeGreaterThan(0);
            }
        });

        test('debe ser resiliente a respuestas malformadas de API', async () => {
            const respuestasMalformadas = [
                {},                           // Objeto vacío
                { routes: null },            // Routes null
                { routes: [] },              // Sin rutas
                { routes: [{}] },            // Ruta sin sections
                { routes: [{ sections: [] }] } // Sections vacías
            ];

            for (const respuesta of respuestasMalformadas) {
                mockFetch.mockResolvedValueOnce(createMockResponse(respuesta));

                const result = await hereMapsService.calculateRoute(
                    { lat: 19.4326, lng: -99.1332 },
                    { lat: 19.5, lng: -99.2 }
                );

                // Debe usar fallback en todos los casos
                expect(result).toHaveProperty('aproximado', true);
                expect(result.distanciaKm).toBeGreaterThan(0);
            }
        });
    });
});