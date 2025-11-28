// src/services/VehicleValidationService.ts
/**
 * Servicio de validación para datos de vehículos
 * Responsabilidad única: validar campos de vehículos
 */

import PlacasValidator from './PlacasValidator';
import logger from '../utils/logger';
import type { IValidacionSerie, IValidacionPlacas } from '../types/vehicle-registration';

export class VehicleValidationService {
    private static readonly VIN_LENGTH = 17;
    private static readonly SERIE_MIN_LENGTH = 5;

    /**
     * Valida y normaliza número de serie/VIN
     */
    validarSerie(serie: string | undefined): IValidacionSerie {
        if (!serie || serie.trim().length < VehicleValidationService.SERIE_MIN_LENGTH) {
            return {
                valida: false,
                error: `La serie debe tener al menos ${VehicleValidationService.SERIE_MIN_LENGTH} caracteres.`
            };
        }

        const serieNormalizada = serie.trim().toUpperCase().replace(/\s+/g, '');

        // Verificar caracteres válidos (alfanuméricos)
        if (!/^[A-Z0-9]+$/.test(serieNormalizada)) {
            return {
                valida: false,
                error: 'La serie solo puede contener letras y números.'
            };
        }

        const esVIN = serieNormalizada.length === VehicleValidationService.VIN_LENGTH;

        return {
            valida: true,
            serieNormalizada,
            esVIN
        };
    }

    /**
     * Valida marca del vehículo
     */
    validarMarca(marca: string | undefined): { valida: boolean; error?: string; valor?: string } {
        if (!marca || marca.trim().length < 2) {
            return { valida: false, error: 'La marca debe tener al menos 2 caracteres.' };
        }

        const marcaNormalizada = marca.trim().toUpperCase();
        return { valida: true, valor: marcaNormalizada };
    }

    /**
     * Valida submarca/modelo del vehículo
     */
    validarSubmarca(submarca: string | undefined): {
        valida: boolean;
        error?: string;
        valor?: string;
    } {
        if (!submarca || submarca.trim().length < 1) {
            return { valida: false, error: 'La submarca/modelo es requerida.' };
        }

        const submarcaNormalizada = submarca.trim().toUpperCase();
        return { valida: true, valor: submarcaNormalizada };
    }

    /**
     * Valida año del vehículo
     */
    validarAño(añoStr: string | undefined): { valida: boolean; error?: string; valor?: number } {
        if (!añoStr) {
            return { valida: false, error: 'El año es requerido.' };
        }

        const año = parseInt(añoStr.trim());
        const añoActual = new Date().getFullYear();
        const añoMinimo = 1900;
        const añoMaximo = añoActual + 2;

        if (isNaN(año) || año < añoMinimo || año > añoMaximo) {
            return {
                valida: false,
                error: `El año debe estar entre ${añoMinimo} y ${añoMaximo}.`
            };
        }

        return { valida: true, valor: año };
    }

    /**
     * Valida color del vehículo
     */
    validarColor(color: string | undefined): { valida: boolean; error?: string; valor?: string } {
        if (!color || color.trim().length < 2) {
            return { valida: false, error: 'El color debe tener al menos 2 caracteres.' };
        }

        const colorNormalizado = color.trim().toUpperCase();
        return { valida: true, valor: colorNormalizado };
    }

    /**
     * Valida placas del vehículo
     */
    async validarPlacas(placas: string | undefined): Promise<IValidacionPlacas> {
        // Placas opcionales - "N/A" o "SIN PLACAS" son válidos
        if (!placas || placas.trim().length === 0) {
            return { valida: true, placasNormalizadas: 'SIN PLACAS' };
        }

        const placasLimpias = placas.trim().toUpperCase();

        if (placasLimpias === 'N/A' || placasLimpias === 'SIN PLACAS' || placasLimpias === 'NA') {
            return { valida: true, placasNormalizadas: 'SIN PLACAS' };
        }

        // Validar formato básico
        if (placasLimpias.length < 3 || placasLimpias.length > 10) {
            return {
                valida: false,
                error: 'Las placas deben tener entre 3 y 10 caracteres.'
            };
        }

        // Usar PlacasValidator para validar formato
        try {
            const validator = new PlacasValidator();
            if (!validator.esFormatoValido(placasLimpias)) {
                return {
                    valida: false,
                    error: 'Formato de placas no válido. Ejemplo: ABC-1234'
                };
            }
            return {
                valida: true,
                placasNormalizadas: validator.formatear(placasLimpias)
            };
        } catch (error) {
            logger.warn('[VehicleValidationService] Error validando placas:', error);
            return { valida: true, placasNormalizadas: placasLimpias };
        }
    }

    /**
     * Valida que un mensaje contenga una foto válida
     */
    validarFoto(msg: any): { valida: boolean; error?: string; fileId?: string; fileName?: string } {
        if (!msg.photo || msg.photo.length === 0) {
            return { valida: false, error: 'Envía una foto del vehículo.' };
        }

        const foto = msg.photo[msg.photo.length - 1];
        return {
            valida: true,
            fileId: foto.file_id,
            fileName: `vehiculo_${Date.now()}.jpg`
        };
    }
}

// Singleton
let instance: VehicleValidationService | null = null;

export function getVehicleValidationService(): VehicleValidationService {
    if (!instance) {
        instance = new VehicleValidationService();
    }
    return instance;
}

export default VehicleValidationService;
