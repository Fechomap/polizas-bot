// src/application/use-cases/AddServiceUseCase.ts

import {
    PolicyService,
    PolicyNotFoundError,
    PolicyInactiveError
} from '../../domain/Policy/Policy.service';
import { ServiceData } from '../../domain/Policy/Policy.entity';
import logger from '../../utils/logger';

// Input Data Transfer Object (DTO)
export interface AddServiceInput {
    numeroPoliza: string;
    serviceData: ServiceData;
}

// Output Data Transfer Object (DTO)
export interface AddServiceOutput {
    success: boolean;
    message: string;
    numeroServicio?: number;
    numeroPoliza?: string;
}

/**
 * Caso de Uso para añadir un servicio a una póliza.
 * Orquesta la lógica de la aplicación, desacoplando el dominio de la presentación.
 */
export class AddServiceUseCase {
    constructor(private readonly policyService: PolicyService) {}

    async execute(input: AddServiceInput): Promise<AddServiceOutput> {
        try {
            logger.info(`Iniciando caso de uso AddService para póliza: ${input.numeroPoliza}`);

            const updatedPolicy = await this.policyService.addServiceToPolicy(
                input.numeroPoliza,
                input.serviceData
            );

            const numeroServicio = updatedPolicy.servicioCounter;

            logger.info(
                `Servicio #${numeroServicio} añadido exitosamente a la póliza ${input.numeroPoliza} a través del caso de uso.`
            );

            return {
                success: true,
                message: `Servicio #${numeroServicio} añadido correctamente.`,
                numeroServicio,
                numeroPoliza: updatedPolicy.numeroPoliza
            };
        } catch (error: any) {
            logger.error(`Error en AddServiceUseCase para póliza ${input.numeroPoliza}:`, {
                error: error.message
            });

            if (error instanceof PolicyNotFoundError) {
                return { success: false, message: error.message };
            }
            if (error instanceof PolicyInactiveError) {
                return { success: false, message: error.message };
            }

            // Para errores inesperados
            return {
                success: false,
                message: 'Ocurrió un error inesperado al añadir el servicio.'
            };
        }
    }
}
