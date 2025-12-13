/**
 * Script para verificar la conexión a PostgreSQL y comparar datos con MongoDB
 * Ejecutar: npx ts-node scripts/test-prisma-connection.ts
 */

import { prisma, testPrismaConnection } from '../src/database/prisma';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testPostgres() {
    console.log('\n========================================');
    console.log('   VERIFICACIÓN DE POSTGRESQL/PRISMA');
    console.log('========================================\n');

    // 1. Test conexión
    console.log('1. Probando conexión...');
    const connected = await testPrismaConnection();
    if (!connected) {
        console.error('❌ No se pudo conectar a PostgreSQL');
        return false;
    }
    console.log('✅ Conexión exitosa\n');

    // 2. Contar registros
    console.log('2. Contando registros en PostgreSQL:');
    const counts = {
        policies: await prisma.policy.count(),
        vehicles: await prisma.vehicle.count(),
        notifications: await prisma.scheduledNotification.count(),
        aseguradoras: await prisma.aseguradora.count(),
        pagos: await prisma.pago.count(),
        registros: await prisma.registro.count(),
        servicios: await prisma.servicio.count(),
        policyFilesR2: await prisma.policyFileR2.count(),
        vehicleFilesR2: await prisma.vehicleFileR2.count()
    };

    Object.entries(counts).forEach(([table, count]) => {
        console.log(`   ${table}: ${count}`);
    });
    console.log('');

    // 3. Verificar una póliza de ejemplo
    console.log('3. Verificando póliza de ejemplo:');
    const samplePolicy = await prisma.policy.findFirst({
        where: { estado: 'ACTIVO' },
        include: {
            pagos: true,
            registros: true,
            servicios: true,
            archivosR2: true
        }
    });

    if (samplePolicy) {
        console.log(`   Póliza: ${samplePolicy.numeroPoliza}`);
        console.log(`   Titular: ${samplePolicy.titular}`);
        console.log(`   Aseguradora: ${samplePolicy.aseguradora}`);
        console.log(`   Pagos: ${samplePolicy.pagos.length}`);
        console.log(`   Registros: ${samplePolicy.registros.length}`);
        console.log(`   Servicios: ${samplePolicy.servicios.length}`);
        console.log(`   Archivos R2: ${samplePolicy.archivosR2.length}`);
    } else {
        console.log('   No hay pólizas activas');
    }
    console.log('');

    return true;
}

async function testMongoDB() {
    console.log('\n========================================');
    console.log('      VERIFICACIÓN DE MONGODB');
    console.log('========================================\n');

    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.log('⚠️  MONGO_URI no configurado - MongoDB deshabilitado');
        return null;
    }

    try {
        console.log('1. Conectando a MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Conexión exitosa\n');

        // Contar registros
        console.log('2. Contando registros en MongoDB:');
        const db = mongoose.connection.db;
        if (!db) {
            console.error('❌ No se pudo acceder a la base de datos');
            return null;
        }

        const collections = ['policies', 'vehicles', 'schedulednotifications', 'aseguradoras'];
        const mongoCounts: Record<string, number> = {};

        for (const col of collections) {
            try {
                const count = await db.collection(col).countDocuments();
                mongoCounts[col] = count;
                console.log(`   ${col}: ${count}`);
            } catch {
                console.log(`   ${col}: (no existe)`);
            }
        }
        console.log('');

        await mongoose.disconnect();
        return mongoCounts;
    } catch (error: any) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        return null;
    }
}

async function compareData() {
    console.log('\n========================================');
    console.log('      COMPARACIÓN DE DATOS');
    console.log('========================================\n');

    // Comparar algunas pólizas por número
    const testPolicies = await prisma.policy.findMany({
        take: 5,
        select: { numeroPoliza: true, titular: true }
    });

    if (testPolicies.length === 0) {
        console.log('No hay pólizas para comparar');
        return;
    }

    console.log('Pólizas en PostgreSQL (muestra):');
    testPolicies.forEach(p => {
        console.log(`   - ${p.numeroPoliza}: ${p.titular}`);
    });
}

async function identifyMongoUsage() {
    console.log('\n========================================');
    console.log('  ARCHIVOS QUE AÚN USAN MONGOOSE');
    console.log('========================================\n');

    // Lista de archivos que importan modelos Mongoose
    const mongooseFiles = [
        'src/models/policy.ts',
        'src/models/vehicle.ts',
        'src/models/scheduledNotification.ts',
        'src/models/aseguradora.ts',
        'src/services/VehicleCreationService.ts',
        'src/services/PaymentCalculatorService.ts',
        'src/admin/handlers/serviceHandler.ts',
        'src/utils/fileHandler.ts',
        'src/queues/NotificationQueue.ts (ScheduledNotification)',
        'src/services/NotificationManager.ts'
    ];

    console.log('Archivos que aún importan modelos Mongoose:');
    mongooseFiles.forEach(file => {
        console.log(`   - ${file}`);
    });

    console.log('\n📋 PARA DESCONECTAR MONGODB:');
    console.log('   1. Migrar NotificationManager a Prisma');
    console.log('   2. Migrar NotificationQueue a Prisma');
    console.log('   3. Migrar VehicleCreationService a Prisma');
    console.log('   4. Migrar admin handlers a Prisma');
    console.log('   5. Eliminar imports de src/models/*');
    console.log('   6. Remover mongoose de package.json');
    console.log('   7. Eliminar MONGO_URI del .env\n');
}

async function main() {
    console.log('\n🚀 INICIANDO VERIFICACIÓN DE BASE DE DATOS\n');
    console.log(`Fecha: ${new Date().toLocaleString('es-MX')}`);

    try {
        // Test PostgreSQL
        const pgOk = await testPostgres();
        if (!pgOk) {
            process.exit(1);
        }

        // Test MongoDB (opcional)
        await testMongoDB();

        // Comparar datos
        await compareData();

        // Identificar uso de MongoDB
        await identifyMongoUsage();

        console.log('========================================');
        console.log('        VERIFICACIÓN COMPLETADA');
        console.log('========================================\n');

    } catch (error) {
        console.error('Error en verificación:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
    }
}

main();
