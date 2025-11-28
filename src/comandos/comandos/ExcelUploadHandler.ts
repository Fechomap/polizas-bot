// src/comandos/comandos/ExcelUploadHandler.ts
/**
 * Manejador de carga de archivos Excel para registro masivo de pólizas
 * REFACTORIZADO: Constantes centralizadas para evitar duplicación
 */
import { BaseCommand } from './BaseCommand';
import ExcelJS from 'exceljs';
import { savePolicy, DuplicatePolicyError } from '../../controllers/policyController';
import type {
    IContextBot,
    IPolicyData,
    IProcessingResults,
    IValidationResult
} from '../../../types/index';

// ========== CONFIGURACIÓN CENTRALIZADA ==========

/** Campos obligatorios en el Excel */
const REQUIRED_EXCEL_FIELDS = [
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
] as const;

/** Mapeo de encabezados Excel a campos del modelo */
const HEADER_TO_FIELD_MAP: Record<string, keyof IPolicyData> = {
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

/** Campos que deben estar en mayúsculas */
const UPPERCASE_FIELDS = [
    'RFC',
    'MARCA',
    'SUBMARCA',
    'COLOR',
    'SERIE',
    'PLACAS',
    'ASEGURADORA',
    '# DE POLIZA'
];

/** MIME types válidos para archivos Excel */
const VALID_EXCEL_MIME_TYPES = [
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

class ExcelUploadHandler extends BaseCommand {
    private awaitingExcelUpload: Map<number, boolean> = new Map(); // chatId => true cuando esperamos un Excel

    constructor(handler: any) {
        super(handler);
    }

    getCommandName(): string {
        return 'excelUpload';
    }

    getDescription(): string {
        return 'Manejador para subida de archivos Excel para registro de pólizas';
    }

    register(): void {
        this.logInfo(
            `Comando ${this.getCommandName()} cargado, registrando manejador de documentos Excel`
        );

        // Document handling is now done by DocumentHandler to avoid conflicts
    }

    // Verificar si es un archivo Excel
    isExcelFile(mimeType: string, fileName: string): boolean {
        this.logInfo(`Verificando si es Excel: ${fileName} (${mimeType})`);

        const lowerName = fileName.toLowerCase();
        const isExcelExtension =
            lowerName.endsWith('.xlsx') ||
            lowerName.endsWith('.xls') ||
            lowerName.endsWith('.xlsm');
        const isExcelMimeType = VALID_EXCEL_MIME_TYPES.includes(mimeType);
        const isExcel = isExcelExtension ?? isExcelMimeType;

        this.logInfo(`Es Excel: ${isExcel} (ext: ${isExcelExtension}, mime: ${isExcelMimeType})`);
        return isExcel;
    }

    // Procesar archivo Excel
    async processExcelFile(fileUrl: string, ctx: IContextBot): Promise<boolean> {
        const chatId = ctx.chat!.id;
        this.logInfo(`Iniciando procesamiento de Excel desde URL: ${fileUrl}`, { chatId });

        try {
            // Obtener el archivo
            this.logInfo('Iniciando descarga del archivo Excel', { chatId });
            const response = await fetch(fileUrl);

            if (!response.ok) {
                this.logError(
                    `Error al descargar Excel: ${response.status} ${response.statusText}`,
                    { chatId }
                );
                await ctx.reply(`❌ Error al descargar el archivo Excel: ${response.status}`);
                return false;
            }

            this.logInfo('Excel descargado correctamente, obteniendo ArrayBuffer', { chatId });
            const arrayBuffer = await response.arrayBuffer();
            this.logInfo(`ArrayBuffer obtenido: ${arrayBuffer.byteLength} bytes`, { chatId });

            // Leer el Excel con ExcelJS
            this.logInfo('Leyendo Excel con ExcelJS', { chatId });
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);

            const worksheetNames = workbook.worksheets.map(ws => ws.name);
            this.logInfo(`Excel leído correctamente. Hojas: ${worksheetNames.join(', ')}`, {
                chatId
            });

            // Obtener la primera hoja
            const worksheet = workbook.worksheets[0];

            // Convertir a array de arrays (similar a xlsx)
            const data: any[][] = [];
            worksheet.eachRow((row, rowNumber) => {
                // row.values es un array donde el índice 0 está vacío, comenzamos desde 1
                const rowValues = row.values as any[];
                data.push(rowValues.slice(1)); // Eliminar el primer elemento vacío
            });

            // Verificar que haya datos
            if (!data || data.length <= 1) {
                await ctx.reply('⚠️ El archivo Excel está vacío o no contiene datos suficientes.');
                return false;
            }

            // Obtener los encabezados (primera fila)
            const headers: string[] = data[0];

            // Verificar que los encabezados sean los esperados
            if (!this.validateHeaders(headers)) {
                await ctx.reply(
                    '❌ El formato del Excel no es compatible. Por favor, usa la plantilla correcta.'
                );
                return false;
            }

            // Procesar cada fila (excepto la primera que son encabezados)
            const rows = data.slice(1);

            // Resultados del procesamiento
            const results: IProcessingResults = {
                total: rows.length,
                successful: 0,
                failed: 0,
                details: []
            };

            // Procesar pólizas en bloques para evitar sobrecarga
            const BATCH_SIZE = 5;
            const batches = Math.ceil(rows.length / BATCH_SIZE);

            // Mensaje de inicio del procesamiento
            const progressMessage = await ctx.reply(
                `📊 Procesando ${rows.length} pólizas en ${batches} lotes...`
            );

            for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
                const batchStart = batchIndex * BATCH_SIZE;
                const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
                const batch = rows.slice(batchStart, batchEnd);

                // Actualizar progreso en el mismo mensaje
                if (batches > 1) {
                    try {
                        await ctx.telegram.editMessageText(
                            ctx.chat!.id,
                            progressMessage.message_id,
                            undefined,
                            `📊 Procesando ${rows.length} pólizas en ${batches} lotes...\n\n🔄 Procesando lote ${batchIndex + 1}/${batches}...`
                        );
                    } catch (err) {
                        // Si falla la edición, continuar sin mostrar error
                        this.logError('Error al actualizar mensaje de progreso:', err);
                    }
                }

                // Procesar cada fila en el lote
                for (const row of batch) {
                    try {
                        // Mapear fila a objeto de póliza
                        const policyData = this.mapRowToPolicy(headers, row) as IPolicyData;

                        // Validar datos mínimos
                        const validation = this.validatePolicyData(policyData);
                        if (!validation.isValid) {
                            results.failed++;
                            results.details.push({
                                numeroPoliza: policyData.numeroPoliza ?? 'Desconocido',
                                status: 'ERROR',
                                message: validation.errors.join(', ')
                            });
                            continue;
                        }

                        // Guardar en la base de datos
                        await savePolicy(policyData);

                        results.successful++;
                        results.details.push({
                            numeroPoliza: policyData.numeroPoliza,
                            status: 'SUCCESS',
                            message: 'Registrada correctamente'
                        });
                    } catch (error: any) {
                        results.failed++;

                        let errorMessage = 'Error desconocido';
                        if (error instanceof DuplicatePolicyError) {
                            errorMessage = 'Póliza duplicada';
                        } else if (error.name === 'ValidationError') {
                            errorMessage =
                                'Error de validación: ' +
                                Object.keys(error.errors ?? {}).join(', ');
                        } else {
                            errorMessage = error.message;
                        }

                        results.details.push({
                            numeroPoliza: row[headers.indexOf('# DE POLIZA')] ?? 'Desconocido',
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

            // Eliminar el mensaje de progreso antes de mostrar resultados
            try {
                await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
            } catch (err) {
                this.logError('Error al eliminar mensaje de progreso:', err);
            }

            // Mostrar resumen
            await this.showResults(ctx, results);

            return true;
        } catch (error: any) {
            this.logError('Error al procesar Excel:', error);
            await ctx.reply('❌ Error al procesar el archivo Excel. Detalles: ' + error.message);
            return false;
        }
    }

    // Validar encabezados del Excel
    private validateHeaders(headers: string[]): boolean {
        if (!headers || !Array.isArray(headers)) {
            this.logError('Los encabezados no son un array válido', { headers });
            return false;
        }

        for (const field of REQUIRED_EXCEL_FIELDS) {
            if (!headers.includes(field)) {
                this.logError(`Falta el campo ${field} en los encabezados`, {
                    headers: headers.join(', ')
                });
                return false;
            }
        }
        return true;
    }

    // Mapear fila a objeto de póliza
    private mapRowToPolicy(headers: string[], row: any[]): Partial<IPolicyData> {
        const policyData: Partial<IPolicyData> = {};

        headers.forEach((header, index) => {
            const fieldName = HEADER_TO_FIELD_MAP[header];
            if (!fieldName) return;

            const value = row[index];

            // Procesamiento especial según el tipo de campo
            if (header === 'AÑO') {
                (policyData as any)[fieldName] = parseInt(value, 10);
            } else if (header === 'FECHA DE EMISION') {
                if (value) (policyData as any)[fieldName] = this.parseDate(value);
            } else if (header === 'CORREO ELECTRONICO') {
                (policyData as any)[fieldName] =
                    value && value.toLowerCase() === 'sin correo' ? '' : value;
            } else {
                (policyData as any)[fieldName] = this.formatFieldValue(header, value);
            }
        });

        // Valores por defecto
        policyData.estado = 'ACTIVO';
        policyData.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
        policyData.pagos = [];
        policyData.servicios = [];

        return policyData;
    }

    // Formatear valores de campo según el tipo
    private formatFieldValue(header: string, value: any): string {
        if (value === undefined || value === null) return '';
        const stringValue = String(value).trim();
        return UPPERCASE_FIELDS.includes(header) ? stringValue.toUpperCase() : stringValue;
    }

    // Analizar y convertir fecha desde varios formatos
    private parseDate(dateValue: any): Date {
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
    private validatePolicyData(policyData: Partial<IPolicyData>): IValidationResult {
        const errors: string[] = [];

        // Invertir el mapeo para obtener nombres amigables
        const fieldToHeader: Record<string, string> = {};
        for (const [header, field] of Object.entries(HEADER_TO_FIELD_MAP)) {
            fieldToHeader[field] = header;
        }

        // Campos requeridos basados en REQUIRED_EXCEL_FIELDS
        const requiredModelFields: (keyof IPolicyData)[] = REQUIRED_EXCEL_FIELDS.map(
            header => HEADER_TO_FIELD_MAP[header]
        );

        // Verificar campos faltantes
        for (const field of requiredModelFields) {
            if (!policyData[field]) {
                errors.push(`Falta ${fieldToHeader[field]}`);
            }
        }

        // Validaciones adicionales
        if (policyData.año && isNaN(policyData.año)) {
            errors.push('AÑO debe ser un número válido');
        }

        if (policyData.fechaEmision && !(policyData.fechaEmision instanceof Date)) {
            errors.push('FECHA DE EMISION no es válida');
        }

        return errors.length > 0 ? { isValid: false, errors } : { isValid: true, errors: [] };
    }

    // Mostrar resultados del procesamiento
    private async showResults(ctx: IContextBot, results: IProcessingResults): Promise<void> {
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
                const message = chunk.map(item => `${item.numeroPoliza}`).join('\n');
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
                const message = chunk
                    .map(item => `*${item.numeroPoliza}*: ${item.message}`)
                    .join('\n');

                await ctx.reply(message, { parse_mode: 'Markdown' });

                // Pequeña pausa para evitar flood
                if (i + ITEMS_PER_MESSAGE < failed.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
    }

    // Método para ser llamado desde CommandHandler
    setAwaitingExcelUpload(chatId: number, value = true): void {
        if (value) {
            this.awaitingExcelUpload.set(chatId, true);
            this.logInfo(`Estado awaiting Excel activado para chat ${chatId}`);
        } else {
            this.awaitingExcelUpload.delete(chatId);
            this.logInfo(`Estado awaiting Excel desactivado para chat ${chatId}`);
        }
    }
}

export default ExcelUploadHandler;
