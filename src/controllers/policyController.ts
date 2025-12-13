// src/controllers/policyController.ts
// Migrado de Mongoose a Prisma/PostgreSQL

import { prisma } from '../database';
import logger from '../utils/logger';
import { cacheService } from '../cache/CacheService';
import type {
    Policy,
    Pago,
    Registro,
    Servicio,
    PolicyStatus,
    RegistroStatus,
    PolicyFileR2,
    FileType
} from '../generated/prisma';

// Tipos compatibles con el código existente
export type IPolicy = Policy & {
    pagos: Pago[];
    registros: Registro[];
    servicios: Servicio[];
    r2Files?: PolicyFileR2[];
};

export type IPolicyData = Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>;

export interface ICoordenadas {
    origen?: { lat?: number; lng?: number };
    destino?: { lat?: number; lng?: number };
}

export interface IRutaInfo {
    distanciaKm?: number;
    tiempoMinutos?: number;
    googleMapsUrl?: string;
}

export class DuplicatePolicyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DuplicatePolicyError';
    }
}

export const savePolicy = async (policyData: any): Promise<IPolicy> => {
    try {
        const savedPolicy = await prisma.policy.create({
            data: {
                titular: policyData.titular,
                correo: policyData.correo,
                contrasena: policyData.contraseña,
                rfc: policyData.rfc,
                calle: policyData.calle,
                colonia: policyData.colonia,
                municipio: policyData.municipio,
                estadoRegion: policyData.estadoRegion,
                cp: policyData.cp,
                marca: policyData.marca,
                submarca: policyData.submarca,
                anio: policyData.año,
                color: policyData.color,
                serie: policyData.serie,
                placas: policyData.placas,
                agenteCotizador: policyData.agenteCotizador,
                aseguradora: policyData.aseguradora,
                numeroPoliza: policyData.numeroPoliza.trim().toUpperCase(),
                fechaEmision: policyData.fechaEmision,
                telefono: policyData.telefono,
                estadoPoliza: policyData.estadoPoliza,
                fechaFinCobertura: policyData.fechaFinCobertura,
                fechaFinGracia: policyData.fechaFinGracia,
                diasRestantesCobertura: policyData.diasRestantesCobertura ?? 0,
                diasRestantesGracia: policyData.diasRestantesGracia ?? 0,
                estado: 'ACTIVO'
            },
            include: { pagos: true, registros: true, servicios: true }
        });
        logger.info('Póliza guardada exitosamente:', { numeroPoliza: savedPolicy.numeroPoliza });
        return savedPolicy as IPolicy;
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new DuplicatePolicyError(
                `Ya existe una póliza con el número: ${policyData.numeroPoliza}`
            );
        }
        throw error;
    }
};

export const getPolicyByNumber = async (numeroPoliza: string): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    if (!normalizedNumero) return null;

    const cacheKey = `policy:${normalizedNumero}`;

    return cacheService.get(cacheKey, async () => {
        logger.info('Buscando póliza en la BD (cache miss):', { numeroPoliza: normalizedNumero });
        const policy = await prisma.policy.findFirst({
            where: {
                numeroPoliza: normalizedNumero,
                estado: 'ACTIVO'
            },
            include: {
                pagos: true,
                registros: true,
                servicios: true,
                archivosR2: true,
                archivosLegacy: true
            }
        });
        return policy as IPolicy | null;
    });
};

export const markPolicyAsDeleted = async (
    numeroPoliza: string,
    motivo = ''
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    try {
        const updatedPolicy = await prisma.policy.update({
            where: { numeroPoliza: normalizedNumero },
            data: {
                estado: 'ELIMINADO',
                fechaEliminacion: new Date(),
                motivoEliminacion: motivo
            },
            include: { pagos: true, registros: true, servicios: true }
        });
        await cacheService.invalidate(`policy:${normalizedNumero}`);
        return updatedPolicy as IPolicy;
    } catch {
        return null;
    }
};

export const deletePolicyByNumber = async (numeroPoliza: string): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    try {
        const policy = await prisma.policy.delete({
            where: { numeroPoliza: normalizedNumero },
            include: { pagos: true, registros: true, servicios: true }
        });
        await cacheService.invalidate(`policy:${normalizedNumero}`);
        return policy as IPolicy;
    } catch {
        return null;
    }
};

