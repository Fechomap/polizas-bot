/**
 * Tipos e interfaces para el flujo de Ocupar Póliza
 */

import { Context } from 'telegraf';
import type { IThreadSafeStateMap } from '../../utils/StateKeyManager';
import type { IPolicy } from '../../types/database';

// Información de servicio programado
export interface IScheduledServiceInfo {
    numeroPoliza: string;
    expediente?: string;
    contactTime?: string;
    origin?: string;
    destination?: string;
    origenDestino?: string;
    scheduledDate?: Date;
    policy?: IPolicy;
}

// Datos en caché de la póliza
export interface IPolicyCacheData {
    numeroPoliza: string;
    policy: IPolicy;
    origenCoords?: { lat: number; lng: number };
    destinoCoords?: { lat: number; lng: number };
    coordenadas?: {
        origen: { lat: number; lng: number };
        destino: { lat: number; lng: number };
    };
    rutaInfo?: any;
}

// Información de geocoding
export interface IGeocodingInfo {
    ubicacionCorta: string;
    direccionCompleta?: string;
    colonia?: string;
    municipio?: string;
    ciudad?: string;
    estado?: string;
    pais?: string;
    codigoPostal?: string;
    fallback?: boolean;
}

// Datos mejorados de leyenda
export interface IEnhancedLegendData {
    leyenda: string;
    origenGeo: IGeocodingInfo;
    destinoGeo: IGeocodingInfo;
    googleMapsUrl: string;
}

// Coordenadas
export interface ICoordinates {
    lat: number;
    lng: number;
}

// Handler base que expone los mapas de estado
export interface IFlowHandler {
    bot: any;
    awaitingPhoneNumber: IThreadSafeStateMap<string>;
    awaitingOrigenDestino: IThreadSafeStateMap<string>;
    awaitingOrigen: IThreadSafeStateMap<string>;
    awaitingDestino: IThreadSafeStateMap<string>;
    awaitingServiceData: IThreadSafeStateMap<string>;
    awaitingServicePolicyNumber: IThreadSafeStateMap<boolean>;
    excelUploadMessages?: Map<number, number>;
    processingCallbacks?: Set<string>;
    uploadTargets: IThreadSafeStateMap<string>;
    viewFilesCallbacks?: any;
    clearChatState(chatId: number, threadId?: string | null): void;
    handleAddServicePolicyNumber?(ctx: Context, numeroPoliza: string): Promise<void>;
}

// Contexto del flujo (datos compartidos entre steps)
export interface IFlowContext {
    chatId: number;
    threadId: string | null;
    numeroPoliza: string;
    policy?: IPolicy;
}

// Resultado de un step
export interface IStepResult {
    success: boolean;
    message?: string;
    data?: any;
}
