// src/domain/Policy/Policy.service.ts

import { IPolicyRepository } from './IPolicyRepository';
import { PolicyEntity, ServiceData } from './Policy.entity';

// Errores de dominio personalizados para un mejor manejo de excepciones
export class PolicyNotFoundError extends Error {
    constructor(numeroPoliza: string) {
        super(`Póliza con número ${numeroPoliza} no fue encontrada.`);
        this.name = 'PolicyNotFoundError';
    }
}

export class PolicyInactiveError extends Error {
    constructor(numeroPoliza: string) {
        super(`La póliza ${numeroPoliza} no está activa y no puede recibir nuevos servicios.`);
        this.name = 'PolicyInactiveError';
    }
}

/**
 * Servicio de dominio para la entidad Policy.
 * Orquesta la lógica de negocio que involucra a la entidad y su repositorio.
 */
export class PolicyService {
    constructor(private readonly policyRepo: IPolicyRepository) {}

    /**
     * Lógica de negocio para añadir un servicio a una póliza.
     * @param numeroPoliza - El número de la póliza a modificar.
     * @param serviceData - Los datos del nuevo servicio.
     * @returns La entidad de póliza actualizada.
     * @throws PolicyNotFoundError si la póliza no se encuentra.
     * @throws PolicyInactiveError si la póliza no está en un estado que permita añadir servicios.
     */
    async addServiceToPolicy(
        numeroPoliza: string,
        serviceData: ServiceData
    ): Promise<PolicyEntity> {
        // 1. Obtener la entidad desde el repositorio
        const policy = await this.policyRepo.findByNumber(numeroPoliza);

        if (!policy) {
            throw new PolicyNotFoundError(numeroPoliza);
        }

        // 2. Ejecutar la lógica de negocio en la entidad
        // El método `addService` ya contiene la validación `canAddService`.
        try {
            policy.addService(serviceData);
        } catch (error) {
            // Re-lanzar como un error de dominio específico
            throw new PolicyInactiveError(numeroPoliza);
        }

        // 3. Guardar la entidad modificada a través del repositorio
        await this.policyRepo.save(policy);

        return policy;
    }

    /**
     * Crea una nueva póliza.
     * @param props - Los datos para crear la nueva póliza.
     * @returns La entidad de la nueva póliza.
     */
    async createPolicy(
        props: ConstructorParameters<typeof PolicyEntity>[0]
    ): Promise<PolicyEntity> {
        const newPolicy = new PolicyEntity(props);
        await this.policyRepo.save(newPolicy);
        return newPolicy;
    }
}
