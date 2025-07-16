// src/comandos/documentHandler.js
const logger = require('../../utils/logger');
const fetch = require('node-fetch');
const { getPolicyByNumber } = require('../../controllers/policyController');
const XLSX = require('xlsx');
const { Markup } = require('telegraf');
const StateKeyManager = require('../../utils/StateKeyManager');
const { getInstance } = require('../../services/CloudflareStorage');

/**
 * Clase para manejar todos los documentos (PDFs y Excel) en un solo lugar
 * y evitar conflictos entre manejadores
 */
class DocumentHandler {
    constructor(bot, commandHandler) {
        this.bot = bot;
        this.handler = commandHandler;
        this.excelUploadHandler = null;
        this.mediaUploadHandler = null;
    }

    setHandlers(excelUploadHandler, mediaUploadHandler) {
        this.excelUploadHandler = excelUploadHandler;
        this.mediaUploadHandler = mediaUploadHandler;
    }

    register() {
        // Un único manejador de documentos que decide qué hacer basado en el contexto
        this.bot.on('document', async ctx => {
            try {
                const chatId = ctx.chat.id;
                const documentInfo = ctx.message.document || {};
                const fileName = documentInfo.file_name || '';
                const mimeType = documentInfo.mime_type || '';
                const fileSize = documentInfo.file_size || 0;

                logger.info(`Documento recibido: ${fileName} (${mimeType}, ${fileSize} bytes)`, {
                    chatId
                });

                // PASO 1: Verificar si estamos esperando un Excel para registro de pólizas
                if (
                    this.excelUploadHandler &&
                    this.excelUploadHandler.awaitingExcelUpload &&
                    this.excelUploadHandler.awaitingExcelUpload.get(chatId)
                ) {
                    logger.info('Decidiendo procesar como Excel para registro de pólizas', {
                        chatId
                    });

                    // Verificar que sea un archivo Excel
                    if (!this.isExcelFile(mimeType, fileName)) {
                        logger.info(`Archivo rechazado, no es Excel: ${fileName} (${mimeType})`, {
                            chatId
                        });
                        return await ctx.reply(
                            '⚠️ El archivo debe ser Excel (.xlsx, .xls). Por favor, sube un archivo válido.'
                        );
                    }

                    await this.processExcelUpload(ctx);
                    return;
                }

                // PASO 2: Verificar si estamos esperando un PDF para una póliza
                const threadId = StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.handler.uploadTargets.get(chatId, threadId);
                if (numeroPoliza) {
                    logger.info(`Decidiendo procesar como PDF para póliza ${numeroPoliza}`, {
                        chatId
                    });

                    if (!mimeType.includes('pdf')) {
                        return await ctx.reply('⚠️ Solo se permiten documentos PDF.');
                    }

                    await this.processPdfUpload(ctx, numeroPoliza);
                    return;
                }

                // PASO 3: No estamos esperando ningún documento - IGNORAR SILENCIOSAMENTE
                // No responder nada - el bot simplemente ignora el archivo
            } catch (error) {
                // Solo mostrar error si estamos en un contexto válido
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const numeroPoliza = this.handler.uploadTargets.get(chatId, threadId);
                const esperandoExcel = this.excelUploadHandler?.awaitingExcelUpload?.get(chatId);

                if (numeroPoliza || esperandoExcel) {
                    logger.error('Error al procesar documento:', error);
                    await ctx.reply('❌ Error al procesar el documento.');
                }
                // Si no hay contexto válido, no responder nada (silencioso)
            }
        });

        logger.info('✅ Manejador unificado de documentos registrado');
    }

    // Método para procesar la subida de Excel
    async processExcelUpload(ctx) {
        if (!this.excelUploadHandler) {
            logger.error('ExcelUploadHandler no disponible');
            return await ctx.reply('❌ Error interno: Manejador de Excel no disponible');
        }

        const chatId = ctx.chat.id;

        try {
            // Mostrar mensaje de procesamiento
            logger.info('Procesando archivo Excel', { chatId });
            const waitMsg = await ctx.reply('🔄 Descargando y procesando archivo Excel...');

            // Descargar el archivo
            const fileId = ctx.message.document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);

            logger.info(`Descargando Excel desde: ${fileLink.href}`, { chatId });

            // Llamar al método de procesamiento en el ExcelUploadHandler
            const result = await this.excelUploadHandler.processExcelFile(fileLink.href, ctx);

            // Actualizar mensaje de espera
            try {
                await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
            } catch (err) {
                logger.error('Error al eliminar mensaje de espera:', err);
            }

            // Ya no estamos esperando Excel
            this.excelUploadHandler.awaitingExcelUpload.delete(chatId);

            // Eliminar el mensaje con el botón "Cancelar Registro"
            if (this.handler.excelUploadMessages && this.handler.excelUploadMessages.has(chatId)) {
                try {
                    const messageIdToDelete = this.handler.excelUploadMessages.get(chatId);
                    await ctx.telegram.deleteMessage(chatId, messageIdToDelete);
                    this.handler.excelUploadMessages.delete(chatId);
                    logger.info(`Mensaje con botón "Cancelar Registro" eliminado para chat ${chatId}`);
                } catch (err) {
                    logger.error('Error al eliminar mensaje con botón "Cancelar Registro":', err);
                }
            }

            // Limpiar otros estados posibles
            const threadId = StateKeyManager.getThreadId(ctx);
            this.handler.clearChatState(chatId, threadId);

            // Mostrar botón para volver al menú
            await ctx.reply(
                'Selecciona una opción:',
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu'),
                    Markup.button.callback('📊 Registrar otro Excel', 'accion:registrar')
                ])
            );
        } catch (error) {
            logger.error('Error al procesar Excel:', error);
            await ctx.reply('❌ Error al procesar el archivo Excel. Detalles: ' + error.message);

            // Limpiar estado en caso de error
            const threadId = StateKeyManager.getThreadId(ctx);
            this.excelUploadHandler.awaitingExcelUpload.delete(chatId);
            this.handler.clearChatState(chatId, threadId);

            // Limpiar también el message_id almacenado en caso de error
            if (this.handler.excelUploadMessages) {
                this.handler.excelUploadMessages.delete(chatId);
            }
        }
    }

    // Método para procesar la subida de PDF
    async processPdfUpload(ctx, numeroPoliza) {
        try {
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
            logger.info('PDF guardado', { numeroPoliza });
        } catch (error) {
            logger.error('Error al procesar PDF:', error);
            await ctx.reply('❌ Error al procesar el documento PDF.');
            // Considerar limpiar estado en error
            const threadId = StateKeyManager.getThreadId(ctx);
            this.handler.uploadTargets.delete(ctx.chat.id, threadId);
        }
    }

    // Verificar si es un archivo Excel
    isExcelFile(mimeType, fileName) {
        logger.info(`Verificando si es Excel: ${fileName} (${mimeType})`);

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

        const isExcelExtension =
            fileName.toLowerCase().endsWith('.xlsx') ||
            fileName.toLowerCase().endsWith('.xls') ||
            fileName.toLowerCase().endsWith('.xlsm');

        const isExcelMimeType = validMimeTypes.includes(mimeType);

        return isExcelExtension || isExcelMimeType;
    }
}

module.exports = DocumentHandler;
