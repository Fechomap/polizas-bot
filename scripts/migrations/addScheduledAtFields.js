// scripts/migrations/addScheduledAtFields.js
const mongoose = require('mongoose');
const ScheduledNotification = require('../../src/models/scheduledNotification');
const logger = require('../../src/utils/logger');
require('dotenv').config();

async function migrate() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        logger.info('Conectado a MongoDB para migración');

        // Contar documentos a actualizar
        const totalDocs = await ScheduledNotification.countDocuments({
            $or: [
                { lastScheduledAt: { $exists: false } },
                { processingStartedAt: { $exists: false } }
            ]
        });

        logger.info(`Documentos a migrar: ${totalDocs}`);

        if (totalDocs === 0) {
            logger.info('No hay documentos que migrar');
            return;
        }

        // Actualizar documentos en lotes
        const batchSize = 100;
        let processedCount = 0;

        while (processedCount < totalDocs) {
            const batch = await ScheduledNotification.find({
                $or: [
                    { lastScheduledAt: { $exists: false } },
                    { processingStartedAt: { $exists: false } }
                ]
            }).limit(batchSize);

            for (const notification of batch) {
                const updateData = {};

                // Si está SCHEDULED o tiene timer activo, probablemente fue programada recientemente
                if (notification.status === 'SCHEDULED' || notification.status === 'PROCESSING') {
                    updateData.lastScheduledAt = notification.updatedAt || notification.createdAt;
                }

                // Si está PROCESSING, usar updatedAt como inicio de procesamiento
                if (notification.status === 'PROCESSING') {
                    updateData.processingStartedAt = notification.updatedAt || new Date();
                }

                // Inicializar retryCount si no existe
                if (notification.retryCount === undefined) {
                    updateData.retryCount = 0;
                }

                await ScheduledNotification.updateOne(
                    { _id: notification._id },
                    { $set: updateData }
                );
            }

            processedCount += batch.length;
            logger.info(`Progreso: ${processedCount}/${totalDocs} documentos migrados`);
        }

        // Crear índices si no existen
        logger.info('Creando índices...');
        await ScheduledNotification.collection.createIndex({ status: 1, lastScheduledAt: 1 });
        await ScheduledNotification.collection.createIndex({
            numeroPoliza: 1,
            expedienteNum: 1,
            tipoNotificacion: 1
        });

        logger.info('✅ Migración completada exitosamente');
    } catch (error) {
        logger.error('❌ Error en migración:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

// Ejecutar migración
migrate().catch(error => {
    logger.error('Error fatal en migración:', error);
    process.exit(1);
});
