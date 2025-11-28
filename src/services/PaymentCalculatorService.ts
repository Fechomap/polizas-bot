// src/services/PaymentCalculatorService.ts
/**
 * Servicio para cálculos de pagos pendientes
 * Responsabilidad única: lógica de cálculos de pólizas y pagos
 */

import Policy from '../models/policy';
import logger from '../utils/logger';

export interface IPago {
    estado: 'REALIZADO' | 'PLANIFICADO' | 'PENDIENTE';
    monto: number;
    fecha?: Date;
}

export interface IServicio {
    nombre?: string;
    tipo?: string;
}

export interface IPolicyData {
    numeroPoliza: string;
    fechaEmision: string | Date;
    pagos?: IPago[];
    estadoPoliza?: string;
    servicios?: IServicio[];
    estado: string;
}

export interface IPendingPolicy {
    numeroPoliza: string;
    diasDeImpago: number;
    montoRequerido: number;
    montoReferencia: number | null;
    fuenteMonto: string;
    estadoPoliza: string;
    pagosRealizados: number;
    diasTranscurridos: number;
    fechaLimiteCobertura: Date;
    fechaEmision: Date;
    servicios: IServicio[];
    diasHastaVencer?: number;
    prioridad?: number;
}

export interface IReportStats {
    totalPolicies: number;
    totalAmount: number;
    polizasConCosto: number;
    criticalPolicies: number;
    urgencyData: {
        critical: number;
        urgent: number;
        normal: number;
    };
}

export interface IGroupedPolicies {
    [key: string]: IPendingPolicy[];
}

export class PaymentCalculatorService {
    /**
     * Calcula fecha de cobertura basada en pagos realizados
     */
    calculateMonthsCoveredByPayments(emissionDate: string | Date, paymentsCount: number): Date {
        const emission = new Date(emissionDate);
        const coverageEndDate = new Date(emission);
        coverageEndDate.setMonth(coverageEndDate.getMonth() + paymentsCount);
        coverageEndDate.setDate(coverageEndDate.getDate() - 1);
        return coverageEndDate;
    }

    /**
     * Calcula días hasta el próximo mes sin pago
     */
    calculateDaysUntilNextMonthUnpaid(fechaLimiteCobertura: Date): number {
        const now = new Date();
        const nextMonth = new Date(fechaLimiteCobertura);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const msDiff = nextMonth.getTime() - now.getTime();
        return Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    }

    /**
     * Calcula pólizas con pagos pendientes
     */
    async calculatePendingPaymentsPolicies(): Promise<IPendingPolicy[]> {
        try {
            const policies: IPolicyData[] = await Policy.find({ estado: 'ACTIVO' }).lean();
            const now = new Date();
            const pendingPolicies: IPendingPolicy[] = [];

            for (const policy of policies) {
                const {
                    numeroPoliza,
                    fechaEmision,
                    pagos = [],
                    estadoPoliza,
                    servicios = []
                } = policy;

                if (!fechaEmision) continue;

                const pagosRealizados = pagos.filter((pago: IPago) => pago.estado === 'REALIZADO');
                const pagosPlanificados = pagos.filter(
                    (pago: IPago) => pago.estado === 'PLANIFICADO'
                );

                const fechaLimiteCobertura = this.calculateMonthsCoveredByPayments(
                    fechaEmision,
                    pagosRealizados.length
                );

                let diasDeImpago = 0;
                if (now > fechaLimiteCobertura) {
                    const msImpago = now.getTime() - fechaLimiteCobertura.getTime();
                    diasDeImpago = Math.floor(msImpago / (1000 * 60 * 60 * 24));
                }

                if (diasDeImpago > 0) {
                    const { montoRequerido, montoReferencia, fuenteMonto } =
                        this.calculateRequiredPayment(pagosPlanificados, pagosRealizados);

                    const msTranscurridos = now.getTime() - new Date(fechaEmision).getTime();
                    const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));

                    pendingPolicies.push({
                        numeroPoliza,
                        diasDeImpago,
                        montoRequerido,
                        montoReferencia,
                        fuenteMonto,
                        estadoPoliza: estadoPoliza || 'SIN_ESTADO',
                        pagosRealizados: pagosRealizados.length,
                        diasTranscurridos,
                        fechaLimiteCobertura,
                        fechaEmision: new Date(fechaEmision),
                        servicios: servicios || []
                    });
                }
            }

