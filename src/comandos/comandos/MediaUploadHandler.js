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
        this.logInfo(
            `Comando ${this.getCommandName()} cargado, registrando manejadores de 'photo' y 'document'.`
        );

        // Register photo handler
        this.bot.on('photo', async ctx => {
            try {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.uploadTargets.get(chatId, threadId);

                if (!numeroPoliza) {
                    // No hay contexto de subida activo - IGNORAR SILENCIOSAMENTE
                    return; // No responder nada, ni logs
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
                const uploadResult = await storage.uploadPolicyPhoto(
                    buffer,
                    numeroPoliza,
                    originalName
                );

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
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.uploadTargets.get(chatId, threadId);
                
                // Solo responder si estamos en contexto de subida válido
                if (numeroPoliza) {
                    this.logError('Error al procesar foto:', error);
                    await ctx.reply('❌ Error al procesar la foto.');
                    this.uploadTargets.delete(chatId, threadId);
                }
                // Si no hay contexto válido, no responder nada (silencioso)
            }
        });

        // Document handling is now done by DocumentHandler to avoid conflicts
    }

    // Removed handleUploadFlow method as it's now handled in CommandHandler.js
}

module.exports = MediaUploadHandler;
