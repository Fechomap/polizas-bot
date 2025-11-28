// src/types/policy-assignment.ts
/**
 * Tipos e interfaces para el flujo de asignación de pólizas
 * Centralizados para evitar duplicación y mejorar mantenibilidad
 */

import type { IVehicle, IPolicy } from './database';

/**
 * Estados del flujo de asignación de pólizas (Manual y OCR)
 */
export const ESTADOS_ASIGNACION = {
    // Estados compartidos
    SELECCION_METODO: 'seleccion_metodo',
    SELECCIONANDO_VEHICULO: 'seleccionando_vehiculo',
    ESPERANDO_NUMERO_POLIZA: 'esperando_numero_poliza',
    ESPERANDO_ASEGURADORA: 'esperando_aseguradora',
    ESPERANDO_NOMBRE_PERSONA: 'esperando_nombre_persona',
    SELECCIONANDO_FECHA_EMISION: 'seleccionando_fecha_emision',
    ESPERANDO_PRIMER_PAGO: 'esperando_primer_pago',
    ESPERANDO_SEGUNDO_PAGO: 'esperando_segundo_pago',
    ESPERANDO_PDF: 'esperando_pdf',
    ESPERANDO_PDF_FINAL: 'esperando_pdf_final',
    COMPLETADO: 'completado',
    // Estados específicos OCR
    ESPERANDO_PDF_OCR: 'esperando_pdf_ocr',
    PROCESANDO_OCR: 'procesando_ocr',
    CONFIRMANDO_DATOS: 'confirmando_datos',
    ESPERANDO_DATO_FALTANTE: 'esperando_dato_faltante'
} as const;

export type EstadoAsignacion = (typeof ESTADOS_ASIGNACION)[keyof typeof ESTADOS_ASIGNACION];

/**
 * Información de un archivo (PDF o foto)
 */
export interface IArchivoPoliza {
    type: 'pdf' | 'photo';
    file_id: string;
    file_name: string;
    file_size?: number;
    mime_type: string;
    buffer: Buffer;
}

/**
 * Datos recopilados de la póliza durante el flujo
 */
export interface IDatosPoliza {
    numeroPoliza?: string;
    aseguradora?: string;
    nombrePersona?: string;
    fechaEmision?: Date;
    fechaFinCobertura?: Date;
    primerPago?: number;
    segundoPago?: number;
    archivo?: IArchivoPoliza;
    modoOCR?: boolean;
    campoActual?: string;
    camposFaltantes?: string[];
    datosOCR?: IDatosPolizaExtraidos;
}

/**
 * Datos extraídos por OCR de Mistral
 */
export interface IDatosPolizaExtraidos {
    numeroPoliza?: string;
    aseguradora?: string;
    fechaInicioVigencia?: Date;
    fechaFinVigencia?: Date;
    primerPago?: number;
    segundoPago?: number;
    confianza?: number;
}

/**
 * Estado completo de una asignación en proceso
 */
export interface IAsignacionEnProceso {
    estado: EstadoAsignacion;
    chatId: number;
    threadId: number | null;
    vehiculo: IVehicle;
    datosPoliza: IDatosPoliza;
    iniciado: Date;
}

/**
 * Configuración de campos requeridos para el registro
 */
export interface ICampoRequerido {
    key: string;
    label: string;
    pregunta: string | null;
}

/**
 * Campos requeridos para el registro de póliza
 */
export const CAMPOS_REQUERIDOS: ICampoRequerido[] = [
    { key: 'numeroPoliza', label: 'Número de Póliza', pregunta: 'Ingresa el *número de póliza*:' },
    {
        key: 'aseguradora',
        label: 'Aseguradora',
        pregunta: 'Ingresa la *aseguradora*:\n📝 Ejemplo: GNP, AXA, Qualitas'
    },
    {
        key: 'nombrePersona',
        label: 'Persona que cotizó',
        pregunta: 'Ingresa el *nombre de la persona que cotizó*:'
    },
    { key: 'fechaEmision', label: 'Fecha de vigencia', pregunta: null },
    {
        key: 'primerPago',
        label: 'Primer pago',
        pregunta: 'Ingresa el monto del *primer pago*:\n💰 Solo números\n📝 Ejemplo: 8500'
    },
    {
        key: 'segundoPago',
        label: 'Segundo pago',
        pregunta:
            'Ingresa el monto del *segundo pago* (pagos subsecuentes):\n💰 Solo números\n📝 Ejemplo: 850'
    }
];

/**
 * Interfaz del bot de Telegram
 */
export interface IBot {
    telegram: {
        sendMessage(chatId: number, text: string, options?: any): Promise<any>;
        getFileLink(fileId: string): Promise<{ href: string }>;
        editMessageText(
            chatId: number,
            messageId: number,
            text: string,
            options?: any
        ): Promise<any>;
    };
}

/**
 * Resultado de validación
 */
export interface IValidacionResult {
    valido: boolean;
    error?: string;
    valorProcesado?: any;
}

/**
 * Opciones para enviar mensajes
 */
export interface ISendOptions {
    parse_mode?: 'Markdown' | 'HTML';
    message_thread_id?: number;
    reply_markup?: any;
}

/**
 * Resultado de subida de archivo
 */
export interface IUploadResult {
    success: boolean;
    url?: string;
    key?: string;
    size?: number;
    contentType?: string;
    error?: string;
}

/**
 * Archivo R2 para almacenar en póliza
 */
export interface IR2FileRecord {
    url: string;
    key: string;
    size: number;
    contentType: string;
    uploadDate: Date;
    originalName: string;
    fuenteOriginal?: string;
}
