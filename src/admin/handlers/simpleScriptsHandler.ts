import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import path from 'path';
import fs from 'fs/promises';
import AutoCleanupService from '../../services/AutoCleanupService';
import { exportarPolizasExcel, validarArchivosPolizas } from '../jobs/ScheduledJobsService';

interface IExamplePolicy {
    numeroPoliza: string;
    titular: string;
    servicios: number;
}

interface ICleanupPreviewData {
    policiesToDelete: number;
    expiredPoliciesFound: number;
    examplePolicies: IExamplePolicy[];
}

interface ICleanupPreviewResult {
    success: boolean;
    preview?: ICleanupPreviewData;
    error?: string;
}

interface IRunningScript {
    scriptName: string;
    startTime: number;
    messageId: number;
    preview?: ICleanupPreviewData;
}

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

class SimpleScriptsHandler {
    private runningScripts: Map<number, IRunningScript>;
    private autoCleanupService: AutoCleanupService;

    constructor() {
        this.runningScripts = new Map();
        this.autoCleanupService = new AutoCleanupService();
    }

    /**
     * Valida que el contexto tenga usuario y chat
     */
    private validateContext(ctx: Context): { userId: number; chatId: number } | null {
        if (!ctx.from?.id || !ctx.chat?.id) {
            return null;
        }
        return { userId: ctx.from.id, chatId: ctx.chat.id };
    }

    /**
     * Maneja la exportación de pólizas a Excel
     */
    async handleExportExcel(ctx: Context): Promise<void> {
        const validated = this.validateContext(ctx);
        if (!validated) return;
        const { userId, chatId } = validated;

        // Verificar si ya hay un proceso corriendo para este usuario
        if (this.runningScripts.has(userId)) {
            await ctx.reply(
                '⚠️ Ya tienes un proceso de exportación ejecutándose. Espera a que termine.'
            );
            return;
        }

        // Mensaje inicial
        const startMsg = await ctx.reply('📊 *Exportando a Excel*\n\n⏳ Iniciando exportación...', {
            parse_mode: 'Markdown'
        });

        // Marcar como ejecutándose
        this.runningScripts.set(userId, {
            scriptName: 'exportExcel',
            startTime: Date.now(),
            messageId: startMsg.message_id
        });

        try {
            // Llamada directa a la función (sin spawn de proceso externo)
            const resultado = await exportarPolizasExcel();
            const scriptData = this.runningScripts.get(userId);

            if (scriptData) {
                const elapsed = Math.floor((Date.now() - scriptData.startTime) / 1000);

                let successMessage = '✅ *Exportación completada*\n\n';
                successMessage += `⏱️ Tiempo total: ${elapsed}s\n`;
                successMessage += `📊 Pólizas exportadas: ${resultado.totalExported}\n`;
                successMessage += '\n📄 Enviando archivo Excel...';

                await ctx.telegram.editMessageText(
                    chatId,
                    startMsg.message_id,
                    undefined,
                    successMessage,
                    { parse_mode: 'Markdown' }
                );

                // Enviar archivo generado
                if (resultado.filePath) {
                    await this.sendExcelFile(ctx, resultado.filePath);
                }
            }
        } catch (error) {
            const scriptData = this.runningScripts.get(userId);
            if (scriptData) {
                const elapsed = Math.floor((Date.now() - scriptData.startTime) / 1000);

                let errorMessage = '❌ *Error en exportación*\n\n';
                errorMessage += `⏱️ Tiempo transcurrido: ${elapsed}s\n`;
                errorMessage += `🔥 Error: ${(error as Error).message}\n`;

                await ctx.telegram.editMessageText(
                    chatId,
                    startMsg.message_id,
                    undefined,
                    errorMessage,
                    { parse_mode: 'Markdown' }
                );
            }
        } finally {
            // Limpiar estado
            this.runningScripts.delete(userId);
        }
    }

    /**
     * Envía un archivo Excel específico
     */
    private async sendExcelFile(ctx: Context, filePath: string): Promise<void> {
        try {
            const fileName = path.basename(filePath);
            await ctx.replyWithDocument(
                { source: filePath, filename: fileName },
                {
                    caption: `📊 *Exportación Excel Completa*\n\n📅 Generado: ${new Date().toLocaleString('es-ES')}`,
                    parse_mode: 'Markdown'
                }
            );
        } catch (error) {
            console.error('Error enviando archivo Excel:', error);
            await ctx.reply('❌ Error al enviar archivo Excel: ' + (error as Error).message);
        }
    }

