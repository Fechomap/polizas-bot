// Manejo del flujo INICIADO por accion:addservice (recibe datos del servicio)
import { Markup } from 'telegraf';
import { addRegistroToPolicy } from '../controllers/policyController';
import logger from '../utils/logger';
import StateKeyManager from '../utils/StateKeyManager';
import FlowStateManager from '../utils/FlowStateManager';
import { BotContext } from '../../types';

interface IServiceData {
    expediente: string;
    origenDestino: string;
    costo: number;
    fechaJS: Date;
    numeroRegistro: number;
}

interface IPolicyData {
    numeroPoliza: string;
    origenDestino?: string;
    usarFechaActual?: boolean;
}

interface ISavedState {
    expedienteNum?: string;
    coordenadas?: {
        origen: { lat: number; lng: number };
        destino: { lat: number; lng: number };
    };
    rutaInfo?: {
        distanciaKm: number;
        tiempoMinutos: number;
        googleMapsUrl?: string;
    };
    geocoding?: {
        origen: {
            ubicacionCorta?: string;
            direccionCompleta?: string;
        };
        destino: {
            ubicacionCorta?: string;
            direccionCompleta?: string;
        };
    };
    googleMapsUrl?: string;
    origenDestino?: string;
}

interface IHandleServiceDataContext {
    awaitingServiceData: {
        get(chatId: number, threadIdStr?: string): string | IPolicyData | null;
    };
}

