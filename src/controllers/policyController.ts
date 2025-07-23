// src/controllers/policyController.ts
import Policy from '../models/policy';
import logger from '../utils/logger';
import type {
    IPolicy,
    IPolicyData,
    IPago,
    IServicio,
    IRegistro,
    ICoordenadas,
    IRutaInfo
} from '../types/database';

/**
 * Clase de Error para Pólizas Duplicadas
 */
export class DuplicatePolicyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DuplicatePolicyError';
    }
}

/**
 * Guarda una nueva póliza en la base de datos
 * @param policyData - Datos de la póliza
 * @returns La póliza guardada
 * @throws DuplicatePolicyError Si la póliza ya existe
 */
export const savePolicy = async (policyData: IPolicyData): Promise<IPolicy> => {
    try {
        logger.info('Intentando guardar póliza:', { numeroPoliza: policyData.numeroPoliza });
        const newPolicy = new Policy(policyData);
        const savedPolicy = await newPolicy.save();
        logger.info('Póliza guardada exitosamente:', { numeroPoliza: savedPolicy.numeroPoliza });
        return savedPolicy;
    } catch (error: any) {
        logger.error('Error al guardar póliza:', {
            numeroPoliza: policyData?.numeroPoliza,
            error: error.message
        });
        if (error.code === 11000 && error.keyPattern?.numeroPoliza) {
            throw new DuplicatePolicyError(
                `Ya existe una póliza con el número: ${policyData.numeroPoliza}`
            );
        }
        throw error;
    }
};

/**
 * Obtiene una póliza por su número.
 * @param numeroPoliza - El número de la póliza.
 * @returns La póliza encontrada o null si no existe.
 */
