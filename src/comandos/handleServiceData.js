// Manejo del flujo INICIADO por accion:addservice (recibe datos del servicio)
const { Markup } = require('telegraf');
const { addServiceToPolicy } = require('../controllers/policyController');
const logger = require('../utils/logger');

async function handleServiceData(ctx, messageText) {
    const chatId = ctx.chat.id;
    const threadId = ctx.message?.message_thread_id || ctx.callbackQuery?.message?.message_thread_id;
    try {
        // Obtener la data guardada (puede ser string o objeto)
        const policyData = this.awaitingServiceData.get(chatId, threadId);

        if (!policyData) {
            logger.warn(`Se recibieron datos de servicio sin una póliza en espera para chatId: ${chatId}, threadId: ${threadId || 'ninguno'}`);
            return await ctx.reply('❌ Hubo un problema. Por favor, inicia el proceso de añadir servicio desde el menú principal.');
        }

        // Determinar si es un objeto con datos adicionales o solo el número de póliza
        const numeroPoliza = typeof policyData === 'object' ? policyData.numeroPoliza : policyData;

        logger.info(`Procesando datos de servicio para póliza: ${numeroPoliza}`, { chatId, threadId: threadId || 'ninguno' });
        const origenDestinoGuardado = typeof policyData === 'object' ? policyData.origenDestino : null;
        const usarFechaActual = typeof policyData === 'object' ? policyData.usarFechaActual : false;

        // Dividir en líneas
        const lines = messageText.split('\n').map(l => l.trim()).filter(Boolean);

        // MODO SIMPLIFICADO: Si tenemos origen/destino guardado y vamos a usar fecha actual
        if (usarFechaActual && origenDestinoGuardado) {
            // En este caso solo esperamos 2 líneas: costo y expediente
            if (lines.length < 2) {
                return await ctx.reply(
                    '❌ Formato inválido. Debes ingresar 2 líneas:\n' +
                    '1) Costo (ej. 550.00)\n' +
                    '2) Número de Expediente'
                );
            }

            const [costoStr, expediente] = lines;

            // Validar costo
            const costo = parseFloat(costoStr.replace(',', '.'));
            if (isNaN(costo) || costo <= 0) {
                return await ctx.reply('❌ Costo inválido. Ingresa un número mayor a 0.');
            }

            // Validar expediente
            if (!expediente || expediente.length < 3) {
                return await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
            }

            // Usar la fecha actual
            const fechaJS = new Date();

            // Usar origen/destino guardado
            const origenDestino = origenDestinoGuardado;

            // Guardar el número de expediente en FlowStateManager para uso en notificaciones
            const flowStateManager = require('../utils/FlowStateManager');
            flowStateManager.saveState(chatId, numeroPoliza, {
                expedienteNum: expediente
            }, threadId);

            logger.info(`Guardando número de expediente: ${expediente} para póliza: ${numeroPoliza}`, { chatId, threadId });

            // Llamar la función para añadir el servicio
            const updatedPolicy = await addServiceToPolicy(numeroPoliza, costo, fechaJS, expediente, origenDestino);
            if (!updatedPolicy) {
                return await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
            }

            // Averiguar el número de servicio recién insertado
            const totalServicios = updatedPolicy.servicios.length;
            const servicioInsertado = updatedPolicy.servicios[totalServicios - 1];
            const numeroServicio = servicioInsertado.numeroServicio;

            // Formatear fecha actual para mostrar
            const today = fechaJS;
            const fechaStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

            await ctx.reply(
                `✅ Se ha registrado el servicio #${numeroServicio} en la póliza *${numeroPoliza}*.\n\n` +
                `Costo: $${costo.toFixed(2)}\n` +
                `Fecha: ${fechaStr} (hoy)\n` +
                `Expediente: ${expediente}\n` +
                `Origen y Destino: ${origenDestino}`,
                {
                    parse_mode: 'Markdown'
                }
            );

            // Devolver los datos procesados para que TextMessageHandler decida qué hacer
            return { expediente, origenDestino, costo, fechaJS };
        } else {
            // MODO COMPLETO: Flujo normal con 4 datos
            // Necesitamos 4 líneas: Costo, Fecha, Expediente, Origen-Destino
            if (lines.length < 4) {
                return await ctx.reply(
                    '❌ Formato inválido. Debes ingresar 4 líneas:\n' +
                    '1) Costo (ej. 550.00)\n' +
                    '2) Fecha (DD/MM/YYYY)\n' +
                    '3) Número de Expediente\n' +
                    '4) Origen y Destino (ej. "Los Reyes - Tlalnepantla")'
                );
            }

            const [costoStr, fechaStr, expediente, origenDestino] = lines;

            // Validar costo
            const costo = parseFloat(costoStr.replace(',', '.'));
            if (isNaN(costo) || costo <= 0) {
                return await ctx.reply('❌ Costo inválido. Ingresa un número mayor a 0.');
            }

            // Validar fecha
            const [dia, mes, anio] = fechaStr.split(/[/-]/);
            if (!dia || !mes || !anio) {
                return await ctx.reply('❌ Fecha inválida. Usa el formato DD/MM/YYYY');
            }
            const fechaJS = new Date(`${anio}-${mes}-${dia}`);
            if (isNaN(fechaJS.getTime())) {
                return await ctx.reply('❌ Fecha inválida. Verifica día, mes y año correctos.');
            }

            // Validar expediente
            if (!expediente || expediente.length < 3) {
                return await ctx.reply('❌ Número de expediente inválido. Ingresa al menos 3 caracteres.');
            }

            // Validar origen-destino
            if (!origenDestino || origenDestino.length < 3) {
                return await ctx.reply('❌ Origen y destino inválidos. Ingresa al menos 3 caracteres.');
            }

            // Llamar la función para añadir el servicio
            const updatedPolicy = await addServiceToPolicy(numeroPoliza, costo, fechaJS, expediente, origenDestino);
            if (!updatedPolicy) {
                return await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
            }

            // Averiguar el número de servicio recién insertado
            const totalServicios = updatedPolicy.servicios.length;
            const servicioInsertado = updatedPolicy.servicios[totalServicios - 1];
            const numeroServicio = servicioInsertado.numeroServicio;

            await ctx.reply(
                `✅ Se ha registrado el servicio #${numeroServicio} en la póliza *${numeroPoliza}*.\n\n` +
                `Costo: $${costo.toFixed(2)}\n` +
                `Fecha: ${fechaStr}\n` +
                `Expediente: ${expediente}\n` +
                `Origen y Destino: ${origenDestino}`,
                {
                    parse_mode: 'Markdown'
                }
            );

            // Devolver los datos procesados para que TextMessageHandler decida qué hacer
            return { expediente, origenDestino, costo, fechaJS };
        }
    } catch (error) {
        logger.error('Error en handleServiceData:', error);
        await ctx.reply('❌ Error al procesar el servicio. Verifica los datos e intenta nuevamente.');
        return null; // Indicar fallo
    }
}

module.exports = handleServiceData;
