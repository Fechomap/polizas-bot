// test-here-api.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const fetch = require('node-fetch');

async function testHereAPI() {
    console.log('=== Prueba de HERE Maps API ===');
    
    // Verificar si la API key está disponible
    const apiKey = process.env.HERE_MAPS_API_KEY;
    console.log('API Key disponible:', apiKey ? 'SÍ' : 'NO');
    console.log('API Key (primeros 10 caracteres):', apiKey ? apiKey.slice(0, 10) + '...' : 'N/A');
    
    if (!apiKey) {
        console.error('❌ API key no encontrada en variables de entorno');
        return;
    }
    
    // Test de geocoding reverso
    const testLat = 19.4078;
    const testLng = -99.0188;
    
    console.log(`\n=== Prueba de Geocoding Reverso ===`);
    console.log(`Coordenadas: ${testLat}, ${testLng}`);
    
    try {
        const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${testLat},${testLng}&lang=es-MX&apikey=${apiKey}`;
        console.log('URL:', url.replace(apiKey, '[API_KEY]'));
        
        const response = await fetch(url);
        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);
        
        const data = await response.text();
        console.log('Response (primeros 500 caracteres):', data.slice(0, 500));
        
        if (response.ok) {
            const jsonData = JSON.parse(data);
            if (jsonData.items && jsonData.items.length > 0) {
                const address = jsonData.items[0].address;
                console.log('\n✅ Geocoding exitoso:');
                console.log('- Título:', jsonData.items[0].title);
                console.log('- Distrito:', address.district);
                console.log('- Ciudad:', address.city);
                console.log('- Estado:', address.state);
                console.log('- País:', address.countryName);
            } else {
                console.log('⚠️ No se encontraron resultados');
            }
        } else {
            console.log('❌ Error en la petición');
        }
        
    } catch (error) {
        console.error('❌ Error en la prueba:', error.message);
    }
    
    // Test de routing
    console.log(`\n=== Prueba de Routing ===`);
    const origen = { lat: 19.4078, lng: -99.0188 };
    const destino = { lat: 19.2880, lng: -99.6585 };
    
    try {
        const routingUrl = `https://router.hereapi.com/v8/routes?origin=${origen.lat},${origen.lng}&destination=${destino.lat},${destino.lng}&transportMode=car&return=summary&apikey=${apiKey}`;
        console.log('URL:', routingUrl.replace(apiKey, '[API_KEY]'));
        
        const response = await fetch(routingUrl);
        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);
        
        const data = await response.text();
        console.log('Response (primeros 500 caracteres):', data.slice(0, 500));
        
        if (response.ok) {
            const jsonData = JSON.parse(data);
            if (jsonData.routes && jsonData.routes.length > 0) {
                const route = jsonData.routes[0];
                const summary = route.sections[0].summary;
                console.log('\n✅ Routing exitoso:');
                console.log('- Distancia:', Math.round(summary.length / 1000 * 100) / 100, 'km');
                console.log('- Tiempo:', Math.round(summary.duration / 60), 'minutos');
            } else {
                console.log('⚠️ No se encontraron rutas');
            }
        } else {
            console.log('❌ Error en la petición de routing');
        }
        
    } catch (error) {
        console.error('❌ Error en la prueba de routing:', error.message);
    }
}

testHereAPI().catch(console.error);