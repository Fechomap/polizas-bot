/**
 * LocationStep - Manejo de origen y destino en el flujo de Ocupar Póliza
 *
 * Responsabilidad: Capturar y procesar ubicaciones de origen y destino
 */

import { Context, Markup } from 'telegraf';
import logger from '../../../utils/logger';
import { getPolicyByNumber } from '../../../controllers/policyController';
import { getUnifiedStateManagerSync } from '../../../state/UnifiedStateManager';
import { whatsAppService } from '../../../services/whatsapp';
import type { IPolicy } from '../../../types/database';
import type { IThreadSafeStateMap } from '../../../utils/StateKeyManager';
import type { ICoordinates, IPolicyCacheData, IEnhancedLegendData } from '../types';
import LegendService from '../services/LegendService';

// Interface para handler con métodos async de estado
interface IStateHandler {
    setAwaitingState(
        chatId: number,
        stateType: string,
        value: any,
        threadId?: number | string | null
    ): Promise<void>;
    deleteAwaitingState(
        chatId: number,
        stateType: string,
        threadId?: number | string | null
    ): Promise<void>;
}

interface ILocationStepDependencies {
    handler: IStateHandler;
    awaitingOrigen: IThreadSafeStateMap<string>;
    awaitingDestino: IThreadSafeStateMap<string>;
    polizaCache: IThreadSafeStateMap<IPolicyCacheData>;
    pendingLeyendas: IThreadSafeStateMap<string>;
}

class LocationStep {
    private handler: IStateHandler;
    private awaitingOrigen: IThreadSafeStateMap<string>;
    private awaitingDestino: IThreadSafeStateMap<string>;
    private polizaCache: IThreadSafeStateMap<IPolicyCacheData>;
    private pendingLeyendas: IThreadSafeStateMap<string>;
    private legendService: LegendService;

    // Tipos de estado para sincronización con Redis
    private static readonly STATE_TYPES = {
        AWAITING_ORIGEN: 'awaitingOrigen',
        AWAITING_DESTINO: 'awaitingDestino'
    };

    constructor(deps: ILocationStepDependencies) {
        this.handler = deps.handler;
        this.awaitingOrigen = deps.awaitingOrigen;
        this.awaitingDestino = deps.awaitingDestino;
        this.polizaCache = deps.polizaCache;
        this.pendingLeyendas = deps.pendingLeyendas;
        this.legendService = new LegendService();
    }

    /**
     * Maneja el ingreso del origen
     */
    async handleOrigen(ctx: Context, input: any, threadId: string | null = null): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingOrigen.get(chatId, threadId);

        if (!numeroPoliza) {
            logger.error('No se encontró número de póliza para origen');
            return false;
        }

        logger.info(`Procesando origen para póliza ${numeroPoliza}`, {
            chatId,
            threadId,
            inputType: typeof input === 'object' ? 'location' : 'text'
        });

