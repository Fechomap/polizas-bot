// test-here-api-formats.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const fetch = require('node-fetch');

async function testHereAPIFormats() {
    console.log('=== Prueba de diferentes formatos de API ===');
    
    const apiKey = process.env.HERE_MAPS_API_KEY;
    if (!apiKey) {
        console.error('❌ API key no encontrada en variables de entorno');
        return;
    }
    
    const testLat = 19.4078;
    const testLng = -99.0188;
    
    // Test 1: Formato original con 'apikey'
    console.log('\n=== Test 1: Formato original con apikey ===');
    try {
        const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${testLat},${testLng}&lang=es-MX&apikey=${apiKey}`;
        const response = await fetch(url);
        console.log('Status:', response.status);
        const data = await response.text();
        console.log('Response:', data.slice(0, 200));
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // Test 2: Formato con 'api_key' (guión bajo)
    console.log('\n=== Test 2: Formato con api_key (guión bajo) ===');
    try {
        const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${testLat},${testLng}&lang=es-MX&api_key=${apiKey}`;
        const response = await fetch(url);
        console.log('Status:', response.status);
        const data = await response.text();
        console.log('Response:', data.slice(0, 200));
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // Test 3: Formato con header Authorization
    console.log('\n=== Test 3: Formato con header Authorization ===');
    try {
        const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${testLat},${testLng}&lang=es-MX`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        console.log('Status:', response.status);
        const data = await response.text();
        console.log('Response:', data.slice(0, 200));
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // Test 4: Formato con header personalizado
    console.log('\n=== Test 4: Formato con header personalizado ===');
    try {
        const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${testLat},${testLng}&lang=es-MX`;
        const response = await fetch(url, {
            headers: {
                'X-API-Key': apiKey
            }
        });
        console.log('Status:', response.status);
        const data = await response.text();
        console.log('Response:', data.slice(0, 200));
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // Test 5: Verificar documentación de HERE Maps
    console.log('\n=== Test 5: Verificar endpoint alternativo ===');
    try {
        const url = `https://geocode.search.hereapi.com/v1/geocode?q=Mexico City&apikey=${apiKey}`;
        const response = await fetch(url);
        console.log('Status:', response.status);
        const data = await response.text();
        console.log('Response:', data.slice(0, 200));
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // Test 6: Verificar si la API key tiene el formato correcto
    console.log('\n=== Test 6: Análisis de la API key ===');
    console.log('API Key length:', apiKey.length);
    console.log('API Key starts with:', apiKey.slice(0, 10));
    console.log('API Key ends with:', apiKey.slice(-10));
    console.log('API Key contains:', {
        hasHyphens: apiKey.includes('-'),
        hasUpperCase: apiKey !== apiKey.toLowerCase(),
        hasNumbers: /\d/.test(apiKey),
        hasSpecialChars: /[^a-zA-Z0-9-_]/.test(apiKey)
    });
}

testHereAPIFormats().catch(console.error);