// Wrapper para importar el modelo Policy desde TypeScript
// Este archivo permite que los scripts JavaScript accedan al modelo TypeScript compilado

try {
    // Intentar cargar desde el directorio compilado
    const policy = require('../../dist/models/policy');
    module.exports = policy.default || policy;
} catch (error) {
    console.error('Error cargando desde dist:', error);
    try {
        // Si no existe dist, usar ts-node para cargar directamente
        require('ts-node/register');
        const policy = require('../../src/models/policy.ts');
        module.exports = policy.default || policy;
    } catch (tsError) {
        console.error('Error cargando con ts-node:', tsError);
        throw new Error('No se pudo cargar el modelo Policy desde ninguna fuente');
    }
}
