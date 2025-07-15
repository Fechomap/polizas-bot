const cron = require('node-cron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const logger = require('../../utils/logger');

class CalculationScheduler {
    constructor(bot) {
        this.bot = bot;
        this.scriptsPath = path.join(__dirname, '../../../scripts');
        this.adminChatId = process.env.ADMIN_CHAT_ID; // ID del chat admin para notificaciones
        this.jobs = new Map();
    }

    /**
     * Inicializa todos los trabajos programados
     */
    initialize() {
        logger.info('🔄 Inicializando sistema de cálculo automático');

        // Cálculo de estados diario a las 3:00 AM
        this.scheduleDailyCalculation();

        // Limpieza semanal domingos a las 4:00 AM
        this.scheduleWeeklyCleanup();

        logger.info('✅ Sistema de cálculo automático inicializado');
    }

    /**
     * Programa cálculo de estados diario a las 3:00 AM
     */
    scheduleDailyCalculation() {
        // Ejecutar todos los días a las 3:00 AM
        const dailyCalculationJob = cron.schedule(
            '0 3 * * *',
            async () => {
                logger.info('🔄 Iniciando cálculo de estados automático');
                await this.executeDailyCalculation();
            },
            {
                scheduled: true,
                timezone: 'America/Mexico_City'
            }
        );

        this.jobs.set('dailyCalculation', dailyCalculationJob);
        logger.info('📅 Cálculo de estados programado para las 3:00 AM');
    }

    /**
     * Programa limpieza semanal domingos a las 4:00 AM
     */
    scheduleWeeklyCleanup() {
        // Ejecutar domingos a las 4:00 AM
        const weeklyCleanupJob = cron.schedule(
            '0 4 * * 0',
            async () => {
                logger.info('🧹 Iniciando limpieza semanal automática');
                await this.executeWeeklyCleanup();
            },
            {
                scheduled: true,
                timezone: 'America/Mexico_City'
            }
        );

        this.jobs.set('weeklyCleanup', weeklyCleanupJob);
        logger.info('📅 Limpieza semanal programada para domingos 4:00 AM');
    }

    /**
     * Ejecuta cálculo de estados diario
     */
    async executeDailyCalculation() {
        const startTime = Date.now();

        try {
            // Notificar inicio
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🔄 *Cálculo Estados Automático*\\n\\n⏳ Actualizando estados de pólizas...',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            // Ejecutar solo cálculo de estados
            await this.executeScript('calculoEstadosDB.js');

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            // Notificar éxito
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `✅ *Cálculo Estados Completado*\\n\\n⏱️ Tiempo: ${elapsed}s\\n📊 Estados actualizados\\n✨ Sistema listo para el día`,
                    { parse_mode: 'MarkdownV2' }
                );
            }

            logger.info(`✅ Cálculo de estados completado en ${elapsed}s`);
        } catch (error) {
            logger.error('❌ Error en cálculo de estados:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error en Cálculo Estados*\\n\\n🔥 ${error.message}\\n\\n📋 Revisar logs para más detalles`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    /**
     * Ejecuta limpieza semanal
     */
    async executeWeeklyCleanup() {
        const startTime = Date.now();

        try {
            // Notificar inicio
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🧹 *Limpieza Semanal Automática*\\n\\n⏳ Iniciando limpieza programada...',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            const cleanupStats = {
                logsDeleted: 0
            };

            // Limpiar logs antiguos (> 7 días)
            cleanupStats.logsDeleted = await this.cleanOldLogs();

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            // Notificar éxito
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `✅ *Limpieza Semanal Completada*\\n\\n⏱️ Tiempo: ${elapsed}s\\n📝 Logs eliminados: ${cleanupStats.logsDeleted}`,
                    { parse_mode: 'MarkdownV2' }
                );
            }

            logger.info(`✅ Limpieza semanal completada en ${elapsed}s`, cleanupStats);
        } catch (error) {
            logger.error('❌ Error en limpieza semanal:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error en Limpieza Semanal*\\n\\n🔥 ${error.message}\\n\\n📋 Revisar logs para más detalles`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    /**
     * Ejecuta un script y devuelve el resultado
     */
    async executeScript(scriptName) {
        const scriptPath = path.join(this.scriptsPath, scriptName);

        return new Promise((resolve, reject) => {
            const child = spawn('node', [scriptPath], {
                cwd: this.scriptsPath,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', data => {
                output += data.toString();
            });

            child.stderr.on('data', data => {
                errorOutput += data.toString();
            });

            child.on('close', code => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(
                        new Error(`Script ${scriptName} falló con código ${code}: ${errorOutput}`)
                    );
                }
            });

            child.on('error', err => {
                reject(err);
            });
        });
    }

    /**
     * Limpia logs antiguos (> 7 días)
     */
    async cleanOldLogs() {
        const logsPath = path.join(this.scriptsPath, 'logs');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        try {
            const files = await fs.readdir(logsPath);
            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(logsPath, file);
                const stats = await fs.stat(filePath);

                if (stats.mtime < sevenDaysAgo) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            return deletedCount;
        } catch (error) {
            logger.error('Error limpiando logs antiguos:', error);
            return 0;
        }
    }

    /**
     * Detiene todos los trabajos programados
     */
    stopAllJobs() {
        logger.info('🛑 Deteniendo todos los trabajos programados');

        for (const [name, job] of this.jobs.entries()) {
            job.stop();
            logger.info(`🛑 Trabajo detenido: ${name}`);
        }

        this.jobs.clear();
    }

    /**
     * Obtiene estadísticas de los trabajos
     */
    getJobStats() {
        return {
            activeJobs: this.jobs.size,
            jobs: Array.from(this.jobs.keys())
        };
    }

    /**
     * Ejecuta cálculo manual
     */
    async executeManualCalculation() {
        logger.info('🔄 Ejecutando cálculo manual');
        await this.executeDailyCalculation();
    }
}

module.exports = CalculationScheduler;
