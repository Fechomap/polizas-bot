"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExcelUploadHandler = void 0;
const BaseCommand_1 = require("./BaseCommand");
const XLSX = __importStar(require("xlsx"));
const policyController_1 = require("../../controllers/policyController");
class ExcelUploadHandler extends BaseCommand_1.BaseCommand {
    constructor(handler) {
        super(handler);
        this.awaitingExcelUpload = new Map();
    }
    getCommandName() {
        return 'excelUpload';
    }
    getDescription() {
        return 'Manejador para subida de archivos Excel para registro de pólizas';
    }
    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, registrando manejador de documentos Excel`);
    }
    isExcelFile(mimeType, fileName) {
        this.logInfo(`Verificando si es Excel: ${fileName} (${mimeType})`);
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
        const isExcel = isExcelExtension || isExcelMimeType;
        this.logInfo(`Es Excel: ${isExcel} (extensión: ${isExcelExtension}, mimeType: ${isExcelMimeType})`);
        return isExcel;
    }
    async processExcelFile(fileUrl, ctx) {
        const chatId = ctx.chat.id;
        this.logInfo(`Iniciando procesamiento de Excel desde URL: ${fileUrl}`, { chatId });
        try {
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
            this.logInfo('Leyendo Excel con XLSX.read', { chatId });
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            this.logInfo(`Excel leído correctamente. Hojas: ${workbook.SheetNames.join(', ')}`, {
                chatId
            });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                blankrows: false,
                defval: ''
            });
            if (!data || data.length <= 1) {
                await ctx.reply('⚠️ El archivo Excel está vacío o no contiene datos suficientes.');
                return false;
            }
            const headers = data[0];
            if (!this.validateHeaders(headers)) {
                await ctx.reply('❌ El formato del Excel no es compatible. Por favor, usa la plantilla correcta.');
                return false;
            }
            const rows = data.slice(1);
            const results = {
                total: rows.length,
                successful: 0,
                failed: 0,
                details: []
            };
            const BATCH_SIZE = 5;
            const batches = Math.ceil(rows.length / BATCH_SIZE);
            const progressMessage = await ctx.reply(`📊 Procesando ${rows.length} pólizas en ${batches} lotes...`);
            for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
                const batchStart = batchIndex * BATCH_SIZE;
                const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
                const batch = rows.slice(batchStart, batchEnd);
                if (batches > 1) {
                    try {
                        await ctx.telegram.editMessageText(ctx.chat.id, progressMessage.message_id, undefined, `📊 Procesando ${rows.length} pólizas en ${batches} lotes...\n\n🔄 Procesando lote ${batchIndex + 1}/${batches}...`);
                    }
                    catch (err) {
                        this.logError('Error al actualizar mensaje de progreso:', err);
                    }
                }
                for (const row of batch) {
                    try {
                        const policyData = this.mapRowToPolicy(headers, row);
                        const validation = this.validatePolicyData(policyData);
                        if (!validation.isValid) {
                            results.failed++;
                            results.details.push({
                                numeroPoliza: policyData.numeroPoliza || 'Desconocido',
                                status: 'ERROR',
                                message: validation.errors.join(', ')
                            });
                            continue;
                        }
                        const savedPolicy = await (0, policyController_1.savePolicy)(policyData);
                        results.successful++;
                        results.details.push({
                            numeroPoliza: savedPolicy.numeroPoliza,
                            status: 'SUCCESS',
                            message: 'Registrada correctamente'
                        });
                    }
                    catch (error) {
                        results.failed++;
                        let errorMessage = 'Error desconocido';
                        if (error instanceof policyController_1.DuplicatePolicyError) {
                            errorMessage = 'Póliza duplicada';
                        }
                        else if (error.name === 'ValidationError') {
                            errorMessage =
                                'Error de validación: ' +
                                    Object.keys(error.errors || {}).join(', ');
                        }
                        else {
                            errorMessage = error.message;
                        }
                        results.details.push({
                            numeroPoliza: row[headers.indexOf('# DE POLIZA')] || 'Desconocido',
                            status: 'ERROR',
                            message: errorMessage
                        });
                    }
                }
                if (batchIndex < batches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, progressMessage.message_id);
            }
            catch (err) {
                this.logError('Error al eliminar mensaje de progreso:', err);
            }
            await this.showResults(ctx, results);
            return true;
        }
        catch (error) {
            this.logError('Error al procesar Excel:', error);
            await ctx.reply('❌ Error al procesar el archivo Excel. Detalles: ' + error.message);
            return false;
        }
    }
    validateHeaders(headers) {
        if (!headers || !Array.isArray(headers)) {
            this.logError('Los encabezados no son un array válido', { headers });
            return false;
        }
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
        for (const field of requiredFields) {
            if (!headers.includes(field)) {
                this.logError(`Falta el campo ${field} en los encabezados`, {
                    headers: headers.join(', ')
                });
                return false;
            }
        }
        return true;
    }
    mapRowToPolicy(headers, row) {
        const headerMapping = {
            TITULAR: 'titular',
            'CORREO ELECTRONICO': 'correo',
            CONTRASEÑA: 'contraseña',
            TELEFONO: 'telefono',
            CALLE: 'calle',
            COLONIA: 'colonia',
            MUNICIPIO: 'municipio',
            ESTADO: 'estadoRegion',
            CP: 'cp',
            RFC: 'rfc',
            MARCA: 'marca',
            SUBMARCA: 'submarca',
            AÑO: 'año',
            COLOR: 'color',
            SERIE: 'serie',
            PLACAS: 'placas',
            'AGENTE COTIZADOR': 'agenteCotizador',
            ASEGURADORA: 'aseguradora',
            '# DE POLIZA': 'numeroPoliza',
            'FECHA DE EMISION': 'fechaEmision'
        };
        const policyData = {};
        headers.forEach((header, index) => {
            if (headerMapping[header]) {
                const value = row[index];
                if (header === 'AÑO') {
                    policyData[headerMapping[header]] = parseInt(value, 10);
                }
                else if (header === 'FECHA DE EMISION') {
                    if (value) {
                        policyData[headerMapping[header]] = this.parseDate(value);
                    }
                }
                else if (header === 'CORREO ELECTRONICO') {
                    policyData[headerMapping[header]] =
                        value && value.toLowerCase() === 'sin correo' ? '' : value;
                }
                else {
                    policyData[headerMapping[header]] = this.formatFieldValue(header, value);
                }
            }
        });
        policyData.estado = 'ACTIVO';
        policyData.archivos = { fotos: [], pdfs: [] };
        policyData.pagos = [];
        policyData.servicios = [];
        return policyData;
    }
    formatFieldValue(header, value) {
        if (value === undefined || value === null) {
            return '';
        }
        const stringValue = String(value);
        const upperCaseFields = [
            'RFC',
            'MARCA',
            'SUBMARCA',
            'COLOR',
            'SERIE',
            'PLACAS',
            'ASEGURADORA',
            '# DE POLIZA'
        ];
        if (upperCaseFields.includes(header)) {
            return stringValue.toUpperCase().trim();
        }
        return stringValue.trim();
    }
    parseDate(dateValue) {
        try {
            if (dateValue instanceof Date) {
                return dateValue;
            }
            if (typeof dateValue === 'number') {
                return new Date(Math.round((dateValue - 25569) * 86400 * 1000));
            }
            const dateStr = String(dateValue).trim();
            if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(dateStr)) {
                const parts = dateStr.split(/[/-]/);
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                let year = parseInt(parts[2], 10);
                if (year < 100) {
                    year += 2000;
                }
                return new Date(year, month, day);
            }
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
                return new Date(dateStr);
            }
            const timestamp = Date.parse(dateStr);
            if (!isNaN(timestamp)) {
                return new Date(timestamp);
            }
            this.logError(`No se pudo parsear la fecha: ${dateValue}`, { type: typeof dateValue });
            return new Date();
        }
        catch (error) {
            this.logError(`Error al parsear fecha: ${dateValue}`, error);
            return new Date();
        }
    }
    validatePolicyData(policyData) {
        const errors = [];
        const fieldNames = {
            titular: 'TITULAR',
            rfc: 'RFC',
            marca: 'MARCA',
            submarca: 'SUBMARCA',
            año: 'AÑO',
            color: 'COLOR',
            serie: 'SERIE',
            placas: 'PLACAS',
            agenteCotizador: 'AGENTE COTIZADOR',
            aseguradora: 'ASEGURADORA',
            numeroPoliza: '# DE POLIZA',
            fechaEmision: 'FECHA DE EMISION'
        };
        const requiredFields = [
            'titular',
            'rfc',
            'marca',
            'submarca',
            'año',
            'color',
            'serie',
            'placas',
            'agenteCotizador',
            'aseguradora',
            'numeroPoliza',
            'fechaEmision'
        ];
        for (const field of requiredFields) {
            if (!policyData[field]) {
                errors.push(`Falta ${fieldNames[field]}`);
            }
        }
        if (policyData.año && isNaN(policyData.año)) {
            errors.push('AÑO debe ser un número válido');
        }
        if (policyData.fechaEmision && !(policyData.fechaEmision instanceof Date)) {
            errors.push('FECHA DE EMISION no es válida');
        }
        if (errors.length > 0) {
            return { isValid: false, errors: errors };
        }
        return { isValid: true, errors: [] };
    }
    async showResults(ctx, results) {
        await ctx.reply('📊 *Resumen del Procesamiento*\n\n' +
            `Total de pólizas procesadas: ${results.total}\n` +
            `✅ Registradas correctamente: ${results.successful}\n` +
            `❌ Fallidas: ${results.failed}\n\n` +
            '📝 Detalles a continuación...', { parse_mode: 'Markdown' });
        const ITEMS_PER_MESSAGE = 10;
        const successful = results.details.filter(d => d.status === 'SUCCESS');
        const failed = results.details.filter(d => d.status === 'ERROR');
        if (successful.length > 0) {
            await ctx.reply('✅ *Pólizas Registradas Correctamente:*', { parse_mode: 'Markdown' });
            for (let i = 0; i < successful.length; i += ITEMS_PER_MESSAGE) {
                const chunk = successful.slice(i, i + ITEMS_PER_MESSAGE);
                const message = chunk.map(item => `${item.numeroPoliza}`).join('\n');
                await ctx.reply(message);
                if (i + ITEMS_PER_MESSAGE < successful.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
        if (failed.length > 0) {
            await ctx.reply('❌ *Pólizas con Errores:*', { parse_mode: 'Markdown' });
            for (let i = 0; i < failed.length; i += ITEMS_PER_MESSAGE) {
                const chunk = failed.slice(i, i + ITEMS_PER_MESSAGE);
                const message = chunk
                    .map(item => `*${item.numeroPoliza}*: ${item.message}`)
                    .join('\n');
                await ctx.reply(message, { parse_mode: 'Markdown' });
                if (i + ITEMS_PER_MESSAGE < failed.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
    }
    setAwaitingExcelUpload(chatId, value = true) {
        if (value) {
            this.awaitingExcelUpload.set(chatId, true);
            this.logInfo(`Estado awaiting Excel activado para chat ${chatId}`);
        }
        else {
            this.awaitingExcelUpload.delete(chatId);
            this.logInfo(`Estado awaiting Excel desactivado para chat ${chatId}`);
        }
    }
}
exports.ExcelUploadHandler = ExcelUploadHandler;