async function handleServiceData(
    this: IHandleServiceDataContext,
    ctx: BotContext,
    messageText: string
): Promise<IServiceData | null> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
        logger.error('Chat ID not found in context');
        return null;
    }

    const threadIdRaw = StateKeyManager.getThreadId(ctx);
    const threadId = threadIdRaw ? String(threadIdRaw) : undefined;
    try {
        // Obtener la data guardada (puede ser string o objeto)
        const policyData = this.awaitingServiceData.get(chatId, threadId);

        if (!policyData) {
            logger.warn(
                `Se recibieron datos de servicio sin una póliza en espera para chatId: ${chatId}, threadId: ${threadIdRaw || 'ninguno'}`
            );
            await ctx.reply(
                '❌ Hubo un problema. Por favor, inicia el proceso de añadir servicio desde el menú principal.'
            );
            return null;
        }

        // Determinar si es un objeto con datos adicionales o solo el número de póliza
        const numeroPoliza = typeof policyData === 'object' ? policyData.numeroPoliza : policyData;

        logger.info(`Procesando datos de servicio para póliza: ${numeroPoliza}`, {
            chatId,
            threadId: threadIdRaw || 'ninguno'
        });
        const origenDestinoGuardado =
            typeof policyData === 'object' ? policyData.origenDestino : null;
        const usarFechaActual = typeof policyData === 'object' ? policyData.usarFechaActual : false;

        // Dividir en líneas
        const lines = messageText
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        // MODO SIMPLIFICADO: Si tenemos origen/destino guardado y vamos a usar fecha actual
        if (usarFechaActual && origenDestinoGuardado) {
            // En este caso solo esperamos 2 líneas: costo y expediente
            if (lines.length < 2) {
                await ctx.reply(
                    '❌ Formato inválido. Debes ingresar 2 líneas:\n' +
                        '1) Costo (ej. 550.00)\n' +
                        '2) Número de Expediente'
                );
                return null;
            }

            const [costoStr, expediente] = lines;

            // Validar costo
            const costo = parseFloat(costoStr.replace(',', '.'));
            if (isNaN(costo) || costo <= 0) {
                await ctx.reply('❌ Costo inválido. Ingresa un número mayor a 0.');
                return null;
            }

            // Validar expediente
            if (!expediente || expediente.length < 3) {
                await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
                return null;
            }

            // Usar la fecha actual
            const fechaJS = new Date();

            // Usar origen/destino guardado
            const origenDestino = origenDestinoGuardado;

            // Guardar el número de expediente en FlowStateManager para uso en notificaciones
            FlowStateManager.saveState(
                chatId,
                numeroPoliza,
                {
                    expedienteNum: expediente
                },
                threadId
            );

            logger.info(
                `Guardando número de expediente: ${expediente} para póliza: ${numeroPoliza}`,
                { chatId, threadId: threadIdRaw }
            );

            // Recuperar datos de coordenadas desde FlowStateManager si están disponibles
            const savedState = FlowStateManager.getState(
                chatId,
                numeroPoliza,
                threadId
            ) as ISavedState;
            const coordenadas = savedState?.coordenadas || null;
            let rutaInfo = savedState?.rutaInfo || null;

            // Añadir URL de Google Maps desde geocoding si está disponible
            if (savedState?.googleMapsUrl && rutaInfo) {
                rutaInfo = { ...rutaInfo, googleMapsUrl: savedState.googleMapsUrl };
            } else if (savedState?.googleMapsUrl && !rutaInfo) {
                rutaInfo = {
                    distanciaKm: 0,
                    tiempoMinutos: 0,
                    googleMapsUrl: savedState.googleMapsUrl
                };
            }

            // Llamar la función para añadir el REGISTRO (no servicio aún) con datos de coordenadas
            const updatedPolicy = await addRegistroToPolicy(
                numeroPoliza,
                costo,
                fechaJS,
                expediente,
                origenDestino,
                coordenadas,
                rutaInfo
            );
            if (!updatedPolicy) {
                await ctx.reply(
                    `❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`
                );
                return null;
            }

            // Averiguar el número de registro recién insertado
            const totalRegistros = updatedPolicy.registros.length;
            const registroInsertado = updatedPolicy.registros[totalRegistros - 1];
            const numeroRegistro = registroInsertado.numeroRegistro;

            // Formatear fecha actual para mostrar
            const today = fechaJS;
            const fechaStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

            await ctx.reply(
                `✅ Se ha hecho el registro #${numeroRegistro} en la póliza *${numeroPoliza}*, con el expediente ${expediente}`,
                {
                    parse_mode: 'Markdown'
                }
            );

            // Mostrar botones de Asignado/No Asignado después del registro
            await ctx.reply('🤔 **INDICAME SI EL SERVICIO ESTA...**', {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '✅ ASIGNADO',
                            `asig_yes_${numeroPoliza}_${numeroRegistro}`
                        ),
                        Markup.button.callback(
                            '❌ NO ASIGNADO',
                            `asig_no_${numeroPoliza}_${numeroRegistro}`
                        )
                    ]
                ])
            });

            // Devolver los datos procesados incluyendo el número de registro
            return { expediente, origenDestino, costo, fechaJS, numeroRegistro };
        } else {
            // MODO NUEVO: Solo pedir número de expediente, calcular automáticamente los demás
            // Esperamos solo 1 línea: Número de expediente
            if (lines.length !== 1) {
                await ctx.reply(
                    '❌ Formato inválido. Debes ingresar solo el número de expediente:\n' +
                        '📝 Ejemplo: EXP-2025-001\n\n' +
                        '✅ Los demás datos se calculan automáticamente.'
                );
                return null;
            }

            const expediente = lines[0].trim();

            // Validar expediente
            if (!expediente || expediente.length < 3) {
                await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
                return null;
            }

            // CALCULAR AUTOMÁTICAMENTE LOS DEMÁS DATOS

            // 1. Fecha automática: fecha actual
            const fechaJS = new Date();

            // 2. Recuperar datos de ruta desde FlowStateManager
            const savedState = FlowStateManager.getState(
                chatId,
                numeroPoliza,
                threadId
            ) as ISavedState;

            if (!savedState?.rutaInfo) {
                await ctx.reply('❌ No se encontraron datos de ruta. Reinicia el proceso.');
                return null;
            }

            let rutaInfo = savedState.rutaInfo;
            const coordenadas = savedState.coordenadas || null;

            // 3. Calcular costo automáticamente: km × 20 + 650
            const distanciaKm = rutaInfo.distanciaKm || 0;
            const costo = Math.round((distanciaKm * 20 + 650) * 100) / 100; // Redondear a 2 decimales

            // 4. Obtener origen/destino desde datos guardados
            let origenDestino = '';
            if (savedState.geocoding?.origen && savedState.geocoding.destino) {
                // Usar datos de geocoding si están disponibles
                const origenTexto =
                    savedState.geocoding.origen.ubicacionCorta ||
                    savedState.geocoding.origen.direccionCompleta ||
                    'Origen';
                const destinoTexto =
                    savedState.geocoding.destino.ubicacionCorta ||
                    savedState.geocoding.destino.direccionCompleta ||
                    'Destino';
                origenDestino = `${origenTexto} - ${destinoTexto}`;
            } else if (savedState.origenDestino) {
                // Usar datos de origen-destino si están disponibles
                origenDestino = savedState.origenDestino;
            } else {
                // Fallback: usar coordenadas
                const origen = coordenadas?.origen;
                const destino = coordenadas?.destino;
                origenDestino = `${origen?.lat || 0}, ${origen?.lng || 0} - ${destino?.lat || 0}, ${destino?.lng || 0}`;
            }

            // Añadir URL de Google Maps desde geocoding si está disponible
            if (savedState?.googleMapsUrl && rutaInfo) {
                rutaInfo = { ...rutaInfo, googleMapsUrl: savedState.googleMapsUrl };
            } else if (savedState?.googleMapsUrl && !rutaInfo) {
                rutaInfo = {
                    distanciaKm: 0,
                    tiempoMinutos: 0,
                    googleMapsUrl: savedState.googleMapsUrl
                };
            }

            // Llamar la función para añadir el REGISTRO (no servicio aún) con datos de coordenadas
            const updatedPolicy = await addRegistroToPolicy(
                numeroPoliza,
                costo,
                fechaJS,
                expediente,
                origenDestino,
                coordenadas,
                rutaInfo
            );
            if (!updatedPolicy) {
                await ctx.reply(
                    `❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`
                );
                return null;
            }

            // Averiguar el número de registro recién insertado
            const totalRegistros = updatedPolicy.registros.length;
            const registroInsertado = updatedPolicy.registros[totalRegistros - 1];
            const numeroRegistro = registroInsertado.numeroRegistro;

            // Formatear fecha para mostrar
            const fechaStr = fechaJS.toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                timeZone: 'America/Mexico_City'
            });

            await ctx.reply(
                `✅ Se ha hecho el registro #${numeroRegistro} en la póliza *${numeroPoliza}*, con el expediente ${expediente}`,
                {
                    parse_mode: 'Markdown'
                }
            );

            // Mostrar botones de Asignado/No Asignado después del registro
            await ctx.reply('🤔 **INDICAME SI EL SERVICIO ESTA...**', {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '✅ ASIGNADO',
                            `asig_yes_${numeroPoliza}_${numeroRegistro}`
                        ),
                        Markup.button.callback(
                            '❌ NO ASIGNADO',
                            `asig_no_${numeroPoliza}_${numeroRegistro}`
                        )
                    ]
                ])
            });

            // Devolver los datos procesados incluyendo el número de registro
            return { expediente, origenDestino, costo, fechaJS, numeroRegistro };
        }
    } catch (error) {
        logger.error('Error en handleServiceData:', error);
        await ctx.reply(
            '❌ Error al procesar el servicio. Verifica los datos e intenta nuevamente.'
        );
        return null; // Indicar fallo
    }
}

export default handleServiceData;
