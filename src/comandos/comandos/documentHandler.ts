import { Context, Markup, Telegraf } from 'telegraf';
import { Document, Message } from 'telegraf/typings/core/types/typegram';
import logger from '../../utils/logger';
import fetch from 'node-fetch';
import { getPolicyByNumber } from '../../controllers/policyController';
import StateKeyManager from '../../utils/StateKeyManager';
import { getInstance } from '../../services/CloudflareStorage';
import { IPolicy, IR2FileObject, IR2File } from '../../types/database';
import Policy from '../../models/policy';

interface IExcelUploadHandler {
    awaitingExcelUpload: Map<number, boolean>;
    processExcelFile(fileUrl: string, ctx: Context): Promise<any>;
}

interface IMediaUploadHandler {
    // Add interface methods as needed
}

interface ICommandHandler {
    uploadTargets: {
        get(chatId: number, threadId: string): string | undefined;
        delete(chatId: number, threadId: string): void;
    };
    excelUploadMessages?: Map<number, number>;
    clearChatState(chatId: number, threadId: string): void;
    registry: {
        getAllCommands(): Array<{
            getCommandName(): string;
            procesarDocumentoBaseAutos?(message: Message, userId: string): Promise<boolean>;
        }>;
    };
}

class DocumentHandler {
    private bot: Telegraf;
    private handler: ICommandHandler;
    private excelUploadHandler: IExcelUploadHandler | null = null;
    private mediaUploadHandler: IMediaUploadHandler | null = null;

    constructor(bot: Telegraf, commandHandler: ICommandHandler) {
        this.bot = bot;
        this.handler = commandHandler;
    }

    setHandlers(
        excelUploadHandler: IExcelUploadHandler,
        mediaUploadHandler: IMediaUploadHandler
    ): void {
        this.excelUploadHandler = excelUploadHandler;
        this.mediaUploadHandler = mediaUploadHandler;
    }

