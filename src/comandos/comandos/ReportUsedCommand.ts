// src/comandos/comandos/ReportUsedCommand.ts
import BaseCommand from './BaseCommand';
import logger from '../../utils/logger';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { Markup, Context } from 'telegraf';
import Policy from '../../models/policy';
import { getOldUnusedPolicies } from '../../controllers/policyController';

// Interfaces for type safety
interface PolicyDocument {
    numeroPoliza: string;
    fechaEmision?: Date;
    fechaFinCobertura?: Date;
    fechaFinGracia?: Date;
    marca?: string;
    submarca?: string;
    año?: number;
    estado?: string;
    estadoPoliza?: string;
    calificacion?: number;
    diasRestantesCobertura?: number;
    diasRestantesGracia?: number;
    servicios?: unknown[];
    pagos?: unknown[];
}

interface TelegramMessage {
    chat: {
        id: number;
    };
    message_id: number;
}

interface ProgressState {
    updateCount: number;
    lastProgressUpdate: number;
    scriptRunning: boolean;
}

interface ScriptExecutionOptions {
    detached: boolean;
    stdio: ('ignore' | 'pipe')[];
}

class ReportUsedCommand extends BaseCommand {
    constructor(handler: any) {
        super(handler);
    }

    getCommandName(): string {
        return 'reportUsed'; // Matches the command in commandHandler.js
    }

    getDescription(): string {
        return 'Genera un reporte de pólizas prioritarias (ejecuta script de cálculo).';
    }

    register(): void {
        // No longer registering the /reportUsed command directly.
        // This could be triggered by a button in a future 'Reportes' submenu.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);

        /* Código anterior eliminado:
        this.handler.bot.command(this.getCommandName(), async (ctx) => {
            await this.generateReport(ctx);
        });
        */
    }

