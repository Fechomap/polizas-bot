/**
 * Generador de datos mexicanos aleatorios para registros OBD
 * Genera nombres, RFC, teléfonos y direcciones válidos para México
 */

// Nombres mexicanos comunes
const NOMBRES_MASCULINOS = [
    'José', 'Luis', 'Juan', 'Miguel', 'Carlos', 'Francisco', 'Antonio', 'Alejandro',
    'Manuel', 'Rafael', 'Pedro', 'Daniel', 'Fernando', 'Jorge', 'Ricardo', 'David',
    'Eduardo', 'Roberto', 'Sergio', 'Alberto', 'Javier', 'Arturo', 'Raúl', 'Gerardo',
    'Enrique', 'Guillermo', 'Óscar', 'Rubén', 'Héctor', 'Armando', 'Salvador', 'Ramón'
];

const NOMBRES_FEMENINOS = [
    'María', 'Guadalupe', 'Juana', 'Margarita', 'Francisca', 'Elena', 'Rosa', 'Verónica',
    'Teresa', 'Leticia', 'Carmen', 'Ana', 'Silvia', 'Patricia', 'Martha', 'Josefina',
    'Gloria', 'Sandra', 'Alicia', 'Adriana', 'Beatriz', 'Laura', 'Claudia', 'Norma',
    'Alejandra', 'Gabriela', 'Mónica', 'Isabel', 'Rocío', 'Esperanza', 'Dolores', 'Luz'
];

const APELLIDOS = [
    'García', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'González', 'Pérez', 'Sánchez',
    'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Jiménez',
    'Gutiérrez', 'Ruiz', 'Muñoz', 'Álvarez', 'Castillo', 'Torres', 'Vargas', 'Ramos',
    'Castro', 'Ortega', 'Silva', 'Mendoza', 'Moreno', 'Guerrero', 'Medina', 'Romero',
    'Vázquez', 'Contreras', 'Aguilar', 'Herrera', 'Luna', 'Delgado', 'Vega', 'Campos'
];

// Estados y ciudades de México
const ESTADOS_CIUDADES = {
    'Ciudad de México': ['Ciudad de México', 'Coyoacán', 'Benito Juárez', 'Miguel Hidalgo'],
    'Estado de México': ['Toluca', 'Ecatepec', 'Naucalpan', 'Tlalnepantla'],
    'Jalisco': ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá'],
    'Nuevo León': ['Monterrey', 'Guadalupe', 'San Nicolás', 'Apodaca'],
    'Puebla': ['Puebla', 'Tehuacán', 'San Martín Texmelucan', 'Atlixco'],
    'Veracruz': ['Veracruz', 'Xalapa', 'Coatzacoalcos', 'Córdoba'],
    'Guanajuato': ['León', 'Irapuato', 'Celaya', 'Salamanca'],
    'Chihuahua': ['Chihuahua', 'Ciudad Juárez', 'Delicias', 'Parral'],
    'Sonora': ['Hermosillo', 'Ciudad Obregón', 'Nogales', 'Navojoa'],
    'Michoacán': ['Morelia', 'Uruapan', 'Zamora', 'Lázaro Cárdenas']
};

const COLONIAS = [
    'Centro', 'Roma Norte', 'Condesa', 'Polanco', 'Del Valle', 'Narvarte',
    'Doctores', 'Obrera', 'Juárez', 'Santa María la Ribera', 'Escandón',
    'San Rafael', 'Ampliación Granada', 'Portales', 'Álamos', 'Vértiz Narvarte'
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

    // Generar fecha de nacimiento aleatoria (18-80 años)
    const añoActual = new Date().getFullYear();
    const añoNacimiento = añoActual - Math.floor(Math.random() * 62) - 18; // 18-80 años
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
 * @returns {string} Teléfono en formato +52 XX XXXX XXXX
 */
function generarTelefonoMexicano() {
    // Códigos de área comunes en México
    const codigosArea = ['55', '33', '81', '222', '229', '477', '614', '662', '443', '771'];
    const codigoArea = codigosArea[Math.floor(Math.random() * codigosArea.length)];

    // Generar número de 7 u 8 dígitos según el código de área
    const longitudNumero = codigoArea.length === 2 ? 8 : 7;
    let numero = '';

    for (let i = 0; i < longitudNumero; i++) {
        numero += Math.floor(Math.random() * 10);
    }

    // Formatear como +52 XX XXXX XXXX
    const parte1 = numero.substring(0, 4);
    const parte2 = numero.substring(4);

    return `+52 ${codigoArea} ${parte1} ${parte2}`;
}

/**
 * Genera una dirección mexicana aleatoria
 * @returns {object} Objeto con dirección completa
 */
function generarDireccionMexicana() {
    const estados = Object.keys(ESTADOS_CIUDADES);
    const estado = estados[Math.floor(Math.random() * estados.length)];
    const ciudades = ESTADOS_CIUDADES[estado];
    const municipio = ciudades[Math.floor(Math.random() * ciudades.length)];

    const colonia = COLONIAS[Math.floor(Math.random() * COLONIAS.length)];

    // Generar calle y número
    const tiposCalle = ['Calle', 'Avenida', 'Boulevard', 'Privada'];
    const tipoCalle = tiposCalle[Math.floor(Math.random() * tiposCalle.length)];
    const nombreCalle = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
    const numero = Math.floor(Math.random() * 999) + 1;

    const calle = `${tipoCalle} ${nombreCalle} ${numero}`;

    // Código postal (5 dígitos)
    const cp = String(Math.floor(Math.random() * 90000) + 10000);

    return {
        calle,
        colonia,
        municipio,
        estadoRegion: estado,
        cp
    };
}

/**
 * Genera un conjunto completo de datos mexicanos aleatorios
 * @param {string} genero - 'M', 'F' o null para aleatorio
 * @returns {object} Datos completos de una persona mexicana
 */
function generarDatosMexicanosCompletos(genero = null) {
    const persona = generarNombreMexicano(genero);
    const rfc = generarRFC(persona);
    const telefono = generarTelefonoMexicano();
    const direccion = generarDireccionMexicana();

    // Generar correo electrónico
    const dominios = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'];
    const dominio = dominios[Math.floor(Math.random() * dominios.length)];
    const correo = `${persona.nombre.toLowerCase()}.${persona.apellido1.toLowerCase()}${Math.floor(Math.random() * 999)}@${dominio}`;

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
        contraseña: Math.random().toString(36).slice(-8)
    };
}

module.exports = {
    generarNombreMexicano,
    generarRFC,
    generarTelefonoMexicano,
    generarDireccionMexicana,
    generarDatosMexicanosCompletos
};
