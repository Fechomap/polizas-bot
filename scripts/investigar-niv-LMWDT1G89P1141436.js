// scripts/investigar-niv-LMWDT1G89P1141436.js
// Script para investigar el estado del NIV LMWDT1G89P1141436
require('dotenv').config();
const mongoose = require('mongoose');

const SERIE_INVESTIGAR = 'LMWDT1G89P1141436';

// Esquemas flexibles
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

async function investigarNIVDodge() {
    console.log('🔍 INVESTIGANDO NIV DODGE JOURNEY 2023:', SERIE_INVESTIGAR);
    console.log('═'.repeat(80));
    console.log('📅 Logs indican proceso iniciado: 14:57:20 - 14:59:33 (2m 13s)');
    console.log('🚗 Vehículo: Dodge Journey 2023 - Color: Naranja - Placas: RCJ039D');
    console.log('');

    try {
        const conectado = await connectDB();
        if (!conectado) {
            console.log('❌ No se pudo conectar a la base de datos');
            return;
        }

        console.log('📋 1. ANÁLISIS DE LOGS RECIBIDOS:');
        console.log('-'.repeat(50));
        console.log('⏰ Proceso iniciado: 2025-07-21T20:57:20.204Z');
        console.log('🔤 Placas ingresadas: RCJ039D a las 14:58:19');
        console.log('📸 Foto subida exitosamente: 14:58:44 (tamaño: 268KB)');
        console.log('🔘 Botón "Finalizar" presionado: 14:59:33');
        console.log('❌ LOGS SE CORTAN AQUÍ - Proceso incompleto\n');

        console.log('📋 2. ESTADO ACTUAL EN BASE DE DATOS:');
        console.log('-'.repeat(50));

        // Buscar vehículo
        const vehiculos = await Vehicle.find({
            serie: SERIE_INVESTIGAR
        }).lean();

        if (vehiculos.length === 0) {
            console.log('❌ NO encontrado en colección Vehicle');
        } else {
            console.log(`✅ Encontrados ${vehiculos.length} vehículo(s):`);
            vehiculos.forEach((v, index) => {
                console.log(`\n   📄 Vehículo ${index + 1}:`);
                console.log(`   • _id: ${v._id}`);
                console.log(`   • Serie: ${v.serie}`);
                console.log(`   • Marca: ${v.marca} ${v.submarca} ${v.año}`);
                console.log(`   • Color: ${v.color}`);
                console.log(`   • Placas: ${v.placas}`);
                console.log(`   • Estado: ${v.estado}`);
                console.log(`   • PolicyId: ${v.policyId || 'null'}`);
                console.log(`   • CreadoPor: ${v.creadoPor}`);
                console.log(`   • FechaCreación: ${v.createdAt}`);

                // Verificar fotos
                if (v.archivos?.r2Files?.fotos) {
                    console.log(`   • Fotos R2: ${v.archivos.r2Files.fotos.length}`);
                    v.archivos.r2Files.fotos.forEach((foto, idx) => {
                        console.log(`     ${idx + 1}. ${foto.originalName} (${foto.size} bytes)`);
                    });
                }
            });
        }

        // Buscar póliza
        console.log('\n📋 3. BÚSQUEDA DE PÓLIZA NIV:');
        console.log('-'.repeat(50));

        const polizas = await Policy.find({
            numeroPoliza: SERIE_INVESTIGAR
        }).lean();

        if (polizas.length === 0) {
            console.log('❌ NO encontrado en colección Policy');
        } else {
            console.log(`✅ Encontradas ${polizas.length} póliza(s):`);
            polizas.forEach((p, index) => {
                console.log(`\n   📄 Póliza ${index + 1}:`);
                console.log(`   • _id: ${p._id}`);
                console.log(`   • NumeroPoliza: ${p.numeroPoliza}`);
                console.log(`   • TipoPoliza: ${p.tipoPoliza || 'REGULAR'}`);
                console.log(`   • EsNIV: ${p.esNIV || false}`);
                console.log(`   • Estado: ${p.estado}`);
                console.log(`   • VehicleId: ${p.vehicleId || 'null'}`);
                console.log(`   • TotalServicios: ${p.totalServicios || 0}`);
                console.log(`   • FechaConversionNIV: ${p.fechaConversionNIV || 'null'}`);
                console.log(`   • FechaCreación: ${p.createdAt}`);
            });
        }

        console.log('\n📋 4. ANÁLISIS DE DETECCIÓN NIV:');
        console.log('-'.repeat(50));

        const añoVehiculo = 2023;
        const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;

        console.log(`• Año del vehículo: ${añoVehiculo}`);
        console.log(`• ¿Es candidato NIV?: ${esVehiculoNIV ? '✅ SÍ' : '❌ NO'}`);
        console.log('• Rango NIV: 2023-2026');

        if (esVehiculoNIV) {
            console.log('✅ Este vehículo DEBE haberse convertido a NIV automáticamente');
        }

        console.log('\n📋 5. VERIFICACIÓN DE CORRECCIONES APLICADAS:');
        console.log('-'.repeat(50));

        // Verificar si existen vehículos huérfanos recientes
        const vehiculosHuerfanos = await Vehicle.find({
            createdAt: { $gte: new Date('2025-07-21T20:50:00.000Z') },
            estado: { $in: ['SIN_POLIZA'] },
            año: { $gte: 2023, $lte: 2026 }
        }).lean();

        if (vehiculosHuerfanos.length > 0) {
            console.log(`⚠️  Encontrados ${vehiculosHuerfanos.length} vehículos NIV huérfanos recientes:`);
            vehiculosHuerfanos.forEach(v => {
                console.log(`   • ${v.serie} - ${v.marca} ${v.año} - Estado: ${v.estado}`);
            });
        } else {
            console.log('✅ No hay vehículos NIV huérfanos recientes');
        }

        console.log('\n📋 6. QUERY DE REPORTES NIV:');
        console.log('-'.repeat(50));

        const nivsDisponibles = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIV',
            totalServicios: 0
        })
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

        console.log(`📊 NIVs disponibles para reportes: ${nivsDisponibles.length}`);
        if (nivsDisponibles.length > 0) {
            nivsDisponibles.forEach((niv, index) => {
                console.log(`   ${index + 1}. ${niv.numeroPoliza} - ${niv.marca} ${niv.año}`);
            });

            const nuestroNIV = nivsDisponibles.find(n => n.numeroPoliza === SERIE_INVESTIGAR);
            if (nuestroNIV) {
                console.log(`✅ El NIV ${SERIE_INVESTIGAR} aparece en reportes`);
            } else {
                console.log(`❌ El NIV ${SERIE_INVESTIGAR} NO aparece en reportes`);
            }
        }

        console.log('\n📋 7. DIAGNÓSTICO FINAL:');
        console.log('═'.repeat(80));

        const vehiculoEncontrado = vehiculos.length > 0;
        const polizaEncontrada = polizas.length > 0;

        if (!vehiculoEncontrado && !polizaEncontrada) {
            console.log('❌ FALLO TOTAL: No se creó nada');
            console.log('🔍 Causa probable: Error antes de iniciar transacción');
        } else if (vehiculoEncontrado && !polizaEncontrada) {
            const vehiculo = vehiculos[0];
            console.log('⚠️  FALLO EN CONVERSIÓN NIV: Solo se creó vehículo');
            console.log(`🔍 Estado vehículo: ${vehiculo.estado}`);
            console.log('🔍 Causa probable: Falló la conversión NIV o se ejecutó flujo regular');
        } else if (!vehiculoEncontrado && polizaEncontrada) {
            console.log('🚨 INCONSISTENCIA CRÍTICA: Póliza sin vehículo');
        } else {
            const vehiculo = vehiculos[0];
            const poliza = polizas[0];
            console.log('✅ CREACIÓN EXITOSA: Ambos registros existen');

            const vinculacionCorrecta = vehiculo.policyId?.toString() === poliza._id.toString() &&
                                       poliza.vehicleId?.toString() === vehiculo._id.toString();

            console.log(`🔗 Vinculación: ${vinculacionCorrecta ? '✅ CORRECTA' : '❌ INCORRECTA'}`);

            if (poliza.tipoPoliza === 'NIV' && vehiculo.estado === 'CONVERTIDO_NIV') {
                console.log('🎉 CONVERSIÓN NIV: ✅ EXITOSA');
            } else {
                console.log('⚠️  CONVERSIÓN NIV: ❌ INCOMPLETA O FALLIDA');
            }
        }

        console.log('\n🎯 RECOMENDACIONES:');
        if (!polizaEncontrada && vehiculoEncontrado) {
            console.log('1. 🔄 Reejecutar conversión NIV para este vehículo');
            console.log('2. 🔍 Revisar logs completos del callback "vehiculo_finalizar"');
            console.log('3. ⚠️  Verificar que las correcciones se aplicaron correctamente');
        }

    } catch (error) {
        console.error('❌ Error en investigación:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión cerrada');
        process.exit(0);
    }
}

investigarNIVDodge().catch(console.error);
