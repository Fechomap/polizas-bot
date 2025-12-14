// src/config.ts
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Detectar entorno
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Obtiene el número de base de datos de Redis
 * - Si REDIS_DB está definido, usar ese valor
 * - Si no, usar 0 para producción, 1 para desarrollo
 */
function getRedisDb(): number {
    if (process.env.REDIS_DB !== undefined) {
        return parseInt(process.env.REDIS_DB, 10);
    }
    return isDevelopment ? 1 : 0;
}

// Constantes internas (no configurables)
const CACHE_MEMORY_TTL_MS = 5 * 60 * 1000; // 5 minutos - caché en memoria (fijo)
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos - intervalo de limpieza (fijo)

// Interfaz para la configuración
interface IConfig {
    telegram: {
        token: string;
        allowedGroups: number[];
    };
    redis: {
        url?: string;
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    /**
     * TTL simplificado - UN solo valor para todo
     * Configurable via TTL_SESSION (default: 1 hora)
     */
    ttl: {
        /** TTL principal para sesiones, estados, caché Redis, navegación, admin (default: 1 hora) */
        session: number;
        /** TTL de caché en memoria - FIJO 5 minutos (no configurable, para no consumir RAM) */
        cacheMemory: number;
        /** Intervalo de limpieza - FIJO 15 minutos (no configurable) */
        cleanupInterval: number;
    };
    uploads: {
        maxSize: number;
    };
    admin: {
        auditRetentionDays: number;
        features: {
            enableAudit: boolean;
            enableAdvancedStats: boolean;
        };
    };
    isDevelopment: boolean;
}

const config: IConfig = {
    telegram: {
        token: process.env.TELEGRAM_TOKEN ?? '',
        allowedGroups: [-1002291817096, process.env.TELEGRAM_GROUP_ID]
            .filter((id): id is number | string => id !== undefined && id !== null)
            .map(id => (typeof id === 'string' ? parseInt(id) : id))
    },
    redis: {
        url: process.env.REDIS_URL,
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD,
        db: getRedisDb()
    },
    ttl: {
        // TTL principal: 1 hora por defecto (en ms) - usado para TODO
        session: parseInt(process.env.TTL_SESSION ?? '3600000'),
        // Caché en memoria: 5 minutos FIJO (no consumir RAM)
        cacheMemory: CACHE_MEMORY_TTL_MS,
        // Intervalo de limpieza: 15 minutos FIJO
        cleanupInterval: CLEANUP_INTERVAL_MS
    },
    uploads: {
        maxSize: parseInt(process.env.MAX_UPLOAD_SIZE ?? '20971520')
    },
    admin: {
        auditRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS ?? '90'),
        features: {
            enableAudit: true,
            enableAdvancedStats: false
        }
    },
    isDevelopment
};

const validateConfig = (): void => {
    const required = ['telegram.token', 'redis.host', 'redis.port'];
    const missing: string[] = [];

    for (const configPath of required) {
        const value = configPath.split('.').reduce(
            (obj: Record<string, unknown> | unknown, key: string) => {
                if (obj && typeof obj === 'object' && key in obj) {
                    return (obj as Record<string, unknown>)[key];
                }
                return undefined;
            },
            config as unknown as Record<string, unknown>
        );
        if (!value) {
            missing.push(configPath);
        }
    }

    if (missing.length > 0) {
        throw new Error(`Configuración faltante: ${missing.join(', ')}`);
    }

    if (!config.telegram.allowedGroups || config.telegram.allowedGroups.length === 0) {
        console.warn('⚠️ No hay grupos permitidos configurados');
    }
};

// Validar la configuración al importar
validateConfig();

// Log de configuración (sin exponer credenciales)
const envLabel = isDevelopment ? 'DESARROLLO' : 'PRODUCCIÓN';
console.log(`⚙️ Entorno: ${envLabel} | Redis DB: ${config.redis.db}`);

export default config;
