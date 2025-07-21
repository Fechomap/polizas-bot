// Script para analizar el generador de datos mexicanos
const MexicanDataGenerator = require('../dist/utils/mexicanDataGenerator').default;
const { generarDatosMexicanosCompletos } = require('../dist/utils/mexicanDataGenerator');

console.log('🔍 ANÁLISIS COMPLETO DEL GENERADOR DE DATOS MEXICANOS\n');
console.log('═══════════════════════════════════════════════════════════\n');

// Crear instancia del generador
const generator = new MexicanDataGenerator();

// Análisis de zonas geográficas
console.log('📍 ANÁLISIS DE ZONAS GEOGRÁFICAS CONFIGURADAS:');
console.log('═══════════════════════════════════════════════════════');

// Generar 50 registros para análisis
const registros = [];
for (let i = 0; i < 50; i++) {
    registros.push(generator.generateDatosMexicanos());
}

// Análisis de estados
const estadosCount = {};
const municipiosCount = {};
const coloniasCount = {};

registros.forEach(registro => {
    estadosCount[registro.estado] = (estadosCount[registro.estado] || 0) + 1;
    municipiosCount[registro.municipio] = (municipiosCount[registro.municipio] || 0) + 1;
    coloniasCount[registro.colonia] = (coloniasCount[registro.colonia] || 0) + 1;
});

console.log('\n🏛️  ESTADOS CONFIGURADOS:');
Object.keys(estadosCount).sort().forEach(estado => {
    const count = estadosCount[estado];
    const porcentaje = ((count / registros.length) * 100).toFixed(1);
    
    // Marcar estados que deben eliminarse
    const debeEliminar = ['Oaxaca', 'Chiapas'].includes(estado);
    const status = debeEliminar ? '❌ ELIMINAR' : '✅ MANTENER';
    
    console.log(`   ${status} ${estado}: ${count} (${porcentaje}%)`);
});

console.log('\n🏙️  MUNICIPIOS CONFIGURADOS:');
Object.keys(municipiosCount).sort().forEach(municipio => {
    const count = municipiosCount[municipio];
    console.log(`   - ${municipio}: ${count}`);
});

console.log('\n🏘️  COLONIAS CONFIGURADAS:');
Object.keys(coloniasCount).sort().forEach(colonia => {
    const count = coloniasCount[colonia];
    console.log(`   - ${colonia}: ${count}`);
});

// Verificar zonas requeridas
console.log('\n📋 VERIFICACIÓN DE ZONAS REQUERIDAS:');
console.log('═══════════════════════════════════════════════');

const zonasRequeridas = {
    'ZMVM (Ciudad de México, Estado de México)': ['Ciudad de México', 'México'],
    'Toluca, Zinacantepec': ['México'], // Toluca está en Estado de México
    'Pachuca (Hidalgo)': ['Hidalgo'],
    'Morelos (Cuernavaca, Cuautla)': ['Morelos'],
    'Puebla': ['Puebla']
};

const zonasProhibidas = ['Oaxaca', 'Chiapas'];

Object.keys(zonasRequeridas).forEach(zona => {
    const estadosZona = zonasRequeridas[zona];
    const encontrados = estadosZona.filter(estado => Object.keys(estadosCount).includes(estado));
    
    if (encontrados.length > 0) {
        console.log(`✅ ${zona}: ${encontrados.join(', ')}`);
    } else {
        console.log(`❌ ${zona}: NO CONFIGURADO`);
    }
});

console.log('\n🚫 ZONAS PROHIBIDAS ENCONTRADAS:');
zonasProhibidas.forEach(zona => {
    if (Object.keys(estadosCount).includes(zona)) {
        console.log(`❌ ${zona}: DEBE ELIMINARSE`);
    } else {
        console.log(`✅ ${zona}: NO ENCONTRADO (correcto)`);
    }
});

// Análisis de nombres
console.log('\n👤 ANÁLISIS DE NOMBRES:');
console.log('══════════════════════════════');

const nombres = registros.slice(0, 10).map(r => r.titular);
console.log('Muestra de nombres generados:');
nombres.forEach((nombre, i) => {
    console.log(`   ${i + 1}. ${nombre}`);
});

// Análisis de RFCs
console.log('\n🆔 ANÁLISIS DE RFCs:');
console.log('══════════════════════════');

const rfcs = registros.slice(0, 5).map(r => r.rfc);
console.log('Muestra de RFCs generados:');
rfcs.forEach((rfc, i) => {
    const esValido = /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/.test(rfc);
    console.log(`   ${i + 1}. ${rfc} ${esValido ? '✅' : '❌'}`);
});

// Análisis de teléfonos
console.log('\n📞 ANÁLISIS DE TELÉFONOS:');
console.log('═══════════════════════════');

const telefonos = registros.slice(0, 5).map(r => r.telefono);
console.log('Muestra de teléfonos generados:');
telefonos.forEach((telefono, i) => {
    const esValido = /^\d{9,10}$/.test(telefono);
    console.log(`   ${i + 1}. ${telefono} ${esValido ? '✅' : '❌'}`);
});

// Análisis de domicilios
console.log('\n🏠 ANÁLISIS DE DOMICILIOS:');
console.log('═══════════════════════════');

console.log('Muestra de domicilios generados:');
registros.slice(0, 5).forEach((registro, i) => {
    console.log(`   ${i + 1}. ${registro.calle}`);
    console.log(`      Col. ${registro.colonia}, ${registro.municipio}, ${registro.estado}`);
    console.log(`      C.P. ${registro.cp}`);
    console.log();
});

// Verificar función de compatibilidad
console.log('🔄 VERIFICACIÓN DE COMPATIBILIDAD:');
console.log('═══════════════════════════════════');

try {
    const datosCompatibilidad = generarDatosMexicanosCompletos();
    console.log('✅ Función generarDatosMexicanosCompletos() funciona correctamente');
    console.log(`   Titular: ${datosCompatibilidad.titular}`);
    console.log(`   Estado: ${datosCompatibilidad.estado}`);
} catch (error) {
    console.log('❌ Error en función de compatibilidad:', error.message);
}

// Análisis final
console.log('\n📊 RESUMEN DE PROBLEMAS IDENTIFICADOS:');
console.log('════════════════════════════════════════');

const problemas = [];

// Verificar zonas prohibidas
if (Object.keys(estadosCount).includes('Oaxaca')) {
    problemas.push('❌ Estado "Oaxaca" debe eliminarse');
}
if (Object.keys(estadosCount).includes('Chiapas')) {
    problemas.push('❌ Estado "Chiapas" debe eliminarse');
}

// Verificar municipios incorrectos para zonas específicas
const municipiosActuales = Object.keys(municipiosCount);
const municipiosJalisco = municipiosActuales.filter(m => 
    ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá'].includes(m)
);

if (municipiosJalisco.length > 0) {
    problemas.push('❌ Municipios de Jalisco configurados pero no están en zonas permitidas');
}

// Verificar falta de municipios específicos
const municipiosRequeridos = {
    'Toluca': 'México',
    'Zinacantepec': 'México',
    'Pachuca': 'Hidalgo',
    'Cuernavaca': 'Morelos',
    'Cuautla': 'Morelos'
};

Object.keys(municipiosRequeridos).forEach(municipio => {
    if (!municipiosActuales.includes(municipio)) {
        problemas.push(`⚠️ Falta municipio requerido: ${municipio}`);
    }
});

if (problemas.length === 0) {
    console.log('✅ No se identificaron problemas mayores');
} else {
    problemas.forEach(problema => console.log(`   ${problema}`));
}

console.log('\n✅ ANÁLISIS COMPLETADO');