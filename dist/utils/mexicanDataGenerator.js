"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    'Gutiérrez', 'Ruiz', 'Muñoz', 'Álvarez', 'Castillo', 'Torres', 'Vargas', 'Vázquez',
    'Mendoza', 'Ramos', 'Herrera', 'Aguilar', 'Ortiz', 'Contreras', 'Delgado', 'Guerrero',
    'Medina', 'Rojas', 'Romero', 'Moreno', 'Salinas', 'Espinoza', 'Campos', 'Ríos'
];
const CALLES = [
    'Av. Insurgentes', 'Calle 5 de Mayo', 'Av. Juárez', 'Calle Hidalgo', 'Av. Revolución',
    'Calle Madero', 'Av. Reforma', 'Calle Morelos', 'Av. Universidad', 'Calle Allende',
    'Av. Constitución', 'Calle Zaragoza', 'Av. Independencia', 'Calle Guerrero', 'Av. México',
    'Calle Aldama', 'Av. América', 'Calle Benito Juárez', 'Av. Patria', 'Calle López Mateos'
];
const COLONIAS = [
    'Centro', 'Roma Norte', 'Condesa', 'Polanco', 'Santa Fe', 'Del Valle', 'Narvarte',
    'Doctores', 'Obrera', 'Juárez', 'Cuauhtémoc', 'Guerrero', 'Tabacalera', 'Morelos',
    'Peralvillo', 'Tlatelolco', 'Lagunilla', 'Buenavista', 'Anzures', 'San Rafael'
];
const MUNICIPIOS = [
    'Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá', 'Tlajomulco', 'El Salto', 'Ixtlahuacán',
    'Juanacatlán', 'Chapala', 'Ajijic', 'Tequila', 'Amatitán', 'Hostotipaquillo', 'Magdalena',
    'Teuchitlán', 'Ahualulco', 'Etzatlán', 'San Marcos', 'Ahuacatlán', 'Jala'
];
const ESTADOS = [
    'Jalisco', 'México', 'Ciudad de México', 'Nuevo León', 'Puebla', 'Veracruz', 'Michoacán',
    'Oaxaca', 'Chiapas', 'Guerrero', 'Tamaulipas', 'Baja California', 'Sinaloa', 'Sonora',
    'Coahuila', 'Durango', 'San Luis Potosí', 'Zacatecas', 'Hidalgo', 'Morelos'
];
class MexicanDataGenerator {
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    randomFromArray(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    generateNombre(genero = 'aleatorio') {
        let nombre;
        if (genero === 'aleatorio') {
            genero = Math.random() < 0.5 ? 'masculino' : 'femenino';
        }
        if (genero === 'masculino') {
            nombre = this.randomFromArray(NOMBRES_MASCULINOS);
        }
        else {
            nombre = this.randomFromArray(NOMBRES_FEMENINOS);
        }
        const apellido1 = this.randomFromArray(APELLIDOS);
        const apellido2 = this.randomFromArray(APELLIDOS);
        return `${nombre} ${apellido1} ${apellido2}`;
    }
    generateRFC() {
        const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numeros = '0123456789';
        let rfc = '';
        for (let i = 0; i < 4; i++) {
            rfc += letras[Math.floor(Math.random() * letras.length)];
        }
        for (let i = 0; i < 6; i++) {
            rfc += numeros[Math.floor(Math.random() * numeros.length)];
        }
        const alfanumerico = letras + numeros;
        for (let i = 0; i < 3; i++) {
            rfc += alfanumerico[Math.floor(Math.random() * alfanumerico.length)];
        }
        return rfc;
    }
    generateTelefono() {
        const ladas = ['33', '55', '81', '222', '656', '667', '668', '669', '686', '687'];
        const lada = this.randomFromArray(ladas);
        const numero = this.randomBetween(1000000, 9999999);
        return `${lada}${numero}`;
    }
    generateCorreo(nombre) {
        const dominios = ['gmail.com', 'hotmail.com', 'yahoo.com.mx', 'outlook.com', 'live.com.mx'];
        const dominio = this.randomFromArray(dominios);
        const nombreLimpio = nombre
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[áàäâ]/g, 'a')
            .replace(/[éèëê]/g, 'e')
            .replace(/[íìïî]/g, 'i')
            .replace(/[óòöô]/g, 'o')
            .replace(/[úùüû]/g, 'u')
            .replace(/ñ/g, 'n')
            .replace(/[^a-z0-9]/g, '');
        const numero = this.randomBetween(1, 999);
        return `${nombreLimpio}${numero}@${dominio}`;
    }
    generateDireccion() {
        const calle = this.randomFromArray(CALLES);
        const numero = this.randomBetween(1, 999);
        const colonia = this.randomFromArray(COLONIAS);
        const municipio = this.randomFromArray(MUNICIPIOS);
        const estado = this.randomFromArray(ESTADOS);
        const cp = this.randomBetween(10000, 99999).toString();
        return {
            calle: `${calle} ${numero}`,
            colonia,
            municipio,
            estado,
            cp
        };
    }
    generateDatosMexicanos() {
        const titular = this.generateNombre();
        const rfc = this.generateRFC();
        const telefono = this.generateTelefono();
        const correo = this.generateCorreo(titular);
        const direccion = this.generateDireccion();
        return {
            titular,
            rfc,
            telefono,
            correo,
            ...direccion
        };
    }
    generateMultipleDatos(cantidad) {
        const datos = [];
        for (let i = 0; i < cantidad; i++) {
            datos.push(this.generateDatosMexicanos());
        }
        return datos;
    }
}
exports.default = MexicanDataGenerator;
