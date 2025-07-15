// scripts/migrations/addUniqueIndex.js
const mongoose = require('mongoose');
const ScheduledNotification = require('../../src/models/scheduledNotification');
const logger = require('../../src/utils/logger');
require('dotenv').config();

async function addUniqueIndex() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        logger.info('Conectado a MongoDB para crear índice único');

        // Verificar si ya existe el índice
        const indexes = await ScheduledNotification.collection.getIndexes();
        const uniqueIndexExists = Object.keys(indexes).some(key =>
            key.includes('numeroPoliza_1_expedienteNum_1_tipoNotificacion_1_status_1')
        );

        if (uniqueIndexExists) {
            logger.info('✅ Índice único ya existe, no es necesario crearlo');
            return;
        }

        // Verificar duplicados existentes antes de crear índice único
        logger.info('Verificando duplicados existentes...');

        const duplicates = await ScheduledNotification.aggregate([
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
                    docs: { $push: '$_id' }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]);

        if (duplicates.length > 0) {
            logger.warn(`⚠️  Encontrados ${duplicates.length} grupos de documentos duplicados`);

            // Limpiar duplicados manteniendo el más reciente
            for (const duplicate of duplicates) {
                const docs = duplicate.docs;
                const toDelete = docs.slice(0, -1); // Mantener el último, eliminar el resto

                for (const docId of toDelete) {
                    await ScheduledNotification.findByIdAndUpdate(docId, {
                        $set: { status: 'CANCELLED' }
                    });
                    logger.info(`Cancelado duplicado: ${docId}`);
                }
            }
        }

        // Crear índice único con filtro parcial
        logger.info('Creando índice único...');

        await ScheduledNotification.collection.createIndex(
            {
                numeroPoliza: 1,
                expedienteNum: 1,
                tipoNotificacion: 1,
                status: 1
            },
            {
                unique: true,
                name: 'unique_active_notifications',
                partialFilterExpression: {
                    status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] }
                }
            }
        );

        logger.info('✅ Índice único creado exitosamente');
        logger.info('🔒 Ahora es IMPOSIBLE crear notificaciones duplicadas activas');
    } catch (error) {
        if (error.code === 11000) {
            logger.error('❌ Error: Aún existen duplicados que impiden crear el índice único');
            logger.error('Ejecuta primero la limpieza manual de duplicados');
        } else {
            logger.error('❌ Error creando índice único:', error);
        }
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

// Ejecutar creación de índice
addUniqueIndex().catch(error => {
    logger.error('Error fatal creando índice único:', error);
    process.exit(1);
});
