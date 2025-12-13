/**
 * Database - Conexión y repositorios PostgreSQL
 *
 * Uso:
 *   import { prisma, policyRepository, vehicleRepository } from './database';
 */

// Cliente Prisma
export { prisma, getPrismaClient, disconnectPrisma, testPrismaConnection } from './prisma';

// Repositorios
export { policyRepository, vehicleRepository } from './repositories';
