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
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const telegraf_1 = require("telegraf");
const policy_1 = __importDefault(require("../../models/policy"));
class ReportUsedCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
    }
    getCommandName() {
        return 'reportUsed';
    }
    getDescription() {
        return 'Genera un reporte de pólizas prioritarias (ejecuta script de cálculo).';
    }
    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);
    }
    async generateReport(ctx) {
        let waitMsg = null;
        let progressInterval = null;
        let scriptRunning = true;
        try {
            this.logInfo(`Ejecutando comando ${this.getCommandName()}`);
            waitMsg = await ctx.reply('🔄 Iniciando cálculo de estados de pólizas...\n' +
                'Este proceso puede tardar varios minutos, se enviarán actualizaciones periódicas.');
            const progressState = {
                lastProgressUpdate: Date.now(),
                updateCount: 0,
                scriptRunning: true
            };
            progressInterval = setInterval(async () => {
                if (!scriptRunning || !waitMsg) {
                    if (progressInterval) {
                        clearInterval(progressInterval);
                    }
                    return;
                }
                progressState.updateCount++;
                const elapsedSeconds = Math.floor((Date.now() - progressState.lastProgressUpdate) / 1000);
                try {
                    await this.handler.bot.telegram.editMessageText(waitMsg.chat.id, waitMsg.message_id, undefined, '🔄 Cálculo de estados en progreso...\n' +
                        `⏱️ Tiempo transcurrido: ${elapsedSeconds} segundos\n` +
                        `Actualización #${progressState.updateCount} - Por favor espere, esto puede tardar varios minutos.`);
                    progressState.lastProgressUpdate = Date.now();
                }
                catch (e) {
                    const error = e;
                    if (!error.message.includes('message to edit not found')) {
                        this.logError('Error al actualizar mensaje de progreso:', error);
                    }
                    else {
                        this.logInfo('Mensaje de progreso no encontrado, deteniendo actualizaciones.');
                        if (progressInterval) {
                            clearInterval(progressInterval);
                        }
                    }
                }
            }, 30000);
            const scriptPath = path.join(__dirname, '../../../scripts/calculoEstadosDB.js');
            const executeScript = () => {
                return new Promise((resolve, reject) => {
                    this.logInfo(`Ejecutando script: ${scriptPath}`);
                    const scriptOptions = {
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    };
                    const childProcess = (0, child_process_1.spawn)('node', [scriptPath], scriptOptions);
                    childProcess.stdout?.on('data', (data) => {
                        const output = data.toString().trim();
                        this.logInfo(`calculoEstadosDB stdout: ${output}`);
                    });
                    childProcess.stderr?.on('data', (data) => {
                        const errorOutput = data.toString().trim();
                        this.logError(`calculoEstadosDB stderr: ${errorOutput}`);
                    });
                    childProcess.on('close', (code) => {
                        scriptRunning = false;
                        if (code === 0) {
                            this.logInfo(`Script calculoEstadosDB completado exitosamente (código ${code})`);
                            resolve();
                        }
                        else {
                            this.logError(`Script calculoEstadosDB falló con código de salida ${code}`);
                            reject(new Error(`Script falló con código ${code}`));
                        }
                    });
                    childProcess.on('error', (err) => {
                        scriptRunning = false;
                        this.logError(`Error al ejecutar calculoEstadosDB: ${err.message}`);
                        reject(err);
                    });
                    setTimeout(() => {
                        if (scriptRunning) {
                            this.logInfo('Tiempo límite para script excedido, pero continuando ejecución');
                            resolve();
                        }
                    }, 420000);
                });
            };
            try {
                await executeScript();
            }
            catch (scriptError) {
                this.logError('Error o timeout en el script, continuando con consulta de pólizas:', scriptError);
            }
            finally {
                scriptRunning = false;
                if (progressInterval) {
                    clearInterval(progressInterval);
                }
            }
            if (waitMsg) {
                try {
                    await this.handler.bot.telegram.editMessageText(waitMsg.chat.id, waitMsg.message_id, undefined, '✅ Proceso de cálculo completado o tiempo límite alcanzado.\n' +
                        '🔍 Consultando las pólizas prioritarias...');
                }
                catch (msgError) {
                    this.logError('Error al actualizar mensaje final:', msgError);
                    await ctx.reply('🔍 Consultando las pólizas prioritarias...');
                }
            }
            else {
                await ctx.reply('🔍 Consultando las pólizas prioritarias...');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            const topPolicies = await policy_1.default.find({ estado: 'ACTIVO' })
                .sort({ calificacion: -1 })
                .limit(10)
                .lean();
            if (!topPolicies.length) {
                await ctx.reply('✅ No hay pólizas prioritarias que mostrar.');
                return;
            }
            await ctx.reply('📊 TOP 10 PÓLIZAS POR PRIORIDAD:');
            for (const pol of topPolicies) {
                const fEmision = pol.fechaEmision
                    ? new Date(pol.fechaEmision).toISOString().split('T')[0]
                    : 'No disponible';
                const fechaFinCobertura = pol.fechaFinCobertura
                    ? new Date(pol.fechaFinCobertura).toISOString().split('T')[0]
                    : 'No disponible';
                const fechaFinGracia = pol.fechaFinGracia
                    ? new Date(pol.fechaFinGracia).toISOString().split('T')[0]
                    : 'No disponible';
                const totalServicios = (pol.servicios || []).length;
                const totalPagos = (pol.pagos || []).length;
                let alertaPrioridad = '';
                const calificacion = pol.calificacion || 0;
                if (calificacion >= 80)
                    alertaPrioridad = '⚠️ *ALTA PRIORIDAD*\n';
                else if (calificacion >= 60)
                    alertaPrioridad = '⚠️ *PRIORIDAD MEDIA*\n';
                const msg = `
${alertaPrioridad}🏆 *Calificación: ${calificacion}*
🔍 *Póliza:* ${pol.numeroPoliza}
📅 *Emisión:* ${fEmision}
🚗 *Vehículo:* ${pol.marca || 'N/A'} ${pol.submarca || 'N/A'} (${pol.año || 'N/A'})
📊 *Estado:* ${pol.estadoPoliza || 'No calculado'}
🗓️ *Fin Cobertura:* ${fechaFinCobertura} (${pol.diasRestantesCobertura || 'N/A'} días)
⏳ *Fin Gracia:* ${fechaFinGracia} (${pol.diasRestantesGracia || 'N/A'} días)
🔧 *Servicios:* ${totalServicios}
💰 *Pagos:* ${totalPagos}`.trim();
                const inlineKeyboard = [
                    [
                        telegraf_1.Markup.button.callback(`👀 Consultar ${pol.numeroPoliza}`, `getPoliza:${pol.numeroPoliza}`)
                    ]
                ];
                try {
                    await ctx.replyWithMarkdown(msg, telegraf_1.Markup.inlineKeyboard(inlineKeyboard));
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                catch (sendError) {
                    this.logError(`Error al enviar mensaje para póliza ${pol.numeroPoliza}:`, sendError);
                    await ctx.reply(`Error al mostrar detalles de póliza ${pol.numeroPoliza}`);
                }
            }
            await ctx.reply('✅ Se han mostrado las pólizas prioritarias según su calificación actual.', telegraf_1.Markup.inlineKeyboard([
                telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
            ]));
            this.logInfo(`Reporte ${this.getCommandName()} enviado.`);
        }
        catch (error) {
            scriptRunning = false;
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            const typedError = error;
            this.logError(`Error general en ${this.getCommandName()}:`, typedError);
            if (waitMsg) {
                try {
                    await this.handler.bot.telegram.editMessageText(waitMsg.chat.id, waitMsg.message_id, undefined, '❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...');
                }
                catch (e) {
                    await ctx.reply('❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...');
                }
            }
            else {
                await ctx.reply('❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...');
            }
            try {
                const fallbackPolicies = await policy_1.default.find({ estado: 'ACTIVO' })
                    .sort({ calificacion: -1 })
                    .limit(10)
                    .lean();
                if (fallbackPolicies.length > 0) {
                    await ctx.reply('⚠️ Mostrando pólizas disponibles (orden actual en base de datos):');
                    for (const pol of fallbackPolicies) {
                        await ctx.replyWithMarkdown(`*Póliza:* ${pol.numeroPoliza}\n` +
                            `*Calificación:* ${pol.calificacion || 'No calculada'}\n` +
                            `*Vehículo:* ${pol.marca || 'N/A'} ${pol.submarca || 'N/A'}`, telegraf_1.Markup.inlineKeyboard([
                            [
                                telegraf_1.Markup.button.callback(`👀 Consultar ${pol.numeroPoliza}`, `getPoliza:${pol.numeroPoliza}`)
                            ]
                        ]));
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    await ctx.reply('⚠️ Proceso completado con errores.', telegraf_1.Markup.inlineKeyboard([
                        telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ]));
                }
                else {
                    await ctx.reply('❌ No se pudieron obtener las pólizas de respaldo.', telegraf_1.Markup.inlineKeyboard([
                        telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ]));
                }
            }
            catch (fallbackError) {
                this.logError('Error al obtener pólizas de respaldo:', fallbackError);
                await this.replyError(ctx, 'Error crítico al intentar obtener pólizas.');
                await ctx.reply('❌ Error crítico.', telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                ]));
            }
        }
    }
}
exports.default = ReportUsedCommand;
