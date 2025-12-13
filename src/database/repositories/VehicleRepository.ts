/**
 * VehicleRepository - Acceso a datos de vehículos con Prisma/PostgreSQL
 */

import { prisma } from '../prisma';
import type { Vehicle, VehicleStatus } from '../../generated/prisma';

class VehicleRepository {
    /**
     * Busca vehículo por serie (VIN)
     */
    async findBySerie(serie: string): Promise<Vehicle | null> {
        return prisma.vehicle.findUnique({
            where: { serie: serie.toUpperCase().trim() }
        });
    }

    /**
     * Busca vehículo por ID
     */
    async findById(id: string): Promise<Vehicle | null> {
        return prisma.vehicle.findUnique({
            where: { id }
        });
    }

    /**
     * Busca vehículos por placas
     */
    async findByPlacas(placas: string): Promise<Vehicle | null> {
        return prisma.vehicle.findFirst({
            where: {
                placas: placas.toUpperCase().trim(),
                estado: { not: 'ELIMINADO' }
            }
        });
    }

    /**
     * Lista vehículos sin póliza
     */
    async findSinPoliza(): Promise<Vehicle[]> {
        return prisma.vehicle.findMany({
            where: { estado: 'SIN_POLIZA' },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Lista vehículos por creador
     */
    async findByCreadoPor(creadoPor: string): Promise<Vehicle[]> {
        return prisma.vehicle.findMany({
            where: {
                creadoPor,
                estado: { not: 'ELIMINADO' }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Cuenta vehículos por estado
     */
    async countByEstado(estado: VehicleStatus): Promise<number> {
        return prisma.vehicle.count({
            where: { estado }
        });
    }

    /**
     * Crea un nuevo vehículo
     */
    async create(
        data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Vehicle> {
        return prisma.vehicle.create({ data });
    }

    /**
     * Actualiza un vehículo
     */
    async update(id: string, data: Partial<Vehicle>): Promise<Vehicle> {
        return prisma.vehicle.update({
            where: { id },
            data
        });
    }

    /**
     * Marca vehículo con póliza
     */
    async marcarConPoliza(id: string): Promise<Vehicle> {
        return prisma.vehicle.update({
            where: { id },
            data: { estado: 'CON_POLIZA' }
        });
    }

    /**
     * Marca vehículo como eliminado (soft delete)
     */
    async softDelete(id: string): Promise<Vehicle> {
        return prisma.vehicle.update({
            where: { id },
            data: { estado: 'ELIMINADO' }
        });
    }

    /**
     * Obtiene datos del titular desde un vehículo
     */
    async getDatosTitular(id: string) {
        const vehicle = await prisma.vehicle.findUnique({
            where: { id },
            select: {
                titular: true,
                rfc: true,
                telefono: true,
                correo: true,
                calle: true,
                colonia: true,
                municipio: true,
                estadoRegion: true,
                cp: true
            }
        });

        return vehicle;
    }
}

// Singleton
export const vehicleRepository = new VehicleRepository();
export default vehicleRepository;
