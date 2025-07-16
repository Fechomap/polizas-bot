// scripts/test-notifications-system.js
// Script para probar el sistema completo de notificaciones de pólizas vencidas

// Cargar variables de entorno
require('dotenv').config();

const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const logger = require('../src/utils/logger');
const CalculationScheduler = require('../src/admin/utils/calculationScheduler');

// Configuración
const MONGO_URI = process.env.MONGO_URI;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ADMIN_THREAD_ID = process.env.ADMIN_THREAD_ID;

async function testNotificationSystem() {
    try {
        logger.info('🧪 Iniciando prueba del sistema de notificaciones de pólizas vencidas...');

        // 1. Verificar configuración
        logger.info('📋 Verificando configuración:');
        logger.info(`   ADMIN_CHAT_ID: ${ADMIN_CHAT_ID}`);
        logger.info(`   ADMIN_THREAD_ID: ${ADMIN_THREAD_ID}`);
        logger.info(`   TELEGRAM_TOKEN configurado: ${TELEGRAM_TOKEN ? 'Sí' : 'No'}`);

        if (!ADMIN_CHAT_ID || !ADMIN_THREAD_ID || !TELEGRAM_TOKEN) {
            throw new Error('❌ Configuración incompleta en variables de entorno');
        }

        // 2. Conectar a MongoDB
        await mongoose.connect(MONGO_URI);
        logger.info('🔗 Conectado a MongoDB');

        // 3. Crear bot de Telegram
        const bot = new Telegraf(TELEGRAM_TOKEN);
        logger.info('🤖 Bot de Telegram inicializado');

        // 4. Crear scheduler
        const scheduler = new CalculationScheduler(bot);
        logger.info('⏰ CalculationScheduler creado');

        // 5. Crear datos de prueba (pólizas vencidas simuladas)
        const testExpiredPolicies = [
            {
                numeroPoliza: 'TEST-001',
                titular: 'Juan Pérez (PRUEBA)',
                aseguradora: 'Test Insurance',
                servicios: 1,
                diasVencida: 15
            },
            {
                numeroPoliza: 'TEST-002',
                titular: 'María López (PRUEBA)',
                aseguradora: 'Test Insurance',
                servicios: 2,
                diasVencida: 30
            }
        ];

        logger.info('📄 Datos de prueba creados:');
        testExpiredPolicies.forEach(p => {
            logger.info(`   - ${p.numeroPoliza}: ${p.titular} (${p.diasVencida} días)`);
        });

        // 6. Enviar mensaje de inicio de prueba
        const startMessage =
            '🧪 *PRUEBA DEL SISTEMA DE NOTIFICACIONES*\n\n' +
            'Iniciando test de notificaciones de pólizas vencidas\\.\\.\\.\n' +
            `Thread ID configurado: ${ADMIN_THREAD_ID}`;

        const startOptions = {
            parse_mode: 'MarkdownV2'
        };

        if (ADMIN_THREAD_ID) {
            startOptions.message_thread_id = parseInt(ADMIN_THREAD_ID);
        }

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, startMessage, startOptions);
        logger.info('✅ Mensaje de inicio enviado');

        // 7. Probar el sistema de reportes
        logger.info('📊 Probando envío de reporte de pólizas vencidas...');
        await scheduler.sendExpiredPoliciesReport(testExpiredPolicies);
        logger.info('✅ Reporte de prueba enviado');

        // 8. Enviar mensaje de finalización
        const endMessage =
            '✅ *PRUEBA COMPLETADA*\n\n' +
            'El sistema de notificaciones funciona correctamente\\.\n' +
            'Las notificaciones reales se enviarán a las 3:30 AM diariamente\\.';

        const endOptions = {
            parse_mode: 'MarkdownV2'
        };

        if (ADMIN_THREAD_ID) {
            endOptions.message_thread_id = parseInt(ADMIN_THREAD_ID);
        }

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, endMessage, endOptions);
        logger.info('✅ Mensaje de finalización enviado');

        logger.info('🎉 Prueba del sistema de notificaciones completada exitosamente');
    } catch (error) {
        logger.error('❌ Error en prueba del sistema de notificaciones:', error);

        // Intentar enviar notificación de error
        try {
            const bot = new Telegraf(TELEGRAM_TOKEN);
            const errorMessage =
                '❌ *ERROR EN PRUEBA*\n\n' + `Error: ${error.message.replace(/[._\-()]/g, '\\$&')}`;

            const errorOptions = {
                parse_mode: 'MarkdownV2'
            };

            if (ADMIN_THREAD_ID) {
                errorOptions.message_thread_id = parseInt(ADMIN_THREAD_ID);
            }

            await bot.telegram.sendMessage(ADMIN_CHAT_ID, errorMessage, errorOptions);
        } catch (notifyError) {
            logger.error('❌ No se pudo enviar notificación de error:', notifyError);
        }

        throw error;
    } finally {
        await mongoose.disconnect();
        logger.info('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testNotificationSystem()
        .then(() => {
            console.log('✅ Prueba completada exitosamente');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error en prueba:', error);
            process.exit(1);
        });
}

module.exports = testNotificationSystem;
