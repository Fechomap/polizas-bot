import { Context, Markup, Telegraf } from 'telegraf';
import { Document, Message } from 'telegraf/typings/core/types/typegram';
import logger from '../../utils/logger';
import fetch from 'node-fetch';
import { getPolicyByNumber, addFileToPolicyByNumber } from '../../controllers/policyController';
import StateKeyManager from '../../utils/StateKeyManager';
import { getInstance } from '../../services/CloudflareStorage';
import { IPolicy, IR2FileObject, IR2File } from '../../types/database';

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
                const documentInfo = (ctx.message as any)?.document ?? {};
                const fileName = documentInfo.file_name ?? '';
                const mimeType = documentInfo.mime_type ?? '';
                const fileSize = documentInfo.file_size ?? 0;

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

                if (numeroPoliza ?? esperandoExcel) {
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
            // Download file
            console.log('FLUJO NORMAL - Documento recibido:', {
                file_id: (ctx.message as any).document.file_id,
                file_name: (ctx.message as any).document.file_name,
                file_size: (ctx.message as any).document.file_size,
                mime_type: (ctx.message as any).document.mime_type,
                file_unique_id: (ctx.message as any).document.file_unique_id
            });
            const fileId = (ctx.message as any).document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink.href);
            console.log('FLUJO NORMAL - Response status:', response.status);
            console.log('FLUJO NORMAL - Response headers:', response.headers.raw());
            if (!response.ok) throw new Error('Falló la descarga del documento');
            const buffer = await response.buffer();
            console.log('FLUJO NORMAL - Buffer length:', buffer.length);
            console.log(
                'FLUJO NORMAL - Buffer primeros 100 bytes:',
                buffer.slice(0, 100).toString('hex')
            );

            // Subir PDF a Cloudflare R2
            const storage = getInstance();
            const originalName =
                (ctx.message as any).document.file_name ?? `documento_${Date.now()}.pdf`;
            const uploadResult = await storage.uploadPolicyPDF(buffer, numeroPoliza, originalName);

            // Guardar archivo en la tabla PolicyFileR2
            const fileResult = await addFileToPolicyByNumber(numeroPoliza, 'PDF', {
                url: uploadResult.url,
                key: uploadResult.key,
                size: uploadResult.size,
                contentType: uploadResult.contentType,
                originalName: originalName
            });

            if (!fileResult) {
                await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                return;
            }

            await ctx.reply('✅ PDF guardado correctamente en almacenamiento seguro.');
            logger.info('PDF guardado', { numeroPoliza });
        } catch (error) {
            logger.error('Error al procesar PDF:', error);
            await ctx.reply('❌ Error al procesar el documento PDF.');
            // Considerar limpiar estado en error
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

        return isExcelExtension ?? isExcelMimeType;
    }
}

export default DocumentHandler;
