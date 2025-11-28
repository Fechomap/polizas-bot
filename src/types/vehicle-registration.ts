// src/types/vehicle-registration.ts
/**
 * Tipos e interfaces para el flujo de registro de vehículos
 */

export const ESTADOS_REGISTRO_VEHICULO = {
    ESPERANDO_SERIE: 'esperando_serie',
    ESPERANDO_MARCA: 'esperando_marca',
    ESPERANDO_SUBMARCA: 'esperando_submarca',
    ESPERANDO_AÑO: 'esperando_año',
    ESPERANDO_COLOR: 'esperando_color',
    ESPERANDO_PLACAS: 'esperando_placas',
    ESPERANDO_FOTOS: 'esperando_fotos',
    COMPLETADO: 'completado'
} as const;

export type EstadoRegistroVehiculo =
    (typeof ESTADOS_REGISTRO_VEHICULO)[keyof typeof ESTADOS_REGISTRO_VEHICULO];

/**
 * Datos del vehículo durante registro
 */
export interface IDatosVehiculo {
    serie?: string;
    marca?: string;
    submarca?: string;
    año?: number;
    color?: string;
    placas?: string;
    fotos?: IFotoVehiculo[];
    titular?: string;
    rfc?: string;
    telefono?: string;
    correo?: string;
    calle?: string;
    colonia?: string;
    municipio?: string;
    estadoRegion?: string;
    cp?: string;
}

/**
 * Foto del vehículo
 */
export interface IFotoVehiculo {
    fileId: string;
    fileName: string;
    mimeType: string;
    fileSize?: number;
    buffer?: Buffer;
    r2Url?: string;
    r2Key?: string;
}

/**
 * Estado completo de un registro en proceso
 */
export interface IRegistroVehiculoEnProceso {
    estado: EstadoRegistroVehiculo;
    chatId: number;
    threadId: number | null;
    datosVehiculo: IDatosVehiculo;
    fotosRecibidas: number;
    iniciado: Date;
}

/**
 * Resultado de validación de serie/VIN
 */
export interface IValidacionSerie {
    valida: boolean;
    error?: string;
    serieNormalizada?: string;
    esVIN?: boolean;
}

/**
 * Resultado de validación de placas
 */
export interface IValidacionPlacas {
    valida: boolean;
    error?: string;
    placasNormalizadas?: string;
    estado?: string;
}

/**
 * Resultado de creación de vehículo
 */
export interface ICrearVehiculoResult {
    success: boolean;
    vehiculo?: any;
    error?: string;
    esDuplicado?: boolean;
}

/**
 * Bot interface para vehículos
 */
export interface IVehicleBot {
    telegram: {
        sendMessage(chatId: number, text: string, options?: any): Promise<any>;
        getFileLink(fileId: string): Promise<{ href: string }>;
    };
}
