// Wrapper para importar el modelo Vehicle desde TypeScript
// Este archivo permite que los scripts JavaScript accedan al modelo TypeScript compilado

try {
    // Intentar cargar desde el directorio compilado
    const vehicle = require('../../dist/models/vehicle');
    module.exports = vehicle.default || vehicle;
} catch (error) {
    console.error('Error cargando desde dist:', error);
    try {
        // Si no existe dist, usar ts-node para cargar directamente
        require('ts-node/register');
        const vehicle = require('../../src/models/vehicle.ts');
        module.exports = vehicle.default || vehicle;
    } catch (tsError) {
        console.error('Error cargando con ts-node:', tsError);
        throw new Error('No se pudo cargar el modelo Vehicle desde ninguna fuente');
    }
}
