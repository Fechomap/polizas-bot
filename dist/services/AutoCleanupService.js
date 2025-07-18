"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const policy_1 = __importDefault(require("../models/policy"));
const logger_1 = __importDefault(require("../utils/logger"));
class AutoCleanupService {
    constructor() {
        this.stats = {
            automaticDeletions: 0,
            expiredPoliciesFound: 0,
            errors: 0
        };
    }
    async executeAutoCleanup() {
        logger_1.default.info('🔄 Iniciando limpieza automática de pólizas');
        this.resetStats();
        try {
            await this.deletePolizasWithTwoOrMoreServices();
            const expiredPolicies = await this.getExpiredPoliciesForReview();
            logger_1.default.info('✅ Limpieza automática completada', {
                automaticDeletions: this.stats.automaticDeletions,
                expiredPoliciesFound: this.stats.expiredPoliciesFound,
                errors: this.stats.errors
            });
            return {
                success: true,
                stats: this.stats,
                expiredPolicies: expiredPolicies
            };
        }
        catch (error) {
            logger_1.default.error('❌ Error en limpieza automática:', error);
            this.stats.errors++;
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stats: this.stats,
                expiredPolicies: []
            };
        }
    }
    async deletePolizasWithTwoOrMoreServices() {
        logger_1.default.info('🔍 Buscando pólizas con >= 2 servicios para eliminación automática');
        try {
            const polizasToDelete = await policy_1.default.find({
                estado: 'ACTIVO',
                $expr: { $gte: [{ $size: '$servicios' }, 2] }
            }).select('numeroPoliza servicios');
            logger_1.default.info(`📊 Encontradas ${polizasToDelete.length} pólizas con ≥ 2 servicios para eliminación automática`);
            if (polizasToDelete.length === 0) {
                return;
            }
            for (const poliza of polizasToDelete) {
                try {
                    await this.deletePolizaLogically(poliza.numeroPoliza, `Eliminación automática: ${poliza.servicios.length} servicios confirmados`);
                    this.stats.automaticDeletions++;
                    logger_1.default.info(`✅ Póliza ${poliza.numeroPoliza} eliminada automáticamente (${poliza.servicios.length} servicios)`);
                }
                catch (error) {
                    logger_1.default.error(`❌ Error eliminando póliza ${poliza.numeroPoliza}:`, error);
                    this.stats.errors++;
                }
            }
        }
        catch (error) {
            logger_1.default.error('❌ Error buscando pólizas con >= 2 servicios:', error);
            this.stats.errors++;
            throw error;
        }
    }
    async getExpiredPoliciesForReview() {
        logger_1.default.info('🔍 Buscando pólizas vencidas para revisión manual');
        try {
            const expiredPolicies = await policy_1.default.find({
                estado: 'ACTIVO',
                estadoPoliza: 'VENCIDA'
            })
                .select('numeroPoliza titular aseguradora fechaEmision estadoPoliza servicios')
                .sort({ fechaEmision: 1 });
            this.stats.expiredPoliciesFound = expiredPolicies.length;
            logger_1.default.info(`📊 Encontradas ${expiredPolicies.length} pólizas vencidas para revisión`);
            return expiredPolicies.map(poliza => ({
                numeroPoliza: poliza.numeroPoliza,
                titular: poliza.titular,
                aseguradora: poliza.aseguradora,
                fechaEmision: poliza.fechaEmision,
                estadoPoliza: poliza.estadoPoliza,
                servicios: poliza.servicios ? poliza.servicios.length : 0,
                diasVencida: this.calculateDaysExpired(poliza.fechaEmision)
            }));
        }
        catch (error) {
            logger_1.default.error('❌ Error buscando pólizas vencidas:', error);
            this.stats.errors++;
            throw error;
        }
    }
    async deletePolizaLogically(numeroPoliza, motivo) {
        const policy = await policy_1.default.findOne({ numeroPoliza });
        if (!policy) {
            throw new Error(`Póliza ${numeroPoliza} no encontrada`);
        }
        if (policy.estado === 'ELIMINADO') {
            logger_1.default.warn(`Póliza ${numeroPoliza} ya está eliminada`);
            return;
        }
        policy.estado = 'ELIMINADO';
        policy.fechaEliminacion = new Date();
        policy.motivoEliminacion = motivo;
        await policy.save();
        logger_1.default.info(`🗑️ Póliza ${numeroPoliza} marcada como eliminada: ${motivo}`);
    }
    calculateDaysExpired(fechaEmision) {
        const now = new Date();
        const emissionDate = new Date(fechaEmision);
        const diffTime = Math.abs(now.getTime() - emissionDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    resetStats() {
        this.stats = {
            automaticDeletions: 0,
            expiredPoliciesFound: 0,
            errors: 0
        };
    }
    async getCleanupPreview() {
        logger_1.default.info('🔍 Generando resumen previo de limpieza automática');
        try {
            const polizasToDelete = await policy_1.default.countDocuments({
                estado: 'ACTIVO',
                $expr: { $gte: [{ $size: '$servicios' }, 2] }
            });
            const expiredPolicies = await policy_1.default.countDocuments({
                estado: 'ACTIVO',
                estadoPoliza: 'VENCIDA'
            });
            const examplePolicies = await policy_1.default.find({
                estado: 'ACTIVO',
                $expr: { $gte: [{ $size: '$servicios' }, 2] }
            })
                .select('numeroPoliza servicios titular')
                .limit(5);
            const exampleExpired = await policy_1.default.find({
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
                        estado: p.estadoPoliza
                    }))
                }
            };
        }
        catch (error) {
            logger_1.default.error('❌ Error generando resumen previo:', error);
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
    getStats() {
        return { ...this.stats };
    }
}
exports.default = AutoCleanupService;
