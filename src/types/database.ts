// types/database.d.ts - Tipos para base de datos

import { Document, ObjectId } from 'mongoose';

// Interfaz para archivos almacenados
export interface IFile {
    data?: Buffer;
    contentType?: string;
}

// Interfaz para archivos en R2
export interface IR2File {
    url: string;
    key: string;
    size: number;
    contentType: string;
    uploadDate: Date;
    originalName?: string;
    fuenteOriginal?: string;
}

// Alias para compatibilidad con documentHandler.ts
export interface IR2FileObject {
    url: string;
    key: string;
    size: number;
    contentType: string;
    uploadedAt: Date;
    originalName?: string;
    fuenteOriginal?: string;
}

// Interfaz para coordenadas
export interface ICoordenadas {
    origen: {
        lat: number;
        lng: number;
    };
    destino: {
        lat: number;
        lng: number;
    };
}

// Interfaz para información de ruta
export interface IRutaInfo {
    distanciaKm: number;
    tiempoMinutos: number;
    googleMapsUrl?: string;
    aproximado?: boolean;
}

// Interfaz para el titular de póliza
export interface ITitular {
    nombre: string;
    correo?: string;
    telefono?: string;
    rfc?: string;
}

// Interfaz para datos mexicanos
export interface IDatosMexicanos {
    titular: string;
    rfc: string;
    telefono: string;
    correo: string;
    calle: string;
    colonia: string;
    municipio: string;
    estado: string;
    estadoRegion: string;
    cp: string;
}

// Interfaz para servicios de póliza
export interface IServicio {
    numeroServicio: number;
    numeroRegistroOrigen?: number;
    costo: number;
    fechaServicio: Date;
    numeroExpediente: string;
    origenDestino: string;
    fechaContactoProgramada?: Date;
    fechaTerminoProgramada?: Date;
    coordenadas?: ICoordenadas;
    rutaInfo?: IRutaInfo;
}

// Interfaz para pagos
export interface IPago {
    monto: number;
    fechaPago: Date;
    estado: 'PLANIFICADO' | 'REALIZADO' | 'CANCELADO';
    metodoPago?: string;
    referencia?: string;
    notas?: string;
}

// Interfaz base para Policy
export interface IPolicy extends Document {
    _id: ObjectId;
    // Datos del titular
    titular: string;
    correo?: string;
    contraseña?: string;
    rfc: string;
    telefono?: string;

    // Dirección
    calle: string;
    colonia: string;
    municipio: string;
    estadoRegion?: string;
    cp: string;

    // Datos del vehículo
    marca: string;
    submarca: string;
    año: number;
    color: string;
    serie: string;
    placas: string;

    // Datos de la póliza
    agenteCotizador: string;
    aseguradora: string;
    numeroPoliza: string;
    fechaEmision: Date;

    // Campos adicionales
    estadoPoliza?: string;
    fechaFinCobertura?: Date;
    fechaFinGracia?: Date;
    diasRestantesCobertura: number;
    diasRestantesGracia: number;

    // Calificación y servicios
    calificacion: number;
    totalServicios: number;

    // Contadores
    servicioCounter: number;
    registroCounter: number;

    // Arrays
    pagos: any[];
    registros: any[];
    servicios: any[];

    // Archivos
    archivos: {
        fotos: IFile[];
        pdfs: IFile[];
        r2Files: {
            fotos: IR2File[];
            pdfs: IR2File[];
        };
    };

    // Estado
    estado: 'ACTIVO' | 'INACTIVO' | 'ELIMINADO';
    fechaEliminacion?: Date;
    motivoEliminacion?: string;

