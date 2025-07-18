"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const policyController_1 = require("../controllers/policyController");
const logger_1 = __importDefault(require("../utils/logger"));
const StateKeyManager_1 = __importDefault(require("../utils/StateKeyManager"));
const FlowStateManager_1 = __importDefault(require("../utils/FlowStateManager"));
async function handleServiceData(ctx, messageText) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
        logger_1.default.error('Chat ID not found in context');
        return null;
    }
    const threadId = StateKeyManager_1.default.getThreadId(ctx);
    try {
        const policyData = this.awaitingServiceData.get(chatId, threadId);
        if (!policyData) {
            logger_1.default.warn(`Se recibieron datos de servicio sin una póliza en espera para chatId: ${chatId}, threadId: ${threadId || 'ninguno'}`);
            await ctx.reply('❌ Hubo un problema. Por favor, inicia el proceso de añadir servicio desde el menú principal.');
            return null;
        }
        const numeroPoliza = typeof policyData === 'object' ? policyData.numeroPoliza : policyData;
        logger_1.default.info(`Procesando datos de servicio para póliza: ${numeroPoliza}`, {
            chatId,
            threadId: threadId || 'ninguno'
        });
        const origenDestinoGuardado = typeof policyData === 'object' ? policyData.origenDestino : null;
        const usarFechaActual = typeof policyData === 'object' ? policyData.usarFechaActual : false;
        const lines = messageText
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
        if (usarFechaActual && origenDestinoGuardado) {
            if (lines.length < 2) {
                await ctx.reply('❌ Formato inválido. Debes ingresar 2 líneas:\n' +
                    '1) Costo (ej. 550.00)\n' +
                    '2) Número de Expediente');
                return null;
            }
            const [costoStr, expediente] = lines;
            const costo = parseFloat(costoStr.replace(',', '.'));
            if (isNaN(costo) || costo <= 0) {
                await ctx.reply('❌ Costo inválido. Ingresa un número mayor a 0.');
                return null;
            }
            if (!expediente || expediente.length < 3) {
                await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
                return null;
            }
            const fechaJS = new Date();
            const origenDestino = origenDestinoGuardado;
            FlowStateManager_1.default.saveState(chatId, numeroPoliza, {
                expedienteNum: expediente
            }, threadId);
            logger_1.default.info(`Guardando número de expediente: ${expediente} para póliza: ${numeroPoliza}`, { chatId, threadId });
            const savedState = FlowStateManager_1.default.getState(chatId, numeroPoliza, threadId);
            const coordenadas = savedState?.coordenadas || null;
            let rutaInfo = savedState?.rutaInfo || null;
            if (savedState?.googleMapsUrl && rutaInfo) {
                rutaInfo = { ...rutaInfo, googleMapsUrl: savedState.googleMapsUrl };
            }
            else if (savedState?.googleMapsUrl && !rutaInfo) {
                rutaInfo = { googleMapsUrl: savedState.googleMapsUrl };
            }
            const updatedPolicy = await (0, policyController_1.addRegistroToPolicy)(numeroPoliza, costo, fechaJS, expediente, origenDestino, coordenadas, rutaInfo);
            if (!updatedPolicy) {
                await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
                return null;
            }
            const totalRegistros = updatedPolicy.registros.length;
            const registroInsertado = updatedPolicy.registros[totalRegistros - 1];
            const numeroRegistro = registroInsertado.numeroRegistro;
            const today = fechaJS;
            const fechaStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
            await ctx.reply(`✅ Se ha hecho el registro #${numeroRegistro} en la póliza *${numeroPoliza}*, con el expediente ${expediente}`, {
                parse_mode: 'Markdown'
            });
            await ctx.reply('🤔 **INDICAME SI EL SERVICIO ESTA...**', {
                parse_mode: 'Markdown',
                ...telegraf_1.Markup.inlineKeyboard([
                    [
                        telegraf_1.Markup.button.callback('✅ ASIGNADO', `asig_yes_${numeroPoliza}_${numeroRegistro}`),
                        telegraf_1.Markup.button.callback('❌ NO ASIGNADO', `asig_no_${numeroPoliza}_${numeroRegistro}`)
                    ]
                ])
            });
            return { expediente, origenDestino, costo, fechaJS, numeroRegistro };
        }
        else {
            if (lines.length !== 1) {
                await ctx.reply('❌ Formato inválido. Debes ingresar solo el número de expediente:\n' +
                    '📝 Ejemplo: EXP-2025-001\n\n' +
                    '✅ Los demás datos se calculan automáticamente.');
                return null;
            }
            const expediente = lines[0].trim();
            if (!expediente || expediente.length < 3) {
                await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
                return null;
            }
            const fechaJS = new Date();
            const savedState = FlowStateManager_1.default.getState(chatId, numeroPoliza, threadId);
            if (!savedState || !savedState.rutaInfo) {
                await ctx.reply('❌ No se encontraron datos de ruta. Reinicia el proceso.');
                return null;
            }
            let rutaInfo = savedState.rutaInfo;
            const coordenadas = savedState.coordenadas || null;
            const distanciaKm = rutaInfo.distanciaKm || 0;
            const costo = Math.round((distanciaKm * 20 + 650) * 100) / 100;
            let origenDestino = '';
            if (savedState.geocoding &&
                savedState.geocoding.origen &&
                savedState.geocoding.destino) {
                const origenTexto = savedState.geocoding.origen.ubicacionCorta ||
                    savedState.geocoding.origen.direccionCompleta ||
                    'Origen';
                const destinoTexto = savedState.geocoding.destino.ubicacionCorta ||
                    savedState.geocoding.destino.direccionCompleta ||
                    'Destino';
                origenDestino = `${origenTexto} - ${destinoTexto}`;
            }
            else if (savedState.origenDestino) {
                origenDestino = savedState.origenDestino;
            }
            else {
                const origen = coordenadas?.origen;
                const destino = coordenadas?.destino;
                origenDestino = `${origen?.lat || 0}, ${origen?.lng || 0} - ${destino?.lat || 0}, ${destino?.lng || 0}`;
            }
            if (savedState?.googleMapsUrl && rutaInfo) {
                rutaInfo = { ...rutaInfo, googleMapsUrl: savedState.googleMapsUrl };
            }
            else if (savedState?.googleMapsUrl && !rutaInfo) {
                rutaInfo = { googleMapsUrl: savedState.googleMapsUrl };
            }
            const updatedPolicy = await (0, policyController_1.addRegistroToPolicy)(numeroPoliza, costo, fechaJS, expediente, origenDestino, coordenadas, rutaInfo);
            if (!updatedPolicy) {
                await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
                return null;
            }
            const totalRegistros = updatedPolicy.registros.length;
            const registroInsertado = updatedPolicy.registros[totalRegistros - 1];
            const numeroRegistro = registroInsertado.numeroRegistro;
            const fechaStr = fechaJS.toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                timeZone: 'America/Mexico_City'
            });
            await ctx.reply(`✅ Se ha hecho el registro #${numeroRegistro} en la póliza *${numeroPoliza}*, con el expediente ${expediente}`, {
                parse_mode: 'Markdown'
            });
            await ctx.reply('🤔 **INDICAME SI EL SERVICIO ESTA...**', {
                parse_mode: 'Markdown',
                ...telegraf_1.Markup.inlineKeyboard([
                    [
                        telegraf_1.Markup.button.callback('✅ ASIGNADO', `asig_yes_${numeroPoliza}_${numeroRegistro}`),
                        telegraf_1.Markup.button.callback('❌ NO ASIGNADO', `asig_no_${numeroPoliza}_${numeroRegistro}`)
                    ]
                ])
            });
            return { expediente, origenDestino, costo, fechaJS, numeroRegistro };
        }
    }
    catch (error) {
        logger_1.default.error('Error en handleServiceData:', error);
        await ctx.reply('❌ Error al procesar el servicio. Verifica los datos e intenta nuevamente.');
        return null;
    }
}
exports.default = handleServiceData;
