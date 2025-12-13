// src/services/AutoCleanupService.ts
// Migrado de Mongoose a Prisma/PostgreSQL

import { prisma } from '../database/prisma';
import logger from '../utils/logger';

interface ICleanupStats {
    automaticDeletions: number;
    expiredPoliciesFound: number;
    errors: number;
}

interface IExpiredPolicyInfo {
    numeroPoliza: string;
    titular: string;
    aseguradora: string;
    fechaEmision: Date;
    estadoPoliza: string;
    servicios: number;
    diasVencida: number;
}

interface ICleanupResult {
    success: boolean;
    stats: ICleanupStats;
    expiredPolicies: IExpiredPolicyInfo[];
    error?: string;
}

interface ICleanupPreview {
    policiesToDelete: number;
    expiredPoliciesFound: number;
    examplePolicies: {
        numeroPoliza: string;
        titular: string;
        servicios: number;
    }[];
    exampleExpired: {
        numeroPoliza: string;
        titular: string;
        estado: string;
    }[];
}

interface IPreviewResult {
    success: boolean;
    preview: ICleanupPreview;
    error?: string;
}

class AutoCleanupService {
    private stats: ICleanupStats;

    constructor() {
        this.stats = {
            automaticDeletions: 0,
            expiredPoliciesFound: 0,
            errors: 0
        };
    }

