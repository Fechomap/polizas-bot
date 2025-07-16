/**
 * Generador de datos mexicanos aleatorios para registros OBD
 * Genera nombres, RFC, teléfonos y direcciones válidos para México
 */

// Nombres mexicanos comunes
const NOMBRES_MASCULINOS = [
    'José',
    'Luis',
    'Juan',
    'Miguel',
    'Carlos',
    'Francisco',
    'Antonio',
    'Alejandro',
    'Manuel',
    'Rafael',
    'Pedro',
    'Daniel',
    'Fernando',
    'Jorge',
    'Ricardo',
    'David',
    'Eduardo',
    'Roberto',
    'Sergio',
    'Alberto',
    'Javier',
    'Arturo',
    'Raúl',
    'Gerardo',
    'Enrique',
    'Guillermo',
    'Óscar',
    'Rubén',
    'Héctor',
    'Armando',
    'Salvador',
    'Ramón'
];

const NOMBRES_FEMENINOS = [
    'María',
    'Guadalupe',
    'Juana',
    'Margarita',
    'Francisca',
    'Elena',
    'Rosa',
    'Verónica',
    'Teresa',
    'Leticia',
    'Carmen',
    'Ana',
    'Silvia',
    'Patricia',
    'Martha',
    'Josefina',
    'Gloria',
    'Sandra',
    'Alicia',
    'Adriana',
    'Beatriz',
    'Laura',
    'Claudia',
    'Norma',
    'Alejandra',
    'Gabriela',
    'Mónica',
    'Isabel',
    'Rocío',
    'Esperanza',
    'Dolores',
    'Luz'
];

const APELLIDOS = [
    'García',
    'Rodríguez',
    'Martínez',
    'Hernández',
    'López',
    'González',
    'Pérez',
    'Sánchez',
    'Ramírez',
    'Cruz',
    'Flores',
    'Gómez',
    'Díaz',
    'Reyes',
    'Morales',
    'Jiménez',
    'Gutiérrez',
    'Ruiz',
    'Muñoz',
    'Álvarez',
    'Castillo',
    'Torres',
    'Vargas',
    'Ramos',
    'Castro',
    'Ortega',
    'Silva',
    'Mendoza',
    'Moreno',
    'Guerrero',
    'Medina',
    'Romero',
    'Vázquez',
    'Contreras',
    'Aguilar',
    'Herrera',
    'Luna',
    'Delgado',
    'Vega',
    'Campos',
    'Navarro',
    'Blanco',
    'Salinas',
    'Estrada',
    'Espinoza',
    'Acosta',
    'Cervantes',
    'Fuentes',
    'Domínguez',
    'Cabrera',
    'Valdez',
    'Villa',
    'Franco',
    'Sandoval',
    'Velasco',
    'Pacheco',
    'Núñez',
    'Ibarra',
    'Montoya',
    'Paredes',
    'Carrasco',
    'Maldonado',
    'Zavala',
    'Quiroz',
    'Cordero',
    'Figueroa',
    'Bermúdez',
    'Ríos',
    'Valencia',
    'Camacho',
    'Vega',
    'Trejo',
    'Galván',
    'Cortés',
    'Marín',
    'Solís',
    'Peña',
    'Lara',
    'Ávila',
    'Cárdenas'
];

