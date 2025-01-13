// src/comandos/commandHandler.js
const { Markup } = require('telegraf');
const config = require('../config');  // <-- Añadir esta línea
const { getPolicyByNumber, savePolicy, addFileToPolicy, deletePolicyByNumber, addPaymentToPolicy, addServiceToPolicy,  getSusceptiblePolicies, getOldUnusedPolicies } = require('../controllers/policyController');
const logger = require('../utils/logger');
const FileHandler = require('../utils/fileHandler');
const fetch = require('node-fetch');

class CommandHandler {
    constructor(bot) {
        if (!bot) {
            throw new Error('Bot instance is required');
        }
        this.bot = bot;
        this.uploadTargets = new Map();

        // Para /save
        this.awaitingSaveData = new Map();

        // Para /get
        this.awaitingGetPolicyNumber = new Map();

        // Para /upload
        this.awaitingUploadPolicyNumber = new Map();

        // Para /delete
        this.awaitingDeletePolicyNumber = new Map();

        // Para /addpayment
        this.awaitingPaymentPolicyNumber = new Map();  // saber a quién pedir el número de póliza
        this.awaitingPaymentData = new Map();          // cuando ya tenemos la póliza, pediremos monto y fecha        

        // Para /addservice
        this.awaitingServicePolicyNumber = new Map(); // Recibir número de póliza
        this.awaitingServiceData = new Map();         // Recibir costo, fechaServicio, númeroExpediente

        this.awaitingPhoneNumber = new Map();
        this.awaitingOrigenDestino = new Map();

        this.setupGroupRestriction();

        this.setupCommands();
    }

    setupGroupRestriction() {
        const allowedGroups = config.telegram.allowedGroups || [];
    
        this.bot.use(async (ctx, next) => {
            const chatId = ctx.chat?.id;
            
            // Si NO es el grupo permitido, rechazar
            const isAllowed = allowedGroups.some(id => Number(id) === Number(chatId));
            if (!isAllowed) {
                logger.warn(`Acceso no autorizado desde: ${chatId} (${ctx.chat?.type})`);
                // Solo responder si es un grupo (no en privado)
                if (ctx.chat?.type !== 'private') {
                    await ctx.reply('⛔️ Este bot solo puede ser usado en el grupo autorizado.');
                }
                return;
            }
    
            return next();
        });
    }

