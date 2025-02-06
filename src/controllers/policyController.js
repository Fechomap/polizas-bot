// src/controllers/policyController.js
const Policy = require('../models/policy');
const logger = require('../utils/logger');

/**
 * Clase de Error para Pólizas Duplicadas
 */
class DuplicatePolicyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DuplicatePolicyError';
    }
}

/**
 * Guarda una nueva póliza en la base de datos
 * @param {Object} policyData - Datos de la póliza
 * @returns {Promise<Object>} - La póliza guardada
 * @throws {DuplicatePolicyError} Si la póliza ya existe
 */
const savePolicy = async (policyData) => {
    try {
        logger.info('Intentando guardar póliza:', { numeroPoliza: policyData.numeroPoliza });
        const newPolicy = new Policy(policyData);
        const savedPolicy = await newPolicy.save();
        logger.info('Póliza guardada exitosamente:', { numeroPoliza: savedPolicy.numeroPoliza });
        return savedPolicy;
    } catch (error) {
        logger.error('Error al guardar póliza:', {
            numeroPoliza: policyData?.numeroPoliza,
            error: error.message
        });
        if (error.code === 11000 && error.keyPattern && error.keyPattern.numeroPoliza) {
            throw new DuplicatePolicyError(`Ya existe una póliza con el número: ${policyData.numeroPoliza}`);
        }
        throw error;
    }
};

/**
 * Obtiene una póliza por su número.
 * @param {string} numeroPoliza - El número de la póliza.
 * @returns {Promise<Object|null>} - La póliza encontrada o null si no existe.
 */