export const updatePolicyPhone = async (
    numeroPoliza: string,
    telefono: string
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    try {
        const updatedPolicy = await prisma.policy.update({
            where: { numeroPoliza: normalizedNumero },
            data: { telefono },
            include: { pagos: true, registros: true, servicios: true }
        });
        await cacheService.invalidate(`policy:${normalizedNumero}`);
        return updatedPolicy as IPolicy;
    } catch {
        return null;
    }
};

export const findPoliciesByPhone = async (
    telefono: string,
    excludePoliza?: string
): Promise<IPolicy[]> => {
    const policies = await prisma.policy.findMany({
        where: {
            telefono: telefono.trim(),
            estado: 'ACTIVO',
            ...(excludePoliza && {
                numeroPoliza: { not: excludePoliza.trim().toUpperCase() }
            })
        },
        select: {
            id: true,
            numeroPoliza: true,
            titular: true,
            marca: true,
            submarca: true,
            anio: true,
            color: true,
            placas: true,
            telefono: true
        }
    });
    return policies as any[];
};

export const addFileToPolicy = async (
    numeroPoliza: string,
    fileBuffer: Buffer,
    fileType: 'foto' | 'pdf'
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza.toUpperCase();
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' }
    });
    if (!policy) return null;

    // Agregar archivo legacy
    await prisma.policyFileLegacy.create({
        data: {
            policyId: policy.id,
            tipo: fileType === 'foto' ? 'FOTO' : 'PDF',
            data: fileBuffer,
            contentType: fileType === 'foto' ? 'image/jpeg' : 'application/pdf'
        }
    });

    await cacheService.invalidate(`policy:${normalizedNumero}`);

    return prisma.policy.findUnique({
        where: { id: policy.id },
        include: { pagos: true, registros: true, servicios: true }
    }) as Promise<IPolicy | null>;
};

export const addPaymentToPolicy = async (
    numeroPoliza: string,
    monto: number,
    fechaPago: Date
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza.toUpperCase();
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' }
    });
    if (!policy) return null;

    await prisma.pago.create({
        data: {
            policyId: policy.id,
            monto,
            fechaPago,
            estado: 'REALIZADO',
            notas: 'Pago registrado manualmente'
        }
    });

    await cacheService.invalidate(`policy:${normalizedNumero}`);

    return prisma.policy.findUnique({
        where: { id: policy.id },
        include: { pagos: true, registros: true, servicios: true }
    }) as Promise<IPolicy | null>;
};

export const addServiceToPolicy = async (
    numeroPoliza: string,
    costo: number,
    fechaServicio: Date,
    numeroExpediente: string,
    origenDestino: string,
    coordenadas: ICoordenadas | null = null,
    rutaInfo: IRutaInfo | null = null
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza.toUpperCase();
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' }
    });
    if (!policy) return null;

    const newCounter = (policy.servicioCounter ?? 0) + 1;
    const newTotal = (policy.totalServicios ?? 0) + 1;

    await prisma.$transaction([
        prisma.servicio.create({
            data: {
                policyId: policy.id,
                numeroServicio: newCounter,
                costo,
                fechaServicio,
                numeroExpediente,
                origenDestino,
                origenLat: coordenadas?.origen?.lat,
                origenLng: coordenadas?.origen?.lng,
                destinoLat: coordenadas?.destino?.lat,
                destinoLng: coordenadas?.destino?.lng,
                rutaDistanciaKm: rutaInfo?.distanciaKm,
                rutaTiempoMinutos: rutaInfo?.tiempoMinutos,
                rutaGoogleMapsUrl: rutaInfo?.googleMapsUrl
            }
        }),
        prisma.policy.update({
            where: { id: policy.id },
            data: { servicioCounter: newCounter, totalServicios: newTotal }
        })
    ]);

    await cacheService.invalidate(`policy:${normalizedNumero}`);

    return prisma.policy.findUnique({
        where: { id: policy.id },
        include: { pagos: true, registros: true, servicios: true }
    }) as Promise<IPolicy | null>;
};

export const getSusceptiblePolicies = async (): Promise<
    Array<{ numeroPoliza: string; diasDeImpago: number }>