    setupCommands() {
        // Comando Start
        this.bot.command('start', async (ctx) => {
            try {
                await ctx.reply(
                    '¡Bienvenido al Bot de Pólizas! 🤖\n\n' +
                    '📋 *Comandos Principales:*\n\n' +
                    '📝 /save - Registrar nueva póliza\n' +
                    '🔍 /get - Consultar una póliza\n' +
                    '📤 /upload - Subir fotos y PDF del vehículo\n' +
                    '💰 /addpayment - Registrar un pago\n' +
                    '🚗 /addservice - Registrar un servicio\n' +
                    '❓ /help - Ver todos los comandos',
                    { parse_mode: 'Markdown' }
                );
                logger.info('Comando start ejecutado', { chatId: ctx.chat.id });
            } catch (error) {
                logger.error('Error en comando start:', error);
                await ctx.reply('❌ Error al iniciar. Intenta nuevamente.');
            }
        });

        // Fragmento para manejar el callback de "Ver Fotos"
        this.bot.action(/verFotos:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Intentando mostrar fotos de póliza: ${numeroPoliza}`);
        
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                }
        
                const fotos = policy.archivos?.fotos || [];
                if (fotos.length === 0) {
                    return await ctx.reply('📸 No hay fotos asociadas a esta póliza.');
                }
        
                await ctx.reply(`📸 Mostrando ${fotos.length} foto(s):`);
        
                for (const foto of fotos) {
                    try {
                        if (!foto.data) {
                            logger.warn('Foto sin datos');
                            continue;
                        }
        
                        await ctx.replyWithPhoto({
                            source: foto.data
                        });
                    } catch (error) {
                        logger.error('Error al enviar foto:', error);
                    }
                }
            } catch (error) {
                logger.error('Error al mostrar fotos:', error);
                await ctx.reply('❌ Error al mostrar las fotos.');
            }
            await ctx.answerCbQuery();
        });

        // Fragmento para manejar el callback de "Ver PDFs"
        this.bot.action(/verPDFs:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const policy = await getPolicyByNumber(numeroPoliza);
        
                if (!policy) {
                    return await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                }
        
                const pdfs = policy.archivos?.pdfs || [];
                if (pdfs.length === 0) {
                    return await ctx.reply('📄 No hay PDFs asociados a esta póliza.');
                }
        
                await ctx.reply(`📄 Mostrando ${pdfs.length} PDF(s):`);
        
                for (const pdf of pdfs) {
                    try {
                        if (!pdf.data) {
                            logger.warn('PDF sin datos encontrado');
                            continue;
                        }
        
                        // Modificación aquí: manejo correcto del Buffer
                        const fileBuffer = pdf.data instanceof Buffer ? 
                            pdf.data : 
                            Buffer.from(pdf.data.buffer || pdf.data);
        
                        await ctx.replyWithDocument({
                            source: fileBuffer,
                            filename: `Documento_${numeroPoliza}.pdf`
                        });
                    } catch (error) {
                        logger.error('Error al enviar PDF individual:', error);
                        await ctx.reply('❌ Error al enviar un PDF');
                    }
                }
            } catch (error) {
                logger.error('Error al mostrar PDFs:', error);
                await ctx.reply('❌ Error al mostrar los PDFs.');
            }
            await ctx.answerCbQuery();
        });

        // Comando GET (conversacional)
        this.bot.command('get', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                // Marcamos que estamos esperando el número de póliza
                this.awaitingGetPolicyNumber.set(chatId, true);
                await ctx.reply('Por favor, ingresa el número de póliza que deseas consultar.');
            } catch (error) {
                logger.error('Error al iniciar comando get:', error);
                await ctx.reply('❌ Error al iniciar la consulta. Intenta nuevamente.');
            }
        });

        // Comando DELETE (conversacional)
        this.bot.command('delete', async (ctx) => {
            try {
                const ADMIN_ID = -1002291817096;  // <-- Pon AQUÍ tu ID de Telegram (numérico)
                if (ctx.from.id !== ADMIN_ID) {
                    return await ctx.reply('❌ No tienes permiso para borrar pólizas.');
                }
        
                const chatId = ctx.chat.id;
                // Marcamos que esperamos un número de póliza
                this.awaitingDeletePolicyNumber.set(chatId, true);
                await ctx.reply('Por favor, ingresa el número de póliza que deseas eliminar (ADMIN).');
            } catch (error) {
                logger.error('Error al iniciar comando delete:', error);
                await ctx.reply('❌ Error al iniciar la eliminación. Intenta nuevamente.');
            }
        });       

        // Comando UPLOAD (conversacional)
        this.bot.command('upload', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                this.awaitingUploadPolicyNumber.set(chatId, true);
                await ctx.reply('📤 Por favor, ingresa el número de póliza para la cual deseas subir fotos o PDFs.');
            } catch (error) {
                logger.error('Error en comando upload:', error);
                await ctx.reply('❌ Error al iniciar upload. Intenta nuevamente.');
            }
        });


        this.bot.command('addpayment', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                this.awaitingPaymentPolicyNumber.set(chatId, true);
                await ctx.reply('💰 Por favor, ingresa el número de póliza para registrar un pago.');
            } catch (error) {
                logger.error('Error al iniciar comando addpayment:', error);
                await ctx.reply('❌ Error al iniciar el registro de pago. Intenta nuevamente.');
            }
        });       

        this.bot.command('addservice', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                this.awaitingServicePolicyNumber.set(chatId, true);
                await ctx.reply('🚗 Por favor, ingresa el número de póliza para registrar un servicio.');
            } catch (error) {
                logger.error('Error al iniciar comando addservice:', error);
                await ctx.reply('❌ Error al iniciar el registro de servicio. Intenta nuevamente.');
            }
        });


        // Manejador de fotos
        this.bot.on('photo', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const numeroPoliza = this.uploadTargets.get(chatId);
        
                if (!numeroPoliza) {
                    return await ctx.reply('⚠️ Primero usa /upload y proporciona el número de póliza.');
                }
        
                // Tomar la foto en máxima resolución
                const photos = ctx.message.photo;
                const highestResPhoto = photos[photos.length - 1];
                const fileId = highestResPhoto.file_id;
        
                // Descargar archivo
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink.href);
                if (!response.ok) throw new Error('Falló la descarga de la foto');
                const buffer = await response.buffer();
        
                // Crear objeto de archivo directamente
                const fileObject = {
                    data: buffer,
                    contentType: 'image/jpeg'
                };
        
                // Buscar la póliza y actualizar
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
        
                // Inicializar archivos si no existe
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [] };
                }
        
                // Agregar la foto
                policy.archivos.fotos.push(fileObject);
        
                // Guardar
                await policy.save();
        
                await ctx.reply('✅ Foto guardada correctamente.');
            } catch (error) {
                logger.error('Error al procesar foto:', error);
                await ctx.reply('❌ Error al procesar la foto.');
            } finally {
                this.uploadTargets.delete(ctx.chat.id);
            }
        });
        
        this.bot.on('document', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const numeroPoliza = this.uploadTargets.get(chatId);
        
                if (!numeroPoliza) {
                    return await ctx.reply('⚠️ Primero usa /upload y proporciona el número de póliza.');
                }
        
                const { mime_type: mimeType = '' } = ctx.message.document || {};
                if (!mimeType.includes('pdf')) {
                    return await ctx.reply('⚠️ Solo se permiten documentos PDF.');
                }
        
                // Descargar archivo
                const fileId = ctx.message.document.file_id;
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink.href);
                if (!response.ok) throw new Error('Falló la descarga del documento');
                const buffer = await response.buffer();
        
                // Crear objeto de archivo directamente
                const fileObject = {
                    data: buffer,
                    contentType: 'application/pdf'
                };
        
                // Buscar la póliza y actualizar
                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada.`);
                }
        