export const getPolicyByNumber = async (numeroPoliza: string): Promise<IPolicy | null> => {
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
    } catch (error: any) {
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
 * @param numeroPoliza - El número de póliza a marcar como eliminada
 * @param motivo - Motivo opcional de la eliminación
 * @returns La póliza actualizada o null si no existe
 */
export const markPolicyAsDeleted = async (
    numeroPoliza: string,
    motivo = ''
): Promise<IPolicy | null> => {
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
                new: true, // Retorna el documento actualizado
                runValidators: false // No ejecuta validadores de esquema
            }
        );

        if (!updatedPolicy) {
            logger.warn(`No se encontró póliza activa con número: ${normalizedNumero}`);
            return null;
        }

        logger.info(`Póliza ${normalizedNumero} marcada como ELIMINADA exitosamente`);
        return updatedPolicy;
    } catch (error: any) {
        logger.error('Error al marcar póliza como eliminada:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};

/**
 * Elimina físicamente una póliza por su número.
 * @param numeroPoliza - El número de póliza a eliminar.
 * @returns La póliza eliminada o null si no existe.
 * @deprecated Use markPolicyAsDeleted para borrado lógico
 */
export const deletePolicyByNumber = async (numeroPoliza: string): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    return await Policy.findOneAndDelete({ numeroPoliza: normalizedNumero });
};

/**
 * Añade un archivo (foto o PDF) a la póliza indicada por numeroPoliza.
 * @param numeroPoliza - Número de la póliza a actualizar.
 * @param fileBuffer - Contenido binario del archivo.
 * @param fileType - El tipo de archivo: 'foto' o 'pdf'.
 * @returns La póliza actualizada o null si no existe.
 */
export const addFileToPolicy = async (
    numeroPoliza: string,
    fileBuffer: Buffer,
    fileType: 'foto' | 'pdf'
): Promise<IPolicy | null> => {
    try {
        logger.info(`Añadiendo archivo tipo ${fileType} a la póliza: ${numeroPoliza}`);

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada al intentar añadir archivo: ${numeroPoliza}`);
            return null;
        }

        // Aseguramos que el campo 'archivos' exista
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
    } catch (error: any) {
        logger.error('Error al añadir archivo a la póliza:', error);
        throw error;
    }
};

/**
 * Agrega un pago a la póliza indicada por numeroPoliza.
 * @param numeroPoliza - Número de la póliza a actualizar.
 * @param monto - Cantidad pagada.
 * @param fechaPago - Fecha del pago (objeto Date).
 * @returns La póliza actualizada o null si no existe.
 */
export const addPaymentToPolicy = async (
    numeroPoliza: string,
    monto: number,
    fechaPago: Date
): Promise<IPolicy | null> => {
    try {
        logger.info(
            `Añadiendo pago a la póliza: ${numeroPoliza} por $${monto} en ${fechaPago.toISOString()}`
        );

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada al intentar añadir pago: ${numeroPoliza}`);
            return null; // Si no existe, retornamos null
        }

        // Añadir el pago al arreglo (marcado como REALIZADO ya que es un pago manual)
        policy.pagos.push({
            monto,
            fechaPago,
            estado: 'REALIZADO',
            notas: 'Pago registrado manualmente - dinero real recibido'
        });

        const updatedPolicy = await policy.save();
        logger.info(`Pago agregado correctamente a la póliza: ${numeroPoliza}`);
        return updatedPolicy;
    } catch (error: any) {
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
 * @param numeroPoliza - Número de la póliza a actualizar.
 * @param costo - Costo del servicio.
 * @param fechaServicio - Fecha del servicio (Date).
 * @param numeroExpediente - Número de expediente del servicio.
 * @param origenDestino - Origen y destino del servicio.
 * @param coordenadas - Coordenadas de origen y destino (opcional).
 * @param rutaInfo - Información de la ruta calculada (opcional).
 * @returns Póliza actualizada o null si no existe.
 */
export const addServiceToPolicy = async (
    numeroPoliza: string,
    costo: number,
    fechaServicio: Date,
    numeroExpediente: string,
    origenDestino: string,
    coordenadas: ICoordenadas | null = null,
    rutaInfo: IRutaInfo | null = null
): Promise<IPolicy | null> => {
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
        const serviceData: IServicio = {
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
        logger.info(
            `Servicio #${nextServiceNumber} añadido correctamente a la póliza ${numeroPoliza}`
        );
        return updatedPolicy;
    } catch (error: any) {
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
 * @returns Array de pólizas susceptibles con días de impago.
 */
export const getSusceptiblePolicies = async (): Promise<
    Array<{ numeroPoliza: string; diasDeImpago: number }>
> => {
    try {
        // Modificar para incluir solo pólizas ACTIVAS
        const allPolicies = await Policy.find({ estado: 'ACTIVO' }).lean();
        const now = new Date(); // ← Fecha actual (día del reporte)
        const susceptibles: Array<{ numeroPoliza: string; diasDeImpago: number }> = [];

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
            const msTranscurridos = now.getTime() - new Date(fechaEmision).getTime();
            if (msTranscurridos <= 0) {
                // Si la póliza tiene una fecha a futuro, no es susceptible por ahora
                continue;
            }
            const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));

            // 3. Filtrar SOLO pagos REALIZADOS y ordenar por fecha ascendente
            const pagosRealizados = pagos.filter((pago: IPago) => pago.estado === 'REALIZADO');
            const pagosOrdenados = pagosRealizados.sort(
                (a: IPago, b: IPago) =>
                    new Date(a.fechaPago).getTime() - new Date(b.fechaPago).getTime()
            );
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
    } catch (error: any) {
        logger.error('Error en getSusceptiblePolicies:', { error: error.message });
        throw error;
    }
};

interface DetailedPaymentInfo {
    numeroPoliza: string;
    fechaEmision: Date;
    diasTranscurridos: number;
    diasDeImpago: number;
    pagosRealizados: {
        cantidad: number;
        montoTotal: number;
        detalles: IPago[];
    };
    pagosPlanificados: {
        cantidad: number;
        montoTotal: number;
        detalles: IPago[];
    };
    proximoPagoPlanificado: IPago | null;
}

/**
 * Obtiene información detallada de pagos para una póliza específica
 * Incluye montos planificados (para referencia) y realizados (para cálculos reales)
 * @param numeroPoliza - Número de la póliza a consultar
 * @returns Información detallada de pagos o null si no existe
 */
export const getDetailedPaymentInfo = async (
    numeroPoliza: string
): Promise<DetailedPaymentInfo | null> => {
    try {
        const policy = await Policy.findOne({ numeroPoliza }).exec();
        if (!policy) {
            return null;
        }

        const pagosRealizados = policy.pagos.filter((pago: IPago) => pago.estado === 'REALIZADO');
        const pagosPlanificados = policy.pagos.filter(
            (pago: IPago) => pago.estado === 'PLANIFICADO'
        );

        // Calcular días transcurridos desde emisión
        const fechaEmision = new Date(policy.fechaEmision);
        const ahora = new Date();
        const msTranscurridos = ahora.getTime() - fechaEmision.getTime();
        const diasTranscurridos = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24));

        // Calcular días cubiertos por pagos realizados
        const diasCubiertos = pagosRealizados.length * 30;
        const diasDeImpago = Math.max(0, diasTranscurridos - diasCubiertos);

        return {
            numeroPoliza: policy.numeroPoliza,
            fechaEmision: policy.fechaEmision,
            diasTranscurridos,
            diasDeImpago,
            pagosRealizados: {
                cantidad: pagosRealizados.length,
                montoTotal: pagosRealizados.reduce(
                    (sum: number, pago: IPago) => sum + pago.monto,
                    0
                ),
                detalles: pagosRealizados
            },
            pagosPlanificados: {
                cantidad: pagosPlanificados.length,
                montoTotal: pagosPlanificados.reduce(
                    (sum: number, pago: IPago) => sum + pago.monto,
                    0
                ),
                detalles: pagosPlanificados
            },
            proximoPagoPlanificado: pagosPlanificados.length > 0 ? pagosPlanificados[0] : null
        };
    } catch (error: any) {
        logger.error('Error al obtener información detallada de pagos:', error);
        throw error;
    }
};

