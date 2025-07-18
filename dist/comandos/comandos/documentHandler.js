"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const logger_1 = __importDefault(require("../../utils/logger"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const policyController_1 = require("../../controllers/policyController");
const StateKeyManager_1 = require("../../utils/StateKeyManager");
const CloudflareStorage_1 = require("../../services/CloudflareStorage");
class DocumentHandler {
    constructor(bot, commandHandler) {
        this.excelUploadHandler = null;
        this.mediaUploadHandler = null;
        this.bot = bot;
        this.handler = commandHandler;
    }
    setHandlers(excelUploadHandler, mediaUploadHandler) {
        this.excelUploadHandler = excelUploadHandler;
        this.mediaUploadHandler = mediaUploadHandler;
    }
    register() {
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const documentInfo = ctx.message?.document || {};
                const fileName = documentInfo.file_name || '';
                const mimeType = documentInfo.mime_type || '';
                const fileSize = documentInfo.file_size || 0;
                logger_1.default.info(`Documento recibido: ${fileName} (${mimeType}, ${fileSize} bytes)`, {
                    chatId
                });
                if (this.excelUploadHandler &&
                    this.excelUploadHandler.awaitingExcelUpload &&
                    this.excelUploadHandler.awaitingExcelUpload.get(chatId)) {
                    logger_1.default.info('Decidiendo procesar como Excel para registro de pólizas', {
                        chatId
                    });
                    if (!this.isExcelFile(mimeType, fileName)) {
                        logger_1.default.info(`Archivo rechazado, no es Excel: ${fileName} (${mimeType})`, {
                            chatId
                        });
                        return await ctx.reply('⚠️ El archivo debe ser Excel (.xlsx, .xls). Por favor, sube un archivo válido.');
                    }
                    await this.processExcelUpload(ctx);
                    return;
                }
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.handler.uploadTargets.get(chatId, threadId);
                if (numeroPoliza) {
                    logger_1.default.info(`Decidiendo procesar como PDF para póliza ${numeroPoliza}`, {
                        chatId
                    });
                    if (!mimeType.includes('pdf')) {
                        return await ctx.reply('⚠️ Solo se permiten documentos PDF.');
                    }
                    await this.processPdfUpload(ctx, numeroPoliza);
                    return;
                }
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');
                if (baseAutosCommand &&
                    typeof baseAutosCommand.procesarDocumentoBaseAutos === 'function') {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarDocumentoBaseAutos(ctx.message, ctx.from.id.toString());
                    if (procesadoPorBaseAutos) {
                        logger_1.default.info('Documento procesado por Base de Autos', {
                            chatId,
                            fileName: ctx.message?.document?.file_name
                        });
                        return;
                    }
                }
            }
            catch (error) {
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.handler.uploadTargets.get(chatId, threadId);
                const esperandoExcel = this.excelUploadHandler?.awaitingExcelUpload?.get(chatId);
                if (numeroPoliza || esperandoExcel) {
                    logger_1.default.error('Error al procesar documento:', error);
                    await ctx.reply('❌ Error al procesar el documento.');
                }
            }
        });
        logger_1.default.info('✅ Manejador unificado de documentos registrado');
    }
    async processExcelUpload(ctx) {
        if (!this.excelUploadHandler) {
            logger_1.default.error('ExcelUploadHandler no disponible');
            return await ctx.reply('❌ Error interno: Manejador de Excel no disponible');
        }
        const chatId = ctx.chat.id;
        try {
            logger_1.default.info('Procesando archivo Excel', { chatId });
            const waitMsg = await ctx.reply('🔄 Descargando y procesando archivo Excel...');
            const fileId = ctx.message.document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            logger_1.default.info(`Descargando Excel desde: ${fileLink.href}`, { chatId });
            const result = await this.excelUploadHandler.processExcelFile(fileLink.href, ctx);
            try {
                await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
            }
            catch (err) {
                logger_1.default.error('Error al eliminar mensaje de espera:', err);
            }
            this.excelUploadHandler.awaitingExcelUpload.delete(chatId);
            if (this.handler.excelUploadMessages && this.handler.excelUploadMessages.has(chatId)) {
                try {
                    const messageIdToDelete = this.handler.excelUploadMessages.get(chatId);
                    if (messageIdToDelete) {
                        await ctx.telegram.deleteMessage(chatId, messageIdToDelete);
                        this.handler.excelUploadMessages.delete(chatId);
                        logger_1.default.info(`Mensaje con botón "Cancelar Registro" eliminado para chat ${chatId}`);
                    }
                }
                catch (err) {
                    logger_1.default.error('Error al eliminar mensaje con botón "Cancelar Registro":', err);
                }
            }
            const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
            this.handler.clearChatState(chatId, threadId);
            await ctx.reply('Selecciona una opción:', telegraf_1.Markup.inlineKeyboard([
                telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu'),
                telegraf_1.Markup.button.callback('📊 Registrar otro Excel', 'accion:registrar')
            ]));
        }
        catch (error) {
            logger_1.default.error('Error al procesar Excel:', error);
            await ctx.reply('❌ Error al procesar el archivo Excel. Detalles: ' + error.message);
            const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
            this.excelUploadHandler.awaitingExcelUpload.delete(chatId);
            this.handler.clearChatState(chatId, threadId);
            if (this.handler.excelUploadMessages) {
                this.handler.excelUploadMessages.delete(chatId);
            }
        }
    }
    async processPdfUpload(ctx, numeroPoliza) {
        try {
            console.log('FLUJO NORMAL - Documento recibido:', {
                file_id: ctx.message.document.file_id,
                file_name: ctx.message.document.file_name,
                file_size: ctx.message.document.file_size,
                mime_type: ctx.message.document.mime_type,
                file_unique_id: ctx.message.document.file_unique_id
            });
            const fileId = ctx.message.document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await (0, node_fetch_1.default)(fileLink.href);
            console.log('FLUJO NORMAL - Response status:', response.status);
            console.log('FLUJO NORMAL - Response headers:', response.headers.raw());
            if (!response.ok)
                throw new Error('Falló la descarga del documento');
            const buffer = await response.buffer();
            console.log('FLUJO NORMAL - Buffer length:', buffer.length);
            console.log('FLUJO NORMAL - Buffer primeros 100 bytes:', buffer.slice(0, 100).toString('hex'));
            const storage = (0, CloudflareStorage_1.getInstance)();
            const originalName = ctx.message.document.file_name || `documento_${Date.now()}.pdf`;
            const uploadResult = await storage.uploadPolicyPDF(buffer, numeroPoliza, originalName);
            const r2FileObject = {
                url: uploadResult.url,
                key: uploadResult.key,
                size: uploadResult.size,
                contentType: uploadResult.contentType,
                uploadedAt: new Date(),
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
            policy.archivos.r2Files.pdfs.push(r2FileObject);
            await policy.save();
            await ctx.reply('✅ PDF guardado correctamente en almacenamiento seguro.');
            logger_1.default.info('PDF guardado', { numeroPoliza });
        }
        catch (error) {
            logger_1.default.error('Error al procesar PDF:', error);
            await ctx.reply('❌ Error al procesar el documento PDF.');
            const threadId = StateKeyManager_1.StateKeyManager.getThreadId(ctx);
            this.handler.uploadTargets.delete(ctx.chat.id, threadId);
        }
    }
    isExcelFile(mimeType, fileName) {
        logger_1.default.info(`Verificando si es Excel: ${fileName} (${mimeType})`);
        const validMimeTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream',
            'application/msexcel',
            'application/x-msexcel',
            'application/excel',
            'application/x-excel',
            'application/x-dos_ms_excel',
            'application/xls'
        ];
        const isExcelExtension = fileName.toLowerCase().endsWith('.xlsx') ||
            fileName.toLowerCase().endsWith('.xls') ||
            fileName.toLowerCase().endsWith('.xlsm');
        const isExcelMimeType = validMimeTypes.includes(mimeType);
        return isExcelExtension || isExcelMimeType;
    }
}
exports.default = DocumentHandler;
