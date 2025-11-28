/**
 * LegendService - Servicio para generar y enviar leyendas al grupo
 *
 * Responsabilidad única: Construcción y envío de leyendas con efecto typing
 */

import logger from '../../../utils/logger';
import HereMapsService from '../../../services/HereMapsService';
import type { IPolicy } from '../../../types/database';
import type { ICoordinates, IEnhancedLegendData, IGeocodingInfo } from '../types';

class LegendService {
    private hereMapsService: HereMapsService;

    constructor() {
        this.hereMapsService = new HereMapsService();
    }

    /**
     * Genera una leyenda mejorada con geocoding reverso
     */
    async generateEnhancedLegend(
        policy: IPolicy,
        origenCoords: ICoordinates,
        destinoCoords: ICoordinates,
        rutaInfo: any
    ): Promise<IEnhancedLegendData> {
        try {
            // Realizar geocoding reverso para origen y destino
            const [origenGeoRaw, destinoGeoRaw] = await Promise.all([
                this.hereMapsService.reverseGeocode(origenCoords.lat, origenCoords.lng),
                this.hereMapsService.reverseGeocode(destinoCoords.lat, destinoCoords.lng)
            ]);

            // Generar URL de Google Maps
            const googleMapsUrl = this.hereMapsService.generateGoogleMapsUrl(
                origenCoords,
                destinoCoords
            );

            // Mapear a IGeocodingInfo con todos los campos
            const origenGeo: IGeocodingInfo = {
                ubicacionCorta: origenGeoRaw.ubicacionCorta,
                direccionCompleta: origenGeoRaw.direccionCompleta,
                colonia: origenGeoRaw.colonia,
                municipio: origenGeoRaw.municipio,
                estado: origenGeoRaw.estado,
                pais: origenGeoRaw.pais,
                codigoPostal: origenGeoRaw.codigoPostal,
                fallback: origenGeoRaw.fallback
            };

            const destinoGeo: IGeocodingInfo = {
                ubicacionCorta: destinoGeoRaw.ubicacionCorta,
                direccionCompleta: destinoGeoRaw.direccionCompleta,
                colonia: destinoGeoRaw.colonia,
                municipio: destinoGeoRaw.municipio,
                estado: destinoGeoRaw.estado,
                pais: destinoGeoRaw.pais,
                codigoPostal: destinoGeoRaw.codigoPostal,
                fallback: destinoGeoRaw.fallback
            };

            // Formato de ubicación simplificado: "Colonia - Municipio"
            const origenTexto = origenGeo.ubicacionCorta.toUpperCase();
            const destinoTexto = destinoGeo.ubicacionCorta.toUpperCase();

            // Nuevo formato de leyenda con diseño visual llamativo
            const leyenda = this.buildLegendText(policy, origenTexto, destinoTexto, googleMapsUrl);

            logger.info('Leyenda mejorada generada exitosamente');

            return {
                leyenda,
                origenGeo,
                destinoGeo,
                googleMapsUrl
            };
        } catch (error) {
            logger.error('Error generando leyenda mejorada:', error);
            return this.buildFallbackLegend(policy, origenCoords, destinoCoords);
        }
    }

    /**
     * Construye el texto de la leyenda
     */
    private buildLegendText(
        policy: IPolicy,
        origenTexto: string,
        destinoTexto: string,
        googleMapsUrl: string
    ): string {
        return (
            '⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️\n' +
            `🔥 A L E R T A.    ${policy.aseguradora} 🔥\n` +
            '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n\n' +
            `🚗 ${policy.marca} - ${policy.submarca} - ${policy.año}\n\n` +
            `🔸 ORIGEN: ${origenTexto}\n` +
            `🔸 DESTINO: ${destinoTexto}\n\n` +
            `🗺️ ${googleMapsUrl}\n\n` +
            '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n' +
            '🌟 S E R V I C I O     A C T I V O 🌟\n' +
            '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀'
        );
    }

    /**
     * Genera leyenda de fallback cuando falla el geocoding
     */
    private buildFallbackLegend(
        policy: IPolicy,
        origenCoords: ICoordinates,
        destinoCoords: ICoordinates
    ): IEnhancedLegendData {
        const googleMapsUrl = this.hereMapsService.generateGoogleMapsUrl(
            origenCoords,
            destinoCoords
        );

        const leyenda =
            '⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️\n' +
            `🔥 A L E R T A.    ${policy.aseguradora} 🔥\n` +
            '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n\n' +
            `🚗 ${policy.marca} - ${policy.submarca} - ${policy.año}\n\n` +
            `🔸 ORIGEN: ${origenCoords.lat.toFixed(4)}, ${origenCoords.lng.toFixed(4)}\n` +
            `🔸 DESTINO: ${destinoCoords.lat.toFixed(4)}, ${destinoCoords.lng.toFixed(4)}\n\n` +
            `🗺️ ${googleMapsUrl}\n\n` +
            '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n' +
            '🌟 S E R V I C I O     A C T I V O 🌟\n' +
            '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀';

        return {
            leyenda,
            origenGeo: {
                ubicacionCorta: `${origenCoords.lat.toFixed(4)}, ${origenCoords.lng.toFixed(4)}`,
                fallback: true
            },
            destinoGeo: {
                ubicacionCorta: `${destinoCoords.lat.toFixed(4)}, ${destinoCoords.lng.toFixed(4)}`,
                fallback: true
            },
            googleMapsUrl
        };
    }