// Distribución por zonas con porcentajes realistas para aseguradoras
const ZONAS_DISTRIBUCION = [
    {
        nombre: 'Zona Metropolitana CDMX',
        porcentaje: 35,
        estado: 'Ciudad de México',
        municipios: [
            'Benito Juárez', 'Miguel Hidalgo', 'Cuauhtémoc', 'Coyoacán', 
            'Iztacalco', 'Venustiano Carranza', 'Gustavo A. Madero', 'Álvaro Obregón',
            'Azcapotzalco', 'Xochimilco', 'Tlalpan', 'Iztapalapa'
        ],
        coordenadas: {
            // Área aproximada de CDMX
            norte: 19.6,
            sur: 19.1,
            este: -98.9,
            oeste: -99.4
        }
    },
    {
        nombre: 'Zona Metropolitana Estado de México',
        porcentaje: 20,
        estado: 'Estado de México',
        municipios: [
            'Ecatepec', 'Naucalpan', 'Tlalnepantla', 'Toluca', 'Metepec', 
            'Zinacantepec', 'Nezahualcóyotl', 'Atizapán', 'Cuautitlán Izcalli',
            'Tultitlán', 'Coacalco', 'Huixquilucan'
        ],
        coordenadas: {
            // Área de zona metropolitana Edomex
            norte: 19.8,
            sur: 18.8,
            este: -98.7,
            oeste: -99.8
        }
    },
    {
        nombre: 'Morelos',
        porcentaje: 20,
        estado: 'Morelos',
        municipios: [
            'Cuernavaca', 'Jiutepec', 'Temixco', 'Cuautla', 'Yautepec',
            'Emiliano Zapata', 'Xochitepec', 'Tepoztlán'
        ],
        coordenadas: {
            // Área de Morelos
            norte: 19.1,
            sur: 18.3,
            este: -98.6,
            oeste: -99.6
        }
    },
    {
        nombre: 'Hidalgo',
        porcentaje: 15,
        estado: 'Hidalgo',
        municipios: [
            'Pachuca', 'Tulancingo', 'Tizayuca', 'Mineral de la Reforma',
            'Tepeji del Río', 'Tula', 'Huejutla'
        ],
        coordenadas: {
            // Área de Hidalgo
            norte: 21.4,
            sur: 19.8,
            este: -97.9,
            oeste: -99.9
        }
    },
    {
        nombre: 'Puebla',
        porcentaje: 15,
        estado: 'Puebla',
        municipios: [
            'Puebla', 'Cholula', 'Atlixco', 'Tehuacán', 'San Martín Texmelucan',
            'Cuautlancingo', 'Amozoc', 'Coronango'
        ],
        coordenadas: {
            // Área de Puebla
            norte: 20.2,
            sur: 18.0,
            este: -97.0,
            oeste: -98.9
        }
    },
    {
        nombre: 'Querétaro',
        porcentaje: 10,
        estado: 'Querétaro',
        municipios: [
            'Querétaro', 'San Juan del Río', 'Corregidora', 'El Marqués',
            'Tequisquiapan', 'Pedro Escobedo'
        ],
        coordenadas: {
            // Área de Querétaro
            norte: 21.0,
            sur: 20.2,
            este: -99.7,
            oeste: -100.5
        }
    }
];

// Estados y ciudades de México (mantenido para compatibilidad)
const ESTADOS_CIUDADES = {
    'Ciudad de México': ['Benito Juárez', 'Miguel Hidalgo', 'Cuauhtémoc', 'Coyoacán'],
    'Estado de México': ['Toluca', 'Ecatepec', 'Naucalpan', 'Tlalnepantla'],
    Morelos: ['Cuernavaca', 'Jiutepec', 'Temixco', 'Cuautla'],
    Hidalgo: ['Pachuca', 'Tulancingo', 'Tizayuca', 'Mineral de la Reforma'],
    Puebla: ['Puebla', 'Cholula', 'Atlixco', 'Tehuacán'],
    Querétaro: ['Querétaro', 'San Juan del Río', 'Corregidora', 'El Marqués'],
    Jalisco: ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá'],
    'Nuevo León': ['Monterrey', 'Guadalupe', 'San Nicolás', 'Apodaca'],
    Veracruz: ['Veracruz', 'Xalapa', 'Coatzacoalcos', 'Córdoba'],
    Guanajuato: ['León', 'Irapuato', 'Celaya', 'Salamanca']
};

