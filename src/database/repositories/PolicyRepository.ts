/**
 * PolicyRepository - Acceso a datos de pólizas con Prisma/PostgreSQL
 *
 * Este repositorio reemplaza las llamadas directas a Mongoose
 */

import { prisma } from '../prisma';
import type {
    Policy,
    Pago,
    Registro,
    Servicio,
    PolicyStatus,
    PagoStatus,
    RegistroStatus
} from '../../generated/prisma';

// Tipos de retorno
export type PolicyWithRelations = Policy & {
    pagos?: Pago[];
    registros?: Registro[];
    servicios?: Servicio[];
};

// Opciones de búsqueda
interface FindPoliciesOptions {
    estado?: PolicyStatus;
    limit?: number;
    offset?: number;
    orderBy?: 'asc' | 'desc';
}

class PolicyRepository {
    /**
     * Busca póliza por número
     */
    async findByNumeroPoliza(numeroPoliza: string): Promise<PolicyWithRelations | null> {
        return prisma.policy.findUnique({
            where: { numeroPoliza: numeroPoliza.toUpperCase().trim() },
            include: {
                pagos: true,
                registros: true,
                servicios: true
            }
        });
    }

    /**
     * Busca póliza por ID
     */
    async findById(id: string): Promise<PolicyWithRelations | null> {
        return prisma.policy.findUnique({
            where: { id },
            include: {
                pagos: true,
                registros: true,
                servicios: true
            }
        });
    }

    /**
     * Busca pólizas por RFC
     */
    async findByRfc(rfc: string): Promise<Policy[]> {
        return prisma.policy.findMany({
            where: {
                rfc: rfc.toUpperCase().trim(),
                estado: { not: 'ELIMINADO' }
            }
        });
    }

    /**
     * Busca pólizas por placas
     */
    async findByPlacas(placas: string): Promise<Policy[]> {
        return prisma.policy.findMany({
            where: {
                placas: placas.toUpperCase().trim(),
                estado: { not: 'ELIMINADO' }
            }
        });
    }

    /**
     * Busca pólizas por teléfono
     */
    async findByTelefono(telefono: string): Promise<Policy[]> {
        return prisma.policy.findMany({
            where: {
                telefono: { contains: telefono },
                estado: { not: 'ELIMINADO' }
            }
        });
    }

    /**
     * Busca pólizas por titular (búsqueda parcial)
     */
    async searchByTitular(titular: string): Promise<Policy[]> {
        return prisma.policy.findMany({
            where: {
                titular: { contains: titular, mode: 'insensitive' },
                estado: { not: 'ELIMINADO' }
            },
            take: 50
        });
    }

    /**
     * Lista pólizas con opciones de filtrado
     */
    async findMany(options: FindPoliciesOptions = {}): Promise<Policy[]> {
        const { estado, limit = 100, offset = 0, orderBy = 'desc' } = options;

        return prisma.policy.findMany({
            where: estado ? { estado } : { estado: { not: 'ELIMINADO' } },
            orderBy: { createdAt: orderBy },
            take: limit,
            skip: offset
        });
    }

    /**
     * Cuenta pólizas activas
     */
    async countActive(): Promise<number> {
        return prisma.policy.count({
            where: { estado: 'ACTIVO' }
        });
    }

    /**
     * Crea una nueva póliza
     */
    async create(data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Policy> {
        return prisma.policy.create({ data });
    }

    /**
     * Actualiza una póliza
     */
    async update(id: string, data: Partial<Policy>): Promise<Policy> {
        return prisma.policy.update({
            where: { id },
            data
        });
    }

    /**
     * Actualiza una póliza por número
     */
    async updateByNumeroPoliza(
        numeroPoliza: string,
        data: Partial<Policy>
    ): Promise<Policy> {
        return prisma.policy.update({
            where: { numeroPoliza: numeroPoliza.toUpperCase().trim() },
            data
        });
    }

    /**
     * Marca póliza como eliminada (soft delete)
     */
    async softDelete(numeroPoliza: string, motivo: string): Promise<Policy> {
        return prisma.policy.update({
            where: { numeroPoliza: numeroPoliza.toUpperCase().trim() },
            data: {
                estado: 'ELIMINADO',
                fechaEliminacion: new Date(),
                motivoEliminacion: motivo
            }
        });
    }

    // === PAGOS ===

    /**
     * Agrega un pago a la póliza
     */
    async addPago(
        policyId: string,
        pago: Omit<Pago, 'id' | 'policyId' | 'createdAt' | 'updatedAt'>
    ): Promise<Pago> {
        return prisma.pago.create({
            data: { ...pago, policyId }
        });
    }

    /**
     * Obtiene pagos de una póliza
     */
    async getPagos(policyId: string): Promise<Pago[]> {
        return prisma.pago.findMany({
            where: { policyId },
            orderBy: { fechaPago: 'desc' }
        });
    }

    /**
     * Cuenta pagos realizados
     */
    async countPagosRealizados(policyId: string): Promise<number> {
        return prisma.pago.count({
            where: { policyId, estado: 'REALIZADO' }
        });
    }

    // === REGISTROS ===

    /**
     * Agrega un registro a la póliza
     */
    async addRegistro(
        policyId: string,
        registro: Omit<Registro, 'id' | 'policyId' | 'createdAt' | 'updatedAt'>
    ): Promise<Registro> {
        // Obtener siguiente número de registro
        const policy = await prisma.policy.findUnique({
            where: { id: policyId },
            select: { registroCounter: true }
        });

        const nextNumber = (policy?.registroCounter ?? 0) + 1;

        // Crear registro y actualizar contador en transacción
        const [createdRegistro] = await prisma.$transaction([
            prisma.registro.create({
                data: { ...registro, policyId, numeroRegistro: nextNumber }
            }),
            prisma.policy.update({
                where: { id: policyId },
                data: { registroCounter: nextNumber }
            })
        ]);

        return createdRegistro;
    }

    /**
     * Actualiza estado de un registro
     */
    async updateRegistroEstado(
        registroId: string,
        estado: RegistroStatus
    ): Promise<Registro> {
        return prisma.registro.update({
            where: { id: registroId },
            data: { estado }
        });
    }

    // === SERVICIOS ===

    /**
     * Agrega un servicio a la póliza
     */
    async addServicio(
        policyId: string,
        servicio: Omit<Servicio, 'id' | 'policyId' | 'createdAt' | 'updatedAt'>
    ): Promise<Servicio> {
        // Obtener siguiente número de servicio
        const policy = await prisma.policy.findUnique({
            where: { id: policyId },
            select: { servicioCounter: true, totalServicios: true }
        });

        const nextNumber = (policy?.servicioCounter ?? 0) + 1;
        const newTotal = (policy?.totalServicios ?? 0) + 1;

        // Crear servicio y actualizar contadores en transacción
        const [createdServicio] = await prisma.$transaction([
            prisma.servicio.create({
                data: { ...servicio, policyId, numeroServicio: nextNumber }
            }),
            prisma.policy.update({
                where: { id: policyId },
                data: { servicioCounter: nextNumber, totalServicios: newTotal }
            })
        ]);

        return createdServicio;
    }

    /**
     * Obtiene servicios de una póliza
     */
    async getServicios(policyId: string): Promise<Servicio[]> {
        return prisma.servicio.findMany({
            where: { policyId },
            orderBy: { fechaServicio: 'desc' }
        });
    }
}

// Singleton
export const policyRepository = new PolicyRepository();
export default policyRepository;
