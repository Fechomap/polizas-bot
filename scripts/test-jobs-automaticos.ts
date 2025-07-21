/**
 * TEST AUTOMATIZADO PARA JOBS DE 3:00 AM Y 3:30 AM
 * 
 * Este script permite ejecutar manualmente los jobs que deberían ejecutarse automáticamente
 * para verificar que el sistema funciona correctamente y generar logs de prueba.
 */

import { Telegraf } from 'telegraf';
import CalculationScheduler from '../src/admin/utils/calculationScheduler';
import logger from '../src/utils/logger';
import config from '../src/config';

interface TestResult {
    test: string;
    success: boolean;
    duration: number;
    error?: string;
    details?: any;
}

class JobsTestRunner {
    private bot: Telegraf;
    private scheduler: CalculationScheduler;
    private results: TestResult[] = [];

    constructor() {
        this.bot = new Telegraf(config.telegram.token);
        this.scheduler = new CalculationScheduler(this.bot);
    }

    async runTests(): Promise<void> {
        console.log('🧪 EJECUTANDO TESTS DE JOBS AUTOMÁTICOS');
        console.log('=====================================\n');

        try {
            // Test 1: Inicialización del scheduler
            await this.testSchedulerInitialization();

            // Test 2: Ejecución manual del cálculo de estados (3:00 AM)
            await this.testCalculoEstados();

            // Test 3: Ejecución manual de limpieza automática (3:30 AM)
            await this.testLimpiezaAutomatica();

            // Test 4: Verificar que los jobs se programaron correctamente
            await this.testJobsProgramados();

            // Mostrar resultados
            this.mostrarResultados();

        } catch (error) {
            logger.error('Error crítico en tests:', error);
            console.error('❌ Error crítico:', error);
        } finally {
            // Limpiar recursos
            this.scheduler.stopAllJobs();
            console.log('\n🛑 Recursos liberados correctamente');
        }
    }

    private async testSchedulerInitialization(): Promise<void> {
        const startTime = Date.now();
        const testName = 'Inicialización del Scheduler';

        try {
            console.log('🔄 Test 1: Inicializando scheduler...');
            
            this.scheduler.initialize();
            const stats = this.scheduler.getJobStats();

            if (stats.activeJobs === 3 && stats.jobs.includes('dailyCalculation') && 
                stats.jobs.includes('autoCleanup') && stats.jobs.includes('weeklyCleanup')) {
                
                this.results.push({
                    test: testName,
                    success: true,
                    duration: Date.now() - startTime,
                    details: { activeJobs: stats.activeJobs, jobs: stats.jobs }
                });
                
                console.log('✅ Scheduler inicializado correctamente');
                console.log(`   - Jobs activos: ${stats.activeJobs}`);
                console.log(`   - Jobs: ${stats.jobs.join(', ')}`);
            } else {
                throw new Error(`Jobs incorrectos. Esperados: 3, Encontrados: ${stats.activeJobs}`);
            }

        } catch (error) {
            this.results.push({
                test: testName,
                success: false,
                duration: Date.now() - startTime,
                error: (error as Error).message
            });
            console.log(`❌ Error en ${testName}:`, error);
        }
    }

    private async testCalculoEstados(): Promise<void> {
        const startTime = Date.now();
        const testName = 'Cálculo de Estados (Job 3:00 AM)';

        try {
            console.log('\n🔄 Test 2: Ejecutando cálculo de estados manual...');
            
            // Ejecutar el job manualmente
            await this.scheduler.executeManualCalculation();
            
            this.results.push({
                test: testName,
                success: true,
                duration: Date.now() - startTime
            });
            
            console.log('✅ Cálculo de estados completado exitosamente');
            console.log(`   - Duración: ${Math.floor((Date.now() - startTime) / 1000)}s`);
            
        } catch (error) {
            this.results.push({
                test: testName,
                success: false,
                duration: Date.now() - startTime,
                error: (error as Error).message
            });
            console.log(`❌ Error en ${testName}:`, error);
        }
    }

    private async testLimpiezaAutomatica(): Promise<void> {
        const startTime = Date.now();
        const testName = 'Limpieza Automática (Job 3:30 AM)';

        try {
            console.log('\n🔄 Test 3: Ejecutando limpieza automática manual...');
            
            // Ejecutar el job manualmente
            await this.scheduler.executeManualAutoCleanup();
            
            this.results.push({
                test: testName,
                success: true,
                duration: Date.now() - startTime
            });
            
            console.log('✅ Limpieza automática completada exitosamente');
            console.log(`   - Duración: ${Math.floor((Date.now() - startTime) / 1000)}s`);
            
        } catch (error) {
            this.results.push({
                test: testName,
                success: false,
                duration: Date.now() - startTime,
                error: (error as Error).message
            });
            console.log(`❌ Error en ${testName}:`, error);
        }
    }

