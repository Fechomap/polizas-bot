// types/database.ts - Tipos para base de datos (Compatible con Prisma)

// Re-exportar tipos de Prisma
export type {
    Policy,
    Vehicle,
    ScheduledNotification,
    Aseguradora,
    Pago,
    Registro,
    Servicio,
    PolicyFileLegacy,
    PolicyFileR2,
    VehicleFileLegacy,
    VehicleFileR2,
    PolicyStatus,
    VehicleStatus,
    PagoStatus,
    RegistroStatus,
    NotificationStatus,
    NotificationType
} from '../generated/prisma';

// Alias para compatibilidad con código existente
import type {
    Policy,
    Vehicle,
    ScheduledNotification,
    Pago,
    Registro,
    Servicio
} from '../generated/prisma';

// Importar tipos de archivos de Prisma
import type { PolicyFileR2, PolicyFileLegacy } from '../generated/prisma';

// IPolicy incluye relaciones
export type IPolicy = Policy & {
    pagos?: Pago[];
    registros?: Registro[];
    servicios?: Servicio[];
    // Relaciones de archivos de Prisma
    archivosR2?: PolicyFileR2[];
    archivosLegacy?: PolicyFileLegacy[];
    // Compatibilidad con código que usa archivos embebidos (legacy, deprecated)
    archivos?: {
        fotos?: IFile[];
        pdfs?: IFile[];
        r2Files?: {
            fotos?: IR2File[];
            pdfs?: IR2File[];
        };
    };
    // Alias para compatibilidad
    año?: number; // alias de anio
};

// IVehicle con compatibilidad
export type IVehicle = Vehicle & {
    archivos?: {
        fotos?: IFile[];
        r2Files?: {
            fotos?: IR2File[];
        };
    };
    año?: number; // alias de anio
};

export type IScheduledNotification = ScheduledNotification;

// Interfaz para archivos almacenados (legacy)
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
    uploadDate?: Date;
    originalName?: string;
    fuenteOriginal?: string;
}

// Alias para compatibilidad
export interface IR2FileObject {
    url: string;
    key: string;
    size: number;
    contentType: string;
    uploadedAt?: Date;
    originalName?: string;
    fuenteOriginal?: string;
}

// Interfaz para coordenadas
export interface ICoordenadas {
    origen?: {
        lat?: number;
        lng?: number;
    };
    destino?: {
        lat?: number;
        lng?: number;
    };
}

// Interfaz para información de ruta
export interface IRutaInfo {
    distanciaKm?: number;
    tiempoMinutos?: number;
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
    estado?: string;
    estadoRegion: string;
    cp: string;
    coordenadas?: {
        lat: number;
        lng: number;
    };
}

// Interfaz para servicios de póliza (compatible con Prisma)
export interface IServicio {
    id?: string;
    policyId?: string;
    numeroServicio?: number | null;
    numeroRegistroOrigen?: number | null;
    costo?: number | null;
    fechaServicio?: Date | null;
    numeroExpediente?: string | null;
    origenDestino?: string | null;
    fechaContactoProgramada?: Date | null;
    fechaTerminoProgramada?: Date | null;
    coordenadas?: ICoordenadas;
    rutaInfo?: IRutaInfo;
    // Campos Prisma adicionales
    createdAt?: Date;
    updatedAt?: Date;
}

// Interfaz para pagos (compatible con Prisma)
export interface IPago {
    id?: string;
    policyId?: string;
    monto: number;
    fechaPago: Date;
    estado?: 'PLANIFICADO' | 'REALIZADO' | 'CANCELADO' | 'VENCIDO' | 'PENDIENTE' | string;
    metodoPago?: string | null;
    referencia?: string | null;
    notas?: string | null;
    fechaRegistro?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

// Interfaz para registros (compatible con Prisma)
export interface IRegistro {
    id?: string;
    policyId?: string;
    numeroRegistro?: number | null;
    costo?: number | null;
    fechaRegistro?: Date | null;
    numeroExpediente?: string | null;
    origenDestino?: string | null;
    estado?: 'PENDIENTE' | 'ASIGNADO' | 'NO_ASIGNADO' | string;
    coordenadas?: ICoordenadas;
    rutaInfo?: IRutaInfo;
    fechaContactoProgramada?: Date | null;
    fechaTerminoProgramada?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

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

// Interfaces para datos de entrada
export interface IPolicyData {
    titular: string;
    correo?: string;
    contraseña?: string;
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
    estado?: 'ACTIVO' | 'INACTIVO' | 'ELIMINADO';
    archivos?: { fotos: any[]; pdfs: any[]; r2Files?: { fotos: any[]; pdfs: any[] } };
    pagos?: any[];
    servicios?: any[];
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

export interface IFileObject {
    data: Buffer;
    contentType: string;
}
