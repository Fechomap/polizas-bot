// src/comandos/comandos/MediaUploadHandler.js
const BaseCommand = require('./BaseCommand');
const fetch = require('node-fetch');
const { getPolicyByNumber } = require('../../controllers/policyController');

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
        // Register the upload command
        this.bot.command('upload', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                this.handler.awaitingUploadPolicyNumber.set(chatId, true);
                await ctx.reply('📤 Por favor, ingresa el número de póliza para la cual deseas subir fotos o PDFs.');
                this.logInfo('Iniciando flujo de upload', { chatId });
            } catch (error) {
                this.logError('Error en comando upload:', error);
                await ctx.reply('❌ Error al iniciar upload. Intenta nuevamente.');
            }
        });

        // Register photo handler
        this.bot.on('photo', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const numeroPoliza = this.uploadTargets.get(chatId);
        
                if (!numeroPoliza) {
                    return await ctx.reply('⚠️ Primero usa /upload y proporciona el número de póliza.');
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
        
                // Create file object directly
                const fileObject = {
                    data: buffer,
                    contentType: 'image/jpeg'
                };
        
                // Find the policy and update
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
        
                // Initialize files if it doesn't exist
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [] };
                }
        
                // Add the photo
                policy.archivos.fotos.push(fileObject);
        
                // Save
                await policy.save();
        
                await ctx.reply('✅ Foto guardada correctamente.');
                this.logInfo('Foto guardada', { numeroPoliza });
            } catch (error) {
                this.logError('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto.');
            } finally {
                this.uploadTargets.delete(ctx.chat.id);
            }
        });
        
        // Register document handler
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const numeroPoliza = this.uploadTargets.get(chatId);
        
                if (!numeroPoliza) {
                    return await ctx.reply('⚠️ Primero usa /upload y proporciona el número de póliza.');
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
        
                // Create file object directly
                const fileObject = {
                    data: buffer,
                    contentType: 'application/pdf'
                };
        
                // Find the policy and update
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
        
                // Initialize files if it doesn't exist
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [] };
                }
        
                // Add the PDF
                policy.archivos.pdfs.push(fileObject);
        
                // Save
                await policy.save();
        
                await ctx.reply('✅ PDF guardado correctamente.');
                this.logInfo('PDF guardado', { numeroPoliza });
            } catch (error) {
                this.logError('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento.');
            } finally {
                this.uploadTargets.delete(ctx.chat.id);
            }
        });
    }

    // Function that handles the user's response with the policy number
    async handleUploadFlow(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            this.logInfo('Iniciando upload para póliza:', { numeroPoliza });

            // Check if the policy exists
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
                return;
            }

            // Save in a Map which policy this chat is using
            this.uploadTargets.set(chatId, numeroPoliza);

            // Tell the user they can upload files
            await ctx.reply(
                `📤 *Subida de Archivos - Póliza ${numeroPoliza}*\n\n` +
                `📸 Puedes enviar múltiples fotos.\n` +
                `📄 También puedes enviar archivos PDF.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            this.logError('Error en handleUploadFlow:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
        } finally {
            // Remove the "awaiting" state for the policy number
            this.handler.awaitingUploadPolicyNumber.delete(chatId);
        }
    }
}

module.exports = MediaUploadHandler;
