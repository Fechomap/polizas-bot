// src/comandos/comandos/ExcelUploadHandler.js
const BaseCommand = require('./BaseCommand');
const XLSX = require('xlsx');
const { savePolicy, DuplicatePolicyError, savePoliciesBatch } = require('../../controllers/policyController');
const { Markup } = require('telegraf');
const logger = require('../../utils/logger');

class ExcelUploadHandler extends BaseCommand {
    constructor(handler) {
        super(handler);
        this.awaitingExcelUpload = new Map(); // chatId => true cuando esperamos un Excel
    }

    getCommandName() {
        return 'excelUpload';
    }

    getDescription() {
        return 'Manejador para subida de archivos Excel para registro de pólizas';
    }

    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, registrando manejador de documentos Excel`);

        // Handler para documentos Excel
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;

                // Solo procesar si estamos esperando un Excel para registro de pólizas
                if (!this.awaitingExcelUpload.get(chatId)) {
                    this.logInfo(`Documento recibido pero no esperando Excel: ${ctx.message.document?.file_name || 'desconocido'}`, { chatId });
                    return; // No estamos esperando Excel, ignorar
                }

                const documentInfo = ctx.message.document || {};
                const fileName = documentInfo.file_name || '';
                const mimeType = documentInfo.mime_type || '';
                const fileSize = documentInfo.file_size || 0;

                this.logInfo(`Excel: Documento recibido: ${fileName} (${mimeType}, ${fileSize} bytes)`, { chatId });

                // Verificar que sea un archivo Excel
                if (!this.isExcelFile(mimeType, fileName)) {
                    this.logInfo(`Excel: Archivo rechazado, no es Excel: ${fileName} (${mimeType})`, { chatId });
                    return await ctx.reply('⚠️ El archivo debe ser Excel (.xlsx, .xls). Por favor, sube un archivo válido.');
                }

                // Mostrar mensaje de procesamiento
                this.logInfo(`Excel: Procesando archivo Excel: ${fileName}`, { chatId });
                const waitMsg = await ctx.reply('🔄 Descargando y procesando archivo Excel...');

                // Descargar el archivo
                const fileId = ctx.message.document.file_id;
                const fileLink = await ctx.telegram.getFileLink(fileId);

                this.logInfo(`Excel: Descargando Excel desde: ${fileLink.href}`, { chatId });

                // Procesar el archivo Excel
                try {
                    const result = await this.processExcelFile(fileLink.href, ctx);
                    this.logInfo(`Excel: Procesamiento completado con éxito: ${result}`, { chatId });
                } catch (processError) {
                    this.logError(`Excel: Error al procesar archivo: ${processError.message}`, {
                        chatId,
                        error: processError,
                        stack: processError.stack
                    });
                    await ctx.reply(`❌ Error al procesar el archivo Excel: ${processError.message}`);
                }

                // Actualizar mensaje de espera
                try {
                    await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
                } catch (err) {
                    this.logError('Excel: Error al eliminar mensaje de espera:', err);
                }

                // Ya no estamos esperando Excel
                this.awaitingExcelUpload.delete(chatId);

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
                this.logError('Excel: Error general al procesar documento Excel:', error);
                await ctx.reply('❌ Error al procesar el archivo Excel. Por favor, inténtalo nuevamente.');
                // Limpiar estado en caso de error
                this.awaitingExcelUpload.delete(ctx.chat.id);
                this.handler.clearChatState(ctx.chat.id);
            }
        });
    }

    // Verificar si es un archivo Excel
    isExcelFile(mimeType, fileName) {
        this.logInfo(`Verificando si es Excel: ${fileName} (${mimeType})`);

        // Lista ampliada de MIME types que Telegram puede asignar a archivos Excel
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

        // Verificar extensión del archivo (debería funcionar mejor que el mimetype)
        const isExcelExtension = fileName.toLowerCase().endsWith('.xlsx') ||
                              fileName.toLowerCase().endsWith('.xls') ||
                              fileName.toLowerCase().endsWith('.xlsm');

        // Verificar mimetype (menos confiable pero es un respaldo)
        const isExcelMimeType = validMimeTypes.includes(mimeType);

        const isExcel = isExcelExtension || isExcelMimeType;
        this.logInfo(`Es Excel: ${isExcel} (extensión: ${isExcelExtension}, mimeType: ${isExcelMimeType})`);

        return isExcel;
    }

    // Procesar archivo Excel
    async processExcelFile(fileUrl, ctx) {
        const chatId = ctx.chat.id;
        this.logInfo(`Iniciando procesamiento de Excel desde URL: ${fileUrl}`, { chatId });

        try {
            // Obtener el archivo
            this.logInfo('Iniciando descarga del archivo Excel', { chatId });
            const response = await fetch(fileUrl);

            if (!response.ok) {
                this.logError(`Error al descargar Excel: ${response.status} ${response.statusText}`, { chatId });
                await ctx.reply(`❌ Error al descargar el archivo Excel: ${response.status}`);
                return false;
            }

            this.logInfo('Excel descargado correctamente, obteniendo ArrayBuffer', { chatId });
            const arrayBuffer = await response.arrayBuffer();
            this.logInfo(`ArrayBuffer obtenido: ${arrayBuffer.byteLength} bytes`, { chatId });

            // Leer el Excel - ATENCIÓN: La variable 'workbook' estaba declarada dos veces
            this.logInfo('Leyendo Excel con XLSX.read', { chatId });
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            this.logInfo(`Excel leído correctamente. Hojas: ${workbook.SheetNames.join(', ')}`, { chatId });

            // Obtener la primera hoja
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];

            // Convertir a JSON (array de objetos)
            const data = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                blankrows: false,
                defval: ''
            });

            // Verificar que haya datos
            if (!data || data.length <= 1) {
                await ctx.reply('⚠️ El archivo Excel está vacío o no contiene datos suficientes.');
                return false;
            }

            // Obtener los encabezados (primera fila)
            const headers = data[0];

            // Verificar que los encabezados sean los esperados
            if (!this.validateHeaders(headers)) {
                await ctx.reply('❌ El formato del Excel no es compatible. Por favor, usa la plantilla correcta.');
                return false;
            }

            // Procesar cada fila (excepto la primera que son encabezados)
            const rows = data.slice(1);

            // Resultados del procesamiento
            const results = {
                total: rows.length,
                successful: 0,
                failed: 0,
                details: []
            };

            // Procesar pólizas en bloques para evitar sobrecarga
            const BATCH_SIZE = 5;
            const batches = Math.ceil(rows.length / BATCH_SIZE);

            // Mensaje de inicio del procesamiento
            await ctx.reply(`📊 Procesando ${rows.length} pólizas en ${batches} lotes...`);

            for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
                const batchStart = batchIndex * BATCH_SIZE;
                const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
                const batch = rows.slice(batchStart, batchEnd);

                // Actualizar progreso
                if (batches > 1) {
                    await ctx.reply(`🔄 Procesando lote ${batchIndex + 1}/${batches}...`);
                }

                // Procesar cada fila en el lote
                for (const row of batch) {
                    try {
                        // Mapear fila a objeto de póliza
                        const policyData = this.mapRowToPolicy(headers, row);

                        // Validar datos mínimos
                        if (!this.validatePolicyData(policyData)) {
                            results.failed++;
                            results.details.push({
                                numeroPoliza: policyData.numeroPoliza || 'Desconocido',
                                status: 'ERROR',
                                message: 'Datos incompletos o inválidos'
                            });
                            continue;
                        }

                        // Guardar en la base de datos
                        const savedPolicy = await savePolicy(policyData);

                        results.successful++;
                        results.details.push({
                            numeroPoliza: savedPolicy.numeroPoliza,
                            status: 'SUCCESS',
                            message: 'Registrada correctamente'
                        });
                    } catch (error) {
                        results.failed++;

                        let errorMessage = 'Error desconocido';
                        if (error instanceof DuplicatePolicyError) {
                            errorMessage = 'Póliza duplicada';
                        } else if (error.name === 'ValidationError') {
                            errorMessage = 'Error de validación: ' + Object.keys(error.errors || {}).join(', ');
                        } else {
                            errorMessage = error.message;
                        }

                        results.details.push({
                            numeroPoliza: row[headers.indexOf('# DE POLIZA')] || 'Desconocido',
                            status: 'ERROR',
                            message: errorMessage
                        });
                    }
                }

                // Pausa para no sobrecargar
                if (batchIndex < batches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Mostrar resumen
            await this.showResults(ctx, results);

            return true;
        } catch (error) {
            this.logError('Error al procesar Excel:', error);
            await ctx.reply('❌ Error al procesar el archivo Excel. Detalles: ' + error.message);
            return false;
        }
    }

    // Validar encabezados del Excel
    validateHeaders(headers) {
        if (!headers || !Array.isArray(headers)) {
            this.logError('Los encabezados no son un array válido', { headers });
            return false;
        }

        // Campos obligatorios que deben estar en el Excel
        const requiredFields = [
            'TITULAR',
            'RFC',
            'MARCA',
            'SUBMARCA',
            'AÑO',
            'COLOR',
            'SERIE',
            'PLACAS',
            'AGENTE COTIZADOR',
            'ASEGURADORA',
            '# DE POLIZA',
            'FECHA DE EMISION'
        ];

        // Verificar que todos los campos requeridos estén presentes
        for (const field of requiredFields) {
            if (!headers.includes(field)) {
                this.logError(`Falta el campo ${field} en los encabezados`, { headers: headers.join(', ') });
                return false;
            }
        }

        return true;
    }

    // Mapear fila a objeto de póliza
    mapRowToPolicy(headers, row) {
        // Objeto para mapear los encabezados del Excel a los campos del modelo
        const headerMapping = {
            'TITULAR': 'titular',
            'CORREO ELECTRONICO': 'correo',
            'CONTRASEÑA': 'contraseña',
            'TELEFONO': 'telefono',
            'CALLE': 'calle',
            'COLONIA': 'colonia',
            'MUNICIPIO': 'municipio',
            'ESTADO': 'estadoRegion',
            'CP': 'cp',
            'RFC': 'rfc',
            'MARCA': 'marca',
            'SUBMARCA': 'submarca',
            'AÑO': 'año',
            'COLOR': 'color',
            'SERIE': 'serie',
            'PLACAS': 'placas',
            'AGENTE COTIZADOR': 'agenteCotizador',
            'ASEGURADORA': 'aseguradora',
            '# DE POLIZA': 'numeroPoliza',
            'FECHA DE EMISION': 'fechaEmision'
        };

        const policyData = {};

        // Mapear cada campo del Excel al objeto policyData
        headers.forEach((header, index) => {
            if (headerMapping[header]) {
                const value = row[index];

                // Procesamiento especial para ciertos campos
                if (header === 'AÑO') {
                    // Convertir año a número
                    policyData[headerMapping[header]] = parseInt(value, 10);
                } else if (header === 'FECHA DE EMISION') {
                    // Convertir fecha a objeto Date
                    if (value) {
                        policyData[headerMapping[header]] = this.parseDate(value);
                    }
                } else if (header === 'CORREO ELECTRONICO') {
                    // Manejar correo electrónico (convertir 'sin correo' a '')
                    policyData[headerMapping[header]] = (value && value.toLowerCase() === 'sin correo') ? '' : value;
                } else {
                    // Para campos de texto, asegurar que sean string y transformar según las reglas
                    policyData[headerMapping[header]] = this.formatFieldValue(header, value);
                }
            }
        });

        // Establecer estado como ACTIVO por defecto
        policyData.estado = 'ACTIVO';

        // Inicializar arreglos vacíos para archivos, pagos y servicios
        policyData.archivos = { fotos: [], pdfs: [] };
        policyData.pagos = [];
        policyData.servicios = [];

        return policyData;
    }

    // Formatear valores de campo según el tipo
    formatFieldValue(header, value) {
        if (value === undefined || value === null) {
            return '';
        }

        const stringValue = String(value);

        // Campos que deben ser en mayúsculas
        const upperCaseFields = ['RFC', 'MARCA', 'SUBMARCA', 'COLOR', 'SERIE', 'PLACAS', 'ASEGURADORA', '# DE POLIZA'];
        if (upperCaseFields.includes(header)) {
            return stringValue.toUpperCase().trim();
        }

        return stringValue.trim();
    }

    // Analizar y convertir fecha desde varios formatos
    parseDate(dateValue) {
        try {
            // Si ya es un objeto Date
            if (dateValue instanceof Date) {
                return dateValue;
            }

            // Si es un número (fecha serial de Excel)
            if (typeof dateValue === 'number') {
                // Convertir fecha serial de Excel
                return new Date(Math.round((dateValue - 25569) * 86400 * 1000));
            }

            // Si es un string, intentar varios formatos
            const dateStr = String(dateValue).trim();

            // Formato DD/MM/YYYY o DD-MM-YYYY
            if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(dateStr)) {
                const parts = dateStr.split(/[/-]/);
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Restar 1 ya que los meses en JS son 0-11
                let year = parseInt(parts[2], 10);

                // Si el año tiene 2 dígitos, asumir 2000+
                if (year < 100) {
                    year += 2000;
                }

                return new Date(year, month, day);
            }

            // Formato ISO (YYYY-MM-DD)
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
                return new Date(dateStr);
            }

            // Intentar con Date.parse como último recurso
            const timestamp = Date.parse(dateStr);
            if (!isNaN(timestamp)) {
                return new Date(timestamp);
            }

            // Si todo falla, devolver la fecha actual
            this.logError(`No se pudo parsear la fecha: ${dateValue}`, { type: typeof dateValue });
            return new Date();
        } catch (error) {
            this.logError(`Error al parsear fecha: ${dateValue}`, error);
            return new Date(); // Devolver fecha actual como fallback
        }
    }

    // Validar datos mínimos de una póliza
    validatePolicyData(policyData) {
        // Campos obligatorios
        const requiredFields = [
            'titular', 'rfc', 'marca', 'submarca', 'año', 'color',
            'serie', 'placas', 'agenteCotizador', 'aseguradora',
            'numeroPoliza', 'fechaEmision'
        ];

        for (const field of requiredFields) {
            if (!policyData[field]) {
                this.logError(`Campo obligatorio faltante: ${field}`, { policyData });
                return false;
            }
        }

        // Validaciones adicionales
        if (isNaN(policyData.año)) {
            this.logError('El año no es un número válido', { año: policyData.año });
            return false;
        }

        if (!(policyData.fechaEmision instanceof Date)) {
            this.logError('La fecha de emisión no es válida', { fechaEmision: policyData.fechaEmision });
            return false;
        }

        return true;
    }

    // Mostrar resultados del procesamiento
    async showResults(ctx, results) {
        // Mensaje principal con el resumen
        await ctx.reply(
            '📊 *Resumen del Procesamiento*\n\n' +
            `Total de pólizas procesadas: ${results.total}\n` +
            `✅ Registradas correctamente: ${results.successful}\n` +
            `❌ Fallidas: ${results.failed}\n\n` +
            '📝 Detalles a continuación...',
            { parse_mode: 'Markdown' }
        );

        // Si hay muchas pólizas, dividir en múltiples mensajes
        const ITEMS_PER_MESSAGE = 10;

        // Dividir pólizas exitosas y fallidas
        const successful = results.details.filter(d => d.status === 'SUCCESS');
        const failed = results.details.filter(d => d.status === 'ERROR');

        // Mostrar pólizas exitosas
        if (successful.length > 0) {
            await ctx.reply('✅ *Pólizas Registradas Correctamente:*', { parse_mode: 'Markdown' });

            for (let i = 0; i < successful.length; i += ITEMS_PER_MESSAGE) {
                const chunk = successful.slice(i, i + ITEMS_PER_MESSAGE);
                const message = chunk.map(item => `- ${item.numeroPoliza}`).join('\n');
                await ctx.reply(message);

                // Pequeña pausa para evitar flood
                if (i + ITEMS_PER_MESSAGE < successful.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }

        // Mostrar pólizas fallidas con sus errores
        if (failed.length > 0) {
            await ctx.reply('❌ *Pólizas con Errores:*', { parse_mode: 'Markdown' });

            for (let i = 0; i < failed.length; i += ITEMS_PER_MESSAGE) {
                const chunk = failed.slice(i, i + ITEMS_PER_MESSAGE);
                const message = chunk.map(item =>
                    `- *${item.numeroPoliza}*: ${item.message}`
                ).join('\n');

                await ctx.reply(message, { parse_mode: 'Markdown' });

                // Pequeña pausa para evitar flood
                if (i + ITEMS_PER_MESSAGE < failed.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
    }

    // Método para ser llamado desde CommandHandler
    setAwaitingExcelUpload(chatId, value = true) {
        if (value) {
            this.awaitingExcelUpload.set(chatId, true);
            this.logInfo(`Estado awaiting Excel activado para chat ${chatId}`);
        } else {
            this.awaitingExcelUpload.delete(chatId);
            this.logInfo(`Estado awaiting Excel desactivado para chat ${chatId}`);
        }
    }
}

module.exports = ExcelUploadHandler;
