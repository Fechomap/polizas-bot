"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const logger_1 = __importDefault(require("../utils/logger"));
class HereMapsService {
    constructor() {
        this.apiKey = process.env.HERE_MAPS_API_KEY;
        this.routingBaseUrl = 'https://router.hereapi.com/v8';
        if (!this.apiKey) {
            logger_1.default.warn('HERE Maps API key not found in environment variables');
        }
    }
    parseCoordinates(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }
        const inputTrimmed = input.trim();
        const coordPattern = /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/;
        const coordMatch = inputTrimmed.match(coordPattern);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        }
        const googleMapsPatterns = [
            /@(-?\d+\.?\d*),(-?\d+\.?\d*),/,
            /!3d(-?\d+\.?\d*).*!4d(-?\d+\.?\d*)/,
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
    async calculateRoute(origen, destino) {
        if (!this.apiKey) {
            throw new Error('HERE Maps API key not configured');
        }
        if (!origen ||
            !destino ||
            typeof origen.lat !== 'number' ||
            typeof origen.lng !== 'number' ||
            typeof destino.lat !== 'number' ||
            typeof destino.lng !== 'number') {
            throw new Error('Invalid coordinates provided');
        }
        try {
            const url = `${this.routingBaseUrl}/routes?` +
                `origin=${origen.lat},${origen.lng}&` +
                `destination=${destino.lat},${destino.lng}&` +
                'transportMode=car&' +
                'return=summary&' +
                `apikey=${this.apiKey}`;
            logger_1.default.info(`Calculando ruta HERE Maps: ${origen.lat},${origen.lng} -> ${destino.lat},${destino.lng}`);
            const response = await (0, node_fetch_1.default)(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger_1.default.error(`HERE Maps API error: ${response.status} - ${errorText}`);
                throw new Error(`HERE Maps API error: ${response.status}`);
            }
            const data = await response.json();
            if (!data.routes || data.routes.length === 0) {
                throw new Error('No routes found');
            }
            const route = data.routes[0];
            const summary = route.sections[0].summary;
            const distanciaKm = Math.round((summary.length / 1000) * 100) / 100;
            const tiempoMinutos = Math.round(summary.duration / 60);
            const resultado = {
                distanciaKm,
                tiempoMinutos,
                googleMapsUrl: this.generateGoogleMapsUrl(origen, destino)
            };
            logger_1.default.info(`Ruta calculada: ${distanciaKm}km, ${tiempoMinutos}min`);
            return resultado;
        }
        catch (error) {
            logger_1.default.error('Error calculating route with HERE Maps:', error);
            const distanciaAproximada = this.calculateHaversineDistance(origen, destino);
            const tiempoAproximado = Math.round(distanciaAproximada * 2);
            logger_1.default.info(`Usando cálculo aproximado: ${distanciaAproximada}km, ${tiempoAproximado}min`);
            return {
                distanciaKm: distanciaAproximada,
                tiempoMinutos: tiempoAproximado,
                googleMapsUrl: this.generateGoogleMapsUrl(origen, destino),
                aproximado: true
            };
        }
    }
    calculateHaversineDistance(origen, destino) {
        const R = 6371;
        const dLat = this.toRadians(destino.lat - origen.lat);
        const dLng = this.toRadians(destino.lng - origen.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(origen.lat)) *
                Math.cos(this.toRadians(destino.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return Math.round(distance * 100) / 100;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    generateGoogleMapsUrl(origen, destino) {
        return `https://www.google.com/maps/dir/${origen.lat},${origen.lng}/${destino.lat},${destino.lng}`;
    }
    async reverseGeocode(lat, lng) {
        if (!this.apiKey) {
            throw new Error('HERE Maps API key not configured');
        }
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            throw new Error('Invalid coordinates provided');
        }
        try {
            const url = 'https://revgeocode.search.hereapi.com/v1/revgeocode?' +
                `at=${lat},${lng}&` +
                'lang=es-MX&' +
                `apikey=${this.apiKey}`;
            logger_1.default.info(`Realizando geocoding reverso: ${lat},${lng}`);
            const response = await (0, node_fetch_1.default)(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger_1.default.error(`HERE Maps Geocoding error: ${response.status} - ${errorText}`);
                throw new Error(`HERE Maps Geocoding error: ${response.status}`);
            }
            const data = await response.json();
            if (!data.items || data.items.length === 0) {
                throw new Error('No geocoding results found');
            }
            const item = data.items[0];
            const address = item.address;
            const resultado = {
                colonia: address.district || address.subDistrict || '',
                municipio: address.city || address.county || '',
                estado: address.state || '',
                pais: address.countryName || '',
                codigoPostal: address.postalCode || '',
                direccionCompleta: item.title || '',
                ubicacionCorta: this.formatUbicacionCorta(address)
            };
            logger_1.default.info(`Geocoding reverso exitoso: ${resultado.ubicacionCorta}`);
            return resultado;
        }
        catch (error) {
            logger_1.default.error('Error en geocoding reverso:', error);
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
    formatUbicacionCorta(address) {
        const colonia = address.district || address.subDistrict || '';
        const municipio = address.city || address.county || '';
        if (colonia && municipio) {
            return `${colonia} - ${municipio}`;
        }
        else if (municipio) {
            return municipio;
        }
        else if (colonia) {
            return colonia;
        }
        else {
            return address.label || address.title || 'Ubicación desconocida';
        }
    }
    async processUserInput(origenInput, destinoInput) {
        const resultado = {
            origen: null,
            destino: null,
            rutaInfo: null,
            error: null
        };
        try {
            resultado.origen = this.parseCoordinates(origenInput);
            if (!resultado.origen) {
                resultado.error = `No se pudieron extraer coordenadas del origen: "${origenInput}"`;
                return resultado;
            }
            resultado.destino = this.parseCoordinates(destinoInput);
            if (!resultado.destino) {
                resultado.error = `No se pudieron extraer coordenadas del destino: "${destinoInput}"`;
                return resultado;
            }
            resultado.rutaInfo = await this.calculateRoute(resultado.origen, resultado.destino);
            return resultado;
        }
        catch (error) {
            logger_1.default.error('Error processing user input:', error);
            resultado.error = `Error al procesar coordenadas: ${error instanceof Error ? error.message : String(error)}`;
            return resultado;
        }
    }
}
exports.default = HereMapsService;