/**
 * ✅ ACTUALIZADO: Retorna las 10 pólizas regulares + hasta 4 NIVs disponibles
 * Prioridad pólizas regulares:
 *   1) Pólizas sin servicios (y mayores de 26 días de emisión).
 *   2) Luego pólizas con servicios, ordenadas por fecha del último servicio (más antiguo primero).
 *   3) Orden secundario por fechaEmision más antigua.
 *
 * NIVs:
 *   - Solo NIVs sin usar (totalServicios: 0)
 *   - Ordenados por fecha de creación (más recientes primero)
 *   - Máximo 4 NIVs en el reporte
 */
export const getOldUnusedPolicies = async (): Promise<any[]> => {
    try {
        const now = new Date();
        const THRESHOLD_DIAS_MINIMO = 26;

        // 1) Obtener pólizas regulares (excluyendo NIVs)
        const regularPolicies = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: { $ne: 'NIV' } // Excluir NIVs del top regular
        }).lean();

        // 2) Procesar pólizas regulares con lógica existente
        interface PolicyWithFields {
            pol: IPolicy;
            priorityGroup: number;
            lastServiceDate: Date | null;
            diasDesdeEmision: number;
        }

        const polConCampos: PolicyWithFields[] = regularPolicies.map(pol => {
            const msDesdeEmision = now.getTime() - pol.fechaEmision.getTime();
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
                let ultimoServicio: Date | null = null;
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
                const diff = a.lastServiceDate.getTime() - b.lastServiceDate.getTime();
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

        // 5) Tomar top 10 pólizas regulares
        const top10Regulares = polFiltradas.slice(0, 10).map(x => x.pol);

        // 6) ✅ NUEVO: Obtener hasta 4 NIVs disponibles
        const nips = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIV',
            totalServicios: 0 // Solo NIVs sin usar
        })
            .sort({ createdAt: -1 }) // Más recientes primero
            .limit(4)
            .lean();

        // 7) Combinar resultados y agregar metadatos
        const todasLasPolizas = [
            ...top10Regulares.map((policy, index) => ({
                ...policy,
                posicion: index + 1,
                tipoReporte: 'REGULAR' as const,
                mensajeEspecial: null
            })),
            ...nips.map((nip, index) => ({
                ...nip,
                posicion: top10Regulares.length + index + 1,
                tipoReporte: 'NIV' as const,
                mensajeEspecial: '⚡ NIV DISPONIBLE'
            }))
        ];

        logger.info(
            `Reporte generado: ${top10Regulares.length} pólizas regulares + ${nips.length} NIVs`
        );
        return todasLasPolizas;
    } catch (error: any) {
        logger.error('Error obteniendo pólizas prioritarias y NIVs:', error);
        throw error;
    }
};

/**
 * Obtiene las pólizas marcadas como eliminadas
 * @returns Array de pólizas eliminadas
 */
export const getDeletedPolicies = async (): Promise<IPolicy[]> => {
    try {
        return await Policy.find({ estado: 'ELIMINADO' }).lean();
    } catch (error: any) {
        logger.error('Error al obtener pólizas eliminadas:', error);
        throw error;
    }
};

/**
 * Restaura una póliza previamente marcada como eliminada
 * @param numeroPoliza - Número de la póliza a restaurar
 * @returns La póliza restaurada o null si no existe
 */
export const restorePolicy = async (numeroPoliza: string): Promise<IPolicy | null> => {
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
        policy.fechaEliminacion = undefined;
        policy.motivoEliminacion = '';

        const updatedPolicy = await policy.save();
        logger.info(`Póliza ${normalizedNumero} restaurada exitosamente`);

        return updatedPolicy;
    } catch (error: any) {
        logger.error('Error al restaurar póliza:', {
            numeroPoliza,
            error: error.message
        });
        throw error;
    }
};