    /**
     * Ejecuta la limpieza automática de pólizas
     * @returns {Object} Estadísticas del proceso
     */
    async executeAutoCleanup(): Promise<ICleanupResult> {
        logger.info('🔄 Iniciando limpieza automática de pólizas');

        this.resetStats();

        try {
            // PASO 1: Eliminación automática de pólizas con >= 2 servicios
            await this.deletePolizasWithTwoOrMoreServices();

            // PASO 2: Reporte de pólizas vencidas para revisión manual
            const expiredPolicies = await this.getExpiredPoliciesForReview();

            logger.info('✅ Limpieza automática completada', {
                automaticDeletions: this.stats.automaticDeletions,
                expiredPoliciesFound: this.stats.expiredPoliciesFound,
                errors: this.stats.errors
            });

            return {
                success: true,
                stats: this.stats,
                expiredPolicies: expiredPolicies
            };
        } catch (error) {
            logger.error('❌ Error en limpieza automática:', error);
            this.stats.errors++;

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stats: this.stats,
                expiredPolicies: []
            };
        }
    }

    /**
     * Elimina automáticamente pólizas con 2 o más servicios confirmados
     */
    private async deletePolizasWithTwoOrMoreServices(): Promise<void> {
        logger.info('🔍 Buscando pólizas con >= 2 servicios para eliminación automática');

        try {
            // Buscar pólizas activas con conteo de servicios >= 2 usando Prisma
            const polizasWithServiceCount = await prisma.policy.findMany({
                where: { estado: 'ACTIVO' },
                select: {
                    id: true,
                    numeroPoliza: true,
                    _count: {
                        select: { servicios: true }
                    }
                }
            });

            // Filtrar las que tienen >= 2 servicios
            const polizasToDelete = polizasWithServiceCount.filter(
                p => p._count.servicios >= 2
            );

            logger.info(
                `📊 Encontradas ${polizasToDelete.length} pólizas con ≥ 2 servicios para eliminación automática`
            );

            if (polizasToDelete.length === 0) {
                return;
            }

            // Eliminar cada póliza usando borrado lógico
            for (const poliza of polizasToDelete) {
                try {
                    const serviciosCount = poliza._count.servicios;
                    await this.deletePolizaLogically(
                        poliza.numeroPoliza,
                        `Eliminación automática: ${serviciosCount} servicios confirmados`
                    );

                    this.stats.automaticDeletions++;

                    logger.info(
                        `✅ Póliza ${poliza.numeroPoliza} eliminada automáticamente (${serviciosCount} servicios)`
                    );
                } catch (error) {
                    logger.error(`❌ Error eliminando póliza ${poliza.numeroPoliza}:`, error);
                    this.stats.errors++;
                }
            }
        } catch (error) {
            logger.error('❌ Error buscando pólizas con >= 2 servicios:', error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Obtiene pólizas vencidas para revisión manual
     * @returns {Array} Lista de pólizas vencidas
     */
    private async getExpiredPoliciesForReview(): Promise<IExpiredPolicyInfo[]> {
        logger.info('🔍 Buscando pólizas vencidas para revisión manual');

        try {
            // Buscar pólizas activas con estado VENCIDA usando Prisma
            const expiredPolicies = await prisma.policy.findMany({
                where: {
                    estado: 'ACTIVO',
                    estadoPoliza: 'VENCIDA'
                },
                select: {
                    numeroPoliza: true,
                    titular: true,
                    aseguradora: true,
                    fechaEmision: true,
                    estadoPoliza: true,
                    _count: {
                        select: { servicios: true }
                    }
                },
                orderBy: { fechaEmision: 'asc' } // Ordenar por fecha de emisión (más antiguas primero)
            });

            this.stats.expiredPoliciesFound = expiredPolicies.length;

            logger.info(`📊 Encontradas ${expiredPolicies.length} pólizas vencidas para revisión`);

            // Formatear datos para el reporte
            return expiredPolicies.map(poliza => ({
                numeroPoliza: poliza.numeroPoliza,
                titular: poliza.titular,
                aseguradora: poliza.aseguradora,
                fechaEmision: poliza.fechaEmision,
                estadoPoliza: poliza.estadoPoliza ?? 'DESCONOCIDO',
                servicios: poliza._count.servicios,
                diasVencida: this.calculateDaysExpired(poliza.fechaEmision)
            }));
        } catch (error) {
            logger.error('❌ Error buscando pólizas vencidas:', error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Realiza borrado lógico de una póliza
     * @param {string} numeroPoliza - Número de la póliza
     * @param {string} motivo - Motivo de eliminación
     */
    private async deletePolizaLogically(numeroPoliza: string, motivo: string): Promise<void> {
        const policy = await prisma.policy.findFirst({
            where: { numeroPoliza }
        });

        if (!policy) {
            throw new Error(`Póliza ${numeroPoliza} no encontrada`);
        }

        if (policy.estado === 'ELIMINADO') {
            logger.warn(`Póliza ${numeroPoliza} ya está eliminada`);
            return;
        }

        // Aplicar borrado lógico usando Prisma
        await prisma.policy.update({
            where: { id: policy.id },
            data: {
                estado: 'ELIMINADO',
                fechaEliminacion: new Date(),
                motivoEliminacion: motivo
            }
        });

        logger.info(`🗑️ Póliza ${numeroPoliza} marcada como eliminada: ${motivo}`);
    }

    /**
     * Calcula días transcurridos desde emisión (aproximado para vencimiento)
     * @param {Date} fechaEmision
     * @returns {number} Días desde emisión
     */
    private calculateDaysExpired(fechaEmision: Date): number {
        const now = new Date();
        const emissionDate = new Date(fechaEmision);
        const diffTime = Math.abs(now.getTime() - emissionDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Reinicia las estadísticas del proceso
     */
    private resetStats(): void {
        this.stats = {
            automaticDeletions: 0,
            expiredPoliciesFound: 0,
            errors: 0
        };
    }

    /**
     * Obtiene un resumen previo de lo que se va a procesar SIN ejecutar
     * @returns {Object} Resumen previo
     */
    async getCleanupPreview(): Promise<IPreviewResult> {
        logger.info('🔍 Generando resumen previo de limpieza automática');

        try {
            // Contar pólizas con >= 2 servicios (para eliminación automática)
            const allActivePolicies = await prisma.policy.findMany({
                where: { estado: 'ACTIVO' },
                select: {
                    numeroPoliza: true,
                    titular: true,
                    _count: { select: { servicios: true } }
                }
            });

            const policiesToDeleteList = allActivePolicies.filter(p => p._count.servicios >= 2);
            const polizasToDelete = policiesToDeleteList.length;

            // Contar pólizas vencidas (para reporte)
            const expiredPolicies = await prisma.policy.count({
                where: {
                    estado: 'ACTIVO',
                    estadoPoliza: 'VENCIDA'
                }
            });

            // Obtener algunos ejemplos para mostrar
            const examplePolicies = policiesToDeleteList.slice(0, 5).map(p => ({
                numeroPoliza: p.numeroPoliza,
                titular: p.titular,
                servicios: p._count.servicios
            }));

            const exampleExpiredData = await prisma.policy.findMany({
                where: {
                    estado: 'ACTIVO',
                    estadoPoliza: 'VENCIDA'
                },
                select: {
                    numeroPoliza: true,
                    titular: true,
                    estadoPoliza: true
                },
                take: 3
            });

            return {
                success: true,
                preview: {
                    policiesToDelete: polizasToDelete,
                    expiredPoliciesFound: expiredPolicies,
                    examplePolicies,
                    exampleExpired: exampleExpiredData.map(p => ({
                        numeroPoliza: p.numeroPoliza,
                        titular: p.titular,
                        estado: p.estadoPoliza ?? 'DESCONOCIDO'
                    }))
                }
            };
        } catch (error) {
            logger.error('❌ Error generando resumen previo:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                preview: {
                    policiesToDelete: 0,
                    expiredPoliciesFound: 0,
                    examplePolicies: [],
                    exampleExpired: []
                }
            };
        }
    }

    /**
     * Obtiene estadísticas del último proceso
     * @returns {Object} Estadísticas
     */
    getStats(): ICleanupStats {
        return { ...this.stats };
    }
}

export default AutoCleanupService;