const getPolicyByNumber = async (numeroPoliza) => {
    try {
        logger.info('Buscando póliza en la base de datos:', { numeroPoliza });
        
        // Asegurarnos de que el número de póliza esté normalizado
        const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
        
        // Log de depuración
        logger.debug('Ejecutando consulta con número normalizado:', { normalizedNumero });
        
        const policy = await Policy.findOne({ numeroPoliza: normalizedNumero });
        
        // Log del resultado
        if (policy) {
            logger.info('Póliza encontrada:', { 
                numeroPoliza: policy.numeroPoliza,
                id: policy._id 
            });
        } else {
            logger.warn('Póliza no encontrada:', { numeroPoliza });
        }
        
        return policy;
    } catch (error) {
        logger.error('Error en getPolicyByNumber:', {
            numeroPoliza,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

/**
 * Añade un archivo (foto o PDF) a la póliza indicada por numeroPoliza.
 * @param {string} numeroPoliza - Número de la póliza a actualizar.
 * @param {Buffer} fileBuffer - Contenido binario del archivo.
 * @param {('foto'|'pdf')} fileType - El tipo de archivo: 'foto' o 'pdf'.
 * @returns {Promise<Object|null>} - La póliza actualizada o null si no existe.
 */
const addFileToPolicy = async (numeroPoliza, fileBuffer, fileType) => {
    try {
        logger.info(`Añadiendo archivo tipo ${fileType} a la póliza: ${numeroPoliza}`);
        
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada al intentar añadir archivo: ${numeroPoliza}`);
            return null;
        }

        // Aseguramos que el campo 'archivos' exista
        if (!policy.archivos) {
            policy.archivos = { fotos: [], pdfs: [] };
        }

        // Asegurar que fileBuffer es un Buffer válido
        const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

        // Crear el objeto de archivo
        const fileObject = {
            data: buffer,
            contentType: fileType === 'foto' ? 'image/jpeg' : 'application/pdf'
        };

        // Añadir el archivo al array correspondiente
        if (fileType === 'foto') {
            policy.archivos.fotos.push(fileObject);
        } else if (fileType === 'pdf') {
            policy.archivos.pdfs.push(fileObject);
        }

        const updatedPolicy = await policy.save();
        return updatedPolicy;
    } catch (error) {
        logger.error('Error al añadir archivo a la póliza:', error);
        throw error;
    }
};

/**
 * Elimina una póliza por su número.
 * @param {string} numeroPoliza - El número de póliza a eliminar.
 * @returns {Promise<Object|null>} - La póliza eliminada o null si no existe.
 */
const deletePolicyByNumber = async (numeroPoliza) => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    return await Policy.findOneAndDelete({ numeroPoliza: normalizedNumero });
};

/**
 * Agrega un pago a la póliza indicada por numeroPoliza.
 * @param {string} numeroPoliza - Número de la póliza a actualizar.
 * @param {number} monto - Cantidad pagada.
 * @param {Date} fechaPago - Fecha del pago (objeto Date).
 * @returns {Promise<Object|null>} - La póliza actualizada o null si no existe.
 */
const addPaymentToPolicy = async (numeroPoliza, monto, fechaPago) => {
    try {
        logger.info(`Añadiendo pago a la póliza: ${numeroPoliza} por $${monto} en ${fechaPago.toISOString()}`);
        
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada al intentar añadir pago: ${numeroPoliza}`);
            return null; // Si no existe, retornamos null
        }

        // Añadir el pago al arreglo
        policy.pagos.push({ monto, fechaPago });

        const updatedPolicy = await policy.save();
        logger.info(`Pago agregado correctamente a la póliza: ${numeroPoliza}`);
        return updatedPolicy;
    } catch (error) {
        logger.error('Error al añadir pago a la póliza:', {
            numeroPoliza,
            monto,
            error: error.message
        });
        throw error;
    }
};

/**
 * Agrega un servicio a la póliza indicada por numeroPoliza.
 * @param {string} numeroPoliza - Número de la póliza a actualizar.
 * @param {number} costo - Costo del servicio.
 * @param {Date} fechaServicio - Fecha del servicio (Date).
 * @param {string} numeroExpediente - Número de expediente del servicio.
 * @param {string} origenDestino - Origen y destino del servicio.
 * @returns {Promise<Object|null>} - Póliza actualizada o null si no existe.
 */
const addServiceToPolicy = async (numeroPoliza, costo, fechaServicio, numeroExpediente, origenDestino) => {
    try {
        logger.info(`Añadiendo servicio a la póliza: ${numeroPoliza}`);
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza} al intentar añadir servicio.`);
            return null;
        }

        // Determinar el siguiente número de servicio
        const nextServiceNumber = (policy.servicios?.length || 0) + 1;

        // Añadir el servicio al arreglo incluyendo origenDestino
        policy.servicios.push({
            numeroServicio: nextServiceNumber,
            costo,
            fechaServicio,
            numeroExpediente,
            origenDestino // <-- Asegúrate de incluir este campo
        });

        // Guardamos la póliza
        const updatedPolicy = await policy.save();
        logger.info(`Servicio #${nextServiceNumber} añadido correctamente a la póliza ${numeroPoliza}`);
        return updatedPolicy;
    } catch (error) {
        logger.error('Error al añadir servicio a la póliza:', {
            numeroPoliza,
            costo,
            fechaServicio,
            numeroExpediente,
            origenDestino, // <-- Añade también en el log
            error: error.message
        });
        throw error;
    }
};

/**
 * Calcula y obtiene las pólizas susceptibles de falta de pago,
 * incluyendo el cálculo de días de impago.
 * @returns {Promise<Array>} - Array de pólizas susceptibles con días de impago.
 */
const getSusceptiblePolicies = async () => {
    try {
        const allPolicies = await Policy.find({}).lean();
        const now = new Date(); // ← Fecha actual (día del reporte)
        const susceptibles = [];

        for (const policy of allPolicies) {
            const { numeroPoliza, fechaEmision, pagos = [] } = policy;

            // 1. Validar fecha de emisión
            if (!fechaEmision) {
                // Sin fechaEmision => asignamos 0 (o la consideramos susceptible)
                susceptibles.push({
                    numeroPoliza,
                    diasDeImpago: 0
                });
                continue;
            }

            // 2. Calcular días transcurridos desde la fecha de emisión hasta hoy
            const msTranscurridos = now - new Date(fechaEmision);
            if (msTranscurridos <= 0) {
                // Si la póliza tiene una fecha a futuro, no es susceptible por ahora
                continue;
            }
            const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));

            // 3. Ordenar pagos por fecha ascendente y acumular 30 días por cada pago
            const pagosOrdenados = pagos.sort((a, b) => new Date(a.fechaPago) - new Date(b.fechaPago));
            let diasCubiertos = 0;

            for (const pago of pagosOrdenados) {
                const fpago = new Date(pago.fechaPago);
                if (isNaN(fpago.getTime())) {
                    // Ignorar pagos con fecha inválida
                    continue;
                }
                // Cada pago cubre 30 días
                diasCubiertos += 30;
            }

            // 4. Cálculo de días de impago
            let diasDeImpago = diasTranscurridos - diasCubiertos;
            if (diasDeImpago < 0) {
                diasDeImpago = 0; // Si está cubierto de más, se asigna 0
            }

            // 5. Solo son susceptibles las pólizas con impago > 0
            if (diasDeImpago > 0) {
                susceptibles.push({
                    numeroPoliza,
                    diasDeImpago
                });
            }
        }

        // 6. Ordenar de mayor a menor días de impago
        susceptibles.sort((a, b) => b.diasDeImpago - a.diasDeImpago);

        return susceptibles;
    } catch (error) {
        logger.error('Error en getSusceptiblePolicies:', { error: error.message });
        throw error;
    }

};