> => {
    return cacheService.get(
        'susceptiblePolicies',
        async () => {
            const now = new Date();

            // Usar SQL raw para cálculos complejos
            const results = await prisma.$queryRaw<
                Array<{ numeroPoliza: string; diasDeImpago: number }>
            >`
                WITH policy_data AS (
                    SELECT
                        p."numeroPoliza",
                        EXTRACT(DAY FROM (NOW() - p."fechaEmision"))::int AS dias_transcurridos,
                        (SELECT COUNT(*) FROM "Pago" pg WHERE pg."policyId" = p.id AND pg.estado = 'REALIZADO') AS pagos_realizados
                    FROM "Policy" p
                    WHERE p.estado = 'ACTIVO'
                )
                SELECT
                    "numeroPoliza",
                    (dias_transcurridos - (pagos_realizados * 30))::int AS "diasDeImpago"
                FROM policy_data
                WHERE dias_transcurridos > 0
                AND (dias_transcurridos - (pagos_realizados * 30)) > 0
                ORDER BY "diasDeImpago" DESC
            `;

            return results;
        },
        3600 * 4
    );
};

export const getOldUnusedPolicies = async (): Promise<any[]> => {
    try {
        logger.info('🔄 Iniciando sistema de calificaciones');

        // Pólizas regulares sin servicios
        const ceroServicios = await prisma.policy.findMany({
            where: {
                estado: 'ACTIVO',
                tipoPoliza: { not: 'NIV' },
                servicios: { none: {} }
            },
            orderBy: { diasRestantesGracia: 'asc' },
            take: 10,
            include: { servicios: true }
        });

        // Pólizas regulares con 1 servicio
        const unServicio = await prisma.policy.findMany({
            where: {
                estado: 'ACTIVO',
                tipoPoliza: { not: 'NIV' }
            },
            orderBy: { diasRestantesGracia: 'asc' },
            include: { servicios: true }
        });

        const unServicioFiltered = unServicio.filter(p => p.servicios.length === 1).slice(0, 10);

        // NIVs sin servicios
        const nivResults = await prisma.policy.findMany({
            where: {
                estado: 'ACTIVO',
                tipoPoliza: 'NIV',
                totalServicios: 0
            },
            orderBy: [{ anio: 'asc' }, { createdAt: 'desc' }],
            take: 4
        });

        // Función para calcular calificación
        const calcCalificacion = (diasGracia: number | null): number => {
            if (diasGracia == null) return 10;
            if (diasGracia <= 0) return 100;
            if (diasGracia <= 5) return 90;
            if (diasGracia <= 10) return 80;
            if (diasGracia <= 15) return 70;
            if (diasGracia <= 20) return 60;
            if (diasGracia <= 25) return 50;
            if (diasGracia <= 30) return 40;
            return 10;
        };

        const resultadoFinal = [
            ...ceroServicios.map((policy, index) => ({
                ...policy,
                año: policy.anio,
                totalServicios: 0,
                calificacion: calcCalificacion(policy.diasRestantesGracia),
                tipoGrupo: 'SIN_SERVICIOS',
                prioridadGrupo: 1,
                posicion: index + 1,
                tipoReporte: 'REGULAR',
                mensajeEspecial:
                    policy.diasRestantesGracia != null && policy.diasRestantesGracia <= 5
                        ? '🚨 URGENTE - PERÍODO DE GRACIA'
                        : null
            })),
            ...unServicioFiltered.map((policy, index) => ({
                ...policy,
                año: policy.anio,
                totalServicios: 1,
                calificacion: calcCalificacion(policy.diasRestantesGracia),
                tipoGrupo: 'UN_SERVICIO',
                prioridadGrupo: 2,
                posicion: ceroServicios.length + index + 1,
                tipoReporte: 'REGULAR',
                mensajeEspecial:
                    policy.diasRestantesGracia != null && policy.diasRestantesGracia <= 5
                        ? '⚠️ URGENTE - 1 SERVICIO'
                        : null
            })),
            ...nivResults.map((niv, index) => ({
                ...niv,
                año: niv.anio,
                totalServicios: 0,
                calificacion: 95,
                tipoGrupo: 'NIV',
                prioridadGrupo: 3,
                posicion: ceroServicios.length + unServicioFiltered.length + index + 1,
                tipoReporte: 'NIV',
                mensajeEspecial: '⚡ NIV DISPONIBLE'
            }))
        ];

        logger.info(`✅ Sistema completado: ${resultadoFinal.length} resultados`);
        return resultadoFinal;
    } catch (error: any) {
        logger.error('❌ Error en sistema de calificaciones:', error);
        throw error;
    }
};

export const getDeletedPolicies = async (): Promise<IPolicy[]> => {
    return prisma.policy.findMany({
        where: { estado: 'ELIMINADO' },
        include: { pagos: true, registros: true, servicios: true }
    }) as Promise<IPolicy[]>;
};