    // Method to generate and send the report, callable if needed
    async generateReport(ctx: Context): Promise<void> {
        let waitMsg: TelegramMessage | null = null;
        let progressInterval: NodeJS.Timeout | null = null;
        let scriptRunning = true; // Flag to control interval

        try {
            this.logInfo(`Ejecutando comando ${this.getCommandName()}`);

            // Enviar mensaje inicial
            waitMsg = (await ctx.reply(
                '🔄 Iniciando cálculo de estados de pólizas...\n' +
                    'Este proceso puede tardar varios minutos, se enviarán actualizaciones periódicas.'
            )) as TelegramMessage;

            // Variables para seguimiento y mensajes de progreso
            const progressState: ProgressState = {
                lastProgressUpdate: Date.now(),
                updateCount: 0,
                scriptRunning: true
            };

            // Iniciar el temporizador de progreso
            progressInterval = setInterval(async (): Promise<void> => {
                if (!scriptRunning || !waitMsg) {
                    // Check if script finished or message deleted
                    if (progressInterval) {
                        clearInterval(progressInterval);
                    }
                    return;
                }

                progressState.updateCount++;
                const elapsedSeconds: number = Math.floor(
                    (Date.now() - progressState.lastProgressUpdate) / 1000
                );

                try {
                    // Use handler's bot instance
                    await this.handler.bot.telegram.editMessageText(
                        waitMsg.chat.id,
                        waitMsg.message_id,
                        undefined,
                        '🔄 Cálculo de estados en progreso...\n' +
                            `⏱️ Tiempo transcurrido: ${elapsedSeconds} segundos\n` +
                            `Actualización #${progressState.updateCount} - Por favor espere, esto puede tardar varios minutos.`
                    );
                    progressState.lastProgressUpdate = Date.now();
                } catch (e: unknown) {
                    const error = e as Error;
                    // Ignore errors if message was deleted or couldn't be edited
                    if (!error.message.includes('message to edit not found')) {
                        this.logError('Error al actualizar mensaje de progreso:', error);
                    } else {
                        this.logInfo(
                            'Mensaje de progreso no encontrado, deteniendo actualizaciones.'
                        );
                        if (progressInterval) {
                            clearInterval(progressInterval); // Stop trying if message is gone
                        }
                    }
                }
            }, 30000); // Actualizar cada 30 segundos

            // Ejecutar el script calculoEstadosDB.js como proceso separado
            const scriptPath: string = path.join(__dirname, '../../../scripts/calculoEstadosDB.js'); // Adjusted path relative to this file

            const executeScript = (): Promise<void> => {
                return new Promise<void>((resolve, reject) => {
                    this.logInfo(`Ejecutando script: ${scriptPath}`);

                    const scriptOptions: ScriptExecutionOptions = {
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    };

                    const childProcess: ChildProcess = spawn('node', [scriptPath], scriptOptions);

                    childProcess.stdout?.on('data', (data: Buffer) => {
                        const output: string = data.toString().trim();
                        this.logInfo(`calculoEstadosDB stdout: ${output}`);
                    });

                    childProcess.stderr?.on('data', (data: Buffer) => {
                        const errorOutput: string = data.toString().trim();
                        this.logError(`calculoEstadosDB stderr: ${errorOutput}`);
                    });

                    childProcess.on('close', (code: number | null) => {
                        scriptRunning = false; // Signal interval to stop
                        if (code === 0) {
                            this.logInfo(
                                `Script calculoEstadosDB completado exitosamente (código ${code})`
                            );
                            resolve();
                        } else {
                            this.logError(
                                `Script calculoEstadosDB falló con código de salida ${code}`
                            );
                            reject(new Error(`Script falló con código ${code}`));
                        }
                    });

                    childProcess.on('error', (err: Error) => {
                        scriptRunning = false; // Signal interval to stop
                        this.logError(`Error al ejecutar calculoEstadosDB: ${err.message}`);
                        reject(err);
                    });

                    // Timeout - allow script to continue but resolve promise
                    setTimeout(() => {
                        if (scriptRunning) {
                            this.logInfo(
                                'Tiempo límite para script excedido, pero continuando ejecución'
                            );
                            resolve(); // Resolve even on timeout to proceed with fetching policies
                        }
                    }, 420000); // 7 minutos de timeout
                });
            };

            // --- Script Execution and Policy Fetching ---
            try {
                await executeScript();
            } catch (scriptError: unknown) {
                this.logError(
                    'Error o timeout en el script, continuando con consulta de pólizas:',
                    scriptError as Error
                );
                // Continue anyway
            } finally {
                scriptRunning = false; // Ensure flag is set and interval stops
                if (progressInterval) {
                    clearInterval(progressInterval);
                }
            }

            // Update message before fetching policies
            if (waitMsg) {
                try {
                    await this.handler.bot.telegram.editMessageText(
                        waitMsg.chat.id,
                        waitMsg.message_id,
                        undefined,
                        '✅ Proceso de cálculo completado o tiempo límite alcanzado.\n' +
                            '🔍 Consultando las pólizas prioritarias...'
                    );
                } catch (msgError: unknown) {
                    this.logError('Error al actualizar mensaje final:', msgError as Error);
                    await ctx.reply('🔍 Consultando las pólizas prioritarias...'); // Fallback reply
                }
            } else {
                await ctx.reply('🔍 Consultando las pólizas prioritarias...'); // Fallback if waitMsg was lost
            }

            // Pequeña pausa
            await new Promise<void>(resolve => setTimeout(resolve, 2000));

            // ✅ ACTUALIZADO: Usar nueva función que incluye NIVs
            const todasLasPolizas = await getOldUnusedPolicies();

            if (!todasLasPolizas.length) {
                await ctx.reply('✅ No hay pólizas prioritarias ni NIVs que mostrar.');
                return;
            }

            // Separar regulares y NIVs
            const regulares = todasLasPolizas.filter(p => p.tipoReporte !== 'NIV');
            const nivs = todasLasPolizas.filter(p => p.tipoReporte === 'NIV');

            // Mostrar cabecera general
            let cabecera = '📊 *PÓLIZAS PRIORITARIAS Y NIVs*\n\n';
            if (regulares.length > 0 && nivs.length > 0) {
                cabecera += `📋 ${regulares.length} pólizas regulares + ⚡ ${nivs.length} NIVs disponibles\n\n`;
            } else if (regulares.length > 0) {
                cabecera += `📋 ${regulares.length} pólizas regulares encontradas\n\n`;
            } else {
                cabecera += `⚡ ${nivs.length} NIVs disponibles\n\n`;
            }

            await ctx.reply(cabecera, { parse_mode: 'Markdown' });

            // Mostrar pólizas regulares
            if (regulares.length > 0) {
                await ctx.reply('📋 *TOP PÓLIZAS REGULARES:*', { parse_mode: 'Markdown' });

                for (const pol of regulares) {
                    const fEmision: string = pol.fechaEmision
                        ? new Date(pol.fechaEmision).toISOString().split('T')[0]
                        : 'No disponible';
                    const fechaFinCobertura: string = pol.fechaFinCobertura
                        ? new Date(pol.fechaFinCobertura).toISOString().split('T')[0]
                        : 'No disponible';
                    const fechaFinGracia: string = pol.fechaFinGracia
                        ? new Date(pol.fechaFinGracia).toISOString().split('T')[0]
                        : 'No disponible';
                    const totalServicios: number = (pol.servicios || []).length;
                    const totalPagos: number = (pol.pagos || []).length;

                    let alertaPrioridad = '';
                    const calificacion: number = pol.calificacion || 0;
                    if (calificacion >= 80) alertaPrioridad = '⚠️ *ALTA PRIORIDAD*\n';
                    else if (calificacion >= 60) alertaPrioridad = '⚠️ *PRIORIDAD MEDIA*\n';

                    const msg: string = `
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
                            Markup.button.callback(
                                `👀 Consultar ${pol.numeroPoliza}`,
                                `getPoliza:${pol.numeroPoliza}`
                            )
                        ]
                    ];

                    try {
                        await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(inlineKeyboard));
                        await new Promise<void>(resolve => setTimeout(resolve, 500)); // Pause
                    } catch (sendError: unknown) {
                        this.logError(
                            `Error al enviar mensaje para póliza ${pol.numeroPoliza}:`,
                            sendError as Error
                        );
                        await ctx.reply(`Error al mostrar detalles de póliza ${pol.numeroPoliza}`); // Fallback
                    }
                }
            }

            // ✅ NUEVO: Mostrar NIVs disponibles
            if (nivs.length > 0) {
                await ctx.reply('⚡ *NIVs DISPONIBLES (2023-2026):*', { parse_mode: 'Markdown' });

                for (const niv of nivs) {
                    const fEmision: string = niv.fechaEmision
                        ? new Date(niv.fechaEmision).toISOString().split('T')[0]
                        : 'No disponible';

                    const msg: string = `
⚡ *${niv.mensajeEspecial}*
🆔 *NIV:* \`${niv.numeroPoliza}\`
🚗 *Vehículo:* ${niv.marca || 'N/A'} ${niv.submarca || 'N/A'} ${niv.año || 'N/A'}
🎨 *Color:* ${niv.color || 'N/A'}
🏷️ *Placas:* ${niv.placas || 'Sin placas'}
📅 *Creado:* ${fEmision}
👤 *Titular:* ${niv.titular || 'N/A'}
📧 *Correo:* ${niv.correo || 'Sin correo'}
📍 *Ubicación:* ${niv.municipio || 'N/A'}, ${niv.estadoRegion || 'N/A'}
📊 *Estado:* ACTIVO - Listo para usar`.trim();

                    const inlineKeyboard = [
                        [
                            Markup.button.callback(
                                `👀 Consultar NIV ${niv.numeroPoliza}`,
                                `getPoliza:${niv.numeroPoliza}`
                            )
                        ]
                    ];

                    try {
                        await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(inlineKeyboard));
                        await new Promise<void>(resolve => setTimeout(resolve, 500)); // Pause
                    } catch (sendError: unknown) {
                        this.logError(
                            `Error al enviar mensaje para NIV ${niv.numeroPoliza}:`,
                            sendError as Error
                        );
                        await ctx.reply(`Error al mostrar detalles de NIV ${niv.numeroPoliza}`); // Fallback
                    }
                }
            }

            // Mensaje final actualizado
            let mensajeFinal = '✅ Reporte completado.\n\n';
            if (regulares.length > 0 && nivs.length > 0) {
                mensajeFinal += `📊 Se mostraron ${regulares.length} pólizas regulares y ${nivs.length} NIVs disponibles.`;
            } else if (regulares.length > 0) {
                mensajeFinal += `📊 Se mostraron ${regulares.length} pólizas regulares prioritarias.`;
            } else if (nivs.length > 0) {
                mensajeFinal += `⚡ Se mostraron ${nivs.length} NIVs disponibles para uso inmediato.`;
            }

            await ctx.reply(mensajeFinal, Markup.inlineKeyboard([]));
            this.logInfo(`Reporte ${this.getCommandName()} enviado.`);
        } catch (error: unknown) {
            // Ensure interval is cleared on error
            scriptRunning = false;
            if (progressInterval) {
                clearInterval(progressInterval);
            }

            const typedError = error as Error;
            this.logError(`Error general en ${this.getCommandName()}:`, typedError);

            // Notify user about the error
            if (waitMsg) {
                try {
                    await this.handler.bot.telegram.editMessageText(
                        waitMsg.chat.id,
                        waitMsg.message_id,
                        undefined,
                        '❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...'
                    );
                } catch (e: unknown) {
                    await ctx.reply(
                        '❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...'
                    );
                }
            } else {
                await ctx.reply(
                    '❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...'
                );
            }

            // Fallback: Try fetching policies anyway
            try {
                const fallbackPolicies: PolicyDocument[] = (await Policy.find({ estado: 'ACTIVO' })
                    .sort({ calificacion: -1 })
                    .limit(10)
                    .lean()) as PolicyDocument[];

                if (fallbackPolicies.length > 0) {
                    await ctx.reply(
                        '⚠️ Mostrando pólizas disponibles (orden actual en base de datos):'
                    );
                    for (const pol of fallbackPolicies) {
                        await ctx.replyWithMarkdown(
                            `*Póliza:* ${pol.numeroPoliza}\n` +
                                `*Calificación:* ${pol.calificacion || 'No calculada'}\n` +
                                `*Vehículo:* ${pol.marca || 'N/A'} ${pol.submarca || 'N/A'}`,
                            Markup.inlineKeyboard([
                                [
                                    Markup.button.callback(
                                        `👀 Consultar ${pol.numeroPoliza}`,
                                        `getPoliza:${pol.numeroPoliza}`
                                    )
                                ]
                            ])
                        );
                        await new Promise<void>(resolve => setTimeout(resolve, 300));
                    }

                    // Añadir botón para volver al menú principal incluso en caso de error
                    await ctx.reply(
                        '⚠️ Proceso completado con errores.',
                        Markup.inlineKeyboard([])
                    );
                } else {
                    await ctx.reply(
                        '❌ No se pudieron obtener las pólizas de respaldo.',
                        Markup.inlineKeyboard([])
                    );
                }
            } catch (fallbackError: unknown) {
                this.logError('Error al obtener pólizas de respaldo:', fallbackError as Error);
                await this.replyError(ctx, 'Error crítico al intentar obtener pólizas.');
                // Añadir botón para volver al menú principal incluso en caso de error crítico
                await ctx.reply('❌ Error crítico.', Markup.inlineKeyboard([]));
            }
        }
    }
}

export default ReportUsedCommand;
