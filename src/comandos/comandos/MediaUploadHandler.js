// src/comandos/comandos/MediaUploadHandler.js
const BaseCommand = require('./BaseCommand');
const fetch = require('node-fetch');
const { getPolicyByNumber } = require('../../controllers/policyController');
const { getInstance } = require('../../services/CloudflareStorage');
const StateKeyManager = require('../../utils/StateKeyManager');

class MediaUploadHandler extends BaseCommand {
    constructor(handler) {
        super(handler);
        this.uploadTargets = handler.uploadTargets;
    }

    getCommandName() {
        return 'mediaUpload';
    }

    getDescription() {
        return 'Manejador de subida de fotos y documentos';
    }

    register() {
        // No longer registering the /upload command.
        // The flow is initiated by 'accion:upload' in CommandHandler.
        this.logInfo(`Comando ${this.getCommandName()} cargado, registrando manejadores de 'photo' y 'document'.`);

        // Register photo handler
        this.bot.on('photo', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.uploadTargets.get(chatId, threadId);

                if (!numeroPoliza) {
                    // Guide user to the button flow if state is missing
                    return await ctx.reply('⚠️ Para subir archivos, primero selecciona la opción "Subir Archivos" en el menú principal e indica el número de póliza.');
                }

                // Take the photo in maximum resolution
                const photos = ctx.message.photo;
                const highestResPhoto = photos[photos.length - 1];
                const fileId = highestResPhoto.file_id;

                // Download file
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink.href);
                if (!response.ok) throw new Error('Falló la descarga de la foto');
                const buffer = await response.buffer();

                // Subir foto a Cloudflare R2
                const storage = getInstance();
                const originalName = `foto_${Date.now()}.jpg`;
                const uploadResult = await storage.uploadPolicyPhoto(buffer, numeroPoliza, originalName);

                // Crear objeto de archivo R2
                const r2FileObject = {
                    url: uploadResult.url,
                    key: uploadResult.key,
                    size: uploadResult.size,
                    contentType: uploadResult.contentType,
                    uploadedAt: new Date(),
                    originalName: originalName
                };

                // Find the policy and update
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }

                // Initialize files if it doesn't exist
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
                }
                if (!policy.archivos.r2Files) {
                    policy.archivos.r2Files = { fotos: [], pdfs: [] };
                }

                // Add the photo to R2 files
                policy.archivos.r2Files.fotos.push(r2FileObject);

                // Save
                await policy.save();

                await ctx.reply('✅ Foto guardada correctamente en almacenamiento seguro.');
                this.logInfo('Foto guardada', { numeroPoliza });
                // No limpiar uploadTargets aquí, permitir subir múltiples archivos
                // this.uploadTargets.delete(ctx.chat.id, threadId);
            } catch (error) {
                this.logError('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto.');
                // Considerar limpiar estado en error
                const threadId = StateKeyManager.getThreadId(ctx);
                this.uploadTargets.delete(ctx.chat.id, threadId);
            }
        });

        // Register document handler
        this.bot.on('document', async (ctx, next) => { // Added 'next' parameter
            try {
                const chatId = ctx.chat.id;

                // NUEVO: Verificar si estamos esperando un Excel para registro
                const excelUploadCmd = this.handler.registry.getCommand('excelUpload');
                if (excelUploadCmd && typeof excelUploadCmd.awaitingExcelUpload?.get === 'function' &&
                    excelUploadCmd.awaitingExcelUpload.get(chatId)) {
                    // Si estamos esperando un Excel, no procesamos aquí, dejamos que lo maneje ExcelUploadHandler
                    this.logInfo('Documento recibido, pero estamos en flujo de carga Excel. Pasando a ExcelUploadHandler', { chatId }); // Log updated
                    return next(); // Call next() to pass control
                }

                const threadId = StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.uploadTargets.get(chatId, threadId);

                if (!numeroPoliza) {
                    return await ctx.reply('⚠️ Para subir archivos, primero selecciona la opción "Subir Archivos" en el menú principal e indica el número de póliza.');
                }

                const { mime_type: mimeType = '' } = ctx.message.document || {};
                if (!mimeType.includes('pdf')) {
                    return await ctx.reply('⚠️ Solo se permiten documentos PDF.');
                }

                // Download file
                const fileId = ctx.message.document.file_id;
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink.href);
                if (!response.ok) throw new Error('Falló la descarga del documento');
                const buffer = await response.buffer();

                // Subir PDF a Cloudflare R2
                const storage = getInstance();
                const originalName = ctx.message.document.file_name || `documento_${Date.now()}.pdf`;
                const uploadResult = await storage.uploadPolicyPDF(buffer, numeroPoliza, originalName);

                // Crear objeto de archivo R2
                const r2FileObject = {
                    url: uploadResult.url,
                    key: uploadResult.key,
                    size: uploadResult.size,
                    contentType: uploadResult.contentType,
                    uploadedAt: new Date(),
                    originalName: originalName
                };

                // Find the policy and update
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }

                // Initialize files if it doesn't exist
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
                }
                if (!policy.archivos.r2Files) {
                    policy.archivos.r2Files = { fotos: [], pdfs: [] };
                }

                // Add the PDF to R2 files
                policy.archivos.r2Files.pdfs.push(r2FileObject);

                // Save
                await policy.save();

                await ctx.reply('✅ PDF guardado correctamente en almacenamiento seguro.');
                this.logInfo('PDF guardado', { numeroPoliza });
                // No limpiar uploadTargets aquí, permitir subir múltiples archivos
                // this.uploadTargets.delete(ctx.chat.id, threadId);
            } catch (error) {
                this.logError('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento.');
                // Considerar limpiar estado en error
                const threadId = StateKeyManager.getThreadId(ctx);
                this.uploadTargets.delete(ctx.chat.id, threadId);
            }
        });
    }

    // Removed handleUploadFlow method as it's now handled in CommandHandler.js
}

module.exports = MediaUploadHandler;