interface BatchResult {
    total: number;
    successful: number;
    failed: number;
    details: Array<{
        numeroPoliza: string;
        status: 'SUCCESS' | 'ERROR';
        message: string;
    }>;
}

/**
 * Guarda múltiples pólizas en la base de datos de forma eficiente
 * @param policiesData - Array de objetos con datos de pólizas
 * @returns Resultados del procesamiento
 */
export const savePoliciesBatch = async (policiesData: IPolicyData[]): Promise<BatchResult> => {
    const results: BatchResult = {
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
                    throw new DuplicatePolicyError(
                        `Ya existe una póliza con el número: ${policyData.numeroPoliza}`
                    );
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
            } catch (error: any) {
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
    } catch (error: any) {
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
export const addRegistroToPolicy = async (
    numeroPoliza: string,
    costo: number,
    fechaRegistro: Date,
    numeroExpediente: string,
    origenDestino: string,
    coordenadas: ICoordenadas | null = null,
    rutaInfo: IRutaInfo | null = null
): Promise<IPolicy | null> => {
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
        const registroData: IRegistro = {
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
        logger.info(
            `Registro #${nextRegistroNumber} añadido correctamente a la póliza ${numeroPoliza}`
        );
        return updatedPolicy;
    } catch (error: any) {
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
export const convertirRegistroAServicio = async (
    numeroPoliza: string,
    numeroRegistro: number,
    fechaContactoProgramada: Date,
    fechaTerminoProgramada: Date
): Promise<{ updatedPolicy: IPolicy; numeroServicio: number } | null> => {
    try {
        logger.info(
            `Convirtiendo registro ${numeroRegistro} a servicio en póliza: ${numeroPoliza}`
        );

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }

        // Buscar el registro
        const registro = policy.registros.find(
            (r: IRegistro) => r.numeroRegistro === numeroRegistro
        );
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
        const servicioData: IServicio = {
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
        logger.info(
            `Registro #${numeroRegistro} convertido a servicio #${nextServiceNumber} en póliza ${numeroPoliza}`
        );
        return { updatedPolicy, numeroServicio: nextServiceNumber };
    } catch (error: any) {
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
export const marcarRegistroNoAsignado = async (
    numeroPoliza: string,
    numeroRegistro: number
): Promise<IPolicy | null> => {
    try {
        logger.info(
            `Marcando registro ${numeroRegistro} como NO ASIGNADO en póliza: ${numeroPoliza}`
        );

        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }

        // Buscar el registro
        const registro = policy.registros.find(
            (r: IRegistro) => r.numeroRegistro === numeroRegistro
        );
        if (!registro) {
            logger.warn(`Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}`);
            return null;
        }

        // Marcar registro como NO_ASIGNADO
        registro.estado = 'NO_ASIGNADO';

        const updatedPolicy = await policy.save();
        logger.info(
            `Registro #${numeroRegistro} marcado como NO ASIGNADO en póliza ${numeroPoliza}`
        );
        return updatedPolicy;
    } catch (error: any) {
        logger.error('Error al marcar registro como no asignado:', {
            numeroPoliza,
            numeroRegistro,
            error: error.message
        });
        throw error;
    }
};

interface CalculoHorasAutomaticas {
    fechaContactoProgramada: Date;
    fechaTerminoProgramada: Date;
    minutosContacto: number;
    minutosTermino: number;
    tiempoTrayectoBase: number;
    factorMultiplicador: number;
}

/**
 * Genera horas aleatorias de contacto (22-39 min después) y término automático
 * Término calculado como: tiempo_trayecto * 1.6 (factor de eficiencia proporcional)
 * IMPORTANTE: Todas las fechas se calculan en zona horaria de México (America/Mexico_City)
 */
export const calcularHorasAutomaticas = (
    fechaBase: Date,
    tiempoTrayectoMinutos = 0
): CalculoHorasAutomaticas => {
    // Usar la fecha base directamente (Railway maneja la zona horaria del servidor)
    // fechaBase ya debería estar en la zona horaria correcta del servidor

    // Contacto: entre 22 y 39 minutos después de la fecha base
    const minutosContacto = Math.floor(Math.random() * (39 - 22 + 1)) + 22;
    const fechaContacto = new Date(fechaBase.getTime() + minutosContacto * 60000);

    // Término: contacto + tiempo de trayecto multiplicado por factor 1.6
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
