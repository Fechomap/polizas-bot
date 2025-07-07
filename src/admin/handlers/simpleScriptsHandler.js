const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;

class SimpleScriptsHandler {
    constructor() {
        this.scriptsPath = path.join(__dirname, '../../../scripts');
        this.runningScripts = new Map(); // Track running scripts
    }

    /**
     * Maneja la ejecución de exportExcel.js
     */
    async handleExportExcel(ctx) {
        const userId = ctx.from.id;

        // Verificar si ya hay un script corriendo para este usuario
        if (this.runningScripts.has(userId)) {
            await ctx.reply('⚠️ Ya tienes un proceso de exportación ejecutándose. Espera a que termine.');
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

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            // Actualizar progreso cada 5 segundos
            const progressInterval = setInterval(async () => {
                const elapsed = Math.floor((Date.now() - this.runningScripts.get(userId).startTime) / 1000);
                try {
                    await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        startMsg.message_id,
                        undefined,
                        `📊 *Exportando a Excel*\n\n⏳ Tiempo transcurrido: ${elapsed}s\n💭 Procesando pólizas...`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (err) {
                    // Ignorar errores de edición de mensaje
                }
            }, 5000);

            // Esperar a que termine
            await new Promise((resolve, reject) => {
                child.on('close', (code) => {
                    clearInterval(progressInterval);
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Script salió con código ${code}`));
                    }
                });

                child.on('error', (err) => {
                    clearInterval(progressInterval);
                    reject(err);
                });
            });

            // Procesar resultado
            const elapsed = Math.floor((Date.now() - this.runningScripts.get(userId).startTime) / 1000);

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
                ctx.chat.id,
                startMsg.message_id,
                undefined,
                successMessage,
                { parse_mode: 'Markdown' }
            );

            // Intentar enviar archivo generado
            await this.sendGeneratedExcelFile(ctx);

        } catch (error) {
            const elapsed = Math.floor((Date.now() - this.runningScripts.get(userId).startTime) / 1000);

            let errorMessage = '❌ *Error en exportación*\n\n';
            errorMessage += `⏱️ Tiempo transcurrido: ${elapsed}s\n`;
            errorMessage += `🔥 Error: ${error.message}\n`;

            if (errorOutput) {
                errorMessage += `\n📋 Detalles:\n\`\`\`\n${errorOutput.slice(0, 500)}\`\`\``;
            }

            await ctx.telegram.editMessageText(
                ctx.chat.id,
                startMsg.message_id,
                undefined,
                errorMessage,
                { parse_mode: 'Markdown' }
            );

        } finally {
            // Limpiar estado
            this.runningScripts.delete(userId);
        }
    }

    /**
     * Envía el archivo Excel más reciente generado
     */
    async sendGeneratedExcelFile(ctx) {
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
            let latestFile = null;
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
                await ctx.replyWithDocument({
                    source: filePath,
                    filename: latestFile
                }, {
                    caption: `📊 *Exportación Excel Completa*\n\n📅 Generado: ${new Date().toLocaleString('es-ES')}\n🔄 Estados actualizados: 3:00 AM`,
                    parse_mode: 'Markdown'
                });
            }

        } catch (error) {
            console.error('Error enviando archivo Excel:', error);
            await ctx.reply('❌ Error al enviar archivo Excel: ' + error.message);
        }
    }
}

module.exports = SimpleScriptsHandler;
