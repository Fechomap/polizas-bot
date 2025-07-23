// scripts/investigar-fallo-reportes-15h.js
// Investigación específica del fallo de reportes entre 15:01 y 15:08
require('dotenv').config();
const mongoose = require('mongoose');

const SERIE_JOURNEY = 'LMWDT1G89P1141436';

// Esquemas flexibles para investigación
const VehicleSchema = new mongoose.Schema({}, { strict: false });
const PolicySchema = new mongoose.Schema({}, { strict: false });
const Vehicle = mongoose.model('Vehicle', VehicleSchema);
const Policy = mongoose.model('Policy', PolicySchema);

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            console.log('❌ MONGO_URI no está definida');
            return false;
        }
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
        return true;
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error.message);
        return false;
    }
};

async function investigarFalloReportes() {
    console.log('🔍 INVESTIGACIÓN FALLO DE REPORTES - 15:01 vs 15:08');
    console.log('═'.repeat(80));
    console.log('📅 Problema: Reporte funcionó a las 15:01, falló a las 15:08');
    console.log('🚗 NIV Journey LMWDT1G89P1141436 desapareció del reporte');
    console.log('');

    try {
        const conectado = await connectDB();
        if (!conectado) {
            console.log('❌ No se pudo conectar a la base de datos');
            return;
        }

        console.log('📋 1. ESTADO ACTUAL DE LA PÓLIZA JOURNEY NIV:');
        console.log('-'.repeat(60));

        // Buscar póliza Journey específica
        const polizaJourney = await Policy.findOne({
            numeroPoliza: SERIE_JOURNEY
        }).lean();

        if (!polizaJourney) {
            console.log('❌ PÓLIZA JOURNEY NO ENCONTRADA');
            console.log('🚨 POSIBLE CAUSA: La póliza fue eliminada o modificada');
        } else {
            console.log('✅ PÓLIZA JOURNEY ENCONTRADA:');
            console.log(`   • _id: ${polizaJourney._id}`);
            console.log(`   • numeroPoliza: ${polizaJourney.numeroPoliza}`);
            console.log(`   • estado: ${polizaJourney.estado}`);
            console.log(`   • tipoPoliza: ${polizaJourney.tipoPoliza}`);
            console.log(`   • esNIV: ${polizaJourney.esNIV}`);
            console.log(`   • totalServicios: ${polizaJourney.totalServicios}`);
            console.log(`   • servicioCounter: ${polizaJourney.servicioCounter}`);
            console.log(`   • fechaCreacion: ${polizaJourney.createdAt}`);
            console.log(`   • fechaActualización: ${polizaJourney.updatedAt}`);

            if (polizaJourney.fechaEliminacion) {
                console.log(`   🚨 fechaEliminacion: ${polizaJourney.fechaEliminacion}`);
                console.log(`   🚨 motivoEliminacion: ${polizaJourney.motivoEliminacion}`);
            }

            // Revisar servicios específicos
            if (polizaJourney.servicios && polizaJourney.servicios.length > 0) {
                console.log(`   📊 SERVICIOS REGISTRADOS (${polizaJourney.servicios.length}):`);
                polizaJourney.servicios.forEach((servicio, index) => {
                    console.log(`      ${index + 1}. Servicio #${servicio.numeroServicio}`);
                    console.log(`         • Fecha: ${servicio.fechaServicio || 'No definida'}`);
                    console.log(`         • Costo: $${servicio.costo || 0}`);
                    console.log(`         • Expediente: ${servicio.numeroExpediente || 'N/A'}`);
                });
            }
        }

        console.log('\n📋 2. SIMULACIÓN DEL QUERY DE REPORTES:');
        console.log('-'.repeat(60));

        // Simular exactamente el query que usa getOldUnusedPolicies para NIVs
        const queryNIVs = {
            estado: 'ACTIVO',
            tipoPoliza: 'NIV',
            totalServicios: 0
        };

        console.log('🔍 Query utilizado para NIVs:');
        console.log(`   ${JSON.stringify(queryNIVs, null, 2)}`);

        const nivsEncontrados = await Policy.find(queryNIVs)
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

        console.log(`\n📊 RESULTADO: ${nivsEncontrados.length} NIVs encontrados`);

        if (nivsEncontrados.length === 0) {
            console.log('❌ NO SE ENCONTRARON NIVs - EXPLICACIÓN DEL FALLO');
        } else {
            nivsEncontrados.forEach((niv, index) => {
                console.log(`\n   ${index + 1}. NIV: ${niv.numeroPoliza}`);
                console.log(`      • Estado: ${niv.estado}`);
                console.log(`      • TipoPoliza: ${niv.tipoPoliza}`);
                console.log(`      • TotalServicios: ${niv.totalServicios}`);
                console.log(`      • Marca: ${niv.marca} ${niv.submarca} ${niv.año}`);
                console.log(`      • Creado: ${niv.createdAt}`);

                if (niv.numeroPoliza === SERIE_JOURNEY) {
                    console.log('      🎯 ¡ESTE ES EL JOURNEY!');
                }
            });
        }

        console.log('\n📋 3. ANÁLISIS DETALLADO DE CAMPOS CRÍTICOS:');
        console.log('-'.repeat(60));

        if (polizaJourney) {
            // Verificar cada condición del query individualmente
            const condiciones = {
                'estado === "ACTIVO"': polizaJourney.estado === 'ACTIVO',
                'tipoPoliza === "NIV"': polizaJourney.tipoPoliza === 'NIV',
                'totalServicios === 0': polizaJourney.totalServicios === 0,
                'servicios.length === 0': !polizaJourney.servicios || polizaJourney.servicios.length === 0
            };

            console.log('🧪 VERIFICACIÓN DE CONDICIONES:');
            Object.entries(condiciones).forEach(([condicion, cumple]) => {
                const estado = cumple ? '✅' : '❌';
                console.log(`   ${estado} ${condicion}: ${cumple}`);
            });

            // Detectar la condición que está fallando
            const condicionFallida = Object.entries(condiciones).find(([_, cumple]) => !cumple);
            if (condicionFallida) {
                console.log(`\n🚨 CONDICIÓN FALLIDA: ${condicionFallida[0]}`);
                console.log('   Esta es la razón por la cual el NIV no aparece en reportes');
            } else {
                console.log('\n✅ Todas las condiciones se cumplen - debería aparecer en reportes');
            }
        }

        console.log('\n📋 4. INVESTIGACIÓN DE CAMBIOS RECIENTES:');
        console.log('-'.repeat(60));

        // Buscar todas las pólizas que fueron actualizadas hoy
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const polizasModificadasHoy = await Policy.find({
            updatedAt: { $gte: hoy }
        }).lean();

        console.log(`📊 Pólizas modificadas hoy: ${polizasModificadasHoy.length}`);

        // Filtrar las que están relacionadas con Journey o son NIVs
        const polizasRelevantes = polizasModificadasHoy.filter(p =>
            p.numeroPoliza === SERIE_JOURNEY || p.tipoPoliza === 'NIV'
        );

        if (polizasRelevantes.length > 0) {
            console.log('\n🎯 PÓLIZAS RELEVANTES MODIFICADAS HOY:');
            polizasRelevantes.forEach((pol, index) => {
                console.log(`\n   ${index + 1}. ${pol.numeroPoliza} (${pol.tipoPoliza || 'REGULAR'})`);
                console.log(`      • Estado: ${pol.estado}`);
                console.log(`      • TotalServicios: ${pol.totalServicios}`);
                console.log(`      • Actualizado: ${pol.updatedAt}`);

                if (pol.fechaEliminacion) {
                    console.log(`      🚨 Eliminado: ${pol.fechaEliminacion}`);
                    console.log(`      🚨 Motivo: ${pol.motivoEliminacion}`);
                }
            });
        }

        console.log('\n📋 5. DIAGNÓSTICO FINAL:');
        console.log('═'.repeat(80));

        if (!polizaJourney) {
            console.log('🚨 DIAGNÓSTICO: PÓLIZA ELIMINADA');
            console.log('   La póliza Journey fue completamente eliminada de la base de datos');
            console.log('   Esto explicaría por qué no aparece en reportes posteriores');
        } else if (polizaJourney.estado !== 'ACTIVO') {
            console.log('🚨 DIAGNÓSTICO: PÓLIZA INACTIVA');
            console.log(`   La póliza está marcada como: ${polizaJourney.estado}`);
            console.log('   Solo las pólizas ACTIVAS aparecen en reportes');
        } else if (polizaJourney.totalServicios > 0) {
            console.log('🚨 DIAGNÓSTICO: NIV CONSUMIDO');
            console.log(`   La póliza tiene ${polizaJourney.totalServicios} servicio(s) registrado(s)`);
            console.log('   Los NIVs con servicios no aparecen en reportes (están consumidos)');
            console.log('   Esto indica que el NIV fue utilizado entre las 15:01 y 15:08');
        } else if (polizaJourney.tipoPoliza !== 'NIV') {
            console.log('🚨 DIAGNÓSTICO: TIPO DE PÓLIZA CAMBIADO');
            console.log(`   La póliza ya no es tipo NIV, es: ${polizaJourney.tipoPoliza}`);
        } else {
            console.log('❓ DIAGNÓSTICO: CONDICIONES SE CUMPLEN PERO NO APARECE');
            console.log('   Esto requiere investigación adicional de la lógica del query');
        }

        console.log('\n🎯 RECOMENDACIONES:');
        if (polizaJourney && polizaJourney.totalServicios > 0) {
            console.log('1. ✅ Comportamiento normal: NIV fue utilizado (consumido)');
            console.log('2. 🔍 Revisar logs de servicios para confirmar cuándo fue asignado');
            console.log('3. 📊 Verificar si la eliminación automática post-consumo funcionó');
        } else {
            console.log('1. 🚨 Investigar por qué la póliza cambió de estado');
            console.log('2. 🔍 Revisar logs del sistema para identificar qué proceso la modificó');
            console.log('3. 📊 Verificar integridad de otros NIVs en el sistema');
        }

    } catch (error) {
        console.error('❌ Error en investigación:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión cerrada');
        process.exit(0);
    }
}

investigarFalloReportes().catch(console.error);
