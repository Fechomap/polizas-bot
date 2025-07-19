import Vehicle from '../models/vehicle';
import { generarDatosMexicanosCompletos } from '../utils/mexicanDataGenerator';
import CloudflareStorage from '../services/CloudflareStorage';
import FileHandler from '../utils/fileHandler';
import type {
    IVehicle,
    IVehicleData,
    IDatosMexicanos,
    IFileObject,
    IR2File
} from '../types/database';

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
    fotosGuardadas?: (IFileObject | IR2File)[];
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
        porMarca: Array<{ _id: string; count: number }>;
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
            const existeVehiculo = await Vehicle.findBySerie(vehicleData.serie);
            if (existeVehiculo) {
                throw new Error(
                    `Ya existe un vehículo registrado con la serie: ${vehicleData.serie}`
                );
            }

            // Validar placas duplicadas
            if (vehicleData.placas) {
                const existePlacas = await Vehicle.findByPlacas(vehicleData.placas);
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
                    rfc: vehicleData.rfc || '',
                    telefono: vehicleData.telefono || '',
                    correo: vehicleData.correo || '',
                    calle: vehicleData.calle || '',
                    colonia: vehicleData.colonia || '',
                    municipio: vehicleData.municipio || '',
                    estado: vehicleData.estado || vehicleData.estadoRegion || '',
                    estadoRegion: vehicleData.estadoRegion || '',
                    cp: vehicleData.cp || ''
                };
            } else {
                datosTemporal = await generarDatosMexicanosCompletos();
            }

            // Crear el vehículo con datos combinados
            const nuevoVehiculo = new Vehicle({
                // Datos del vehículo (proporcionados)
                serie: vehicleData.serie.toUpperCase(),
                marca: vehicleData.marca,
                submarca: vehicleData.submarca,
                año: vehicleData.año,
                color: vehicleData.color,
                placas: vehicleData.placas ? vehicleData.placas.toUpperCase() : '',

                // Datos temporales generados
                titular: datosTemporal.titular,
                rfc: datosTemporal.rfc,
                telefono: datosTemporal.telefono,
                correo: datosTemporal.correo,
                calle: datosTemporal.calle,
                colonia: datosTemporal.colonia,
                municipio: datosTemporal.municipio,
                estadoRegion: datosTemporal.estadoRegion,
                cp: datosTemporal.cp,

                // Metadatos
                creadoPor: userId,
                creadoVia: via,
                notas: vehicleData.notas || '',

                // Estado inicial
                estado: 'SIN_POLIZA'
            });

            const vehiculoGuardado = await nuevoVehiculo.save();

            return {
                success: true,
                vehicle: vehiculoGuardado as unknown as IVehicle,
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
    ): Promise<VehicleResponse<{ fotosGuardadas: (IFileObject | IR2File)[]; totalFotos: number }>> {
        try {
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            const vehiculoTyped = vehiculo as unknown as IVehicle;
            const fotosGuardadas: (IFileObject | IR2File)[] = [];

            for (const file of files) {
                if (useCloudflare) {
                    // Subir a Cloudflare R2
                    const cloudflareService = new CloudflareStorage();
                    const uploadResult = await cloudflareService.uploadFile(
                        file.buffer || Buffer.from([]),
                        file.originalname || file.name || 'unknown',
                        file.mimetype || file.type || 'image/jpeg'
                    );

                    const r2File: IR2File = {
                        url: uploadResult.url,
                        key: uploadResult.key,
                        originalName: file.originalname || file.name || 'unknown',
                        contentType: file.mimetype || file.type || 'image/jpeg',
                        size: file.size,
                        uploadDate: new Date()
                    };

                    vehiculoTyped.archivos.r2Files.fotos.push(r2File);
                    fotosGuardadas.push(r2File);
                } else {
                    // Guardar en MongoDB (sistema legacy) - este es un método dummy por ahora
                    const mongoFile: IFileObject = {
                        data: file.buffer || Buffer.from([]),
                        contentType: file.mimetype || file.type || 'image/jpeg'
                    };
                    vehiculoTyped.archivos.fotos.push(mongoFile);
                    fotosGuardadas.push(mongoFile);
                }
            }

            await vehiculo.save();

            return {
                success: true,
                fotosGuardadas,
                totalFotos:
                    vehiculoTyped.archivos.fotos.length +
                    vehiculoTyped.archivos.r2Files.fotos.length
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
     * Las fotos ya están en Cloudflare, solo guardamos las referencias
     */
    static async vincularFotosCloudflare(
        vehicleId: string,
        fotosCloudflare: CloudflarePhoto[]
    ): Promise<VehicleResponse<{ fotosVinculadas: number; totalFotos: number }>> {
        try {
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            const vehiculoTyped = vehiculo as unknown as IVehicle;

            // Agregar las fotos ya subidas a Cloudflare
            for (const foto of fotosCloudflare) {
                const r2File: IR2File = {
                    url: foto.url,
                    key: foto.key,
                    originalName: foto.originalname,
                    contentType: 'image/jpeg',
                    size: foto.size || 0,
                    uploadDate: foto.uploadedAt || new Date()
                };

                vehiculoTyped.archivos.r2Files.fotos.push(r2File);
            }

            await vehiculo.save();

            return {
                success: true,
                fotosVinculadas: fotosCloudflare.length,
                totalFotos:
                    vehiculoTyped.archivos.fotos.length +
                    vehiculoTyped.archivos.r2Files.fotos.length
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

            const vehiculos = await Vehicle.find({ estado: 'SIN_POLIZA' })
                .sort({ createdAt: -1 })
                .limit(limite)
                .skip(skip)
                .lean()
                .exec();

            const total = await Vehicle.countDocuments({ estado: 'SIN_POLIZA' });

            return {
                success: true,
                vehiculos: vehiculos as unknown as IVehicle[],
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
                vehiculo = (await Vehicle.findBySerie(termino)) as IVehicle | null;
            }

            // Si no se encuentra por serie, buscar por placas
            if (!vehiculo) {
                vehiculo = (await Vehicle.findByPlacas(termino)) as IVehicle | null;
            }

            // Búsqueda más amplia si no se encuentra exactamente
            if (!vehiculo) {
                vehiculo = await Vehicle.findOne({
                    $or: [
                        { serie: new RegExp(termino, 'i') },
                        { placas: new RegExp(termino, 'i') },
                        { titular: new RegExp(termino, 'i') }
                    ],
                    estado: { $ne: 'ELIMINADO' }
                });
            }

            return {
                success: true,
                vehiculo: vehiculo || undefined
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
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                return {
                    success: false,
                    error: 'Vehículo no encontrado'
                };
            }

            // Actualizar directamente en la base de datos para evitar problemas de validación
            const updateResult = await Vehicle.findByIdAndUpdate(
                vehicleId,
                {
                    estado: 'CON_POLIZA',
                    policyId: policyId,
                    updatedAt: new Date()
                },
                { new: true, runValidators: true }
            );

            if (!updateResult) {
                return {
                    success: false,
                    error: 'No se pudo actualizar el vehículo'
                };
            }

            return {
                success: true,
                message: 'Vehículo marcado como asegurado',
                vehiculo: updateResult as unknown as IVehicle
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
            const stats = await Vehicle.aggregate([
                {
                    $group: {
                        _id: '$estado',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const estadisticas = {
                sinPoliza: 0,
                conPoliza: 0,
                eliminados: 0,
                total: 0
            };

            stats.forEach((stat: { _id: string; count: number }) => {
                switch (stat._id) {
                    case 'SIN_POLIZA':
                        estadisticas.sinPoliza = stat.count;
                        break;
                    case 'CON_POLIZA':
                        estadisticas.conPoliza = stat.count;
                        break;
                    case 'ELIMINADO':
                        estadisticas.eliminados = stat.count;
                        break;
                }
                estadisticas.total += stat.count;
            });

            // Estadísticas por marca
            const porMarca = await Vehicle.aggregate([
                { $match: { estado: { $ne: 'ELIMINADO' } } },
                {
                    $group: {
                        _id: '$marca',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            return {
                success: true,
                estadisticas: {
                    ...estadisticas,
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
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            // Campos permitidos para actualizar
            const camposPermitidos: (keyof IVehicleData)[] = [
                'marca',
                'submarca',
                'año',
                'color',
                'placas',
                'notas',
                'titular',
                'rfc',
                'telefono',
                'correo',
                'calle',
                'colonia',
                'municipio',
                'estadoRegion',
                'cp'
            ];

            camposPermitidos.forEach(campo => {
                if (updateData[campo] !== undefined) {
                    (vehiculo as any)[campo] = updateData[campo];
                }
            });

            await vehiculo.save();

            return {
                success: true,
                vehiculo: vehiculo as unknown as IVehicle
            };
        } catch (error: any) {
            console.error('Error al actualizar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default VehicleController;
