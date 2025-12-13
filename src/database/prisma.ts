/**
 * Conexión centralizada a PostgreSQL con Prisma
 *
 * Uso:
 *   import { prisma } from './database/prisma';
 *   const policies = await prisma.policy.findMany();
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import logger from '../utils/logger';

// Pool de conexiones PostgreSQL
let pool: pg.Pool | null = null;

// Cliente Prisma singleton
let prismaClient: PrismaClient | null = null;

/**
 * Obtiene o crea el cliente Prisma
 */
export function getPrismaClient(): PrismaClient {
    if (!prismaClient) {
        const connectionString = process.env.DATABASE_URL;

        if (!connectionString) {
            throw new Error('DATABASE_URL no está definido en las variables de entorno');
        }

        // Crear pool de conexiones
        pool = new pg.Pool({
            connectionString,
            max: 10, // Máximo de conexiones en el pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });

        // Manejar errores del pool
        pool.on('error', (err) => {
            logger.error('[Prisma] Error en pool de conexiones:', err);
        });

        // Crear adaptador y cliente
        const adapter = new PrismaPg(pool);
        prismaClient = new PrismaClient({
            adapter,
            log: process.env.NODE_ENV === 'development'
                ? ['query', 'error', 'warn']
                : ['error']
        });

        logger.info('[Prisma] Cliente PostgreSQL inicializado');
    }

    return prismaClient;
}

/**
 * Cierra la conexión a PostgreSQL
 */
export async function disconnectPrisma(): Promise<void> {
    if (prismaClient) {
        await prismaClient.$disconnect();
        prismaClient = null;
        logger.info('[Prisma] Cliente desconectado');
    }

    if (pool) {
        await pool.end();
        pool = null;
        logger.info('[Prisma] Pool de conexiones cerrado');
    }
}

/**
 * Verifica la conexión a PostgreSQL
 */
export async function testPrismaConnection(): Promise<boolean> {
    try {
        const client = getPrismaClient();
        await client.$queryRaw`SELECT 1`;
        logger.info('[Prisma] Conexión a PostgreSQL verificada');
        return true;
    } catch (error) {
        logger.error('[Prisma] Error verificando conexión:', error);
        return false;
    }
}

// Export por defecto del cliente (lazy initialization)
export const prisma = new Proxy({} as PrismaClient, {
    get(_, prop) {
        const client = getPrismaClient();
        return (client as any)[prop];
    }
});

export default prisma;
