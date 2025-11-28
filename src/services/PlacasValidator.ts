// src/services/PlacasValidator.ts
// Servicio de validación y comparación de placas vehiculares mexicanas

/**
 * Resultado de la comparación de placas
 */
export interface IResultadoComparacionPlacas {
    coinciden: boolean;
    placaReferencia: string;
    placasComparadas: string[];
    similitud: number; // 0-100 porcentaje de similitud
    detalles: string;
}

/**
 * Validador de placas vehiculares mexicanas
 * Responsabilidad única: comparar y validar placas
 */
class PlacasValidator {
    /**
     * Normaliza una placa para comparación
     * Elimina guiones, espacios y convierte a mayúsculas
     */
    normalizar(placa: string): string {
        if (!placa) return '';
        return placa
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '') // Solo alfanuméricos
            .trim();
    }

    /**
     * Calcula la similitud entre dos placas (0-100)
     * Usa distancia de Levenshtein normalizada
     */
    calcularSimilitud(placa1: string, placa2: string): number {
        const norm1 = this.normalizar(placa1);
        const norm2 = this.normalizar(placa2);

        if (norm1 === norm2) return 100;
        if (!norm1 || !norm2) return 0;

        const distancia = this.levenshteinDistance(norm1, norm2);
        const maxLen = Math.max(norm1.length, norm2.length);

        // Convertir distancia a porcentaje de similitud
        const similitud = Math.round(((maxLen - distancia) / maxLen) * 100);
        return Math.max(0, similitud);
    }

    /**
     * Compara una placa de referencia con una lista de placas detectadas
     */
    compararConReferencia(
        placaReferencia: string,
        placasDetectadas: string[]
    ): IResultadoComparacionPlacas {
        const refNormalizada = this.normalizar(placaReferencia);

        if (!refNormalizada) {
            return {
                coinciden: false,
                placaReferencia: placaReferencia,
                placasComparadas: placasDetectadas,
                similitud: 0,
                detalles: 'Placa de referencia vacía o inválida'
            };
        }

        if (placasDetectadas.length === 0) {
            return {
                coinciden: false,
                placaReferencia: placaReferencia,
                placasComparadas: [],
                similitud: 0,
                detalles: 'No se detectaron placas en la imagen'
            };
        }

        // Buscar la mejor coincidencia
        let mejorSimilitud = 0;
        let mejorPlaca = '';

        for (const placa of placasDetectadas) {
            const similitud = this.calcularSimilitud(refNormalizada, placa);
            if (similitud > mejorSimilitud) {
                mejorSimilitud = similitud;
                mejorPlaca = placa;
            }
        }

        // Umbral de coincidencia: 80% similitud
        const UMBRAL_COINCIDENCIA = 80;
        const coinciden = mejorSimilitud >= UMBRAL_COINCIDENCIA;

        let detalles: string;
        if (coinciden) {
            if (mejorSimilitud === 100) {
                detalles = `✅ Coincidencia exacta: ${mejorPlaca}`;
            } else {
                detalles = `✅ Coincidencia cercana (${mejorSimilitud}%): ${mejorPlaca} ≈ ${placaReferencia}`;
            }
        } else if (mejorSimilitud > 50) {
            detalles = `⚠️ Posible coincidencia parcial (${mejorSimilitud}%): ${mejorPlaca} vs ${placaReferencia}`;
        } else {
            detalles = `❌ No coincide: detectada ${mejorPlaca || 'ninguna'} vs referencia ${placaReferencia}`;
        }

        return {
            coinciden,
            placaReferencia,
            placasComparadas: placasDetectadas,
            similitud: mejorSimilitud,
            detalles
        };
    }

    /**
     * Valida el formato de una placa mexicana
     */
    esFormatoValido(placa: string): boolean {
        if (!placa) return false;

        const normalizada = this.normalizar(placa);

        // Patrones comunes de placas mexicanas
        const patrones = [
            /^[A-Z]{3}\d{3,4}[A-Z]?$/, // ABC-1234 o ABC-123-D
            /^[A-Z]{2}\d{4,5}[A-Z]?$/, // AB-12345
            /^\d{3}[A-Z]{3}$/, // 123-ABC (formato antiguo)
            /^[A-Z]{3}\d{2,3}$/, // ABC-12 o ABC-123
            /^[A-Z0-9]{5,8}$/ // Formato genérico
        ];

        return patrones.some(patron => patron.test(normalizada));
    }

    /**
     * Formatea una placa al estilo estándar mexicano
     */
    formatear(placa: string): string {
        const normalizada = this.normalizar(placa);

        if (normalizada.length <= 3) return normalizada;

        // Intentar formatear ABC-123-D o similar
        if (normalizada.length === 7) {
            // Detectar si es ABC1234 o ABC123D
            if (/^[A-Z]{3}\d{4}$/.test(normalizada)) {
                return `${normalizada.slice(0, 3)}-${normalizada.slice(3, 5)}-${normalizada.slice(5)}`;
            }
            if (/^[A-Z]{3}\d{3}[A-Z]$/.test(normalizada)) {
                return `${normalizada.slice(0, 3)}-${normalizada.slice(3, 6)}-${normalizada.slice(6)}`;
            }
        }

        // Formato ABC-12-34 para 7 caracteres
        if (normalizada.length === 6 && /^[A-Z]{3}\d{3}$/.test(normalizada)) {
            return `${normalizada.slice(0, 3)}-${normalizada.slice(3, 5)}-${normalizada.slice(5)}`;
        }

        return normalizada;
    }

    /**
     * Calcula la distancia de Levenshtein entre dos strings
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const m = str1.length;
        const n = str2.length;

        // Crear matriz de distancias
        const dp: number[][] = Array(m + 1)
            .fill(null)
            .map(() => Array(n + 1).fill(0));

        // Inicializar primera fila y columna
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        // Llenar matriz
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] =
                        1 +
                        Math.min(
                            dp[i - 1][j], // Eliminación
                            dp[i][j - 1], // Inserción
                            dp[i - 1][j - 1] // Sustitución
                        );
                }
            }
        }

        return dp[m][n];
    }
}

// Singleton
let instance: PlacasValidator | null = null;

export function getInstance(): PlacasValidator {
    if (!instance) {
        instance = new PlacasValidator();
    }
    return instance;
}

export default PlacasValidator;
