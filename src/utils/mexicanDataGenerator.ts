/**
 * Generador de datos mexicanos aleatorios para registros OBD
 * Genera nombres, RFC, teléfonos y direcciones válidos para México
 */

import { IDatosMexicanos } from '../types/database';
import HereMapsService from '../services/HereMapsService';

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
    // ZMVM - Ciudad de México
    'Álvaro Obregón',
    'Azcapotzalco',
    'Benito Juárez',
    'Coyoacán',
    'Cuauhtémoc',
    'Gustavo A. Madero',
    'Iztacalco',
    'Iztapalapa',
    'Magdalena Contreras',
    'Miguel Hidalgo',
    'Milpa Alta',
    'Tláhuac',
    'Tlalpan',
    'Venustiano Carranza',
    'Xochimilco',
    
    // ZMVM - Estado de México
    'Naucalpan de Juárez',
    'Nezahualcóyotl',
    'Ecatepec de Morelos',
    'Tlalnepantla de Baz',
    'Chimalhuacán',
    'Atizapán de Zaragoza',
    'Cuautitlán Izcalli',
    'Tultitlán',
    'Coacalco de Berriozábal',
    'Huixquilucan',
    'Nicolás Romero',
    
    // Toluca y zona
    'Toluca',
    'Zinacantepec',
    'Metepec',
    'Lerma',
    
    // Pachuca - Hidalgo
    'Pachuca de Soto',
    'Mineral de la Reforma',
    'Zempoala',
    
    // Morelos
    'Cuernavaca',
    'Cuautla',
    'Jiutepec',
    'Temixco',
    
    // Puebla
    'Puebla',
    'Cholula',
    'San Andrés Cholula',
    'Atlixco'
];

const ESTADOS: string[] = [
    'Ciudad de México',
    'México',
    'Hidalgo',
    'Morelos',
    'Puebla'
];

// Coordenadas válidas de la Zona Metropolitana del Valle de México (ZMVM)
// Incluye CDMX, Estado de México y zonas conurbadas
const COORDENADAS_ZMVM: { lat: number; lng: number }[] = [
    // CDMX - Centro
    { lat: 19.4326, lng: -99.1332 },
    { lat: 19.4200, lng: -99.1467 },
    { lat: 19.4284, lng: -99.1276 },
    
    // CDMX - Zona Norte
    { lat: 19.4889, lng: -99.1279 },
    { lat: 19.5124, lng: -99.1567 },
    { lat: 19.4751, lng: -99.1139 },
    
    // CDMX - Zona Sur
    { lat: 19.3844, lng: -99.1413 },
    { lat: 19.3479, lng: -99.1636 },
    { lat: 19.3210, lng: -99.1546 },
    
    // CDMX - Zona Oriente
    { lat: 19.4091, lng: -99.0731 },
    { lat: 19.3570, lng: -99.0559 },
    { lat: 19.4142, lng: -99.0328 },
    
    // CDMX - Zona Poniente
    { lat: 19.4003, lng: -99.2619 },
    { lat: 19.4267, lng: -99.2019 },
    { lat: 19.3736, lng: -99.2587 },
    
    // Estado de México - Naucalpan
    { lat: 19.4737, lng: -99.2394 },
    { lat: 19.4885, lng: -99.2269 },
    
    // Estado de México - Tlalnepantla
    { lat: 19.5408, lng: -99.1951 },
    { lat: 19.5287, lng: -99.1874 },
    
    // Estado de México - Ecatepec
    { lat: 19.6010, lng: -99.0537 },
    { lat: 19.5843, lng: -99.0324 },
    
    // Estado de México - Nezahualcóyotl
    { lat: 19.4003, lng: -99.0145 },
    { lat: 19.4142, lng: -99.0047 },
    
    // Estado de México - Atizapán
    { lat: 19.5811, lng: -99.2547 },
    { lat: 19.5692, lng: -99.2389 },
    
    // Estado de México - Tultitlán
    { lat: 19.6450, lng: -99.1374 },
    { lat: 19.6328, lng: -99.1256 },
    
    // Estado de México - Coacalco
    { lat: 19.6255, lng: -99.1069 },
    { lat: 19.6143, lng: -99.0987 },
    
    // Estado de México - Cuautitlán Izcalli
    { lat: 19.6459, lng: -99.2359 },
    { lat: 19.6287, lng: -99.2187 },
    
    // Estado de México - Huixquilucan
    { lat: 19.3642, lng: -99.3508 },
    { lat: 19.3789, lng: -99.3287 },
    
    // Toluca y zona metropolitana
    { lat: 19.2926, lng: -99.6568 },
    { lat: 19.3017, lng: -99.6789 },
    { lat: 19.2834, lng: -99.6432 },
    
    // Pachuca - Hidalgo
    { lat: 20.1011, lng: -98.7624 },
    { lat: 20.0897, lng: -98.7456 },
    
    // Cuernavaca - Morelos
    { lat: 18.9261, lng: -99.2319 },
    { lat: 18.9134, lng: -99.2156 },
    
    // Puebla
    { lat: 19.0414, lng: -98.2063 },
    { lat: 19.0320, lng: -98.1889 }
];

class MexicanDataGenerator {
    private hereMapsService: HereMapsService;

