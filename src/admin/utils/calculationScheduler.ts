import * as cron from 'node-cron';
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { Telegraf, Context } from 'telegraf';
import logger from '../../utils/logger';
import AutoCleanupService from '../../services/AutoCleanupService';

interface IExpiredPolicy {
    numeroPoliza: string;
    titular: string;
    aseguradora: string;
    servicios: number;
    diasVencida: number;
}

interface ICleanupResult {
    success: boolean;
    stats: {
        automaticDeletions: number;
        expiredPoliciesFound: number;
        errors: number;
    };
    expiredPolicies: IExpiredPolicy[];
    error?: string;
}

interface ICleanupStats {
    logsDeleted: number;
}

interface IJobStats {
    activeJobs: number;
    jobs: string[];
}

class CalculationScheduler {
    private bot: Telegraf;
    private scriptsPath: string;
    private adminChatId: string;
    private adminThreadId: string;
    private jobs: Map<string, cron.ScheduledTask>;
    private autoCleanupService: AutoCleanupService;

    constructor(bot: Telegraf) {
        this.bot = bot;
        this.scriptsPath = path.join(__dirname, '../../../scripts');
        this.adminChatId = process.env.ADMIN_CHAT_ID || '';
        this.adminThreadId = process.env.ADMIN_THREAD_ID || '';
        this.jobs = new Map();
        this.autoCleanupService = new AutoCleanupService();
    }

    initialize(): void {
        logger.info('🔄 Inicializando sistema de cálculo automático');

        this.scheduleDailyCalculation();
        this.scheduleNIVCleanup(); // NUEVO: Limpieza NIVs usados
        this.scheduleAutoCleanup();
        this.scheduleWeeklyCleanup();

        logger.info('✅ Sistema de cálculo automático inicializado');
    }

    private scheduleDailyCalculation(): void {
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

    private scheduleAutoCleanup(): void {
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

    private scheduleNIVCleanup(): void {
        const nivCleanupJob = cron.schedule(
            '15 3 * * *',
            async () => {
                logger.info('🧹 Iniciando limpieza automática de NIVs usados');
                await this.executeNIVCleanup();
            },
            {
                scheduled: true,
                timezone: 'America/Mexico_City'
            }
        );

        this.jobs.set('nivCleanup', nivCleanupJob);
        logger.info('📅 Limpieza de NIVs usados programada para las 3:15 AM');
    }

    private scheduleWeeklyCleanup(): void {
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

    private async executeDailyCalculation(): Promise<void> {
        const startTime = Date.now();

        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🔄 *Cálculo Estados Automático*\n\n⏳ Actualizando estados de pólizas\\.\\.\\.',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            await this.executeScript('calculoEstadosDB.js');

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `✅ *Cálculo Estados Completado*\n\n⏱️ Tiempo: ${elapsed}s\n📊 Estados actualizados\n✨ Sistema listo para el día`,
                    { parse_mode: 'MarkdownV2' }
                );
            }

            logger.info(`✅ Cálculo de estados completado en ${elapsed}s`);
        } catch (error) {
            logger.error('❌ Error en cálculo de estados:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error en Cálculo Estados*\n\n🔥 ${(error as Error).message.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n\n📋 Revisar logs para más detalles`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    private async executeWeeklyCleanup(): Promise<void> {
        const startTime = Date.now();

        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🧹 *Limpieza Semanal Automática*\n\n⏳ Iniciando limpieza programada...',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            const cleanupStats: ICleanupStats = {
                logsDeleted: 0
            };

            cleanupStats.logsDeleted = await this.cleanOldLogs();

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `✅ *Limpieza Semanal Completada*\n\n⏱️ Tiempo: ${elapsed}s\n📝 Logs eliminados: ${cleanupStats.logsDeleted}`,
                    { parse_mode: 'MarkdownV2' }
                );
            }

