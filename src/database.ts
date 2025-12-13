// src/database.ts
// Conexión a PostgreSQL via Prisma

import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Re-exportar todo desde el módulo database/
export {
    prisma,
    getPrismaClient,
    disconnectPrisma,
    testPrismaConnection
} from './database/prisma';

export {
    policyRepository,
    vehicleRepository
} from './database/repositories';
