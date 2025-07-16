const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Script de migración para actualizar campos temporales a definitivos
 * Migra de titularTemporal -> titular, rfcTemporal -> rfc, etc.
 */

async function migrarCamposTitular() {
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

        // Obtener la colección de vehículos directamente
        const db = mongoose.connection.db;
        const vehiclesCollection = db.collection('vehicles');

        // Buscar documentos que tengan campos temporales
        console.log('\n🔍 Buscando vehículos con campos temporales...');

        const vehiculosConCamposTemporales = await vehiclesCollection
            .find({
                $or: [
                    { titularTemporal: { $exists: true } },
                    { rfcTemporal: { $exists: true } },
                    { telefonoTemporal: { $exists: true } },
                    { correoTemporal: { $exists: true } },
                    { calleTemporal: { $exists: true } },
                    { coloniaTemporal: { $exists: true } },
                    { municipioTemporal: { $exists: true } },
                    { estadoRegionTemporal: { $exists: true } },
                    { cpTemporal: { $exists: true } }
                ]
            })
            .toArray();

        console.log(`📊 Encontrados ${vehiculosConCamposTemporales.length} vehículos para migrar`);

        if (vehiculosConCamposTemporales.length === 0) {
            console.log('✅ No hay vehículos que migrar. Todos los campos ya están actualizados.');
            return;
        }

        // Mostrar información de los vehículos a migrar
        console.log('\n📋 Vehículos que serán migrados:');
        vehiculosConCamposTemporales.forEach((vehiculo, index) => {
            console.log(
                `   ${index + 1}. Serie: ${vehiculo.serie} - Titular: ${vehiculo.titularTemporal || 'N/A'}`
            );
        });

        console.log('\n🔄 Iniciando migración...');

        let migrados = 0;
        let errores = 0;

        for (const vehiculo of vehiculosConCamposTemporales) {
            try {
                const updateFields = {};
                const unsetFields = {};

                // Mapear campos temporales a definitivos
                if (vehiculo.titularTemporal) {
                    updateFields.titular = vehiculo.titularTemporal;
                    unsetFields.titularTemporal = '';
                }
                if (vehiculo.rfcTemporal) {
                    updateFields.rfc = vehiculo.rfcTemporal;
                    unsetFields.rfcTemporal = '';
                }
                if (vehiculo.telefonoTemporal) {
                    updateFields.telefono = vehiculo.telefonoTemporal;
                    unsetFields.telefonoTemporal = '';
                }
                if (vehiculo.correoTemporal) {
                    updateFields.correo = vehiculo.correoTemporal;
                    unsetFields.correoTemporal = '';
                }
                if (vehiculo.calleTemporal) {
                    updateFields.calle = vehiculo.calleTemporal;
                    unsetFields.calleTemporal = '';
                }
                if (vehiculo.coloniaTemporal) {
                    updateFields.colonia = vehiculo.coloniaTemporal;
                    unsetFields.coloniaTemporal = '';
                }
                if (vehiculo.municipioTemporal) {
                    updateFields.municipio = vehiculo.municipioTemporal;
                    unsetFields.municipioTemporal = '';
                }
                if (vehiculo.estadoRegionTemporal) {
                    updateFields.estadoRegion = vehiculo.estadoRegionTemporal;
                    unsetFields.estadoRegionTemporal = '';
                }
                if (vehiculo.cpTemporal) {
                    updateFields.cp = vehiculo.cpTemporal;
                    unsetFields.cpTemporal = '';
                }

                // Actualizar fecha de modificación
                updateFields.updatedAt = new Date();

                // Ejecutar la actualización
                const updateOperation = {
                    $set: updateFields
                };

                // Solo agregar $unset si hay campos para eliminar
                if (Object.keys(unsetFields).length > 0) {
                    updateOperation.$unset = unsetFields;
                }

                const resultado = await vehiclesCollection.updateOne(
                    { _id: vehiculo._id },
                    updateOperation
                );

                if (resultado.modifiedCount === 1) {
                    migrados++;
                    console.log(
                        `   ✅ Migrado: ${vehiculo.serie} - ${vehiculo.titularTemporal || 'N/A'}`
                    );
                } else {
                    console.log(
                        `   ⚠️  No se modificó: ${vehiculo.serie} - ${vehiculo.titularTemporal || 'N/A'}`
                    );
                }
            } catch (error) {
                errores++;
                console.error(`   ❌ Error migrando ${vehiculo.serie}: ${error.message}`);
            }
        }

        // Resumen final
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN DE MIGRACIÓN');
        console.log('='.repeat(60));
        console.log(`✅ Vehículos migrados exitosamente: ${migrados}`);
        console.log(`❌ Errores durante la migración: ${errores}`);
        console.log(`📋 Total vehículos procesados: ${vehiculosConCamposTemporales.length}`);

        if (migrados > 0) {
            console.log('\n🎉 Migración completada exitosamente');
            console.log('Los campos temporales han sido convertidos a campos definitivos');
        }

        // Verificar que la migración fue exitosa
        console.log('\n🔍 Verificación final...');
        const vehiculosConCamposTemporalesRestantes = await vehiclesCollection
            .find({
                $or: [
                    { titularTemporal: { $exists: true } },
                    { rfcTemporal: { $exists: true } },
                    { telefonoTemporal: { $exists: true } },
                    { correoTemporal: { $exists: true } },
                    { calleTemporal: { $exists: true } },
                    { coloniaTemporal: { $exists: true } },
                    { municipioTemporal: { $exists: true } },
                    { estadoRegionTemporal: { $exists: true } },
                    { cpTemporal: { $exists: true } }
                ]
            })
            .toArray();

        if (vehiculosConCamposTemporalesRestantes.length === 0) {
            console.log('✅ Verificación exitosa: No quedan campos temporales en la base de datos');
        } else {
            console.log(
                `⚠️  Quedan ${vehiculosConCamposTemporalesRestantes.length} vehículos con campos temporales`
            );
        }
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
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
    console.log('🚀 Iniciando migración de campos temporales a definitivos...');
    console.log('🎯 Target: titularTemporal -> titular, rfcTemporal -> rfc, etc.');
    console.log('📅 Fecha:', new Date().toLocaleString('es-MX'));

    migrarCamposTitular();
}

module.exports = migrarCamposTitular;
