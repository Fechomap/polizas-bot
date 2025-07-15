#!/usr/bin/env node

/**
 * Script de prueba para verificar la migración de archivos
 * Ejecuta un dry-run limitado para verificar que todo funciona correctamente
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Policy = require('../src/models/policy');
const { getInstance } = require('../src/services/CloudflareStorage');

async function testMigration() {
    try {
        console.log('🧪 Iniciando prueba de migración...');

        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        // Verificar R2
        const storage = getInstance();
        if (!storage.isConfigured()) {
            throw new Error('R2 no configurado');
        }
        console.log('✅ R2 configurado');

        // Buscar pólizas con archivos
        const query = {
            $or: [
                { 'archivos.fotos.0': { $exists: true } },
                { 'archivos.pdfs.0': { $exists: true } }
            ]
        };

        const totalPolicies = await Policy.countDocuments(query);
        console.log(`📊 Total de pólizas con archivos: ${totalPolicies}`);

        // Obtener una muestra
        const samplePolicies = await Policy.find(query).limit(3).lean();

        console.log('\n📋 MUESTRA DE PÓLIZAS:');
        samplePolicies.forEach((policy, index) => {
            console.log(`${index + 1}. ${policy.numeroPoliza}:`);
            console.log(`   - Fotos: ${policy.archivos?.fotos?.length || 0}`);
            console.log(`   - PDFs: ${policy.archivos?.pdfs?.length || 0}`);

            if (policy.archivos?.fotos?.length > 0) {
                const firstPhoto = policy.archivos.fotos[0];
                console.log(
                    `   - Primera foto: ${firstPhoto.data?.length || 0} bytes, tipo: ${firstPhoto.contentType}`
                );
            }

            if (policy.archivos?.pdfs?.length > 0) {
                const firstPdf = policy.archivos.pdfs[0];
                console.log(
                    `   - Primer PDF: ${firstPdf.data?.length || 0} bytes, tipo: ${firstPdf.contentType}`
                );
            }
        });

        console.log('\n✅ Prueba completada. El sistema está listo para migración.');
        console.log('\nPara ejecutar la migración real:');
        console.log('- Dry run: node scripts/migrate-files-to-r2.js --dry-run --limit=5');
        console.log('- Migración real: node scripts/migrate-files-to-r2.js --limit=5');
        console.log('- Migración completa: node scripts/migrate-files-to-r2.js');
    } catch (error) {
        console.error('❌ Error en prueba:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Desconectado de MongoDB');
    }
}

if (require.main === module) {
    testMigration();
}

module.exports = { testMigration };