    register(): void {
        this.bot.on('document', async (ctx: Context) => {
            try {
                if (!ctx.chat) return;
                const chatId = ctx.chat.id;
                const documentInfo = (ctx.message as any)?.document || {};
                const fileName = documentInfo.file_name || '';
                const mimeType = documentInfo.mime_type || '';
                const fileSize = documentInfo.file_size || 0;

                logger.info(`Documento recibido: ${fileName} (${mimeType}, ${fileSize} bytes)`, {
                    chatId
                });

                // PASO 1: Verificar si estamos esperando un Excel para registro de pólizas
                if (this.excelUploadHandler?.awaitingExcelUpload?.get(chatId)) {
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
                const threadIdStr = threadId ? String(threadId) : '';
                const numeroPoliza = this.handler.uploadTargets.get(chatId, threadIdStr);
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

                // PASO 3: Verificar si estamos en flujo de Base de Autos
                const baseAutosCommand = this.handler.registry
                    .getAllCommands()
                    .find(cmd => cmd.getCommandName() === 'base_autos');

                if (
                    baseAutosCommand &&
                    typeof baseAutosCommand.procesarDocumentoBaseAutos === 'function'
                ) {
                    const procesadoPorBaseAutos = await baseAutosCommand.procesarDocumentoBaseAutos(
                        ctx.message as Message,
                        ctx.from!.id.toString()
                    );

                    if (procesadoPorBaseAutos) {
                        logger.info('Documento procesado por Base de Autos', {
                            chatId,
                            fileName: (ctx.message as any)?.document?.file_name
                        });
                        return;
                    }
                }

                // PASO 4: No estamos esperando ningún documento - IGNORAR SILENCIOSAMENTE
                // No responder nada - el bot simplemente ignora el archivo
                return;
            } catch (error) {
                // Solo mostrar error si estamos en un contexto válido
                if (!ctx.chat) return;
                const chatId = ctx.chat.id;
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdStr = threadId ? String(threadId) : '';
                const numeroPoliza = this.handler.uploadTargets.get(chatId, threadIdStr);
                const esperandoExcel = this.excelUploadHandler?.awaitingExcelUpload?.get(chatId);

                if (numeroPoliza || esperandoExcel) {
                    logger.error('Error al procesar documento:', error);
                    await ctx.reply('❌ Error al procesar el documento.');
                }
                // Si no hay contexto válido, no responder nada (silencioso)
                return; // Explicit return to ensure all code paths return a value
            }
        });

        logger.info('✅ Manejador unificado de documentos registrado');
    }

    private async processExcelUpload(ctx: Context): Promise<void> {
        if (!this.excelUploadHandler) {
            logger.error('ExcelUploadHandler no disponible');
            await ctx.reply('❌ Error interno: Manejador de Excel no disponible');
            return;
        }

        if (!ctx.chat) return;
        const chatId = ctx.chat.id;

        try {
            // Mostrar mensaje de procesamiento
            logger.info('Procesando archivo Excel', { chatId });
            const waitMsg = await ctx.reply('🔄 Descargando y procesando archivo Excel...');

            // Descargar el archivo
            const fileId = (ctx.message as any).document.file_id;
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
            if (this.handler.excelUploadMessages?.has(chatId)) {
                try {
                    const messageIdToDelete = this.handler.excelUploadMessages.get(chatId);
                    if (messageIdToDelete) {
                        await ctx.telegram.deleteMessage(chatId, messageIdToDelete);
                        this.handler.excelUploadMessages.delete(chatId);
                        logger.info(
                            `Mensaje con botón "Cancelar Registro" eliminado para chat ${chatId}`
                        );
                    }
                } catch (err) {
                    logger.error('Error al eliminar mensaje con botón "Cancelar Registro":', err);
                }
            }

            // Limpiar otros estados posibles
            const threadId = StateKeyManager.getThreadId(ctx);
            const threadIdStr = threadId ? String(threadId) : '';
            this.handler.clearChatState(chatId, threadIdStr);

            // Mostrar botón para volver al menú
            await ctx.reply(
                'Selecciona una opción:',
                Markup.inlineKeyboard([
                    Markup.button.callback('📊 Registrar otro Excel', 'accion:registrar')
                ])
            );
        } catch (error) {
            logger.error('Error al procesar Excel:', error);
            await ctx.reply(
                '❌ Error al procesar el archivo Excel. Detalles: ' + (error as Error).message
            );

            // Limpiar estado en caso de error
            const threadId = StateKeyManager.getThreadId(ctx);
            const threadIdStr = threadId ? String(threadId) : '';
            this.excelUploadHandler.awaitingExcelUpload.delete(chatId);
            this.handler.clearChatState(chatId, threadIdStr);

            // Limpiar también el message_id almacenado en caso de error
            if (this.handler.excelUploadMessages) {
                this.handler.excelUploadMessages.delete(chatId);
            }
        }
    }

    private async processPdfUpload(ctx: Context, numeroPoliza: string): Promise<void> {
        try {
            const documentInfo = (ctx.message as any).document;
            const fileSize = documentInfo.file_size || 0;
            const fileName = documentInfo.file_name || `documento_${Date.now()}.pdf`;

            logger.info('[PDF_UPLOAD] Documento recibido', {
                file_id: documentInfo.file_id,
                file_name: fileName,
                file_size: fileSize,
                mime_type: documentInfo.mime_type,
                numeroPoliza
            });

            // ✅ VALIDACIÓN 1: Tamaño de archivo (20MB máximo por defecto)
            const MAX_FILE_SIZE = parseInt(process.env.MAX_PDF_SIZE || '20971520'); // 20MB
            if (fileSize > MAX_FILE_SIZE) {
                const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
                const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(2);

                logger.warn('[PDF_UPLOAD] Archivo excede tamaño máximo', {
                    fileSize,
                    MAX_FILE_SIZE,
                    sizeMB,
                    maxSizeMB
                });

                await ctx.reply(
                    `❌ El archivo es demasiado grande (${sizeMB}MB).\n` +
                    `Tamaño máximo permitido: ${maxSizeMB}MB`
                );
                return;
            }

            // ✅ VALIDACIÓN 2: Verificar que sea realmente un PDF
            if (!documentInfo.mime_type?.includes('pdf')) {
                logger.warn('[PDF_UPLOAD] Archivo no es PDF', {
                    mime_type: documentInfo.mime_type,
                    file_name: fileName
                });

                await ctx.reply('❌ Solo se permiten documentos PDF.');
                return;
            }

            // Descargar archivo de Telegram
            const fileId = documentInfo.file_id;
            logger.info('[PDF_UPLOAD] Descargando archivo de Telegram', { fileId });

            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink.href);

            logger.info('[PDF_UPLOAD] Respuesta de descarga', {
                status: response.status,
                contentType: response.headers.get('content-type')
            });

            if (!response.ok) {
                throw new Error(`Error al descargar archivo: HTTP ${response.status}`);
            }

            const buffer = await response.buffer();

            logger.info('[PDF_UPLOAD] Archivo descargado', {
                bufferLength: buffer.length,
                expectedSize: fileSize,
                match: buffer.length === fileSize
            });

            // ✅ VALIDACIÓN 3: Verificar que el buffer se descargó correctamente
            if (buffer.length === 0) {
                throw new Error('Buffer vacío después de descargar archivo');
            }

            // ✅ VALIDACIÓN 4: Verificar que sea realmente un PDF (magic bytes)
            const pdfHeader = buffer.slice(0, 4).toString();
            if (!pdfHeader.startsWith('%PDF')) {
                logger.error('[PDF_UPLOAD] Archivo no es un PDF válido', {
                    header: pdfHeader,
                    hexHeader: buffer.slice(0, 10).toString('hex')
                });

                await ctx.reply('❌ El archivo no es un PDF válido.');
                return;
            }

            // Subir PDF a Cloudflare R2
            logger.info('[PDF_UPLOAD] Subiendo a Cloudflare R2', { numeroPoliza, fileName });

            const storage = getInstance();
            const uploadResult = await storage.uploadPolicyPDF(buffer, numeroPoliza, fileName);

            logger.info('[PDF_UPLOAD] Archivo subido a Cloudflare R2 exitosamente', {
                url: uploadResult.url,
                key: uploadResult.key,
                size: uploadResult.size
            });

            // Crear objeto de archivo R2 compatible con IR2File
            const r2FileObject: IR2File = {
                url: uploadResult.url,
                key: uploadResult.key,
                size: uploadResult.size,
                contentType: uploadResult.contentType,
                uploadDate: new Date(),
                originalName: fileName
            };

            // ✅ OPERACIÓN ATÓMICA: Añadir PDF con $push para evitar race conditions
            logger.info('[PDF_UPLOAD] Añadiendo PDF a póliza con operación atómica', {
                numeroPoliza
            });

            const updatedPolicy = await Policy.findOneAndUpdate(
                { numeroPoliza, estado: 'ACTIVO' },
                {
                    $push: { 'archivos.r2Files.pdfs': r2FileObject },
                    $setOnInsert: {
                        archivos: {
                            fotos: [],
                            pdfs: [],
                            r2Files: {
                                fotos: [],
                                pdfs: [r2FileObject]
                            }
                        }
                    }
                },
                {
                    new: true,
                    runValidators: false,
                    upsert: false
                }
            );

            if (!updatedPolicy) {
                logger.error('[PDF_UPLOAD] Póliza no encontrada después de subir a R2', {
                    numeroPoliza
                });
                await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                return;
            }

            logger.info('[PDF_UPLOAD] ✅ PDF guardado exitosamente en póliza', {
                numeroPoliza,
                totalPDFs: updatedPolicy.archivos?.r2Files?.pdfs?.length || 0,
                fileName
            });

            await ctx.reply(
                `✅ PDF guardado correctamente en almacenamiento seguro.\n\n` +
                `📄 Archivo: ${fileName}\n` +
                `📊 Tamaño: ${(uploadResult.size / 1024).toFixed(2)} KB`
            );
        } catch (error: any) {
            logger.error('[PDF_UPLOAD] ❌ Error al procesar PDF', {
                numeroPoliza,
                error: error.message,
                stack: error.stack,
                errorName: error.name
            });

            // Mensaje de error específico según el tipo de error
            let errorMessage = '❌ Error al procesar el documento PDF.';

            if (error.message?.includes('no está configurado')) {
                errorMessage = '❌ Error de configuración de almacenamiento. Contacta al administrador.';
            } else if (error.message?.includes('HTTP')) {
                errorMessage = '❌ Error al descargar el archivo de Telegram. Intenta nuevamente.';
            } else if (error.message?.includes('Buffer vacío')) {
                errorMessage = '❌ El archivo descargado está corrupto. Intenta subirlo nuevamente.';
            } else if (error.message?.includes('R2') || error.message?.includes('S3')) {
                errorMessage = '❌ Error al subir el archivo a almacenamiento. Verifica que el archivo no esté corrupto.';
            } else if (error.message?.includes('Póliza no encontrada')) {
                errorMessage = `❌ Póliza ${numeroPoliza} no encontrada.`;
            }

            await ctx.reply(errorMessage + '\n\nDetalles técnicos: ' + error.message);

            // Limpiar estado en error
            if (ctx.chat) {
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdStr = threadId ? String(threadId) : '';
                this.handler.uploadTargets.delete(ctx.chat.id, threadIdStr);
            }
        }
    }

    private isExcelFile(mimeType: string, fileName: string): boolean {
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

export default DocumentHandler;