export const restorePolicy = async (numeroPoliza: string): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    try {
        const policy = await prisma.policy.update({
            where: { numeroPoliza: normalizedNumero },
            data: { estado: 'ACTIVO' },
            include: { pagos: true, registros: true, servicios: true }
        });
        return policy as IPolicy;
    } catch {
        return null;
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

export const savePoliciesBatch = async (policiesData: any[]): Promise<BatchResult> => {
    const results: BatchResult = {
        total: policiesData.length,
        successful: 0,
        failed: 0,
        details: []
    };

    for (const policyData of policiesData) {
        try {
            if (!policyData.numeroPoliza) throw new Error('Número de póliza es requerido');

            const normalizedNumero = policyData.numeroPoliza.trim().toUpperCase();
            const existingPolicy = await prisma.policy.findUnique({
                where: { numeroPoliza: normalizedNumero }
            });

            if (existingPolicy) {
                throw new DuplicatePolicyError(`Póliza duplicada: ${normalizedNumero}`);
            }

            const savedPolicy = await savePolicy(policyData);

            results.successful++;
            results.details.push({
                numeroPoliza: savedPolicy.numeroPoliza,
                status: 'SUCCESS',
                message: 'Registrada'
            });
        } catch (error: any) {
            results.failed++;
            results.details.push({
                numeroPoliza: policyData?.numeroPoliza ?? 'Desconocido',
                status: 'ERROR',
                message: error.message
            });
        }
    }
    return results;
};

export const addRegistroToPolicy = async (
    numeroPoliza: string,
    costo: number,
    fechaRegistro: Date,
    numeroExpediente: string,
    origenDestino: string,
    coordenadas: ICoordenadas | null = null,
    rutaInfo: IRutaInfo | null = null
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza.toUpperCase();
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' }
    });
    if (!policy) return null;

    const newCounter = (policy.registroCounter ?? 0) + 1;

    await prisma.$transaction([
        prisma.registro.create({
            data: {
                policyId: policy.id,
                numeroRegistro: newCounter,
                costo,
                fechaRegistro,
                numeroExpediente,
                origenDestino,
                estado: 'PENDIENTE',
                origenLat: coordenadas?.origen?.lat,
                origenLng: coordenadas?.origen?.lng,
                destinoLat: coordenadas?.destino?.lat,
                destinoLng: coordenadas?.destino?.lng,
                rutaDistanciaKm: rutaInfo?.distanciaKm,
                rutaTiempoMinutos: rutaInfo?.tiempoMinutos,
                rutaGoogleMapsUrl: rutaInfo?.googleMapsUrl
            }
        }),
        prisma.policy.update({
            where: { id: policy.id },
            data: { registroCounter: newCounter }
        })
    ]);

    await cacheService.invalidate(`policy:${normalizedNumero}`);

    return prisma.policy.findUnique({
        where: { id: policy.id },
        include: { pagos: true, registros: true, servicios: true }
    }) as Promise<IPolicy | null>;
};

export const convertirRegistroAServicio = async (
    numeroPoliza: string,
    numeroRegistro: number,
    fechaContactoProgramada: Date,
    fechaTerminoProgramada: Date
): Promise<{ updatedPolicy: IPolicy; numeroServicio: number } | null> => {
    const normalizedNumero = numeroPoliza.toUpperCase();
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' },
        include: { registros: true }
    });
    if (!policy) return null;

    const registro = policy.registros.find(r => r.numeroRegistro === numeroRegistro);
    if (!registro) return null;

    const newServicioCounter = (policy.servicioCounter ?? 0) + 1;

    await prisma.$transaction([
        prisma.registro.update({
            where: { id: registro.id },
            data: { estado: 'ASIGNADO' }
        }),
        prisma.servicio.create({
            data: {
                policyId: policy.id,
                numeroServicio: newServicioCounter,
                numeroRegistroOrigen: numeroRegistro,
                costo: registro.costo,
                fechaServicio: registro.fechaRegistro,
                numeroExpediente: registro.numeroExpediente,
                origenDestino: registro.origenDestino,
                fechaContactoProgramada,
                fechaTerminoProgramada,
                origenLat: registro.origenLat,
                origenLng: registro.origenLng,
                destinoLat: registro.destinoLat,
                destinoLng: registro.destinoLng,
                rutaDistanciaKm: registro.rutaDistanciaKm,
                rutaTiempoMinutos: registro.rutaTiempoMinutos,
                rutaGoogleMapsUrl: registro.rutaGoogleMapsUrl
            }
        }),
        prisma.policy.update({
            where: { id: policy.id },
            data: { servicioCounter: newServicioCounter }
        })
    ]);

    await cacheService.invalidate(`policy:${normalizedNumero}`);

    const updatedPolicy = await prisma.policy.findUnique({
        where: { id: policy.id },
        include: { pagos: true, registros: true, servicios: true }
    });

    return { updatedPolicy: updatedPolicy as IPolicy, numeroServicio: newServicioCounter };
};

