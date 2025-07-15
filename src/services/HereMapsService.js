// src/services/HereMapsService.js
const fetch = require('node-fetch');
const logger = require('../utils/logger');

class HereMapsService {
    constructor() {
        this.apiKey = process.env.HERE_MAPS_API_KEY;
        this.routingBaseUrl = 'https://router.hereapi.com/v8';

        if (!this.apiKey) {
            logger.warn('HERE Maps API key not found in environment variables');
        }
    }

    /**
     * Parsea diferentes tipos de entrada de coordenadas
     * @param {string} input - Entrada del usuario (coordenadas, Google Maps URL, etc.)
     * @returns {Object|null} - {lat, lng} o null si no se puede parsear
     */
    parseCoordinates(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        const inputTrimmed = input.trim();

        // Caso 1: Coordenadas directas "19.1234,-99.5678"
        const coordPattern = /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/;
        const coordMatch = inputTrimmed.match(coordPattern);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);

            // Validar rangos válidos para coordenadas
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        }

        // Caso 2: Google Maps URL - extraer coordenadas de diferentes formatos
        const googleMapsPatterns = [
            // Formato: @lat,lng,zoom
            /@(-?\d+\.?\d*),(-?\d+\.?\d*),/,
            // Formato: !3d + !4d
            /!3d(-?\d+\.?\d*).*!4d(-?\d+\.?\d*)/,
            // Formato: ?q=lat,lng
            /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/
        ];

        for (const pattern of googleMapsPatterns) {
            const match = inputTrimmed.match(pattern);
            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[2]);

                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return { lat, lng };
                }
            }
        }

        return null;
    }

    /**
     * Calcula la ruta entre dos puntos usando HERE Maps Routing API
     * @param {Object} origen - {lat, lng}
     * @param {Object} destino - {lat, lng}
     * @returns {Promise<Object>} - Información de la ruta
     */
    async calculateRoute(origen, destino) {
        if (!this.apiKey) {
            throw new Error('HERE Maps API key not configured');
        }

        if (
            !origen ||
            !destino ||
            typeof origen.lat !== 'number' ||
            typeof origen.lng !== 'number' ||
            typeof destino.lat !== 'number' ||
            typeof destino.lng !== 'number'
        ) {
            throw new Error('Invalid coordinates provided');
        }

        try {
            const url =
                `${this.routingBaseUrl}/routes?` +
                `origin=${origen.lat},${origen.lng}&` +
                `destination=${destino.lat},${destino.lng}&` +
                'transportMode=car&' +
                'return=summary&' +
                `apikey=${this.apiKey}`;

            logger.info(
                `Calculando ruta HERE Maps: ${origen.lat},${origen.lng} -> ${destino.lat},${destino.lng}`
            );

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`HERE Maps API error: ${response.status} - ${errorText}`);
                throw new Error(`HERE Maps API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.routes || data.routes.length === 0) {
                throw new Error('No routes found');
            }

            const route = data.routes[0];
            const summary = route.sections[0].summary;

            // Convertir metros a kilómetros y segundos a minutos
            const distanciaKm = Math.round((summary.length / 1000) * 100) / 100; // Redondear a 2 decimales
            const tiempoMinutos = Math.round(summary.duration / 60); // Redondear a minutos enteros

            const resultado = {
                distanciaKm,
                tiempoMinutos,
                googleMapsUrl: this.generateGoogleMapsUrl(origen, destino)
            };

            logger.info(`Ruta calculada: ${distanciaKm}km, ${tiempoMinutos}min`);
            return resultado;
        } catch (error) {
            logger.error('Error calculating route with HERE Maps:', error);

            // Fallback: calcular distancia aproximada usando fórmula de Haversine
            const distanciaAproximada = this.calculateHaversineDistance(origen, destino);
            const tiempoAproximado = Math.round(distanciaAproximada * 2); // Aprox 2 min por km en ciudad

            logger.info(
                `Usando cálculo aproximado: ${distanciaAproximada}km, ${tiempoAproximado}min`
            );

            return {
                distanciaKm: distanciaAproximada,
                tiempoMinutos: tiempoAproximado,
                googleMapsUrl: this.generateGoogleMapsUrl(origen, destino),
                aproximado: true
            };
        }
    }

    /**
     * Calcula la distancia usando la fórmula de Haversine (fallback)
     * @param {Object} origen - {lat, lng}
     * @param {Object} destino - {lat, lng}
     * @returns {number} - Distancia en kilómetros
     */
    calculateHaversineDistance(origen, destino) {
        const R = 6371; // Radio de la Tierra en km
        const dLat = this.toRadians(destino.lat - origen.lat);
        const dLng = this.toRadians(destino.lng - origen.lng);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(origen.lat)) *
                Math.cos(this.toRadians(destino.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return Math.round(distance * 100) / 100; // Redondear a 2 decimales
    }

    /**
     * Convierte grados a radianes
     * @param {number} degrees - Grados
     * @returns {number} - Radianes
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Genera URL de Google Maps para direcciones
     * @param {Object} origen - {lat, lng}
     * @param {Object} destino - {lat, lng}
     * @returns {string} - URL de Google Maps
     */
    generateGoogleMapsUrl(origen, destino) {
        return `https://www.google.com/maps/dir/${origen.lat},${origen.lng}/${destino.lat},${destino.lng}`;
    }

    /**
     * Realiza geocoding reverso para obtener información de ubicación
     * @param {number} lat - Latitud
     * @param {number} lng - Longitud
     * @returns {Promise<Object>} - Información de la ubicación
     */
    async reverseGeocode(lat, lng) {
        if (!this.apiKey) {
            throw new Error('HERE Maps API key not configured');
        }

        if (typeof lat !== 'number' || typeof lng !== 'number') {
            throw new Error('Invalid coordinates provided');
        }

        try {
            const url =
                'https://revgeocode.search.hereapi.com/v1/revgeocode?' +
                `at=${lat},${lng}&` +
                'lang=es-MX&' +
                `apikey=${this.apiKey}`;

            logger.info(`Realizando geocoding reverso: ${lat},${lng}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`HERE Maps Geocoding error: ${response.status} - ${errorText}`);
                throw new Error(`HERE Maps Geocoding error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error('No geocoding results found');
            }

            const item = data.items[0];
            const address = item.address;

            // Extraer información relevante
            const resultado = {
                colonia: address.district || address.subDistrict || '',
                municipio: address.city || address.county || '',
                estado: address.state || '',
                pais: address.countryName || '',
                codigoPostal: address.postalCode || '',
                direccionCompleta: item.title || '',
                // Formato simplificado para mostrar
                ubicacionCorta: this.formatUbicacionCorta(address)
            };

            logger.info(`Geocoding reverso exitoso: ${resultado.ubicacionCorta}`);
            return resultado;
        } catch (error) {
            logger.error('Error en geocoding reverso:', error);

            // Fallback: retornar coordenadas formateadas
            return {
                colonia: '',
                municipio: '',
                estado: '',
                pais: '',
                codigoPostal: '',
                direccionCompleta: `${lat}, ${lng}`,
                ubicacionCorta: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                fallback: true
            };
        }
    }

    /**
     * Formatea la ubicación en formato corto
     * @param {Object} address - Datos de dirección de HERE Maps
     * @returns {string} - Ubicación formateada
     */
    formatUbicacionCorta(address) {
        // Priorizar colonia y municipio
        const colonia = address.district || address.subDistrict || '';
        const municipio = address.city || address.county || '';

        if (colonia && municipio) {
            return `${colonia} - ${municipio}`;
        } else if (municipio) {
            return municipio;
        } else if (colonia) {
            return colonia;
        } else {
            // Fallback si no hay datos específicos
            return address.label || address.title || 'Ubicación desconocida';
        }
    }

    /**
     * Procesa entrada del usuario y calcula ruta si es posible
     * @param {string} origenInput - Entrada del usuario para origen
     * @param {string} destinoInput - Entrada del usuario para destino
     * @returns {Promise<Object>} - Resultado con coordenadas y ruta
     */
    async processUserInput(origenInput, destinoInput) {
        const resultado = {
            origen: null,
            destino: null,
            rutaInfo: null,
            error: null
        };

        try {
            // Parsear coordenadas de origen
            resultado.origen = this.parseCoordinates(origenInput);
            if (!resultado.origen) {
                resultado.error = `No se pudieron extraer coordenadas del origen: "${origenInput}"`;
                return resultado;
            }

            // Parsear coordenadas de destino
            resultado.destino = this.parseCoordinates(destinoInput);
            if (!resultado.destino) {
                resultado.error = `No se pudieron extraer coordenadas del destino: "${destinoInput}"`;
                return resultado;
            }

            // Calcular ruta
            resultado.rutaInfo = await this.calculateRoute(resultado.origen, resultado.destino);

            return resultado;
        } catch (error) {
            logger.error('Error processing user input:', error);
            resultado.error = `Error al procesar coordenadas: ${error.message}`;
            return resultado;
        }
    }
}

module.exports = HereMapsService;
