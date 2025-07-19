// src/comandos/comandos/MediaUploadHandler.ts
import { BaseCommand } from './BaseCommand';
import { getPolicyByNumber } from '../../controllers/policyController';
import { getInstance } from '../../services/CloudflareStorage';
import StateKeyManager from '../../utils/StateKeyManager';
import type { IContextBot, IR2File } from '../../../types/index';

interface IUploadTargets {
    get(chatId: number, threadId?: string): string | undefined;
    set(chatId: number, threadId: string | undefined, numeroPoliza: string): void;
    delete(chatId: number, threadId?: string): boolean;
}

class MediaUploadHandler extends BaseCommand {
    private uploadTargets: IUploadTargets;

    constructor(handler: any) {
        super(handler);
        this.uploadTargets = handler.uploadTargets;
    }

    getCommandName(): string {
        return 'mediaUpload';
    }

    getDescription(): string {
        return 'Manejador de subida de fotos y documentos';
    }

    register(): void {
        // No longer registering the /upload command.
        // The flow is initiated by 'accion:upload' in CommandHandler.
        this.logInfo(
            `Comando ${this.getCommandName()} cargado, registrando manejadores de 'photo' y 'document'.`
        );

        // Register photo handler
        this.bot.on('photo', async (ctx: IContextBot, next: () => Promise<void>) => {
            try {
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdStr = threadId ? String(threadId) : '';
                const numeroPoliza = this.uploadTargets.get(chatId, threadIdStr);

                if (!numeroPoliza) {
                    // No hay contexto de subida activo - PASAR AL SIGUIENTE HANDLER
                    return next();
                }

                // Take the photo in maximum resolution
                const photos = ctx.message!.photo!;
                const highestResPhoto = photos[photos.length - 1];
                const fileId = highestResPhoto.file_id;

                // Download file
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink.href);
                if (!response.ok) throw new Error('Falló la descarga de la foto');
                const buffer = await response.arrayBuffer();

                // Subir foto a Cloudflare R2
                const storage = getInstance();
                const originalName = `foto_${Date.now()}.jpg`;
                const uploadResult = await storage.uploadPolicyPhoto(
                    Buffer.from(buffer),
                    numeroPoliza,
                    originalName
                );

                // Crear objeto de archivo R2
                const r2FileObject: IR2File = {
                    url: uploadResult.url,
                    key: uploadResult.key,
                    size: uploadResult.size,
                    contentType: uploadResult.contentType,
                    uploadDate: new Date(),
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
            } catch (error: any) {
                const chatId = ctx.chat!.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdStr = threadId ? String(threadId) : '';
                const numeroPoliza = this.uploadTargets.get(chatId, threadIdStr);

                // Solo responder si estamos en contexto de subida válido
                if (numeroPoliza) {
                    this.logError('Error al procesar foto:', error);
                    await ctx.reply('❌ Error al procesar la foto.');
                    this.uploadTargets.delete(chatId, threadIdStr);
                } else {
                    // Si no hay contexto válido, pasar al siguiente handler
                    return next();
                }
            }
        });

        // Document handling is now done by DocumentHandler to avoid conflicts
    }

    // Removed handleUploadFlow method as it's now handled in CommandHandler.js
}

export default MediaUploadHandler;
