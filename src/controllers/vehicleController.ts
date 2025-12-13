// src/controllers/vehicleController.ts
// Migrado de Mongoose a Prisma/PostgreSQL

import { prisma } from '../database';
import { generarDatosMexicanosCompletos } from '../utils/mexicanDataGenerator';
import CloudflareStorage from '../services/CloudflareStorage';
import type { Vehicle, VehicleStatus } from '../generated/prisma';

// Tipos compatibles con el código existente
export type IVehicle = Vehicle;

export interface IVehicleData {
    serie: string;
    marca: string;
    submarca: string;
    año: number;
    color: string;
    placas?: string;
    titular?: string;
    rfc?: string;
    telefono?: string;
    correo?: string;
    calle?: string;
    colonia?: string;
    municipio?: string;
    estado?: string;
    estadoRegion?: string;
    cp?: string;
    notas?: string;
}

export interface IDatosMexicanos {
    titular: string;
    rfc: string;
    telefono: string;
    correo: string;
    calle: string;
    colonia: string;
    municipio: string;
    estado?: string;
    estadoRegion: string;
    cp: string;
}

interface VehicleFile {
    buffer?: Buffer;
    originalname?: string;
    name?: string;
    mimetype?: string;
    type?: string;
    size: number;
}

interface CloudflarePhoto {
    url: string;
    key: string;
    originalname: string;
    size?: number;
    uploadedAt?: Date;
}

interface VehicleResponse<T = any> {
    success: boolean;
    error?: string;
    vehiculo?: IVehicle;
    vehicle?: IVehicle;
    datosGenerados?: IDatosMexicanos;
    message?: string;
    fotosGuardadas?: any[];
    totalFotos?: number;
    fotosVinculadas?: number;
    vehiculos?: IVehicle[];
    pagination?: {
        total: number;
        pagina: number;
        limite: number;
        totalPaginas: number;
    };
    estadisticas?: {
        sinPoliza: number;
        conPoliza: number;
        eliminados: number;
        total: number;
        porMarca: Array<{ marca: string; count: number }>;
    };
}

/**
 * Controlador para gestión de vehículos OBD
 */
