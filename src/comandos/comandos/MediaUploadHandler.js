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
        // No longer registering the /upload command.
        // The flow is initiated by 'accion:upload' in CommandHandler.
        this.logInfo(`Comando ${this.getCommandName()} cargado, registrando manejadores de 'photo' y 'document'.`);

        // Register photo handler
        this.bot.on('photo', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const numeroPoliza = this.uploadTargets.get(chatId);

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
                // No limpiar uploadTargets aquí, permitir subir múltiples archivos
                // this.uploadTargets.delete(ctx.chat.id);
            } catch (error) {
                this.logError('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto.');
                // Considerar limpiar estado en error
                 this.uploadTargets.delete(ctx.chat.id);
            }
        });

        // Register document handler
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const numeroPoliza = this.uploadTargets.get(chatId);

                if (!numeroPoliza) {
                     // Guide user to the button flow
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
                 // No limpiar uploadTargets aquí, permitir subir múltiples archivos
                 // this.uploadTargets.delete(ctx.chat.id);
            } catch (error) {
                this.logError('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento.');
                 // Considerar limpiar estado en error
                 this.uploadTargets.delete(ctx.chat.id);
            }
        });
    }

    // Removed handleUploadFlow method as it's now handled in CommandHandler.js
}

module.exports = MediaUploadHandler;
