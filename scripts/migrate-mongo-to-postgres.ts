/**
 * Script de Migración: MongoDB → PostgreSQL
 *
 * IMPORTANTE: Este script migra TODOS los datos sin excepción.
 * Ejecutar: npx ts-node scripts/migrate-mongo-to-postgres.ts
 *
 * Tablas migradas:
 * - Aseguradora (catálogo)
 * - Policy (pólizas principales)
 * - Vehicle (vehículos BD AUTOS)
 * - ScheduledNotification (notificaciones)
 * - Pago, Registro, Servicio (subdocumentos de Policy)
 * - PolicyFileLegacy, PolicyFileR2 (archivos de pólizas)
 * - VehicleFileLegacy, VehicleFileR2 (archivos de vehículos)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Importar modelos Mongoose
import PolicyModel from '../src/models/policy';
import VehicleModel from '../src/models/vehicle';
import ScheduledNotificationModel from '../src/models/scheduledNotification';
import AseguradoraModel from '../src/models/aseguradora';

// Crear pool de conexiones PostgreSQL
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

// Crear adaptador y cliente Prisma
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Contadores globales
const stats = {
    aseguradoras: { total: 0, migrated: 0, errors: 0 },
    policies: { total: 0, migrated: 0, errors: 0 },
    vehicles: { total: 0, migrated: 0, errors: 0 },
    notifications: { total: 0, migrated: 0, errors: 0 },
    pagos: { total: 0, migrated: 0 },
    registros: { total: 0, migrated: 0 },
    servicios: { total: 0, migrated: 0 },
    archivosLegacy: { total: 0, migrated: 0 },
    archivosR2: { total: 0, migrated: 0 }
};

// Mapeo de IDs MongoDB → PostgreSQL
const idMap = {
    policies: new Map<string, string>(),
    vehicles: new Map<string, string>()
};

async function connectMongo(): Promise<void> {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI no está definido en .env');
    }

    console.log('📦 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB conectado');
}

async function migrateAseguradoras(): Promise<void> {
    console.log('\n🏢 Migrando Aseguradoras...');

    const aseguradoras = await AseguradoraModel.find({});
    stats.aseguradoras.total = aseguradoras.length;

    for (const aseg of aseguradoras) {
        try {
            await prisma.aseguradora.upsert({
                where: { nombre: aseg.nombre },
                update: {},
                create: {
                    nombre: aseg.nombre,
                    nombreCorto: aseg.nombreCorto,
                    aliases: aseg.aliases || [],
                    activa: aseg.activa ?? true,
                    logoUrl: aseg.logoUrl,
                    contactoTelefono: aseg.contacto?.telefono,
                    contactoEmail: aseg.contacto?.email,
                    contactoWeb: aseg.contacto?.web,
                    createdAt: aseg.createdAt || new Date(),
                    updatedAt: aseg.updatedAt || new Date()
                }
            });
            stats.aseguradoras.migrated++;
        } catch (error: any) {
            console.error(`  ❌ Error migrando aseguradora ${aseg.nombre}:`, error.message);
            stats.aseguradoras.errors++;
        }
    }

    console.log(`  ✅ ${stats.aseguradoras.migrated}/${stats.aseguradoras.total} aseguradoras migradas`);
}

async function migrateVehicles(): Promise<void> {
    console.log('\n🚗 Migrando Vehículos...');

    const vehicles = await VehicleModel.find({});
    stats.vehicles.total = vehicles.length;

    for (const vehicle of vehicles) {
        try {
            const mongoId = vehicle._id.toString();

            // Crear vehículo en PostgreSQL
            const created = await prisma.vehicle.create({
                data: {
                    serie: vehicle.serie,
                    marca: vehicle.marca,
                    submarca: vehicle.submarca,
                    anio: vehicle.año,
                    color: vehicle.color,
                    placas: vehicle.placas,
                    titular: vehicle.titular,
                    rfc: vehicle.rfc,
                    telefono: vehicle.telefono,
                    correo: vehicle.correo,
                    calle: vehicle.calle,
                    colonia: vehicle.colonia,
                    municipio: vehicle.municipio,
                    estadoRegion: vehicle.estadoRegion,
                    cp: vehicle.cp,
                    estado: vehicle.estado as any || 'SIN_POLIZA',
                    creadoPor: vehicle.creadoPor,
                    creadoVia: vehicle.creadoVia as any || 'TELEGRAM_BOT',
                    notas: vehicle.notas,
                    createdAt: vehicle.createdAt || new Date(),
                    updatedAt: vehicle.updatedAt || new Date()
                }
            });

            idMap.vehicles.set(mongoId, created.id);

            // Migrar archivos legacy de vehículos
            if (vehicle.archivos?.fotos?.length) {
                for (const foto of vehicle.archivos.fotos) {
                    if (foto.data) {
                        await prisma.vehicleFileLegacy.create({
                            data: {
                                vehicleId: created.id,
                                tipo: 'FOTO',
                                data: foto.data,
                                contentType: foto.contentType,
                                originalName: foto.originalName,
                                uploadDate: foto.uploadDate || new Date()
                            }
                        });
                        stats.archivosLegacy.total++;
                        stats.archivosLegacy.migrated++;
                    }
                }
            }

            // Migrar archivos R2 de vehículos
            if (vehicle.archivos?.r2Files?.fotos?.length) {
                for (const foto of vehicle.archivos.r2Files.fotos) {
                    await prisma.vehicleFileR2.create({
                        data: {
                            vehicleId: created.id,
                            tipo: 'FOTO',
                            url: foto.url,
                            key: foto.key,
                            size: foto.size,
                            contentType: foto.contentType,
                            originalName: foto.originalName,
                            uploadedAt: foto.uploadedAt || new Date(),
                            fuenteOriginal: foto.fuenteOriginal
                        }
                    });
                    stats.archivosR2.total++;
                    stats.archivosR2.migrated++;
                }
            }

            stats.vehicles.migrated++;
        } catch (error: any) {
            console.error(`  ❌ Error migrando vehículo ${vehicle.serie}:`, error.message);
            stats.vehicles.errors++;
        }
    }

    console.log(`  ✅ ${stats.vehicles.migrated}/${stats.vehicles.total} vehículos migrados`);
}

async function migratePolicies(): Promise<void> {
    console.log('\n📋 Migrando Pólizas...');

    const policies = await PolicyModel.find({});
    stats.policies.total = policies.length;

    for (const policy of policies) {
        try {
            const mongoId = policy._id.toString();

            // Buscar vehicleId en PostgreSQL si existe
            let vehicleIdPg: string | null = null;
            if (policy.vehicleId) {
                vehicleIdPg = idMap.vehicles.get(policy.vehicleId.toString()) || null;
            }

            // Crear póliza en PostgreSQL
            const created = await prisma.policy.create({
                data: {
                    titular: policy.titular,
                    correo: policy.correo,
                    contrasena: policy.contraseña,
                    rfc: policy.rfc,
                    calle: policy.calle,
                    colonia: policy.colonia,
                    municipio: policy.municipio,
                    estadoRegion: policy.estadoRegion,
                    cp: policy.cp,
                    marca: policy.marca,
                    submarca: policy.submarca,
                    anio: policy.año,
                    color: policy.color,
                    serie: policy.serie,
                    placas: policy.placas,
                    agenteCotizador: policy.agenteCotizador,
                    aseguradora: policy.aseguradora,
                    numeroPoliza: policy.numeroPoliza,
                    fechaEmision: policy.fechaEmision,
                    telefono: policy.telefono,
                    estadoPoliza: policy.estadoPoliza,
                    fechaFinCobertura: policy.fechaFinCobertura,
                    fechaFinGracia: policy.fechaFinGracia,
                    diasRestantesCobertura: policy.diasRestantesCobertura ?? 0,
                    diasRestantesGracia: policy.diasRestantesGracia ?? 0,
                    calificacion: policy.calificacion ?? 0,
                    totalServicios: policy.totalServicios ?? 0,
                    servicioCounter: policy.servicioCounter ?? 0,
                    registroCounter: policy.registroCounter ?? 0,
                    estado: policy.estado as any || 'ACTIVO',
                    fechaEliminacion: policy.fechaEliminacion,
                    motivoEliminacion: policy.motivoEliminacion,
                    vehicleId: vehicleIdPg,
                    creadoViaOBD: policy.creadoViaOBD ?? false,
                    asignadoPor: policy.asignadoPor,
                    esNIV: policy.esNIV ?? false,
                    tipoPoliza: policy.tipoPoliza as any || 'REGULAR',
                    fechaConversionNIV: policy.fechaConversionNIV,
                    createdAt: policy.createdAt || new Date(),
                    updatedAt: policy.updatedAt || new Date()
                }
            });

            idMap.policies.set(mongoId, created.id);

            // === MIGRAR SUBDOCUMENTOS ===

            // Pagos
            if (policy.pagos?.length) {
                for (const pago of policy.pagos) {
                    stats.pagos.total++;
                    await prisma.pago.create({
                        data: {
                            policyId: created.id,
                            monto: pago.monto,
                            fechaPago: pago.fechaPago,
                            estado: pago.estado as any || 'PLANIFICADO',
                            metodoPago: pago.metodoPago,
                            referencia: pago.referencia,
                            fechaRegistro: pago.fechaRegistro || new Date(),
                            notas: pago.notas
                        }
                    });
                    stats.pagos.migrated++;
                }
            }

            // Registros
            if (policy.registros?.length) {
                for (const registro of policy.registros) {
                    stats.registros.total++;
                    await prisma.registro.create({
                        data: {
                            policyId: created.id,
                            numeroRegistro: registro.numeroRegistro,
                            costo: registro.costo,
                            fechaRegistro: registro.fechaRegistro,
                            numeroExpediente: registro.numeroExpediente,
                            origenDestino: registro.origenDestino,
                            estado: registro.estado as any || 'PENDIENTE',
                            fechaContactoProgramada: registro.fechaContactoProgramada,
                            fechaTerminoProgramada: registro.fechaTerminoProgramada,
                            origenLat: registro.coordenadas?.origen?.lat,
                            origenLng: registro.coordenadas?.origen?.lng,
                            destinoLat: registro.coordenadas?.destino?.lat,
                            destinoLng: registro.coordenadas?.destino?.lng,
                            rutaDistanciaKm: registro.rutaInfo?.distanciaKm,
                            rutaTiempoMinutos: registro.rutaInfo?.tiempoMinutos,
                            rutaGoogleMapsUrl: registro.rutaInfo?.googleMapsUrl
                        }
                    });
                    stats.registros.migrated++;
                }
            }

            // Servicios
            if (policy.servicios?.length) {
                for (const servicio of policy.servicios) {
                    stats.servicios.total++;
                    await prisma.servicio.create({
                        data: {
                            policyId: created.id,
                            numeroServicio: servicio.numeroServicio,
                            numeroRegistroOrigen: servicio.numeroRegistroOrigen,
                            costo: servicio.costo,
                            fechaServicio: servicio.fechaServicio,
                            numeroExpediente: servicio.numeroExpediente,
                            origenDestino: servicio.origenDestino,
                            fechaContactoProgramada: servicio.fechaContactoProgramada,
                            fechaTerminoProgramada: servicio.fechaTerminoProgramada,
                            fechaContactoReal: servicio.fechaContactoReal,
                            fechaTerminoReal: servicio.fechaTerminoReal,
                            origenLat: servicio.coordenadas?.origen?.lat,
                            origenLng: servicio.coordenadas?.origen?.lng,
                            destinoLat: servicio.coordenadas?.destino?.lat,
                            destinoLng: servicio.coordenadas?.destino?.lng,
                            rutaDistanciaKm: servicio.rutaInfo?.distanciaKm,
                            rutaTiempoMinutos: servicio.rutaInfo?.tiempoMinutos,
                            rutaGoogleMapsUrl: servicio.rutaInfo?.googleMapsUrl
                        }
                    });
                    stats.servicios.migrated++;
                }
            }

            // Archivos Legacy (fotos)
            if (policy.archivos?.fotos?.length) {
                for (const foto of policy.archivos.fotos) {
                    if (foto.data) {
                        stats.archivosLegacy.total++;
                        await prisma.policyFileLegacy.create({
                            data: {
                                policyId: created.id,
                                tipo: 'FOTO',
                                data: foto.data,
                                contentType: foto.contentType
                            }
                        });
                        stats.archivosLegacy.migrated++;
                    }
                }
            }

            // Archivos Legacy (PDFs)
            if (policy.archivos?.pdfs?.length) {
                for (const pdf of policy.archivos.pdfs) {
                    if (pdf.data) {
                        stats.archivosLegacy.total++;
                        await prisma.policyFileLegacy.create({
                            data: {
                                policyId: created.id,
                                tipo: 'PDF',
                                data: pdf.data,
                                contentType: pdf.contentType
                            }
                        });
                        stats.archivosLegacy.migrated++;
                    }
                }
            }

            // Archivos R2 (fotos)
            if (policy.archivos?.r2Files?.fotos?.length) {
                for (const foto of policy.archivos.r2Files.fotos) {
                    stats.archivosR2.total++;
                    await prisma.policyFileR2.create({
                        data: {
                            policyId: created.id,
                            tipo: 'FOTO',
                            url: foto.url,
                            key: foto.key,
                            size: foto.size,
                            contentType: foto.contentType,
                            uploadDate: foto.uploadDate || new Date(),
                            originalName: foto.originalName,
                            fuenteOriginal: foto.fuenteOriginal
                        }
                    });
                    stats.archivosR2.migrated++;
                }
            }

            // Archivos R2 (PDFs)
            if (policy.archivos?.r2Files?.pdfs?.length) {
                for (const pdf of policy.archivos.r2Files.pdfs) {
                    stats.archivosR2.total++;
                    await prisma.policyFileR2.create({
                        data: {
                            policyId: created.id,
                            tipo: 'PDF',
                            url: pdf.url,
                            key: pdf.key,
                            size: pdf.size,
                            contentType: pdf.contentType,
                            uploadDate: pdf.uploadDate || new Date(),
                            originalName: pdf.originalName,
                            fuenteOriginal: pdf.fuenteOriginal
                        }
                    });
                    stats.archivosR2.migrated++;
                }
            }

            stats.policies.migrated++;

            // Log de progreso cada 50 pólizas
            if (stats.policies.migrated % 50 === 0) {
                console.log(`  📊 Progreso: ${stats.policies.migrated}/${stats.policies.total} pólizas`);
            }

        } catch (error: any) {
            console.error(`  ❌ Error migrando póliza ${policy.numeroPoliza}:`, error.message);
            stats.policies.errors++;
        }
    }

    console.log(`  ✅ ${stats.policies.migrated}/${stats.policies.total} pólizas migradas`);
}

async function migrateNotifications(): Promise<void> {
    console.log('\n🔔 Migrando Notificaciones Programadas...');

    const notifications = await ScheduledNotificationModel.find({});
    stats.notifications.total = notifications.length;

    for (const notif of notifications) {
        try {
            await prisma.scheduledNotification.create({
                data: {
                    numeroPoliza: notif.numeroPoliza,
                    expedienteNum: notif.expedienteNum,
                    origenDestino: notif.origenDestino,
                    placas: notif.placas,
                    fotoUrl: notif.fotoUrl,
                    marcaModelo: notif.marcaModelo,
                    colorVehiculo: notif.colorVehiculo,
                    telefono: notif.telefono,
                    contactTime: notif.contactTime,
                    scheduledDate: notif.scheduledDate,
                    lastScheduledAt: notif.lastScheduledAt,
                    processingStartedAt: notif.processingStartedAt,
                    createdByChatId: notif.createdBy?.chatId ? BigInt(notif.createdBy.chatId) : null,
                    createdByUsername: notif.createdBy?.username,
                    targetGroupId: BigInt(notif.targetGroupId),
                    tipoNotificacion: notif.tipoNotificacion as any || 'MANUAL',
                    status: notif.status as any || 'PENDING',
                    sentAt: notif.sentAt,
                    error: notif.error,
                    retryCount: notif.retryCount ?? 0,
                    lastRetryAt: notif.lastRetryAt,
                    additionalData: notif.additionalData || null,
                    createdAt: notif.createdAt || new Date(),
                    updatedAt: notif.updatedAt || new Date()
                }
            });
            stats.notifications.migrated++;
        } catch (error: any) {
            // Ignorar duplicados (constraint único)
            if (!error.message.includes('Unique constraint')) {
                console.error(`  ❌ Error migrando notificación ${notif.expedienteNum}:`, error.message);
            }
            stats.notifications.errors++;
        }
    }

    console.log(`  ✅ ${stats.notifications.migrated}/${stats.notifications.total} notificaciones migradas`);
}

async function printSummary(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(60));

    console.log(`\n📦 Colecciones principales:`);
    console.log(`   Aseguradoras:    ${stats.aseguradoras.migrated}/${stats.aseguradoras.total} (${stats.aseguradoras.errors} errores)`);
    console.log(`   Vehículos:       ${stats.vehicles.migrated}/${stats.vehicles.total} (${stats.vehicles.errors} errores)`);
    console.log(`   Pólizas:         ${stats.policies.migrated}/${stats.policies.total} (${stats.policies.errors} errores)`);
    console.log(`   Notificaciones:  ${stats.notifications.migrated}/${stats.notifications.total} (${stats.notifications.errors} errores)`);

    console.log(`\n📎 Subdocumentos migrados:`);
    console.log(`   Pagos:           ${stats.pagos.migrated}/${stats.pagos.total}`);
    console.log(`   Registros:       ${stats.registros.migrated}/${stats.registros.total}`);
    console.log(`   Servicios:       ${stats.servicios.migrated}/${stats.servicios.total}`);

    console.log(`\n📁 Archivos migrados:`);
    console.log(`   Legacy (Buffer): ${stats.archivosLegacy.migrated}/${stats.archivosLegacy.total}`);
    console.log(`   R2 (Cloud):      ${stats.archivosR2.migrated}/${stats.archivosR2.total}`);

    const totalErrors = stats.aseguradoras.errors + stats.vehicles.errors +
                       stats.policies.errors + stats.notifications.errors;

    console.log('\n' + '='.repeat(60));
    if (totalErrors === 0) {
        console.log('✅ MIGRACIÓN COMPLETADA SIN ERRORES');
    } else {
        console.log(`⚠️  MIGRACIÓN COMPLETADA CON ${totalErrors} ERRORES`);
    }
    console.log('='.repeat(60));
}

async function main(): Promise<void> {
    console.log('🚀 Iniciando migración MongoDB → PostgreSQL');
    console.log('   Fecha:', new Date().toISOString());
    console.log('');

    try {
        // Conectar a MongoDB
        await connectMongo();

        // Verificar conexión PostgreSQL
        console.log('🐘 Verificando conexión PostgreSQL...');
        await prisma.$connect();
        console.log('✅ PostgreSQL conectado');

        // Ejecutar migraciones en orden
        await migrateAseguradoras();
        await migrateVehicles();  // Primero vehículos para tener los IDs
        await migratePolicies();  // Luego pólizas con referencia a vehículos
        await migrateNotifications();

        // Resumen
        await printSummary();

    } catch (error) {
        console.error('\n❌ ERROR FATAL:', error);
        process.exit(1);
    } finally {
        // Cerrar conexiones
        await mongoose.disconnect();
        await prisma.$disconnect();
        console.log('\n🔌 Conexiones cerradas');
    }
}

// Ejecutar
main();
