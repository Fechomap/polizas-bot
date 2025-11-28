/**
 * Tipos e interfaces para el módulo de Policy Handler
 */

export interface IPolicySearchResult {
    _id: string;
    numeroPoliza: string;
    titular: string;
    rfc: string;
    correo: string;
    contraseña: string;
    calle: string;
    colonia: string;
    municipio: string;
    estadoRegion: string;
    cp: string;
    agenteCotizador: string;
    aseguradora: string;
    fechaEmision: Date;
    telefono: string;
    estadoPoliza: string;
    fechaFinCobertura: Date;
    fechaFinGracia: Date;
    marca: string;
    submarca: string;
    año: string;
    color: string;
    serie: string;
    placas: string;
    calificacion: number;
    totalServicios: number;
    servicios: any[];
    registros: any[];
    estado: string;
    fechaEliminacion: Date;
    motivoEliminacion: string;
    toObject(): any;
}

export interface IEnrichedPolicy extends IPolicySearchResult {
    serviciosCount: number;
    estadoText: string;
}

export interface IFieldMapping {
    dbField: string;
    displayName: string;
    validation?: (value: string) => boolean;
    transform?: (value: string) => any;
}

export interface IEditState {
    policyId: string;
    fieldName: string;
    fieldDisplayName: string;
}

export interface IMassSelectionState {
    selectedPolicies: string[];
    operation: 'delete' | 'restore';
}

export const FIELD_MAPPINGS: Record<string, IFieldMapping> = {
    // Datos personales
    titular: { dbField: 'titular', displayName: 'Titular' },
    rfc: { dbField: 'rfc', displayName: 'RFC' },
    correo: { dbField: 'correo', displayName: 'Correo' },
    telefono: { dbField: 'telefono', displayName: 'Teléfono' },

    // Dirección
    calle: { dbField: 'calle', displayName: 'Calle' },
    colonia: { dbField: 'colonia', displayName: 'Colonia' },
    municipio: { dbField: 'municipio', displayName: 'Municipio' },
    estadoRegion: { dbField: 'estadoRegion', displayName: 'Estado' },
    cp: { dbField: 'cp', displayName: 'Código Postal' },

    // Vehículo
    marca: { dbField: 'marca', displayName: 'Marca' },
    submarca: { dbField: 'submarca', displayName: 'Submarca' },
    año: { dbField: 'año', displayName: 'Año' },
    color: { dbField: 'color', displayName: 'Color' },
    serie: { dbField: 'serie', displayName: 'Serie' },
    placas: { dbField: 'placas', displayName: 'Placas' },

    // Póliza
    numeroPoliza: { dbField: 'numeroPoliza', displayName: 'Número de Póliza' },
    aseguradora: { dbField: 'aseguradora', displayName: 'Aseguradora' },
    agenteCotizador: { dbField: 'agenteCotizador', displayName: 'Agente' },
    estadoPoliza: { dbField: 'estadoPoliza', displayName: 'Estado de Póliza' },

    // Financiero
    calificacion: { dbField: 'calificacion', displayName: 'Calificación' }
};

// Motivos de eliminación con códigos cortos para callbacks (límite 64 bytes)
export const DELETION_REASONS_MAP: Record<string, string> = {
    pv: 'Póliza vencida',
    sc: 'Solicitud del cliente',
    ii: 'Información incorrecta',
    dup: 'Duplicado',
    otro: 'Otro motivo'
};

// Array de códigos para iterar
export const DELETION_REASON_CODES = Object.keys(DELETION_REASONS_MAP);

// Legacy export para compatibilidad
export const DELETION_REASONS = Object.values(DELETION_REASONS_MAP);
