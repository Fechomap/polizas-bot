const Vehicle = require('../models/vehicle');
const { generarDatosMexicanosCompletos } = require('../utils/mexicanDataGenerator');
const CloudflareStorage = require('../services/CloudflareStorage');
const { saveFileToMongoDB } = require('../utils/fileHandler');

/**
 * Controlador para gestión de vehículos OBD
 */
class VehicleController {

    /**
   * Registra un nuevo vehículo con datos temporales generados automáticamente
   */
    static async registrarVehiculo(vehicleData, userId, via = 'TELEGRAM_BOT') {
        try {
            // Validar que el número de serie no exista
            const existeVehiculo = await Vehicle.findBySerie(vehicleData.serie);
            if (existeVehiculo) {
                throw new Error(`Ya existe un vehículo registrado con la serie: ${vehicleData.serie}`);
            }

            // Validar placas duplicadas
            if (vehicleData.placas) {
                const existePlacas = await Vehicle.findByPlacas(vehicleData.placas);
                if (existePlacas) {
                    throw new Error(`Ya existe un vehículo registrado con las placas: ${vehicleData.placas}`);
                }
            }

            // Generar datos temporales mexicanos
            const datosTemporal = generarDatosMexicanosCompletos();

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
                titularTemporal: datosTemporal.titular,
                rfcTemporal: datosTemporal.rfc,
                telefonoTemporal: datosTemporal.telefono,
                correoTemporal: datosTemporal.correo,
                calleTemporal: datosTemporal.calle,
                coloniaTemporal: datosTemporal.colonia,
                municipioTemporal: datosTemporal.municipio,
                estadoRegionTemporal: datosTemporal.estadoRegion,
                cpTemporal: datosTemporal.cp,

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
                vehicle: vehiculoGuardado,
                datosGenerados: datosTemporal
            };

        } catch (error) {
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
    static async agregarFotos(vehicleId, files, useCloudflare = true) {
        try {
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            const fotosGuardadas = [];

            for (const file of files) {
                if (useCloudflare) {
                    // Subir a Cloudflare R2
                    const uploadResult = await CloudflareStorage.uploadFile(file, 'vehicles/fotos');

                    const r2File = {
                        url: uploadResult.url,
                        key: uploadResult.key,
                        originalName: file.originalname || file.name,
                        contentType: file.mimetype || file.type,
                        size: file.size,
                        uploadDate: new Date()
                    };

                    vehiculo.archivos.r2Files.fotos.push(r2File);
                    fotosGuardadas.push(r2File);
                } else {
                    // Guardar en MongoDB (sistema legacy)
                    const mongoFile = await saveFileToMongoDB(file);
                    vehiculo.archivos.fotos.push(mongoFile);
                    fotosGuardadas.push(mongoFile);
                }
            }

            await vehiculo.save();

            return {
                success: true,
                fotosGuardadas,
                totalFotos: vehiculo.archivos.fotos.length + vehiculo.archivos.r2Files.fotos.length
            };

        } catch (error) {
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
    static async vincularFotosCloudflare(vehicleId, fotosCloudflare) {
        try {
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            // Agregar las fotos ya subidas a Cloudflare
            for (const foto of fotosCloudflare) {
                const r2File = {
                    url: foto.url,
                    key: foto.key,
                    originalName: foto.originalname,
                    contentType: 'image/jpeg',
                    size: foto.size || 0,
                    uploadDate: foto.uploadedAt || new Date()
                };

                vehiculo.archivos.r2Files.fotos.push(r2File);
            }

            await vehiculo.save();

            return {
                success: true,
                fotosVinculadas: fotosCloudflare.length,
                totalFotos: vehiculo.archivos.fotos.length + vehiculo.archivos.r2Files.fotos.length
            };

        } catch (error) {
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
    static async getVehiculosSinPoliza(limite = 50, pagina = 1) {
        try {
            const skip = (pagina - 1) * limite;

            const vehiculos = await Vehicle.findSinPoliza()
                .sort({ createdAt: -1 })
                .limit(limite)
                .skip(skip)
                .lean();

            const total = await Vehicle.countDocuments({ estado: 'SIN_POLIZA' });

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

        } catch (error) {
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
    static async buscarVehiculo(termino) {
        try {
            let vehiculo = null;

            // Intentar buscar por serie (17 caracteres)
            if (termino.length === 17) {
                vehiculo = await Vehicle.findBySerie(termino);
            }

            // Si no se encuentra por serie, buscar por placas
            if (!vehiculo) {
                vehiculo = await Vehicle.findByPlacas(termino);
            }

            // Búsqueda más amplia si no se encuentra exactamente
            if (!vehiculo) {
                vehiculo = await Vehicle.findOne({
                    $or: [
                        { serie: new RegExp(termino, 'i') },
                        { placas: new RegExp(termino, 'i') },
                        { titularTemporal: new RegExp(termino, 'i') }
                    ],
                    estado: { $ne: 'ELIMINADO' }
                });
            }

            return {
                success: true,
                vehiculo
            };

        } catch (error) {
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
    static async marcarConPoliza(vehicleId, policyId) {
        try {
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            await vehiculo.marcarConPoliza();

            return {
                success: true,
                message: 'Vehículo marcado como asegurado'
            };

        } catch (error) {
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
    static async getEstadisticas() {
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

            stats.forEach(stat => {
                switch(stat._id) {
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

        } catch (error) {
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
    static async actualizarVehiculo(vehicleId, updateData) {
        try {
            const vehiculo = await Vehicle.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }

            // Campos permitidos para actualizar
            const camposPermitidos = [
                'marca', 'submarca', 'año', 'color', 'placas', 'notas',
                'titularTemporal', 'rfcTemporal', 'telefonoTemporal', 'correoTemporal',
                'calleTemporal', 'coloniaTemporal', 'municipioTemporal', 'estadoRegionTemporal', 'cpTemporal'
            ];

            camposPermitidos.forEach(campo => {
                if (updateData[campo] !== undefined) {
                    vehiculo[campo] = updateData[campo];
                }
            });

            await vehiculo.save();

            return {
                success: true,
                vehiculo
            };

        } catch (error) {
            console.error('Error al actualizar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = VehicleController;
