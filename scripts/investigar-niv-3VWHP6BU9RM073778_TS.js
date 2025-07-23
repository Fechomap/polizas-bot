// scripts/investigar-niv-3VWHP6BU9RM073778_TS.js
// Script TypeScript-compatible para investigar el NIP 3VWHP6BU9RM073778
require('dotenv').config();
const mongoose = require('mongoose');

const SERIE_INVESTIGAR = '3VWHP6BU9RM073778';

// Esquemas flexibles para compatibilidad TypeScript
const VehicleSchema = new mongoose.Schema({}, { strict: false });
const PolicySchema = new mongoose.Schema({}, { strict: false });
const Vehicle = mongoose.model('Vehicle', VehicleSchema);
const Policy = mongoose.model('Policy', PolicySchema);

// Conexión directa a MongoDB
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

async function investigarNIV() {
    console.log('🔍 INICIANDO INVESTIGACIÓN DEL NIV:', SERIE_INVESTIGAR);
    console.log('═'.repeat(80));

    try {
        // Conectar a la base de datos
        const conectado = await connectDB();
        if (!conectado) {
            console.log('❌ No se pudo conectar a la base de datos');
            return;
        }

        // 1. BUSCAR EN COLECCIÓN VEHICLE
        console.log('\n📋 1. INVESTIGANDO COLECCIÓN VEHICLE:');
        console.log('-'.repeat(50));

        const vehiculos = await Vehicle.find({
            serie: SERIE_INVESTIGAR
        }).lean();

        if (vehiculos.length === 0) {
            console.log('❌ NO encontrado en colección Vehicle');
        } else {
            console.log(`✅ Encontrados ${vehiculos.length} registro(s) en Vehicle:`);
            vehiculos.forEach((v, index) => {
                console.log(`\n   📄 Registro ${index + 1}:`);
                console.log(`   • _id: ${v._id}`);
                console.log(`   • Serie: ${v.serie}`);
                console.log(`   • Marca: ${v.marca} ${v.submarca}`);
                console.log(`   • Año: ${v.año}`);
                console.log(`   • Estado: ${v.estado}`);
                console.log(`   • PolicyId: ${v.policyId || 'null'}`);
                console.log(`   • CreadoPor: ${v.creadoPor}`);
                console.log(`   • CreadoVia: ${v.creadoVia}`);
                console.log(`   • FechaCreación: ${v.createdAt}`);
                if (v.archivos?.r2Files?.fotos) {
                    console.log(`   • Fotos R2: ${v.archivos.r2Files.fotos.length}`);
                }
            });
        }

        // 2. BUSCAR EN COLECCIÓN POLICY
        console.log('\n📋 2. INVESTIGANDO COLECCIÓN POLICY:');
        console.log('-'.repeat(50));

        const polizas = await Policy.find({
            numeroPoliza: SERIE_INVESTIGAR
        }).lean();

        if (polizas.length === 0) {
            console.log('❌ NO encontrado en colección Policy');
        } else {
            console.log(`✅ Encontrados ${polizas.length} registro(s) en Policy:`);
            polizas.forEach((p, index) => {
                console.log(`\n   📄 Póliza ${index + 1}:`);
                console.log(`   • _id: ${p._id}`);
                console.log(`   • NumeroPoliza: ${p.numeroPoliza}`);
                console.log(`   • TipoPoliza: ${p.tipoPoliza || 'REGULAR'}`);
                console.log(`   • EsNIP: ${p.esNIP || false}`);
                console.log(`   • Estado: ${p.estado}`);
                console.log(`   • Titular: ${p.titular}`);
                console.log(`   • VehicleId: ${p.vehicleId || 'null'}`);
                console.log(`   • TotalServicios: ${p.totalServicios || 0}`);
                console.log(`   • CreadoViaOBD: ${p.creadoViaOBD || false}`);
                console.log(`   • FechaEmision: ${p.fechaEmision}`);
                console.log(`   • FechaConversionNIP: ${p.fechaConversionNIP || 'null'}`);
                console.log(`   • Aseguradora: ${p.aseguradora}`);
                console.log(`   • FechaCreación: ${p.createdAt}`);
            });
        }

        // 3. VERIFICAR QUERY DE REPORTES NIPs
        console.log('\n📋 3. SIMULANDO QUERY DE REPORTES NIPs:');
        console.log('-'.repeat(50));

        const nipsEnReportes = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIP',
            totalServicios: 0
        })
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

        console.log(`📊 Query NIPs para reportes devuelve: ${nipsEnReportes.length} resultados`);
        if (nipsEnReportes.length > 0) {
            nipsEnReportes.forEach((nip, index) => {
                console.log(`   ${index + 1}. ${nip.numeroPoliza} - Estado: ${nip.estado} - Servicios: ${nip.totalServicios} - Tipo: ${nip.tipoPoliza}`);
            });

            // Buscar específicamente nuestro NIP
            const nuestroNipEnQuery = nipsEnReportes.find(n => n.numeroPoliza === SERIE_INVESTIGAR);
            if (nuestroNipEnQuery) {
                console.log(`✅ El NIP ${SERIE_INVESTIGAR} SÍ aparece en query de reportes`);
            } else {
                console.log(`❌ El NIP ${SERIE_INVESTIGAR} NO aparece en query de reportes`);
                console.log('   🔍 Verificando por qué...');

                // Verificar condiciones específicas
                const nuestroNip = polizas.length > 0 ? polizas[0] : null;
                if (nuestroNip) {
                    console.log(`   • Estado actual: ${nuestroNip.estado} (¿es ACTIVO?)`);
                    console.log(`   • TipoPoliza actual: ${nuestroNip.tipoPoliza} (¿es NIP?)`);
                    console.log(`   • TotalServicios actual: ${nuestroNip.totalServicios} (¿es 0?)`);
                }
            }
        } else {
            console.log('❌ No hay NIPs que cumplan los criterios de reportes');
        }

        // 4. VERIFICAR TODAS LAS PÓLIZAS NIP
        console.log('\n📋 4. INVESTIGANDO TODAS LAS PÓLIZAS NIP:');
        console.log('-'.repeat(50));

        const todasLasNIPs = await Policy.find({
            tipoPoliza: 'NIP'
        })
            .sort({ createdAt: -1 })
            .lean();

        console.log(`📊 Total de pólizas NIP en sistema: ${todasLasNIPs.length}`);
        if (todasLasNIPs.length > 0) {
            todasLasNIPs.forEach((nip, index) => {
                const enReportes = nip.estado === 'ACTIVO' && nip.totalServicios === 0;
                console.log(`   ${index + 1}. ${nip.numeroPoliza} - Estado: ${nip.estado} - Servicios: ${nip.totalServicios} - ${enReportes ? '✅ En reportes' : '❌ Excluido'}`);
            });
        }

        // 5. RESUMEN DE INVESTIGACIÓN
        console.log('\n📋 5. RESUMEN DE INVESTIGACIÓN:');
        console.log('═'.repeat(80));

        const vehiculoEncontrado = vehiculos.length > 0;
        const polizaEncontrada = polizas.length > 0;

        console.log(`• Vehículo en BD: ${vehiculoEncontrado ? '✅ SÍ' : '❌ NO'}`);
        console.log(`• Póliza en BD: ${polizaEncontrada ? '✅ SÍ' : '❌ NO'}`);

        if (vehiculoEncontrado && polizaEncontrada) {
            const vehiculo = vehiculos[0];
            const poliza = polizas[0];

            console.log(`• Vinculación V→P: ${vehiculo.policyId?.toString() === poliza._id.toString() ? '✅ CORRECTA' : '❌ INCORRECTA'}`);
            console.log(`• Vinculación P→V: ${poliza.vehicleId?.toString() === vehiculo._id.toString() ? '✅ CORRECTA' : '❌ INCORRECTA'}`);
            console.log(`• Tipo conversión: ${poliza.tipoPoliza === 'NIP' ? '✅ NIP' : '❌ REGULAR'}`);
            console.log(`• Estado vehículo: ${vehiculo.estado}`);
            console.log(`• Estado póliza: ${poliza.estado}`);

            // Verificar por qué no aparece en reportes
            const cumpleCriterios = poliza.estado === 'ACTIVO' && poliza.tipoPoliza === 'NIP' && poliza.totalServicios === 0;
            console.log(`• Cumple criterios reportes: ${cumpleCriterios ? '✅ SÍ' : '❌ NO'}`);
        }

        console.log('\n🎯 CONCLUSIÓN DEL CASO:');
        if (!vehiculoEncontrado && !polizaEncontrada) {
            console.log('❌ FALLO TOTAL: No se creó ni vehículo ni póliza (transacción falló completamente)');
        } else if (vehiculoEncontrado && !polizaEncontrada) {
            console.log('⚠️  FALLO EN CONVERSIÓN NIP: Se creó vehículo pero no póliza NIP');
        } else if (!vehiculoEncontrado && polizaEncontrada) {
            console.log('⚠️  FALLO EN VEHÍCULO: Se creó póliza NIP pero no vehículo (inconsistencia grave)');
        } else {
            const poliza = polizas[0];
            if (poliza.estado === 'ACTIVO' && poliza.tipoPoliza === 'NIP' && poliza.totalServicios === 0) {
                console.log('✅ ÉXITO TOTAL: Creación correcta y debe aparecer en reportes');
            } else {
                console.log('⚠️  CREACIÓN PARCIAL: Registros existen pero no cumplen criterios de reportes');
            }
        }

    } catch (error) {
        console.error('❌ Error en investigación:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión cerrada');
        process.exit(0);
    }
}

// Ejecutar investigación
investigarNIV().catch(console.error);
