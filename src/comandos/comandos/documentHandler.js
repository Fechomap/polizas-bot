// src/comandos/documentHandler.js
const logger = require('../utils/logger');
const fetch = require('node-fetch');
const { getPolicyByNumber } = require('../controllers/policyController');
const XLSX = require('xlsx');

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
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const documentInfo = ctx.message.document || {};
                const fileName = documentInfo.file_name || '';
                const mimeType = documentInfo.mime_type || '';
                const fileSize = documentInfo.file_size || 0;
                
                logger.info(`Documento recibido: ${fileName} (${mimeType}, ${fileSize} bytes)`, { chatId });
                
                // PASO 1: Verificar si estamos esperando un Excel para registro de pólizas
                if (this.excelUploadHandler && 
                    this.excelUploadHandler.awaitingExcelUpload && 
                    this.excelUploadHandler.awaitingExcelUpload.get(chatId)) {
                    
                    logger.info(`Decidiendo procesar como Excel para registro de pólizas`, { chatId });
                    
                    // Verificar que sea un archivo Excel
                    if (!this.isExcelFile(mimeType, fileName)) {
                        logger.info(`Archivo rechazado, no es Excel: ${fileName} (${mimeType})`, { chatId });
                        return await ctx.reply('⚠️ El archivo debe ser Excel (.xlsx, .xls). Por favor, sube un archivo válido.');
                    }
                    
                    await this.processExcelUpload(ctx);
                    return;
                }
                
                // PASO 2: Verificar si estamos esperando un PDF para una póliza
                const numeroPoliza = this.handler.uploadTargets.get(chatId);
                if (numeroPoliza) {
                    logger.info(`Decidiendo procesar como PDF para póliza ${numeroPoliza}`, { chatId });
                    
                    if (!mimeType.includes('pdf')) {
                        return await ctx.reply('⚠️ Solo se permiten documentos PDF.');
                    }
                    
                    await this.processPdfUpload(ctx, numeroPoliza);
                    return;
                }
                
                // PASO 3: No estamos esperando ningún documento
                logger.info(`No se esperaba ningún documento`, { chatId });
                await ctx.reply('⚠️ Para subir archivos, primero selecciona la opción "Subir Archivos" en el menú principal e indica el número de póliza.');
                
            } catch (error) {
                logger.error('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento.');
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
            logger.info(`Procesando archivo Excel`, { chatId });
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
            
            // Limpiar otros estados posibles
            this.handler.clearChatState(chatId);
            
            // Mostrar botón para volver al menú
            await ctx.reply('Selecciona una opción:', 
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu'),
                    Markup.button.callback('📊 Registrar otro Excel', 'accion:registrar')
                ])
            );
            
        } catch (error) {
            logger.error('Error al procesar Excel:', error);
            await ctx.reply('❌ Error al procesar el archivo Excel. Detalles: ' + error.message);
            
            // Limpiar estado en caso de error
            this.excelUploadHandler.awaitingExcelUpload.delete(chatId);
            this.handler.clearChatState(chatId);
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
            logger.info('PDF guardado', { numeroPoliza });
            
        } catch (error) {
            logger.error('Error al procesar PDF:', error);
            await ctx.reply('❌ Error al procesar el documento PDF.');
            // Considerar limpiar estado en error
            this.handler.uploadTargets.delete(ctx.chat.id);
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
        
        const isExcelExtension = fileName.toLowerCase().endsWith('.xlsx') || 
                                fileName.toLowerCase().endsWith('.xls') || 
                                fileName.toLowerCase().endsWith('.xlsm');
        
        const isExcelMimeType = validMimeTypes.includes(mimeType);
        
        return isExcelExtension || isExcelMimeType;
    }
}

module.exports = DocumentHandler;