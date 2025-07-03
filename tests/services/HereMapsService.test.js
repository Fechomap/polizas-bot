// tests/services/HereMapsService.test.js
const HereMapsService = require('../../src/services/HereMapsService');

// Mock fetch
global.fetch = jest.fn();

// Mock logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
}));

describe('HereMapsService', () => {
    let hereMapsService;
    
    beforeEach(() => {
        hereMapsService = new HereMapsService();
        // Mock API key for testing
        hereMapsService.apiKey = 'test-api-key';
        fetch.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('parseCoordinates', () => {
        test('should parse valid coordinate strings', () => {
            const result = hereMapsService.parseCoordinates('19.1234,-99.5678');
            expect(result).toEqual({ lat: 19.1234, lng: -99.5678 });
        });

        test('should parse coordinates with spaces', () => {
            const result = hereMapsService.parseCoordinates('19.1234, -99.5678');
            expect(result).toEqual({ lat: 19.1234, lng: -99.5678 });
        });

        test('should parse negative coordinates', () => {
            const result = hereMapsService.parseCoordinates('-19.1234,-99.5678');
            expect(result).toEqual({ lat: -19.1234, lng: -99.5678 });
        });

        test('should return null for invalid coordinates', () => {
            expect(hereMapsService.parseCoordinates('invalid')).toBeNull();
            expect(hereMapsService.parseCoordinates('19.1234')).toBeNull();
            expect(hereMapsService.parseCoordinates('')).toBeNull();
            expect(hereMapsService.parseCoordinates(null)).toBeNull();
        });

        test('should return null for coordinates out of range', () => {
            expect(hereMapsService.parseCoordinates('91.0,0.0')).toBeNull(); // lat > 90
            expect(hereMapsService.parseCoordinates('-91.0,0.0')).toBeNull(); // lat < -90
            expect(hereMapsService.parseCoordinates('0.0,181.0')).toBeNull(); // lng > 180
            expect(hereMapsService.parseCoordinates('0.0,-181.0')).toBeNull(); // lng < -180
        });

        test('should parse Google Maps URLs with @ format', () => {
            const url = 'https://www.google.com/maps/@19.4326,-99.1332,15z';
            const result = hereMapsService.parseCoordinates(url);
            expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
        });

        test('should parse Google Maps URLs with !3d!4d format', () => {
            const url = 'https://www.google.com/maps/place/@19.4326,-99.1332,15z/data=!3d19.4326!4d-99.1332';
            const result = hereMapsService.parseCoordinates(url);
            expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
        });

        test('should parse Google Maps URLs with q parameter', () => {
            const url = 'https://www.google.com/maps?q=19.4326,-99.1332';
            const result = hereMapsService.parseCoordinates(url);
            expect(result).toEqual({ lat: 19.4326, lng: -99.1332 });
        });
    });

    describe('calculateRoute', () => {
        const origen = { lat: 19.4326, lng: -99.1332 };
        const destino = { lat: 19.5000, lng: -99.2000 };

        test('should calculate route successfully', async () => {
            const mockResponse = {
                routes: [{
                    sections: [{
                        summary: {
                            length: 15000, // 15 km in meters
                            duration: 1800 // 30 minutes in seconds
                        }
                    }]
                }]
            };

            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await hereMapsService.calculateRoute(origen, destino);
            
            expect(result).toMatchObject({
                distanciaKm: 15,
                tiempoMinutos: 30,
                googleMapsUrl: 'https://www.google.com/maps/dir/19.4326,-99.1332/19.5,-99.2'
            });
            expect(result.aproximado).toBeUndefined();
        });

        test('should handle API errors and use fallback calculation', async () => {
            fetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await hereMapsService.calculateRoute(origen, destino);
            
            expect(result).toHaveProperty('distanciaKm');
            expect(result).toHaveProperty('tiempoMinutos');
            expect(result).toHaveProperty('googleMapsUrl');
            expect(result).toHaveProperty('aproximado', true);
        });

        test('should handle no routes found', async () => {
            const mockResponse = { routes: [] };

            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await hereMapsService.calculateRoute(origen, destino);
            
            expect(result).toHaveProperty('aproximado', true);
        });

        test('should throw error for invalid coordinates', async () => {
            await expect(hereMapsService.calculateRoute(null, destino))
                .rejects.toThrow('Invalid coordinates provided');
            
            await expect(hereMapsService.calculateRoute(origen, null))
                .rejects.toThrow('Invalid coordinates provided');
            
            await expect(hereMapsService.calculateRoute({ lat: 'invalid' }, destino))
                .rejects.toThrow('Invalid coordinates provided');
        });

        test('should throw error when API key is not configured', async () => {
            hereMapsService.apiKey = null;
            
            await expect(hereMapsService.calculateRoute(origen, destino))
                .rejects.toThrow('HERE Maps API key not configured');
        });
    });

    describe('calculateHaversineDistance', () => {
        test('should calculate distance between two points', () => {
            const origen = { lat: 19.4326, lng: -99.1332 };
            const destino = { lat: 19.5000, lng: -99.2000 };
            
            const distance = hereMapsService.calculateHaversineDistance(origen, destino);
            
            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThan(100); // Should be reasonable distance
        });

        test('should return 0 for same coordinates', () => {
            const coords = { lat: 19.4326, lng: -99.1332 };
            const distance = hereMapsService.calculateHaversineDistance(coords, coords);
            
            expect(distance).toBe(0);
        });
    });

    describe('generateGoogleMapsUrl', () => {
        test('should generate correct Google Maps URL', () => {
            const origen = { lat: 19.4326, lng: -99.1332 };
            const destino = { lat: 19.5000, lng: -99.2000 };
            
            const url = hereMapsService.generateGoogleMapsUrl(origen, destino);
            
            expect(url).toBe('https://www.google.com/maps/dir/19.4326,-99.1332/19.5,-99.2');
        });
    });

    describe('processUserInput', () => {
        test('should process coordinate input successfully', async () => {
            const mockResponse = {
                routes: [{
                    sections: [{
                        summary: {
                            length: 10000,
                            duration: 1200
                        }
                    }]
                }]
            };

            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await hereMapsService.processUserInput(
                '19.1234,-99.5678', 
                '19.5678,-99.1234'
            );

            expect(result.error).toBeNull();
            expect(result.origen).toEqual({ lat: 19.1234, lng: -99.5678 });
            expect(result.destino).toEqual({ lat: 19.5678, lng: -99.1234 });
            expect(result.rutaInfo).toBeDefined();
        });

        test('should handle invalid origin coordinates', async () => {
            const result = await hereMapsService.processUserInput(
                'invalid-origin', 
                '19.5678,-99.1234'
            );

            expect(result.error).toContain('No se pudieron extraer coordenadas del origen');
            expect(result.origen).toBeNull();
            expect(result.destino).toBeNull();
            expect(result.rutaInfo).toBeNull();
        });

        test('should handle invalid destination coordinates', async () => {
            const result = await hereMapsService.processUserInput(
                '19.1234,-99.5678', 
                'invalid-destination'
            );

            expect(result.error).toContain('No se pudieron extraer coordenadas del destino');
            expect(result.origen).toEqual({ lat: 19.1234, lng: -99.5678 });
            expect(result.destino).toBeNull();
            expect(result.rutaInfo).toBeNull();
        });

        test('should handle route calculation errors', async () => {
            fetch.mockRejectedValueOnce(new Error('API Error'));

            const result = await hereMapsService.processUserInput(
                '19.1234,-99.5678', 
                '19.5678,-99.1234'
            );

            expect(result.error).toBeNull();
            expect(result.origen).toBeDefined();
            expect(result.destino).toBeDefined();
            expect(result.rutaInfo).toBeDefined();
            expect(result.rutaInfo.aproximado).toBe(true);
        });
    });

    describe('toRadians', () => {
        test('should convert degrees to radians correctly', () => {
            expect(hereMapsService.toRadians(0)).toBe(0);
            expect(hereMapsService.toRadians(90)).toBeCloseTo(Math.PI / 2);
            expect(hereMapsService.toRadians(180)).toBeCloseTo(Math.PI);
            expect(hereMapsService.toRadians(360)).toBeCloseTo(2 * Math.PI);
        });
    });
});