export class VehicleController {
    /**
     * Registra un nuevo vehículo con datos temporales generados automáticamente
     */
    static async registrarVehiculo(
        vehicleData: IVehicleData,
        userId: string,
        via = 'TELEGRAM_BOT'
    ): Promise<VehicleResponse<{ vehicle: IVehicle; datosGenerados: IDatosMexicanos }>> {
        try {
            // Validar que el número de serie no exista
            const existeVehiculo = await prisma.vehicle.findUnique({
                where: { serie: vehicleData.serie.toUpperCase() }
            });
            if (existeVehiculo) {
                throw new Error(
                    `Ya existe un vehículo registrado con la serie: ${vehicleData.serie}`
                );
            }

            // Validar placas duplicadas
            if (vehicleData.placas) {
                const existePlacas = await prisma.vehicle.findFirst({
                    where: {
                        placas: vehicleData.placas.toUpperCase(),
                        estado: { not: 'ELIMINADO' }
                    }
                });
                if (existePlacas) {
                    throw new Error(
                        `Ya existe un vehículo registrado con las placas: ${vehicleData.placas}`
                    );
                }
            }

            // Usar datos del titular si vienen incluidos, sino generar nuevos
            let datosTemporal: IDatosMexicanos;

            if (vehicleData.titular) {
                datosTemporal = {
                    titular: vehicleData.titular,
                    rfc: vehicleData.rfc ?? '',
                    telefono: vehicleData.telefono ?? '',
                    correo: vehicleData.correo ?? '',
                    calle: vehicleData.calle ?? '',
                    colonia: vehicleData.colonia ?? '',
                    municipio: vehicleData.municipio ?? '',
                    estado: vehicleData.estado ?? vehicleData.estadoRegion ?? '',
                    estadoRegion: vehicleData.estadoRegion ?? '',
                    cp: vehicleData.cp ?? ''
                };
            } else {
                datosTemporal = await generarDatosMexicanosCompletos();
            }

            // Crear el vehículo
            const vehiculoGuardado = await prisma.vehicle.create({
                data: {
                    serie: vehicleData.serie.toUpperCase(),
                    marca: vehicleData.marca,
                    submarca: vehicleData.submarca,
                    anio: vehicleData.año,
                    color: vehicleData.color,
                    placas: vehicleData.placas ? vehicleData.placas.toUpperCase() : '',
                    titular: datosTemporal.titular,
                    rfc: datosTemporal.rfc,
                    telefono: datosTemporal.telefono,
                    correo: datosTemporal.correo,
                    calle: datosTemporal.calle,
                    colonia: datosTemporal.colonia,
                    municipio: datosTemporal.municipio,
                    estadoRegion: datosTemporal.estadoRegion,
                    cp: datosTemporal.cp,
                    creadoPor: userId,
                    creadoVia: via as any,
                    notas: vehicleData.notas ?? '',
                    estado: 'SIN_POLIZA'
                }
            });

            return {
                success: true,
                vehicle: vehiculoGuardado,
                datosGenerados: datosTemporal
            };
        } catch (error: any) {
            console.error('Error al registrar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Agrega fotos a un vehículo existente
     */
    static async agregarFotos(
        vehicleId: string,
        files: VehicleFile[],
        useCloudflare = true
    ): Promise<VehicleResponse<{ fotosGuardadas: any[]; totalFotos: number }>> {
        try {
            const vehiculo = await prisma.vehicle.findUnique({
                where: { id: vehicleId }
            });
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            const fotosGuardadas: any[] = [];

            for (const file of files) {
                if (useCloudflare) {
                    // Subir a Cloudflare R2
                    const cloudflareService = new CloudflareStorage();
                    const uploadResult = await cloudflareService.uploadFile(
                        file.buffer ?? Buffer.from([]),
                        file.originalname ?? file.name ?? 'unknown',
                        file.mimetype ?? file.type ?? 'image/jpeg'
                    );

                    const r2File = await prisma.vehicleFileR2.create({
                        data: {
                            vehicleId: vehiculo.id,
                            tipo: 'FOTO',
                            url: uploadResult.url,
                            key: uploadResult.key,
                            originalName: file.originalname ?? file.name ?? 'unknown',
                            contentType: file.mimetype ?? file.type ?? 'image/jpeg',
                            size: file.size,
                            uploadedAt: new Date()
                        }
                    });

                    fotosGuardadas.push(r2File);
                } else {
                    // Guardar en PostgreSQL (sistema legacy)
                    const legacyFile = await prisma.vehicleFileLegacy.create({
                        data: {
                            vehicleId: vehiculo.id,
                            tipo: 'FOTO',
                            data: file.buffer ?? Buffer.from([]),
                            contentType: file.mimetype ?? file.type ?? 'image/jpeg'
                        }
                    });
                    fotosGuardadas.push(legacyFile);
                }
            }

            const totalFotos = await prisma.vehicleFileR2.count({
                where: { vehicleId: vehiculo.id }
            });

            return {
                success: true,
                fotosGuardadas,
                totalFotos
            };
        } catch (error: any) {
            console.error('Error al agregar fotos:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Vincula fotos ya subidas a Cloudflare con un vehículo
     */
    static async vincularFotosCloudflare(
        vehicleId: string,
        fotosCloudflare: CloudflarePhoto[]
    ): Promise<VehicleResponse<{ fotosVinculadas: number; totalFotos: number }>> {
        try {
            const vehiculo = await prisma.vehicle.findUnique({
                where: { id: vehicleId }
            });
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            // Agregar las fotos ya subidas a Cloudflare
            for (const foto of fotosCloudflare) {
                await prisma.vehicleFileR2.create({
                    data: {
                        vehicleId: vehiculo.id,
                        tipo: 'FOTO',
                        url: foto.url,
                        key: foto.key,
                        originalName: foto.originalname,
                        contentType: 'image/jpeg',
                        size: foto.size ?? 0,
                        uploadedAt: foto.uploadedAt ?? new Date()
                    }
                });
            }

            const totalFotos = await prisma.vehicleFileR2.count({
                where: { vehicleId: vehiculo.id }
            });

            return {
                success: true,
                fotosVinculadas: fotosCloudflare.length,
                totalFotos
            };
        } catch (error: any) {
            console.error('Error al vincular fotos de Cloudflare:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtiene vehículos disponibles para asegurar (sin póliza)
     */
    static async getVehiculosSinPoliza(
        limite = 50,
        pagina = 1
    ): Promise<VehicleResponse<{ vehiculos: IVehicle[]; pagination: any }>> {
        try {
            const skip = (pagina - 1) * limite;

            const vehiculos = await prisma.vehicle.findMany({
                where: { estado: 'SIN_POLIZA' },
                orderBy: { createdAt: 'desc' },
                take: limite,
                skip
            });

            const total = await prisma.vehicle.count({
                where: { estado: 'SIN_POLIZA' }
            });

            return {
                success: true,
                vehiculos,
                pagination: {
                    total,
                    pagina,
                    limite,
                    totalPaginas: Math.ceil(total / limite)
                }
            };
        } catch (error: any) {
            console.error('Error al obtener vehículos sin póliza:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Busca vehículos por serie o placas
     */
    static async buscarVehiculo(
        termino: string
    ): Promise<VehicleResponse<{ vehiculo: IVehicle | null }>> {
        try {
            let vehiculo: IVehicle | null = null;

            // Intentar buscar por serie (17 caracteres)
            if (termino.length === 17) {
                vehiculo = await prisma.vehicle.findUnique({
                    where: { serie: termino.toUpperCase() }
                });
            }

            // Si no se encuentra por serie, buscar por placas
            if (!vehiculo) {
                vehiculo = await prisma.vehicle.findFirst({
                    where: {
                        placas: termino.toUpperCase(),
                        estado: { not: 'ELIMINADO' }
                    }
                });
            }

            // Búsqueda más amplia si no se encuentra exactamente
            if (!vehiculo) {
                vehiculo = await prisma.vehicle.findFirst({
                    where: {
                        OR: [
                            { serie: { contains: termino, mode: 'insensitive' } },
                            { placas: { contains: termino, mode: 'insensitive' } },
                            { titular: { contains: termino, mode: 'insensitive' } }
                        ],
                        estado: { not: 'ELIMINADO' }
                    }
                });
            }

            return {
                success: true,
                vehiculo: vehiculo ?? undefined
            };
        } catch (error: any) {
            console.error('Error al buscar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Marca un vehículo como que ya tiene póliza asignada
     */
    static async marcarConPoliza(
        vehicleId: string,
        policyId: string
    ): Promise<VehicleResponse<{ message: string; vehiculo: IVehicle }>> {
        try {
            const vehiculo = await prisma.vehicle.findUnique({
                where: { id: vehicleId }
            });
            if (!vehiculo) {
                return {
                    success: false,
                    error: 'Vehículo no encontrado'
                };
            }

            const updateResult = await prisma.vehicle.update({
                where: { id: vehicleId },
                data: {
                    estado: 'CON_POLIZA'
                }
            });

            // Actualizar la referencia en la póliza
            await prisma.policy.update({
                where: { id: policyId },
                data: { vehicleId: vehicleId }
            });

            return {
                success: true,
                message: 'Vehículo marcado como asegurado',
                vehiculo: updateResult
            };
        } catch (error: any) {
            console.error('Error al marcar vehículo con póliza:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtiene estadísticas de vehículos OBD
     */
    static async getEstadisticas(): Promise<VehicleResponse<{ estadisticas: any }>> {
        try {
            // Conteo por estado
            const [sinPoliza, conPoliza, eliminados] = await Promise.all([
                prisma.vehicle.count({ where: { estado: 'SIN_POLIZA' } }),
                prisma.vehicle.count({ where: { estado: 'CON_POLIZA' } }),
                prisma.vehicle.count({ where: { estado: 'ELIMINADO' } })
            ]);

            // Estadísticas por marca
            const porMarcaRaw = await prisma.vehicle.groupBy({
                by: ['marca'],
                where: { estado: { not: 'ELIMINADO' } },
                _count: { marca: true },
                orderBy: { _count: { marca: 'desc' } }
            });

            const porMarca = porMarcaRaw.map(item => ({
                marca: item.marca,
                count: item._count.marca
            }));

            return {
                success: true,
                estadisticas: {
                    sinPoliza,
                    conPoliza,
                    eliminados,
                    total: sinPoliza + conPoliza + eliminados,
                    porMarca
                }
            };
        } catch (error: any) {
            console.error('Error al obtener estadísticas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Actualiza los datos de un vehículo
     */
    static async actualizarVehiculo(
        vehicleId: string,
        updateData: Partial<IVehicleData>
    ): Promise<VehicleResponse<{ vehiculo: IVehicle }>> {
        try {
            const vehiculo = await prisma.vehicle.findUnique({
                where: { id: vehicleId }
            });
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            const updated = await prisma.vehicle.update({
                where: { id: vehicleId },
                data: {
                    ...(updateData.marca && { marca: updateData.marca }),
                    ...(updateData.submarca && { submarca: updateData.submarca }),
                    ...(updateData.año && { anio: updateData.año }),
                    ...(updateData.color && { color: updateData.color }),
                    ...(updateData.placas && { placas: updateData.placas }),
                    ...(updateData.titular && { titular: updateData.titular }),
                    ...(updateData.rfc && { rfc: updateData.rfc }),
                    ...(updateData.telefono && { telefono: updateData.telefono }),
                    ...(updateData.correo && { correo: updateData.correo }),
                    ...(updateData.calle && { calle: updateData.calle }),
                    ...(updateData.colonia && { colonia: updateData.colonia }),
                    ...(updateData.municipio && { municipio: updateData.municipio }),
                    ...(updateData.estadoRegion && { estadoRegion: updateData.estadoRegion }),
                    ...(updateData.cp && { cp: updateData.cp }),
                    ...(updateData.notas && { notas: updateData.notas })
                }
            });

            return {
                success: true,
                vehiculo: updated
            };
        } catch (error: any) {
            console.error('Error al actualizar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Busca vehículo por serie
     */
    static async findBySerie(serie: string): Promise<IVehicle | null> {
        return prisma.vehicle.findUnique({
            where: { serie: serie.toUpperCase() }
        });
    }

    /**
     * Busca vehículo por placas
     */
    static async findByPlacas(placas: string): Promise<IVehicle | null> {
        return prisma.vehicle.findFirst({
            where: {
                placas: placas.toUpperCase(),
                estado: { not: 'ELIMINADO' }
            }
        });
    }

    /**
     * Busca vehículo por ID
     */
    static async findById(id: string): Promise<IVehicle | null> {
        return prisma.vehicle.findUnique({
            where: { id }
        });
    }
}

export default VehicleController;
