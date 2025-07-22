// scripts/migrar-fotos-niv-seguro.js
/**
 * 🔧 SCRIPT SEGURO DE MIGRACIÓN DE FOTOS NIV
 * 
 * Migra fotos de vehículos NIV (2023-2026) a sus pólizas correspondientes
 * 
 * CARACTERÍSTICAS DE SEGURIDAD:
 * - Modo dry-run para previsualización
 * - Validaciones exhaustivas
 * - Transacciones MongoDB
 * - Logs detallados
 * - Verificación de integridad
 * 
 * USO:
 * node migrar-fotos-niv-seguro.js --dry-run    # Solo mostrar qué se haría
 * node migrar-fotos-niv-seguro.js --execute    # Ejecutar migración real
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar modelos usando wrapper
const Policy = require('./models/policy');
const Vehicle = require('./models/vehicle');

// Configuración
const DRY_RUN = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');

if (!DRY_RUN && !EXECUTE) {
    console.log('❌ Debes especificar --dry-run o --execute');
    process.exit(1);
}

/**
 * Conectar a MongoDB
 */
async function connectDB() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('No se encontró MONGO_URI en variables de entorno');
        }
        
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
}

/**
 * Buscar NIVs con fotos en vehículo pero sin fotos en póliza
 */
async function encontrarNIVsParaMigrar() {
    console.log('🔍 Buscando NIVs con fotos para migrar...');
    
    // Buscar pólizas NIV - probar diferentes criterios
    console.log('🔍 Buscando por tipoPoliza: NIP...');
    const polizasNIP1 = await Policy.find({
        tipoPoliza: 'NIP',
        estado: 'ACTIVO'
    }).select('numeroPoliza vehicleId archivos tipoPoliza esNIP');
    
    console.log('🔍 Buscando por esNIP: true...');
    const polizasNIP2 = await Policy.find({
        esNIP: true,
        estado: 'ACTIVO'
    }).select('numeroPoliza vehicleId archivos tipoPoliza esNIP');
    
    console.log('🔍 Buscando pólizas con series de los NIVs reportados...');
    const nipsReportados = [
        'LMWDT1G89P1141436', 'LMWDT1G82P1120024', '3N1CN8AE1RL874514',
        '3N6AD33A4RK836184', '3N1AB8AE1RY311322', '3N1CK3CE2RL208934',
        '3N1CN8AE8PL860235', '3N8CP5HE1PL577577', 'JN8AT3MT1PW001090',
        '3N1CN8AE6PL825208', '3VWHP6BU9RM073778', 'LZWPRMGN8RF964186',
        'JM1BPCML3P1615320'
    ];
    
    const polizasNIP3 = await Policy.find({
        numeroPoliza: { $in: nipsReportados },
        estado: 'ACTIVO'
    }).select('numeroPoliza vehicleId archivos tipoPoliza esNIP creadoViaOBD');
    
    console.log(`📊 Resultados de búsqueda:`);
    console.log(`  - tipoPoliza: 'NIP': ${polizasNIP1.length}`);
    console.log(`  - esNIP: true: ${polizasNIP2.length}`);
    console.log(`  - NIPs reportados: ${polizasNIP3.length}`);
    
    // Usar la búsqueda que tenga más resultados
    let polizasNIV = polizasNIP3; // Empezar con los reportados
    if (polizasNIP1.length > polizasNIV.length) polizasNIV = polizasNIP1;
    if (polizasNIP2.length > polizasNIV.length) polizasNIV = polizasNIP2;
    
    // Si encontramos pólizas de ejemplo, mostrar su estructura
    if (polizasNIP3.length > 0) {
        console.log('\n📋 Ejemplo de póliza NIV encontrada:');
        const ejemplo = polizasNIP3[0];
        console.log(`  numeroPoliza: ${ejemplo.numeroPoliza}`);
        console.log(`  tipoPoliza: ${ejemplo.tipoPoliza}`);
        console.log(`  esNIP: ${ejemplo.esNIP}`);
        console.log(`  creadoViaOBD: ${ejemplo.creadoViaOBD}`);
        console.log(`  vehicleId: ${ejemplo.vehicleId ? 'SÍ' : 'NO'}`);
    }
    
    console.log(`📊 Total pólizas NIV encontradas: ${polizasNIV.length}`);
    
    const nivesParaMigrar = [];
    
    for (const poliza of polizasNIV) {
        try {
            // Verificar si la póliza ya tiene fotos
            const totalFotosPoliza = (poliza.archivos?.fotos?.length || 0) + 
                                   (poliza.archivos?.r2Files?.fotos?.length || 0);
            
            if (totalFotosPoliza > 0) {
                console.log(`⏭️  NIV ${poliza.numeroPoliza}: Ya tiene ${totalFotosPoliza} fotos en póliza`);
                continue;
            }
            
            // Buscar vehículo asociado
            if (!poliza.vehicleId) {
                console.log(`⚠️  NIV ${poliza.numeroPoliza}: Sin vehicleId asociado`);
                continue;
            }
            
            const vehiculo = await Vehicle.findById(poliza.vehicleId)
                .select('serie archivos estado');
            
            if (!vehiculo) {
                console.log(`⚠️  NIV ${poliza.numeroPoliza}: Vehículo no encontrado`);
                continue;
            }
            
            // Verificar si el vehículo tiene fotos
            const totalFotosVehiculo = (vehiculo.archivos?.fotos?.length || 0) + 
                                     (vehiculo.archivos?.r2Files?.fotos?.length || 0);
            
            if (totalFotosVehiculo === 0) {
                console.log(`⚠️  NIV ${poliza.numeroPoliza}: Vehículo tampoco tiene fotos`);
                continue;
            }
            
            // Este NIV necesita migración
            nivesParaMigrar.push({
                policyId: poliza._id,
                numeroPoliza: poliza.numeroPoliza,
                vehicleId: vehiculo._id,
                serieVehiculo: vehiculo.serie,
                fotosLegacy: vehiculo.archivos?.fotos?.length || 0,
                fotosR2: vehiculo.archivos?.r2Files?.fotos?.length || 0,
                totalFotos: totalFotosVehiculo,
                archivosVehiculo: vehiculo.archivos
            });
            
            console.log(`✅ NIV ${poliza.numeroPoliza}: Necesita migrar ${totalFotosVehiculo} fotos`);
            
        } catch (error) {
            console.error(`❌ Error procesando NIV ${poliza.numeroPoliza}:`, error.message);
        }
    }
    
    return nivesParaMigrar;
}

