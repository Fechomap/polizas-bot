#!/usr/bin/env node

/**
 * Script de migración para mover archivos binarios de MongoDB a Cloudflare R2
 *
 * Este script:
 * 1. Conecta a MongoDB y busca todas las pólizas con archivos binarios
 * 2. Sube cada archivo a Cloudflare R2
 * 3. Actualiza el documento de póliza con las URLs de R2
 * 4. Opcionalmente elimina los datos binarios de MongoDB
 *
 * Uso:
 * node scripts/migrate-files-to-r2.js [--dry-run] [--limit=N] [--delete-binaries]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Policy = require('../src/models/policy');
const { getInstance } = require('../src/services/CloudflareStorage');
const logger = require('../src/utils/logger');

// Configuración del script
const config = {
    dryRun: process.argv.includes('--dry-run'),
    deleteBinaries: process.argv.includes('--delete-binaries'),
    limit: getLimitFromArgs(),
    batchSize: 10, // Procesar en lotes para evitar sobrecarga
};

function getLimitFromArgs() {
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
    return limitArg ? parseInt(limitArg.split('=')[1]) : null;
}

// Estadísticas de migración
const stats = {
    totalPolicies: 0,
    migratedPolicies: 0,
    totalFiles: 0,
    migratedFiles: 0,
    errors: [],
    skipped: 0
};

async function main() {
    try {
        console.log('🚀 Iniciando migración de archivos a Cloudflare R2...');
        console.log('Configuración:', config);

        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        // Verificar configuración de R2
        const storage = getInstance();
        if (!storage.isConfigured()) {
            throw new Error('Cloudflare R2 no está configurado correctamente');
        }
        console.log('✅ Cloudflare R2 configurado correctamente');

        // Buscar pólizas con archivos binarios
        const query = {
            $or: [
                { 'archivos.fotos.0': { $exists: true } },
                { 'archivos.pdfs.0': { $exists: true } }
            ]
        };

        const totalCount = await Policy.countDocuments(query);
        stats.totalPolicies = totalCount;

        console.log(`📊 Encontradas ${totalCount} pólizas con archivos binarios`);

        if (config.dryRun) {
            console.log('🏃 Modo DRY RUN - No se realizarán cambios reales');
        }

        // Procesar pólizas en lotes
        let skip = 0;
        const limit = config.limit || totalCount;

        while (skip < Math.min(limit, totalCount)) {
            const policies = await Policy.find(query)
                .skip(skip)
                .limit(config.batchSize)
                .lean(); // Usar lean() para mejor performance

            console.log(`\n📦 Procesando lote ${Math.floor(skip / config.batchSize) + 1} (${policies.length} pólizas)`);

            for (const policy of policies) {
                await migratePolicyFiles(policy, storage);
            }

            skip += config.batchSize;
        }

        // Mostrar estadísticas finales
        showFinalStats();

    } catch (error) {
        console.error('❌ Error en migración:', error);
        logger.error('Error en migración de archivos', { error: error.message, stack: error.stack });
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Desconectado de MongoDB');
    }
}

async function migratePolicyFiles(policy, storage) {
    try {
        console.log(`\n🔄 Procesando póliza: ${policy.numeroPoliza}`);

        const updates = {};
        let hasChanges = false;

        // Migrar fotos
        if (policy.archivos?.fotos?.length > 0) {
            const migratedFotos = await migrateFiles(
                policy.archivos.fotos,
                policy.numeroPoliza,
                'foto',
                storage
            );

            if (migratedFotos.length > 0) {
                updates['archivos.fotos'] = migratedFotos;
                hasChanges = true;
            }
        }

        // Migrar PDFs
        if (policy.archivos?.pdfs?.length > 0) {
            const migratedPdfs = await migrateFiles(
                policy.archivos.pdfs,
                policy.numeroPoliza,
                'pdf',
                storage
            );

            if (migratedPdfs.length > 0) {
                updates['archivos.pdfs'] = migratedPdfs;
                hasChanges = true;
            }
        }

        // Actualizar el documento si hay cambios
        if (hasChanges && !config.dryRun) {
            if (config.deleteBinaries) {
                // Eliminar datos binarios y reemplazar con URLs
                await Policy.updateOne(
                    { _id: policy._id },
                    { $set: updates }
                );
            } else {
                // Agregar URLs manteniendo datos binarios
                await Policy.updateOne(
                    { _id: policy._id },
                    { $set: { 'archivos.urls': updates } }
                );
            }

            console.log(`✅ Póliza ${policy.numeroPoliza} actualizada en MongoDB`);
        }

        if (hasChanges) {
            stats.migratedPolicies++;
        } else {
            stats.skipped++;
        }

    } catch (error) {
        console.error(`❌ Error procesando póliza ${policy.numeroPoliza}:`, error.message);
        stats.errors.push({
            policy: policy.numeroPoliza,
            error: error.message
        });
    }
}

async function migrateFiles(files, policyNumber, fileType, storage) {
    const migratedFiles = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
            // Verificar que el archivo tenga datos binarios
            if (!file.data || !Buffer.isBuffer(file.data)) {
                console.log(`⚠️  Archivo ${i + 1} no tiene datos binarios válidos`);
                continue;
            }

            const originalName = `${fileType}-${Date.now()}-${i + 1}.${fileType === 'foto' ? 'jpg' : 'pdf'}`;
            console.log(`📤 Subiendo ${fileType} ${i + 1}/${files.length} (${file.data.length} bytes)`);

            let uploadResult;
            if (!config.dryRun) {
                if (fileType === 'foto') {
                    uploadResult = await storage.uploadPolicyPhoto(
                        file.data,
                        policyNumber,
                        originalName
                    );
                } else {
                    uploadResult = await storage.uploadPolicyPDF(
                        file.data,
                        policyNumber,
                        originalName
                    );
                }
            } else {
                // Simular resultado para dry run
                uploadResult = {
                    key: `${fileType}s/${policyNumber}/dry-run-${originalName}`,
                    url: `https://polizas-bot-storage.r2.cloudflarestorage.com/${fileType}s/${policyNumber}/dry-run-${originalName}`,
                    size: file.data.length,
                    contentType: file.contentType
                };
            }

            // Crear nuevo objeto de archivo con URL
            const migratedFile = {
                url: uploadResult.url,
                key: uploadResult.key,
                size: uploadResult.size,
                contentType: uploadResult.contentType,
                uploadedAt: new Date(),
                originalSize: file.data.length
            };

            // Si no eliminamos binarios, mantener los datos originales
            if (!config.deleteBinaries) {
                migratedFile.data = file.data;
            }

            migratedFiles.push(migratedFile);
            stats.migratedFiles++;
            stats.totalFiles++;

            console.log(`✅ ${fileType} migrado: ${uploadResult.url}`);

        } catch (error) {
            console.error(`❌ Error migrando ${fileType} ${i + 1}:`, error.message);
            stats.errors.push({
                policy: policyNumber,
                fileType,
                fileIndex: i + 1,
                error: error.message
            });
        }
    }

    return migratedFiles;
}

function showFinalStats() {
    console.log('\n📊 ESTADÍSTICAS FINALES DE MIGRACIÓN');
    console.log('=====================================');
    console.log(`📁 Total de pólizas analizadas: ${stats.totalPolicies}`);
    console.log(`✅ Pólizas migradas: ${stats.migratedPolicies}`);
    console.log(`⏭️  Pólizas omitidas: ${stats.skipped}`);
    console.log(`📄 Total de archivos migrados: ${stats.migratedFiles}`);
    console.log(`❌ Errores encontrados: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
        console.log('\n❌ ERRORES DETALLADOS:');
        stats.errors.forEach((error, index) => {
            console.log(`${index + 1}. ${error.policy || 'N/A'}: ${error.error}`);
        });
    }

    console.log('\n✅ Migración completada');

    if (config.dryRun) {
        console.log('\n⚠️  Esta fue una ejecución DRY RUN - No se realizaron cambios reales');
        console.log('Para ejecutar la migración real, ejecute sin --dry-run');
    }
}

// Manejo de señales para limpieza
process.on('SIGINT', async () => {
    console.log('\n🛑 Migración interrumpida por el usuario');
    await mongoose.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Migración terminada por el sistema');
    await mongoose.disconnect();
    process.exit(0);
});

// Ejecutar script
if (require.main === module) {
    main();
}

module.exports = { main, migratePolicyFiles, stats };
