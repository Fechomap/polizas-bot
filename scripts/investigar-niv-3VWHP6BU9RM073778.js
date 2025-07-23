/**
 * Script de investigación: Consultar estado del vehículo/NIP 3VWHP6BU9RM073778
 * Determina el estado actual en ambas colecciones (Vehicle y Policy)
 */

const { connectDB } = require('../src/database');
const Vehicle = require('../src/models/vehicle').default;
const Policy = require('../src/models/policy').default;

const SERIE_INVESTIGAR = '3VWHP6BU9RM073778';

async function investigarNIV() {
    console.log('🔍 INICIANDO INVESTIGACIÓN DEL NIV:', SERIE_INVESTIGAR);
    console.log('═'.repeat(80));

    try {
        // Conectar a la base de datos
        await connectDB();
        console.log('✅ Conectado a MongoDB');

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
                console.log(`   • Fotos R2: ${v.archivos?.r2Files?.fotos?.length || 0}`);
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

        // 3. BUSCAR POSIBLES CONFLICTOS
        console.log('\n📋 3. INVESTIGANDO POSIBLES CONFLICTOS:');
        console.log('-'.repeat(50));

        // Buscar series similares
        const seriesSimilares = await Vehicle.find({
            serie: { $regex: SERIE_INVESTIGAR.substring(0, 10), $options: 'i' }
        }).lean();

        if (seriesSimilares.length > 1) {
            console.log(`⚠️  Encontradas ${seriesSimilares.length} series similares:`);
            seriesSimilares.forEach(v => {
                console.log(`   • ${v.serie} - Estado: ${v.estado} - Año: ${v.año}`);
            });
        } else {
            console.log('✅ No hay series similares que puedan causar conflicto');
        }

        // 4. VERIFICAR QUERY DE REPORTES
        console.log('\n📋 4. SIMULANDO QUERY DE REPORTES NIPs:');
        console.log('-'.repeat(50));

        const nipsEnReportes = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIP',
            totalServicios: 0
        })
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

        console.log(`Query NIPs para reportes devuelve: ${nipsEnReportes.length} resultados`);
        if (nipsEnReportes.length > 0) {
            nipsEnReportes.forEach((nip, index) => {
                console.log(`   ${index + 1}. ${nip.numeroPoliza} - Estado: ${nip.estado} - Servicios: ${nip.totalServicios}`);
            });
        }

        // Buscar específicamente nuestro NIP
        const nuestroNipEnQuery = nipsEnReportes.find(n => n.numeroPoliza === SERIE_INVESTIGAR);
        if (nuestroNipEnQuery) {
            console.log(`✅ El NIP ${SERIE_INVESTIGAR} SÍ aparece en query de reportes`);
        } else {
            console.log(`❌ El NIP ${SERIE_INVESTIGAR} NO aparece en query de reportes`);
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
        }

        console.log('\n🎯 CONCLUSIÓN:');
        if (!vehiculoEncontrado && !polizaEncontrada) {
            console.log('❌ FALLO TOTAL: No se creó ni vehículo ni póliza');
        } else if (vehiculoEncontrado && !polizaEncontrada) {
            console.log('⚠️  FALLO PARCIAL: Se creó vehículo pero no póliza NIP');
        } else if (!vehiculoEncontrado && polizaEncontrada) {
            console.log('⚠️  FALLO PARCIAL: Se creó póliza NIP pero no vehículo');
        } else {
            console.log('✅ CREACIÓN EXITOSA: Ambos registros existen');
        }

    } catch (error) {
        console.error('❌ Error en investigación:', error);
    } finally {
        process.exit(0);
    }
}

// Ejecutar investigación
investigarNIV().catch(console.error);