export const marcarRegistroNoAsignado = async (
    numeroPoliza: string,
    numeroRegistro: number
): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza.toUpperCase();
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' },
        include: { registros: true }
    });
    if (!policy) return null;

    const registro = policy.registros.find(r => r.numeroRegistro === numeroRegistro);
    if (!registro) return null;

    await prisma.registro.update({
        where: { id: registro.id },
        data: { estado: 'NO_ASIGNADO' }
    });

    await cacheService.invalidate(`policy:${normalizedNumero}`);

    return prisma.policy.findUnique({
        where: { id: policy.id },
        include: { pagos: true, registros: true, servicios: true }
    }) as Promise<IPolicy | null>;
};

export const calcularHorasAutomaticas = (fechaBase: Date, tiempoTrayectoMinutos = 0): any => {
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

// ============================================
// GESTIÓN DE ARCHIVOS R2
// ============================================

export interface IR2FileData {
    url: string;
    key: string;
    size: number;
    contentType: string;
    originalName?: string;
    fuenteOriginal?: string;
}

/**
 * Añade un archivo R2 a una póliza
 */
export const addFileToPolicyR2 = async (
    policyId: string,
    tipo: 'FOTO' | 'PDF',
    fileData: IR2FileData
): Promise<PolicyFileR2> => {
    const file = await prisma.policyFileR2.create({
        data: {
            policyId,
            tipo: tipo as FileType,
            url: fileData.url,
            key: fileData.key,
            size: fileData.size,
            contentType: fileData.contentType,
            originalName: fileData.originalName,
            fuenteOriginal: fileData.fuenteOriginal
        }
    });
    logger.info('Archivo R2 añadido a póliza', { policyId, tipo, key: fileData.key });
    return file;
};

/**
 * Añade un archivo R2 a una póliza por número de póliza
 */
export const addFileToPolicyByNumber = async (
    numeroPoliza: string,
    tipo: 'FOTO' | 'PDF',
    fileData: IR2FileData
): Promise<PolicyFileR2 | null> => {
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: numeroPoliza.trim().toUpperCase(), estado: 'ACTIVO' }
    });
    if (!policy) return null;
    return addFileToPolicyR2(policy.id, tipo, fileData);
};

/**
 * Obtiene los archivos R2 de una póliza
 */
export const getPolicyFiles = async (
    policyId: string,
    tipo?: 'FOTO' | 'PDF'
): Promise<PolicyFileR2[]> => {
    return prisma.policyFileR2.findMany({
        where: {
            policyId,
            ...(tipo && { tipo: tipo as FileType })
        },
        orderBy: { uploadDate: 'desc' }
    });
};

/**
 * Obtiene los archivos R2 de una póliza por número
 */
export const getPolicyFilesByNumber = async (
    numeroPoliza: string,
    tipo?: 'FOTO' | 'PDF'
): Promise<PolicyFileR2[]> => {
    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: numeroPoliza.trim().toUpperCase(), estado: 'ACTIVO' }
    });
    if (!policy) return [];
    return getPolicyFiles(policy.id, tipo);
};

/**
 * Obtiene póliza con todos sus archivos incluidos
 */
export const getPolicyWithFiles = async (numeroPoliza: string): Promise<IPolicy | null> => {
    const normalizedNumero = numeroPoliza?.trim()?.toUpperCase();
    if (!normalizedNumero) return null;

    const policy = await prisma.policy.findFirst({
        where: { numeroPoliza: normalizedNumero, estado: 'ACTIVO' },
        include: {
            pagos: true,
            registros: true,
            servicios: true,
            archivosR2: true
        }
    });
    // Mapear archivosR2 a r2Files para compatibilidad
    if (policy) {
        (policy as any).r2Files = (policy as any).archivosR2;
    }
    return policy as IPolicy | null;
};
