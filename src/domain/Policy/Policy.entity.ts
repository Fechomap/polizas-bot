// src/domain/Policy/Policy.entity.ts

import { IServicio, IRegistro, IPago } from '../../types/database';

// Definimos un tipo para los datos de un nuevo servicio, para no depender de la interfaz de BD.
export interface ServiceData {
    costo: number;
    fechaServicio: Date;
    numeroExpediente: string;
    origenDestino: string;
}

/**
 * Representa la entidad de negocio de una Póliza.
 * Contiene la lógica y las reglas de negocio, independientemente de la base de datos.
 */
export class PolicyEntity {
    public readonly numeroPoliza: string;
    public titular: string;
    public estado: 'ACTIVO' | 'INACTIVO' | 'ELIMINADO';
    public diasRestantesGracia: number;

    private _servicios: IServicio[];
    private _registros: IRegistro[];
    private _pagos: IPago[];

    private _servicioCounter: number;

    constructor(props: {
        numeroPoliza: string;
        titular: string;
        estado: 'ACTIVO' | 'INACTIVO' | 'ELIMINADO';
        diasRestantesGracia: number;
        servicios?: IServicio[];
        registros?: IRegistro[];
        pagos?: IPago[];
        servicioCounter?: number;
    }) {
        this.numeroPoliza = props.numeroPoliza;
        this.titular = props.titular;
        this.estado = props.estado;
        this.diasRestantesGracia = props.diasRestantesGracia;
        this._servicios = props.servicios || [];
        this._registros = props.registros || [];
        this._pagos = props.pagos || [];
        this._servicioCounter = props.servicioCounter || 0;
    }

    /**
     * Comprueba si se puede añadir un nuevo servicio a esta póliza.
     * Regla de negocio: El estado debe ser 'ACTIVO' y debe tener días de gracia restantes.
     */
    public canAddService(): boolean {
        return this.estado === 'ACTIVO' && this.diasRestantesGracia > 0;
    }

    /**
     * Añade un nuevo servicio a la póliza, aplicando reglas de negocio.
     * @param serviceData - Los datos del nuevo servicio.
     * @returns El servicio que fue añadido.
     * @throws Error si no se puede añadir un servicio.
     */
    public addService(serviceData: ServiceData): IServicio {
        if (!this.canAddService()) {
            throw new Error(
                `No se puede añadir servicio a la póliza ${this.numeroPoliza} en estado ${this.estado}.`
            );
        }

        this._servicioCounter++;

        const newService: IServicio = {
            numeroServicio: this._servicioCounter,
            ...serviceData
        };

        this._servicios.push(newService);

        return newService;
    }

    // Getters para acceder a los datos de forma controlada
    get servicios(): IServicio[] {
        return [...this._servicios]; // Retornar una copia para inmutabilidad
    }

    get servicioCounter(): number {
        return this._servicioCounter;
    }

    // ... otros getters y métodos de negocio pueden ser añadidos aquí.
}