    constructor() {
        this.hereMapsService = new HereMapsService();
    }

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
        const dominios = ['gmail.com', 'hotmail.com', 'outlook.com'];
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
     * Genera una dirección completa usando reverse geocoding con coordenadas reales
     */
    async generateDireccionReal(): Promise<{
        calle: string;
        colonia: string;
        municipio: string;
        estado: string;
        cp: string;
        coordenadas: { lat: number; lng: number };
    }> {
        try {
            // Seleccionar coordenadas aleatorias de la ZMVM
            const coordenadas = this.randomFromArray(COORDENADAS_ZMVM);
            
            // Agregar pequeña variación para obtener direcciones más específicas
            const variacionLat = (Math.random() - 0.5) * 0.01; // ±0.005 grados (~500m)
            const variacionLng = (Math.random() - 0.5) * 0.01;
            
            const coordenadasFinales = {
                lat: coordenadas.lat + variacionLat,
                lng: coordenadas.lng + variacionLng
            };

            // Realizar reverse geocoding
            const geocodeResult = await this.hereMapsService.reverseGeocode(
                coordenadasFinales.lat,
                coordenadasFinales.lng
            );

            if (geocodeResult.fallback) {
                // Si falla el geocoding, usar datos estáticos con las coordenadas
                return this.generateDireccionFallback(coordenadasFinales);
            }

            // Procesar resultado del geocoding
            let calle = geocodeResult.direccionCompleta;
            
            // Extraer y limpiar la dirección
            if (calle.includes(',')) {
                calle = calle.split(',')[0].trim();
            }
            
            // Si no tiene número, agregarlo
            if (!/\d/.test(calle)) {
                const numero = this.randomBetween(1, 999);
                calle = `${calle} ${numero}`;
            }

            return {
                calle: calle || `${this.randomFromArray(CALLES)} ${this.randomBetween(1, 999)}`,
                colonia: geocodeResult.colonia || this.randomFromArray(COLONIAS),
                municipio: geocodeResult.municipio || this.randomFromArray(MUNICIPIOS),
                estado: geocodeResult.estado || this.randomFromArray(ESTADOS),
                cp: geocodeResult.codigoPostal || this.randomBetween(10000, 99999).toString(),
                coordenadas: coordenadasFinales
            };
        } catch (error) {
            console.warn('Error en reverse geocoding, usando fallback:', error);
            // Fallback a coordenadas aleatorias con datos estáticos
            const coordenadas = this.randomFromArray(COORDENADAS_ZMVM);
            return this.generateDireccionFallback(coordenadas);
        }
    }

    /**
     * Genera dirección fallback con coordenadas pero datos estáticos
     */
    private generateDireccionFallback(coordenadas: { lat: number; lng: number }): {
        calle: string;
        colonia: string;
        municipio: string;
        estado: string;
        cp: string;
        coordenadas: { lat: number; lng: number };
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
            cp,
            coordenadas
        };
    }

    /**
     * Genera una dirección completa (método síncrono legacy)
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
     * Genera un registro completo de datos mexicanos con direcciones reales
     */
    async generateDatosMexicanosReales(): Promise<IDatosMexicanos> {
        const titular = this.generateNombre();
        const rfc = this.generateRFC();
        const telefono = 'SIN NÚMERO';
        const correo = this.generateCorreo(titular);
        const direccion = await this.generateDireccionReal();

        return {
            titular,
            rfc,
            telefono,
            correo,
            calle: direccion.calle,
            colonia: direccion.colonia,
            municipio: direccion.municipio,
            estado: direccion.estado,
            estadoRegion: direccion.estado,
            cp: direccion.cp,
            coordenadas: direccion.coordenadas
        };
    }

    /**
     * Genera un registro completo de datos mexicanos (método síncrono legacy)
     */
    generateDatosMexicanos(): IDatosMexicanos {
        const titular = this.generateNombre();
        const rfc = this.generateRFC();
        const telefono = 'SIN NÚMERO';
        const correo = this.generateCorreo(titular);
        const direccion = this.generateDireccion();

        return {
            titular,
            rfc,
            telefono,
            correo,
            ...direccion,
            estadoRegion: direccion.estado
        };
    }

    /**
     * Genera múltiples registros con direcciones reales
     */
    async generateMultipleDatosReales(cantidad: number): Promise<IDatosMexicanos[]> {
        const datos: IDatosMexicanos[] = [];

        for (let i = 0; i < cantidad; i++) {
            datos.push(await this.generateDatosMexicanosReales());
            // Pequeña pausa para no sobrecargar la API
            if (i < cantidad - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return datos;
    }

    /**
     * Genera múltiples registros (método síncrono legacy)
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

// Función helper asíncrona para direcciones reales
export async function generarDatosMexicanosReales(): Promise<IDatosMexicanos> {
    const generator = new MexicanDataGenerator();
    return await generator.generateDatosMexicanosReales();
}

// Función helper para compatibilidad con código existente (síncrona)
export function generarDatosMexicanosCompletos(): IDatosMexicanos {
    const generator = new MexicanDataGenerator();
    return generator.generateDatosMexicanos();
}

// Compatibilidad con CommonJS
module.exports = {
    default: MexicanDataGenerator,
    generarDatosMexicanosReales,
    generarDatosMexicanosCompletos
};