// Colonias específicas por zona
const COLONIAS_POR_ZONA = {
    'Ciudad de México': [
        'Roma Norte', 'Condesa', 'Polanco', 'Del Valle', 'Narvarte',
        'Doctores', 'Obrera', 'Juárez', 'Santa María la Ribera',
        'Escandón', 'San Rafael', 'Portales', 'Álamos', 'Centro',
        'Colonia del Carmen', 'Napoles', 'Anzures', 'San Miguel Chapultepec',
        'Lindavista', 'Vertiz Narvarte', 'Nápoles', 'Hipódromo'
    ],
    'Estado de México': [
        'Las Américas', 'La Providencia', 'Jardines de Guadalupe',
        'Valle Verde', 'Ciudad Azteca', 'Jardines de Morelos',
        'Las Arboledas', 'Satélite', 'Condado de Sayavedra',
        'Lomas Verdes', 'Bosques de Ecatepec', 'Fraccionamiento Las Torres',
        'Infonavit Norte', 'Villas de la Hacienda', 'Nuevo Horizonte'
    ],
    'Morelos': [
        'Centro', 'Chapultepec', 'Carolina', 'Flores Magón',
        'Rancho Cortés', 'Delicias', 'Chamilpa', 'Burgos',
        'Tlaltenango', 'Acapatzingo', 'Lomas de Trujillo',
        'Reforma', 'Palmira', 'Buenavista', 'Las Palmas'
    ],
    'Hidalgo': [
        'Centro', 'Periodistas', 'Morelos', 'Ampliación Morelos',
        'Rojo Gómez', 'Álamos', 'Aquiles Serdán', 'Revolución',
        'Buenos Aires', 'Constitución', 'Jardines de Pachuca',
        'Lomas de Pachuca', 'Villas de Pachuca', 'San Antonio'
    ],
    'Puebla': [
        'Centro Histórico', 'Angelópolis', 'La Paz', 'Amor',
        'Jardines de San Manuel', 'Bosques de Manzanilla',
        'Concepción La Cruz', 'Ladrillera de Benitez',
        'Bosques de Chapultepec', 'Maravillas', 'Humboldt',
        'Amalucan', 'Flor del Bosque', 'Las Hadas'
    ],
    'Querétaro': [
        'Centro Histórico', 'Juriquilla', 'Milenio III', 'Zibatá',
        'El Refugio', 'Cimatario', 'Casa Blanca', 'Constituyentes',
        'Jardines de Querétaro', 'Loma Dorada', 'Tejeda',
        'Álamos', 'Carretas', 'Vista Alegre', 'San José el Alto'
    ],
    'Otros': [
        'Centro', 'Providencia', 'Americana', 'Chapultepec',
        'Del Valle', 'Polanco', 'Satelite', 'Insurgentes',
        'Colinas', 'Jardines', 'Lomas', 'Bosques', 'Villas'
    ]
};

// Colonias genéricas (mantenido para compatibilidad)
const COLONIAS = [
    'Centro', 'Roma Norte', 'Condesa', 'Polanco', 'Del Valle',
    'Narvarte', 'Doctores', 'Obrera', 'Juárez', 'Santa María la Ribera',
    'Escandón', 'San Rafael', 'Portales', 'Álamos', 'Vértiz Narvarte'
];

/**
 * Genera un nombre mexicano aleatorio
 * @param {string} genero - 'M' para masculino, 'F' para femenino, o null para aleatorio
 * @returns {object} Objeto con nombre, apellidos y género
 */
function generarNombreMexicano(genero = null) {
    // Si no se especifica género, elegir aleatoriamente
    const generoFinal = genero || (Math.random() > 0.5 ? 'M' : 'F');

    const nombres = generoFinal === 'M' ? NOMBRES_MASCULINOS : NOMBRES_FEMENINOS;
    const nombre = nombres[Math.floor(Math.random() * nombres.length)];

    // Dos apellidos como es común en México
    const apellido1 = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
    let apellido2 = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];

    // Asegurar que los apellidos sean diferentes
    while (apellido2 === apellido1) {
        apellido2 = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
    }

    return {
        nombre,
        apellido1,
        apellido2,
        nombreCompleto: `${nombre} ${apellido1} ${apellido2}`,
        genero: generoFinal
    };
}

/**
 * Genera un RFC válido mexicano
 * @param {object} persona - Objeto con nombre, apellido1, apellido2, genero
 * @returns {string} RFC válido de 13 caracteres
 */
