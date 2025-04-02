// src/comandos/commandHandler.js
const { spawn } = require('child_process');
const path = require('path');
const { Markup } = require('telegraf');
const config = require('../config');
const { 
    getPolicyByNumber, 
    savePolicy, 
    addFileToPolicy, 
    deletePolicyByNumber, 
    addPaymentToPolicy, 
    addServiceToPolicy,
    getSusceptiblePolicies, 
    getOldUnusedPolicies,
    markPolicyAsDeleted,
    getDeletedPolicies,
    restorePolicy
} = require('../controllers/policyController');
const logger = require('../utils/logger');
const FileHandler = require('../utils/fileHandler');
const fetch = require('node-fetch');

// Import the model Policy directly
const Policy = require('../models/policy');

// Import command registry and modules
const {
    CommandRegistry,
    StartCommand,
    GetCommand,
    ViewFilesCallbacks,
    TextMessageHandler,
    MediaUploadHandler,
    HelpCommand,
    OcuparPolizaCallback,
    TestCommand,
    // Import new commands
    AddPaymentCommand,
    AddServiceCommand,
    SaveCommand,
    DeleteCommand,
    ReportPaymentCommand,
    ReportUsedCommand
} = require('./comandos');

class CommandHandler {
    constructor(bot) {
        if (!bot) {
            throw new Error('Bot instance is required');
        }
        this.bot = bot;
        
        // Initialize the command registry
        this.registry = new CommandRegistry();
        
        // Initialize state maps
        this.uploadTargets = new Map();
        this.awaitingSaveData = new Map();
        this.awaitingGetPolicyNumber = new Map();
        this.awaitingUploadPolicyNumber = new Map();
        this.awaitingDeletePolicyNumber = new Map();
        this.awaitingPaymentPolicyNumber = new Map();
        this.awaitingPaymentData = new Map();
        this.awaitingServicePolicyNumber = new Map();
        this.awaitingServiceData = new Map();
        this.awaitingPhoneNumber = new Map();
        this.awaitingOrigenDestino = new Map();
        this.awaitingDeleteReason = new Map();

        // Setup group restriction
        this.setupGroupRestriction();
        
        // Register all commands
        this.registerCommands();
    }

    setupGroupRestriction() {
        // No group restrictions for now to ensure the bot works in any chat
        logger.info('Group restrictions disabled for testing');
    }

    // Register all command modules
    registerCommands() {
        // Registrar comandos modulares Y LLAMAR A SU MÉTODO register()
        const startCmd = new StartCommand(this);
        this.registry.registerCommand(startCmd);
        startCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const getCmd = new GetCommand(this);
        this.registry.registerCommand(getCmd);
        getCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const mediaCmd = new MediaUploadHandler(this);
        this.registry.registerCommand(mediaCmd);
        mediaCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const helpCmd = new HelpCommand(this);
        this.registry.registerCommand(helpCmd);
        helpCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const ocuparCmd = new OcuparPolizaCallback(this);
        this.registry.registerCommand(ocuparCmd);
        ocuparCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const testCmd = new TestCommand(this);
        this.registry.registerCommand(testCmd);
        testCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        // Register NEW modular commands
        const addPaymentCmd = new AddPaymentCommand(this);
        this.registry.registerCommand(addPaymentCmd);
        addPaymentCmd.register();

        const addServiceCmd = new AddServiceCommand(this);
        this.registry.registerCommand(addServiceCmd);
        addServiceCmd.register();

        const saveCmd = new SaveCommand(this);
        this.registry.registerCommand(saveCmd);
        saveCmd.register();

        const deleteCmd = new DeleteCommand(this);
        this.registry.registerCommand(deleteCmd);
        deleteCmd.register();

        const reportPaymentCmd = new ReportPaymentCommand(this);
        this.registry.registerCommand(reportPaymentCmd);
        reportPaymentCmd.register();

        const reportUsedCmd = new ReportUsedCommand(this);
        this.registry.registerCommand(reportUsedCmd);
        reportUsedCmd.register();

        // Register callback handlers (estos ya lo hacen bien)
        const viewFilesCallbacks = new ViewFilesCallbacks(this);
        this.registry.registerCommand(viewFilesCallbacks);
        viewFilesCallbacks.register();

        // Register text message handler (este también)
        new TextMessageHandler(this).register();

        // Register remaining commands/callbacks that haven't been modularized yet
        this.setupRemainingCommands();
        
        // Setup all registered callbacks to connect with the bot
        this.setupCallbacks();
    }

