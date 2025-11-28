// src/services/VehicleCreationService.ts
/**
 * Servicio para creación de vehículos
 * Responsabilidad única: persistencia de vehículos
 */

import Vehicle from '../models/vehicle';
import { generarDatosMexicanosReales } from '../utils/mexicanDataGenerator';
import logger from '../utils/logger';
import type { IDatosVehiculo, ICrearVehiculoResult } from '../types/vehicle-registration';

export class VehicleCreationService {
    /**
     * Crea un nuevo vehículo en la base de datos
     */
    async crearVehiculo(datos: IDatosVehiculo): Promise<ICrearVehiculoResult> {
        try {
            // Verificar duplicados por serie
            const existente = await Vehicle.findOne({ serie: datos.serie });
            if (existente) {
                return {
                    success: false,
                    error: `Ya existe un vehículo con la serie ${datos.serie}`,
                    esDuplicado: true
                };
            }

            // Generar datos de titular si no se proporcionan
            const datosTitular = await this.generarDatosTitular(datos);

            // Crear vehículo
            const nuevoVehiculo = new Vehicle({
                serie: datos.serie,
                marca: datos.marca,
                submarca: datos.submarca,
                año: datos.año,
                color: datos.color,
                placas: datos.placas ?? 'SIN PLACAS',
                estado: 'SIN_POLIZA',
                ...datosTitular,
                archivos: {
                    fotos: [],
                    r2Files: { fotos: [], pdfs: [] }
                },
                creadoViaBot: true,
                fechaCreacion: new Date()
            });

            const vehiculoGuardado = await nuevoVehiculo.save();

            logger.info(`[VehicleCreationService] Vehículo creado: ${datos.serie}`);

            return {
                success: true,
                vehiculo: vehiculoGuardado
            };
        } catch (error: any) {
            // Error de duplicado de MongoDB
            if (error.code === 11000) {
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
     * Actualiza fotos del vehículo
     */
    async actualizarFotos(
        vehiculoId: string,
        fotos: Array<{ url: string; key: string; size: number; contentType: string }>
    ): Promise<boolean> {
        try {
            const vehiculo = await Vehicle.findById(vehiculoId);
            if (!vehiculo) {
                logger.error('[VehicleCreationService] Vehículo no encontrado:', vehiculoId);
                return false;
            }

            // Inicializar estructura de archivos
            if (!vehiculo.archivos) {
                vehiculo.archivos = { fotos: [], r2Files: { fotos: [] } };
            }
            if (!vehiculo.archivos.r2Files) {
                vehiculo.archivos.r2Files = { fotos: [] };
            }

            // Agregar fotos
            for (const foto of fotos) {
                vehiculo.archivos.r2Files.fotos.push({
                    url: foto.url,
                    key: foto.key,
                    size: foto.size,
                    contentType: foto.contentType,
                    uploadDate: new Date(),
                    originalName: `foto_vehiculo_${Date.now()}.jpg`
                });
            }

            await vehiculo.save();
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
    if (!instance) {
        instance = new VehicleCreationService();
    }
    return instance;
}

export default VehicleCreationService;
