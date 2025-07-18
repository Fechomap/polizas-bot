"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cron = __importStar(require("node-cron"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const logger_1 = __importDefault(require("../../utils/logger"));
const AutoCleanupService_1 = __importDefault(require("../../services/AutoCleanupService"));
class CalculationScheduler {
    constructor(bot) {
        this.bot = bot;
        this.scriptsPath = path_1.default.join(__dirname, '../../../scripts');
        this.adminChatId = process.env.ADMIN_CHAT_ID || '';
        this.adminThreadId = process.env.ADMIN_THREAD_ID || '';
        this.jobs = new Map();
        this.autoCleanupService = new AutoCleanupService_1.default();
    }
    initialize() {
        logger_1.default.info('🔄 Inicializando sistema de cálculo automático');
        this.scheduleDailyCalculation();
        this.scheduleAutoCleanup();
        this.scheduleWeeklyCleanup();
        logger_1.default.info('✅ Sistema de cálculo automático inicializado');
    }
    scheduleDailyCalculation() {
        const dailyCalculationJob = cron.schedule('0 3 * * *', async () => {
            logger_1.default.info('🔄 Iniciando cálculo de estados automático');
            await this.executeDailyCalculation();
        }, {
            scheduled: true,
            timezone: 'America/Mexico_City'
        });
        this.jobs.set('dailyCalculation', dailyCalculationJob);
        logger_1.default.info('📅 Cálculo de estados programado para las 3:00 AM');
    }
    scheduleAutoCleanup() {
        const autoCleanupJob = cron.schedule('30 3 * * *', async () => {
            logger_1.default.info('🧹 Iniciando limpieza automática de pólizas');
            await this.executeAutoCleanup();
        }, {
            scheduled: true,
            timezone: 'America/Mexico_City'
        });
        this.jobs.set('autoCleanup', autoCleanupJob);
        logger_1.default.info('📅 Limpieza automática de pólizas programada para las 3:30 AM');
    }
    scheduleWeeklyCleanup() {
        const weeklyCleanupJob = cron.schedule('0 4 * * 0', async () => {
            logger_1.default.info('🧹 Iniciando limpieza semanal automática');
            await this.executeWeeklyCleanup();
        }, {
            scheduled: true,
            timezone: 'America/Mexico_City'
        });
        this.jobs.set('weeklyCleanup', weeklyCleanupJob);
        logger_1.default.info('📅 Limpieza semanal programada para domingos 4:00 AM');
    }
    async executeDailyCalculation() {
        const startTime = Date.now();
        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, '🔄 *Cálculo Estados Automático*\n\n⏳ Actualizando estados de pólizas...', { parse_mode: 'MarkdownV2' });
            }
            await this.executeScript('calculoEstadosDB.js');
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, `✅ *Cálculo Estados Completado*\n\n⏱️ Tiempo: ${elapsed}s\n📊 Estados actualizados\n✨ Sistema listo para el día`, { parse_mode: 'MarkdownV2' });
            }
            logger_1.default.info(`✅ Cálculo de estados completado en ${elapsed}s`);
        }
        catch (error) {
            logger_1.default.error('❌ Error en cálculo de estados:', error);
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, `❌ *Error en Cálculo Estados*\n\n🔥 ${error.message}\n\n📋 Revisar logs para más detalles`, { parse_mode: 'MarkdownV2' });
            }
        }
    }
    async executeWeeklyCleanup() {
        const startTime = Date.now();
        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, '🧹 *Limpieza Semanal Automática*\n\n⏳ Iniciando limpieza programada...', { parse_mode: 'MarkdownV2' });
            }
            const cleanupStats = {
                logsDeleted: 0
            };
            cleanupStats.logsDeleted = await this.cleanOldLogs();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, `✅ *Limpieza Semanal Completada*\n\n⏱️ Tiempo: ${elapsed}s\n📝 Logs eliminados: ${cleanupStats.logsDeleted}`, { parse_mode: 'MarkdownV2' });
            }
            logger_1.default.info(`✅ Limpieza semanal completada en ${elapsed}s`, cleanupStats);
        }
        catch (error) {
            logger_1.default.error('❌ Error en limpieza semanal:', error);
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, `❌ *Error en Limpieza Semanal*\n\n🔥 ${error.message}\n\n📋 Revisar logs para más detalles`, { parse_mode: 'MarkdownV2' });
            }
        }
    }
    async executeAutoCleanup() {
        const startTime = Date.now();
        try {
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, '🧹 *Limpieza Automática de Pólizas*\n\n⏳ Iniciando eliminación automática...', { parse_mode: 'MarkdownV2' });
            }
            const result = await this.autoCleanupService.executeAutoCleanup();
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
                logger_1.default.info(`✅ Limpieza automática completada en ${elapsed}s`, result.stats);
            }
            else {
                if (this.adminChatId) {
                    await this.bot.telegram.sendMessage(this.adminChatId, `❌ *Error en Limpieza Automática*\n\n🔥 ${result.error}\n\n📋 Revisar logs para más detalles`, { parse_mode: 'MarkdownV2' });
                }
            }
        }
        catch (error) {
            logger_1.default.error('❌ Error en limpieza automática:', error);
            if (this.adminChatId) {
                await this.bot.telegram.sendMessage(this.adminChatId, `❌ *Error Crítico en Limpieza Automática*\n\n🔥 ${error.message}\n\n📋 Revisar logs inmediatamente`, { parse_mode: 'MarkdownV2' });
            }
        }
    }
    async sendExpiredPoliciesReport(expiredPolicies) {
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
                    const numeroPoliza = poliza.numeroPoliza.replace(/[-_.*+?^${}()|[\]\\]/g, '\\$&');
                    const titular = poliza.titular.replace(/[-_.*+?^${}()|[\]\\]/g, '\\$&');
                    const aseguradora = poliza.aseguradora.replace(/[-_.*+?^${}()|[\]\\]/g, '\\$&');
                    chunkMessage += `${num}\\. *${numeroPoliza}*\n`;
                    chunkMessage += `   Titular: ${titular}\n`;
                    chunkMessage += `   Aseguradora: ${aseguradora}\n`;
                    chunkMessage += `   Servicios: ${poliza.servicios}\n`;
                    chunkMessage += `   Días transcurridos: ${poliza.diasVencida}\n\n`;
                });
                const messageOptions = {
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
            const instructionsMessage = '💡 *Instrucciones:*\n\n' +
                'Estas pólizas tienen estado VENCIDA y requieren revisión manual\\. ' +
                'Usa el panel de administración para eliminarlas una por una o en lotes si corresponde\\.';
            const instructionsOptions = {
                parse_mode: 'MarkdownV2'
            };
            if (this.adminThreadId) {
                instructionsOptions.message_thread_id = parseInt(this.adminThreadId);
            }
            await this.bot.telegram.sendMessage(this.adminChatId, instructionsMessage, instructionsOptions);
        }
        catch (error) {
            logger_1.default.error('❌ Error enviando reporte de pólizas vencidas:', error);
        }
    }
    async executeScript(scriptName) {
        const scriptPath = path_1.default.join(this.scriptsPath, scriptName);
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)('node', [scriptPath], {
                cwd: this.scriptsPath,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            let output = '';
            let errorOutput = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });
            child.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                }
                else {
                    reject(new Error(`Script ${scriptName} falló con código ${code}: ${errorOutput}`));
                }
            });
            child.on('error', (err) => {
                reject(err);
            });
        });
    }
    async cleanOldLogs() {
        const logsPath = path_1.default.join(this.scriptsPath, 'logs');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        try {
            const files = await fs_1.promises.readdir(logsPath);
            let deletedCount = 0;
            for (const file of files) {
                const filePath = path_1.default.join(logsPath, file);
                const stats = await fs_1.promises.stat(filePath);
                if (stats.mtime < sevenDaysAgo) {
                    await fs_1.promises.unlink(filePath);
                    deletedCount++;
                }
            }
            return deletedCount;
        }
        catch (error) {
            logger_1.default.error('Error limpiando logs antiguos:', error);
            return 0;
        }
    }
    stopAllJobs() {
        logger_1.default.info('🛑 Deteniendo todos los trabajos programados');
        for (const [name, job] of this.jobs.entries()) {
            job.stop();
            logger_1.default.info(`🛑 Trabajo detenido: ${name}`);
        }
        this.jobs.clear();
    }
    getJobStats() {
        return {
            activeJobs: this.jobs.size,
            jobs: Array.from(this.jobs.keys())
        };
    }
    async executeManualCalculation() {
        logger_1.default.info('🔄 Ejecutando cálculo manual');
        await this.executeDailyCalculation();
    }
    async executeManualAutoCleanup() {
        logger_1.default.info('🧹 Ejecutando limpieza automática manual');
        await this.executeAutoCleanup();
    }
}
exports.default = CalculationScheduler;