    // Setup remaining callbacks or commands that haven't been modularized yet
    setupRemainingCommands() {
        // Callback para consultar una póliza desde un botón (originado en reportUsed)
        this.bot.action(/getPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1]; // Extract policy number from callback data
                logger.info(`Callback getPoliza para: ${numeroPoliza}`);

                // Reutilizar la lógica de /get (que ahora está en GetCommand, pero el método auxiliar sigue aquí)
                // Idealmente, esto también se refactorizaría para llamar a GetCommand.handleGetPolicyFlow
                await this.handleGetPolicyFlow(ctx, numeroPoliza);

                await ctx.answerCbQuery(); // Acknowledge the button press
            } catch (error) {
                logger.error('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza desde callback.');
                // Consider answering the callback query even on error
                try { await ctx.answerCbQuery('Error'); } catch { /* ignore */ }
            }
        });

        // The ocuparPoliza callback is handled by the OcuparPolizaCallback module.
        // Other non-command logic might remain here if needed.
    }
    
    // Setup all registered callbacks to connect with the bot
    setupCallbacks() {
        logger.info('Configurando callbacks registrados...');
        const callbackHandlers = this.registry.getCallbackHandlers();
        
        // Iterate through all registered callbacks and connect them to the bot
        callbackHandlers.forEach((handler, pattern) => {
            logger.info(`Conectando callback: ${pattern}`);
            this.bot.action(pattern, async (ctx) => {
                try {
                    await handler(ctx);
                } catch (error) {
                    logger.error(`Error en callback ${pattern}:`, error);
                    await ctx.reply('❌ Error al procesar la acción.');
                    try { await ctx.answerCbQuery('Error'); } catch { /* ignore */ }
                }
            });
        });
        
        logger.info(`✅ ${callbackHandlers.size} callbacks conectados al bot`);
    }

    // -------------------------------------------------------------------------
    // Métodos auxiliares para manejar cada flujo
    // -------------------------------------------------------------------------

    // Manejo del flujo /save
    async handleSaveData(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const lines = messageText
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line !== '');
    
            logger.info(`Número de líneas recibidas en /save: ${lines.length}`, { chatId });
    
            const EXPECTED_LINES = 19;
            if (lines.length < EXPECTED_LINES) {
                this.awaitingSaveData.delete(chatId);  // ✅ Limpia el estado
                await ctx.reply(
                    `❌ Los datos no están completos. Se requieren ${EXPECTED_LINES} líneas de información.\n` +
                    'Proceso cancelado. Usa /save para intentar nuevamente.'
                );
                return;
            }
    
            const fechaStr = lines[18];
            const fechaParts = fechaStr.split(/[/-]/);
            if (fechaParts.length !== 3) {
                this.awaitingSaveData.delete(chatId);  // ✅ Limpia el estado
                await ctx.reply(
                    '❌ Formato de fecha inválido. Use DD/MM/YY o DD/MM/YYYY\n' +
                    'Proceso cancelado. Usa /save para intentar nuevamente.'
                );
                return;
            }

            let [day, month, year] = fechaParts;
            if (year.length === 2) {
                year = '20' + year; // 23 -> 2023
            }
            const fecha = new Date(`${year}-${month}-${day}`);

            const policyData = {
                titular: lines[0],
                correo: lines[1].toLowerCase() === 'sin correo' ? '' : lines[1],
                contraseña: lines[2],
                calle: lines[3],
                colonia: lines[4],
                municipio: lines[5],
                estado: lines[6],
                cp: lines[7],
                rfc: lines[8].toUpperCase(),
                marca: lines[9].toUpperCase(),
                submarca: lines[10].toUpperCase(),
                año: parseInt(lines[11], 10),
                color: lines[12].toUpperCase(),
                serie: lines[13].toUpperCase(),
                placas: lines[14].toUpperCase(),
                agenteCotizador: lines[15],
                aseguradora: lines[16].toUpperCase(),
                numeroPoliza: lines[17].toUpperCase(),
                fechaEmision: fecha,
                archivos: {
                    fotos: [],
                    pdfs: []
                }
            };

            // Validaciones básicas
            if (!policyData.titular) throw new Error('El titular es requerido');
            if (!policyData.numeroPoliza) throw new Error('El número de póliza es requerido');
            if (isNaN(policyData.año)) throw new Error('El año debe ser un número válido');
            if (!/^\d{5}$/.test(policyData.cp)) throw new Error('El CP debe tener 5 dígitos');

            // NUEVA VALIDACIÓN: Verificar que no exista ya la póliza
            const existingPolicy = await getPolicyByNumber(policyData.numeroPoliza);
            if (existingPolicy) {
                this.awaitingSaveData.delete(chatId);  // ✅ Limpia el estado
                await ctx.reply(
                    `❌ La póliza con número *${policyData.numeroPoliza}* ya existe en la base de datos. No se puede duplicar.\n` +
                    'Proceso cancelado. Usa /save para intentar nuevamente.'
                );
                return;
            }

            // Guardar la póliza
            const savedPolicy = await savePolicy(policyData);
            logger.info('✅ Póliza guardada:', { numeroPoliza: savedPolicy.numeroPoliza });

            // Limpiar el estado de espera
            this.awaitingSaveData.delete(chatId);

            await ctx.reply(
                `✅ Póliza guardada exitosamente:\n` +
                `Número: ${savedPolicy.numeroPoliza}\n\n` +
                `Puedes subir fotos y el PDF del vehículo usando:\n` +
                `/upload`
            );
        } catch (error) {
            logger.error('Error al procesar datos de póliza (handleSaveData):', error);
            this.awaitingSaveData.delete(chatId);  // ✅ Limpia el estado
            await ctx.reply(
                `❌ Error: ${error.message}\n` +
                'Proceso cancelado. Usa /save para intentar nuevamente.'
            );
        }
    }

    async handleDeletePolicyFlow(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            // Procesar la entrada del usuario para extraer múltiples números de póliza
            // Aceptamos números separados por saltos de línea, comas o espacios
            const inputText = messageText.trim();
            
            // Primero separamos por saltos de línea
            let polizasArray = inputText.split('\n');
            
            // Si solo hay una línea, intentamos separar por comas o espacios
            if (polizasArray.length === 1) {
                // Primero intentamos separar por comas
                if (inputText.includes(',')) {
                    polizasArray = inputText.split(',');
                } 
                // Si no hay comas, separamos por espacios
                else if (inputText.includes(' ')) {
                    polizasArray = inputText.split(' ');
                }
            }
            
            // Limpiamos y normalizamos cada número de póliza
            const numeroPolizas = polizasArray
                .map(num => num.trim().toUpperCase())
                .filter(num => num.length > 0); // Eliminar espacios vacíos
            
            // Verificar que hay al menos una póliza para procesar
            if (numeroPolizas.length === 0) {
                await ctx.reply('❌ No se detectaron números de póliza válidos. Por favor, inténtalo de nuevo.');
                this.awaitingDeletePolicyNumber.delete(chatId);
                return;
            }

            // Si hay muchas pólizas, confirmamos antes de proceder
            const esProcesoPesado = numeroPolizas.length > 5;
            let mensajeConfirmacion = '';
            
            if (esProcesoPesado) {
                mensajeConfirmacion = `🔄 Se procesarán ${numeroPolizas.length} pólizas.\n\n`;
            }
            
            // Solicitamos motivo de eliminación
            await ctx.reply(
                `🗑️ Vas a marcar como ELIMINADAS ${numeroPolizas.length} póliza(s):\n` +
                `${esProcesoPesado ? '(Mostrando las primeras 5 de ' + numeroPolizas.length + ')\n' : ''}` +
                `${numeroPolizas.slice(0, 5).map(p => '- ' + p).join('\n')}` +
                `${esProcesoPesado ? '\n...' : ''}\n\n` +
                `${mensajeConfirmacion}` +
                'Por favor, ingresa un motivo para la eliminación (o escribe "ninguno"):', 
                { parse_mode: 'Markdown' }
            );
            
            // Guardamos los números de póliza para usarlos cuando recibamos el motivo
            this.awaitingDeleteReason = this.awaitingDeleteReason || new Map();
            this.awaitingDeleteReason.set(chatId, numeroPolizas);
            
            // Limpiamos el estado de espera del número de póliza
            this.awaitingDeletePolicyNumber.delete(chatId);
        } catch (error) {
            logger.error('Error en handleDeletePolicyFlow:', error);
            await ctx.reply('❌ Hubo un error al procesar la solicitud. Intenta nuevamente.');
            this.awaitingDeletePolicyNumber.delete(chatId);
        }
    }

    // Paso 1: Recibimos la póliza
    async handleAddPaymentPolicyNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = messageText.trim().toUpperCase();

            // Verificamos si existe
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. Proceso cancelado.`);
            } else {
                // Guardamos la póliza en un Map, junto al chatId
                this.awaitingPaymentData.set(chatId, numeroPoliza);

                // Indicamos qué datos requerimos
                await ctx.reply(
                    `✅ Póliza *${numeroPoliza}* encontrada.\n\n` +
                    `💰 *Ingresa el pago en este formato (2 líneas):*\n` +
                    `1️⃣ Monto del pago (ejemplo: 345.00)\n` +
                    `2️⃣ Fecha de pago (DD/MM/YYYY)\n\n` +
                    `📝 Ejemplo:\n\n` +
                    `345.00\n12/01/2024`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            logger.error('Error en handleAddPaymentPolicyNumber:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
        } finally {
            // Ya no esperamos la póliza
            this.awaitingPaymentPolicyNumber.delete(chatId);
        }
    }

    // Paso 2: Recibimos los datos de pago (2 líneas)
    async handlePaymentData(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = this.awaitingPaymentData.get(chatId);
            if (!numeroPoliza) {
                // Algo salió mal o se reinició el bot
                return await ctx.reply('❌ No se encontró la referencia de la póliza. Usa /addpayment de nuevo.');
            }

            // Separar las líneas
            const lines = messageText.split('\n').map((l) => l.trim()).filter(Boolean);
            if (lines.length < 2) {
                return await ctx.reply('❌ Formato inválido. Debes ingresar 2 líneas: Monto y Fecha (DD/MM/YYYY)');
            }

            const montoStr = lines[0];
            const fechaStr = lines[1];

            // Validar y parsear monto
            const monto = parseFloat(montoStr.replace(',', '.')); // soportar "345,00"
            if (isNaN(monto) || monto <= 0) {
                return await ctx.reply('❌ Monto inválido. Ingresa un número mayor a 0.');
            }

            // Validar y parsear fecha
            const [dia, mes, anio] = fechaStr.split(/[/-]/);
            if (!dia || !mes || !anio) {
                return await ctx.reply('❌ Fecha inválida. Usa el formato DD/MM/YYYY');
            }

            const fechaJS = new Date(`${anio}-${mes}-${dia}`);
            if (isNaN(fechaJS.getTime())) {
                return await ctx.reply('❌ Fecha inválida. Verifica que sea un día, mes y año correctos.');
            }

            // Llamar la función del controlador
            const updatedPolicy = await addPaymentToPolicy(numeroPoliza, monto, fechaJS);
            if (!updatedPolicy) {
                return await ctx.reply(`❌ No se encontró la póliza *${numeroPoliza}*. Proceso cancelado.`);
            }

            // Responder éxito
            await ctx.reply(`✅ Se ha registrado un pago de $${monto.toFixed(2)} con fecha ${fechaStr} en la póliza *${numeroPoliza}*.`, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            logger.error('Error en handlePaymentData:', error);
            await ctx.reply('❌ Error al procesar el pago. Intenta nuevamente.');
        } finally {
            // Limpiar el estado
            this.awaitingPaymentData.delete(chatId);
        }
    }    

    // Manejo del flujo /get
    async handleGetPolicyFlow(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            logger.info('Buscando póliza:', { numeroPoliza });
    
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
            } else {
                // ============= BLOQUE NUEVO PARA SERVICIOS =============
                // Determinar cuántos servicios hay
                const servicios = policy.servicios || [];
                const totalServicios = servicios.length;
    
                let serviciosInfo = '\n*Servicios:* Sin servicios registrados';
                if (totalServicios > 0) {
                    // Tomamos el último servicio
                    const ultimoServicio = servicios[totalServicios - 1];
                    const fechaServStr = ultimoServicio.fechaServicio
                        ? new Date(ultimoServicio.fechaServicio).toISOString().split('T')[0]
                        : '??';
                    const origenDestino = ultimoServicio.origenDestino || '(Sin Origen/Destino)';
    
                    serviciosInfo = `
    *Servicios:* ${totalServicios}
    *Último Servicio:* ${fechaServStr}
    *Origen/Destino:* ${origenDestino}`;
                }
                // ============= FIN BLOQUE NUEVO PARA SERVICIOS =============
    
                const mensaje = `
