// Script para probar la nueva generación de domicilios reales con HereMaps
const { generarDatosMexicanosCompletos } = require('../src/utils/mexicanDataGenerator');

async function probarDomiciliosReales() {
    console.log('🗺️  PRUEBA DE DOMICILIOS REALES CON HEREMAPS\n');

    console.log('📍 Generando 5 domicilios reales usando reverse geocoding...\n');

    for (let i = 0; i < 5; i++) {
        try {
            console.log(`🏠 Generando domicilio ${i + 1}...`);
            const datos = await generarDatosMexicanosCompletos();

            console.log(`✅ ${datos.titular}`);
            console.log(`📧 ${datos.correo}`);
            console.log(`📍 ${datos.calle}`);
            console.log(`🏘️  Col. ${datos.colonia}`);
            console.log(`🏛️  ${datos.municipio}, ${datos.estadoRegion}`);
            console.log(`📮 C.P. ${datos.cp}`);

            if (datos.coordenadas) {
                console.log(
                    `🌍 Coords: ${datos.coordenadas.lat.toFixed(4)}, ${datos.coordenadas.lng.toFixed(4)}`
                );
            }

            console.log('─'.repeat(50));
        } catch (error) {
            console.error(`❌ Error generando domicilio ${i + 1}:`, error.message);
        }

        // Pequeña pausa para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n📊 ANÁLISIS DE VALIDACIÓN:');
    console.log('═══════════════════════════');

    // Generar algunos más para análisis
    const domicilios = [];
    for (let i = 0; i < 10; i++) {
        try {
            const datos = await generarDatosMexicanosCompletos();
            domicilios.push(datos);
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.log(`⚠️  Error en domicilio ${i + 1}, usando fallback`);
        }
    }

    // Análisis de características
    const analisis = {
        conCoordenadas: 0,
        estadosUnicos: new Set(),
        municipiosUnicos: new Set(),
        correosValidos: 0,
        cpsValidos: 0
    };

    domicilios.forEach(dom => {
        if (dom.coordenadas) analisis.conCoordenadas++;
        analisis.estadosUnicos.add(dom.estadoRegion);
        analisis.municipiosUnicos.add(dom.municipio);
        if (dom.correo.includes('@prueba.com.mx')) analisis.correosValidos++;
        if (dom.cp && dom.cp.length === 5) analisis.cpsValidos++;
    });

    console.log(`📊 Domicilios generados: ${domicilios.length}`);
    console.log(
        `🌍 Con coordenadas reales: ${analisis.conCoordenadas} (${((analisis.conCoordenadas / domicilios.length) * 100).toFixed(1)}%)`
    );
    console.log(`🏛️  Estados únicos: ${analisis.estadosUnicos.size}`);
    console.log(`🏙️  Municipios únicos: ${analisis.municipiosUnicos.size}`);
    console.log(
        `📧 Correos @prueba.com.mx: ${analisis.correosValidos} (${((analisis.correosValidos / domicilios.length) * 100).toFixed(1)}%)`
    );
    console.log(
        `📮 CPs válidos (5 dígitos): ${analisis.cpsValidos} (${((analisis.cpsValidos / domicilios.length) * 100).toFixed(1)}%)`
    );

    console.log('\n🏛️  Estados encontrados:');
    Array.from(analisis.estadosUnicos).forEach(estado => {
        console.log(`   - ${estado}`);
    });

    console.log('\n✅ Prueba completada');
}

// Ejecutar prueba
probarDomiciliosReales().catch(console.error);