/**
 * Validar datos antes de migración
 */
function validarNIV(niv) {
    const errores = [];
    
    if (!niv.policyId) errores.push('Sin policyId');
    if (!niv.vehicleId) errores.push('Sin vehicleId');
    if (!niv.numeroPoliza) errores.push('Sin numeroPoliza');
    if (!niv.serieVehiculo) errores.push('Sin serie de vehículo');
    if (niv.totalFotos === 0) errores.push('Sin fotos para migrar');
    
    // Verificar que la serie coincida con el número de póliza (característica de NIV)
    if (niv.numeroPoliza !== niv.serieVehiculo) {
        errores.push(`Serie vehículo (${niv.serieVehiculo}) no coincide con póliza (${niv.numeroPoliza})`);
    }
    
    return errores;
}

/**
 * Ejecutar migración para un NIV
 */
async function migrarFotosNIV(niv, session) {
    console.log(`\n🔄 Migrando fotos para NIV: ${niv.numeroPoliza}`);
    
    // Validar antes de migrar
    const errores = validarNIV(niv);
    if (errores.length > 0) {
        throw new Error(`Validación fallida: ${errores.join(', ')}`);
    }
    
    const updates = {};
    
    // Migrar fotos legacy si existen
    if (niv.archivosVehiculo?.fotos?.length > 0) {
        updates['archivos.fotos'] = niv.archivosVehiculo.fotos.map(foto => ({
            ...foto,
            migratedFrom: 'VEHICLE_TO_POLICY_NIV',
            migrationDate: new Date()
        }));
        console.log(`  📷 Migrando ${niv.archivosVehiculo.fotos.length} fotos legacy`);
    }
    
    // Migrar fotos R2 si existen
    if (niv.archivosVehiculo?.r2Files?.fotos?.length > 0) {
        updates['archivos.r2Files.fotos'] = niv.archivosVehiculo.r2Files.fotos.map(foto => ({
            ...foto,
            fuenteOriginal: 'MIGRATED_FROM_VEHICLE_NIV',
            migrationDate: new Date()
        }));
        console.log(`  ☁️  Migrando ${niv.archivosVehiculo.r2Files.fotos.length} fotos R2`);
    }
    
    // Actualizar póliza con las fotos
    await Policy.findByIdAndUpdate(
        niv.policyId,
        { $set: updates },
        { session }
    );
    
    console.log(`  ✅ Fotos migradas a póliza NIV: ${niv.numeroPoliza}`);
    
    return {
        numeroPoliza: niv.numeroPoliza,
        fotosLegacyMigradas: niv.fotosLegacy,
        fotosR2Migradas: niv.fotosR2,
        totalMigradas: niv.totalFotos
    };
}

/**
 * Verificar integridad después de migración
 */