        try {
            const coordenadas = this.parseCoordinates(input);
            if (!coordenadas) {
                await ctx.reply('❌ Formato inválido. 📍indica *ORIGEN*', {
                    parse_mode: 'Markdown'
                });
                return false;
            }

            logger.info('Coordenadas de origen extraídas', coordenadas);

            // Guardar en UnifiedStateManager
            const stateManager = getUnifiedStateManagerSync()!;
            const threadIdNum = threadId ? parseInt(threadId, 10) : null;
            await stateManager.setFlowState(
                chatId,
                numeroPoliza,
                { origenCoords: coordenadas },
                threadIdNum
            );

            // Actualizar caché local
            const cachedData = this.polizaCache.get(chatId, threadId);
            if (cachedData) {
                cachedData.origenCoords = coordenadas;
                this.polizaCache.set(chatId, cachedData, threadId);
            }

            // Cambiar estado: origen -> destino (local + Redis)
            this.awaitingOrigen.delete(chatId, threadId);
            await this.handler.deleteAwaitingState(
                chatId,
                LocationStep.STATE_TYPES.AWAITING_ORIGEN,
                threadId
            );
            this.awaitingDestino.set(chatId, numeroPoliza, threadId);
            await this.handler.setAwaitingState(
                chatId,
                LocationStep.STATE_TYPES.AWAITING_DESTINO,
                numeroPoliza,
                threadId
            );

            await ctx.reply('📍indica *DESTINO*', { parse_mode: 'Markdown' });

            return true;
        } catch (error) {
            logger.error('Error procesando origen:', error);
            await ctx.reply('❌ Error al procesar la ubicación del origen.');
            return false;
        }
    }

    /**
     * Maneja el ingreso del destino
     */
    async handleDestino(
        ctx: Context,
        input: any,
        threadId: string | null = null
    ): Promise<boolean> {
        const chatId = ctx.chat!.id;
        const numeroPoliza = this.awaitingDestino.get(chatId, threadId);

        if (!numeroPoliza) {
            logger.error('No se encontró número de póliza para destino');
            return false;
        }

        logger.info(`Procesando destino para póliza ${numeroPoliza}`, {
            chatId,
            threadId,
            inputType: typeof input === 'object' ? 'location' : 'text'
        });

        try {
            const destinoCoords = this.parseCoordinates(input);
            if (!destinoCoords) {
                await ctx.reply('❌ Formato inválido. 📍indica *DESTINO*', {
                    parse_mode: 'Markdown'
                });
                return false;
            }

            logger.info('Coordenadas de destino extraídas', destinoCoords);

            // Recuperar origen desde UnifiedStateManager
            const stateManager = getUnifiedStateManagerSync()!;
            const threadIdNum = threadId ? parseInt(threadId, 10) : null;
            const savedState = await stateManager.getFlowState<{ origenCoords?: ICoordinates }>(
                chatId,
                numeroPoliza,
                threadIdNum
            );
            const origenCoords = savedState?.origenCoords;

            if (!origenCoords) {
                logger.error('No se encontraron coordenadas de origen');
                await ctx.reply(
                    '❌ Error: No se encontraron las coordenadas del origen. Reinicia el proceso.'
                );
                this.awaitingDestino.delete(chatId, threadId);
                await this.handler.deleteAwaitingState(
                    chatId,
                    LocationStep.STATE_TYPES.AWAITING_DESTINO,
                    threadId
                );
                return false;
            }

            // Calcular ruta con HERE Maps
            const hereMapsService = this.legendService.getHereMapsService();
            const rutaInfo = await hereMapsService.calculateRoute(origenCoords, destinoCoords);

            // Obtener póliza
            const policyCacheData = this.polizaCache.get(chatId, threadId);
            const policy =
                policyCacheData?.policy ?? ((await getPolicyByNumber(numeroPoliza)) as IPolicy);

            if (!policy) {
                await ctx.reply('❌ Error: Póliza no encontrada.');
                this.awaitingDestino.delete(chatId, threadId);
                await this.handler.deleteAwaitingState(
                    chatId,
                    LocationStep.STATE_TYPES.AWAITING_DESTINO,
                    threadId
                );
                return false;
            }

            // Generar leyenda mejorada
            const enhancedData = await this.legendService.generateEnhancedLegend(
                policy,
                origenCoords,
                destinoCoords,
                rutaInfo
            );

            // Guardar datos completos en UnifiedStateManager
            await this.saveCompleteFlowState(
                chatId,
                numeroPoliza,
                threadId,
                origenCoords,
                destinoCoords,
                rutaInfo,
                enhancedData
            );

            // Actualizar caché
            if (policyCacheData) {
                policyCacheData.destinoCoords = destinoCoords;
                policyCacheData.coordenadas = { origen: origenCoords, destino: destinoCoords };
                policyCacheData.rutaInfo = rutaInfo;
                this.polizaCache.set(chatId, policyCacheData, threadId);
            }

            // Guardar leyenda pendiente
            this.pendingLeyendas.set(chatId, enhancedData.leyenda, threadId);

            // Enviar leyenda al grupo en background
            this.sendLegendToGroupAsync(ctx, policy, enhancedData);

            // Mensaje de confirmación con opciones de servicio
            const responseMessage = this.buildDestinationResponse(enhancedData, rutaInfo);

            // Generar URLs de WhatsApp directamente
            const telefono = policy.telefono ?? '';

            // URLs para coordenadas
            const waOrigenCoordsUrl = whatsAppService.generateWhatsAppUrl(
                telefono,
                `${origenCoords.lat}, ${origenCoords.lng}`
            );
            const waDestinoCoordsUrl = whatsAppService.generateWhatsAppUrl(
                telefono,
                `${destinoCoords.lat}, ${destinoCoords.lng}`
            );

            // URLs para direcciones geocodificadas (dirección completa)
            const origenDir =
                enhancedData.origenGeo?.direccionCompleta ??
                enhancedData.origenGeo?.ubicacionCorta ??
                'Origen';
            const destinoDir =
                enhancedData.destinoGeo?.direccionCompleta ??
                enhancedData.destinoGeo?.ubicacionCorta ??
                'Destino';
            const waOrigenDirUrl = whatsAppService.generateWhatsAppUrl(telefono, origenDir);
            const waDestinoDirUrl = whatsAppService.generateWhatsAppUrl(telefono, destinoDir);

            await ctx.reply(responseMessage, {
                parse_mode: 'Markdown',
                link_preview_options: { is_disabled: true },
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '✅ Registrar Servicio',
                            `registrar_servicio_${numeroPoliza}`
                        ),
                        Markup.button.callback('❌ No registrar', `no_registrar_${numeroPoliza}`)
                    ],
                    [
                        Markup.button.url('📍 Coords Origen', waOrigenCoordsUrl),
                        Markup.button.url('📍 Coords Destino', waDestinoCoordsUrl)
                    ],
                    [
                        Markup.button.url('🏠 Dir. Origen', waOrigenDirUrl),
                        Markup.button.url('🏠 Dir. Destino', waDestinoDirUrl)
                    ]
                ])
            });

            // Limpiar estados (local + Redis)
            this.pendingLeyendas.delete(chatId, threadId);
            this.awaitingDestino.delete(chatId, threadId);
            await this.handler.deleteAwaitingState(
                chatId,
                LocationStep.STATE_TYPES.AWAITING_DESTINO,
                threadId
            );

            return true;
        } catch (error) {
            logger.error('Error procesando destino:', error);
            await ctx.reply('❌ Error al procesar la ubicación del destino.');
            this.awaitingDestino.delete(chatId, threadId);
            await this.handler.deleteAwaitingState(
                chatId,
                LocationStep.STATE_TYPES.AWAITING_DESTINO,
                threadId
            );
            return false;
        }
    }

    /**
     * Parsea coordenadas desde ubicación de Telegram o texto
     */
    private parseCoordinates(input: any): ICoordinates | null {
        if (input?.location) {
            return {
                lat: input.location.latitude,
                lng: input.location.longitude
            };
        }

        if (typeof input === 'string') {
            const hereMapsService = this.legendService.getHereMapsService();
            return hereMapsService.parseCoordinates(input);
        }

        return null;
    }

    /**
     * Guarda el estado completo del flujo
     */
    private async saveCompleteFlowState(
        chatId: number,
        numeroPoliza: string,
        threadId: string | null,
        origenCoords: ICoordinates,
        destinoCoords: ICoordinates,
        rutaInfo: any,
        enhancedData: IEnhancedLegendData
    ): Promise<void> {
        const saveData: any = {
            origenCoords,
            destinoCoords,
            coordenadas: {
                origen: origenCoords,
                destino: destinoCoords
            },
            rutaInfo,
            origenDestino: `${origenCoords.lat},${origenCoords.lng} - ${destinoCoords.lat},${destinoCoords.lng}`
        };

        if (enhancedData) {
            saveData.geocoding = {
                origen: enhancedData.origenGeo,
                destino: enhancedData.destinoGeo
            };
            saveData.googleMapsUrl = enhancedData.googleMapsUrl;
            saveData.origenDestino = `${enhancedData.origenGeo.ubicacionCorta} - ${enhancedData.destinoGeo.ubicacionCorta}`;
        }

        const stateManager = getUnifiedStateManagerSync()!;
        const threadIdNum = threadId ? parseInt(threadId, 10) : null;
        await stateManager.setFlowState(chatId, numeroPoliza, saveData, threadIdNum);
    }

    /**
     * Envía la leyenda al grupo de forma asíncrona
     */
    private sendLegendToGroupAsync(
        ctx: Context,
        policy: IPolicy,
        enhancedData: IEnhancedLegendData
    ): void {
        const targetGroupId = parseInt(process.env.TELEGRAM_GROUP_ID ?? '-1002212807945');

        setImmediate(async () => {
            try {
                logger.info(`Enviando leyenda al grupo ${targetGroupId}`);
                await this.legendService.sendLegendWithTypingEffect(
                    ctx.telegram,
                    targetGroupId,
                    policy,
                    enhancedData
                );
                logger.info('Leyenda enviada exitosamente');
            } catch (error) {
                logger.error('Error al enviar leyenda al grupo:', error);
            }
        });
    }

    /**
     * Construye el mensaje de respuesta para el destino
     */
    private buildDestinationResponse(enhancedData: IEnhancedLegendData, rutaInfo: any): string {
        let responseMessage = '';

        // Mostrar direcciones geocodificadas (dirección completa)
        if (enhancedData.origenGeo ?? enhancedData.destinoGeo) {
            responseMessage = '📍 *Ubicaciones:*\n';
            if (enhancedData.origenGeo) {
                const origenText =
                    enhancedData.origenGeo.direccionCompleta ??
                    enhancedData.origenGeo.ubicacionCorta;
                responseMessage += `🔹 Origen: ${origenText}\n`;
            }
            if (enhancedData.destinoGeo) {
                const destinoText =
                    enhancedData.destinoGeo.direccionCompleta ??
                    enhancedData.destinoGeo.ubicacionCorta;
                responseMessage += `🔹 Destino: ${destinoText}\n`;
            }
            responseMessage += '\n';
        }

        if (rutaInfo) {
            responseMessage +=
                '🗺️ *Información de ruta:*\n' +
                `📏 Distancia: ${rutaInfo.distanciaKm} km\n` +
                `⏱️ Tiempo estimado: ${rutaInfo.tiempoMinutos} minutos`;

            if (rutaInfo.aproximado) {
                responseMessage += ' (aproximado)';
            }

            responseMessage += `\n🔗 [Ver ruta en Google Maps](${rutaInfo.googleMapsUrl})\n\n`;
        }

        return responseMessage;
    }

    /**
     * Obtiene el servicio de leyendas (para uso externo)
     */
    getLegendService(): LegendService {
        return this.legendService;
    }
}

export default LocationStep;
