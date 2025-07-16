// scripts/test-anti-duplication.js
// Script para probar el sistema anti-duplicación de notificaciones

// Cargar variables de entorno
require('dotenv').config();

const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const logger = require('../src/utils/logger');
const { getInstance: getNotificationManager } = require('../src/services/NotificationManager');

// Configuración
const MONGO_URI = process.env.MONGO_URI;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

async function testAntiDuplication() {
    try {
        logger.info('🧪 Iniciando prueba del sistema anti-duplicación...');

        // 1. Conectar a MongoDB
        await mongoose.connect(MONGO_URI);
        logger.info('🔗 Conectado a MongoDB');

        // 2. Crear bot de Telegram
        const bot = new Telegraf(TELEGRAM_TOKEN);
        logger.info('🤖 Bot de Telegram inicializado');

        // 3. Obtener NotificationManager
        const notificationManager = getNotificationManager(bot);
        await notificationManager.initialize();
        logger.info('📬 NotificationManager inicializado');

        // 4. Datos de prueba para crear notificaciones duplicadas
        const testData = {
            numeroPoliza: 'TEST-DUPLICADOS-001',
            expedienteNum: 'EXP-TEST-2025-001',
            tipoNotificacion: 'CONTACTO',
            contactTime: '10:00',
            targetGroupId: -1002212807945,
            origenDestino: 'CDMX - Guadalajara',
            marcaModelo: 'NISSAN VERSA (2022)',
            colorVehiculo: 'BLANCO',
            placas: 'TEST-123',
            telefono: '5512345678'
        };

        logger.info('📄 Datos de prueba para anti-duplicación:');
        logger.info(`   Póliza: ${testData.numeroPoliza}`);
        logger.info(`   Expediente: ${testData.expedienteNum}`);
        logger.info(`   Tipo: ${testData.tipoNotificacion}`);

        // 5. Intentar crear la misma notificación múltiples veces
        logger.info('🔄 Prueba 1: Creando notificación inicial...');
        const notification1 = await notificationManager.scheduleNotification(testData);
        logger.info(`✅ Primera notificación creada: ID ${notification1._id}`);

        logger.info('🔄 Prueba 2: Intentando crear duplicado inmediatamente...');
        const notification2 = await notificationManager.scheduleNotification(testData);

        if (notification1._id.toString() === notification2._id.toString()) {
            logger.info('✅ Anti-duplicación funcionó: Retornó la misma notificación');
        } else {
            logger.error('❌ Anti-duplicación falló: Se creó una notificación diferente');
        }

        // 6. Prueba de concurrencia: múltiples intentos simultáneos
        logger.info('🔄 Prueba 3: Creando múltiples duplicados simultáneamente...');

        const concurrentPromises = Array(5)
            .fill()
            .map((_, i) =>
                notificationManager
                    .scheduleNotification({
                        ...testData,
                        expedienteNum: `EXP-CONCURRENCIA-${i}-2025-001` // Diferente expediente para cada uno
                    })
                    .catch(error => ({ error: error.message, index: i }))
            );

        const concurrentResults = await Promise.allSettled(concurrentPromises);

        logger.info('📊 Resultados de prueba de concurrencia:');
        concurrentResults.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                if (result.value.error) {
                    logger.info(`   ${i}: Error controlado - ${result.value.error}`);
                } else {
                    logger.info(`   ${i}: Notificación creada - ID ${result.value._id}`);
                }
            } else {
                logger.info(`   ${i}: Falló - ${result.reason.message}`);
            }
        });

        // 7. Verificar estado final en base de datos
        const ScheduledNotification = require('../src/models/scheduledNotification');

        const testNotifications = await ScheduledNotification.find({
            numeroPoliza: { $regex: '^TEST-' }
        });

        logger.info('📊 Notificaciones de prueba en BD:');
        testNotifications.forEach(notif => {
            logger.info(
                `   - ${notif.numeroPoliza} / ${notif.expedienteNum} / ${notif.tipoNotificacion} (${notif.status})`
            );
        });

        // 8. Limpiar datos de prueba
        logger.info('🧹 Limpiando datos de prueba...');
        const deleteResult = await ScheduledNotification.deleteMany({
            numeroPoliza: { $regex: '^TEST-' }
        });
        logger.info(`✅ ${deleteResult.deletedCount} notificaciones de prueba eliminadas`);

        // 9. Obtener estadísticas del sistema
        const stats = await notificationManager.getStats();
        logger.info('📊 Estadísticas del sistema:');
        logger.info(`   Timers activos: ${stats.activeTimers}`);
        logger.info(`   Locks de procesamiento: ${stats.processingLocks}`);
        logger.info('   Estados por tipo:', stats.statuses);

        logger.info('🎉 Prueba del sistema anti-duplicación completada exitosamente');
    } catch (error) {
        logger.error('❌ Error en prueba del sistema anti-duplicación:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        logger.info('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testAntiDuplication()
        .then(() => {
            console.log('✅ Prueba anti-duplicación completada exitosamente');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error en prueba:', error);
            process.exit(1);
        });
}

module.exports = testAntiDuplication;