            return pendingPolicies.sort((a, b) => b.diasDeImpago - a.diasDeImpago);
        } catch (error) {
            logger.error('[PaymentCalculatorService] Error calculando pólizas pendientes:', error);
            throw error;
        }
    }

    /**
     * Calcula el monto de pago requerido
     */
    private calculateRequiredPayment(
        pagosPlanificados: IPago[],
        pagosRealizados: IPago[]
    ): { montoRequerido: number; montoReferencia: number | null; fuenteMonto: string } {
        let montoRequerido = 0;
        let montoReferencia: number | null = null;
        let fuenteMonto = 'SIN_DATOS';

        if (pagosPlanificados.length > 0) {
            if (pagosRealizados.length === 0) {
                if (pagosPlanificados[0]) {
                    montoRequerido = pagosPlanificados[0].monto;
                    fuenteMonto = 'PLANIFICADO_P1';
                }
            } else {
                if (pagosPlanificados[1]) {
                    montoRequerido = pagosPlanificados[1].monto;
                    fuenteMonto = 'PLANIFICADO_P2';
                } else if (pagosPlanificados[0]) {
                    montoRequerido = pagosPlanificados[0].monto;
                    fuenteMonto = 'PLANIFICADO_P1_FALLBACK';
                }
            }
        }

        if (montoRequerido === 0 && pagosRealizados.length > 0) {
            const ultimoPago = pagosRealizados[pagosRealizados.length - 1];
            montoReferencia = ultimoPago.monto;
            fuenteMonto = 'REFERENCIA_ULTIMO_PAGO';
        }

        return { montoRequerido, montoReferencia, fuenteMonto };
    }

    /**
     * Calcula estadísticas del reporte
     */
    calculateReportStats(pendingPolicies: IPendingPolicy[]): IReportStats {
        const totalPolicies = pendingPolicies.length;
        let totalAmount = 0;
        let criticalPolicies = 0;
        let urgent = 0;
        let normal = 0;
        let polizasConCosto = 0;

        pendingPolicies.forEach(policy => {
            const amount = policy.montoRequerido || policy.montoReferencia || 0;
            totalAmount += amount;

            if (amount > 0) {
                polizasConCosto++;
            }

            const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(
                policy.fechaLimiteCobertura
            );

            if (diasHastaVencer <= 2 && diasHastaVencer > 0) {
                criticalPolicies++;
            } else if (diasHastaVencer <= 15 && diasHastaVencer > 0) {
                urgent++;
            } else {
                normal++;
            }
        });

        return {
            totalPolicies,
            totalAmount,
            polizasConCosto,
            criticalPolicies,
            urgencyData: { critical: criticalPolicies, urgent, normal }
        };
    }

    /**
     * Agrupa pólizas por prioridad semanal
     */
    groupByWeeklyPriority(policies: IPendingPolicy[]): IGroupedPolicies {
        const grupos: IGroupedPolicies = {
            'URGENTE ESTA SEMANA (Lun-Dom)': [],
            'PROXIMAS 2 SEMANAS': [],
            'SIGUIENTES 2 SEMANAS': [],
            'MAS DE 1 MES': [],
            'YA VENCIDAS +30 DIAS': []
        };

        for (const policy of policies) {
            const diasHastaVencer = this.calculateDaysUntilNextMonthUnpaid(
                policy.fechaLimiteCobertura
            );

            if (diasHastaVencer <= 7 && diasHastaVencer > 0) {
                grupos['URGENTE ESTA SEMANA (Lun-Dom)'].push({
                    ...policy,
                    diasHastaVencer,
                    prioridad: 1
                });
            } else if (diasHastaVencer <= 14 && diasHastaVencer > 7) {
                grupos['PROXIMAS 2 SEMANAS'].push({ ...policy, diasHastaVencer, prioridad: 2 });
            } else if (diasHastaVencer <= 28 && diasHastaVencer > 14) {
                grupos['SIGUIENTES 2 SEMANAS'].push({ ...policy, diasHastaVencer, prioridad: 3 });
            } else if (diasHastaVencer > 28) {
                grupos['MAS DE 1 MES'].push({ ...policy, diasHastaVencer, prioridad: 4 });
            } else {
                grupos['YA VENCIDAS +30 DIAS'].push({ ...policy, diasHastaVencer, prioridad: 5 });
            }
        }

        // Ordenar cada grupo
        Object.keys(grupos).forEach(key => {
            grupos[key].sort((a, b) => (a.diasHastaVencer || 0) - (b.diasHastaVencer || 0));
        });

        return grupos;
    }

    /**
     * Calcula monto total
     */
    calculateTotalAmount(pendingPolicies: IPendingPolicy[]): number {
        return pendingPolicies.reduce((total, policy) => {
            return total + (policy.montoRequerido || policy.montoReferencia || 0);
        }, 0);
    }
}

// Singleton
let instance: PaymentCalculatorService | null = null;

export function getPaymentCalculatorService(): PaymentCalculatorService {
    if (!instance) {
        instance = new PaymentCalculatorService();
    }
    return instance;
}

export default PaymentCalculatorService;
