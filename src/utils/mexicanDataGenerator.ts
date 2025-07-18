/**
 * Generador de datos mexicanos aleatorios para registros OBD
 * Genera nombres, RFC, teléfonos y direcciones válidos para México
 */

import { IDatosMexicanos } from '../types/database';

// Nombres mexicanos comunes
const NOMBRES_MASCULINOS: string[] = [
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

const NOMBRES_FEMENINOS: string[] = [
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

const APELLIDOS: string[] = [
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
    'Vázquez',
    'Mendoza',
    'Ramos',
    'Herrera',
    'Aguilar',
    'Ortiz',
    'Contreras',
    'Delgado',
    'Guerrero',
    'Medina',
    'Rojas',
    'Romero',
    'Moreno',
    'Salinas',
    'Espinoza',
    'Campos',
    'Ríos'
];

const CALLES: string[] = [
    'Av. Insurgentes',
    'Calle 5 de Mayo',
    'Av. Juárez',
    'Calle Hidalgo',
    'Av. Revolución',
    'Calle Madero',
    'Av. Reforma',
    'Calle Morelos',
    'Av. Universidad',
    'Calle Allende',
    'Av. Constitución',
    'Calle Zaragoza',
    'Av. Independencia',
    'Calle Guerrero',
    'Av. México',
    'Calle Aldama',
    'Av. América',
    'Calle Benito Juárez',
    'Av. Patria',
    'Calle López Mateos'
];

const COLONIAS: string[] = [
    'Centro',
    'Roma Norte',
    'Condesa',
    'Polanco',
    'Santa Fe',
    'Del Valle',
    'Narvarte',
    'Doctores',
    'Obrera',
    'Juárez',
    'Cuauhtémoc',
    'Guerrero',
    'Tabacalera',
    'Morelos',
    'Peralvillo',
    'Tlatelolco',
    'Lagunilla',
    'Buenavista',
    'Anzures',
    'San Rafael'
];

const MUNICIPIOS: string[] = [
    'Guadalajara',
    'Zapopan',
    'Tlaquepaque',
    'Tonalá',
    'Tlajomulco',
    'El Salto',
    'Ixtlahuacán',
    'Juanacatlán',
    'Chapala',
    'Ajijic',
    'Tequila',
    'Amatitán',
    'Hostotipaquillo',
    'Magdalena',
    'Teuchitlán',
    'Ahualulco',
    'Etzatlán',
    'San Marcos',
    'Ahuacatlán',
    'Jala'
];

const ESTADOS: string[] = [
    'Jalisco',
    'México',
    'Ciudad de México',
    'Nuevo León',
    'Puebla',
    'Veracruz',
    'Michoacán',
    'Oaxaca',
    'Chiapas',
    'Guerrero',
    'Tamaulipas',
    'Baja California',
    'Sinaloa',
    'Sonora',
    'Coahuila',
    'Durango',
    'San Luis Potosí',
    'Zacatecas',
    'Hidalgo',
    'Morelos'
];

class MexicanDataGenerator {
    /**
     * Genera un número aleatorio entre min y max (inclusivo)
     */
    private randomBetween(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Selecciona un elemento aleatorio de un array
     */
    private randomFromArray<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Genera un nombre completo aleatorio
     */
    generateNombre(genero: 'masculino' | 'femenino' | 'aleatorio' = 'aleatorio'): string {
        let nombre: string;

        if (genero === 'aleatorio') {
            genero = Math.random() < 0.5 ? 'masculino' : 'femenino';
        }

        if (genero === 'masculino') {
            nombre = this.randomFromArray(NOMBRES_MASCULINOS);
        } else {
            nombre = this.randomFromArray(NOMBRES_FEMENINOS);
        }

        const apellido1 = this.randomFromArray(APELLIDOS);
        const apellido2 = this.randomFromArray(APELLIDOS);

        return `${nombre} ${apellido1} ${apellido2}`;
    }

    /**
     * Genera un RFC válido (formato básico)
     */
    generateRFC(): string {
        const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numeros = '0123456789';

        // 4 letras + 6 números + 3 caracteres alfanuméricos
        let rfc = '';

        // 4 letras iniciales
        for (let i = 0; i < 4; i++) {
            rfc += letras[Math.floor(Math.random() * letras.length)];
        }

        // 6 números (fecha)
        for (let i = 0; i < 6; i++) {
            rfc += numeros[Math.floor(Math.random() * numeros.length)];
        }

        // 3 caracteres alfanuméricos
        const alfanumerico = letras + numeros;
        for (let i = 0; i < 3; i++) {
            rfc += alfanumerico[Math.floor(Math.random() * alfanumerico.length)];
        }

        return rfc;
    }

    /**
     * Genera un teléfono mexicano válido
     */
    generateTelefono(): string {
        const ladas = ['33', '55', '81', '222', '656', '667', '668', '669', '686', '687'];
        const lada = this.randomFromArray(ladas);
        const numero = this.randomBetween(1000000, 9999999);
        return `${lada}${numero}`;
    }

    /**
     * Genera un correo electrónico
     */
    generateCorreo(nombre: string): string {
        const dominios = ['gmail.com', 'hotmail.com', 'yahoo.com.mx', 'outlook.com', 'live.com.mx'];
        const dominio = this.randomFromArray(dominios);

        // Limpiar nombre para email
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

    /**
     * Genera una dirección completa
     */
    generateDireccion(): {
        calle: string;
        colonia: string;
        municipio: string;
        estado: string;
        cp: string;
    } {
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

    /**
     * Genera un registro completo de datos mexicanos
     */
    generateDatosMexicanos(): IDatosMexicanos {
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

    /**
     * Genera múltiples registros
     */
    generateMultipleDatos(cantidad: number): IDatosMexicanos[] {
        const datos: IDatosMexicanos[] = [];

        for (let i = 0; i < cantidad; i++) {
            datos.push(this.generateDatosMexicanos());
        }

        return datos;
    }
}

export default MexicanDataGenerator;