function generarRFC(persona) {
    const { nombre, apellido1, apellido2, genero } = persona;

    // Obtener primeras letras de apellidos y nombre
    const primerApellido = apellido1.substring(0, 2).toUpperCase();
    const segundoApellido = apellido2.charAt(0).toUpperCase();
    const primerNombre = nombre.charAt(0).toUpperCase();

    // Generar fecha de nacimiento para personas de 35-45 años
    const añoActual = new Date().getFullYear();
    const añoNacimiento = añoActual - Math.floor(Math.random() * 11) - 35; // 35-45 años
    const mes = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const dia = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');

    const fechaNacimiento = `${añoNacimiento.toString().slice(-2)}${mes}${dia}`;

    // Letra de género (H/M)
    const letraGenero = genero === 'M' ? 'H' : 'M';

    // Dos caracteres aleatorios finales (números y letras)
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const char1 = caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    const char2 = caracteres.charAt(Math.floor(Math.random() * 10)); // Solo números para el último

    return `${primerApellido}${segundoApellido}${primerNombre}${fechaNacimiento}${letraGenero}${char1}${char2}`;
}

/**
 * Genera un teléfono mexicano válido
 * @returns {string} 'Sin teléfono' como valor por defecto
 */
function generarTelefonoMexicano() {
    // Por ahora retornamos 'Sin teléfono' para evitar problemas con validación
    return 'Sin teléfono';
}

/**
 * Selecciona una zona basada en la distribución de porcentajes
 * @returns {object} Zona seleccionada
 */
function seleccionarZonaPorPorcentaje() {
    const random = Math.random() * 100;
    let acumulado = 0;
    
    for (const zona of ZONAS_DISTRIBUCION) {
        acumulado += zona.porcentaje;
        if (random <= acumulado) {
            return zona;
        }
    }
    
    // Fallback a la primera zona si hay algún error
    return ZONAS_DISTRIBUCION[0];
}

/**
 * Genera coordenadas aleatorias dentro de una zona geográfica
 * @param {object} zona - Zona con coordenadas norte, sur, este, oeste
 * @returns {object} Coordenadas {lat, lng}
 */
function generarCoordenadasEnZona(zona) {
    const { norte, sur, este, oeste } = zona.coordenadas;
    
    // Generar coordenadas aleatorias dentro del área
    const lat = sur + (Math.random() * (norte - sur));
    const lng = oeste + (Math.random() * (este - oeste));
    
    return { lat, lng };
}

/**
 * Genera una dirección mexicana usando HereMaps reverse geocoding
 * @returns {Promise<object>} Objeto con dirección completa
 */
async function generarDireccionMexicanaReal() {
    // Seleccionar zona según distribución de porcentajes
    const zona = seleccionarZonaPorPorcentaje();
    
    // Generar coordenadas aleatorias dentro de la zona
    const coordenadas = generarCoordenadasEnZona(zona);
    
    try {
        // Usar HereMaps para obtener dirección real
        const HereMapsService = require('../services/HereMapsService');
        const hereMapsService = new HereMapsService();
        
        const ubicacion = await hereMapsService.reverseGeocode(coordenadas.lat, coordenadas.lng);
        
        if (ubicacion && ubicacion.items && ubicacion.items.length > 0) {
            const direccion = ubicacion.items[0].address;
            
            return {
                calle: direccion.street || `${direccion.houseNumber || ''} ${direccion.streetName || 'Sin nombre'}`.trim(),
                colonia: direccion.district || direccion.subdistrict || 'Centro',
                municipio: direccion.city || direccion.county || 'Sin municipio',
                estadoRegion: direccion.state || zona.estado,
                cp: direccion.postalCode || generarCodigoPostalPorZona(zona.estado),
                coordenadas: coordenadas
            };
        }
    } catch (error) {
        console.log('Error con HereMaps, usando datos sintéticos:', error.message);
    }
    
    // Fallback a método sintético si HereMaps falla
    return generarDireccionMexicanaSintetica(zona);
}

/**
 * Genera una dirección mexicana sintética (fallback)
 * @param {object} zona - Zona seleccionada
 * @returns {object} Objeto con dirección completa
 */
