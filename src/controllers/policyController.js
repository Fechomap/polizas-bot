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

        // Modificamos la consulta para solo retornar pólizas ACTIVAS
        const policy = await Policy.findOne({
            numeroPoliza: normalizedNumero,
            estado: 'ACTIVO' // Solo traemos pólizas activas
        });

        // Log del resultado
        if (policy) {
            logger.info('Póliza encontrada:', {
                numeroPoliza: policy.numeroPoliza,
                id: policy._id
            });
        } else {
            logger.warn('Póliza no encontrada o no activa:', { numeroPoliza });
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
 * Marca una póliza como ELIMINADA (borrado lógico)
 * @param {string} numeroPoliza - El número de póliza a marcar como eliminada
 * @param {string} motivo - Motivo opcional de la eliminación
 * @returns {Promise<Object|null>} - La póliza actualizada o null si no existe
 */
const markPolicyAsDeleted = async (numeroPoliza, motivo = '') => {
    try {
        const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
        logger.info(`Marcando póliza ${normalizedNumero} como ELIMINADA`);

        // Usamos findOneAndUpdate en lugar de findOne + save para evitar validaciones
        // que podrían fallar en pólizas con datos incompletos
        const updatedPolicy = await Policy.findOneAndUpdate(
            { numeroPoliza: normalizedNumero, estado: 'ACTIVO' },
            {
                estado: 'ELIMINADO',
                fechaEliminacion: new Date(),
                motivoEliminacion: motivo
            },
            {
                new: true,          // Retorna el documento actualizado
                runValidators: false // No ejecuta validadores de esquema
            }
        );

        if (!updatedPolicy) {
            logger.warn(`No se encontró póliza activa con número: ${normalizedNumero}`);
            return null;
        }

        logger.info(`Póliza ${normalizedNumero} marcada como ELIMINADA exitosamente`);
        return updatedPolicy;
    } catch (error) {
        logger.error('Error al marcar póliza como eliminada:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};

/**
 * Elimina físicamente una póliza por su número.
 * @param {string} numeroPoliza - El número de póliza a eliminar.
 * @returns {Promise<Object|null>} - La póliza eliminada o null si no existe.
 * @deprecated Use markPolicyAsDeleted para borrado lógico
 */
const deletePolicyByNumber = async (numeroPoliza) => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    return await Policy.findOneAndDelete({ numeroPoliza: normalizedNumero });
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
 * @param {Object} coordenadas - Coordenadas de origen y destino (opcional).
 * @param {Object} rutaInfo - Información de la ruta calculada (opcional).
 * @returns {Promise<Object|null>} - Póliza actualizada o null si no existe.
 */
const addServiceToPolicy = async (numeroPoliza, costo, fechaServicio, numeroExpediente, origenDestino, coordenadas = null, rutaInfo = null) => {
    try {
        logger.info(`Añadiendo servicio a la póliza: ${numeroPoliza}`, {
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida'
        });
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza} al intentar añadir servicio.`);
            return null;
        }

        // Inicializar contador de servicios si no existe
        if (policy.servicioCounter === undefined) {
            policy.servicioCounter = 0;
        }

        // Incrementar el contador para este nuevo servicio
        policy.servicioCounter += 1;
        const nextServiceNumber = policy.servicioCounter;

        // Crear objeto de servicio con nuevos campos
        const serviceData = {
            numeroServicio: nextServiceNumber,
            costo,
            fechaServicio,
            numeroExpediente,
            origenDestino
        };

        // Añadir coordenadas si están disponibles
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
            logger.info(`Coordenadas añadidas al servicio #${nextServiceNumber}`, coordenadas);
        }

        // Añadir información de ruta si está disponible
        if (rutaInfo) {
            serviceData.rutaInfo = {
                distanciaKm: rutaInfo.distanciaKm,
                tiempoMinutos: rutaInfo.tiempoMinutos
            };

            // Añadir Google Maps URL si está disponible
            if (rutaInfo.googleMapsUrl) {
                serviceData.rutaInfo.googleMapsUrl = rutaInfo.googleMapsUrl;
            }

            logger.info(`Información de ruta añadida al servicio #${nextServiceNumber}`, {
                distancia: rutaInfo.distanciaKm,
                tiempo: rutaInfo.tiempoMinutos,
                aproximado: rutaInfo.aproximado || false
            });
        }

        // Añadir el servicio al arreglo
        policy.servicios.push(serviceData);

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
            origenDestino,
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida',
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
        // Modificar para incluir solo pólizas ACTIVAS
        const allPolicies = await Policy.find({ estado: 'ACTIVO' }).lean();
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
 * Retorna las 10 pólizas con mayor prioridad de uso.
 * Prioridad:
 *   1) Pólizas sin servicios (y mayores de 26 días de emisión si deseas).
 *   2) Luego pólizas con servicios, ordenadas por fecha del último servicio (más antiguo primero).
 *   3) Orden secundario por fechaEmision más antigua.
 */
const getOldUnusedPolicies = async () => {
    const now = new Date();
    const THRESHOLD_DIAS_MINIMO = 26; // Si deseas descartar pólizas que tengan < 26 días de emisión

    // 1) Obtenemos todas las pólizas ACTIVAS
    const allPolicies = await Policy.find({ estado: 'ACTIVO' }).lean();

    // 2) Armamos un array con datos calculados
    const polConCampos = allPolicies.map((pol) => {
        const msDesdeEmision = now - pol.fechaEmision;
        const diasDesdeEmision = Math.floor(msDesdeEmision / (1000 * 60 * 60 * 24));

        const servicios = pol.servicios || [];
        if (servicios.length === 0) {
            // Sin servicios
            return {
                pol,
                priorityGroup: 1, // Mayor prioridad
                lastServiceDate: null, // no existe
                diasDesdeEmision
            };
        } else {
            // Con servicios => calculamos fecha del último
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

    // 3) Filtrar las pólizas muy recientes (si se desea)
    const polFiltradas = polConCampos.filter(({ diasDesdeEmision }) => {
        // Ej.: descartar si la póliza se emitió hace menos de 26 días
        return diasDesdeEmision >= THRESHOLD_DIAS_MINIMO;
    });

    // 4) Ordenar:
    //    - primero por priorityGroup asc (1 sin servicios, 2 con servicios)
    //    - dentro de priorityGroup=1, por diasDesdeEmision desc (más antigua primero)
    //    - para priorityGroup=2, ordenamos por lastServiceDate asc (más antiguo primero),
    //      y secundario diasDesdeEmision desc (más antigua primero)
    polFiltradas.sort((a, b) => {
        // Comparar por priorityGroup
        if (a.priorityGroup !== b.priorityGroup) {
            return a.priorityGroup - b.priorityGroup;
        }

        // Ambos en priorityGroup=1 => ordenamos por diasDesdeEmision desc
        if (a.priorityGroup === 1) {
            return b.diasDesdeEmision - a.diasDesdeEmision;
        }

        // Ambos en priorityGroup=2 => comparamos lastServiceDate asc
        if (a.lastServiceDate && b.lastServiceDate) {
            const diff = a.lastServiceDate - b.lastServiceDate;
            if (diff !== 0) return diff;
        } else if (a.lastServiceDate && !b.lastServiceDate) {
            // si uno no tiene lastServiceDate, lo ponemos después
            return -1;
        } else if (!a.lastServiceDate && b.lastServiceDate) {
            return 1;
        }

        // si lastServiceDate es igual o ambos nulos, desempatar con diasDesdeEmision desc
        return b.diasDesdeEmision - a.diasDesdeEmision;
    });

    // 5) Tomar top 10
    const top10 = polFiltradas.slice(0, 10).map(x => x.pol);
    return top10;
};

/**
 * Obtiene las pólizas marcadas como eliminadas
 * @returns {Promise<Array>} - Array de pólizas eliminadas
 */
const getDeletedPolicies = async () => {
    try {
        return await Policy.find({ estado: 'ELIMINADO' }).lean();
    } catch (error) {
        logger.error('Error al obtener pólizas eliminadas:', error);
        throw error;
    }
};

/**
 * Restaura una póliza previamente marcada como eliminada
 * @param {string} numeroPoliza - Número de la póliza a restaurar
 * @returns {Promise<Object|null>} - La póliza restaurada o null si no existe
 */
const restorePolicy = async (numeroPoliza) => {
    try {
        const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();

        const policy = await Policy.findOne({
            numeroPoliza: normalizedNumero,
            estado: 'ELIMINADO'
        });

        if (!policy) {
            logger.warn(`No se encontró póliza eliminada con número: ${normalizedNumero}`);
            return null;
        }

        policy.estado = 'ACTIVO';
        policy.fechaEliminacion = null;
        policy.motivoEliminacion = '';

        const updatedPolicy = await policy.save();
        logger.info(`Póliza ${normalizedNumero} restaurada exitosamente`);

        return updatedPolicy;
    } catch (error) {
        logger.error('Error al restaurar póliza:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};

/**
 * Guarda múltiples pólizas en la base de datos de forma eficiente
 * @param {Array} policiesData - Array de objetos con datos de pólizas
 * @returns {Promise<Object>} - Resultados del procesamiento
 */
const savePoliciesBatch = async (policiesData) => {
    const results = {
        total: policiesData.length,
        successful: 0,
        failed: 0,
        details: []
    };

    try {
        logger.info(`Procesando lote de ${policiesData.length} pólizas`);

        for (const policyData of policiesData) {
            try {
                if (!policyData.numeroPoliza) {
                    throw new Error('Número de póliza es requerido');
                }

                policyData.numeroPoliza = policyData.numeroPoliza.trim().toUpperCase();

                const existingPolicy = await Policy.findOne({
                    numeroPoliza: policyData.numeroPoliza
                });

                if (existingPolicy) {
                    throw new DuplicatePolicyError(`Ya existe una póliza con el número: ${policyData.numeroPoliza}`);
                }

                const newPolicy = new Policy(policyData);
                const savedPolicy = await newPolicy.save();

                logger.info('Póliza guardada exitosamente:', {
                    numeroPoliza: savedPolicy.numeroPoliza,
                    _id: savedPolicy._id
                });

                results.successful++;
                results.details.push({
                    numeroPoliza: savedPolicy.numeroPoliza,
                    status: 'SUCCESS',
                    message: 'Registrada correctamente'
                });
            } catch (error) {
                results.failed++;

                let errorMessage = 'Error desconocido';
                if (error instanceof DuplicatePolicyError) {
                    errorMessage = 'Póliza duplicada';
                } else if (error.name === 'ValidationError') {
                    const campos = Object.keys(error.errors || {});
                    errorMessage = `Error de validación: ${campos.join(', ')}`;
                } else {
                    errorMessage = error.message;
                }

                logger.error('Error al guardar póliza:', {
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

        logger.info('Procesamiento de lote completado', {
            total: results.total,
            exitosas: results.successful,
            fallidas: results.failed
        });

        return results;
    } catch (error) {
        logger.error('Error general en savePoliciesBatch:', error);
        throw error;
    }
};

/**
 * NUEVA FUNCIONALIDAD: Manejo de REGISTROS (intentos) vs SERVICIOS (confirmados)
 */

/**
 * Añade un REGISTRO (intento de servicio) a la póliza. No cuenta como servicio hasta confirmarse.
 */
const addRegistroToPolicy = async (numeroPoliza, costo, fechaRegistro, numeroExpediente, origenDestino, coordenadas = null, rutaInfo = null) => {
    try {
        logger.info(`Añadiendo REGISTRO a la póliza: ${numeroPoliza}`, {
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida'
        });

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza} al intentar añadir registro.`);
            return null;
        }

        // Inicializar contador de registros si no existe
        if (policy.registroCounter === undefined) {
            policy.registroCounter = 0;
        }

        // Incrementar el contador para este nuevo registro
        policy.registroCounter += 1;
        const nextRegistroNumber = policy.registroCounter;

        // Crear objeto de registro
        const registroData = {
            numeroRegistro: nextRegistroNumber,
            costo,
            fechaRegistro,
            numeroExpediente,
            origenDestino,
            estado: 'PENDIENTE'
        };

        // Añadir coordenadas si están disponibles
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
            logger.info(`Coordenadas añadidas al registro #${nextRegistroNumber}`, coordenadas);
        }

        // Añadir información de ruta si está disponible
        if (rutaInfo) {
            registroData.rutaInfo = {
                distanciaKm: rutaInfo.distanciaKm,
                tiempoMinutos: rutaInfo.tiempoMinutos
            };

            if (rutaInfo.googleMapsUrl) {
                registroData.rutaInfo.googleMapsUrl = rutaInfo.googleMapsUrl;
            }

            logger.info(`Información de ruta añadida al registro #${nextRegistroNumber}`, {
                distancia: rutaInfo.distanciaKm,
                tiempo: rutaInfo.tiempoMinutos
            });
        }

        // Inicializar array de registros si no existe
        if (!policy.registros) {
            policy.registros = [];
        }

        // Añadir el registro al arreglo
        policy.registros.push(registroData);

        const updatedPolicy = await policy.save();
        logger.info(`Registro #${nextRegistroNumber} añadido correctamente a la póliza ${numeroPoliza}`);
        return updatedPolicy;
    } catch (error) {
        logger.error('Error al añadir registro a la póliza:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};

/**
 * Convierte un REGISTRO en SERVICIO confirmado con fechas de contacto y término programadas
 */
const convertirRegistroAServicio = async (numeroPoliza, numeroRegistro, fechaContactoProgramada, fechaTerminoProgramada) => {
    try {
        logger.info(`Convirtiendo registro ${numeroRegistro} a servicio en póliza: ${numeroPoliza}`);

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }

        // Buscar el registro
        const registro = policy.registros.find(r => r.numeroRegistro === numeroRegistro);
        if (!registro) {
            logger.warn(`Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}`);
            return null;
        }

        // Marcar registro como ASIGNADO
        registro.estado = 'ASIGNADO';
        registro.fechaContactoProgramada = fechaContactoProgramada;
        registro.fechaTerminoProgramada = fechaTerminoProgramada;

        // Inicializar contador de servicios si no existe
        if (policy.servicioCounter === undefined) {
            policy.servicioCounter = 0;
        }

        // Incrementar contador de servicios
        policy.servicioCounter += 1;
        const nextServiceNumber = policy.servicioCounter;

        // Crear servicio basado en el registro
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

        // Añadir servicio al array
        policy.servicios.push(servicioData);

        const updatedPolicy = await policy.save();
        logger.info(`Registro #${numeroRegistro} convertido a servicio #${nextServiceNumber} en póliza ${numeroPoliza}`);
        return { updatedPolicy, numeroServicio: nextServiceNumber };
    } catch (error) {
        logger.error('Error al convertir registro a servicio:', {
            numeroPoliza,
            numeroRegistro,
            error: error.message
        });
        throw error;
    }
};

/**
 * Marca un registro como NO ASIGNADO
 */
const marcarRegistroNoAsignado = async (numeroPoliza, numeroRegistro) => {
    try {
        logger.info(`Marcando registro ${numeroRegistro} como NO ASIGNADO en póliza: ${numeroPoliza}`);

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }

        // Buscar el registro
        const registro = policy.registros.find(r => r.numeroRegistro === numeroRegistro);
        if (!registro) {
            logger.warn(`Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}`);
            return null;
        }

        // Marcar registro como NO_ASIGNADO
        registro.estado = 'NO_ASIGNADO';

        const updatedPolicy = await policy.save();
        logger.info(`Registro #${numeroRegistro} marcado como NO ASIGNADO en póliza ${numeroPoliza}`);
        return updatedPolicy;
    } catch (error) {
        logger.error('Error al marcar registro como no asignado:', {
            numeroPoliza,
            numeroRegistro,
            error: error.message
        });
        throw error;
    }
};

/**
 * Genera horas aleatorias de contacto (22-39 min después) y término automático
 */
const calcularHorasAutomaticas = (fechaBase, tiempoTrayectoMinutos = 0) => {
    // Contacto: entre 22 y 39 minutos después de la fecha base
    const minutosContacto = Math.floor(Math.random() * (39 - 22 + 1)) + 22;
    const fechaContacto = new Date(fechaBase.getTime() + minutosContacto * 60000);

    // Término: contacto + tiempo de trayecto + 40 minutos adicionales
    const minutosTermino = tiempoTrayectoMinutos + 40;
    const fechaTermino = new Date(fechaContacto.getTime() + minutosTermino * 60000);

    return {
        fechaContactoProgramada: fechaContacto,
        fechaTerminoProgramada: fechaTermino,
        minutosContacto,
        minutosTermino
    };
};

module.exports = {
    savePolicy,
    getPolicyByNumber,
    addFileToPolicy,
    addPaymentToPolicy,
    addServiceToPolicy,
    DuplicatePolicyError,
    getSusceptiblePolicies,
    getOldUnusedPolicies,
    deletePolicyByNumber,
    markPolicyAsDeleted,
    getDeletedPolicies,
    restorePolicy,
    savePoliciesBatch,
    // Nuevas funciones para registros vs servicios
    addRegistroToPolicy,
    convertirRegistroAServicio,
    marcarRegistroNoAsignado,
    calcularHorasAutomaticas
};