/**
 * Retorna las pólizas con mayor prioridad de uso.
 * Nueva Prioridad:
 *   1) Pólizas a punto de vencer (30 días o más) sin pagos ni servicios
 *   2) Pólizas sin servicios, ordenadas por antigüedad
 *   3) Pólizas con un servicio pero sin pago
 *   4) Pólizas más antiguas sin pagos
 *   5) Pólizas con pagos realizados
 *   6) Pólizas con dos o más servicios
 */
const getOldUnusedPolicies = async () => {
    const now = new Date();
    const THRESHOLD_DIAS_MINIMO = 25;
    const DIAS_POR_PAGO = 30;

    // 1) Obtener todas las pólizas
    const allPolicies = await Policy.find({}).lean();

    // 2) Preparar datos para ordenamiento
    const polConCampos = allPolicies.map((pol) => {
        const msDesdeEmision = now - new Date(pol.fechaEmision);
        const diasTotales = Math.floor(msDesdeEmision / (1000 * 60 * 60 * 24));
        
        const servicios = pol.servicios || [];
        const pagos = pol.pagos || [];
        
        // Calcular días efectivos restando 30 días por cada pago
        const diasCubiertos = pagos.length * DIAS_POR_PAGO;
        const diasEfectivos = Math.max(0, diasTotales - diasCubiertos);

        // Una póliza está a punto de vencer si:
        // 1. No tiene servicios
        // 2. Los días efectivos (después de considerar pagos) son >= 25
        const aPuntoDeVencer = servicios.length === 0 && diasEfectivos >= 25;

        return {
            pol,
            diasTotales,
            diasEfectivos,
            numServicios: servicios.length,
            numPagos: pagos.length,
            aPuntoDeVencer,
            ultimoServicio: servicios.length > 0 ? 
                Math.max(...servicios.map(s => new Date(s.fechaServicio).getTime())) : 
                null
        };
    });

    // 3) Filtrar pólizas según días efectivos
    const polFiltradas = polConCampos.filter(({ diasEfectivos }) => 
        diasEfectivos >= THRESHOLD_DIAS_MINIMO
    );

    // 4) Ordenar según nueva priorización
    polFiltradas.sort((a, b) => {
        // 1. Priorizar pólizas a punto de vencer
        if (a.aPuntoDeVencer && !b.aPuntoDeVencer) return -1;
        if (b.aPuntoDeVencer && !a.aPuntoDeVencer) return 1;
        
        // 2. Priorizar pólizas sin servicios y más días efectivos
        if (a.numServicios === 0 && b.numServicios !== 0) return -1;
        if (b.numServicios === 0 && a.numServicios !== 0) return 1;
        if (a.numServicios === 0 && b.numServicios === 0) {
            return b.diasEfectivos - a.diasEfectivos;
        }
        
        // 3. Pólizas con un servicio pero sin pago
        if (a.numServicios === 1 && a.numPagos === 0 && 
            b.numServicios === 1 && b.numPagos === 0) {
            return b.diasEfectivos - a.diasEfectivos;
        }
        
        // 4. Priorizar por días efectivos si son diferentes
        if (a.diasEfectivos !== b.diasEfectivos) {
            return b.diasEfectivos - a.diasEfectivos;
        }

        // 5. Pólizas con pagos van al final
        if (a.numPagos > 0 && b.numPagos === 0) return 1;
        if (b.numPagos > 0 && a.numPagos === 0) return -1;

        // 6. Pólizas con dos o más servicios al final
        if (a.numServicios >= 2 && b.numServicios < 2) return 1;
        if (b.numServicios >= 2 && a.numServicios < 2) return -1;
        
        return 0;
    });

    // 5) Retornar top 10
    return polFiltradas.slice(0, 10).map(x => ({
        ...x.pol,
        _diasEfectivos: x.diasEfectivos // Añadimos esta info para el reporte
    }));
};

module.exports = {
    savePolicy,
    getPolicyByNumber,
    addFileToPolicy, // Exportar la nueva función
    addPaymentToPolicy, // <-- Asegúrate de incluirla aquí
    addServiceToPolicy, // <-- Asegurarte de exportarla
    DuplicatePolicyError, // Exportar la clase de error para uso externo
    getSusceptiblePolicies,
    getOldUnusedPolicies,
    deletePolicyByNumber
};