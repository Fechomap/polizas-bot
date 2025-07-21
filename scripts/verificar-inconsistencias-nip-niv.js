// scripts/verificar-inconsistencias-nip-niv.js
// Verificar inconsistencias en la terminología NIP vs NIV
require('dotenv').config();
const mongoose = require('mongoose');

// Esquemas flexibles para investigación
const PolicySchema = new mongoose.Schema({}, { strict: false });
const VehicleSchema = new mongoose.Schema({}, { strict: false });
const Policy = mongoose.model('Policy', PolicySchema);
const Vehicle = mongoose.model('Vehicle', VehicleSchema);

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

async function verificarInconsistencias() {
    console.log('🔍 VERIFICACIÓN DE INCONSISTENCIAS NIP vs NIV');
    console.log('═'.repeat(80));
    console.log('🎯 Objetivo: Identificar registros con terminología mixta o incorrecta');
    console.log('');

    try {
        const conectado = await connectDB();
        if (!conectado) {
            console.log('❌ No se pudo conectar a la base de datos');
            return;
        }

        console.log('📋 1. ANÁLISIS DE PÓLIZAS:');
        console.log('-'.repeat(60));
        
        // Buscar pólizas con tipoPoliza = 'NIP' (terminología antigua)
        const polizasNIP = await Policy.find({
            tipoPoliza: 'NIP'
        }).lean();

        // Buscar pólizas con tipoPoliza = 'NIV' (terminología nueva)
        const polizasNIV = await Policy.find({
            tipoPoliza: 'NIV'
        }).lean();

        // Buscar pólizas con esNIP = true (campo antiguo)
        const polizasEsNIP = await Policy.find({
            esNIP: true
        }).lean();

        // Buscar pólizas con esNIV = true (campo nuevo)
        const polizasEsNIV = await Policy.find({
            esNIV: true
        }).lean();

        console.log(`📊 RESUMEN PÓLIZAS:`);
        console.log(`   • tipoPoliza: 'NIP' (antiguo): ${polizasNIP.length}`);
        console.log(`   • tipoPoliza: 'NIV' (nuevo): ${polizasNIV.length}`);
        console.log(`   • esNIP: true (antiguo): ${polizasEsNIP.length}`);
        console.log(`   • esNIV: true (nuevo): ${polizasEsNIV.length}`);

        if (polizasNIP.length > 0) {
            console.log(`\n🚨 PÓLIZAS CON TERMINOLOGÍA ANTIGUA (tipoPoliza: 'NIP'):`);
            polizasNIP.forEach((pol, index) => {
                console.log(`   ${index + 1}. ${pol.numeroPoliza}`);
                console.log(`      • Estado: ${pol.estado}`);
                console.log(`      • TipoPoliza: ${pol.tipoPoliza}`);
                console.log(`      • esNIP: ${pol.esNIP}`);
                console.log(`      • esNIV: ${pol.esNIV}`);
                console.log(`      • TotalServicios: ${pol.totalServicios}`);
                console.log(`      • Creado: ${pol.createdAt}`);
                console.log(`      • Actualizado: ${pol.updatedAt}`);
            });
        }

        console.log('\n📋 2. ANÁLISIS DE VEHÍCULOS:');
        console.log('-'.repeat(60));
        
        // Buscar vehículos con estado CONVERTIDO_NIP (terminología antigua)
        const vehiculosNIP = await Vehicle.find({
            estado: 'CONVERTIDO_NIP'
        }).lean();

        // Buscar vehículos con estado CONVERTIDO_NIV (terminología nueva)
        const vehiculosNIV = await Vehicle.find({
            estado: 'CONVERTIDO_NIV'
        }).lean();

        console.log(`📊 RESUMEN VEHÍCULOS:`);
        console.log(`   • estado: 'CONVERTIDO_NIP' (antiguo): ${vehiculosNIP.length}`);
        console.log(`   • estado: 'CONVERTIDO_NIV' (nuevo): ${vehiculosNIV.length}`);

        if (vehiculosNIP.length > 0) {
            console.log(`\n🚨 VEHÍCULOS CON TERMINOLOGÍA ANTIGUA (estado: 'CONVERTIDO_NIP'):`);
            vehiculosNIP.forEach((veh, index) => {
                console.log(`   ${index + 1}. ${veh.serie}`);
                console.log(`      • Estado: ${veh.estado}`);
                console.log(`      • Marca: ${veh.marca} ${veh.submarca} ${veh.año}`);
                console.log(`      • PolicyId: ${veh.policyId}`);
                console.log(`      • Creado: ${veh.createdAt}`);
                console.log(`      • Actualizado: ${veh.updatedAt}`);
            });
        }

        console.log('\n📋 3. VERIFICACIÓN DE INTEGRIDAD RELACIONAL:');
        console.log('-'.repeat(60));
        
        // Verificar relaciones inconsistentes entre Policy y Vehicle
        console.log('🔍 Buscando inconsistencias relacionales...');
        
        let inconsistenciasEncontradas = 0;

        for (const polNIP of polizasNIP) {
            if (polNIP.vehicleId) {
                const vehiculoAsociado = await Vehicle.findById(polNIP.vehicleId).lean();
                if (vehiculoAsociado) {
                    const estadoVehiculo = vehiculoAsociado.estado;
                    if (estadoVehiculo === 'CONVERTIDO_NIV') {
                        inconsistenciasEncontradas++;
                        console.log(`🚨 INCONSISTENCIA ${inconsistenciasEncontradas}:`);
                        console.log(`   Póliza ${polNIP.numeroPoliza} es tipoPoliza: 'NIP'`);
                        console.log(`   Pero su vehículo ${vehiculoAsociado.serie} tiene estado: 'CONVERTIDO_NIV'`);
                        console.log(`   Esta es una inconsistencia terminológica`);
                    } else if (estadoVehiculo !== 'CONVERTIDO_NIP') {
                        inconsistenciasEncontradas++;
                        console.log(`🚨 INCONSISTENCIA ${inconsistenciasEncontradas}:`);
                        console.log(`   Póliza ${polNIP.numeroPoliza} es tipoPoliza: 'NIP'`);
                        console.log(`   Pero su vehículo ${vehiculoAsociado.serie} tiene estado: '${estadoVehiculo}'`);
                        console.log(`   Esperaríamos 'CONVERTIDO_NIP' o 'CONVERTIDO_NIV'`);
                    }
                }
            }
        }

        if (inconsistenciasEncontradas === 0) {
            console.log('✅ No se encontraron inconsistencias relacionales');
        }

        console.log('\n📋 4. ANÁLISIS DE FECHAS DE ACTUALIZACIÓN:');
        console.log('-'.repeat(60));
        
        // Verificar cuándo fueron actualizados estos registros con terminología antigua
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        const polizasNIPActualizadasHoy = polizasNIP.filter(pol => 
            pol.updatedAt && pol.updatedAt >= hoy
        );

        console.log(`📊 Pólizas NIP actualizadas hoy: ${polizasNIPActualizadasHoy.length}/${polizasNIP.length}`);
        
        if (polizasNIPActualizadasHoy.length > 0) {
            console.log('\n🕒 ACTUALIZACIONES RECIENTES:');
            polizasNIPActualizadasHoy.forEach((pol, index) => {
                console.log(`   ${index + 1}. ${pol.numeroPoliza} - ${pol.updatedAt}`);
            });
        }

        console.log('\n📋 5. DIAGNÓSTICO Y RECOMENDACIONES:');
        console.log('═'.repeat(80));
        
        if (polizasNIP.length > 0 || vehiculosNIP.length > 0) {
            console.log('🚨 TERMINOLOGÍA MIXTA DETECTADA');
            console.log('\n📊 SITUACIÓN ACTUAL:');
            console.log(`   • ${polizasNIP.length} pólizas usan terminología antigua ('NIP')`);
            console.log(`   • ${polizasNIV.length} pólizas usan terminología nueva ('NIV')`);
            console.log(`   • ${vehiculosNIP.length} vehículos usan terminología antigua`);
            console.log(`   • ${vehiculosNIV.length} vehículos usan terminología nueva`);
            
            console.log('\n🎯 IMPACTO EN REPORTES:');
            console.log('   • Los reportes buscan tipoPoliza: "NIV" pero algunos registros son "NIP"');
            console.log('   • Esto causa que NIPs válidos no aparezcan en reportes');
            console.log('   • La funcionalidad está fragmentada entre dos terminologías');
            
            console.log('\n💡 RECOMENDACIONES:');
            console.log('   1. 🔄 Migrar todos los registros NIP → NIV para consistencia');
            console.log('   2. 🧪 Crear script de migración de datos');
            console.log('   3. ✅ Verificar integridad post-migración');
            console.log('   4. 📊 Actualizar queries para manejar ambos temporalmente');
            
        } else {
            console.log('✅ TERMINOLOGÍA CONSISTENTE');
            console.log('   Todos los registros usan la nueva terminología NIV correctamente');
        }

        // Verificar el caso específico de Journey
        const journeyNIP = polizasNIP.find(p => p.numeroPoliza === 'LMWDT1G89P1141436');
        if (journeyNIP) {
            console.log('\n🎯 CASO ESPECÍFICO - JOURNEY:');
            console.log(`   • La póliza Journey está marcada como tipoPoliza: 'NIP'`);
            console.log(`   • Pero nuestros reportes buscan tipoPoliza: 'NIV'`);
            console.log(`   • Esta es la causa exacta del fallo reportado entre 15:01 y 15:08`);
            console.log(`   • Actualizado por última vez: ${journeyNIP.updatedAt}`);
        }

    } catch (error) {
        console.error('❌ Error en verificación:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión cerrada');
        process.exit(0);
    }
}

verificarInconsistencias().catch(console.error);