const mongoose = require('mongoose');
require('dotenv').config();
const { Policy } = require('../src/models');

// Números de póliza a eliminar (sin el guión)
const policiesToDelete = [
    '1453.47',
    '1580.77',
    '1416.99',
    '834.63',
    '282.29',
    '904.82',
    '866.2',
    '277.31',
    '909.82',
    '728.82',
    '710.1'
];

async function connectToDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
        process.exit(1);
    }
}

async function verifyPoliciesExist() {
    console.log('\n🔍 Verificando que las pólizas existen...\n');

    const existingPolicies = [];
    const notFoundPolicies = [];

    for (const policyNumber of policiesToDelete) {
        try {
            const policy = await Policy.findOne({ numeroPoliza: policyNumber });
            if (policy) {
                existingPolicies.push({
                    numeroPoliza: policy.numeroPoliza,
                    titular: policy.titular,
                    id: policy._id
                });
                console.log(`✅ Encontrada: ${policyNumber} - ${policy.titular}`);
            } else {
                notFoundPolicies.push(policyNumber);
                console.log(`❌ No encontrada: ${policyNumber}`);
            }
        } catch (error) {
            console.error(`❌ Error buscando póliza ${policyNumber}:`, error.message);
            notFoundPolicies.push(policyNumber);
        }
    }

    console.log('\n📊 Resumen de verificación:');
    console.log(`   • Pólizas encontradas: ${existingPolicies.length}`);
    console.log(`   • Pólizas no encontradas: ${notFoundPolicies.length}`);

    if (notFoundPolicies.length > 0) {
        console.log('\n⚠️  Pólizas no encontradas:', notFoundPolicies);
    }

    return existingPolicies;
}

async function deletePoliciesPhysically(policiesToDelete) {
    if (policiesToDelete.length === 0) {
        console.log('\n⚠️  No hay pólizas para eliminar.');
        return;
    }

    console.log(`\n🗑️  Iniciando eliminación física de ${policiesToDelete.length} pólizas...\n`);

    const deletedPolicies = [];
    const errors = [];

    for (const policy of policiesToDelete) {
        try {
            // Eliminación física completa (deleteOne)
            const result = await Policy.deleteOne({ numeroPoliza: policy.numeroPoliza });

            if (result.deletedCount > 0) {
                deletedPolicies.push(policy.numeroPoliza);
                console.log(`✅ Eliminada físicamente: ${policy.numeroPoliza} - ${policy.titular}`);
            } else {
                errors.push(`No se pudo eliminar: ${policy.numeroPoliza}`);
                console.log(`❌ No se pudo eliminar: ${policy.numeroPoliza}`);
            }
        } catch (error) {
            errors.push(`Error eliminando ${policy.numeroPoliza}: ${error.message}`);
            console.error(`❌ Error eliminando ${policy.numeroPoliza}:`, error.message);
        }
    }

    console.log('\n📊 Resumen de eliminación:');
    console.log(`   • Pólizas eliminadas exitosamente: ${deletedPolicies.length}`);
    console.log(`   • Errores: ${errors.length}`);

    if (errors.length > 0) {
        console.log('\n⚠️  Errores encontrados:');
        errors.forEach(error => console.log(`   • ${error}`));
    }

    if (deletedPolicies.length > 0) {
        console.log('\n✅ Pólizas eliminadas exitosamente:');
        deletedPolicies.forEach(policy => console.log(`   • ${policy}`));
    }

    return { deletedPolicies, errors };
}

async function main() {
    try {
        console.log('🚀 Iniciando proceso de eliminación física de pólizas...');
        console.log(`📋 Pólizas a procesar: ${policiesToDelete.join(', ')}`);

        await connectToDatabase();

        // Paso 1: Verificar que las pólizas existen
        const existingPolicies = await verifyPoliciesExist();

        if (existingPolicies.length === 0) {
            console.log('\n⚠️  No se encontraron pólizas para eliminar. Terminando proceso.');
            return;
        }

        // Paso 2: Confirmar eliminación
        console.log('\n⚠️  ADVERTENCIA: Esta acción eliminará FÍSICAMENTE las pólizas de la base de datos.');
        console.log('⚠️  Esta acción NO se puede deshacer.');
        console.log('\n🔄 Procediendo con la eliminación en 3 segundos...');

        // Esperar 3 segundos para dar tiempo a cancelar si es necesario
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Paso 3: Eliminar físicamente
        const result = await deletePoliciesPhysically(existingPolicies);

        console.log('\n✅ Proceso completado.');

        if (result.deletedPolicies.length > 0) {
            console.log('✅ Las pólizas han sido eliminadas físicamente de la base de datos.');
        }

    } catch (error) {
        console.error('❌ Error en el proceso principal:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión a MongoDB cerrada.');
        process.exit(0);
    }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
    main();
}

module.exports = {
    verifyPoliciesExist,
    deletePoliciesPhysically,
    policiesToDelete
};
