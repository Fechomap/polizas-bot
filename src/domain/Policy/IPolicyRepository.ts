// src/domain/Policy/IPolicyRepository.ts

import { PolicyEntity } from './Policy.entity';

/**
 * Interfaz que define las operaciones de persistencia para la entidad Policy.
 * Esto desacopla el dominio de la implementación de la base de datos (ej. Mongoose).
 */
export interface IPolicyRepository {
    /**
     * Busca una póliza por su número.
     * @param numeroPoliza - El número de la póliza.
     * @returns Una instancia de PolicyEntity o null si no se encuentra.
     */
    findByNumber(numeroPoliza: string): Promise<PolicyEntity | null>;

    /**
     * Guarda (crea o actualiza) una póliza.
     * @param policy - La entidad de póliza a guardar.
     */
    save(policy: PolicyEntity): Promise<void>;

    /**
     * Genera un número de póliza único.
     */
    generateUniquePolicyNumber(): Promise<string>;
}
