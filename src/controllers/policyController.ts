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
        logger.info(`[ATOMIC] Añadiendo servicio a la póliza: ${numeroPoliza}`, {
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida'
        });

        // ✅ PASO 1: Obtener el siguiente número de servicio de forma atómica
        // Esto garantiza que no haya race conditions en el contador
        const policyForCounter = await Policy.findOneAndUpdate(
            { numeroPoliza, estado: 'ACTIVO' },
            {
                $inc: { servicioCounter: 1 },
                $setOnInsert: { servicioCounter: 1 }
            },
            {
                new: true,
                upsert: false,
                select: 'servicioCounter numeroPoliza'
            }
        );

        if (!policyForCounter) {
            logger.warn(`Póliza no encontrada: ${numeroPoliza} al intentar añadir servicio.`);
            return null;
        }

        const nextServiceNumber = policyForCounter.servicioCounter;
        logger.info(`[ATOMIC] Número de servicio asignado: #${nextServiceNumber} para póliza ${numeroPoliza}`);

        // ✅ PASO 2: Construir objeto de servicio con el número asignado
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
            logger.info(`[ATOMIC] Coordenadas añadidas al servicio #${nextServiceNumber}`, coordenadas);
        }

        // Añadir información de ruta si está disponible
        if (rutaInfo) {
            serviceData.rutaInfo = {
                distanciaKm: rutaInfo.distanciaKm,
                tiempoMinutos: rutaInfo.tiempoMinutos
            };

            if (rutaInfo.googleMapsUrl) {
                serviceData.rutaInfo.googleMapsUrl = rutaInfo.googleMapsUrl;
            }

            logger.info(`[ATOMIC] Información de ruta añadida al servicio #${nextServiceNumber}`, {
                distancia: rutaInfo.distanciaKm,
                tiempo: rutaInfo.tiempoMinutos,
                aproximado: rutaInfo.aproximado || false
            });
        }

        // ✅ PASO 3: Añadir servicio al array de forma atómica con $push
        // Esto garantiza que el servicio se añada sin race conditions
        const updatedPolicy = await Policy.findOneAndUpdate(
            { numeroPoliza, estado: 'ACTIVO' },
            {
                $push: { servicios: serviceData },
                $inc: { totalServicios: 1 }  // Sincronizar contador cache
            },
            {
                new: true,
                runValidators: false  // Los datos ya están validados
            }
        );

        if (!updatedPolicy) {
            logger.error(`[ATOMIC] ERROR: Póliza ${numeroPoliza} no encontrada al hacer $push del servicio #${nextServiceNumber}`);
            // ⚠️ IMPORTANTE: El servicioCounter ya se incrementó, pero el servicio no se añadió
            // Esto es un caso edge que requiere corrección manual o script de limpieza
            return null;
        }

        logger.info(
            `[ATOMIC] ✅ Servicio #${nextServiceNumber} añadido correctamente a la póliza ${numeroPoliza}`,
            {
                serviciosActuales: updatedPolicy.servicios.length,
                totalServicios: updatedPolicy.totalServicios,
                servicioCounter: updatedPolicy.servicioCounter
            }
        );

        return updatedPolicy;
    } catch (error: any) {
        logger.error('[ATOMIC] Error al añadir servicio a la póliza:', {
            numeroPoliza,
            costo,
            fechaServicio,
            numeroExpediente,
            origenDestino,
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida',
            error: error.message,
            stack: error.stack
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
 * 🎯 SISTEMA ROBUSTO DE CALIFICACIONES - PÓLIZAS A MANDAR
 * 
 * Nuevo sistema de prioridad basado en días restantes de gracia:
 * 1. TOP 10 pólizas con 0 servicios ordenadas por días restantes de gracia (menor = mayor prioridad)
 * 2. TOP 10 pólizas con 1 servicio ordenadas por días restantes de gracia (menor = mayor prioridad)
 * 3. Pólizas con 2+ servicios se excluyen automáticamente
 * 4. NIVs disponibles (hasta 4)
 * 
 * Sistema de calificación: Menor días de gracia = Mayor puntaje
 */
export const getOldUnusedPolicies = async (): Promise<any[]> => {
    try {
        logger.info('🔄 Iniciando sistema robusto de calificaciones - Pólizas a mandar');

        // 1) Obtener todas las pólizas activas regulares (excluyendo NIVs)
        const allActivePolicies = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: { $ne: 'NIV' } // Excluir NIVs del análisis regular
        }).lean();

        logger.info(`📊 Analizando ${allActivePolicies.length} pólizas activas`);

        // 2) Separar por número de servicios y filtrar las válidas
        const polizasConCeroServicios: IPolicy[] = [];
        const polizasConUnServicio: IPolicy[] = [];
        let descartadasPorServicios = 0;

        for (const policy of allActivePolicies) {
            const totalServicios = (policy.servicios || []).length;
            
            // Solo incluir pólizas con 0 o 1 servicio
            if (totalServicios === 0) {
                polizasConCeroServicios.push(policy);
            } else if (totalServicios === 1) {
                polizasConUnServicio.push(policy);
            } else {
                // Las pólizas con 2+ servicios se descartan automáticamente
                descartadasPorServicios++;
            }
        }

        logger.info(`📋 Análisis de servicios: ${polizasConCeroServicios.length} con 0 servicios, ${polizasConUnServicio.length} con 1 servicio, ${descartadasPorServicios} descartadas (2+ servicios)`);

        // 3) Función para calcular calificación basada en días restantes de gracia
        const calcularCalificacion = (policy: IPolicy): number => {
            // Si no hay días restantes de gracia calculados, usar valor bajo
            if (policy.diasRestantesGracia === null || policy.diasRestantesGracia === undefined) {
                return 10; // Calificación baja por falta de datos
            }

            const diasGracia = policy.diasRestantesGracia;
            
            // Sistema de puntaje: menor días = mayor puntaje
            if (diasGracia <= 0) return 100; // Máxima prioridad - ya vencido o por vencer
            if (diasGracia <= 5) return 90;  // Muy alta prioridad
            if (diasGracia <= 10) return 80; // Alta prioridad
            if (diasGracia <= 15) return 70; // Prioridad media-alta
            if (diasGracia <= 20) return 60; // Prioridad media
            if (diasGracia <= 25) return 50; // Prioridad media-baja
            if (diasGracia <= 30) return 40; // Prioridad baja
            
            return Math.max(10, 40 - Math.floor(diasGracia / 5)); // Degradación gradual
        };

        // 4) Procesar y ordenar pólizas con 0 servicios
        const polizasCeroOrdenadas = polizasConCeroServicios
            .map(policy => ({
                ...policy,
                calificacion: calcularCalificacion(policy),
                tipoGrupo: 'SIN_SERVICIOS' as const
            }))
            .sort((a, b) => {
                // Ordenar por días restantes de gracia ASC (menor = mayor prioridad)
                const diasA = a.diasRestantesGracia ?? 999;
                const diasB = b.diasRestantesGracia ?? 999;
                return diasA - diasB;
            });

        // 5) Procesar y ordenar pólizas con 1 servicio
        const polizasUnoOrdenadas = polizasConUnServicio
            .map(policy => ({
                ...policy,
                calificacion: calcularCalificacion(policy),
                tipoGrupo: 'UN_SERVICIO' as const
            }))
            .sort((a, b) => {
                // Ordenar por días restantes de gracia ASC (menor = mayor prioridad)
                const diasA = a.diasRestantesGracia ?? 999;
                const diasB = b.diasRestantesGracia ?? 999;
                return diasA - diasB;
            });

        // 6) Tomar TOP 10 de cada grupo
        const top10CeroServicios = polizasCeroOrdenadas.slice(0, 10);
        const top10UnServicio = polizasUnoOrdenadas.slice(0, 10);

        logger.info(`🎯 TOP 10 seleccionadas: ${top10CeroServicios.length} sin servicios, ${top10UnServicio.length} con 1 servicio`);

        // 7) Obtener NIVs disponibles ordenados por año (menor a mayor)
        const todosLosNivs = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIV',
            totalServicios: 0 // Solo NIVs sin usar
        })
            .sort({ año: 1, createdAt: -1 }) // Primero por año ascendente, luego por más recientes
            .lean();

        // Tomar top 4 del año más antiguo disponible
        let nivs: any[] = [];
        if (todosLosNivs.length > 0) {
            const añoMasAntiguo = todosLosNivs[0].año;
            const nivsDelAñoMasAntiguo = todosLosNivs.filter(niv => niv.año === añoMasAntiguo);
            nivs = nivsDelAñoMasAntiguo.slice(0, 4);
        }

        // 8) Combinar resultados con metadatos mejorados
        const resultadoFinal = [
            // Primero las pólizas sin servicios (mayor prioridad)
            ...top10CeroServicios.map((policy, index) => ({
                ...policy,
                posicion: index + 1,
                tipoReporte: 'REGULAR' as const,
                prioridadGrupo: 1,
                mensajeEspecial: (policy.diasRestantesGracia !== null && policy.diasRestantesGracia !== undefined && policy.diasRestantesGracia <= 5) ? '🚨 URGENTE - PERÍODO DE GRACIA' : null
            })),
            // Luego las pólizas con un servicio
            ...top10UnServicio.map((policy, index) => ({
                ...policy,
                posicion: top10CeroServicios.length + index + 1,
                tipoReporte: 'REGULAR' as const,
                prioridadGrupo: 2,
                mensajeEspecial: (policy.diasRestantesGracia !== null && policy.diasRestantesGracia !== undefined && policy.diasRestantesGracia <= 5) ? '⚠️ URGENTE - 1 SERVICIO' : null
            })),
            // Finalmente los NIVs
            ...nivs.map((niv, index) => ({
                ...niv,
                posicion: top10CeroServicios.length + top10UnServicio.length + index + 1,
                tipoReporte: 'NIV' as const,
                prioridadGrupo: 3,
                mensajeEspecial: '⚡ NIV DISPONIBLE',
                calificacion: 95 // NIVs tienen alta prioridad por estar listos para uso
            }))
        ];

        // 9) Log detallado del resultado
        const estadisticas = {
            sinServicios: top10CeroServicios.length,
            conUnServicio: top10UnServicio.length,
            nivs: nivs.length,
            total: resultadoFinal.length,
            urgentes: resultadoFinal.filter(p => p.mensajeEspecial?.includes('URGENTE')).length,
            descartadas: descartadasPorServicios
        };

        logger.info(`✅ Sistema robusto completado:`, estadisticas);

        return resultadoFinal;
    } catch (error: any) {
        logger.error('❌ Error en sistema de calificaciones robusto:', error);
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
 * ✅ IMPLEMENTACIÓN ATÓMICA: Usa operaciones MongoDB para evitar race conditions
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
        logger.info(`[ATOMIC] Añadiendo REGISTRO a la póliza: ${numeroPoliza}`, {
            coordenadas: coordenadas ? 'incluidas' : 'no incluidas',
            rutaInfo: rutaInfo ? 'incluida' : 'no incluida'
        });

        // ✅ PASO 1: Incrementar registroCounter de forma atómica
        const policyForCounter = await Policy.findOneAndUpdate(
            { numeroPoliza, estado: 'ACTIVO' },
            {
                $inc: { registroCounter: 1 }
            },
            {
                new: true,
                select: 'registroCounter numeroPoliza'
            }
        );

        if (!policyForCounter) {
            logger.warn(`[ATOMIC] Póliza no encontrada: ${numeroPoliza} al intentar añadir registro.`);
            return null;
        }

        const nextRegistroNumber = policyForCounter.registroCounter;
        logger.info(`[ATOMIC] Número de registro asignado: #${nextRegistroNumber} para póliza ${numeroPoliza}`);

        // ✅ PASO 2: Construir objeto de registro
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
            logger.info(`[ATOMIC] Coordenadas añadidas al registro #${nextRegistroNumber}`, coordenadas);
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

            logger.info(`[ATOMIC] Información de ruta añadida al registro #${nextRegistroNumber}`, {
                distancia: rutaInfo.distanciaKm,
                tiempo: rutaInfo.tiempoMinutos
            });
        }

        // ✅ PASO 3: Añadir registro al array de forma atómica con $push
        const updatedPolicy = await Policy.findOneAndUpdate(
            { numeroPoliza, estado: 'ACTIVO' },
            {
                $push: { registros: registroData }
            },
            {
                new: true,
                runValidators: false
            }
        );

        if (!updatedPolicy) {
            logger.error(`[ATOMIC] ERROR: Póliza ${numeroPoliza} no encontrada al hacer $push del registro #${nextRegistroNumber}`);
            return null;
        }

        logger.info(
            `[ATOMIC] ✅ Registro #${nextRegistroNumber} añadido correctamente a la póliza ${numeroPoliza}`,
            {
                registrosActuales: updatedPolicy.registros.length,
                registroCounter: updatedPolicy.registroCounter
            }
        );

        return updatedPolicy;
    } catch (error: any) {
        logger.error('[ATOMIC] Error al añadir registro a la póliza:', {
            numeroPoliza,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

/**
 * Convierte un REGISTRO en SERVICIO confirmado con fechas de contacto y término programadas
 * ✅ IMPLEMENTACIÓN ATÓMICA: Usa operaciones MongoDB para evitar race conditions
 */
export const convertirRegistroAServicio = async (
    numeroPoliza: string,
    numeroRegistro: number,
    fechaContactoProgramada: Date,
    fechaTerminoProgramada: Date
): Promise<{ updatedPolicy: IPolicy; numeroServicio: number } | null> => {
    try {
        logger.info(
            `[ATOMIC] Convirtiendo registro ${numeroRegistro} a servicio en póliza: ${numeroPoliza}`
        );

        // ✅ PASO 1: Buscar el registro para extraer sus datos
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            logger.warn(`[ATOMIC] Póliza no encontrada: ${numeroPoliza}`);
            return null;
        }

        // Buscar el registro
        const registro = policy.registros.find(
            (r: IRegistro) => r.numeroRegistro === numeroRegistro
        );
        if (!registro) {
            logger.warn(`[ATOMIC] Registro ${numeroRegistro} no encontrado en póliza ${numeroPoliza}`);
            return null;
        }

        // Verificar que el registro no esté ya asignado
        if (registro.estado === 'ASIGNADO') {
            logger.warn(`[ATOMIC] Registro ${numeroRegistro} ya está ASIGNADO en póliza ${numeroPoliza}`);
            return null;
        }

        // ✅ PASO 2: Incrementar servicioCounter de forma atómica para obtener el siguiente número
        const policyForCounter = await Policy.findOneAndUpdate(
            { numeroPoliza, estado: 'ACTIVO' },
            {
                $inc: { servicioCounter: 1 }
            },
            {
                new: true,
                select: 'servicioCounter numeroPoliza'
            }
        );

        if (!policyForCounter) {
            logger.error(`[ATOMIC] ERROR: Póliza ${numeroPoliza} no encontrada al incrementar servicioCounter`);
            return null;
        }

        const nextServiceNumber = policyForCounter.servicioCounter;
        logger.info(`[ATOMIC] Número de servicio asignado: #${nextServiceNumber} para conversión de registro ${numeroRegistro}`);

        // ✅ PASO 3: Crear servicio basado en el registro
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

        // ✅ PASO 4: Actualización atómica: marcar registro como ASIGNADO y añadir servicio
        // Usando arrayFilters para actualizar solo el registro específico
        const updatedPolicy = await Policy.findOneAndUpdate(
            {
                numeroPoliza,
                estado: 'ACTIVO',
                'registros.numeroRegistro': numeroRegistro
            },
            {
                $push: { servicios: servicioData },
                $inc: { totalServicios: 1 },
                $set: {
                    'registros.$[registro].estado': 'ASIGNADO',
                    'registros.$[registro].fechaContactoProgramada': fechaContactoProgramada,
                    'registros.$[registro].fechaTerminoProgramada': fechaTerminoProgramada
                }
            },
            {
                new: true,
                runValidators: false,
                arrayFilters: [{ 'registro.numeroRegistro': numeroRegistro }]
            }
        );

        if (!updatedPolicy) {
            logger.error(`[ATOMIC] ERROR: Póliza ${numeroPoliza} no encontrada al convertir registro a servicio`);
            return null;
        }

        logger.info(
            `[ATOMIC] ✅ Registro #${numeroRegistro} convertido a servicio #${nextServiceNumber} en póliza ${numeroPoliza}`,
            {
                serviciosActuales: updatedPolicy.servicios.length,
                totalServicios: updatedPolicy.totalServicios,
                servicioCounter: updatedPolicy.servicioCounter
            }
        );

        return { updatedPolicy, numeroServicio: nextServiceNumber };
    } catch (error: any) {
        logger.error('[ATOMIC] Error al convertir registro a servicio:', {
            numeroPoliza,
            numeroRegistro,
            error: error.message,
            stack: error.stack
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
