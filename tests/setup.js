// Configuración global para Jest
require('dotenv').config({ path: '.env.test' });

// Configurar timeout global para tests
jest.setTimeout(30000);

// Suprimir logs durante tests
console.log = jest.fn();
console.error = jest.fn();
console.warn = jest.fn();

// Mock de fetch global si no está disponible
if (!global.fetch) {
    global.fetch = jest.fn();
}

// Configuración para MongoDB Memory Server
process.env.NODE_ENV = 'test';
