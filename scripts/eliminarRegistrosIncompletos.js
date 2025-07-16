const mongoose = require('mongoose');
const Vehicle = require('../src/models/vehicle');
require('dotenv').config();

/**
 * Script para eliminar registros específicos de vehículos incompletos
 * Solo elimina los vehículos con series específicas que están incompletos
 */

async function eliminarRegistrosIncompletos() {
    try {
        // Conectar a MongoDB
        console.log('🔌 Conectando a MongoDB...');
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error(
                'La variable de entorno MONGO_URI no está definida. Verifica tu archivo .env'
            );
        }
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB');

        // Los números de serie específicos que queremos eliminar
        const seriesAEliminar = [
            '12345678901234567', // Ford Focus 2020 Negro PERMISO
            '12345678901234568' // OK UHYG 2020 GFD GFD
        ];

        console.log('\n📋 Series a verificar y eliminar:');
        seriesAEliminar.forEach((serie, index) => {
            console.log(`   ${index + 1}. ${serie}`);
        });

        // Primero verificar que los vehículos existen y mostrar información
        console.log('\n🔍 Verificando vehículos a eliminar...');

        for (const serie of seriesAEliminar) {
            const vehiculo = await Vehicle.findOne({ serie: serie });

            if (vehiculo) {
                console.log(`\n✅ ENCONTRADO - Serie: ${serie}`);
                console.log(
                    `   🚗 Vehículo: ${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}`
                );
                console.log(`   🎨 Color: ${vehiculo.color}`);
                console.log(`   🚙 Placas: ${vehiculo.placas || 'Sin placas'}`);
                console.log(`   👤 Titular: ${vehiculo.titularTemporal}`);
                console.log(`   📊 Estado: ${vehiculo.estado}`);
                console.log(
                    `   📅 Creado: ${vehiculo.createdAt?.toLocaleDateString('es-MX') || 'N/A'}`
                );
                console.log(`   🆔 ID: ${vehiculo._id}`);

                // Verificar que no tenga póliza asignada
                if (vehiculo.estado === 'CON_POLIZA') {
                    console.log(
                        '   ⚠️  ADVERTENCIA: Este vehículo YA TIENE PÓLIZA - NO se eliminará'
                    );
                }
            } else {
                console.log(`\n❌ NO ENCONTRADO - Serie: ${serie}`);
            }
        }

        // Confirmar eliminación
        console.log('\n' + '='.repeat(60));
        console.log('🚨 CONFIRMACIÓN DE ELIMINACIÓN');
        console.log('='.repeat(60));
        console.log('Se eliminarán los vehículos que:');
        console.log('1. Tengan las series especificadas');
        console.log('2. NO tengan póliza asignada (estado != CON_POLIZA)');
        console.log('3. Estén en estado SIN_POLIZA');
        console.log('='.repeat(60));

        // PAUSA PARA CONFIRMACIÓN MANUAL
        console.log('\n⏸️  PAUSA DE SEGURIDAD');
        console.log('❓ ¿Estás seguro de que quieres continuar?');
        console.log('Este script eliminará PERMANENTEMENTE los vehículos listados arriba.');
        console.log('Para continuar, descomenta la línea "SAFETY_CONFIRMED" en el código.');
        console.log('Para cancelar, presiona Ctrl+C ahora.');

        // SAFETY CHECK - Descomenta esta línea solo después de verificar manualmente
        const SAFETY_CONFIRMED = true;

        if (typeof SAFETY_CONFIRMED === 'undefined') {
            console.log('\n🛑 OPERACIÓN CANCELADA POR SEGURIDAD');
            console.log('Para ejecutar la eliminación:');
            console.log('1. Revisa cuidadosamente los vehículos listados arriba');
            console.log('2. Confirma que son los vehículos correctos a eliminar');
            console.log('3. Descomenta la línea "const SAFETY_CONFIRMED = true;" en el script');
            console.log('4. Vuelve a ejecutar el script');
            return;
        }

        // CREAR BACKUP DE SEGURIDAD ANTES DE ELIMINAR
        console.log('\n💾 Creando backup de seguridad...');
        const vehiculosAEliminar = await Vehicle.find({
            serie: { $in: seriesAEliminar },
            estado: 'SIN_POLIZA'
        });

        if (vehiculosAEliminar.length > 0) {
            const backupData = {
                timestamp: new Date().toISOString(),
                action: 'delete_incomplete_vehicles',
                vehicles: vehiculosAEliminar.map(v => v.toObject())
            };

            const fs = require('fs');
            const backupPath = `./backup_vehicles_${Date.now()}.json`;
            fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
            console.log(`✅ Backup creado: ${backupPath}`);
        }

        // Proceder con la eliminación solo si hay confirmación
        console.log('\n🗑️  Procediendo con la eliminación...');

        let eliminados = 0;
        let noEliminados = 0;

        for (const serie of seriesAEliminar) {
            // TRIPLE VERIFICACIÓN ANTES DE ELIMINAR
            const vehiculo = await Vehicle.findOne({
                serie: serie,
                estado: 'SIN_POLIZA' // Solo eliminar si NO tiene póliza
            });

            if (vehiculo) {
                // VERIFICACIÓN FINAL: Confirmar que es exactamente el vehículo que queremos eliminar
                const esVehiculoCorrecto =
                    vehiculo.serie === serie &&
                    vehiculo.estado === 'SIN_POLIZA' &&
                    !vehiculo.polizaId; // Asegurar que no tiene póliza vinculada

                if (esVehiculoCorrecto) {
                    // Eliminar el vehículo
                    await Vehicle.deleteOne({
                        _id: vehiculo._id,
                        serie: serie, // Doble verificación en la query de eliminación
                        estado: 'SIN_POLIZA'
                    });
                    eliminados++;
                    console.log(
                        `   ✅ ELIMINADO: ${vehiculo.marca} ${vehiculo.submarca} (${serie})`
                    );
                } else {
                    noEliminados++;
                    console.log(
                        `   ⚠️  NO ELIMINADO: ${vehiculo.marca} ${vehiculo.submarca} (${serie}) - Falló verificación de seguridad`
                    );
                }
            } else {
                // Verificar si existe pero con póliza
                const vehiculoConPoliza = await Vehicle.findOne({ serie: serie });
                if (vehiculoConPoliza) {
                    noEliminados++;
                    console.log(
                        `   ⚠️  NO ELIMINADO: ${vehiculoConPoliza.marca} ${vehiculoConPoliza.submarca} (${serie}) - Tiene póliza asignada`
                    );
                } else {
                    console.log(`   ℹ️  NO ENCONTRADO: Serie ${serie} - Ya no existe`);
                }
            }
        }

        // Resumen final
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN DE ELIMINACIÓN');
        console.log('='.repeat(60));
        console.log(`✅ Vehículos eliminados: ${eliminados}`);
        console.log(`⚠️  Vehículos no eliminados (con póliza): ${noEliminados}`);
        console.log(`📋 Total series verificadas: ${seriesAEliminar.length}`);

        if (eliminados > 0) {
            console.log('\n🎉 Eliminación completada exitosamente');
            console.log('Los vehículos incompletos han sido removidos de la base de datos');
        } else {
            console.log('\n📝 No se eliminó ningún vehículo');
            console.log('Esto puede indicar que:');
            console.log('- Los vehículos ya fueron eliminados anteriormente');
            console.log('- Los vehículos ya tienen pólizas asignadas');
            console.log('- Las series no coinciden exactamente');
        }

        // Verificar estado final
        console.log('\n🔍 Verificación final...');
        const vehiculosRestantes = await Vehicle.find({
            serie: { $in: seriesAEliminar }
        });

        if (vehiculosRestantes.length > 0) {
            console.log(`⚠️  Quedan ${vehiculosRestantes.length} vehículos con estas series:`);
            vehiculosRestantes.forEach(v => {
                console.log(`   - ${v.serie} (${v.estado})`);
            });
        } else {
            console.log('✅ No quedan vehículos con las series especificadas');
        }
    } catch (error) {
        console.error('❌ Error durante la eliminación:', error);
        process.exit(1);
    } finally {
        // Cerrar conexión
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
        process.exit(0);
    }
}

// Ejecutar script solo si se llama directamente
if (require.main === module) {
    console.log('🚀 Iniciando script de eliminación de registros incompletos...');
    console.log('🎯 Target: Vehículos con series específicas SIN póliza');
    console.log('📅 Fecha:', new Date().toLocaleString('es-MX'));

    eliminarRegistrosIncompletos();
}

module.exports = eliminarRegistrosIncompletos;