            logger.info(`✅ Limpieza semanal completada en ${elapsed}s`, cleanupStats);
        } catch (error) {
            logger.error('❌ Error en limpieza semanal:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error en Limpieza Semanal*\n\n🔥 ${(error as Error).message}\n\n📋 Revisar logs para más detalles`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    private async executeNIVCleanup(): Promise<void> {
        const startTime = Date.now();

        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🧹 *Limpieza Automática NIVs Usados*\\n\\n⏳ Eliminando NIVs con servicios\\.\\.\\.',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            const output = await this.executeScript('cleanup-nivs-usados.js');
            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            // Parsear resultado básico del output
            const successMatch = output.match(/NIVs eliminados exitosamente: (\d+)/);
            const eliminados = successMatch ? parseInt(successMatch[1]) : 0;

            if (this.adminChatId) {
                let message = '✅ *Limpieza NIVs Completada*\\n\\n';
                message += `⏱️ Tiempo: ${elapsed}s\\n`;
                message += `🗑️ NIVs eliminados: ${eliminados}\\n`;
                message += '✨ NIVs usados limpiados correctamente';

                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    message,
                    { parse_mode: 'MarkdownV2' }
                );
            }

            logger.info(`✅ Limpieza de NIVs completada en ${elapsed}s - ${eliminados} NIVs eliminados`);

        } catch (error) {
            logger.error('❌ Error en limpieza de NIVs:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error en Limpieza NIVs*\\n\\n🔥 ${(error as Error).message.replace(/[_*\\[\\]()~`>#+\\-=|{}.!]/g, '\\\\$&')}\\n\\n📋 Revisar logs para más detalles`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    private async executeAutoCleanup(): Promise<void> {
        const startTime = Date.now();

        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    '🧹 *Limpieza Automática de Pólizas*\n\n⏳ Iniciando eliminación automática\\.\\.\\.',
                    { parse_mode: 'MarkdownV2' }
                );
            }

            const result = (await this.autoCleanupService.executeAutoCleanup()) as ICleanupResult;

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            if (result.success) {
                let successMessage = '✅ *Limpieza Automática Completada*\n\n';
                successMessage += `⏱️ Tiempo: ${elapsed}s\n`;
                successMessage += `🗑️ Pólizas eliminadas automáticamente: ${result.stats.automaticDeletions}\n`;
                successMessage += `⚠️ Pólizas vencidas encontradas: ${result.stats.expiredPoliciesFound}\n`;

                if (result.stats.errors > 0) {
                    successMessage += `❌ Errores: ${result.stats.errors}\n`;
                }

                if (result.expiredPolicies.length > 0) {
                    successMessage += '\n📋 Reporte de pólizas vencidas enviado por separado';
                    await this.sendExpiredPoliciesReport(result.expiredPolicies);
                }

                if (this.adminChatId) {
                    await this.bot.telegram.sendMessage(this.adminChatId, successMessage, {
                        parse_mode: 'MarkdownV2'
                    });
                }

                logger.info(`✅ Limpieza automática completada en ${elapsed}s`, result.stats);
            } else {
                if (this.adminChatId) {
                    await this.bot.telegram.sendMessage(
                        this.adminChatId,
                        `❌ *Error en Limpieza Automática*\n\n🔥 ${result.error?.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n\n📋 Revisar logs para más detalles`,
                        { parse_mode: 'MarkdownV2' }
                    );
                }
            }
        } catch (error) {
            logger.error('❌ Error en limpieza automática:', error);

            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(
                    this.adminChatId,
                    `❌ *Error Crítico en Limpieza Automática*\n\n🔥 ${(error as Error).message.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&')}\n\n📋 Revisar logs inmediatamente`,
                    { parse_mode: 'MarkdownV2' }
                );
            }
        }
    }

    private async sendExpiredPoliciesReport(expiredPolicies: IExpiredPolicy[]): Promise<void> {
        if (!this.adminChatId || expiredPolicies.length === 0) {
            return;
        }

        try {
            let reportMessage = '📋 *REPORTE PÓLIZAS VENCIDAS*\n';
            reportMessage += '*Para Revisión Manual*\n\n';
            reportMessage += `Total encontradas: ${expiredPolicies.length}\n\n`;

            const POLICIES_PER_MESSAGE = 10;

            for (let i = 0; i < expiredPolicies.length; i += POLICIES_PER_MESSAGE) {
                const chunk = expiredPolicies.slice(i, i + POLICIES_PER_MESSAGE);

                let chunkMessage = '';
                if (i === 0) {
                    chunkMessage = reportMessage;
                }

                chunk.forEach((poliza, index) => {
                    const num = i + index + 1;
                    const numeroPoliza = poliza.numeroPoliza.replace(
                        /[-_.*+?^${}()|[\]\\]/g,
                        '\\$&'
                    );
                    const titular = poliza.titular.replace(/[-_.*+?^${}()|[\]\\]/g, '\\$&');
                    const aseguradora = poliza.aseguradora.replace(/[-_.*+?^${}()|[\]\\]/g, '\\$&');

                    chunkMessage += `${num}\\. *${numeroPoliza}*\n`;
                    chunkMessage += `   Titular: ${titular}\n`;
                    chunkMessage += `   Aseguradora: ${aseguradora}\n`;
                    chunkMessage += `   Servicios: ${poliza.servicios}\n`;
                    chunkMessage += `   Días transcurridos: ${poliza.diasVencida}\n\n`;
                });

                const messageOptions: any = {
                    parse_mode: 'MarkdownV2'
                };

                if (this.adminThreadId) {
                    messageOptions.message_thread_id = parseInt(this.adminThreadId);
                }

                await this.bot.telegram.sendMessage(this.adminChatId, chunkMessage, messageOptions);

                if (i + POLICIES_PER_MESSAGE < expiredPolicies.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const instructionsMessage =
                '💡 *Instrucciones:*\n\n' +
                'Estas pólizas tienen estado VENCIDA y requieren revisión manual\\. ' +
                'Usa el panel de administración para eliminarlas una por una o en lotes si corresponde\\.';

            const instructionsOptions: any = {
                parse_mode: 'MarkdownV2'
            };

            if (this.adminThreadId) {
                instructionsOptions.message_thread_id = parseInt(this.adminThreadId);
            }

            await this.bot.telegram.sendMessage(
                this.adminChatId,
                instructionsMessage,
                instructionsOptions
            );
        } catch (error) {
            logger.error('❌ Error enviando reporte de pólizas vencidas:', error);
        }
    }

    private async executeScript(scriptName: string): Promise<string> {
        const scriptPath = path.join(this.scriptsPath, scriptName);

        return new Promise((resolve, reject) => {
            const child = spawn('node', [scriptPath], {
                cwd: this.scriptsPath,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });

            child.stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(
                        new Error(`Script ${scriptName} falló con código ${code}: ${errorOutput}`)
                    );
                }
            });

            child.on('error', (err: Error) => {
                reject(err);
            });
        });
    }

    private async cleanOldLogs(): Promise<number> {
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

    stopAllJobs(): void {
        logger.info('🛑 Deteniendo todos los trabajos programados');

        for (const [name, job] of this.jobs.entries()) {
            job.stop();
            logger.info(`🛑 Trabajo detenido: ${name}`);
        }

        this.jobs.clear();
    }

    getJobStats(): IJobStats {
        return {
            activeJobs: this.jobs.size,
            jobs: Array.from(this.jobs.keys())
        };
    }

    async executeManualCalculation(): Promise<void> {
        logger.info('🔄 Ejecutando cálculo manual');
        await this.executeDailyCalculation();
    }

    async executeManualAutoCleanup(): Promise<void> {
        logger.info('🧹 Ejecutando limpieza automática manual');
        await this.executeAutoCleanup();
    }

    async executeManualNIVCleanup(): Promise<void> {
        logger.info('🧹 Ejecutando limpieza de NIVs manual');
        await this.executeNIVCleanup();
    }
}

export default CalculationScheduler;
