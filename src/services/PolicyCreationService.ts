// src/services/PolicyCreationService.ts
/**
 * Servicio para creación de pólizas
 * Responsabilidad única: persistencia y creación de registros de pólizas
 */

import * as policyController from '../controllers/policyController';
import { VehicleController } from '../controllers/vehicleController';
import type { IVehicle, IPolicy } from '../types/database';
import type { IDatosPoliza } from '../types/policy-assignment';
import logger from '../utils/logger';

export interface ICrearPolizaParams {
    vehiculo: IVehicle;
    datosPoliza: IDatosPoliza;
    userId: string;
    modoOCR?: boolean;
}

export interface ICrearPolizaResult {
    success: boolean;
    poliza?: IPolicy;
    error?: string;
    esDuplicada?: boolean;
}

export class PolicyCreationService {
    /**
     * Crea una nueva póliza a partir de datos del vehículo y póliza
     */
    async crearPoliza(params: ICrearPolizaParams): Promise<ICrearPolizaResult> {
        const { vehiculo, datosPoliza, userId, modoOCR = false } = params;

        try {
            // Construir objeto de póliza
            const nuevaPoliza: any = {
                // Datos del vehículo
                marca: vehiculo.marca,
                submarca: vehiculo.submarca,
                año: vehiculo.anio,
                color: vehiculo.color,
                serie: vehiculo.serie,
                placas: vehiculo.placas,

                // Datos del titular
                titular: vehiculo.titular,
                rfc: vehiculo.rfc,
                telefono: vehiculo.telefono,
                correo: vehiculo.correo,
                calle: vehiculo.calle,
                colonia: vehiculo.colonia,
                municipio: vehiculo.municipio,
                estadoRegion: vehiculo.estadoRegion,
                cp: vehiculo.cp,

                // Datos de la póliza
                numeroPoliza: datosPoliza.numeroPoliza,
                aseguradora: datosPoliza.aseguradora,
                agenteCotizador: datosPoliza.nombrePersona,
                fechaEmision: datosPoliza.fechaEmision,
                fechaFinCobertura: datosPoliza.fechaFinCobertura,

                // Pagos planificados
                pagos: this.construirPagos(datosPoliza),

                // Metadatos
                vehicleId: vehiculo.id,
                creadoViaOBD: true,
                asignadoPor: userId
            };

            // Crear póliza en BD
            const polizaGuardada = await policyController.savePolicy(nuevaPoliza);

            logger.info(
                `[PolicyCreationService] Póliza creada: ${polizaGuardada.numeroPoliza} (${modoOCR ? 'OCR' : 'manual'})`
            );

            return { success: true, poliza: polizaGuardada };
        } catch (error: any) {
            // Detectar error de póliza duplicada
            if (
                error?.name === 'DuplicatePolicyError' ||
                error?.message?.includes('Ya existe una póliza')
            ) {
                logger.warn(
                    `[PolicyCreationService] Póliza duplicada: ${datosPoliza.numeroPoliza}`
                );
                return {
                    success: false,
                    error: `Ya existe una póliza con el número ${datosPoliza.numeroPoliza}`,
                    esDuplicada: true
                };
            }

            logger.error('[PolicyCreationService] Error creando póliza:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Marca un vehículo como asegurado
     */
    async marcarVehiculoConPoliza(vehiculoId: string, policyId: string): Promise<boolean> {
        try {
            await VehicleController.marcarConPoliza(vehiculoId, policyId);
            logger.info(`[PolicyCreationService] Vehículo ${vehiculoId} marcado con póliza`);
            return true;
        } catch (error: any) {
            logger.error('[PolicyCreationService] Error marcando vehículo:', error);
            return false;
        }
    }

    /**
     * Construye array de pagos planificados
     */
    private construirPagos(datosPoliza: IDatosPoliza): any[] {
        const pagos: any[] = [];

        if (datosPoliza.primerPago) {
            pagos.push({
                monto: datosPoliza.primerPago,
                fechaPago: datosPoliza.fechaEmision,
                estado: 'PLANIFICADO',
                notas: 'Pago inicial'
            });
        }

        if (datosPoliza.segundoPago && datosPoliza.fechaEmision) {
            const fechaSegundoPago = new Date(datosPoliza.fechaEmision);
            fechaSegundoPago.setMonth(fechaSegundoPago.getMonth() + 1);

            pagos.push({
                monto: datosPoliza.segundoPago,
                fechaPago: fechaSegundoPago,
                estado: 'PLANIFICADO',
                notas: 'Pago mensual'
            });
        }

        return pagos;
    }

    /**
     * Calcula fecha de fin de cobertura (1 año después de emisión)
     */
    calcularFechaFinCobertura(fechaEmision: Date): Date {
        const fechaFin = new Date(fechaEmision);
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);
        return fechaFin;
    }
}

// Singleton
let instance: PolicyCreationService | null = null;

export function getPolicyCreationService(): PolicyCreationService {
    instance ??= new PolicyCreationService();
    return instance;
}

export default PolicyCreationService;
