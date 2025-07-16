// scripts/migrations/addUniqueIndexRobust.js
// Migración para añadir índice único robusto anti-duplicados
// Ejecutar después del fix de NotificationManager

const mongoose = require('mongoose');
const logger = require('../../src/utils/logger');

// Configuración de conexión desde variables de entorno
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI no está definida en las variables de entorno');
    process.exit(1);
}

async function addUniqueIndexRobust() {
    try {
        await mongoose.connect(MONGO_URI);
        logger.info('🔗 Conectado a MongoDB para migración de índice único robusto');

        const db = mongoose.connection.db;
        const collection = db.collection('schedulednotifications');

        // 1. Verificar si el índice ya existe
        const indexes = await collection.indexes();
        const existingIndex = indexes.find(index => index.name === 'unique_active_notification');

        if (existingIndex) {
            logger.info('✅ El índice único robusto ya existe, saltando migración');
            return;
        }

        // 2. Buscar y reportar duplicados existentes
        logger.info('🔍 Buscando duplicados existentes...');

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

        logger.info(`📊 Encontrados ${duplicates.length} grupos de duplicados`);

        // 3. Limpiar duplicados conservando el más reciente
        let cleanedCount = 0;
        for (const duplicate of duplicates) {
            const docs = duplicate.docs.sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );
            const toKeep = docs[0]._id;
            const toRemove = docs.slice(1).map(doc => doc._id);

            if (toRemove.length > 0) {
                const deleteResult = await collection.deleteMany({
                    _id: { $in: toRemove }
                });

                cleanedCount += deleteResult.deletedCount;
                logger.info(
                    `🗑️ Eliminados ${deleteResult.deletedCount} duplicados para ${JSON.stringify(duplicate._id)}, conservando ${toKeep}`
                );
            }
        }

        logger.info(`✅ Limpieza completada: ${cleanedCount} documentos duplicados eliminados`);

        // 4. Crear el índice único robusto
        logger.info('🔨 Creando índice único robusto...');

        try {
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
                    name: 'unique_active_notification'
                }
            );

            logger.info('✅ Índice único robusto creado exitosamente');
        } catch (indexError) {
            if (indexError.code === 11000) {
                logger.error(
                    '❌ Aún existen duplicados después de la limpieza. Ejecutando limpieza adicional...'
                );

                // Limpieza adicional más agresiva
                const remainingDuplicates = await collection
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
                                docs: {
                                    $push: {
                                        _id: '$_id',
                                        createdAt: '$createdAt',
                                        updatedAt: '$updatedAt'
                                    }
                                }
                            }
                        },
                        {
                            $match: {
                                count: { $gt: 1 }
                            }
                        }
                    ])
                    .toArray();

                for (const dup of remainingDuplicates) {
                    const docs = dup.docs.sort((a, b) => {
                        // Priorizar por updatedAt, luego por createdAt
                        const aTime = new Date(a.updatedAt || a.createdAt);
                        const bTime = new Date(b.updatedAt || b.createdAt);
                        return bTime - aTime;
                    });

                    const toRemove = docs.slice(1).map(doc => doc._id);
                    await collection.deleteMany({ _id: { $in: toRemove } });
                    logger.info(`🗑️ Limpieza adicional: eliminados ${toRemove.length} duplicados`);
                }

                // Intentar crear el índice nuevamente
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
                        name: 'unique_active_notification'
                    }
                );

                logger.info(
                    '✅ Índice único robusto creado exitosamente después de limpieza adicional'
                );
            } else {
                throw indexError;
            }
        }

        // 5. Verificar el índice
        const finalIndexes = await collection.indexes();
        const createdIndex = finalIndexes.find(
            index => index.name === 'unique_active_notification'
        );

        if (createdIndex) {
            logger.info('🎯 Verificación final: Índice único robusto operativo');
            logger.info('📋 Configuración del índice:', JSON.stringify(createdIndex, null, 2));
        } else {
            throw new Error('El índice no se creó correctamente');
        }

        logger.info('🎉 Migración completada exitosamente');
    } catch (error) {
        logger.error('❌ Error en migración de índice único robusto:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        logger.info('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    addUniqueIndexRobust()
        .then(() => {
            console.log('✅ Migración de índice único robusto completada');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error en migración:', error);
            process.exit(1);
        });
}

module.exports = addUniqueIndexRobust;
