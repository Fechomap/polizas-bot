"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularHorasAutomaticas = exports.marcarRegistroNoAsignado = exports.convertirRegistroAServicio = exports.addRegistroToPolicy = exports.savePoliciesBatch = exports.restorePolicy = exports.getDeletedPolicies = exports.getOldUnusedPolicies = exports.getDetailedPaymentInfo = exports.getSusceptiblePolicies = exports.addServiceToPolicy = exports.addPaymentToPolicy = exports.addFileToPolicy = exports.deletePolicyByNumber = exports.markPolicyAsDeleted = exports.getPolicyByNumber = exports.savePolicy = exports.DuplicatePolicyError = void 0;
const policy_1 = __importDefault(require("../models/policy"));
const logger_1 = __importDefault(require("../utils/logger"));
class DuplicatePolicyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DuplicatePolicyError';
    }
}
exports.DuplicatePolicyError = DuplicatePolicyError;
const savePolicy = async (policyData) => {
    try {
        logger_1.default.info('Intentando guardar póliza:', { numeroPoliza: policyData.numeroPoliza });
        const newPolicy = new policy_1.default(policyData);
        const savedPolicy = await newPolicy.save();
        logger_1.default.info('Póliza guardada exitosamente:', { numeroPoliza: savedPolicy.numeroPoliza });
        return savedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al guardar póliza:', {
            numeroPoliza: policyData?.numeroPoliza,
            error: error.message
        });
        if (error.code === 11000 && error.keyPattern?.numeroPoliza) {
            throw new DuplicatePolicyError(`Ya existe una póliza con el número: ${policyData.numeroPoliza}`);
        }
        throw error;
    }
};
exports.savePolicy = savePolicy;
const getPolicyByNumber = async (numeroPoliza) => {
    try {
        logger_1.default.info('Buscando póliza en la base de datos:', { numeroPoliza });
        const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
        const policy = await policy_1.default.findOne({
            numeroPoliza: normalizedNumero,
            estado: 'ACTIVO'
        });
        if (policy) {
            logger_1.default.info('Póliza encontrada:', {
                numeroPoliza: policy.numeroPoliza,
                id: policy._id
            });
        }
        else {
            logger_1.default.warn('Póliza no encontrada o no activa:', { numeroPoliza });
        }
        return policy;
    }
    catch (error) {
        logger_1.default.error('Error en getPolicyByNumber:', {
            numeroPoliza,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};
exports.getPolicyByNumber = getPolicyByNumber;
const markPolicyAsDeleted = async (numeroPoliza, motivo = '') => {
    try {
        const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
        logger_1.default.info(`Marcando póliza ${normalizedNumero} como ELIMINADA`);
        const updatedPolicy = await policy_1.default.findOneAndUpdate({ numeroPoliza: normalizedNumero, estado: 'ACTIVO' }, {
            estado: 'ELIMINADO',
            fechaEliminacion: new Date(),
            motivoEliminacion: motivo
        }, {
            new: true,
            runValidators: false
        });
        if (!updatedPolicy) {
            logger_1.default.warn(`No se encontró póliza activa con número: ${normalizedNumero}`);
            return null;
        }
        logger_1.default.info(`Póliza ${normalizedNumero} marcada como ELIMINADA exitosamente`);
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al marcar póliza como eliminada:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};
exports.markPolicyAsDeleted = markPolicyAsDeleted;
const deletePolicyByNumber = async (numeroPoliza) => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    return await policy_1.default.findOneAndDelete({ numeroPoliza: normalizedNumero });
};
exports.deletePolicyByNumber = deletePolicyByNumber;
const addFileToPolicy = async (numeroPoliza, fileBuffer, fileType) => {
    try {
        logger_1.default.info(`Añadiendo archivo tipo ${fileType} a la póliza: ${numeroPoliza}`);
        const policy = await (0, exports.getPolicyByNumber)(numeroPoliza);
        if (!policy) {
            logger_1.default.warn(`Póliza no encontrada al intentar añadir archivo: ${numeroPoliza}`);
            return null;
        }
        if (!policy.archivos) {
            policy.archivos = {
                fotos: [],
                pdfs: [],
                r2Files: {
                    fotos: [],
                    pdfs: []
                }
            };
        }
        const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        const fileObject = {
            data: buffer,
            contentType: fileType === 'foto' ? 'image/jpeg' : 'application/pdf'
        };
        if (fileType === 'foto') {
            policy.archivos.fotos.push(fileObject);
        }
        else if (fileType === 'pdf') {
            policy.archivos.pdfs.push(fileObject);
        }
        const updatedPolicy = await policy.save();
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al añadir archivo a la póliza:', error);
        throw error;
    }
};
exports.addFileToPolicy = addFileToPolicy;
const addPaymentToPolicy = async (numeroPoliza, monto, fechaPago) => {
    try {
        logger_1.default.info(`Añadiendo pago a la póliza: ${numeroPoliza} por $${monto} en ${fechaPago.toISOString()}`);
        const policy = await (0, exports.getPolicyByNumber)(numeroPoliza);
        if (!policy) {
            logger_1.default.warn(`Póliza no encontrada al intentar añadir pago: ${numeroPoliza}`);
            return null;
        }
        policy.pagos.push({
            monto,
            fechaPago,
            estado: 'REALIZADO',
            notas: 'Pago registrado manualmente - dinero real recibido'
        });
        const updatedPolicy = await policy.save();
        logger_1.default.info(`Pago agregado correctamente a la póliza: ${numeroPoliza}`);
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al añadir pago a la póliza:', {
            numeroPoliza,
            monto,
            error: error.message
        });
        throw error;
    }
};
exports.addPaymentToPolicy = addPaymentToPolicy;
const addServiceToPolicy = async (numeroPoliza, costo, fechaServicio, numeroExpediente, origenDestino, coordenadas = null, rutaInfo = null) => {
    try {
        logger_1.default.info(`Añadiendo servicio a la póliza: ${numeroPoliza}`, {
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida'
        });
        const policy = await (0, exports.getPolicyByNumber)(numeroPoliza);
        if (!policy) {
            logger_1.default.warn(`Póliza no encontrada: ${numeroPoliza} al intentar añadir servicio.`);
            return null;
        }
        if (policy.servicioCounter === undefined) {
            policy.servicioCounter = 0;
        }
        policy.servicioCounter += 1;
        const nextServiceNumber = policy.servicioCounter;
        const serviceData = {
            numeroServicio: nextServiceNumber,
            costo,
            fechaServicio,
            numeroExpediente,
            origenDestino
        };
        if (coordenadas && coordenadas.origen && coordenadas.destino) {
            serviceData.coordenadas = {
                origen: {
                    lat: coordenadas.origen.lat,
                    lng: coordenadas.origen.lng
                },
                destino: {
                    lat: coordenadas.destino.lat,
                    lng: coordenadas.destino.lng
                }
            };
            logger_1.default.info(`Coordenadas añadidas al servicio #${nextServiceNumber}`, coordenadas);
        }
        if (rutaInfo) {
            serviceData.rutaInfo = {
                distanciaKm: rutaInfo.distanciaKm,
                tiempoMinutos: rutaInfo.tiempoMinutos
            };
            if (rutaInfo.googleMapsUrl) {
                serviceData.rutaInfo.googleMapsUrl = rutaInfo.googleMapsUrl;
            }
            logger_1.default.info(`Información de ruta añadida al servicio #${nextServiceNumber}`, {
                distancia: rutaInfo.distanciaKm,
                tiempo: rutaInfo.tiempoMinutos,
                aproximado: rutaInfo.aproximado || false
            });
        }
        policy.servicios.push(serviceData);
        const updatedPolicy = await policy.save();
        logger_1.default.info(`Servicio #${nextServiceNumber} añadido correctamente a la póliza ${numeroPoliza}`);
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al añadir servicio a la póliza:', {
            numeroPoliza,
            costo,
            fechaServicio,
            numeroExpediente,
            origenDestino,
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida',
            error: error.message
        });
        throw error;
    }
};
exports.addServiceToPolicy = addServiceToPolicy;
const getSusceptiblePolicies = async () => {
    try {
        const allPolicies = await policy_1.default.find({ estado: 'ACTIVO' }).lean();
        const now = new Date();
        const susceptibles = [];
        for (const policy of allPolicies) {
            const { numeroPoliza, fechaEmision, pagos = [] } = policy;
            if (!fechaEmision) {
                susceptibles.push({
                    numeroPoliza,
                    diasDeImpago: 0
                });
                continue;
            }
            const msTranscurridos = now.getTime() - new Date(fechaEmision).getTime();
            if (msTranscurridos <= 0) {
                continue;
            }
            const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));
            const pagosRealizados = pagos.filter((pago) => pago.estado === 'REALIZADO');
            const pagosOrdenados = pagosRealizados.sort((a, b) => new Date(a.fechaPago).getTime() - new Date(b.fechaPago).getTime());
            let diasCubiertos = 0;
            for (const pago of pagosOrdenados) {
                const fpago = new Date(pago.fechaPago);
                if (isNaN(fpago.getTime())) {
                    continue;
                }
                diasCubiertos += 30;
            }
            let diasDeImpago = diasTranscurridos - diasCubiertos;
            if (diasDeImpago < 0) {
                diasDeImpago = 0;
            }
            if (diasDeImpago > 0) {
                susceptibles.push({
                    numeroPoliza,
                    diasDeImpago
                });
            }
        }
        susceptibles.sort((a, b) => b.diasDeImpago - a.diasDeImpago);
        return susceptibles;
    }
    catch (error) {
        logger_1.default.error('Error en getSusceptiblePolicies:', { error: error.message });
        throw error;
    }
};
exports.getSusceptiblePolicies = getSusceptiblePolicies;
const getDetailedPaymentInfo = async (numeroPoliza) => {
    try {
        const policy = await policy_1.default.findOne({ numeroPoliza }).exec();
        if (!policy) {
            return null;
        }
        const pagosRealizados = policy.pagos.filter((pago) => pago.estado === 'REALIZADO');
        const pagosPlanificados = policy.pagos.filter((pago) => pago.estado === 'PLANIFICADO');
        const fechaEmision = new Date(policy.fechaEmision);
        const ahora = new Date();
        const msTranscurridos = ahora.getTime() - fechaEmision.getTime();
        const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));
        const diasCubiertos = pagosRealizados.length * 30;
        const diasDeImpago = Math.max(0, diasTranscurridos - diasCubiertos);
        return {
            numeroPoliza: policy.numeroPoliza,
            fechaEmision: policy.fechaEmision,
            diasTranscurridos,
            diasDeImpago,
            pagosRealizados: {
                cantidad: pagosRealizados.length,
                montoTotal: pagosRealizados.reduce((sum, pago) => sum + pago.monto, 0),
                detalles: pagosRealizados
            },
            pagosPlanificados: {
                cantidad: pagosPlanificados.length,
                montoTotal: pagosPlanificados.reduce((sum, pago) => sum + pago.monto, 0),
                detalles: pagosPlanificados
            },
            proximoPagoPlanificado: pagosPlanificados.length > 0 ? pagosPlanificados[0] : null
        };
    }
    catch (error) {
        logger_1.default.error('Error al obtener información detallada de pagos:', error);
        throw error;
    }
};
exports.getDetailedPaymentInfo = getDetailedPaymentInfo;
const getOldUnusedPolicies = async () => {
    const now = new Date();
    const THRESHOLD_DIAS_MINIMO = 26;
    const allPolicies = await policy_1.default.find({ estado: 'ACTIVO' }).lean();
    const polConCampos = allPolicies.map(pol => {
        const msDesdeEmision = now.getTime() - pol.fechaEmision.getTime();
        const diasDesdeEmision = Math.floor(msDesdeEmision / (1000 * 60 * 60 * 24));
        const servicios = pol.servicios || [];
        if (servicios.length === 0) {
            return {
                pol,
                priorityGroup: 1,
                lastServiceDate: null,
                diasDesdeEmision
            };
        }
        else {
            let ultimoServicio = null;
            for (const s of servicios) {
                if (!ultimoServicio || s.fechaServicio < ultimoServicio) {
                    ultimoServicio = s.fechaServicio;
                }
            }
            return {
                pol,
                priorityGroup: 2,
                lastServiceDate: ultimoServicio,
                diasDesdeEmision
            };
        }
    });
    const polFiltradas = polConCampos.filter(({ diasDesdeEmision }) => {
        return diasDesdeEmision >= THRESHOLD_DIAS_MINIMO;
    });
    polFiltradas.sort((a, b) => {
        if (a.priorityGroup !== b.priorityGroup) {
            return a.priorityGroup - b.priorityGroup;
        }
        if (a.priorityGroup === 1) {
            return b.diasDesdeEmision - a.diasDesdeEmision;
        }
        if (a.lastServiceDate && b.lastServiceDate) {
            const diff = a.lastServiceDate.getTime() - b.lastServiceDate.getTime();
            if (diff !== 0)
                return diff;
        }
        else if (a.lastServiceDate && !b.lastServiceDate) {
            return -1;
        }
        else if (!a.lastServiceDate && b.lastServiceDate) {
            return 1;
        }
        return b.diasDesdeEmision - a.diasDesdeEmision;
    });
    const top10 = polFiltradas.slice(0, 10).map(x => x.pol);
    return top10;
};
exports.getOldUnusedPolicies = getOldUnusedPolicies;
const getDeletedPolicies = async () => {
    try {
        return await policy_1.default.find({ estado: 'ELIMINADO' }).lean();
    }
    catch (error) {
        logger_1.default.error('Error al obtener pólizas eliminadas:', error);
        throw error;
    }
};
exports.getDeletedPolicies = getDeletedPolicies;
const restorePolicy = async (numeroPoliza) => {
    try {
        const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
        const policy = await policy_1.default.findOne({
            numeroPoliza: normalizedNumero,
            estado: 'ELIMINADO'
        });
        if (!policy) {
            logger_1.default.warn(`No se encontró póliza eliminada con número: ${normalizedNumero}`);
            return null;
        }
        policy.estado = 'ACTIVO';
        policy.fechaEliminacion = undefined;
        policy.motivoEliminacion = '';
        const updatedPolicy = await policy.save();
        logger_1.default.info(`Póliza ${normalizedNumero} restaurada exitosamente`);
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al restaurar póliza:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};
exports.restorePolicy = restorePolicy;
const savePoliciesBatch = async (policiesData) => {
    const results = {
        total: policiesData.length,
        successful: 0,
        failed: 0,
        details: []
    };
    try {
        logger_1.default.info(`Procesando lote de ${policiesData.length} pólizas`);
        for (const policyData of policiesData) {
            try {
                if (!policyData.numeroPoliza) {
                    throw new Error('Número de póliza es requerido');
                }
                policyData.numeroPoliza = policyData.numeroPoliza.trim().toUpperCase();
                const existingPolicy = await policy_1.default.findOne({
                    numeroPoliza: policyData.numeroPoliza
                });
                if (existingPolicy) {
                    throw new DuplicatePolicyError(`Ya existe una póliza con el número: ${policyData.numeroPoliza}`);
                }
                const newPolicy = new policy_1.default(policyData);
                const savedPolicy = await newPolicy.save();
                logger_1.default.info('Póliza guardada exitosamente:', {
                    numeroPoliza: savedPolicy.numeroPoliza,
                    _id: savedPolicy._id
                });
                results.successful++;
                results.details.push({
                    numeroPoliza: savedPolicy.numeroPoliza,
                    status: 'SUCCESS',
                    message: 'Registrada correctamente'
                });
            }
            catch (error) {
                results.failed++;
                let errorMessage = 'Error desconocido';
                if (error instanceof DuplicatePolicyError) {
                    errorMessage = 'Póliza duplicada';
                }
                else if (error.name === 'ValidationError') {
                    const campos = Object.keys(error.errors || {});
                    errorMessage = `Error de validación: ${campos.join(', ')}`;
                }
                else {
                    errorMessage = error.message;
                }
                logger_1.default.error('Error al guardar póliza:', {
                    numeroPoliza: policyData?.numeroPoliza,
                    error: errorMessage
                });
                results.details.push({
                    numeroPoliza: policyData?.numeroPoliza || 'Desconocido',
                    status: 'ERROR',
                    message: errorMessage
                });
            }
        }
        logger_1.default.info('Procesamiento de lote completado', {
            total: results.total,
            exitosas: results.successful,
            fallidas: results.failed
        });
        return results;
    }
    catch (error) {
        logger_1.default.error('Error general en savePoliciesBatch:', error);
        throw error;
    }
};
exports.savePoliciesBatch = savePoliciesBatch;
const addRegistroToPolicy = async (numeroPoliza, costo, fechaRegistro, numeroExpediente, origenDestino, coordenadas = null, rutaInfo = null) => {
    try {
        logger_1.default.info(`Añadiendo REGISTRO a la póliza: ${numeroPoliza}`, {
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida'
        });
        const policy = await (0, exports.getPolicyByNumber)(numeroPoliza);
        if (!policy) {
            logger_1.default.warn(`Póliza no encontrada: ${numeroPoliza} al intentar añadir registro.`);
            return null;
        }
        if (policy.registroCounter === undefined) {
            policy.registroCounter = 0;
        }
        policy.registroCounter += 1;
        const nextRegistroNumber = policy.registroCounter;
        const registroData = {
            numeroRegistro: nextRegistroNumber,
            costo,
            fechaRegistro,
            numeroExpediente,
            origenDestino,
            estado: 'PENDIENTE'
        };
        if (coordenadas && coordenadas.origen && coordenadas.destino) {
            registroData.coordenadas = {
                origen: {
                    lat: coordenadas.origen.lat,
                    lng: coordenadas.origen.lng
                },
                destino: {
                    lat: coordenadas.destino.lat,
                    lng: coordenadas.destino.lng
                }
            };
            logger_1.default.info(`Coordenadas añadidas al registro #${nextRegistroNumber}`, coordenadas);
        }
        if (rutaInfo) {
            registroData.rutaInfo = {
                distanciaKm: rutaInfo.distanciaKm,
                tiempoMinutos: rutaInfo.tiempoMinutos
            };
            if (rutaInfo.googleMapsUrl) {
                registroData.rutaInfo.googleMapsUrl = rutaInfo.googleMapsUrl;
            }
            logger_1.default.info(`Información de ruta añadida al registro #${nextRegistroNumber}`, {
                distancia: rutaInfo.distanciaKm,
                tiempo: rutaInfo.tiempoMinutos
            });
        }
        if (!policy.registros) {
            policy.registros = [];
        }
        policy.registros.push(registroData);
        const updatedPolicy = await policy.save();
        logger_1.default.info(`Registro #${nextRegistroNumber} añadido correctamente a la póliza ${numeroPoliza}`);
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al añadir registro a la póliza:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};
exports.addRegistroToPolicy = addRegistroToPolicy;
const convertirRegistroAServicio = async (numeroPoliza, numeroRegistro, fechaContactoProgramada, fechaTerminoProgramada) => {
    try {
        logger_1.default.info(`Convirtiendo registro ${numeroRegistro} a servicio en póliza: ${numeroPoliza}`);
        const policy = await (0, exports.getPolicyByNumber)(numeroPoliza);
        if (!policy) {
            logger_1.default.warn(`Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }
        const registro = policy.registros.find((r) => r.numeroRegistro === numeroRegistro);
        if (!registro) {
            logger_1.default.warn(`Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}`);
            return null;
        }
        registro.estado = 'ASIGNADO';
        registro.fechaContactoProgramada = fechaContactoProgramada;
        registro.fechaTerminoProgramada = fechaTerminoProgramada;
        if (policy.servicioCounter === undefined) {
            policy.servicioCounter = 0;
        }
        policy.servicioCounter += 1;
        const nextServiceNumber = policy.servicioCounter;
        const servicioData = {
            numeroServicio: nextServiceNumber,
            numeroRegistroOrigen: numeroRegistro,
            costo: registro.costo,
            fechaServicio: registro.fechaRegistro,
            numeroExpediente: registro.numeroExpediente,
            origenDestino: registro.origenDestino,
            fechaContactoProgramada,
            fechaTerminoProgramada,
            coordenadas: registro.coordenadas,
            rutaInfo: registro.rutaInfo
        };
        policy.servicios.push(servicioData);
        const updatedPolicy = await policy.save();
        logger_1.default.info(`Registro #${numeroRegistro} convertido a servicio #${nextServiceNumber} en póliza ${numeroPoliza}`);
        return { updatedPolicy, numeroServicio: nextServiceNumber };
    }
    catch (error) {
        logger_1.default.error('Error al convertir registro a servicio:', {
            numeroPoliza,
            numeroRegistro,
            error: error.message
        });
        throw error;
    }
};
exports.convertirRegistroAServicio = convertirRegistroAServicio;
const marcarRegistroNoAsignado = async (numeroPoliza, numeroRegistro) => {
    try {
        logger_1.default.info(`Marcando registro ${numeroRegistro} como NO ASIGNADO en póliza: ${numeroPoliza}`);
        const policy = await (0, exports.getPolicyByNumber)(numeroPoliza);
        if (!policy) {
            logger_1.default.warn(`Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }
        const registro = policy.registros.find((r) => r.numeroRegistro === numeroRegistro);
        if (!registro) {
            logger_1.default.warn(`Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}`);
            return null;
        }
        registro.estado = 'NO_ASIGNADO';
        const updatedPolicy = await policy.save();
        logger_1.default.info(`Registro #${numeroRegistro} marcado como NO ASIGNADO en póliza ${numeroPoliza}`);
        return updatedPolicy;
    }
    catch (error) {
        logger_1.default.error('Error al marcar registro como no asignado:', {
            numeroPoliza,
            numeroRegistro,
            error: error.message
        });
        throw error;
    }
};
exports.marcarRegistroNoAsignado = marcarRegistroNoAsignado;
const calcularHorasAutomaticas = (fechaBase, tiempoTrayectoMinutos = 0) => {
    const minutosContacto = Math.floor(Math.random() * (39 - 22 + 1)) + 22;
    const fechaContacto = new Date(fechaBase.getTime() + minutosContacto * 60000);
    const minutosTermino = Math.round(tiempoTrayectoMinutos * 1.6);
    const fechaTermino = new Date(fechaContacto.getTime() + minutosTermino * 60000);
    return {
        fechaContactoProgramada: fechaContacto,
        fechaTerminoProgramada: fechaTermino,
        minutosContacto,
        minutosTermino,
        tiempoTrayectoBase: tiempoTrayectoMinutos,
        factorMultiplicador: 1.6
    };
};
exports.calcularHorasAutomaticas = calcularHorasAutomaticas;
