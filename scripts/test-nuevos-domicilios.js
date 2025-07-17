// Script para probar la nueva distribución de domicilios
const { generarDatosMexicanosCompletos } = require('../src/utils/mexicanDataGenerator');

function probarDistribucionDomicilios() {
    console.log('🏠 PRUEBA DE NUEVA DISTRIBUCIÓN DE DOMICILIOS\n');

    const contadores = {};
    const totalPruebas = 1000;

    console.log(`📊 Generando ${totalPruebas} domicilios para analizar distribución...\n`);

    // Generar datos y contar por estado
    for (let i = 0; i < totalPruebas; i++) {
        const datos = generarDatosMexicanosCompletos();
        const estado = datos.estadoRegion;

        if (!contadores[estado]) {
            contadores[estado] = {
                count: 0,
                municipios: new Set(),
                colonias: new Set()
            };
        }

        contadores[estado].count++;
        contadores[estado].municipios.add(datos.municipio);
        contadores[estado].colonias.add(datos.colonia);
    }

    // Mostrar estadísticas
    console.log('📈 DISTRIBUCIÓN POR ESTADO:');
    console.log('═══════════════════════════');

    // Ordenar por cantidad (mayor a menor)
    const estadosOrdenados = Object.entries(contadores).sort(([, a], [, b]) => b.count - a.count);

    for (const [estado, datos] of estadosOrdenados) {
        const porcentaje = ((datos.count / totalPruebas) * 100).toFixed(1);
        console.log(`\n🏛️  ${estado}:`);
        console.log(`   📊 ${datos.count} domicilios (${porcentaje}%)`);
        console.log(`   🏙️  Municipios: ${datos.municipios.size}`);
        console.log(`   🏘️  Colonias: ${datos.colonias.size}`);

        // Mostrar algunos ejemplos de municipios
        const municipiosArray = Array.from(datos.municipios);
        console.log(`   📍 Ejemplos: ${municipiosArray.slice(0, 3).join(', ')}`);
    }

    // Mostrar algunos ejemplos completos
    console.log('\n\n🏠 EJEMPLOS DE DOMICILIOS GENERADOS:');
    console.log('═══════════════════════════════════');

    for (let i = 0; i < 5; i++) {
        const datos = generarDatosMexicanosCompletos();
        console.log(`\n${i + 1}. ${datos.titular}`);
        console.log(`   📍 ${datos.calle}`);
        console.log(`   🏘️  Col. ${datos.colonia}`);
        console.log(`   🏛️  ${datos.municipio}, ${datos.estadoRegion}`);
        console.log(`   📮 C.P. ${datos.cp}`);
    }

    // Verificar que la distribución sea correcta
    const zmCdmx = contadores['Ciudad de México']?.count || 0;
    const zmEdomex = contadores['Estado de México']?.count || 0;
    const morelos = contadores['Morelos']?.count || 0;
    const hidalgo = contadores['Hidalgo']?.count || 0;
    const puebla = contadores['Puebla']?.count || 0;
    const queretaro = contadores['Querétaro']?.count || 0;

    console.log('\n\n✅ VERIFICACIÓN DE DISTRIBUCIÓN:');
    console.log('═══════════════════════════════════');
    console.log(
        `📊 Zona Metropolitana Total: ${zmCdmx + zmEdomex} (${(((zmCdmx + zmEdomex) / totalPruebas) * 100).toFixed(1)}%)`
    );
    console.log(`   - CDMX: ${zmCdmx} (${((zmCdmx / totalPruebas) * 100).toFixed(1)}%)`);
    console.log(`   - Edomex: ${zmEdomex} (${((zmEdomex / totalPruebas) * 100).toFixed(1)}%)`);
    console.log(
        `📊 Estados circundantes: ${morelos + hidalgo + puebla + queretaro} (${(((morelos + hidalgo + puebla + queretaro) / totalPruebas) * 100).toFixed(1)}%)`
    );

    const esperado = {
        'Ciudad de México': 30,
        'Estado de México': 15,
        Morelos: 15,
        Hidalgo: 12,
        Puebla: 12,
        Querétaro: 8
    };

    console.log('\n📊 COMPARACIÓN CON DISTRIBUCIÓN ESPERADA:');
    for (const [estado, esperadoPorcentaje] of Object.entries(esperado)) {
        const realPorcentaje = ((contadores[estado]?.count || 0) / totalPruebas) * 100;
        const diferencia = Math.abs(realPorcentaje - esperadoPorcentaje);
        const status = diferencia <= 3 ? '✅' : '⚠️';
        console.log(
            `${status} ${estado}: ${realPorcentaje.toFixed(1)}% (esperado: ${esperadoPorcentaje}%, diff: ${diferencia.toFixed(1)}%)`
        );
    }
}

// Ejecutar prueba
probarDistribucionDomicilios();
