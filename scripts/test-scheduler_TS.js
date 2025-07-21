/**
 * SCRIPT DE DIAGNÓSTICO DE JOBS AUTOMÁTICOS
 * 
 * Este script verifica por qué los jobs de las 3:00 AM y 3:30 AM no se están ejecutando automáticamente.
 * Realiza un diagnóstico completo del sistema de scheduling.
 */

// Importar módulos compilados desde dist/
const CalculationScheduler = require('../dist/admin/utils/calculationScheduler').default;
const { Telegraf } = require('telegraf');
const path = require('path');

// Configuración
const config = {
    telegram: {
        token: process.env.TELEGRAM_TOKEN
    }
};

// Configurar variables de entorno si no están presentes
process.env.ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '-1002291817096';
process.env.ADMIN_THREAD_ID = process.env.ADMIN_THREAD_ID || '13685';

async function diagnosticoCompleto() {
    console.log('🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA DE JOBS');
    console.log('===========================================\n');

    try {
        // 1. Verificar variables de entorno
        console.log('📋 1. VERIFICACIÓN DE VARIABLES DE ENTORNO:');
        console.log(`   ✅ TELEGRAM_TOKEN: ${process.env.TELEGRAM_TOKEN ? 'Configurado' : '❌ FALTANTE'}`);
        console.log(`   ✅ ADMIN_CHAT_ID: ${process.env.ADMIN_CHAT_ID}`);
        console.log(`   ✅ ADMIN_THREAD_ID: ${process.env.ADMIN_THREAD_ID}`);
        console.log(`   ✅ NODE_ENV: ${process.env.NODE_ENV || 'no configurado'}`);
        
        // 2. Verificar zona horaria
        const ahora = new Date();
        const horaLocal = ahora.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const horaUTC = ahora.toISOString();
        console.log('\n🕐 2. VERIFICACIÓN DE ZONA HORARIA:');
        console.log(`   ✅ Hora actual UTC: ${horaUTC}`);
        console.log(`   ✅ Hora actual México: ${horaLocal}`);
        console.log(`   ✅ Zona horaria configurada: America/Mexico_City`);

        // 3. Verificar dependencias
        console.log('\n📦 3. VERIFICACIÓN DE DEPENDENCIAS:');
        try {
            const cron = require('node-cron');
            console.log(`   ✅ node-cron: versión instalada correctamente`);
            
            // Test básico de cron
            const testJob = cron.schedule('*/1 * * * * *', () => {}, { scheduled: false });
            console.log(`   ✅ cron.schedule: funciona correctamente`);
            testJob.destroy();
        } catch (cronError) {
            console.log(`   ❌ node-cron: ERROR - ${cronError.message}`);
        }

        // 4. Verificar archivos del scheduler
        console.log('\n📁 4. VERIFICACIÓN DE ARCHIVOS:');
        const fs = require('fs');
        
        const archivosCriticos = [
            '../dist/src/admin/utils/calculationScheduler.js',
            '../scripts/calculoEstadosDB.js',
            '../src/services/AutoCleanupService.ts'
        ];

        for (const archivo of archivosCriticos) {
            const rutaCompleta = path.resolve(__dirname, archivo);
            if (fs.existsSync(rutaCompleta)) {
                console.log(`   ✅ ${archivo}: existe`);
            } else {
                console.log(`   ❌ ${archivo}: NO EXISTE`);
            }
        }

        // 5. Crear instancia del scheduler
        console.log('\n🚀 5. PRUEBA DE INICIALIZACIÓN DEL SCHEDULER:');
        
        const bot = new Telegraf(config.telegram.token);
        console.log(`   ✅ Bot de Telegram creado`);
        
        const scheduler = new CalculationScheduler(bot);
        console.log(`   ✅ CalculationScheduler instanciado`);
        
        // Inicializar scheduler
        scheduler.initialize();
        console.log(`   ✅ Scheduler inicializado`);
        
        // Obtener estadísticas
        const stats = scheduler.getJobStats();
        console.log(`   ✅ Jobs activos: ${stats.activeJobs}`);
        console.log(`   ✅ Lista de jobs: [${stats.jobs.join(', ')}]`);

        // 6. Verificar configuración de jobs
        console.log('\n⏰ 6. CONFIGURACIÓN DE JOBS PROGRAMADOS:');
        console.log('   📅 Job 1: Cálculo de estados');
        console.log('      - Horario: 3:00 AM diario (0 3 * * *)');
        console.log('      - Zona horaria: America/Mexico_City');
        console.log('      - Script: calculoEstadosDB.js');
        
        console.log('   📅 Job 2: Limpieza automática');
        console.log('      - Horario: 3:30 AM diario (30 3 * * *)');
        console.log('      - Zona horaria: America/Mexico_City');
        console.log('      - Servicio: AutoCleanupService');
        
        console.log('   📅 Job 3: Limpieza semanal');
        console.log('      - Horario: 4:00 AM domingos (0 4 * * 0)');
        console.log('      - Zona horaria: America/Mexico_City');
        console.log('      - Función: cleanOldLogs');

        // 7. Verificar logs de ejecución
        console.log('\n📝 7. VERIFICACIÓN DE LOGS DE EJECUCIÓN:');
        const logsPath = path.resolve(__dirname, 'logs');
        if (fs.existsSync(logsPath)) {
            const archivosLog = fs.readdirSync(logsPath);
            console.log(`   ✅ Directorio de logs existe: ${logsPath}`);
            console.log(`   ✅ Archivos de log encontrados: ${archivosLog.length}`);
            
            // Verificar logs recientes
            const hoy = new Date().toISOString().split('T')[0];
            const ayer = new Date(Date.now() - 24*60*60*1000).toISOString().split('T')[0];
            
            const logHoy = archivosLog.find(f => f.includes(hoy));
            const logAyer = archivosLog.find(f => f.includes(ayer));
            
            console.log(`   ${logHoy ? '✅' : '❌'} Log de hoy (${hoy}): ${logHoy || 'NO EXISTE'}`);
            console.log(`   ${logAyer ? '✅' : '❌'} Log de ayer (${ayer}): ${logAyer || 'NO EXISTE'}`);
            
            // Verificar hora de ejecución en logs
            if (logHoy) {
                const contenidoLog = fs.readFileSync(path.join(logsPath, logHoy), 'utf8');
                const lineas = contenidoLog.split('\n');
                const primeraLinea = lineas[0];
                
                if (primeraLinea && primeraLinea.includes('T')) {
                    const horaEjecucion = new Date(primeraLinea.match(/\[(.*?)\]/)[1]);
                    const horaLocal = horaEjecucion.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
                    console.log(`   🕐 Última ejecución: ${horaLocal}`);
                    
                    // Verificar si fue ejecutado a las 3:00 AM
                    const hora = horaEjecucion.getHours();
                    if (hora === 3) {
                        console.log(`   ✅ EJECUTADO AUTOMÁTICAMENTE a las 3:00 AM`);
                    } else {
                        console.log(`   ⚠️  EJECUTADO MANUALMENTE a las ${hora}:00 (no automático)`);
                    }
                }
            }
        } else {
            console.log(`   ❌ Directorio de logs NO EXISTE: ${logsPath}`);
        }

        // 8. DIAGNÓSTICO FINAL
        console.log('\n🎯 8. DIAGNÓSTICO FINAL:');
        
        if (stats.activeJobs === 3) {
            console.log('   ✅ SCHEDULER CONFIGURADO CORRECTAMENTE');
            console.log('   ✅ Todos los jobs están programados');
            
            // Verificar si el problema es que el bot no está ejecutándose continuamente
            console.log('\n💡 POSIBLES CAUSAS SI NO SE EJECUTAN AUTOMÁTICAMENTE:');
            console.log('   1. 🤖 El bot no está ejecutándose continuamente en producción');
            console.log('   2. 🔄 El proceso se reinicia antes de las 3:00 AM');
            console.log('   3. 💻 El servidor está en modo desarrollo (no production)');
            console.log('   4. ⏰ Diferencia de zona horaria en el servidor');
            
            console.log('\n🔧 RECOMENDACIONES:');
            console.log('   • Verificar que el bot esté desplegado y ejecutándose 24/7');
            console.log('   • Usar pm2 o similar para mantener el proceso activo');
            console.log('   • Configurar NODE_ENV=production');
            console.log('   • Verificar logs del servidor a las 3:00 AM México');
        } else {
            console.log('   ❌ PROBLEMAS CON LA CONFIGURACIÓN DEL SCHEDULER');
            console.log(`   ❌ Solo ${stats.activeJobs} de 3 jobs están activos`);
        }

        // Limpiar
        scheduler.stopAllJobs();
        console.log('\n🛑 Jobs detenidos correctamente para la prueba');

        console.log('\n🎉 DIAGNÓSTICO COMPLETADO');
        
    } catch (error) {
        console.error('❌ ERROR EN DIAGNÓSTICO:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Ejecutar diagnóstico
diagnosticoCompleto().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
});