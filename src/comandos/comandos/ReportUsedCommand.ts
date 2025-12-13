// src/comandos/comandos/ReportUsedCommand.ts
/**
 * Comando para generar reportes de pólizas prioritarias
 * REFACTORIZADO: Extracción de métodos para eliminar duplicación
 * Migrado de Mongoose a Prisma/PostgreSQL
 */
import BaseCommand from './BaseCommand';
import { Markup, Context } from 'telegraf';
import { prisma } from '../../database/prisma';
import { getOldUnusedPolicies } from '../../controllers/policyController';
import { calcularEstadosPolizas } from '../../admin/jobs/ScheduledJobsService';

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

interface PolicyReportData {
    numeroPoliza: string;
    fechaEmision?: Date;
    fechaFinGracia?: Date;
    servicios?: unknown[];
    pagos?: unknown[];
    diasRestantesGracia?: number | null;
    calificacion?: number;
    aseguradora?: string;
    tipoReporte?: string;
    mensajeEspecial?: string;
    marca?: string;
    submarca?: string;
    año?: number;
    color?: string;
    placas?: string;
    titular?: string;
    correo?: string;
    municipio?: string;
    estadoRegion?: string;
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
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);
    }

    // ========== MÉTODOS AUXILIARES (REFACTORIZADO) ==========

    /**
     * Formatea una fecha a string ISO (YYYY-MM-DD)
     */
    private formatDate(date: Date | undefined): string {
        return date ? new Date(date).toISOString().split('T')[0] : 'No disponible';
    }

    /**
     * Calcula días de gracia si no están disponibles
     */
    private calculateDiasGracia(
        diasRestantes: number | null | undefined,
        fechaFinGracia: Date | undefined
    ): number | null {
        if (diasRestantes !== null && diasRestantes !== undefined) {
            return diasRestantes;
        }
        if (fechaFinGracia) {
            const hoy = new Date();
            const fechaFin = new Date(fechaFinGracia);
            return Math.ceil((fechaFin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        }
        return null;
    }

    /**
     * Determina la alerta de prioridad basada en calificación y días de gracia
     */
    private getPriorityAlert(calificacion: number, diasGracia: number | null): string {
        if (calificacion >= 90 || (diasGracia !== null && diasGracia <= 5)) {
            return '⚠️ *ALTA PRIORIDAD*\n';
        }
        if (calificacion >= 70 || (diasGracia !== null && diasGracia <= 15)) {
            return '⚠️ *PRIORIDAD MEDIA*\n';
        }
        return '';
    }

    /**
     * Envía un mensaje con manejo de rate limiting de Telegram
     */
    private async sendWithRateLimit(
        ctx: Context,
        mensaje: string,
        inlineKeyboard: any[][]
    ): Promise<void> {
        try {
            await ctx.replyWithMarkdown(mensaje, Markup.inlineKeyboard(inlineKeyboard));
            await this.delay(1000);
        } catch (sendError: unknown) {
            const error = sendError as any;
            if (error.response?.error_code === 429) {
                const retryAfter = error.response.parameters?.retry_after ?? 30;
                this.logInfo(`Rate limited, waiting ${retryAfter} seconds before retry`);
                await this.delay(retryAfter * 1000);
                try {
                    await ctx.replyWithMarkdown(mensaje, Markup.inlineKeyboard(inlineKeyboard));
                    await this.delay(1000);
                } catch (retryError) {
                    this.logError('Retry failed:', retryError as Error);
                }
            } else {
                this.logError('Error al enviar mensaje:', sendError as Error);
            }
        }
    }

    /**
     * Helper para delays
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Genera mensaje formateado para póliza regular
     */
    private formatRegularPolicyMessage(pol: PolicyReportData): string {
        const fechaFinGracia = this.formatDate(pol.fechaFinGracia);
        const totalServicios = (pol.servicios ?? []).length;
        const totalPagos = (pol.pagos ?? []).length;
        const diasGracia = this.calculateDiasGracia(pol.diasRestantesGracia, pol.fechaFinGracia);
        const alertaPrioridad = this.getPriorityAlert(pol.calificacion ?? 0, diasGracia);
        const diasTexto = diasGracia !== null ? diasGracia.toString() : '0';

        return `${alertaPrioridad}⏳ *Fin Gracia:* ${fechaFinGracia} (${diasTexto} días)
🔧 *Servicios:* ${totalServicios}
💰 *Pagos:* ${totalPagos}
*ASEGURADORA:* ${pol.aseguradora ?? 'NO DEFINIDA'}`;
    }

    /**
     * Genera mensaje formateado para NIV
     */
    private formatNIVMessage(niv: PolicyReportData): string {
        const fEmision = this.formatDate(niv.fechaEmision);
        return `⚡ *${niv.mensajeEspecial}*
🆔 *NIV:* \`${niv.numeroPoliza}\`
🚗 *Vehículo:* ${niv.marca ?? 'N/A'} ${niv.submarca ?? 'N/A'} ${niv.año ?? 'N/A'}
🎨 *Color:* ${niv.color ?? 'N/A'}
🏷️ *Placas:* ${niv.placas ?? 'Sin placas'}
📅 *Creado:* ${fEmision}
👤 *Titular:* ${niv.titular ?? 'N/A'}
📧 *Correo:* ${niv.correo ?? 'Sin correo'}
📍 *Ubicación:* ${niv.municipio ?? 'N/A'}, ${niv.estadoRegion ?? 'N/A'}
📊 *Estado:* ACTIVO - Listo para usar`;
    }

    /**
     * Envía lista de pólizas regulares con cabecera
     */
    private async enviarPolizasRegulares(
        ctx: Context,
        polizas: PolicyReportData[],
        cabecera: string
    ): Promise<void> {
        if (polizas.length === 0) return;
        await ctx.reply(cabecera, { parse_mode: 'Markdown' });

        for (const pol of polizas) {
            const msg = this.formatRegularPolicyMessage(pol);
            const inlineKeyboard = [
                [Markup.button.callback(`📋 ${pol.numeroPoliza}`, `getPoliza:${pol.numeroPoliza}`)]
            ];
            await this.sendWithRateLimit(ctx, msg, inlineKeyboard);
        }
    }

    /**
     * Envía lista de NIVs con cabecera
     */
    private async enviarNIVs(ctx: Context, nivs: PolicyReportData[]): Promise<void> {
        if (nivs.length === 0) return;

        await ctx.reply(
            '⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡\n⚡ *NIVs DISPONIBLES (2023-2026)*\n⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡',
            { parse_mode: 'Markdown' }
        );

        for (const niv of nivs) {
            const msg = this.formatNIVMessage(niv);
            const inlineKeyboard = [
                [
                    Markup.button.callback(
                        `👀 Consultar NIV ${niv.numeroPoliza}`,
                        `getPoliza:${niv.numeroPoliza}`
                    )
                ]
            ];
            await this.sendWithRateLimit(ctx, msg, inlineKeyboard);
        }
    }

    // ========== MÉTODO PRINCIPAL ==========

    // Method to generate and send the report, callable if needed
    async generateReport(ctx: Context): Promise<void> {
        let waitMsg: TelegramMessage | null = null;

        try {
            this.logInfo(`Ejecutando comando ${this.getCommandName()}`);

            // Enviar mensaje inicial
            waitMsg = (await ctx.reply(
                '🔄 Iniciando cálculo de estados de pólizas...'
            )) as TelegramMessage;

            // Ejecutar cálculo de estados directamente (sin spawn de script)
            try {
                this.logInfo('🔄 Iniciando sistema de calificaciones');
                const resultado = await calcularEstadosPolizas();
                this.logInfo(`✅ Sistema completado: ${resultado.procesadas} pólizas procesadas`);
            } catch (calcError: unknown) {
                this.logError('Error en cálculo de estados, continuando:', calcError as Error);
            }

            // Actualizar mensaje
            if (waitMsg) {
                try {
                    await this.handler.bot.telegram.editMessageText(
                        waitMsg.chat.id,
                        waitMsg.message_id,
                        undefined,
                        '✅ Cálculo completado.\n🔍 Consultando pólizas prioritarias...'
                    );
                } catch (msgError: unknown) {
                    this.logError('Error al actualizar mensaje:', msgError as Error);
                }
            }

            // Obtener pólizas prioritarias
            const todasLasPolizas = await getOldUnusedPolicies();

            // Procesar asíncronamente sin bloquear el bot
            setTimeout(async () => {
                await this.enviarReporteAsincrono(ctx, todasLasPolizas);
            }, 100);

            return;
        } catch (error: unknown) {
            await this.handleMainError(ctx, error);
        }
    }

    private async enviarReporteAsincrono(ctx: Context, todasLasPolizas: any[]): Promise<void> {
        try {
            if (!todasLasPolizas.length) {
                await ctx.reply('✅ No hay pólizas prioritarias ni NIVs que mostrar.');
                return;
            }

            // Separar por tipo y prioridad
            const regulares = todasLasPolizas.filter(p => p.tipoReporte !== 'NIV');
            const nivs = todasLasPolizas.filter(p => p.tipoReporte === 'NIV');
            const polizasSinServicio = regulares.filter(p => p.prioridadGrupo === 1);
            const polizasConUnServicio = regulares.filter(p => p.prioridadGrupo === 2);

            // Mostrar cabecera general
            const cabecera = this.generarCabeceraReporte(
                polizasSinServicio.length,
                polizasConUnServicio.length,
                nivs.length
            );
            await ctx.reply(cabecera, { parse_mode: 'Markdown' });

            // Enviar pólizas sin servicio (prioridad 1)
            await this.enviarPolizasRegulares(
                ctx,
                polizasSinServicio,
                '🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡\n🚫 *PÓLIZAS SIN SERVICIO (MÁXIMA PRIORIDAD)*\n🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡🟡'
            );

            // Enviar pólizas con un servicio (prioridad 2)
            await this.enviarPolizasRegulares(
                ctx,
                polizasConUnServicio,
                '🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠\n🔧 *PÓLIZAS CON UN SERVICIO (SEGUNDA PRIORIDAD)*\n🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠🟠'
            );

            // Enviar NIVs
            await this.enviarNIVs(ctx, nivs);

            // Mensaje final
            const mensajeFinal = this.generarMensajeFinal(regulares.length, nivs.length);
            await ctx.reply(mensajeFinal, Markup.inlineKeyboard([]));
            this.logInfo(`Reporte ${this.getCommandName()} enviado.`);
        } catch (error: unknown) {
            this.logError(`Error en envío asíncrono:`, error as Error);
            await ctx.reply('❌ Error al generar el reporte completo.');
        }
    }

    /**
     * Genera la cabecera del reporte según los conteos
     */
    private generarCabeceraReporte(sinServicio: number, conServicio: number, nivs: number): string {
        let cabecera = '🎯 *SISTEMA ROBUSTO DE CALIFICACIONES*\n\n';
        if (sinServicio > 0 && conServicio > 0 && nivs > 0) {
            cabecera += `🚫 ${sinServicio} sin servicio + 🔧 ${conServicio} con 1 servicio + ⚡ ${nivs} NIVs\n\n`;
        } else if (sinServicio > 0 && conServicio > 0) {
            cabecera += `🚫 ${sinServicio} sin servicio + 🔧 ${conServicio} con 1 servicio\n\n`;
        } else if (sinServicio > 0) {
            cabecera += `🚫 ${sinServicio} pólizas sin servicio encontradas\n\n`;
        } else if (nivs > 0) {
            cabecera += `⚡ ${nivs} NIVs disponibles\n\n`;
        }
        return cabecera;
    }

    /**
     * Genera mensaje final del reporte
     */
    private generarMensajeFinal(regulares: number, nivs: number): string {
        let mensajeFinal = '✅ Reporte completado.\n\n';
        if (regulares > 0 && nivs > 0) {
            mensajeFinal += `📊 Se mostraron ${regulares} pólizas regulares y ${nivs} NIVs disponibles.`;
        } else if (regulares > 0) {
            mensajeFinal += `📊 Se mostraron ${regulares} pólizas regulares prioritarias.`;
        } else if (nivs > 0) {
            mensajeFinal += `⚡ Se mostraron ${nivs} NIVs disponibles para uso inmediato.`;
        }
        return mensajeFinal;
    }

    private async handleMainError(ctx: Context, error: unknown): Promise<void> {
        try {
            const typedError = error as Error;
            this.logError(`Error general en ${this.getCommandName()}:`, typedError);
            await ctx.reply('❌ Error al generar el reporte de pólizas prioritarias.');

            // Fallback: Try fetching policies anyway
            try {
                const fallbackPolicies = (await prisma.policy.findMany({
                    where: { estado: 'ACTIVO' },
                    orderBy: { calificacion: 'desc' },
                    take: 10
                })) as PolicyDocument[];

                if (fallbackPolicies.length > 0) {
                    await ctx.reply(
                        '⚠️ Mostrando pólizas disponibles (orden actual en base de datos):'
                    );
                    for (const pol of fallbackPolicies) {
                        await ctx.replyWithMarkdown(
                            `*Póliza:* ${pol.numeroPoliza}\n` +
                                `*Calificación:* ${pol.calificacion ?? 'No calculada'}\n` +
                                `*Vehículo:* ${pol.marca ?? 'N/A'} ${pol.submarca ?? 'N/A'}`,
                            Markup.inlineKeyboard([
                                [
                                    Markup.button.callback(
                                        `👀 Consultar ${pol.numeroPoliza}`,
                                        `getPoliza:${pol.numeroPoliza}`
                                    )
                                ]
                            ])
                        );
                        await new Promise<void>(resolve => setTimeout(resolve, 1000));
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
        } catch (handlerError: unknown) {
            this.logError('Error en handler de errores:', handlerError as Error);
        }
    }
}

export default ReportUsedCommand;
