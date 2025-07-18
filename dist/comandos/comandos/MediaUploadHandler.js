"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaUploadHandler = void 0;
const BaseCommand_1 = require("./BaseCommand");
const policyController_1 = require("../../controllers/policyController");
const CloudflareStorage_1 = require("../../services/CloudflareStorage");
const StateKeyManager_1 = require("../../utils/StateKeyManager");
class MediaUploadHandler extends BaseCommand_1.BaseCommand {
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
        this.logInfo(`Comando ${this.getCommandName()} cargado, registrando manejadores de 'photo' y 'document'.`);
        this.bot.on('photo', async (ctx, next) => {
            try {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.uploadTargets.get(chatId, threadId);
                if (!numeroPoliza) {
                    return next();
                }
                const photos = ctx.message.photo;
                const highestResPhoto = photos[photos.length - 1];
                const fileId = highestResPhoto.file_id;
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink.href);
                if (!response.ok)
                    throw new Error('Falló la descarga de la foto');
                const buffer = await response.arrayBuffer();
                const storage = (0, CloudflareStorage_1.getInstance)();
                const originalName = `foto_${Date.now()}.jpg`;
                const uploadResult = await storage.uploadPolicyPhoto(Buffer.from(buffer), numeroPoliza, originalName);
                const r2FileObject = {
                    url: uploadResult.url,
                    key: uploadResult.key,
                    size: uploadResult.size,
                    contentType: uploadResult.contentType,
                    uploadDate: new Date(),
                    originalName: originalName
                };
                const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
                }
                if (!policy.archivos.r2Files) {
                    policy.archivos.r2Files = { fotos: [], pdfs: [] };
                }
                policy.archivos.r2Files.fotos.push(r2FileObject);
                await policy.save();
                await ctx.reply('✅ Foto guardada correctamente en almacenamiento seguro.');
                this.logInfo('Foto guardada', { numeroPoliza });
            }
            catch (error) {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.uploadTargets.get(chatId, threadId);
                if (numeroPoliza) {
                    this.logError('Error al procesar foto:', error);
                    await ctx.reply('❌ Error al procesar la foto.');
                    this.uploadTargets.delete(chatId, threadId);
                }
                else {
                    return next();
                }
            }
        });
    }
}
exports.MediaUploadHandler = MediaUploadHandler;
