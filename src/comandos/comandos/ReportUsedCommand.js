// src/comandos/comandos/ReportUsedCommand.js
const BaseCommand = require('./BaseCommand');
const logger = require('../../utils/logger');
const { spawn } = require('child_process');
const path = require('path');
const { Markup } = require('telegraf');
const Policy = require('../../models/policy'); // Import Policy model

class ReportUsedCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'reportUsed'; // Matches the command in commandHandler.js
    }

    getDescription() {
        return 'Genera un reporte de pólizas prioritarias (ejecuta script de cálculo).';
    }

    register() {
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
    async generateReport(ctx) {
        let waitMsg = null;
        let progressInterval = null;
        let scriptRunning = true; // Flag to control interval

        try {
            this.logInfo(`Ejecutando comando ${this.getCommandName()}`);
            // Enviar mensaje inicial
            waitMsg = await ctx.reply(
                '🔄 Iniciando cálculo de estados de pólizas...\n' +
                    'Este proceso puede tardar varios minutos, se enviarán actualizaciones periódicas.'
            );

            // Variables para seguimiento y mensajes de progreso
            let lastProgressUpdate = Date.now();
            let updateCount = 0;

            // Iniciar el temporizador de progreso
            progressInterval = setInterval(async () => {
                if (!scriptRunning || !waitMsg) {
                    // Check if script finished or message deleted
                    clearInterval(progressInterval);
                    return;
                }

                updateCount++;
                const elapsedSeconds = Math.floor((Date.now() - lastProgressUpdate) / 1000);

                try {
                    // Use handler's bot instance
                    await this.handler.bot.telegram.editMessageText(
                        waitMsg.chat.id,
                        waitMsg.message_id,
                        undefined,
                        '🔄 Cálculo de estados en progreso...\n' +
                            `⏱️ Tiempo transcurrido: ${elapsedSeconds} segundos\n` +
                            `Actualización #${updateCount} - Por favor espere, esto puede tardar varios minutos.`
                    );
                    // lastProgressUpdate = Date.now(); // Update only on successful edit? Or always? Let's update always.
                    lastProgressUpdate = Date.now();
                } catch (e) {
                    // Ignore errors if message was deleted or couldn't be edited
                    if (!e.message.includes('message to edit not found')) {
                        this.logError('Error al actualizar mensaje de progreso:', e);
                    } else {
                        this.logInfo(
                            'Mensaje de progreso no encontrado, deteniendo actualizaciones.'
                        );
                        clearInterval(progressInterval); // Stop trying if message is gone
                    }
                }
            }, 30000); // Actualizar cada 30 segundos

            // Ejecutar el script calculoEstadosDB.js como proceso separado
            const scriptPath = path.join(__dirname, '../../../scripts/calculoEstadosDB.js'); // Adjusted path relative to this file

            const executeScript = () => {
                return new Promise((resolve, reject) => {
                    this.logInfo(`Ejecutando script: ${scriptPath}`);

                    const childProcess = spawn('node', [scriptPath], {
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    });

                    childProcess.stdout.on('data', data => {
                        const output = data.toString().trim();
                        this.logInfo(`calculoEstadosDB stdout: ${output}`);
                    });

                    childProcess.stderr.on('data', data => {
                        const errorOutput = data.toString().trim();
                        this.logError(`calculoEstadosDB stderr: ${errorOutput}`);
                    });

                    childProcess.on('close', code => {
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

                    childProcess.on('error', err => {
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
            } catch (scriptError) {
                this.logError(
                    'Error o timeout en el script, continuando con consulta de pólizas:',
                    scriptError
                );
                // Continue anyway
            } finally {
                scriptRunning = false; // Ensure flag is set and interval stops
                clearInterval(progressInterval);
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
                } catch (msgError) {
                    this.logError('Error al actualizar mensaje final:', msgError);
                    await ctx.reply('🔍 Consultando las pólizas prioritarias...'); // Fallback reply
                }
            } else {
                await ctx.reply('🔍 Consultando las pólizas prioritarias...'); // Fallback if waitMsg was lost
            }

            // Pequeña pausa
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Buscar el top 10 de pólizas
            const topPolicies = await Policy.find({ estado: 'ACTIVO' })
                .sort({ calificacion: -1 })
                .limit(10)
                .lean();

            if (!topPolicies.length) {
                return await ctx.reply('✅ No hay pólizas prioritarias que mostrar.');
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
                if (pol.calificacion >= 80) alertaPrioridad = '⚠️ *ALTA PRIORIDAD*\n';
                else if (pol.calificacion >= 60) alertaPrioridad = '⚠️ *PRIORIDAD MEDIA*\n';

                const msg = `
${alertaPrioridad}🏆 *Calificación: ${pol.calificacion || 0}*
🔍 *Póliza:* ${pol.numeroPoliza}
📅 *Emisión:* ${fEmision}
🚗 *Vehículo:* ${pol.marca} ${pol.submarca} (${pol.año})
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
                    await new Promise(resolve => setTimeout(resolve, 500)); // Pause
                } catch (sendError) {
                    this.logError(
                        `Error al enviar mensaje para póliza ${pol.numeroPoliza}:`,
                        sendError
                    );
                    await ctx.reply(`Error al mostrar detalles de póliza ${pol.numeroPoliza}`); // Fallback
                }
            }

            // Añadir botón para volver al menú principal
            await ctx.reply(
                '✅ Se han mostrado las pólizas prioritarias según su calificación actual.',
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                ])
            );
            this.logInfo(`Reporte ${this.getCommandName()} enviado.`);
        } catch (error) {
            // Ensure interval is cleared on error
            scriptRunning = false;
            clearInterval(progressInterval);

            this.logError(`Error general en ${this.getCommandName()}:`, error);

            // Notify user about the error
            if (waitMsg) {
                try {
                    await this.handler.bot.telegram.editMessageText(
                        waitMsg.chat.id,
                        waitMsg.message_id,
                        undefined,
                        '❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...'
                    );
                } catch (e) {
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
                const fallbackPolicies = await Policy.find({ estado: 'ACTIVO' })
                    .sort({ calificacion: -1 })
                    .limit(10)
                    .lean();

                if (fallbackPolicies.length > 0) {
                    await ctx.reply(
                        '⚠️ Mostrando pólizas disponibles (orden actual en base de datos):'
                    );
                    for (const pol of fallbackPolicies) {
                        await ctx.replyWithMarkdown(
                            `*Póliza:* ${pol.numeroPoliza}\n` +
                                `*Calificación:* ${pol.calificacion || 'No calculada'}\n` +
                                `*Vehículo:* ${pol.marca} ${pol.submarca}`,
                            Markup.inlineKeyboard([
                                [
                                    Markup.button.callback(
                                        `👀 Consultar ${pol.numeroPoliza}`,
                                        `getPoliza:${pol.numeroPoliza}`
                                    )
                                ]
                            ])
                        );
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }

                    // Añadir botón para volver al menú principal incluso en caso de error
                    await ctx.reply(
                        '⚠️ Proceso completado con errores.',
                        Markup.inlineKeyboard([
                            Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ])
                    );
                } else {
                    await ctx.reply(
                        '❌ No se pudieron obtener las pólizas de respaldo.',
                        Markup.inlineKeyboard([
                            Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ])
                    );
                }
            } catch (fallbackError) {
                this.logError('Error al obtener pólizas de respaldo:', fallbackError);
                await this.replyError(ctx, 'Error crítico al intentar obtener pólizas.');
                // Añadir botón para volver al menú principal incluso en caso de error crítico
                await ctx.reply(
                    '❌ Error crítico.',
                    Markup.inlineKeyboard([
                        Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ])
                );
            }
        }
    }
}

module.exports = ReportUsedCommand;