                // Inicializar archivos si no existe
                if (!policy.archivos) {
                    policy.archivos = { fotos: [], pdfs: [] };
                }
        
                // Agregar el PDF
                policy.archivos.pdfs.push(fileObject);
        
                // Guardar
                await policy.save();
        
                await ctx.reply('✅ PDF guardado correctamente.');
            } catch (error) {
                logger.error('Error al procesar documento:', error);
                await ctx.reply('❌ Error al procesar el documento.');
            } finally {
                this.uploadTargets.delete(ctx.chat.id);
            }
        });


        // Comando SAVE (conversacional)
        this.bot.command('save', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                logger.info('=== Iniciando comando SAVE ===', { chatId });

                // Marcar este chat como esperando datos para save
                this.awaitingSaveData.set(chatId, true);

                await ctx.reply(
                    'Ingresa los datos de la póliza siguiendo este formato (cada campo en una línea):\n\n' +
                    '1) Titular\n' +
                    '2) Correo Electrónico\n' +
                    '3) Contraseña\n' +
                    '4) Calle\n' +
                    '5) Colonia\n' +
                    '6) Municipio\n' +
                    '7) Estado\n' +
                    '8) CP\n' +
                    '9) RFC\n' +
                    '10) Marca\n' +
                    '11) Submarca\n' +
                    '12) Año\n' +
                    '13) Color\n' +
                    '14) Serie\n' +
                    '15) Placas\n' +
                    '16) Agente Cotizador\n' +
                    '17) Aseguradora\n' +
                    '18) # de Póliza\n' +
                    '19) Fecha de Emisión (DD/MM/YY o DD/MM/YYYY)'
                );
            } catch (error) {
                logger.error('Error al iniciar save:', error);
                await ctx.reply('❌ Error al iniciar el proceso. Intenta nuevamente.');
            }
        });

        // Comando para reporte de pólizas que necesitan pago (susceptibles)
        this.bot.command('reportPayment', async (ctx) => {
            try {
                const susceptibles = await getSusceptiblePolicies();
        
                if (!susceptibles.length) {
                    return await ctx.reply('✅ No hay pólizas susceptibles de falta de pago. Todas están al corriente.');
                }
        
                // Armamos un arreglo de líneas
                const lines = [];
                lines.push('⚠️ *Pólizas con Pagos Pendientes*\n');
                susceptibles.forEach((pol) => {
                    lines.push(`🔴 *${pol.numeroPoliza}* - *${pol.diasDeImpago}* días de impago`);
                });
        
                // Definir el tamaño de cada bloque
                const chunkSize = 10; // 10 pólizas por mensaje
                const totalChunks = Math.ceil(lines.length / chunkSize);
        
                for (let i = 0; i < totalChunks; i++) {
                    const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize).join('\n');
        
                    // Esperar 1 segundo entre mensajes para evitar saturar Telegram
                    await new Promise(resolve => setTimeout(resolve, 1000));
        
                    // Enviar el bloque
                    await ctx.replyWithMarkdown(chunk);
                }
            } catch (error) {
                logger.error('Error en reportPayment:', error);
                await ctx.reply('❌ Ocurrió un error al generar el reporte de pago.');
            }
        });

        // Comando para reporte de pólizas "usadas"
        this.bot.command('reportUsed', async (ctx) => {
            try {
                const oldUnused = await getOldUnusedPolicies();

                if (!oldUnused.length) {
                    return await ctx.reply('✅ No hay pólizas pendientes (todas tienen servicios recientes).');
                }

                // Función de ordenamiento según los criterios especificados
                const sortPolicies = (policies) => {
                    return policies.sort((a, b) => {
                        // 1. Primero por días desde emisión (más de 25 días)
                        const diasDesdeEmisionA = (new Date() - new Date(a.fechaEmision)) / (1000 * 60 * 60 * 24);
                        const diasDesdeEmisionB = (new Date() - new Date(b.fechaEmision)) / (1000 * 60 * 60 * 24);
                        
                        // Si ambas tienen más de 25 días, seguimos con los siguientes criterios
                        if (diasDesdeEmisionA > 25 && diasDesdeEmisionB > 25) {
                            // 2. Por número de servicios (menor primero)
                            const numServiciosA = a.servicios?.length || 0;
                            const numServiciosB = b.servicios?.length || 0;
                            if (numServiciosA !== numServiciosB) {
                                return numServiciosA - numServiciosB;
                            }
                            
                            // 3. Por fecha del último servicio (más antiguo primero)
                            if (numServiciosA === 0 && numServiciosB === 0) {
                                return 0; // Ambas sin servicios
                            }
                            
                            const ultimoServicioA = numServiciosA > 0 ? 
                                Math.max(...a.servicios.map(s => new Date(s.fechaServicio).getTime())) : 
                                new Date().getTime();
                            const ultimoServicioB = numServiciosB > 0 ? 
                                Math.max(...b.servicios.map(s => new Date(s.fechaServicio).getTime())) : 
                                new Date().getTime();
                                
                            return ultimoServicioA - ultimoServicioB;
                        }
                        
                        // Si una tiene más de 25 días y la otra no, priorizar la que tiene más de 25
                        return diasDesdeEmisionB - diasDesdeEmisionA;
                    });
                };

                // Ordenar las pólizas según los criterios
                const sortedPolicies = sortPolicies(oldUnused);

                // Tomar solo las primeras 10
                const top10Policies = sortedPolicies.slice(0, 10);

                // Vamos a mandar un mensaje por cada póliza en el Top 10
                for (const pol of top10Policies) {
                    // 1) Fecha de Emisión
                    const fEmision = pol.fechaEmision
                        ? new Date(pol.fechaEmision).toISOString().split('T')[0]
                        : '??';

                    // 2) Datos de servicios
                    const servicios = pol.servicios || [];

                    let infoServicio = '📋 *No existe reporte de servicio.*';
                    if (servicios.length > 0) {
                        // Encontrar el último servicio por fecha
                        const ultimo = servicios.reduce((latest, current) => {
                            const currentDate = new Date(current.fechaServicio);
                            return !latest || currentDate > new Date(latest.fechaServicio) ? current : latest;
                        }, null);

                        const fechaServ = ultimo.fechaServicio
                            ? new Date(ultimo.fechaServicio).toISOString().split('T')[0]
                            : '??';
                        const origenDest = ultimo.origenDestino || '(Sin origen/destino)';

                        infoServicio =
                            `🕒 Último Serv: ${fechaServ}\n` +
                            `📍 Origen/Destino: ${origenDest}\n` +
                            `📊 Total de Servicios: ${servicios.length}`;
                    }

                    // 3) Construir el texto para esta póliza
                    const msg = `
        🔍 *Póliza:* ${pol.numeroPoliza}
        📅 *Emisión:* ${fEmision}
        ${infoServicio}
                    `.trim();

                    // 4) Crear el botón para "Consultar"
                    const inlineKeyboard = [
                        [
                            Markup.button.callback(
                                `👀 Consultar ${pol.numeroPoliza}`,
                                `getPoliza:${pol.numeroPoliza}`
                            )
                        ]
                    ];

                    // 5) Enviar un mensaje individual por póliza
                    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(inlineKeyboard));

                    // Pequeña pausa entre mensajes para evitar límites de rate
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                logger.error('Error en reportUsed:', error);
                await ctx.reply('❌ Ocurrió un error al generar el reporte de pólizas usadas.');
            }
        });

        // Manejador de callback "getPoliza:..."
        this.bot.action(/getPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                logger.info(`Callback getPoliza para: ${numeroPoliza}`);

                // Aquí reutilizamos la lógica de /get
                await this.handleGetPolicyFlow(ctx, numeroPoliza);

                await ctx.answerCbQuery();
            } catch (error) {
                logger.error('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza desde callback.');
            }
        });

        this.bot.action(/getPoliza:(.+)/, async (ctx) => {
            try {
                // 1) Extraemos el número de póliza desde el callback_data
                const numeroPoliza = ctx.match[1]; 
                logger.info(`Callback de getPoliza para: ${numeroPoliza}`);
        
                // 2) Usamos la misma lógica del /get, 
                //    ya sea llamando directamente a handleGetPolicyFlow 
                //    o reescribiendo su parte esencial aquí.
        
                // Opción A) Invocar directamente handleGetPolicyFlow (si está accesible).
                //    NOTA: handleGetPolicyFlow espera (ctx, messageText).
                //    Podemos pasarle (ctx, numeroPoliza).
                await this.handleGetPolicyFlow(ctx, numeroPoliza);
        
                // 3) Notificamos que el callback finalizó
                await ctx.answerCbQuery(); 
            } catch (error) {
                logger.error('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza desde callback.');
            }
        });        

        // Comando Help
        this.bot.command('help', async (ctx) => {
            try {
                const helpMessage = `
        🤖 *Bot de Pólizas - Lista de Comandos*

        📋 *Comandos Básicos:*
        🏠 /start - Inicia el bot y muestra menú principal
        ❓ /help - Muestra esta lista de comandos

        📝 *Gestión de Pólizas:*
        ➕ /save - Crea una nueva póliza
        🔍 /get - Consulta una póliza existente
        🗑️ /delete - Elimina una póliza (ADMIN)

        📁 *Gestión de Archivos:*
        📤 /upload - Sube fotos o PDFs para una póliza

        💼 *Gestión de Pagos y Servicios:*
        💰 /addpayment - Registra un nuevo pago
        🚗 /addservice - Registra un nuevo servicio

        📊 *Reportes:*
        ⚠️ /reportPayment - Muestra pólizas con pagos pendientes
        📈 /reportUsed - Muestra pólizas sin servicios recientes

        📱 *Ejemplos de Uso:*
        ✏️ Para crear póliza: /save
        ↳ Sigue las instrucciones para ingresar los datos

        🔎 Para consultar: /get
        ↳ Ingresa el número de póliza cuando se solicite

        📎 Para subir archivos: /upload
        ↳ Primero ingresa el número de póliza
        ↳ Luego envía las fotos o PDFs

        💵 Para registrar pago: /addpayment
        ↳ Ingresa número de póliza
        ↳ Luego monto y fecha`;

                await ctx.replyWithMarkdown(helpMessage);
                logger.info('Comando help ejecutado', { chatId: ctx.chat.id });
            } catch (error) {
                logger.error('Error en comando help:', error);
                await ctx.reply('❌ Error al mostrar la ayuda. Intenta nuevamente.');
            }
        });

        this.bot.action(/ocuparPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                // Guardamos en un Map que estamos esperando el teléfono para “ocupar” esta póliza
                this.awaitingPhoneNumber = this.awaitingPhoneNumber || new Map();
                this.awaitingPhoneNumber.set(ctx.chat.id, numeroPoliza);
        
                await ctx.reply(
                    `📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                    `⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                logger.error('Error en callback ocuparPoliza:', error);
                await ctx.reply('❌ Error al procesar ocupación de póliza.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // -------------------------------------------------------------------------
        // Manejador de todos los mensajes de texto que NO sean comandos
        // -------------------------------------------------------------------------
        this.bot.on('text', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const messageText = ctx.message.text.trim();

                // 1) Si estamos en flujo /save
                if (this.awaitingSaveData.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleSaveData(ctx, messageText);
                    return;
                }

                // 2) Si estamos esperando un número de póliza para /get
                if (this.awaitingGetPolicyNumber.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleGetPolicyFlow(ctx, messageText);
                    return;
                }

                // 3) Si estamos esperando un número de póliza para /upload
                if (this.awaitingUploadPolicyNumber.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleUploadFlow(ctx, messageText);
                    return;
                }

                // 4) Si estamos esperando un número de póliza para /delete
                if (this.awaitingDeletePolicyNumber.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleDeletePolicyFlow(ctx, messageText);
                    return;
                }

                // 5) Si estamos esperando un número de póliza para /addpayment
                if (this.awaitingPaymentPolicyNumber.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleAddPaymentPolicyNumber(ctx, messageText);
                    return;
                }

                // 6) Si estamos esperando los datos de pago (monto/fecha) para /addpayment
                if (this.awaitingPaymentData.get(chatId) && !messageText.startsWith('/')) {
                    await this.handlePaymentData(ctx, messageText);
                    return;
                }

                // 7) Esperando un número de póliza para /addservice
                if (this.awaitingServicePolicyNumber.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleAddServicePolicyNumber(ctx, messageText);
                    return;
                }

                // 8) Esperando datos del servicio (costo, fecha, expediente)
                if (this.awaitingServiceData.get(chatId) && !messageText.startsWith('/')) {
                    await this.handleServiceData(ctx, messageText);
                    return;
                }

                // (A) Si estamos esperando teléfono (después de pulsar el botón "Ocupar Póliza")
                if (this.awaitingPhoneNumber && this.awaitingPhoneNumber.get(chatId)) {
                    const numeroPoliza = this.awaitingPhoneNumber.get(chatId);

                    // Validar que sea 10 dígitos
                    const regexTel = /^\d{10}$/;
                    if (!regexTel.test(messageText)) {
                        // Teléfono inválido => cancelamos
                        this.awaitingPhoneNumber.delete(chatId);
                        return await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelado.');
                    }

                    // Si es válido, guardamos en la póliza
                    const policy = await getPolicyByNumber(numeroPoliza);
                    if (!policy) {
                        this.awaitingPhoneNumber.delete(chatId);
                        return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada. Cancelado.`);
                    }

                    // Guardar en policy.telefono
                    policy.telefono = messageText;
                    await policy.save();
                    await ctx.reply(
                        `✅ Teléfono asignado a la póliza ${numeroPoliza}.\n\n` +
                        `🚗 Ahora ingresa *origen y destino* (ej: "Neza - Tecamac") en una sola línea.`,
                        { parse_mode: 'Markdown' }
                    );

                    // Pasamos a "esperandoOrigenDestino"
                    this.awaitingPhoneNumber.delete(chatId);
                    this.awaitingOrigenDestino.set(chatId, numeroPoliza);
                    return;
                }

                // (B) Si estamos esperando origen-destino
                if (this.awaitingOrigenDestino && this.awaitingOrigenDestino.get(chatId)) {
                    const numeroPoliza = this.awaitingOrigenDestino.get(chatId);
                    const policy = await getPolicyByNumber(numeroPoliza);
                    if (!policy) {
                        this.awaitingOrigenDestino.delete(chatId);
                        return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada. Cancelado.`);
                    }

                    // Creamos la leyenda
                    const leyenda = `🚗 Pendiente servicio "${policy.aseguradora}"\n` +
                    `🚙 Auto: ${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
                    `📍 Origen-Destino: ${messageText}`;
                
                    await ctx.reply(
                    `✅ Origen-destino asignado: *${messageText}*\n\n` +
                    `📋 Aquí la leyenda para copiar:\n\`\`\`${leyenda}\`\`\``,
                    { parse_mode: 'Markdown' }
                    );

                    this.awaitingOrigenDestino.delete(chatId);
                    return;
                }

                // Si llega acá y no está en ninguno de los flujos anteriores, ignoramos o respondemos genérico
            } catch (error) {
                logger.error('Error general al procesar mensaje de texto:', error);
                await ctx.reply('❌ Error al procesar el mensaje. Intenta nuevamente.');
            }
        });
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
            const numeroPoliza = messageText.trim().toUpperCase();
            logger.info('Intentando eliminar póliza:', { numeroPoliza });
    
            const deletedPolicy = await deletePolicyByNumber(numeroPoliza);
            if (!deletedPolicy) {
                await ctx.reply(`❌ No se encontró la póliza con número: ${numeroPoliza}. No se eliminó nada.`);
            } else {
                await ctx.reply(`✅ Póliza *${numeroPoliza}* eliminada exitosamente.`, {
                    parse_mode: 'Markdown'
                });
            }
        } catch (error) {
            logger.error('Error en handleDeletePolicyFlow:', error);
            await ctx.reply('❌ Hubo un error al intentar eliminar la póliza. Intenta nuevamente.');
        } finally {
            // Limpiamos el estado de espera
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
📧 *Correo:* ${policy.correo || 'No proporcionado'}

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