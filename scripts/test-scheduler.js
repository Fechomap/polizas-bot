/**
 * Script de prueba para verificar el funcionamiento del CalculationScheduler
 * Simula la inicialización y permite ejecutar jobs manualmente
 */

const { Telegraf } = require('telegraf');
// Importar usando require para módulos compilados
const config = {
    telegram: {
        token: process.env.TELEGRAM_TOKEN
    }
};
const logger = require('../src/utils/logger');

// Configurar variables de entorno si no están presentes
process.env.ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '-1002291817096';
process.env.ADMIN_THREAD_ID = process.env.ADMIN_THREAD_ID || '13685';

async function testScheduler() {
    console.log('🔧 PRUEBA DEL SISTEMA DE SCHEDULER');
    console.log('=====================================\n');

    try {
        // Crear bot de prueba
        const bot = new Telegraf(config.telegram.token);

        console.log('✅ Bot de Telegram inicializado');

        // Crear instancia del scheduler
        const scheduler = new CalculationScheduler(bot);

        console.log('✅ CalculationScheduler creado');

        // Verificar configuración
        console.log('\n📋 CONFIGURACIÓN DEL SCHEDULER:');
        console.log(`   - ADMIN_CHAT_ID: ${process.env.ADMIN_CHAT_ID}`);
        console.log(`   - ADMIN_THREAD_ID: ${process.env.ADMIN_THREAD_ID}`);
        console.log('   - Zona horaria: America/Mexico_City');
        console.log('   - Jobs programados:');
        console.log('     * Cálculo diario: 3:00 AM (0 3 * * *)');
        console.log('     * Limpieza automática: 3:30 AM (30 3 * * *)');
        console.log('     * Limpieza semanal: Domingos 4:00 AM (0 4 * * 0)');

        // Inicializar scheduler
        console.log('\n🚀 Inicializando scheduler...');
        scheduler.initialize();

        // Obtener estadísticas
        const stats = scheduler.getJobStats();
        console.log('\n📊 ESTADÍSTICAS DE JOBS:');
        console.log(`   - Jobs activos: ${stats.activeJobs}`);
        console.log(`   - Lista de jobs: ${stats.jobs.join(', ')}`);

        if (stats.activeJobs === 3) {
            console.log('\n✅ RESULTADO: Todos los jobs están correctamente programados');
        } else {
            console.log('\n❌ RESULTADO: Faltan jobs por programar');
        }

        // Preguntar si ejecutar pruebas manuales
        console.log('\n🔧 OPCIONES DE PRUEBA MANUAL:');
        console.log('1. Ejecutar cálculo de estados manual');
        console.log('2. Ejecutar limpieza automática manual');
        console.log('3. Solo verificar configuración (actual)');

        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('\n¿Qué prueba deseas ejecutar? (1/2/3): ', async (answer) => {
            try {
                switch(answer) {
                case '1':
                    console.log('\n🔄 Ejecutando cálculo de estados manual...');
                    await scheduler.executeManualCalculation();
                    console.log('✅ Cálculo manual completado');
                    break;

                case '2':
                    console.log('\n🧹 Ejecutando limpieza automática manual...');
                    await scheduler.executeManualAutoCleanup();
                    console.log('✅ Limpieza manual completada');
                    break;

                case '3':
                default:
                    console.log('\n✅ Verificación de configuración completada');
                    break;
                }

                // Limpiar
                scheduler.stopAllJobs();
                console.log('\n🛑 Jobs detenidos correctamente');

                console.log('\n📋 DIAGNÓSTICO FINAL:');
                if (stats.activeJobs === 3) {
                    console.log('✅ El sistema de scheduler está funcionando correctamente');
                    console.log('✅ Los jobs deberían ejecutarse automáticamente a las horas programadas');
                    console.log('💡 Si no se ejecutan automáticamente, verifica que el bot esté ejecutándose continuamente');
                } else {
                    console.log('❌ Hay problemas con la configuración del scheduler');
                    console.log('🔧 Revisar logs para más detalles');
                }

                process.exit(0);
            } catch (error) {
                console.error('❌ Error en prueba manual:', error);
                process.exit(1);
            } finally {
                rl.close();
            }
        });

    } catch (error) {
        console.error('❌ Error en prueba del scheduler:', error);
        process.exit(1);
    }
}

// Ejecutar la prueba
testScheduler();
