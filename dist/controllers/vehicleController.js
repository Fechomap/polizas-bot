"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehicleController = void 0;
const vehicle_1 = __importDefault(require("../models/vehicle"));
const mexicanDataGenerator_1 = require("../utils/mexicanDataGenerator");
const CloudflareStorage_1 = __importDefault(require("../services/CloudflareStorage"));
class VehicleController {
    static async registrarVehiculo(vehicleData, userId, via = 'TELEGRAM_BOT') {
        try {
            const existeVehiculo = await vehicle_1.default.findBySerie(vehicleData.serie);
            if (existeVehiculo) {
                throw new Error(`Ya existe un vehículo registrado con la serie: ${vehicleData.serie}`);
            }
            if (vehicleData.placas) {
                const existePlacas = await vehicle_1.default.findByPlacas(vehicleData.placas);
                if (existePlacas) {
                    throw new Error(`Ya existe un vehículo registrado con las placas: ${vehicleData.placas}`);
                }
            }
            let datosTemporal;
            if (vehicleData.titular) {
                datosTemporal = {
                    titular: vehicleData.titular,
                    rfc: vehicleData.rfc || '',
                    telefono: vehicleData.telefono || '',
                    correo: vehicleData.correo || '',
                    calle: vehicleData.calle || '',
                    colonia: vehicleData.colonia || '',
                    municipio: vehicleData.municipio || '',
                    estadoRegion: vehicleData.estadoRegion || '',
                    cp: vehicleData.cp || ''
                };
            }
            else {
                datosTemporal = await (0, mexicanDataGenerator_1.generarDatosMexicanosCompletos)();
            }
            const nuevoVehiculo = new vehicle_1.default({
                serie: vehicleData.serie.toUpperCase(),
                marca: vehicleData.marca,
                submarca: vehicleData.submarca,
                año: vehicleData.año,
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
                creadoVia: via,
                notas: vehicleData.notas || '',
                estado: 'SIN_POLIZA'
            });
            const vehiculoGuardado = await nuevoVehiculo.save();
            return {
                success: true,
                vehicle: vehiculoGuardado,
                datosGenerados: datosTemporal
            };
        }
        catch (error) {
            console.error('Error al registrar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async agregarFotos(vehicleId, files, useCloudflare = true) {
        try {
            const vehiculo = await vehicle_1.default.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }
            const vehiculoTyped = vehiculo;
            const fotosGuardadas = [];
            for (const file of files) {
                if (useCloudflare) {
                    const cloudflareService = new CloudflareStorage_1.default();
                    const uploadResult = await cloudflareService.uploadFile(file.buffer || Buffer.from([]), file.originalname || file.name || 'unknown', file.mimetype || file.type || 'image/jpeg');
                    const r2File = {
                        url: uploadResult.url,
                        key: uploadResult.key,
                        originalName: file.originalname || file.name || 'unknown',
                        contentType: file.mimetype || file.type || 'image/jpeg',
                        size: file.size,
                        uploadDate: new Date()
                    };
                    vehiculoTyped.archivos.r2Files.fotos.push(r2File);
                    fotosGuardadas.push(r2File);
                }
                else {
                    const mongoFile = {
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
                totalFotos: vehiculoTyped.archivos.fotos.length +
                    vehiculoTyped.archivos.r2Files.fotos.length
            };
        }
        catch (error) {
            console.error('Error al agregar fotos:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async vincularFotosCloudflare(vehicleId, fotosCloudflare) {
        try {
            const vehiculo = await vehicle_1.default.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }
            const vehiculoTyped = vehiculo;
            for (const foto of fotosCloudflare) {
                const r2File = {
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
                totalFotos: vehiculoTyped.archivos.fotos.length +
                    vehiculoTyped.archivos.r2Files.fotos.length
            };
        }
        catch (error) {
            console.error('Error al vincular fotos de Cloudflare:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async getVehiculosSinPoliza(limite = 50, pagina = 1) {
        try {
            const skip = (pagina - 1) * limite;
            const vehiculos = await vehicle_1.default.find({ estado: 'SIN_POLIZA' })
                .sort({ createdAt: -1 })
                .limit(limite)
                .skip(skip)
                .lean()
                .exec();
            const total = await vehicle_1.default.countDocuments({ estado: 'SIN_POLIZA' });
            return {
                success: true,
                vehiculos: vehiculos,
                pagination: {
                    total,
                    pagina,
                    limite,
                    totalPaginas: Math.ceil(total / limite)
                }
            };
        }
        catch (error) {
            console.error('Error al obtener vehículos sin póliza:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async buscarVehiculo(termino) {
        try {
            let vehiculo = null;
            if (termino.length === 17) {
                vehiculo = (await vehicle_1.default.findBySerie(termino));
            }
            if (!vehiculo) {
                vehiculo = (await vehicle_1.default.findByPlacas(termino));
            }
            if (!vehiculo) {
                vehiculo = await vehicle_1.default.findOne({
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
        }
        catch (error) {
            console.error('Error al buscar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async marcarConPoliza(vehicleId, policyId) {
        try {
            const vehiculo = await vehicle_1.default.findById(vehicleId);
            if (!vehiculo) {
                return {
                    success: false,
                    error: 'Vehículo no encontrado'
                };
            }
            const updateResult = await vehicle_1.default.findByIdAndUpdate(vehicleId, {
                estado: 'CON_POLIZA',
                policyId: policyId,
                updatedAt: new Date()
            }, { new: true, runValidators: true });
            if (!updateResult) {
                return {
                    success: false,
                    error: 'No se pudo actualizar el vehículo'
                };
            }
            return {
                success: true,
                message: 'Vehículo marcado como asegurado',
                vehiculo: updateResult
            };
        }
        catch (error) {
            console.error('Error al marcar vehículo con póliza:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async getEstadisticas() {
        try {
            const stats = await vehicle_1.default.aggregate([
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
            stats.forEach((stat) => {
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
            const porMarca = await vehicle_1.default.aggregate([
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
        }
        catch (error) {
            console.error('Error al obtener estadísticas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async actualizarVehiculo(vehicleId, updateData) {
        try {
            const vehiculo = await vehicle_1.default.findById(vehicleId);
            if (!vehiculo) {
                throw new Error('Vehículo no encontrado');
            }
            const camposPermitidos = [
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
                    vehiculo[campo] = updateData[campo];
                }
            });
            await vehiculo.save();
            return {
                success: true,
                vehiculo: vehiculo
            };
        }
        catch (error) {
            console.error('Error al actualizar vehículo:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}
exports.VehicleController = VehicleController;
exports.default = VehicleController;
