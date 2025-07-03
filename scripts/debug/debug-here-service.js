// debug-here-service.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const HereMapsService = require('./src/services/HereMapsService');

async function debugHereService() {
    console.log('=== Debug HERE Maps Service ===');

    // Crear instancia del servicio
    const hereService = new HereMapsService();

    console.log('API Key configurada:', hereService.apiKey ? 'SÍ' : 'NO');
    console.log('API Key (primeros 10 chars):', hereService.apiKey?.slice(0, 10) + '...');
    console.log('Base URL:', hereService.routingBaseUrl);

    // Test de coordinadas
    console.log('\n=== Test de parsing de coordenadas ===');
    const coordenadas1 = hereService.parseCoordinates('19.4078,-99.0188');
    console.log('Coordenadas parseadas:', coordenadas1);

    // Test de geocoding reverso con manejo de errores
    console.log('\n=== Test de geocoding reverso ===');
    try {
        const resultado = await hereService.reverseGeocode(19.4078, -99.0188);
        console.log('Resultado geocoding:', resultado);
    } catch (error) {
        console.log('Error en geocoding:', error.message);
        console.log('Usando fallback automático del servicio...');

        // El servicio debería regresar un fallback
        const resultadoFallback = await hereService.reverseGeocode(19.4078, -99.0188).catch(err => {
            console.log('Error capturado, probando manualmente el fallback...');
            return {
                colonia: '',
                municipio: '',
                estado: '',
                pais: '',
                codigoPostal: '',
                direccionCompleta: '19.4078, -99.0188',
                ubicacionCorta: '19.4078, -99.0188',
                fallback: true
            };
        });
        console.log('Resultado con fallback:', resultadoFallback);
    }

    // Test de cálculo de ruta
    console.log('\n=== Test de cálculo de ruta ===');
    try {
        const origen = { lat: 19.4078, lng: -99.0188 };
        const destino = { lat: 19.2880, lng: -99.6585 };

        const ruta = await hereService.calculateRoute(origen, destino);
        console.log('Resultado ruta:', ruta);
    } catch (error) {
        console.log('Error en cálculo de ruta:', error.message);
    }

    // Test de URL de Google Maps
    console.log('\n=== Test de Google Maps URL ===');
    const origen = { lat: 19.4078, lng: -99.0188 };
    const destino = { lat: 19.2880, lng: -99.6585 };
    const googleUrl = hereService.generateGoogleMapsUrl(origen, destino);
    console.log('Google Maps URL:', googleUrl);
}

debugHereService().catch(console.error);
