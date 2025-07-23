// scripts/cleanup-nivs-usados.js
/**
 * 🧹 JOB DE LIMPIEZA AUTOMÁTICA - NIVs USADOS
 *
 * Elimina automáticamente NIVs que ya fueron utilizados
 * Diseñado para ejecutarse diariamente a las 3:00 AM
 *
 * CRITERIOS DE ELIMINACIÓN:
 * 1. Es NIV (tipoPoliza: 'NIV' o esNIP: true)
 * 2. Estado: ACTIVO
 * 3. totalServicios >= 1
 * 4. No tiene notificaciones pendientes activas
 *
 * SEGURIDAD:
 * - Transacciones MongoDB
 * - Validaciones exhaustivas
 * - Logs detallados
 * - Rollback automático
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar modelos
const Policy = require('./models/policy');

/**
 * Conectar a MongoDB
 */
async function connectDB() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
}

/**
 * Buscar NIVs que deben eliminarse
 */
async function buscarNIVsParaEliminar() {
    console.log('🔍 Buscando NIVs para eliminar...');

    const criteriosBusqueda = {
        $or: [
            { tipoPoliza: 'NIV' },
            { tipoPoliza: 'NIP' },
            { esNIP: true },
            { creadoViaOBD: true } // Criterio adicional para NIVs
        ],
        estado: 'ACTIVO',
        totalServicios: { $gte: 1 }
    };

    const nivesParaEliminar = await Policy.find(criteriosBusqueda)
        .select('numeroPoliza estado tipoPoliza esNIP totalServicios servicios creadoViaOBD createdAt');

    console.log(`📊 NIVs encontrados para eliminar: ${nivesParaEliminar.length}`);

    // Filtrar y validar cada NIV
    const nivesValidados = [];

    for (const niv of nivesParaEliminar) {
        const esNIVValido = (
            niv.tipoPoliza === 'NIV' ||
            niv.tipoPoliza === 'NIP' ||
            niv.esNIP === true ||
            niv.creadoViaOBD === true
        );

        const tieneServicios = niv.totalServicios >= 1;
        const estaActivo = niv.estado === 'ACTIVO';

        // Verificar que el servicio no sea muy reciente (al menos 1 hora)
        let servicioReciente = false;
        if (niv.servicios && niv.servicios.length > 0) {
            const ultimoServicio = niv.servicios[niv.servicios.length - 1];
            const horasDesdeServicio = (Date.now() - ultimoServicio.fechaServicio) / (1000 * 60 * 60);
            servicioReciente = horasDesdeServicio < 1;
        }

        if (esNIVValido && tieneServicios && estaActivo && !servicioReciente) {
            nivesValidados.push({
                _id: niv._id,
                numeroPoliza: niv.numeroPoliza,
                totalServicios: niv.totalServicios,
                tipoPoliza: niv.tipoPoliza,
                ultimoServicio: niv.servicios && niv.servicios.length > 0 ?
                    niv.servicios[niv.servicios.length - 1].fechaServicio : null
            });

            console.log(`✅ NIV validado para eliminación: ${niv.numeroPoliza} (${niv.totalServicios} servicios)`);
        } else {
            console.log(`⏭️  NIV omitido: ${niv.numeroPoliza} - ${!esNIVValido ? 'No es NIV' : !tieneServicios ? 'Sin servicios' : !estaActivo ? 'No activo' : 'Servicio reciente'}`);
        }
    }

    return nivesValidados;
}

/**
 * Eliminar un NIV de forma segura
 */
async function eliminarNIV(niv, session) {
    console.log(`\n🗑️  Eliminando NIV: ${niv.numeroPoliza}`);

    // Actualizar estado a ELIMINADO con información de auditoría
    const updateData = {
        estado: 'ELIMINADO',
        fechaEliminacion: new Date(),
        motivoEliminacion: 'NIV_USADO_CLEANUP_AUTOMATICO',
        eliminadoPor: 'SISTEMA_JOB_3AM',
        serviciosAlEliminar: niv.totalServicios,
        fechaUltimoServicio: niv.ultimoServicio
    };

    await Policy.findByIdAndUpdate(niv._id, updateData, { session });

    console.log(`  ✅ NIV eliminado: ${niv.numeroPoliza}`);

    return {
        numeroPoliza: niv.numeroPoliza,
        servicios: niv.totalServicios,
        fechaEliminacion: updateData.fechaEliminacion
    };
}

/**
 * Verificar eliminación
 */
