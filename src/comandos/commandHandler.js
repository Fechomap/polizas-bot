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

        // Store instances of commands needed for actions
        this.startCommandInstance = null;
        this.helpCommandInstance = null;
        // Add other command instances if needed for direct calls from actions

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
        this.startCommandInstance = new StartCommand(this); // Store instance
        this.registry.registerCommand(this.startCommandInstance);
        this.startCommandInstance.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const getCmd = new GetCommand(this);
        this.registry.registerCommand(getCmd);
        getCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        const mediaCmd = new MediaUploadHandler(this);
        this.registry.registerCommand(mediaCmd);
        mediaCmd.register(); // <--- LLAMAR AL MÉTODO REGISTER

        this.helpCommandInstance = new HelpCommand(this); // Store instance
        this.registry.registerCommand(this.helpCommandInstance);
        this.helpCommandInstance.register(); // <--- LLAMAR AL MÉTODO REGISTER

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
        this.setupCallbacks(); // Handles callbacks defined within command modules

        // Setup main action handlers for the menu buttons
        this.setupActionHandlers(); // NEW: Handles 'accion:...' callbacks
    }

    // Setup main action handlers for menu buttons
    setupActionHandlers() {
        logger.info('Configurando manejadores de acciones principales...');

        // Volver al menú principal
        this.bot.action('accion:volver_menu', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                // Limpiar cualquier estado pendiente antes de volver al menú
                this.clearChatState(ctx.chat.id);
                await this.startCommandInstance.showMainMenu(ctx); // Usa la instancia guardada
            } catch (error) {
                logger.error('Error en accion:volver_menu:', error);
                await ctx.reply('❌ Error al volver al menú.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Consultar Póliza
        this.bot.action('accion:consultar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                this.clearChatState(ctx.chat.id); // Limpiar estado previo
                this.awaitingGetPolicyNumber.set(ctx.chat.id, true);
                await ctx.reply('🔍 Por favor, introduce el número de póliza que deseas consultar:');
            } catch (error) {
                logger.error('Error en accion:consultar:', error);
                await ctx.reply('❌ Error al iniciar la consulta.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Registrar Nueva Póliza
        this.bot.action('accion:registrar', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                this.clearChatState(ctx.chat.id);
                this.awaitingSaveData.set(ctx.chat.id, true);
                await ctx.reply(
                    '📝 Por favor, pega la información completa de la nueva póliza (19 líneas):',
                    Markup.inlineKeyboard([ // Añadir botón cancelar
                        Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                    ])
                );
            } catch (error) {
                logger.error('Error en accion:registrar:', error);
                await ctx.reply('❌ Error al iniciar el registro.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });
         // Callback para cancelar registro
        this.bot.action('accion:cancelar_registro', async (ctx) => {
            try {
                await ctx.answerCbQuery('Registro cancelado');
                this.clearChatState(ctx.chat.id);
                await ctx.editMessageText('Registro cancelado.'); // Editar mensaje original
                // Opcional: mostrar menú principal de nuevo
                // await this.startCommandInstance.showMainMenu(ctx);
            } catch (error) {
                logger.error('Error en accion:cancelar_registro:', error);
                // No enviar reply si falla la edición
                 try { await ctx.answerCbQuery('Error al cancelar'); } catch {}
            }
        });


        // Añadir Pago
        this.bot.action('accion:addpayment', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                this.clearChatState(ctx.chat.id);
                this.awaitingPaymentPolicyNumber.set(ctx.chat.id, true);
                await ctx.reply('💰 Introduce el número de póliza para añadir el pago:');
            } catch (error) {
                logger.error('Error en accion:addpayment:', error);
                await ctx.reply('❌ Error al iniciar el registro de pago.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Añadir Servicio
        this.bot.action('accion:addservice', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                this.clearChatState(ctx.chat.id);
                this.awaitingServicePolicyNumber.set(ctx.chat.id, true);
                await ctx.reply('🚗 Introduce el número de póliza para añadir el servicio:');
            } catch (error) {
                logger.error('Error en accion:addservice:', error);
                await ctx.reply('❌ Error al iniciar el registro de servicio.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Subir Archivos
        this.bot.action('accion:upload', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                this.clearChatState(ctx.chat.id);
                this.awaitingUploadPolicyNumber.set(ctx.chat.id, true);
                await ctx.reply('📤 Introduce el número de póliza para subir archivos:');
            } catch (error) {
                logger.error('Error en accion:upload:', error);
                await ctx.reply('❌ Error al iniciar la subida de archivos.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Eliminar Póliza
        this.bot.action('accion:delete', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                this.clearChatState(ctx.chat.id);
                this.awaitingDeletePolicyNumber.set(ctx.chat.id, true);
                await ctx.reply('🗑️ Introduce el número (o números separados por espacio/coma/línea) de la(s) póliza(s) a eliminar:');
            } catch (error) {
                logger.error('Error en accion:delete:', error);
                await ctx.reply('❌ Error al iniciar la eliminación.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Ayuda
        this.bot.action('accion:help', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                // Llamar a la lógica del comando de ayuda existente
                // Asumiendo que HelpCommand tiene un método execute o similar
                 if (this.helpCommandInstance && typeof this.helpCommandInstance.sendHelpMessage === 'function') {
                    await this.helpCommandInstance.sendHelpMessage(ctx); // Ajustar si el método es diferente
                 } else {
                     logger.warn('No se pudo encontrar o ejecutar el comando de ayuda desde la acción.');
                     await ctx.reply('Comando de ayuda no disponible en este momento.');
                 }
                 // Añadir botón para volver al menú
                 await ctx.reply('Pulsa el botón para regresar:', Markup.inlineKeyboard([
                     Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                 ]));

            } catch (error) {
                logger.error('Error en accion:help:', error);
                await ctx.reply('❌ Error al mostrar la ayuda.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });

        // Submenú de Reportes
        this.bot.action('accion:reportes', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                // Mostrar submenú de reportes
                await ctx.reply('📊 *Reportes Disponibles*', {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💰 Pólizas con Pagos Pendientes', 'accion:reportPayment')],
                        [Markup.button.callback('🚗 Pólizas Prioritarias', 'accion:reportUsed')],
                        [Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                    ])
                });
            } catch (error) {
                logger.error('Error en accion:reportes:', error);
                try { await ctx.answerCbQuery('Error'); } catch {}
                await ctx.reply('❌ Error al mostrar el menú de reportes.');
            }
        });

        // Acción para el reporte de pagos pendientes
        this.bot.action('accion:reportPayment', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                // Buscar la instancia del comando ReportPaymentCommand
                const reportPaymentCmd = this.registry.getCommand('reportPayment');
                if (reportPaymentCmd && typeof reportPaymentCmd.generateReport === 'function') {
                    await reportPaymentCmd.generateReport(ctx);
                } else {
                    logger.warn('No se encontró el comando reportPayment o su método generateReport');
                    await ctx.reply('❌ Reporte no disponible en este momento.');
                }
            } catch (error) {
                logger.error('Error en accion:reportPayment:', error);
                try { await ctx.answerCbQuery('Error'); } catch {}
                await ctx.reply('❌ Error al generar el reporte de pagos pendientes.');
            }
        });

        // Acción para el reporte de pólizas prioritarias
        this.bot.action('accion:reportUsed', async (ctx) => {
            try {
                await ctx.answerCbQuery();
                // Buscar la instancia del comando ReportUsedCommand
                const reportUsedCmd = this.registry.getCommand('reportUsed');
                if (reportUsedCmd && typeof reportUsedCmd.generateReport === 'function') {
                    await reportUsedCmd.generateReport(ctx);
                } else {
                    logger.warn('No se encontró el comando reportUsed o su método generateReport');
                    await ctx.reply('❌ Reporte no disponible en este momento.');
                }
            } catch (error) {
                logger.error('Error en accion:reportUsed:', error);
                try { await ctx.answerCbQuery('Error'); } catch {}
                await ctx.reply('❌ Error al generar el reporte de pólizas prioritarias.');
            }
        });

        logger.info('✅ Manejadores de acciones principales configurados.');
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

        // Añadir botón Volver al Menú en la respuesta de getPoliza callback
         this.bot.action(/getPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback getPoliza para: ${numeroPoliza}`);
                await this.handleGetPolicyFlow(ctx, numeroPoliza); // Muestra info y botones Ver/Ocupar
                 // Añadimos el botón de volver explícitamente aquí también si handleGetPolicyFlow no lo hace siempre
                 await ctx.reply('Acciones adicionales:', Markup.inlineKeyboard([
                     Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                 ]));
                await ctx.answerCbQuery();
            } catch (error) {
                logger.error('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza desde callback.');
                try { await ctx.answerCbQuery('Error'); } catch {}
            }
        });
    }

    // Setup all registered callbacks from command modules
    setupCallbacks() {
        logger.info('Configurando callbacks registrados...');
        const callbackHandlers = this.registry.getCallbackHandlers();
        
        // Iterate through all registered callbacks and connect them to the bot
        callbackHandlers.forEach((handler, pattern) => {
            logger.info(`Conectando callback: ${pattern}`);
            this.bot.action(pattern, async (ctx) => {
                try {
                    // Asegurarse de limpiar el estado si un callback inicia un nuevo flujo
                    // this.clearChatState(ctx.chat.id); // Quizás no aquí, depende del callback
                    await handler(ctx);
                } catch (error) {
                    logger.error(`Error en callback ${pattern}:`, error);
                    await ctx.reply('❌ Error al procesar la acción.');
                    try { await ctx.answerCbQuery('Error'); } catch { /* ignore */ }
                }
            });
        });

        logger.info(`✅ ${callbackHandlers.size} callbacks de módulos conectados al bot`);
    }

     // Helper para limpiar todos los estados de espera de un chat
    clearChatState(chatId) {
        this.uploadTargets.delete(chatId);
        this.awaitingSaveData.delete(chatId);
        this.awaitingGetPolicyNumber.delete(chatId);
        this.awaitingUploadPolicyNumber.delete(chatId);
        this.awaitingDeletePolicyNumber.delete(chatId);
        this.awaitingPaymentPolicyNumber.delete(chatId);
        this.awaitingPaymentData.delete(chatId);
        this.awaitingServicePolicyNumber.delete(chatId);
        this.awaitingServiceData.delete(chatId);
        this.awaitingPhoneNumber.delete(chatId);
        this.awaitingOrigenDestino.delete(chatId);
        this.awaitingDeleteReason.delete(chatId);
        const ocuparPolizaCmd = this.registry.getCommand('ocuparPoliza');
        if (ocuparPolizaCmd) {
            if (ocuparPolizaCmd.awaitingPhoneDecision) ocuparPolizaCmd.awaitingPhoneDecision.delete(chatId);
            if (ocuparPolizaCmd.pendingLeyendas) ocuparPolizaCmd.pendingLeyendas.delete(chatId);
        }
        logger.debug(`Estado limpiado para chatId: ${chatId}`);
    }


    // -------------------------------------------------------------------------
    // Métodos auxiliares para manejar cada flujo (invocados por TextMessageHandler)
    // -------------------------------------------------------------------------

    // Manejo del flujo INICIADO por accion:registrar
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
                // No limpiar estado aquí, permitir corrección o cancelación
                // this.awaitingSaveData.delete(chatId);
                await ctx.reply(
                    `❌ Los datos no están completos. Se requieren ${EXPECTED_LINES} líneas de información.\n` +
                    'Puedes corregir y reenviar la información, o cancelar.',
                    Markup.inlineKeyboard([
                        Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                    ])
                );
                return;
            }
    
            const fechaStr = lines[18];
            const fechaParts = fechaStr.split(/[/-]/);
            if (fechaParts.length !== 3) {
                 // No limpiar estado aquí
                await ctx.reply(
                    '❌ Formato de fecha inválido en la línea 19. Use DD/MM/YY o DD/MM/YYYY.\n' +
                    'Puedes corregir y reenviar la información, o cancelar.',
                     Markup.inlineKeyboard([
                        Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                    ])
                );
                return;
            }

            let [day, month, year] = fechaParts;
            if (year.length === 2) {
                year = '20' + year; // 23 -> 2023
            }
            const 
            fecha = new Date(`${year}-${month}-${day}`);

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
                 // No limpiar estado aquí
                await ctx.reply(
                    `❌ La póliza con número *${policyData.numeroPoliza}* (línea 18) ya existe. No se puede duplicar.\n` +
                    'Verifica el número o cancela el registro.',
                     Markup.inlineKeyboard([
                        Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                    ])
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
                `Número: ${savedPolicy.numeroPoliza}`,
                 Markup.inlineKeyboard([ // Botón para volver al menú
                     Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                 ])
            );
        } catch (error) {
            logger.error('Error al procesar datos de póliza (handleSaveData):', error);
             // No limpiar estado aquí, el usuario podría querer corregir
            await ctx.reply(
                `❌ Error al guardar: ${error.message}\n` +
                'Verifica los datos e intenta reenviar, o cancela.',
                 Markup.inlineKeyboard([
                    Markup.button.callback('Cancelar Registro', 'accion:cancelar_registro')
                ])
            );
        }
    }

    // Manejo del flujo INICIADO por accion:delete (recibe N° póliza)
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
                    // Si no hay comas ni espacios, asumimos una sola póliza
                    polizasArray = [inputText];
                }
            }

            // Limpiamos y normalizamos cada número de póliza
            const numeroPolizas = polizasArray
                .map(num => num.trim().toUpperCase())
                .filter(num => num.length > 0); // Eliminar espacios vacíos
            
            // Verificar que hay al menos una póliza para procesar
            if (numeroPolizas.length === 0) {
                await ctx.reply('❌ No se detectaron números de póliza válidos. Por favor, inténtalo de nuevo o cancela.');
                // No limpiar estado, permitir reintento
                return;
            }

             // Verificar que todas las pólizas existan ANTES de pedir el motivo
            const results = await Promise.all(numeroPolizas.map(async num => {
                const policy = await getPolicyByNumber(num);
                return { numero: num, existe: !!policy };
            }));

            const noEncontradas = results.filter(r => !r.existe);
            const encontradas = results.filter(r => r.existe).map(r => r.numero);

            if (noEncontradas.length > 0) {
                await ctx.reply(
                    `❌ Las siguientes pólizas no se encontraron y no serán procesadas:\n` +
                    `${noEncontradas.map(p => `- ${p.numero}`).join('\n')}\n\n` +
                    `${encontradas.length > 0 ? 'Se procederá con las encontradas.' : 'Ninguna póliza válida para eliminar. Proceso cancelado.'}`
                );
                 if (encontradas.length === 0) {
                     this.awaitingDeletePolicyNumber.delete(chatId); // Cancelar si ninguna es válida
                     return;
                 }
            }

            // Si hay muchas pólizas válidas, confirmamos antes de proceder
            // const esProcesoPesado = numeroPolizas.length > 5; // REMOVED initial declaration
            let mensajeConfirmacion = '';
            
            // Determine if it's a heavy process based on FOUND policies
            let esProcesoPesado = encontradas.length > 5; // CHANGED to let declaration

            if (esProcesoPesado) {
                mensajeConfirmacion = `🔄 Se procesarán ${encontradas.length} pólizas.\n\n`;
            }

            // Solicitamos motivo de eliminación para las pólizas encontradas
            await ctx.reply(
                `🗑️ Vas a marcar como ELIMINADAS ${encontradas.length} póliza(s):\n` +
                `${esProcesoPesado ? '(Mostrando las primeras 5 de ' + encontradas.length + ')\n' : ''}` +
                `${encontradas.slice(0, 5).map(p => '- ' + p).join('\n')}` +
                `${esProcesoPesado ? '\n...' : ''}\n\n` +
                `${mensajeConfirmacion}` +
                'Por favor, ingresa un motivo para la eliminación (o escribe "ninguno"):',
                { parse_mode: 'Markdown' }
            );

            // Guardamos los números de póliza VÁLIDOS para usarlos cuando recibamos el motivo
            this.awaitingDeleteReason = this.awaitingDeleteReason || new Map();
            this.awaitingDeleteReason.set(chatId, encontradas); // Guardar solo las válidas

            // Limpiamos el estado de espera del número de póliza
            this.awaitingDeletePolicyNumber.delete(chatId);
        } catch (error) {
            logger.error('Error en handleDeletePolicyFlow:', error);
            await ctx.reply('❌ Hubo un error al procesar la solicitud. Intenta nuevamente.');
            // Limpiar estados en caso de error inesperado
            this.awaitingDeletePolicyNumber.delete(chatId);
            if (this.awaitingDeleteReason) this.awaitingDeleteReason.delete(chatId);
        }
    }


    // Manejo del flujo INICIADO por accion:addpayment (recibe N° póliza)
    async handleAddPaymentPolicyNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = messageText.trim().toUpperCase();

            // Verificamos si existe
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. Verifica el número e intenta de nuevo, o cancela.`);
                 // No limpiar estado, permitir reintento
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
                 // Ya no esperamos la póliza, ahora esperamos los datos
                 this.awaitingPaymentPolicyNumber.delete(chatId);
            }
        } catch (error) {
            logger.error('Error en handleAddPaymentPolicyNumber:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
             // Limpiar ambos estados en caso de error
             this.awaitingPaymentPolicyNumber.delete(chatId);
             this.awaitingPaymentData.delete(chatId);
        }
    }

    // Manejo del flujo INICIADO por accion:addpayment (recibe datos de pago)
    async handlePaymentData(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const numeroPoliza = this.awaitingPaymentData.get(chatId);
            if (!numeroPoliza) {
                // El estado se perdió, guiar al usuario
                 logger.warn(`Se recibieron datos de pago sin una póliza en espera para chatId: ${chatId}`);
                return await ctx.reply('❌ Hubo un problema. Por favor, inicia el proceso de añadir pago desde el menú principal.');
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
            await ctx.reply(`✅ Se ha registrado un pago de $${monto.toFixed(2)} con fecha ${fechaStr} en la póliza *${numeroPoliza}*.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ])
                }
            );
             // Limpiar el estado al finalizar correctamente
             this.awaitingPaymentData.delete(chatId);
        } catch (error) {
            logger.error('Error en handlePaymentData:', error);
            await ctx.reply('❌ Error al procesar el pago. Verifica los datos e intenta nuevamente.');
             // No limpiar estado en error, permitir corrección
        }
    }

    // Manejo del flujo INICIADO por accion:consultar (recibe N° póliza)
    async handleGetPolicyFlow(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const chatId = ctx.chat.id; // Asegurarse de tener chatId
            const numeroPoliza = messageText.trim().toUpperCase();
            logger.info('Buscando póliza:', { numeroPoliza, chatId });

            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}. Verifica e intenta de nuevo.`);
                 // No limpiar estado, permitir reintento
            } else {
                // ============= BLOQUE PARA SERVICIOS =============
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
                        [ Markup.button.callback('📸 Ver Fotos', `verFotos:${policy.numeroPoliza}`),
                          Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu') ] // Añadir botón volver
                    ])
                );
                logger.info('Información de póliza enviada', { numeroPoliza, chatId });
                 // Limpiar estado al mostrar la info correctamente
                 this.awaitingGetPolicyNumber.delete(chatId);
            }
        } catch (error) {
            logger.error('Error en handleGetPolicyFlow:', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
             // No limpiar estado en error
        }
    }


    // Manejo del flujo INICIADO por accion:addservice (recibe N° póliza)
    async handleAddServicePolicyNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const chatId = ctx.chat.id; // Asegurarse de tener chatId
            const numeroPoliza = messageText.trim().toUpperCase();
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. Verifica e intenta de nuevo.`);
                 // No limpiar estado
            } else {
                // Guardamos en un Map la póliza destino
                this.awaitingServiceData.set(chatId, numeroPoliza);
                // Pedimos los 4 datos en 4 líneas
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
                 // Ya no esperamos la póliza, ahora esperamos los datos
                 this.awaitingServicePolicyNumber.delete(chatId);
            }
        } catch (error) {
            logger.error('Error en handleAddServicePolicyNumber:', error);
            await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
             // Limpiar ambos estados en caso de error
             this.awaitingServicePolicyNumber.delete(chatId);
             this.awaitingServiceData.delete(chatId);
        }
    }

    // Manejo del flujo INICIADO por accion:addservice (recibe datos del servicio)
    async handleServiceData(ctx, messageText) {
        const chatId = ctx.chat.id;
        try {
            const chatId = ctx.chat.id; // Asegurarse de tener chatId
            const numeroPoliza = this.awaitingServiceData.get(chatId);
            if (!numeroPoliza) {
                 logger.warn(`Se recibieron datos de servicio sin una póliza en espera para chatId: ${chatId}`);
                return await ctx.reply('❌ Hubo un problema. Por favor, inicia el proceso de añadir servicio desde el menú principal.');
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
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                    ])
                }
            );
             // Limpiar el estado al finalizar correctamente
             this.awaitingServiceData.delete(chatId);
        } catch (error) {
            logger.error('Error en handleServiceData:', error);
            await ctx.reply('❌ Error al procesar el servicio. Verifica los datos e intenta nuevamente.');
             // No limpiar estado en error, permitir corrección
        }
    }

        // Manejo del flujo INICIADO por accion:upload (recibe N° póliza)
        async handleUploadFlow(ctx, messageText) {
            const chatId = ctx.chat.id;
            try {
            const chatId = ctx.chat.id; // Asegurarse de tener chatId
            const numeroPoliza = messageText.trim().toUpperCase();
            logger.info('Iniciando upload para póliza:', { numeroPoliza, chatId });

            // Verificamos si la póliza existe
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}. Verifica e intenta de nuevo.`);
                 // No limpiar estado, permitir reintento
                return;
            }

            // Guardamos en un Map qué póliza está usando este chat
                this.uploadTargets.set(chatId, numeroPoliza);

                // Avisamos al usuario que puede subir los archivos
                await ctx.reply(
                    `📤 *Subida de Archivos - Póliza ${numeroPoliza}*\n\n` +
                    `📸 Puedes enviar múltiples fotos.\n` +
                    `📄 También puedes enviar archivos PDF.\n\n` +
                    `Cuando termines, puedes volver al menú principal.`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')
                        ])
                    }
                );
                 // Ya no esperamos el número de póliza, ahora esperamos archivos
                 this.awaitingUploadPolicyNumber.delete(chatId);
            } catch (error) {
                logger.error('Error en handleUploadFlow:', error);
                await ctx.reply('❌ Error al procesar el número de póliza. Intenta nuevamente.');
                 // Limpiar ambos estados en caso de error
                 this.awaitingUploadPolicyNumber.delete(chatId);
                 this.uploadTargets.delete(chatId);
            }
        }

}

module.exports = CommandHandler;