function generarDireccionMexicanaSintetica(zona) {
    // Seleccionar municipio de la zona
    const municipio = zona.municipios[Math.floor(Math.random() * zona.municipios.length)];
    
    // Seleccionar colonia específica de la zona
    const coloniasPorZona = COLONIAS_POR_ZONA[zona.estado] || COLONIAS;
    const colonia = coloniasPorZona[Math.floor(Math.random() * coloniasPorZona.length)];

    // Generar calle y número
    const tiposCalle = ['Calle', 'Avenida', 'Boulevard', 'Privada', 'Cerrada'];
    const tipoCalle = tiposCalle[Math.floor(Math.random() * tiposCalle.length)];
    const nombreCalle = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
    const numero = Math.floor(Math.random() * 999) + 1;

    const calle = `${tipoCalle} ${nombreCalle} ${numero}`;

    // Código postal más realista por zona
    const cp = generarCodigoPostalPorZona(zona.estado);

    return {
        calle,
        colonia,
        municipio,
        estadoRegion: zona.estado === 'Otros' ? 'Otros Estados' : zona.estado,
        cp
    };
}

/**
 * Genera una dirección mexicana con distribución realista por zonas
 * @returns {Promise<object>} Objeto con dirección completa
 */
async function generarDireccionMexicana() {
    // Intentar generar dirección real con HereMaps
    return await generarDireccionMexicanaReal();
}

/**
 * Genera código postal más realista por zona
 * @param {string} estado - Estado de la zona
 * @returns {string} Código postal
 */
function generarCodigoPostalPorZona(estado) {
    const rangosCP = {
        'Ciudad de México': [3000, 16999],
        'Estado de México': [50000, 56999],
        'Morelos': [62000, 62999],
        'Hidalgo': [42000, 43999],
        'Puebla': [72000, 75999],
        'Querétaro': [76000, 76999],
        'Otros': [10000, 99999]
    };
    
    const rango = rangosCP[estado] || rangosCP['Otros'];
    const cp = Math.floor(Math.random() * (rango[1] - rango[0] + 1)) + rango[0];
    
    return String(cp).padStart(5, '0');
}

/**
 * Genera un conjunto completo de datos mexicanos aleatorios
 * @param {string} genero - 'M', 'F' o null para aleatorio
 * @returns {Promise<object>} Datos completos de una persona mexicana
 */
async function generarDatosMexicanosCompletos(genero = null) {
    const persona = generarNombreMexicano(genero);
    const rfc = generarRFC(persona);
    const telefono = generarTelefonoMexicano();
    const direccion = await generarDireccionMexicana();

    // Generar correo electrónico con formato @prueba.com.mx
    const nombreLimpio = persona.nombre.toLowerCase()
        .replace(/\s+/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
    const apellidoLimpio = persona.apellido1.toLowerCase()
        .replace(/\s+/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
    const correo = `${nombreLimpio}.${apellidoLimpio}@prueba.com.mx`;

    return {
        titular: persona.nombreCompleto,
        nombre: persona.nombre,
        apellido1: persona.apellido1,
        apellido2: persona.apellido2,
        genero: persona.genero,
        rfc,
        telefono,
        correo,
        ...direccion,
        // Contraseña temporal aleatoria
        contraseña: Math.random().toString(36).slice(-8),
        // Datos adicionales para coherencia del RFC
        fechaNacimiento: calcularFechaNacimientoDesdeRFC(rfc)
    };
}

/**
 * Calcula la fecha de nacimiento a partir del RFC
 * @param {string} rfc - RFC de 13 caracteres
 * @returns {Date} Fecha de nacimiento
 */
function calcularFechaNacimientoDesdeRFC(rfc) {
    const añoRFC = parseInt(rfc.substr(4, 2));
    const mesRFC = parseInt(rfc.substr(6, 2));
    const diaRFC = parseInt(rfc.substr(8, 2));

    // Determinar si es siglo XX o XXI
    const añoCompleto = añoRFC > 30 ? 1900 + añoRFC : 2000 + añoRFC;

    return new Date(añoCompleto, mesRFC - 1, diaRFC);
}

module.exports = {
    generarNombreMexicano,
    generarRFC,
    generarTelefonoMexicano,
    generarDireccionMexicana,
    generarDatosMexicanosCompletos,
    calcularFechaNacimientoDesdeRFC
};