📋 *Información de la Póliza*
*Número:* ${policy.numeroPoliza}
*Titular:* ${policy.titular}
📞 *Cel:* ${policy.telefono || 'No proporcionado'}

🚗 *Datos del Vehículo:*
*Marca:* ${policy.marca}
*Submarca:* ${policy.submarca}
*Año:* ${policy.año}
*Color:* ${policy.color}
*Serie:* ${policy.serie}
*Placas:* ${policy.placas}

*Aseguradora:* ${policy.aseguradora}
*Agente:* ${policy.agenteCotizador}
${serviciosInfo}
                `.trim();
    
                // Enviamos la información y los botones
                await ctx.replyWithMarkdown(
                    mensaje,
                    Markup.inlineKeyboard([
                        [ Markup.button.callback('📸 Ver Fotos', `verFotos:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`) ]
                    ])
                );
                logger.info('Información de póliza enviada', { numeroPoliza });
            }
        } catch (error) {
            logger.error('Error en comando get (handleGetPolicyFlow):', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
        } finally {
            this.awaitingGetPolicyNumber.delete(chatId);
        }
    }

    // 1) Recibir número de póliza
    async handleAddServicePolicyNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. Proceso cancelado.`);
            } else {
                // Guardamos en un Map la póliza destino
                this.awaitingServiceData.set(chatId, numeroPoliza);
                // Pedimos los 3 datos en 3 líneas
                await ctx.reply(
                    `✅ Póliza *${numeroPoliza}* encontrada.\n\n` +
                    `🚗 *Ingresa la información del servicio (4 líneas):*\n` +
                    `1️⃣ Costo (ej. 550.00)\n` +
                    `2️⃣ Fecha del servicio (DD/MM/YYYY)\n` +
                    `3️⃣ Número de expediente\n` +
                    `4️⃣ Origen y Destino\n\n` +
                    `📝 Ejemplo:\n\n` +
                    `550.00\n06/02/2025\nEXP-2025-001\nNeza - Tecamac`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            logger.error('Error en handleAddServicePolicyNumber:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
        } finally {
            this.awaitingServicePolicyNumber.delete(chatId);
        }
    }

    // 2) Recibimos costo, fecha, expediente y origen-destino
    async handleServiceData(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = this.awaitingServiceData.get(chatId);
            if (!numeroPoliza) {
                return await ctx.reply('❌ No se encontró la referencia de la póliza. Usa /addservice de nuevo.');
            }

            // Dividir en líneas
            const lines = messageText.split('\n').map(l => l.trim()).filter(Boolean);
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
            // Nota: Asegúrate de actualizar tu 'addServiceToPolicy' para recibir este 4º dato
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
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('Error en handleServiceData:', error);
            await ctx.reply('❌ Error al procesar el servicio. Intenta nuevamente.');
        } finally {
            // Limpiar el estado
            this.awaitingServiceData.delete(chatId);
        }
    }

        // Función que maneja la respuesta del usuario con el número de póliza
        async handleUploadFlow(ctx, messageText) {
            const chatId = ctx.chat.id;
            try {
                const numeroPoliza = messageText.trim().toUpperCase();
                logger.info('Iniciando upload para póliza:', { numeroPoliza });

                // Verificamos si la póliza existe
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
                    return;
                }

                // Guardamos en un Map qué póliza está usando este chat
                this.uploadTargets.set(chatId, numeroPoliza);

                // Avisamos al usuario que puede subir los archivos
                await ctx.reply(
                    `📤 *Subida de Archivos - Póliza ${numeroPoliza}*\n\n` +
                    `📸 Puedes enviar múltiples fotos.\n` +
                    `📄 También puedes enviar archivos PDF.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                logger.error('Error en handleUploadFlow:', error);
                await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
            } finally {
                // Quitamos el estado de "awaiting" para el número de póliza
                this.awaitingUploadPolicyNumber.delete(chatId);
            }
        }

}

module.exports = CommandHandler;
