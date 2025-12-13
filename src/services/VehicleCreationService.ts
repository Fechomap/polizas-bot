// src/services/VehicleCreationService.ts
/**
 * Servicio para creación de vehículos
 * Responsabilidad única: persistencia de vehículos
 * Migrado de Mongoose a Prisma/PostgreSQL
 */

import { prisma } from '../database/prisma';
import { generarDatosMexicanosReales } from '../utils/mexicanDataGenerator';
import logger from '../utils/logger';
import type { IDatosVehiculo, ICrearVehiculoResult } from '../types/vehicle-registration';

export class VehicleCreationService {
    /**
     * Crea un nuevo vehículo en la base de datos
     */
    async crearVehiculo(datos: IDatosVehiculo): Promise<ICrearVehiculoResult> {
        try {
            // Validar que serie existe
            if (!datos.serie) {
                return {
                    success: false,
                    error: 'La serie del vehículo es requerida',
                    esDuplicado: false
                };
            }

            // Verificar duplicados por serie
            const existente = await prisma.vehicle.findUnique({
                where: { serie: datos.serie.toUpperCase() }
            });
            if (existente) {
                return {
                    success: false,
                    error: `Ya existe un vehículo con la serie ${datos.serie}`,
                    esDuplicado: true
                };
            }

            // Generar datos de titular si no se proporcionan
            const datosTitular = await this.generarDatosTitular(datos);

            // Crear vehículo con Prisma
            const vehiculoGuardado = await prisma.vehicle.create({
                data: {
                    serie: datos.serie.toUpperCase(),
                    marca: datos.marca ?? 'SIN MARCA',
                    submarca: datos.submarca ?? 'SIN SUBMARCA',
                    anio: datos.año ?? new Date().getFullYear(),
                    color: datos.color ?? 'SIN COLOR',
                    placas: datos.placas ?? 'SIN PLACAS',
                    estado: 'SIN_POLIZA',
                    titular: datosTitular.titular ?? 'TITULAR PENDIENTE',
                    rfc: datosTitular.rfc ?? 'XAXX010101000',
                    telefono: datosTitular.telefono ?? '',
                    correo: datosTitular.correo ?? '',
                    calle: datosTitular.calle ?? '',
                    colonia: datosTitular.colonia ?? '',
                    municipio: datosTitular.municipio ?? '',
                    estadoRegion: datosTitular.estadoRegion ?? '',
                    cp: datosTitular.cp ?? '',
                    creadoPor: 'SISTEMA',
                    creadoVia: 'TELEGRAM_BOT'
                }
            });

            logger.info(`[VehicleCreationService] Vehículo creado: ${datos.serie}`);

            return {
                success: true,
                vehiculo: vehiculoGuardado
            };
        } catch (error: any) {
            // Error de duplicado de PostgreSQL/Prisma
            if (error.code === 'P2002') {
                return {
                    success: false,
                    error: 'Ya existe un vehículo con esta serie.',
                    esDuplicado: true
                };
            }

            logger.error('[VehicleCreationService] Error creando vehículo:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Genera datos del titular si no se proporcionan
     */
    private async generarDatosTitular(datos: IDatosVehiculo): Promise<Partial<IDatosVehiculo>> {
        // Si ya tiene titular, usar los datos proporcionados
        if (datos.titular && datos.rfc) {
            return {
                titular: datos.titular,
                rfc: datos.rfc,
                telefono: datos.telefono,
                correo: datos.correo,
                calle: datos.calle,
                colonia: datos.colonia,
                municipio: datos.municipio,
                estadoRegion: datos.estadoRegion,
                cp: datos.cp
            };
        }

        // Generar datos ficticios
        try {
            const datosMexicanos = await generarDatosMexicanosReales();
            return {
                titular: datosMexicanos.titular,
                rfc: datosMexicanos.rfc,
                telefono: datosMexicanos.telefono,
                correo: datosMexicanos.correo,
                calle: datosMexicanos.calle,
                colonia: datosMexicanos.colonia,
                municipio: datosMexicanos.municipio,
                estadoRegion: datosMexicanos.estado,
                cp: datosMexicanos.cp
            };
        } catch (error) {
            logger.warn('[VehicleCreationService] Error generando datos, usando placeholders');
            return {
                titular: 'TITULAR PENDIENTE',
                rfc: 'XAXX010101000',
                telefono: '0000000000'
            };
        }
    }

    /**
     * Actualiza fotos del vehículo usando tabla VehicleFileR2
     */
    async actualizarFotos(
        vehiculoId: string,
        fotos: Array<{ url: string; key: string; size: number; contentType: string }>
    ): Promise<boolean> {
        try {
            const vehiculo = await prisma.vehicle.findUnique({
                where: { id: vehiculoId }
            });
            if (!vehiculo) {
                logger.error('[VehicleCreationService] Vehículo no encontrado:', vehiculoId);
                return false;
            }

            // Agregar fotos a la tabla VehicleFileR2
            for (const foto of fotos) {
                await prisma.vehicleFileR2.create({
                    data: {
                        vehicleId: vehiculoId,
                        tipo: 'FOTO',
                        url: foto.url,
                        key: foto.key,
                        size: foto.size,
                        contentType: foto.contentType,
                        originalName: `foto_vehiculo_${Date.now()}.jpg`,
                        uploadedAt: new Date()
                    }
                });
            }

            logger.info(
                `[VehicleCreationService] ${fotos.length} fotos guardadas en vehículo ${vehiculoId}`
            );
            return true;
        } catch (error) {
            logger.error('[VehicleCreationService] Error actualizando fotos:', error);
            return false;
        }
    }
}

// Singleton
let instance: VehicleCreationService | null = null;

export function getVehicleCreationService(): VehicleCreationService {
    instance ??= new VehicleCreationService();
    return instance;
}

export default VehicleCreationService;