    /**
     * Maneja la solicitud de limpieza automática - Primero muestra resumen previo
     */
    async handleAutoCleanup(ctx: Context): Promise<void> {
        const validated = this.validateContext(ctx);
        if (!validated) return;
        const { userId, chatId } = validated;

        // Verificar si ya hay un script corriendo para este usuario
        if (this.runningScripts.has(userId)) {
            await ctx.reply('⚠️ Ya tienes un proceso ejecutándose. Espera a que termine.');
            return;
        }

        // Mensaje inicial mientras genera el resumen
        const startMsg = await ctx.reply(
            '🧹 *Limpieza Automática de Pólizas*\n\n🔍 Generando resumen previo...',
            { parse_mode: 'Markdown' }
        );

        try {
            // Obtener resumen previo
            const preview =
                (await this.autoCleanupService.getCleanupPreview()) as ICleanupPreviewResult;

            if (preview.success && preview.preview) {
                const previewData = preview.preview;
                // Construir mensaje de resumen previo
                let previewMessage = '📋 *RESUMEN PREVIO - LIMPIEZA AUTOMÁTICA*\n\n';
                previewMessage += '🔍 **Lo que se va a procesar:**\n\n';

                previewMessage += `🗑️ **Pólizas a eliminar automáticamente:** ${previewData.policiesToDelete}\n`;
                previewMessage += '   ↳ _Criterio: Estado ACTIVO con ≥2 servicios_\n\n';

                previewMessage += `⚠️ **Pólizas vencidas para reporte:** ${previewData.expiredPoliciesFound}\n`;
                previewMessage += '   ↳ _Criterio: Estado VENCIDA (solo se reportan)_\n\n';

                // Mostrar ejemplos si hay pólizas para eliminar
                if (previewData.examplePolicies.length > 0) {
                    previewMessage += '📝 **Ejemplos de pólizas a eliminar:**\n';
                    previewData.examplePolicies.forEach((pol, index) => {
                        if (index < 3) {
                            // Mostrar máximo 3 ejemplos
                            previewMessage += `   • ${pol.numeroPoliza} (${pol.titular}) - ${pol.servicios} servicios\n`;
                        }
                    });
                    if (previewData.policiesToDelete > 3) {
                        previewMessage += `   • ... y ${previewData.policiesToDelete - 3} más\n`;
                    }
                    previewMessage += '\n';
                }

                previewMessage += '❓ **¿Deseas continuar con la limpieza automática?**';

                // Crear teclado de confirmación
                const keyboard = Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '✅ Confirmar y Ejecutar',
                            'admin_autocleanup_confirm'
                        ),
                        Markup.button.callback('❌ Cancelar', 'admin_autocleanup_cancel')
                    ]
                ]);

                await ctx.telegram.editMessageText(
                    chatId,
                    startMsg.message_id,
                    undefined,
                    previewMessage,
                    {
                        parse_mode: 'Markdown',
                        ...keyboard
                    }
                );

                // Guardar datos para la confirmación
                this.runningScripts.set(userId, {
                    scriptName: 'autoCleanup_preview',
                    startTime: Date.now(),
                    messageId: startMsg.message_id,
                    preview: preview.preview
                });
            } else {
                // Error al generar resumen
                await ctx.telegram.editMessageText(
                    chatId,
                    startMsg.message_id,
                    undefined,
                    `❌ *Error al generar resumen*\n\n🔥 ${preview.error}`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            await ctx.telegram.editMessageText(
                chatId,
                startMsg.message_id,
                undefined,
                `❌ *Error crítico*\n\n🔥 ${(error as Error).message}`,
                { parse_mode: 'Markdown' }
            );
        }
    }

    /**
     * Ejecuta la limpieza automática después de confirmación
     */
    async executeAutoCleanupConfirmed(ctx: Context): Promise<void> {
        const validated = this.validateContext(ctx);
        if (!validated) return;
        const { userId } = validated;

        if (!this.runningScripts.has(userId)) {
            await ctx.answerCbQuery('⚠️ Sesión expirada, inicia nuevamente', { show_alert: true });
            return;
        }

        const sessionData = this.runningScripts.get(userId);
        if (!sessionData) return;
        sessionData.scriptName = 'autoCleanup_executing';
        sessionData.startTime = Date.now();

        // Actualizar mensaje a "ejecutando"
        await ctx.editMessageText(
            '🧹 *Limpieza Automática de Pólizas*\n\n⏳ Ejecutando limpieza automática...',
            { parse_mode: 'Markdown' }
        );

        try {
            // Ejecutar limpieza automática
            const result = (await this.autoCleanupService.executeAutoCleanup()) as ICleanupResult;

            const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);

            if (result.success) {
                // Mensaje de éxito
                let successMessage = '✅ *Limpieza Automática Completada*\n\n';
                successMessage += `⏱️ Tiempo total: ${elapsed}s\n`;
                successMessage += `🗑️ Pólizas eliminadas automáticamente: ${result.stats.automaticDeletions}\n`;
                successMessage += `⚠️ Pólizas vencidas encontradas: ${result.stats.expiredPoliciesFound}\n`;

                if (result.stats.errors > 0) {
                    successMessage += `❌ Errores: ${result.stats.errors}\n`;
                }

                await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });

                // Enviar reporte de pólizas vencidas si las hay
                if (result.expiredPolicies.length > 0) {
                    await this.sendExpiredPoliciesReport(ctx, result.expiredPolicies);
                }
            } else {
                // Error en la limpieza
                let errorMessage = '❌ *Error en Limpieza Automática*\n\n';
                errorMessage += `⏱️ Tiempo transcurrido: ${elapsed}s\n`;
                errorMessage += `🔥 Error: ${result.error}\n`;

                await ctx.editMessageText(errorMessage, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);

            let errorMessage = '❌ *Error Crítico en Limpieza*\n\n';
            errorMessage += `⏱️ Tiempo transcurrido: ${elapsed}s\n`;
            errorMessage += `🔥 Error: ${(error as Error).message}\n`;

            await ctx.editMessageText(errorMessage, { parse_mode: 'Markdown' });
        } finally {
            // Limpiar estado
            this.runningScripts.delete(userId);
        }
    }

    /**
     * Cancela la limpieza automática
     */
    async cancelAutoCleanup(ctx: Context): Promise<void> {
        const validated = this.validateContext(ctx);
        if (!validated) return;
        const { userId } = validated;

        if (this.runningScripts.has(userId)) {
            this.runningScripts.delete(userId);
        }

        await ctx.editMessageText(
            '❌ *Limpieza Automática Cancelada*\n\n🚫 No se realizaron cambios en la base de datos.',
            { parse_mode: 'Markdown' }
        );
    }

    /**
     * Envía reporte de pólizas vencidas para revisión manual
     */
    private async sendExpiredPoliciesReport(
        ctx: Context,
        expiredPolicies: IExpiredPolicy[]
    ): Promise<void> {
        if (expiredPolicies.length === 0) {
            return;
        }

        try {
            // Mensaje de cabecera
            let reportMessage = '📋 *REPORTE PÓLIZAS VENCIDAS*\n';
            reportMessage += '*Para Revisión Manual*\n\n';
            reportMessage += `Total encontradas: ${expiredPolicies.length}\n\n`;

            // Dividir en grupos de 8 para evitar mensajes muy largos
            const POLICIES_PER_MESSAGE = 8;

            for (let i = 0; i < expiredPolicies.length; i += POLICIES_PER_MESSAGE) {
                const chunk = expiredPolicies.slice(i, i + POLICIES_PER_MESSAGE);

                let chunkMessage = '';
                if (i === 0) {
                    chunkMessage = reportMessage;
                }

                chunk.forEach((poliza, index) => {
                    const num = i + index + 1;
                    chunkMessage += `${num}. *${poliza.numeroPoliza}*\n`;
                    chunkMessage += `   Titular: ${poliza.titular}\n`;
                    chunkMessage += `   Aseguradora: ${poliza.aseguradora}\n`;
                    chunkMessage += `   Servicios: ${poliza.servicios}\n`;
                    chunkMessage += `   Días transcurridos: ${poliza.diasVencida}\n\n`;
                });

                await ctx.reply(chunkMessage, { parse_mode: 'Markdown' });

                // Pausa entre mensajes para evitar flood
                if (i + POLICIES_PER_MESSAGE < expiredPolicies.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Mensaje final con instrucciones
            const instructionsMessage =
                '💡 *Instrucciones:*\n\n' +
                'Estas pólizas tienen estado VENCIDA y requieren revisión manual. ' +
                'Usa el panel de administración para eliminarlas una por una o en lotes si corresponde.';

            await ctx.reply(instructionsMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error enviando reporte de pólizas vencidas:', error);
            await ctx.reply(
                '❌ Error al enviar reporte de pólizas vencidas: ' + (error as Error).message
            );
        }
    }

    /**
     * Maneja la validación de archivos de pólizas
     */
    async handleFileValidation(ctx: Context): Promise<void> {
        const validated = this.validateContext(ctx);
        if (!validated) return;
        const { userId } = validated;

        // Verificar si ya hay un proceso corriendo para este usuario
        if (this.runningScripts.has(userId)) {
            await ctx.answerCbQuery('⏳ Ya tienes un proceso en ejecución', { show_alert: true });
            return;
        }

        await ctx.answerCbQuery();

        try {
            await ctx.editMessageText(
                '🔄 *Iniciando Validación de Archivos*\n\n' +
                    '📋 Analizando todas las pólizas...\n' +
                    '📊 Verificando fotos y PDFs...',
                { parse_mode: 'Markdown' }
            );

            // Registrar proceso en ejecución
            this.runningScripts.set(userId, {
                scriptName: 'fileValidation',
                startTime: Date.now(),
                messageId: 0
            });

            // Llamada directa a la función
            const resultado = await validarArchivosPolizas();
            const scriptData = this.runningScripts.get(userId);

            if (scriptData) {
                const elapsed = Math.floor((Date.now() - scriptData.startTime) / 1000);

                await ctx.editMessageText(
                    `✅ *Validación Completada*\n\n` +
                        `⏱️ Tiempo: ${elapsed}s\n` +
                        `📊 Total analizadas: ${resultado.totalProcessed}\n` +
                        `⚠️ Con problemas: ${resultado.totalProblems}\n\n` +
                        `📎 Enviando reporte...`,
                    { parse_mode: 'Markdown' }
                );

                // Enviar archivo si hay problemas
                if (resultado.filePath && resultado.totalProblems > 0) {
                    const fileBuffer = await fs.readFile(resultado.filePath);
                    const fileName = `validacion-archivos-${new Date().toISOString().split('T')[0]}.xlsx`;

                    await ctx.replyWithDocument(
                        { source: fileBuffer, filename: fileName },
                        {
                            caption:
                                '📋 *REPORTE - PÓLIZAS CON PROBLEMAS*\n\n' +
                                '🔴 Rojo: Sin fotos Y sin PDF\n' +
                                '🟠 Naranja: Sin fotos\n' +
                                '🟡 Amarillo: Sin PDF\n\n' +
                                `📅 Generado: ${new Date().toLocaleString('es-MX')}`,
                            parse_mode: 'Markdown'
                        }
                    );

                    // Limpiar archivo temporal
                    await fs.unlink(resultado.filePath).catch(() => {});
                } else if (resultado.totalProblems === 0) {
                    await ctx.reply('🎉 ¡Excelente! Todas las pólizas tienen fotos y PDFs.', {
                        parse_mode: 'Markdown'
                    });
                }
            }
        } catch (error) {
            console.error('Error en validación de archivos:', error);
            await ctx.editMessageText(
                '❌ *Error*\n\nNo se pudo completar la validación: ' + (error as Error).message,
                { parse_mode: 'Markdown' }
            );
        } finally {
            this.runningScripts.delete(userId);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async handleAction(ctx: Context, _action: string): Promise<void> {
        // Método requerido por la interfaz pero no implementado específicamente
        await ctx.answerCbQuery('Acción no implementada', { show_alert: true });
    }
}

export default SimpleScriptsHandler;
