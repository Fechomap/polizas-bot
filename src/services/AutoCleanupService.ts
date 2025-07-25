// src/services/AutoCleanupService.ts
import Policy from '../models/policy';
import logger from '../utils/logger';
import { IPolicy } from '../../types';

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
            // Buscar pólizas activas con 2 o más servicios
            const polizasToDelete = await Policy.find({
                estado: 'ACTIVO',
                $expr: { $gte: [{ $size: '$servicios' }, 2] }
            }).select('numeroPoliza servicios');

            logger.info(
                `📊 Encontradas ${polizasToDelete.length} pólizas con ≥ 2 servicios para eliminación automática`
            );

            if (polizasToDelete.length === 0) {
                return;
            }

            // Eliminar cada póliza usando borrado lógico
            for (const poliza of polizasToDelete) {
                try {
                    await this.deletePolizaLogically(
                        poliza.numeroPoliza,
                        `Eliminación automática: ${poliza.servicios.length} servicios confirmados`
                    );

                    this.stats.automaticDeletions++;

                    logger.info(
                        `✅ Póliza ${poliza.numeroPoliza} eliminada automáticamente (${poliza.servicios.length} servicios)`
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
            // Buscar pólizas activas con estado VENCIDA
            const expiredPolicies = await Policy.find({
                estado: 'ACTIVO',
                estadoPoliza: 'VENCIDA'
            })
                .select('numeroPoliza titular aseguradora fechaEmision estadoPoliza servicios')
                .sort({ fechaEmision: 1 }); // Ordenar por fecha de emisión (más antiguas primero)

            this.stats.expiredPoliciesFound = expiredPolicies.length;

            logger.info(`📊 Encontradas ${expiredPolicies.length} pólizas vencidas para revisión`);

            // Formatear datos para el reporte
            return expiredPolicies.map(poliza => ({
                numeroPoliza: poliza.numeroPoliza,
                titular: poliza.titular,
                aseguradora: poliza.aseguradora,
                fechaEmision: poliza.fechaEmision,
                estadoPoliza: poliza.estadoPoliza || 'DESCONOCIDO',
                servicios: poliza.servicios ? poliza.servicios.length : 0,
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
        const policy = await Policy.findOne({ numeroPoliza });

        if (!policy) {
            throw new Error(`Póliza ${numeroPoliza} no encontrada`);
        }

        if (policy.estado === 'ELIMINADO') {
            logger.warn(`Póliza ${numeroPoliza} ya está eliminada`);
            return;
        }

        // Aplicar borrado lógico
        policy.estado = 'ELIMINADO';
        policy.fechaEliminacion = new Date();
        policy.motivoEliminacion = motivo;

        await policy.save();

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
            const polizasToDelete = await Policy.countDocuments({
                estado: 'ACTIVO',
                $expr: { $gte: [{ $size: '$servicios' }, 2] }
            });

            // Contar pólizas vencidas (para reporte)
            const expiredPolicies = await Policy.countDocuments({
                estado: 'ACTIVO',
                estadoPoliza: 'VENCIDA'
            });

            // Obtener algunos ejemplos para mostrar
            const examplePolicies = await Policy.find({
                estado: 'ACTIVO',
                $expr: { $gte: [{ $size: '$servicios' }, 2] }
            })
                .select('numeroPoliza servicios titular')
                .limit(5);

            const exampleExpired = await Policy.find({
                estado: 'ACTIVO',
                estadoPoliza: 'VENCIDA'
            })
                .select('numeroPoliza titular estadoPoliza')
                .limit(3);

            return {
                success: true,
                preview: {
                    policiesToDelete: polizasToDelete,
                    expiredPoliciesFound: expiredPolicies,
                    examplePolicies: examplePolicies.map(p => ({
                        numeroPoliza: p.numeroPoliza,
                        titular: p.titular,
                        servicios: p.servicios.length
                    })),
                    exampleExpired: exampleExpired.map(p => ({
                        numeroPoliza: p.numeroPoliza,
                        titular: p.titular,
                        estado: p.estadoPoliza || 'DESCONOCIDO'
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