    /**
     * Envía leyenda al grupo con efecto typing (morado - nuevo servicio)
     */
    async sendLegendWithTypingEffect(
        telegram: any,
        targetGroupId: number,
        policy: IPolicy,
        enhancedData: IEnhancedLegendData
    ): Promise<void> {
        try {
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            if (!policy || !enhancedData?.origenGeo || !enhancedData.destinoGeo) {
                logger.error('Datos insuficientes para leyenda con efecto typing');
                throw new Error('Datos insuficientes para generar leyenda');
            }

            const mensajes = [
                '🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣',
                '🔥 PENDIENTES',
                `🔥 ALERTA ${policy.aseguradora ?? 'DESCONOCIDA'}`,
                `🔥 ${policy.marca ?? 'MARCA'} - ${policy.submarca ?? 'SUBMARCA'} - ${policy.año ?? 'AÑO'}`,
                `🔥 ORIGEN: ${enhancedData.origenGeo.ubicacionCorta?.toUpperCase() ?? 'ORIGEN DESCONOCIDO'}`,
                `🔥 DESTINO: ${enhancedData.destinoGeo.ubicacionCorta?.toUpperCase() ?? 'DESTINO DESCONOCIDO'}`
            ];

            for (let i = 0; i < mensajes.length; i++) {
                const mensaje = mensajes[i];
                if (!mensaje || mensaje.trim().length === 0) continue;

                await telegram.sendMessage(targetGroupId, mensaje);
                logger.info(`Mensaje ${i + 1}/${mensajes.length} enviado`);

                if (i < mensajes.length - 1) {
                    await delay(250);
                }
            }

            await delay(250);
            await telegram.sendMessage(
                targetGroupId,
                `🗺️ ${enhancedData.googleMapsUrl ?? 'URL no disponible'}`
            );

            await delay(250);
            await telegram.sendMessage(targetGroupId, '🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣');

            logger.info('Secuencia de leyenda morada completada');
        } catch (error) {
            logger.error('Error enviando leyenda con efecto typing:', error);
            await telegram.sendMessage(targetGroupId, enhancedData.leyenda);
        }
    }

    /**
     * Envía leyenda al grupo con efecto typing (azul - registro de servicio)
     */
    async sendBlueLegendWithTypingEffect(
        telegram: any,
        targetGroupId: number,
        policy: IPolicy,
        enhancedData: IEnhancedLegendData
    ): Promise<void> {
        try {
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            if (!policy || !enhancedData?.origenGeo || !enhancedData.destinoGeo) {
                logger.error('Datos insuficientes para leyenda azul');
                throw new Error('Datos insuficientes para generar leyenda azul');
            }

            const mensajes = [
                '🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵',
                '🔥 PENDIENTES',
                `🔥 ALERTA ${policy.aseguradora ?? 'DESCONOCIDA'}`,
                `🔥 ${policy.marca ?? 'MARCA'} - ${policy.submarca ?? 'SUBMARCA'} - ${policy.año ?? 'AÑO'}`,
                `🔥 ORIGEN: ${enhancedData.origenGeo.ubicacionCorta?.toUpperCase() ?? 'ORIGEN DESCONOCIDO'}`,
                `🔥 DESTINO: ${enhancedData.destinoGeo.ubicacionCorta?.toUpperCase() ?? 'DESTINO DESCONOCIDO'}`
            ];

            for (let i = 0; i < mensajes.length; i++) {
                const mensaje = mensajes[i];
                if (!mensaje || mensaje.trim().length === 0) continue;

                await telegram.sendMessage(targetGroupId, mensaje);
                logger.info(`Mensaje azul ${i + 1}/${mensajes.length} enviado`);

                if (i < mensajes.length - 1) {
                    await delay(250);
                }
            }

            await delay(250);
            await telegram.sendMessage(
                targetGroupId,
                `🗺️ ${enhancedData.googleMapsUrl ?? 'URL no disponible'}`
            );

            await delay(250);
            await telegram.sendMessage(targetGroupId, '🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵🔵');

            logger.info('Secuencia de leyenda azul completada');
        } catch (error) {
            logger.error('Error enviando leyenda azul:', error);
            await telegram.sendMessage(targetGroupId, enhancedData.leyenda);
        }
    }

    /**
     * Obtiene el servicio de HERE Maps (para uso externo si es necesario)
     */
    getHereMapsService(): HereMapsService {
        return this.hereMapsService;
    }
}

export default LegendService;
