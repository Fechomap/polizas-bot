// src/comandos/comandos/ExcelUploadHandler.ts
import { BaseCommand } from './BaseCommand';
import * as XLSX from 'xlsx';
import {
    savePolicy,
    DuplicatePolicyError,
    savePoliciesBatch
} from '../../controllers/policyController';
import { Markup } from 'telegraf';
import logger from '../../utils/logger';
import StateKeyManager from '../../utils/StateKeyManager';
import type {
    IContextBot,
    IPolicyData,
    IProcessingResults,
    IProcessingDetail,
    IValidationResult
} from '../../../types/index';

interface IHeaderMapping {
    [key: string]: keyof IPolicyData;
}

interface IFieldNames {
    [key: string]: string;
}

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

        // Lista ampliada de MIME types que Telegram puede asignar a archivos Excel
        const validMimeTypes: string[] = [
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
        const isExcelExtension =
            fileName.toLowerCase().endsWith('.xlsx') ||
            fileName.toLowerCase().endsWith('.xls') ||
            fileName.toLowerCase().endsWith('.xlsm');

        // Verificar mimetype (menos confiable pero es un respaldo)
        const isExcelMimeType = validMimeTypes.includes(mimeType);

        const isExcel = isExcelExtension || isExcelMimeType;
        this.logInfo(
            `Es Excel: ${isExcel} (extensión: ${isExcelExtension}, mimeType: ${isExcelMimeType})`
        );

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

            // Leer el Excel
            this.logInfo('Leyendo Excel con XLSX.read', { chatId });
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            this.logInfo(`Excel leído correctamente. Hojas: ${workbook.SheetNames.join(', ')}`, {
                chatId
            });

            // Obtener la primera hoja
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];

            // Convertir a JSON (array de objetos)
            const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
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
                                numeroPoliza: policyData.numeroPoliza || 'Desconocido',
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
                                Object.keys(error.errors || {}).join(', ');
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
        // Objeto para mapear los encabezados del Excel a los campos del modelo
        const headerMapping: IHeaderMapping = {
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

        const policyData: Partial<IPolicyData> = {};

        // Mapear cada campo del Excel al objeto policyData
        headers.forEach((header, index) => {
            if (headerMapping[header]) {
                const value = row[index];

                // Procesamiento especial para ciertos campos
                if (header === 'AÑO') {
                    // Convertir año a número
                    (policyData as any)[headerMapping[header]] = parseInt(value, 10);
                } else if (header === 'FECHA DE EMISION') {
                    // Convertir fecha a objeto Date
                    if (value) {
                        (policyData as any)[headerMapping[header]] = this.parseDate(value);
                    }
                } else if (header === 'CORREO ELECTRONICO') {
                    // Manejar correo electrónico (convertir 'sin correo' a '')
                    (policyData as any)[headerMapping[header]] =
                        value && value.toLowerCase() === 'sin correo' ? '' : value;
                } else {
                    // Para campos de texto, asegurar que sean string y transformar según las reglas
                    (policyData as any)[headerMapping[header]] = this.formatFieldValue(
                        header,
                        value
                    );
                }
            }
        });

        // Establecer estado como ACTIVO por defecto
        policyData.estado = 'ACTIVO';

        // Inicializar arreglos vacíos para archivos, pagos y servicios
        policyData.archivos = {
            fotos: [],
            pdfs: [],
            r2Files: { fotos: [], pdfs: [] }
        };
        policyData.pagos = [];
        policyData.servicios = [];

        return policyData;
    }

    // Formatear valores de campo según el tipo
    private formatFieldValue(header: string, value: any): string {
        if (value === undefined || value === null) {
            return '';
        }

        const stringValue = String(value);

        // Campos que deben ser en mayúsculas
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

        // Mapeo de campos técnicos a nombres amigables
        const fieldNames: IFieldNames = {
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

        // Campos obligatorios
        const requiredFields: (keyof IPolicyData)[] = [
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

        // Verificar campos faltantes
        for (const field of requiredFields) {
            if (!policyData[field]) {
                errors.push(`Falta ${fieldNames[field]}`);
            }
        }

        // Validaciones adicionales
        if (policyData.año && isNaN(policyData.año)) {
            errors.push('AÑO debe ser un número válido');
        }

        if (policyData.fechaEmision && !(policyData.fechaEmision instanceof Date)) {
            errors.push('FECHA DE EMISION no es válida');
        }

        // Retornar el resultado de validación
        if (errors.length > 0) {
            return { isValid: false, errors: errors };
        }

        return { isValid: true, errors: [] };
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