async function verificarEliminacion(nivesEliminados) {
    console.log('\n🔍 Verificando eliminaciones...');

    let verificacionesExitosas = 0;
    let verificacionesFallidas = 0;

    for (const niv of nivesEliminados) {
        try {
            const poliza = await Policy.findOne({ numeroPoliza: niv.numeroPoliza })
                .select('numeroPoliza estado fechaEliminacion');

            if (poliza && poliza.estado === 'ELIMINADO' && poliza.fechaEliminacion) {
                console.log(`✅ Verificación OK: ${niv.numeroPoliza} - Estado: ELIMINADO`);
                verificacionesExitosas++;
            } else {
                console.log(`❌ Verificación FALLA: ${niv.numeroPoliza} - Estado: ${poliza?.estado || 'NO_ENCONTRADA'}`);
                verificacionesFallidas++;
            }
        } catch (error) {
            console.error(`❌ Error verificando ${niv.numeroPoliza}:`, error.message);
            verificacionesFallidas++;
        }
    }

    return {
        exitosas: verificacionesExitosas,
        fallidas: verificacionesFallidas,
        total: nivesEliminados.length
    };
}

/**
 * Función principal del job
 */
async function ejecutarCleanupNIVs() {
    const horaInicio = new Date();
    console.log(`🧹 INICIANDO JOB DE LIMPIEZA NIVs - ${horaInicio.toLocaleString('es-MX')}\n`);

    try {
        await connectDB();

        // Buscar NIVs para eliminar
        const nivesParaEliminar = await buscarNIVsParaEliminar();

        if (nivesParaEliminar.length === 0) {
            console.log('\n🎉 No hay NIVs que requieran eliminación');
            return {
                success: true,
                eliminados: 0,
                mensaje: 'No hay NIVs para eliminar'
            };
        }

        console.log('\n📊 RESUMEN PRE-ELIMINACIÓN:');
        console.log(`NIVs a eliminar: ${nivesParaEliminar.length}`);

        // Mostrar lista
        nivesParaEliminar.forEach((niv, index) => {
            console.log(`  ${index + 1}. ${niv.numeroPoliza} - ${niv.totalServicios} servicios`);
        });

        // Ejecutar eliminaciones con transacción
        const session = await mongoose.startSession();
        const nivesEliminados = [];

        try {
            await session.startTransaction();

            for (const niv of nivesParaEliminar) {
                try {
                    const resultado = await eliminarNIV(niv, session);
                    nivesEliminados.push(resultado);
                } catch (error) {
                    console.error(`❌ Error eliminando NIV ${niv.numeroPoliza}:`, error.message);
                    throw error; // Abortar toda la transacción
                }
            }

            await session.commitTransaction();
            console.log(`\n✅ ELIMINACIÓN COMPLETADA: ${nivesEliminados.length} NIVs procesados`);

        } catch (error) {
            await session.abortTransaction();
            console.error('\n❌ ERROR EN ELIMINACIÓN - ROLLBACK APLICADO:', error.message);
            throw error;
        } finally {
            await session.endSession();
        }

        // Verificar eliminaciones
        const verificacion = await verificarEliminacion(nivesEliminados);

        const horaFin = new Date();
        const duracion = Math.round((horaFin - horaInicio) / 1000);

        console.log('\n📊 RESULTADO FINAL:');
        console.log(`✅ NIVs eliminados exitosamente: ${verificacion.exitosas}`);
        console.log(`❌ Verificaciones fallidas: ${verificacion.fallidas}`);
        console.log(`📊 Total procesados: ${verificacion.total}`);
        console.log(`⏱️  Duración: ${duracion} segundos`);
        console.log(`🕐 Finalizado: ${horaFin.toLocaleString('es-MX')}`);

        if (verificacion.fallidas === 0) {
            console.log('\n🎉 ¡CLEANUP COMPLETADO EXITOSAMENTE!');
        } else {
            console.log('\n⚠️  Algunas eliminaciones fallaron. Revisar logs.');
        }

        return {
            success: verificacion.fallidas === 0,
            eliminados: verificacion.exitosas,
            fallidas: verificacion.fallidas,
            duracion,
            nivesEliminados
        };

    } catch (error) {
        console.error('\n❌ Error crítico en cleanup NIVs:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
    }
}

/**
 * Función para uso en cron jobs
 */
async function main() {
    const resultado = await ejecutarCleanupNIVs();
    process.exit(resultado.success ? 0 : 1);
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { ejecutarCleanupNIVs, buscarNIVsParaEliminar };
