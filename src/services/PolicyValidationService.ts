// src/services/PolicyValidationService.ts
/**
 * Servicio de validación para datos de pólizas
 * Responsabilidad única: validar campos y datos de entrada
 * Migrado de Mongoose a Prisma/PostgreSQL
 */

import { prisma } from '../database/prisma';
import type { IValidacionResult } from '../types/policy-assignment';
import logger from '../utils/logger';

export class PolicyValidationService {
    /**
     * Valida número de póliza
     */
    validarNumeroPoliza(numeroPoliza: string | undefined): IValidacionResult {
        if (!numeroPoliza || numeroPoliza.trim().length < 1) {
            return { valido: false, error: 'Ingresa un número de póliza válido.' };
        }
        return { valido: true, valorProcesado: numeroPoliza.trim() };
    }

    /**
     * Valida y normaliza aseguradora
     */
    async validarAseguradora(aseguradora: string | undefined): Promise<IValidacionResult> {
        if (!aseguradora || aseguradora.trim().length < 2) {
            return { valido: false, error: 'La aseguradora debe tener al menos 2 caracteres.' };
        }

        try {
            // Normalizar texto para búsqueda
            const normalizado = aseguradora
                .toUpperCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();

            // Buscar por nombre exacto o nombreCorto
            let aseguradoraDB = await prisma.aseguradora.findFirst({
                where: {
                    activa: true,
                    OR: [{ nombre: normalizado }, { nombreCorto: normalizado }]
                }
            });

            // Si no se encuentra, buscar en aliases (contiene)
            if (!aseguradoraDB) {
                aseguradoraDB = await prisma.aseguradora.findFirst({
                    where: {
                        activa: true,
                        aliases: { has: normalizado }
                    }
                });
            }

            // Si aún no se encuentra, buscar parcial
            if (!aseguradoraDB) {
                aseguradoraDB = await prisma.aseguradora.findFirst({
                    where: {
                        activa: true,
                        OR: [
                            { nombre: { contains: normalizado, mode: 'insensitive' } },
                            { nombreCorto: { contains: normalizado, mode: 'insensitive' } }
                        ]
                    }
                });
            }

            const nombreNormalizado = aseguradoraDB?.nombreCorto ?? aseguradora.toUpperCase();
            return { valido: true, valorProcesado: nombreNormalizado };
        } catch (error) {
            logger.warn('[PolicyValidationService] Error buscando aseguradora:', error);
            return { valido: true, valorProcesado: aseguradora.toUpperCase() };
        }
    }

    /**
     * Valida nombre de persona
     */
    validarNombrePersona(nombre: string | undefined): IValidacionResult {
        if (!nombre || nombre.trim().length < 3) {
            return { valido: false, error: 'El nombre debe tener al menos 3 caracteres.' };
        }
        return { valido: true, valorProcesado: nombre.trim() };
    }

    /**
     * Valida monto de pago
     */
    validarMontoPago(texto: string | undefined): IValidacionResult {
        if (!texto) {
            return { valido: false, error: 'Ingresa un monto.' };
        }

        // Limpiar caracteres no numéricos
        const monto = parseFloat(texto.replace(/[$,]/g, ''));

        if (isNaN(0) || monto <= 0) {
            return { valido: false, error: 'Ingresa un monto válido (solo números).' };
        }

        return { valido: true, valorProcesado: monto };
    }

    /**
     * Valida formato de fecha
     */
    validarFecha(fechaStr: string): IValidacionResult {
        const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const match = fechaStr.match(regex);

        if (!match) {
            return { valido: false, error: 'Formato de fecha inválido. Usa DD/MM/AAAA.' };
        }

        const dia = parseInt(match[1]);
        const mes = parseInt(match[2]);
        const año = parseInt(match[3]);

        const fecha = new Date(año, mes - 1, dia);

        if (
            fecha.getDate() !== dia ||
            fecha.getMonth() !== mes - 1 ||
            fecha.getFullYear() !== año
        ) {
            return { valido: false, error: 'Fecha inválida.' };
        }

        return { valido: true, valorProcesado: fecha };
    }

    /**
     * Valida fecha ISO (YYYY-MM-DD)
     */
    validarFechaISO(fechaISO: string): IValidacionResult {
        const fecha = new Date(fechaISO);

        if (isNaN(fecha.getTime())) {
            return { valido: false, error: 'Fecha inválida.' };
        }

        return { valido: true, valorProcesado: fecha };
    }

    /**
     * Valida tipo de archivo para póliza
     */
    validarArchivoPoliza(msg: any): IValidacionResult {
        // Verificar si es PDF
        if (msg.document && msg.document.mime_type === 'application/pdf') {
            return {
                valido: true,
                valorProcesado: {
                    type: 'pdf',
                    fileId: msg.document.file_id,
                    fileName: msg.document.file_name ?? 'documento.pdf',
                    mimeType: 'application/pdf',
                    fileSize: msg.document.file_size
                }
            };
        }

        // Verificar si es foto
        if (msg.photo && msg.photo.length > 0) {
            const foto = msg.photo[msg.photo.length - 1];
            return {
                valido: true,
                valorProcesado: {
                    type: 'photo',
                    fileId: foto.file_id,
                    fileName: `foto_${Date.now()}.jpg`,
                    mimeType: 'image/jpeg',
                    fileSize: foto.file_size
                }
            };
        }

        // Si es otro tipo de documento
        if (msg.document) {
            return {
                valido: false,
                error: `Formato no válido: ${msg.document.mime_type}. Solo se aceptan PDF, JPG o PNG.`
            };
        }

        return { valido: false, error: 'Envía un PDF o una foto de la póliza.' };
    }

    /**
     * Valida un campo genérico según su tipo
     */
    async validarCampo(campo: string, valor: string | undefined): Promise<IValidacionResult> {
        switch (campo) {
            case 'numeroPoliza':
                return this.validarNumeroPoliza(valor);
            case 'aseguradora':
                return await this.validarAseguradora(valor);
            case 'nombrePersona':
                return this.validarNombrePersona(valor);
            case 'primerPago':
            case 'segundoPago':
                return this.validarMontoPago(valor);
            default:
                return { valido: true, valorProcesado: valor };
        }
    }
}

// Singleton
let instance: PolicyValidationService | null = null;

export function getPolicyValidationService(): PolicyValidationService {
    instance ??= new PolicyValidationService();
    return instance;
}

export default PolicyValidationService;
