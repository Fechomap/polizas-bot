const cron = require('node-cron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const AutoCleanupService = require('../../services/AutoCleanupService');

class CalculationScheduler {
    constructor(bot) {
        this.bot = bot;
        this.scriptsPath = path.join(__dirname, '../../../scripts');
        this.adminChatId = process.env.ADMIN_CHAT_ID; // ID del chat admin para notificaciones
        this.jobs = new Map();
        this.autoCleanupService = new AutoCleanupService();
    }

    /**
     * Inicializa todos los trabajos programados
     */
    initialize() {
        logger.info('🔄 Inicializando sistema de cálculo automático');

        // Cálculo de estados diario a las 3:00 AM
        this.scheduleDailyCalculation();

        // Limpieza automática de pólizas a las 3:30 AM
        this.scheduleAutoCleanup();

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
     * Programa limpieza automática de pólizas a las 3:30 AM
     */
    scheduleAutoCleanup() {
        // Ejecutar todos los días a las 3:30 AM (30 min después del cálculo de estados)
        const autoCleanupJob = cron.schedule(
            '30 3 * * *',
            async () => {
                logger.info('🧹 Iniciando limpieza automática de pólizas');
                await this.executeAutoCleanup();
            },
            {
                scheduled: true,
                timezone: 'America/Mexico_City'
            }
        );

        this.jobs.set('autoCleanup', autoCleanupJob);
        logger.info('📅 Limpieza automática de pólizas programada para las 3:30 AM');
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
     * Ejecuta limpieza automática de pólizas
     */
    async executeAutoCleanup() {
        const startTime = Date.now();

        try {
            // Notificar inicio
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🧹 *Limpieza Automática de Pólizas*\\n\\n⏳ Iniciando eliminación automática...',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            // Ejecutar limpieza automática
            const result = await this.autoCleanupService.executeAutoCleanup();

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            if (result.success) {
                // Formatear mensaje de éxito
                let successMessage = '✅ *Limpieza Automática Completada*\\n\\n';
                successMessage += `⏱️ Tiempo: ${elapsed}s\\n`;
                successMessage += `🗑️ Pólizas eliminadas automáticamente: ${result.stats.automaticDeletions}\\n`;
                successMessage += `⚠️ Pólizas vencidas encontradas: ${result.stats.expiredPoliciesFound}\\n`;

                if (result.stats.errors > 0) {
                    successMessage += `❌ Errores: ${result.stats.errors}\\n`;
                }

                // Enviar reporte de pólizas vencidas si las hay
                if (result.expiredPolicies.length > 0) {
                    successMessage += '\\n📋 Reporte de pólizas vencidas enviado por separado';

                    // Enviar reporte detallado de pólizas vencidas
                    await this.sendExpiredPoliciesReport(result.expiredPolicies);
                }

                if (this.adminChatId) {
                    await this.bot.telegram.sendMessage(this.adminChatId, successMessage, {
                        parse_mode: 'MarkdownV2'
                    });
                }

                logger.info(`✅ Limpieza automática completada en ${elapsed}s`, result.stats);
            } else {
                // Error en la limpieza
                if (this.adminChatId) {
                    await this.bot.telegram.sendMessage(
                        this.adminChatId,
                        `❌ *Error en Limpieza Automática*\\n\\n🔥 ${result.error}\\n\\n📋 Revisar logs para más detalles`,
                        { parse_mode: 'MarkdownV2' }
                    );
                }
            }
        } catch (error) {
            logger.error('❌ Error en limpieza automática:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error Crítico en Limpieza Automática*\\n\\n🔥 ${error.message}\\n\\n📋 Revisar logs inmediatamente`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    /**
     * Envía reporte detallado de pólizas vencidas para revisión manual
     */
    async sendExpiredPoliciesReport(expiredPolicies) {
        if (!this.adminChatId || expiredPolicies.length === 0) {
            return;
        }

        try {
            // Mensaje de cabecera
            let reportMessage = '📋 *REPORTE PÓLIZAS VENCIDAS*\\n';
            reportMessage += '*Para Revisión Manual*\\n\\n';
            reportMessage += `Total encontradas: ${expiredPolicies.length}\\n\\n`;

            // Dividir en grupos de 10 para evitar mensajes muy largos
            const POLICIES_PER_MESSAGE = 10;

            for (let i = 0; i < expiredPolicies.length; i += POLICIES_PER_MESSAGE) {
                const chunk = expiredPolicies.slice(i, i + POLICIES_PER_MESSAGE);

                let chunkMessage = '';
                if (i === 0) {
                    chunkMessage = reportMessage;
                }

                chunk.forEach((poliza, index) => {
                    const num = i + index + 1;
                    chunkMessage += `${num}\\. *${poliza.numeroPoliza}*\\n`;
                    chunkMessage += `   Titular: ${poliza.titular}\\n`;
                    chunkMessage += `   Aseguradora: ${poliza.aseguradora}\\n`;
                    chunkMessage += `   Servicios: ${poliza.servicios}\\n`;
                    chunkMessage += `   Días transcurridos: ${poliza.diasVencida}\\n\\n`;
                });

                await this.bot.telegram.sendMessage(this.adminChatId, chunkMessage, {
                    parse_mode: 'MarkdownV2'
                });

                // Pausa entre mensajes para evitar flood
                if (i + POLICIES_PER_MESSAGE < expiredPolicies.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Mensaje final con instrucciones
            const instructionsMessage =
                '💡 *Instrucciones:*\\n\\n' +
                'Estas pólizas tienen estado VENCIDA y requieren revisión manual\\. ' +
                'Usa el panel de administración para eliminarlas una por una o en lotes si corresponde\\.';

            await this.bot.telegram.sendMessage(this.adminChatId, instructionsMessage, {
                parse_mode: 'MarkdownV2'
            });
        } catch (error) {
            logger.error('❌ Error enviando reporte de pólizas vencidas:', error);
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

    /**
     * Ejecuta limpieza automática manual
     */
    async executeManualAutoCleanup() {
        logger.info('🧹 Ejecutando limpieza automática manual');
        await this.executeAutoCleanup();
    }
}

module.exports = CalculationScheduler;