    private async testJobsProgramados(): Promise<void> {
        const startTime = Date.now();
        const testName = 'Verificación de Jobs Programados';

        try {
            console.log('\n🔄 Test 4: Verificando programación de jobs...');
            
            const stats = this.scheduler.getJobStats();
            const expectedJobs = ['dailyCalculation', 'autoCleanup', 'weeklyCleanup'];
            
            const allJobsPresent = expectedJobs.every(job => stats.jobs.includes(job));
            
            if (allJobsPresent && stats.activeJobs === 3) {
                this.results.push({
                    test: testName,
                    success: true,
                    duration: Date.now() - startTime,
                    details: {
                        expectedJobs,
                        foundJobs: stats.jobs,
                        activeJobs: stats.activeJobs
                    }
                });
                
                console.log('✅ Todos los jobs están correctamente programados');
                console.log('   - dailyCalculation: 3:00 AM diario (0 3 * * *)');
                console.log('   - autoCleanup: 3:30 AM diario (30 3 * * *)');
                console.log('   - weeklyCleanup: 4:00 AM domingos (0 4 * * 0)');
                
            } else {
                throw new Error(`Jobs faltantes. Esperados: ${expectedJobs.join(', ')}, Encontrados: ${stats.jobs.join(', ')}`);
            }
            
        } catch (error) {
            this.results.push({
                test: testName,
                success: false,
                duration: Date.now() - startTime,
                error: (error as Error).message
            });
            console.log(`❌ Error en ${testName}:`, error);
        }
    }

    private mostrarResultados(): void {
        console.log('\n📊 RESULTADOS DE LOS TESTS');
        console.log('========================\n');

        let totalTests = this.results.length;
        let passingTests = this.results.filter(r => r.success).length;
        let failingTests = totalTests - passingTests;

        this.results.forEach((result, index) => {
            const status = result.success ? '✅ PASS' : '❌ FAIL';
            const duration = `${result.duration}ms`;
            
            console.log(`${index + 1}. ${status} - ${result.test} (${duration})`);
            
            if (!result.success && result.error) {
                console.log(`   Error: ${result.error}`);
            }
            
            if (result.details) {
                console.log(`   Detalles:`, result.details);
            }
        });

        console.log(`\n📈 RESUMEN:`);
        console.log(`   - Total tests: ${totalTests}`);
        console.log(`   - Exitosos: ${passingTests}`);
        console.log(`   - Fallidos: ${failingTests}`);
        console.log(`   - Porcentaje éxito: ${Math.round((passingTests / totalTests) * 100)}%`);

        if (passingTests === totalTests) {
            console.log('\n🎉 TODOS LOS TESTS PASARON');
            console.log('✅ El sistema de jobs está funcionando correctamente');
            console.log('📋 Los jobs deberían ejecutarse automáticamente a las horas programadas');
            console.log('💡 Si no se ejecutan automáticamente, verificar que el bot esté ejecutándose 24/7');
        } else {
            console.log('\n⚠️  ALGUNOS TESTS FALLARON');
            console.log('🔧 Revisar los errores arriba para diagnosticar problemas');
        }

        // Información adicional sobre ejecución automática
        console.log('\n📋 INFORMACIÓN PARA EJECUCIÓN AUTOMÁTICA:');
        console.log('   🤖 El bot debe estar ejecutándose continuamente');
        console.log('   🔄 Usar PM2 o similar para mantener el proceso activo');
        console.log('   🌍 Configurar NODE_ENV=production en servidor');
        console.log('   ⏰ Verificar zona horaria del servidor (America/Mexico_City)');
        console.log('   📝 Monitorear logs a las 3:00 y 3:30 AM México');
    }
}

// Función principal
async function ejecutarTests(): Promise<void> {
    const testRunner = new JobsTestRunner();
    await testRunner.runTests();
    process.exit(0);
}

// Verificar si se está ejecutando directamente
if (require.main === module) {
    ejecutarTests().catch((error) => {
        console.error('Error ejecutando tests:', error);
        process.exit(1);
    });
}

export default JobsTestRunner;