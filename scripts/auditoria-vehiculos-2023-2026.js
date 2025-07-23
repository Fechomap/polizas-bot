// scripts/auditoria-vehiculos-2023-2026.js
// Auditoría sistemática de vehículos 2023-2026 que deberían ser NIVs
require('dotenv').config();
const mongoose = require('mongoose');

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

async function auditoriaVehiculos2023_2026() {
    console.log('🔍 AUDITORÍA SISTEMÁTICA - VEHÍCULOS 2023-2026');
    console.log('═'.repeat(80));
    console.log('🎯 Objetivo: Identificar vehículos que deberían ser NIVs');
    console.log('📅 Rango: Años 2023, 2024, 2025, 2026');
    console.log('');

    try {
        const conectado = await connectDB();
        if (!conectado) {
            console.log('❌ No se pudo conectar a la base de datos');
            return;
        }

        console.log('📋 1. BÚSQUEDA DE VEHÍCULOS 2023-2026:');
        console.log('-'.repeat(60));

        // Buscar TODOS los vehículos de los años objetivo
        const vehiculosObjetivo = await Vehicle.find({
            año: { $in: [2023, 2024, 2025, 2026] }
        }).lean();

        console.log(`📊 VEHÍCULOS ENCONTRADOS: ${vehiculosObjetivo.length}`);

        if (vehiculosObjetivo.length === 0) {
            console.log('❌ No se encontraron vehículos 2023-2026');
            return;
        }

        // Agrupar por año para mejor análisis
        const vehiculosPorAño = {
            2023: vehiculosObjetivo.filter(v => v.año === 2023),
            2024: vehiculosObjetivo.filter(v => v.año === 2024),
            2025: vehiculosObjetivo.filter(v => v.año === 2025),
            2026: vehiculosObjetivo.filter(v => v.año === 2026)
        };

        console.log('📊 DISTRIBUCIÓN POR AÑO:');
        Object.entries(vehiculosPorAño).forEach(([año, vehiculos]) => {
            console.log(`   • ${año}: ${vehiculos.length} vehículos`);
        });

        console.log('\n📋 2. ANÁLISIS DETALLADO POR VEHÍCULO:');
        console.log('-'.repeat(60));

        const contadores = {
            total: 0,
            deberianSerNIV: 0,
            yaSonNIV: 0,
            yaSonNIP: 0,
            vehiculosNormales: 0,
            conPoliza: 0,
            sinPoliza: 0,
            eliminados: 0,
            inconsistencias: 0
        };

        const problemas = [];
        const migracionesPendientes = [];

        for (const vehiculo of vehiculosObjetivo) {
            contadores.total++;

            console.log(`\n🚗 ${contadores.total}. ${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}`);
            console.log(`   • Serie: ${vehiculo.serie}`);
            console.log(`   • Estado: ${vehiculo.estado}`);
            console.log(`   • PolicyId: ${vehiculo.policyId || 'null'}`);
            console.log(`   • Creado: ${vehiculo.createdAt}`);
            console.log(`   • Actualizado: ${vehiculo.updatedAt}`);

            // Categorizar estado del vehículo
            let categoriaVehiculo = '';
            if (vehiculo.estado === 'ELIMINADO') {
                contadores.eliminados++;
                categoriaVehiculo = 'ELIMINADO';
            } else if (vehiculo.estado === 'CONVERTIDO_NIV') {
                contadores.yaSonNIV++;
                categoriaVehiculo = 'YA_ES_NIV';
            } else if (vehiculo.estado === 'CONVERTIDO_NIP') {
                contadores.yaSonNIP++;
                categoriaVehiculo = 'YA_ES_NIP_ANTIGUO';
            } else if (vehiculo.estado === 'CON_POLIZA') {
                contadores.conPoliza++;
                categoriaVehiculo = 'VEHICULO_NORMAL_CON_POLIZA';
            } else if (vehiculo.estado === 'SIN_POLIZA') {
                contadores.sinPoliza++;
                categoriaVehiculo = 'VEHICULO_NORMAL_SIN_POLIZA';
            } else {
                categoriaVehiculo = `ESTADO_DESCONOCIDO_${vehiculo.estado}`;
            }

            console.log(`   📊 Categoría: ${categoriaVehiculo}`);

            // Analizar póliza asociada si existe
            let polizaAsociada = null;
            if (vehiculo.policyId) {
                try {
                    polizaAsociada = await Policy.findById(vehiculo.policyId).lean();
                    if (polizaAsociada) {
                        console.log(`   🔗 Póliza: ${polizaAsociada.numeroPoliza}`);
                        console.log(`   🔗 TipoPoliza: ${polizaAsociada.tipoPoliza || 'REGULAR'}`);
                        console.log(`   🔗 Estado: ${polizaAsociada.estado}`);
                        console.log(`   🔗 TotalServicios: ${polizaAsociada.totalServicios || 0}`);
                    } else {
                        console.log(`   🚨 Póliza ${vehiculo.policyId} no encontrada`);
                        problemas.push({
                            tipo: 'POLIZA_NO_ENCONTRADA',
                            vehiculo: vehiculo.serie,
                            policyId: vehiculo.policyId
                        });
                    }
                } catch (error) {
                    console.log(`   🚨 Error buscando póliza: ${error.message}`);
                }
            }

            // Determinar si DEBERÍA ser NIV
            const deberiaSerNIV = vehiculo.año >= 2023 && vehiculo.año <= 2026;

            if (deberiaSerNIV) {
                contadores.deberianSerNIV++;

                // Verificar si ya está correctamente configurado
                let estadoCorrectoNIV = false;
                let estadoCorrectoPoliza = false;

                if (vehiculo.estado === 'CONVERTIDO_NIV' || vehiculo.estado === 'CONVERTIDO_NIP') {
                    estadoCorrectoNIV = true;
                }

                if (polizaAsociada && (polizaAsociada.tipoPoliza === 'NIV' || polizaAsociada.tipoPoliza === 'NIP')) {
                    estadoCorrectoPoliza = true;
                }

                console.log('   🎯 DEBERÍA SER NIV: SÍ');
                console.log(`   ✅ Estado vehículo correcto: ${estadoCorrectoNIV ? 'SÍ' : 'NO'}`);
                console.log(`   ✅ Estado póliza correcto: ${estadoCorrectoPoliza ? 'SÍ' : 'NO'}`);

                // Detectar casos que necesitan migración
                if (!estadoCorrectoNIV || !estadoCorrectoPoliza) {
                    console.log('   🔄 REQUIERE MIGRACIÓN');

                    const migracion = {
                        vehiculo: {
                            serie: vehiculo.serie,
                            marca: vehiculo.marca,
                            submarca: vehiculo.submarca,
                            año: vehiculo.año,
                            estadoActual: vehiculo.estado,
                            estadoDeseado: vehiculo.estado === 'CONVERTIDO_NIP' ? 'CONVERTIDO_NIV' : 'CONVERTIDO_NIV'
                        },
                        poliza: polizaAsociada ? {
                            numeroPoliza: polizaAsociada.numeroPoliza,
                            tipoActual: polizaAsociada.tipoPoliza || 'REGULAR',
                            tipoDeseado: 'NIV'
                        } : null,
                        acciones: []
                    };

                    // Determinar acciones específicas
                    if (vehiculo.estado !== 'CONVERTIDO_NIV' && vehiculo.estado !== 'CONVERTIDO_NIP') {
                        migracion.acciones.push('CONVERTIR_VEHICULO_A_NIV');
                    } else if (vehiculo.estado === 'CONVERTIDO_NIP') {
                        migracion.acciones.push('ACTUALIZAR_TERMINOLOGIA_VEHICULO_NIP_TO_NIV');
                    }

                    if (!polizaAsociada) {
                        migracion.acciones.push('CREAR_POLIZA_NIV');
                    } else if (polizaAsociada.tipoPoliza !== 'NIV' && polizaAsociada.tipoPoliza !== 'NIP') {
                        migracion.acciones.push('CONVERTIR_POLIZA_A_NIV');
                    } else if (polizaAsociada.tipoPoliza === 'NIP') {
                        migracion.acciones.push('ACTUALIZAR_TERMINOLOGIA_POLIZA_NIP_TO_NIV');
                    }

                    migracionesPendientes.push(migracion);
                }

                // Detectar inconsistencias específicas
                if (vehiculo.estado === 'CONVERTIDO_NIV' && polizaAsociada && polizaAsociada.tipoPoliza === 'NIP') {
                    contadores.inconsistencias++;
                    problemas.push({
                        tipo: 'INCONSISTENCIA_VEHICULO_NIV_POLIZA_NIP',
                        vehiculo: vehiculo.serie,
                        poliza: polizaAsociada.numeroPoliza
                    });
                    console.log('   🚨 INCONSISTENCIA: Vehículo es NIV pero póliza es NIP');
                }

                if (vehiculo.estado === 'CONVERTIDO_NIP' && polizaAsociada && polizaAsociada.tipoPoliza === 'NIV') {
                    contadores.inconsistencias++;
                    problemas.push({
                        tipo: 'INCONSISTENCIA_VEHICULO_NIP_POLIZA_NIV',
                        vehiculo: vehiculo.serie,
                        poliza: polizaAsociada.numeroPoliza
                    });
                    console.log('   🚨 INCONSISTENCIA: Vehículo es NIP pero póliza es NIV');
                }
            } else {
                console.log('   🎯 DEBERÍA SER NIV: NO (año fuera de rango)');
            }
        }

        console.log('\n📋 3. RESUMEN ESTADÍSTICO:');
        console.log('═'.repeat(80));
        console.log('📊 TOTALES:');
        console.log(`   • Vehículos analizados: ${contadores.total}`);
        console.log(`   • Deberían ser NIV: ${contadores.deberianSerNIV}`);
        console.log(`   • Ya son NIV (nuevo): ${contadores.yaSonNIV}`);
        console.log(`   • Ya son NIP (antiguo): ${contadores.yaSonNIP}`);
        console.log(`   • Vehículos normales con póliza: ${contadores.conPoliza}`);
        console.log(`   • Vehículos normales sin póliza: ${contadores.sinPoliza}`);
        console.log(`   • Eliminados: ${contadores.eliminados}`);
        console.log(`   • Inconsistencias detectadas: ${contadores.inconsistencias}`);

        console.log('\n📋 4. PROBLEMAS DETECTADOS:');
        console.log('-'.repeat(60));
        if (problemas.length === 0) {
            console.log('✅ No se detectaron problemas críticos');
        } else {
            problemas.forEach((problema, index) => {
                console.log(`${index + 1}. ${problema.tipo}`);
                console.log(`   Vehículo: ${problema.vehiculo}`);
                if (problema.poliza) console.log(`   Póliza: ${problema.poliza}`);
                if (problema.policyId) console.log(`   PolicyId: ${problema.policyId}`);
            });
        }

        console.log('\n📋 5. PLAN DE MIGRACIÓN:');
        console.log('═'.repeat(80));
        console.log(`🔄 VEHÍCULOS QUE REQUIEREN MIGRACIÓN: ${migracionesPendientes.length}`);

        if (migracionesPendientes.length === 0) {
            console.log('✅ Todos los vehículos 2023-2026 están correctamente configurados como NIVs');
        } else {
            console.log('\n📋 ACCIONES REQUERIDAS:');

            const accionesPorTipo = {};
            migracionesPendientes.forEach(migracion => {
                migracion.acciones.forEach(accion => {
                    if (!accionesPorTipo[accion]) {
                        accionesPorTipo[accion] = 0;
                    }
                    accionesPorTipo[accion]++;
                });
            });

            Object.entries(accionesPorTipo).forEach(([accion, cantidad]) => {
                console.log(`   • ${accion}: ${cantidad} casos`);
            });

            console.log('\n📋 CASOS ESPECÍFICOS DE MIGRACIÓN:');
            migracionesPendientes.forEach((migracion, index) => {
                console.log(`\n${index + 1}. ${migracion.vehiculo.serie} (${migracion.vehiculo.marca} ${migracion.vehiculo.año})`);
                console.log(`   Estado actual: ${migracion.vehiculo.estadoActual}`);
                console.log(`   Estado deseado: ${migracion.vehiculo.estadoDeseado}`);
                if (migracion.poliza) {
                    console.log(`   Póliza: ${migracion.poliza.numeroPoliza} (${migracion.poliza.tipoActual} → ${migracion.poliza.tipoDeseado})`);
                }
                console.log(`   Acciones: ${migracion.acciones.join(', ')}`);
            });
        }

        console.log('\n📋 6. RECOMENDACIONES:');
        console.log('═'.repeat(80));

        if (migracionesPendientes.length > 0) {
            console.log('💡 ACCIONES RECOMENDADAS:');
            console.log('   1. 🔄 Crear script de migración automática');
            console.log('   2. 🧪 Probar migración en entorno de desarrollo primero');
            console.log('   3. 📊 Hacer backup de datos antes de migración');
            console.log('   4. ✅ Verificar integridad post-migración');
            console.log('   5. 🔍 Monitorear reportes después de la migración');

            console.log('\n🚨 PRIORIDADES:');
            const vehiculosConPoliza = migracionesPendientes.filter(m => m.poliza);
            const vehiculosSinPoliza = migracionesPendientes.filter(m => !m.poliza);

            console.log(`   • ALTA: ${vehiculosConPoliza.length} vehículos con póliza que necesitan actualización`);
            console.log(`   • MEDIA: ${vehiculosSinPoliza.length} vehículos sin póliza que necesitan conversión completa`);
        } else {
            console.log('✅ SISTEMA COHERENTE: Todos los vehículos están correctamente configurados');
        }

        // Caso específico Journey
        const journeyEnMigracion = migracionesPendientes.find(m => m.vehiculo.serie === 'LMWDT1G89P1141436');
        if (journeyEnMigracion) {
            console.log('\n🎯 CASO ESPECÍFICO - JOURNEY:');
            console.log('   • Confirmado en lista de migración');
            console.log(`   • Acciones: ${journeyEnMigracion.acciones.join(', ')}`);
            console.log('   • Esta es la causa del fallo de reportes reportado');
        }

    } catch (error) {
        console.error('❌ Error en auditoría:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión cerrada');
        process.exit(0);
    }
}

auditoriaVehiculos2023_2026().catch(console.error);
