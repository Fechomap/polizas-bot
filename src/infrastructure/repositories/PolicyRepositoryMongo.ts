// src/infrastructure/repositories/PolicyRepositoryMongo.ts

import { IPolicyRepository } from '../../domain/Policy/IPolicyRepository';
import { PolicyEntity } from '../../domain/Policy/Policy.entity';
import PolicyModel from '../../models/policy';
import { IPolicy } from '../../types/database';
import logger from '../../utils/logger';

/**
 * Implementación del repositorio de pólizas utilizando Mongoose.
 * Es el adaptador entre la capa de dominio y la base de datos MongoDB.
 */
export class PolicyRepositoryMongo implements IPolicyRepository {
    /**
     * Mapea un documento de Mongoose (IPolicy) a una entidad de dominio (PolicyEntity).
     */
    private toEntity(doc: IPolicy): PolicyEntity {
        return new PolicyEntity({
            numeroPoliza: doc.numeroPoliza,
            titular: doc.titular,
            estado: doc.estado,
            diasRestantesGracia: doc.diasRestantesGracia,
            servicios: doc.servicios,
            registros: doc.registros,
            pagos: doc.pagos,
            servicioCounter: doc.servicioCounter
        });
    }

    /**
     * Mapea una entidad de dominio (PolicyEntity) a un objeto de datos para Mongoose.
     */
    private toDocumentData(entity: PolicyEntity): Partial<IPolicy> {
        return {
            numeroPoliza: entity.numeroPoliza,
            titular: entity.titular,
            estado: entity.estado,
            diasRestantesGracia: entity.diasRestantesGracia,
            servicios: entity.servicios,
            servicioCounter: entity.servicioCounter
            // Aquí se mapearían otras propiedades si fueran modificables en la entidad
        };
    }

    async findByNumber(numeroPoliza: string): Promise<PolicyEntity | null> {
        try {
            const doc = await PolicyModel.findOne({ numeroPoliza, estado: 'ACTIVO' }).lean();
            if (!doc) return null;
            return this.toEntity(doc as IPolicy);
        } catch (error) {
            logger.error(
                `Error en PolicyRepositoryMongo.findByNumber para ${numeroPoliza}:`,
                error
            );
            throw error;
        }
    }

    async save(policy: PolicyEntity): Promise<void> {
        try {
            const data = this.toDocumentData(policy);
            await PolicyModel.updateOne({ numeroPoliza: policy.numeroPoliza }, { $set: data });
            // Aquí podríamos invalidar el caché, aunque es mejor hacerlo en el caso de uso
        } catch (error) {
            logger.error(`Error en PolicyRepositoryMongo.save para ${policy.numeroPoliza}:`, error);
            throw error;
        }
    }

    async generateUniquePolicyNumber(): Promise<string> {
        // Implementación simple para generar un número único (esto podría ser más complejo)
        const prefix = 'POL-';
        let unique = false;
        let number = '';
        while (!unique) {
            number = prefix + Math.random().toString().slice(2, 10);
            const existing = await this.findByNumber(number);
            if (!existing) {
                unique = true;
            }
        }
        return number;
    }
}
