// scripts/migrations/fixExistingIndex.js
// Script para verificar y ajustar el índice único existente

const mongoose = require('mongoose');
const logger = require('../../src/utils/logger');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI no está definida en las variables de entorno');
    process.exit(1);
}

async function fixExistingIndex() {
    try {
        await mongoose.connect(MONGO_URI);
        logger.info('🔗 Conectado a MongoDB para verificar índices');

        const db = mongoose.connection.db;
        const collection = db.collection('schedulednotifications');

        // 1. Verificar índices existentes
        const indexes = await collection.indexes();
        logger.info('📋 Índices existentes:');
        indexes.forEach(index => {
            logger.info(`  - ${index.name}: ${JSON.stringify(index.key)}`);
            if (index.partialFilterExpression) {
                logger.info(`    Filtro parcial: ${JSON.stringify(index.partialFilterExpression)}`);
            }
        });

        // 2. Buscar el índice existente con nombre similar
        const existingUniqueIndex = indexes.find(
            index =>
                index.name.includes('unique') &&
                index.key.numeroPoliza &&
                index.key.expedienteNum &&
                index.key.tipoNotificacion
        );

        if (existingUniqueIndex) {
            logger.info('✅ Índice único existente encontrado:', existingUniqueIndex.name);
            logger.info('📊 Configuración:', JSON.stringify(existingUniqueIndex, null, 2));

            // Verificar si tiene status en la clave
            if (!existingUniqueIndex.key.status) {
                logger.warn('⚠️ El índice existente NO incluye status en la clave');
                logger.info('🔨 Eliminando índice incompleto y creando el correcto...');

                // Eliminar índice incompleto
                await collection.dropIndex(existingUniqueIndex.name);
                logger.info(`🗑️ Índice ${existingUniqueIndex.name} eliminado`);

                // Crear el índice correcto
                await collection.createIndex(
                    {
                        numeroPoliza: 1,
                        expedienteNum: 1,
                        tipoNotificacion: 1,
                        status: 1
                    },
                    {
                        unique: true,
                        partialFilterExpression: {
                            status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
                        },
                        name: 'unique_active_notification_complete'
                    }
                );

                logger.info('✅ Índice único completo creado exitosamente');
            } else {
                logger.info('✅ El índice existente es correcto y incluye status');
            }
        } else {
            logger.warn('⚠️ No se encontró índice único existente');
        }

        // 3. Verificar duplicados después del ajuste
        logger.info('🔍 Verificando duplicados después del ajuste...');

        const duplicates = await collection
            .aggregate([
                {
                    $match: {
                        status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
                    }
                },
                {
                    $group: {
                        _id: {
                            numeroPoliza: '$numeroPoliza',
                            expedienteNum: '$expedienteNum',
                            tipoNotificacion: '$tipoNotificacion',
                            status: '$status'
                        },
                        count: { $sum: 1 },
                        docs: { $push: { _id: '$_id', createdAt: '$createdAt' } }
                    }
                },
                {
                    $match: {
                        count: { $gt: 1 }
                    }
                }
            ])
            .toArray();

        if (duplicates.length > 0) {
            logger.warn(`⚠️ Aún existen ${duplicates.length} grupos de duplicados`);

            // Limpiar duplicados
            for (const duplicate of duplicates) {
                const docs = duplicate.docs.sort(
                    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
                );
                const toRemove = docs.slice(1).map(doc => doc._id);

                if (toRemove.length > 0) {
                    await collection.deleteMany({ _id: { $in: toRemove } });
                    logger.info(
                        `🗑️ Eliminados ${toRemove.length} duplicados para ${JSON.stringify(duplicate._id)}`
                    );
                }
            }
        } else {
            logger.info('✅ No se encontraron duplicados');
        }

        // 4. Verificación final
        const finalIndexes = await collection.indexes();
        const finalUniqueIndex = finalIndexes.find(
            index =>
                index.unique &&
                index.key.numeroPoliza &&
                index.key.expedienteNum &&
                index.key.tipoNotificacion &&
                index.key.status
        );

        if (finalUniqueIndex) {
            logger.info('🎯 Verificación final exitosa: Índice único operativo');
            logger.info(`📋 Nombre del índice: ${finalUniqueIndex.name}`);
        } else {
            logger.error('❌ No se pudo verificar el índice único final');
        }

        logger.info('🎉 Verificación y ajuste de índices completado');
    } catch (error) {
        logger.error('❌ Error verificando/ajustando índices:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        logger.info('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    fixExistingIndex()
        .then(() => {
            console.log('✅ Verificación de índices completada');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

module.exports = fixExistingIndex;
