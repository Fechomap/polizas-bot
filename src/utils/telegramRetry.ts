/**
 * Utility para manejar rate limits de Telegram (error 429)
 * Reintenta automáticamente después del tiempo indicado por Telegram
 */

import logger from './logger';

interface TelegramError {
    response?: {
        error_code?: number;
        parameters?: {
            retry_after?: number;
        };
    };
}

const MAX_RETRIES = 3;

/**
 * Ejecuta una función de Telegram con retry automático para errores 429
 * @param fn - Función async que hace la llamada a Telegram
 * @param context - Descripción del contexto para logging
 * @returns El resultado de la función o throws si falla después de reintentos
 */
export async function withTelegramRetry<T>(
    fn: () => Promise<T>,
    context = 'Telegram call'
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            const telegramError = error as TelegramError;

            // Verificar si es error 429 (rate limit)
            if (telegramError?.response?.error_code === 429) {
                const retryAfter = telegramError.response.parameters?.retry_after ?? 5;

                logger.warn(`[TelegramRetry] Rate limit (429) en ${context}`, {
                    attempt,
                    retryAfter,
                    maxRetries: MAX_RETRIES
                });

                // Si no es el último intento, esperar y reintentar
                if (attempt < MAX_RETRIES) {
                    await sleep(retryAfter * 1000 + 500); // +500ms de margen
                    continue;
                }
            }

            lastError = error as Error;
            break;
        }
    }

    // Si llegamos aquí, fallaron todos los intentos
    logger.error(`[TelegramRetry] Falló después de ${MAX_RETRIES} intentos: ${context}`, {
        error: lastError?.message
    });

    throw lastError;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default withTelegramRetry;