    // BD AUTOS
    vehicleId?: ObjectId;
    creadoViaOBD: boolean;
    asignadoPor?: string;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

// Alias para compatibilidad con ExcelUploadHandler
export type IPolicyData = IPolicy;

// Interfaces para procesamiento de Excel
export interface IProcessingDetail {
    numeroPoliza: string;
    status: 'SUCCESS' | 'ERROR';
    message: string;
}

export interface IProcessingResults {
    total: number;
    successful: number;
    failed: number;
    details: IProcessingDetail[];
}

export interface IValidationResult {
    isValid: boolean;
    errors: string[];
}

// Interfaces para upload de archivos
export interface IUploadResult {
    url: string;
    key: string;
    size: number;
    contentType?: string;
}

// Interfaz para Vehicle
export interface IVehicle extends Document {
    _id: ObjectId;
    // Identificación del vehículo
    serie: string;
    marca: string;
    submarca: string;
    año: number;
    color: string;
    placas: string;

    // Datos del titular
    titular: string;
    rfc: string;
    telefono: string;
    correo: string;

    // Dirección del titular
    calle?: string;
    colonia?: string;
    municipio?: string;
    estadoRegion?: string;
    cp?: string;

    // Archivos
    archivos: {
        fotos: IFile[];
        r2Files: {
            fotos: IR2File[];
        };
    };

    // Estado
    estado: 'SIN_POLIZA' | 'CON_POLIZA' | 'ELIMINADO';

    // Metadatos
    creadoPor: string;
    creadoVia: 'TELEGRAM_BOT' | 'WEB_INTERFACE' | 'API';
    notas?: string;

    // Referencia a póliza
    policyId?: ObjectId;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

// Interfaz para notificaciones programadas
export interface IScheduledNotification extends Document {
    _id: ObjectId;

    // Información de la póliza
    numeroPoliza: string;
    expedienteNum: string;
    origenDestino?: string;

    // Datos adicionales
    placas?: string;
    fotoUrl?: string;
    marcaModelo?: string;
    colorVehiculo?: string;
    telefono?: string;

    // Programación
    contactTime: string;
    scheduledDate: Date;
    lastScheduledAt?: Date;
    processingStartedAt?: Date;

    // Metadatos
    createdBy?: {
        chatId?: number;
        username?: string;
    };
    targetGroupId: number;

    // Tipo y estado
    tipoNotificacion: 'CONTACTO' | 'TERMINO' | 'MANUAL';
    status: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';

    // Control de envío
    sentAt?: Date;
    error?: string;
    retryCount: number;
    lastRetryAt?: Date;

    // Datos adicionales
    additionalData?: Record<string, any>;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

// Interfaces adicionales para tipos de datos

export interface IPolicyDataAlternative {
    titular: string;
    correo?: string;
    rfc?: string;
    telefono?: string;
    calle?: string;
    colonia?: string;
    municipio?: string;
    estadoRegion?: string;
    cp?: string;
    marca: string;
    submarca: string;
    año: number;
    color: string;
    serie: string;
    placas: string;
    agenteCotizador: string;
    aseguradora: string;
    numeroPoliza: string;
    fechaEmision: Date;
    notas?: string;
}

export interface IVehicleData {
    serie: string;
    marca: string;
    submarca: string;
    año: number;
    color: string;
    placas?: string;
    titular?: string;
    rfc?: string;
    telefono?: string;
    correo?: string;
    calle?: string;
    colonia?: string;
    municipio?: string;
    estado?: string;
    estadoRegion?: string;
    cp?: string;
    notas?: string;
}

export interface IDatosMexicanos {
    titular: string;
    rfc: string;
    telefono: string;
    correo: string;
    calle: string;
    colonia: string;
    municipio: string;
    estadoRegion: string;
    cp: string;
    coordenadas?: {
        lat: number;
        lng: number;
    };
}

export interface IFileObject {
    data: Buffer;
    contentType: string;
}

export interface IRegistro {
    numeroRegistro: number;
    costo: number;
    fechaRegistro: Date;
    numeroExpediente: string;
    origenDestino: string;
    estado: 'PENDIENTE' | 'ASIGNADO' | 'NO_ASIGNADO';
    coordenadas?: ICoordenadas;
    rutaInfo?: IRutaInfo;
    fechaContactoProgramada?: Date;
    fechaTerminoProgramada?: Date;
}
