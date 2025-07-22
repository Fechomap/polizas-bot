import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import AutoCleanupService from '../../services/AutoCleanupService';

interface IRunningScript {
    scriptName: string;
    startTime: number;
    messageId: number;
    preview?: any;
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
    private scriptsPath: string;
    private runningScripts: Map<number, IRunningScript>;
    private autoCleanupService: AutoCleanupService;

    constructor() {
        this.scriptsPath = path.join(__dirname, '../../../scripts');
        this.runningScripts = new Map();
        this.autoCleanupService = new AutoCleanupService();
    }

    /**
     * Maneja la ejecución de exportExcel.js
     */
    async handleExportExcel(ctx: Context): Promise<void> {
        const userId = ctx.from!.id;

        // Verificar si ya hay un script corriendo para este usuario
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
            scriptName: 'exportExcel.js',
            startTime: Date.now(),
            messageId: startMsg.message_id
        });

        let output = '';
        let errorOutput = '';

        try {
            // Ejecutar el script
            const scriptPath = path.join(this.scriptsPath, 'exportExcel.js');
            const child = spawn('node', [scriptPath], {
                cwd: this.scriptsPath,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            child.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });

            child.stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });

            // Actualizar progreso cada 5 segundos
            const progressInterval = setInterval(async () => {
                const scriptData = this.runningScripts.get(userId);
                if (scriptData) {
                    const elapsed = Math.floor((Date.now() - scriptData.startTime) / 1000);
                    try {
                        await ctx.telegram.editMessageText(
                            ctx.chat!.id,
                            startMsg.message_id,
                            undefined,
                            `📊 *Exportando a Excel*\n\n⏳ Tiempo transcurrido: ${elapsed}s\n💭 Procesando pólizas...`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (err) {
                        // Ignorar errores de edición de mensaje
                    }
                }
            }, 5000);

            // Esperar a que termine
            await new Promise<void>((resolve, reject) => {
                child.on('close', (code: number | null) => {
                    clearInterval(progressInterval);
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Script salió con código ${code}`));
                    }
                });

                child.on('error', (err: Error) => {
                    clearInterval(progressInterval);
                    reject(err);
                });
            });

            // Procesar resultado
            const scriptData = this.runningScripts.get(userId);
            if (scriptData) {
                const elapsed = Math.floor((Date.now() - scriptData.startTime) / 1000);

                let successMessage = '✅ *Exportación completada*\n\n';
                successMessage += `⏱️ Tiempo total: ${elapsed}s\n`;

                // Agregar información específica del script
                if (output.includes('Total procesado:')) {
                    const matches = output.match(/Total procesado: (\d+)/);
                    if (matches) {
                        successMessage += `📊 Pólizas procesadas: ${matches[1]}\n`;
                    }
                }

                successMessage += '\n📄 Enviando archivo Excel...';

                await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    startMsg.message_id,
                    undefined,
                    successMessage,
                    { parse_mode: 'Markdown' }
                );

                // Intentar enviar archivo generado
                await this.sendGeneratedExcelFile(ctx);
            }
        } catch (error) {
            const scriptData = this.runningScripts.get(userId);
            if (scriptData) {
                const elapsed = Math.floor((Date.now() - scriptData.startTime) / 1000);

                let errorMessage = '❌ *Error en exportación*\n\n';
                errorMessage += `⏱️ Tiempo transcurrido: ${elapsed}s\n`;
                errorMessage += `🔥 Error: ${(error as Error).message}\n`;

                if (errorOutput) {
                    errorMessage += `\n📋 Detalles:\n\`\`\`\n${errorOutput.slice(0, 500)}\`\`\``;
                }

                await ctx.telegram.editMessageText(
                    ctx.chat!.id,
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
     * Envía el archivo Excel más reciente generado
     */
    private async sendGeneratedExcelFile(ctx: Context): Promise<void> {
        try {
            const backupDir = path.join(this.scriptsPath, 'backup');
            const files = await fs.readdir(backupDir);

            // Buscar archivos Excel
            const excelFiles = files.filter(f => f.endsWith('.xlsx'));

            if (excelFiles.length === 0) {
                await ctx.reply('⚠️ No se encontró archivo Excel generado');
                return;
            }

            // Encontrar el archivo más reciente
            let latestFile: string | null = null;
            let latestTime = 0;

            for (const file of excelFiles) {
                const filePath = path.join(backupDir, file);
                const stats = await fs.stat(filePath);
                if (stats.mtime.getTime() > latestTime) {
                    latestTime = stats.mtime.getTime();
                    latestFile = file;
                }
            }

            if (latestFile) {
                const filePath = path.join(backupDir, latestFile);
                await ctx.replyWithDocument(
                    {
                        source: filePath,
                        filename: latestFile
                    },
                    {
                        caption: `📊 *Exportación Excel Completa*\n\n📅 Generado: ${new Date().toLocaleString('es-ES')}\n🔄 Estados actualizados: 3:00 AM`,
                        parse_mode: 'Markdown'
                    }
                );
            }
        } catch (error) {
            console.error('Error enviando archivo Excel:', error);
            await ctx.reply('❌ Error al enviar archivo Excel: ' + (error as Error).message);
        }
    }

    /**
     * Maneja la solicitud de limpieza automática - Primero muestra resumen previo
     */
    async handleAutoCleanup(ctx: Context): Promise<void> {
        const userId = ctx.from!.id;

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
            const preview = (await this.autoCleanupService.getCleanupPreview()) as any;

            if (preview.success) {
                // Construir mensaje de resumen previo
                let previewMessage = '📋 *RESUMEN PREVIO - LIMPIEZA AUTOMÁTICA*\n\n';
                previewMessage += '🔍 **Lo que se va a procesar:**\n\n';

                previewMessage += `🗑️ **Pólizas a eliminar automáticamente:** ${preview.preview.policiesToDelete}\n`;
                previewMessage += '   ↳ _Criterio: Estado ACTIVO con ≥2 servicios_\n\n';

                previewMessage += `⚠️ **Pólizas vencidas para reporte:** ${preview.preview.expiredPoliciesFound}\n`;
                previewMessage += '   ↳ _Criterio: Estado VENCIDA (solo se reportan)_\n\n';

                // Mostrar ejemplos si hay pólizas para eliminar
                if (preview.preview.examplePolicies.length > 0) {
                    previewMessage += '📝 **Ejemplos de pólizas a eliminar:**\n';
                    preview.preview.examplePolicies.forEach((pol: any, index: number) => {
                        if (index < 3) {
                            // Mostrar máximo 3 ejemplos
                            previewMessage += `   • ${pol.numeroPoliza} (${pol.titular}) - ${pol.servicios} servicios\n`;
                        }
                    });
                    if (preview.preview.policiesToDelete > 3) {
                        previewMessage += `   • ... y ${preview.preview.policiesToDelete - 3} más\n`;
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
                    ctx.chat!.id,
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
                    ctx.chat!.id,
                    startMsg.message_id,
                    undefined,
                    `❌ *Error al generar resumen*\n\n🔥 ${preview.error}`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            await ctx.telegram.editMessageText(
                ctx.chat!.id,
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
        const userId = ctx.from!.id;

        if (!this.runningScripts.has(userId)) {
            await ctx.answerCbQuery('⚠️ Sesión expirada, inicia nuevamente', { show_alert: true });
            return;
        }

        const sessionData = this.runningScripts.get(userId)!;
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
        const userId = ctx.from!.id;

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
     * Maneja la ejecución de validación de archivos
     */
    async handleFileValidation(ctx: Context): Promise<void> {
        const userId = ctx.from!.id;

        // Verificar si ya hay un script corriendo para este usuario
        if (this.runningScripts.has(userId)) {
            await ctx.answerCbQuery('⏳ Ya tienes un proceso en ejecución', { show_alert: true });
            return;
        }

        await ctx.answerCbQuery();

        try {
            const loadingMessage = await ctx.editMessageText(
                '🔄 *Iniciando Validación de Archivos*\n\n' +
                '📋 Analizando todas las pólizas...\n' +
                '📊 Verificando fotos y PDFs...\n' +
                '⏱️ Este proceso puede tardar varios minutos.',
                { parse_mode: 'Markdown' }
            );

            // Registrar script en ejecución
            this.runningScripts.set(userId, {
                scriptName: 'fileValidationReport.js',
                startTime: Date.now(),
                messageId: typeof loadingMessage === 'object' ? loadingMessage.message_id : 0
            });

            // Ejecutar script de validación
            await this.executeFileValidationScript(ctx, userId);
        } catch (error) {
            console.error('Error iniciando validación de archivos:', error);
            await ctx.editMessageText(
                '❌ *Error*\n\nNo se pudo iniciar la validación de archivos: ' + (error as Error).message,
                { parse_mode: 'Markdown' }
            );
            this.runningScripts.delete(userId);
        }
    }

    /**
     * Ejecuta el script de validación de archivos
     */
    private async executeFileValidationScript(ctx: Context, userId: number): Promise<void> {
        const scriptPath = path.join(this.scriptsPath, 'fileValidationReport.js');

        return new Promise((resolve, reject) => {
            const child = spawn('node', [scriptPath], {
                cwd: this.scriptsPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', async (code) => {
                this.runningScripts.delete(userId);

                if (code === 0) {
                    await this.sendFileValidationReport(ctx);
                    resolve();
                } else {
                    console.error('Script de validación falló:', stderr);
                    await ctx.editMessageText(
                        `❌ *Error en Validación*\n\nCódigo de salida: ${code}\n\`\`\`\n${stderr}\n\`\`\``,
                        { parse_mode: 'Markdown' }
                    );
                    reject(new Error(`Script falló con código ${code}`));
                }
            });

            child.on('error', async (error) => {
                this.runningScripts.delete(userId);
                console.error('Error ejecutando script de validación:', error);
                await ctx.editMessageText(
                    '❌ *Error Crítico*\n\nNo se pudo ejecutar el script de validación.',
                    { parse_mode: 'Markdown' }
                );
                reject(error);
            });

            // Timeout de 10 minutos
            setTimeout(() => {
                if (!child.killed) {
                    child.kill();
                    reject(new Error('Timeout en script de validación'));
                }
            }, 600000);
        });
    }

    /**
     * Envía el archivo Excel generado por la validación
     */
    private async sendFileValidationReport(ctx: Context): Promise<void> {
        try {
            const excelPath = path.join(this.scriptsPath, 'file-validation-report.xlsx');

            // Verificar que el archivo existe
            await fs.access(excelPath);

            await ctx.editMessageText(
                '✅ *Validación Completada*\n\n📎 Enviando reporte de archivos...',
                { parse_mode: 'Markdown' }
            );

            // Leer el archivo
            const fileBuffer = await fs.readFile(excelPath);
            const fileName = `validacion-archivos-${new Date().toISOString().split('T')[0]}.xlsx`;

            // Enviar archivo
            await ctx.replyWithDocument(
                {
                    source: fileBuffer,
                    filename: fileName
                },
                {
                    caption: 
                        '📋 *REPORTE SIMPLIFICADO - PÓLIZAS SIN FOTOS*\n\n' +
                        '📊 *Columnas del reporte:*\n' +
                        '• NUMERO\\_POLIZA\n' +
                        '• FOTOS \\(X = Sin fotos, ✓ = Con fotos\\)\n' +
                        '• PDF \\(X = Sin PDF, ✓ = Con PDF\\)\n\n' +
                        '🎯 *Solo aparecen pólizas SIN FOTOS:*\n' +
                        '🔴 Rojo: Sin fotos Y sin PDF\n' +
                        '🟠 Naranja: Sin fotos pero con PDF\n\n' +
                        '💡 *Objetivo: Saber exactamente qué pólizas necesitan fotos*\n\n' +
                        `📅 Generado: ${new Date().toLocaleString('es-MX')}`,
                    parse_mode: 'Markdown'
                }
            );

            // Limpiar archivo temporal
            await fs.unlink(excelPath).catch(() => {});

        } catch (error) {
            console.error('Error enviando reporte de validación:', error);
            await ctx.editMessageText(
                '❌ *Error*\n\nNo se pudo enviar el reporte de validación: ' + (error as Error).message,
                { parse_mode: 'Markdown' }
            );
        }
    }

    async handleAction(ctx: Context, action: string): Promise<void> {
        // Método requerido por la interfaz pero no implementado específicamente
        await ctx.answerCbQuery('Acción no implementada', { show_alert: true });
    }
}

export default SimpleScriptsHandler;