async function verificarIntegridad(nivesMigrados) {
    console.log('\n🔍 Verificando integridad de la migración...');
    
    let verificacionesExitosas = 0;
    let verificacionesFallidas = 0;
    
    for (const resultado of nivesMigrados) {
        try {
            const poliza = await Policy.findOne({ numeroPoliza: resultado.numeroPoliza })
                .select('archivos numeroPoliza');
            
            if (!poliza) {
                console.log(`❌ Verificación: Póliza ${resultado.numeroPoliza} no encontrada`);
                verificacionesFallidas++;
                continue;
            }
            
            const fotosEnPoliza = (poliza.archivos?.fotos?.length || 0) + 
                                (poliza.archivos?.r2Files?.fotos?.length || 0);
            
            if (fotosEnPoliza !== resultado.totalMigradas) {
                console.log(`❌ Verificación: NIV ${resultado.numeroPoliza} - Esperadas: ${resultado.totalMigradas}, Encontradas: ${fotosEnPoliza}`);
                verificacionesFallidas++;
            } else {
                console.log(`✅ Verificación: NIV ${resultado.numeroPoliza} - ${fotosEnPoliza} fotos OK`);
                verificacionesExitosas++;
            }
            
        } catch (error) {
            console.error(`❌ Error verificando NIV ${resultado.numeroPoliza}:`, error.message);
            verificacionesFallidas++;
        }
    }
    
    return {
        exitosas: verificacionesExitosas,
        fallidas: verificacionesFallidas,
        total: nivesMigrados.length
    };
}

/**
 * Función principal
 */
async function main() {
    try {
        console.log(`🚀 Iniciando migración de fotos NIV - Modo: ${DRY_RUN ? 'DRY-RUN' : 'EJECUCIÓN'}\n`);
        
        await connectDB();
        
        // Encontrar NIVs para migrar
        const nivesParaMigrar = await encontrarNIVsParaMigrar();
        
        if (nivesParaMigrar.length === 0) {
            console.log('\n🎉 No hay NIVs que requieran migración de fotos.');
            process.exit(0);
        }
        
        console.log(`\n📊 RESUMEN:`);
        console.log(`NIVs encontrados para migrar: ${nivesParaMigrar.length}`);
        console.log(`Total de fotos a migrar: ${nivesParaMigrar.reduce((sum, niv) => sum + niv.totalFotos, 0)}`);
        
        // Mostrar detalle
        console.log('\n📋 DETALLE DE NIVs A MIGRAR:');
        nivesParaMigrar.forEach(niv => {
            console.log(`  • ${niv.numeroPoliza}: ${niv.totalFotos} fotos (${niv.fotosLegacy} legacy + ${niv.fotosR2} R2)`);
        });
        
        if (DRY_RUN) {
            console.log('\n🔍 MODO DRY-RUN: Solo mostrando lo que se haría');
            console.log('Para ejecutar la migración real, usa: node migrar-fotos-niv-seguro.js --execute');
            process.exit(0);
        }
        
        // Ejecutar migración real
        console.log('\n⚡ EJECUTANDO MIGRACIÓN REAL...');
        
        const session = await mongoose.startSession();
        const nivesMigrados = [];
        
        try {
            await session.startTransaction();
            
            for (const niv of nivesParaMigrar) {
                try {
                    const resultado = await migrarFotosNIV(niv, session);
                    nivesMigrados.push(resultado);
                } catch (error) {
                    console.error(`❌ Error migrando NIV ${niv.numeroPoliza}:`, error.message);
                    throw error; // Abortar toda la transacción
                }
            }
            
            await session.commitTransaction();
            console.log(`\n✅ MIGRACIÓN COMPLETADA: ${nivesMigrados.length} NIVs migrados exitosamente`);
            
        } catch (error) {
            await session.abortTransaction();
            console.error('\n❌ ERROR EN MIGRACIÓN - ROLLBACK APLICADO:', error.message);
            throw error;
        } finally {
            await session.endSession();
        }
        
        // Verificar integridad
        const verificacion = await verificarIntegridad(nivesMigrados);
        
        console.log('\n📊 RESULTADO FINAL:');
        console.log(`✅ NIVs migrados exitosamente: ${verificacion.exitosas}`);
        console.log(`❌ Verificaciones fallidas: ${verificacion.fallidas}`);
        console.log(`📊 Total procesados: ${verificacion.total}`);
        
        if (verificacion.fallidas === 0) {
            console.log('\n🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
            console.log('Las fotos de los NIVs ahora aparecerán correctamente en los reportes.');
        } else {
            console.log('\n⚠️  Algunas verificaciones fallaron. Revisar logs arriba.');
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Error en el proceso:', error);
        process.exit(1);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { main, encontrarNIVsParaMigrar, migrarFotosNIV };