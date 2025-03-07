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

// Añade esta línea para importar el modelo Policy directamente
const Policy = require('../models/policy');

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
                const ADMIN_ID = 7143094298;  // <-- Asegúrate que sea el ID correcto
                if (ctx.from.id !== ADMIN_ID) {
                    return await ctx.reply('❌ No tienes permiso para marcar pólizas como eliminadas.');
                }
        
                const chatId = ctx.chat.id;
                // Marcamos que esperamos un número de póliza
                this.awaitingDeletePolicyNumber.set(chatId, true);
                await ctx.reply(
                    '📝 Por favor, ingresa el número de póliza a marcar como ELIMINADA.\n' +
                    'Esta póliza será excluida de todas las consultas y reportes, pero se conservará en la base de datos.'
                );
            } catch (error) {
                logger.error('Error al iniciar comando delete:', error);
                await ctx.reply('❌ Error al iniciar el proceso. Intenta nuevamente.');
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
                // Enviar mensaje inicial
                const waitMsg = await ctx.reply(
                    '🔄 Iniciando cálculo de estados de pólizas...\n' +
                    'Este proceso puede tardar varios minutos, se enviarán actualizaciones periódicas.'
                );
        
                // Variables para seguimiento y mensajes de progreso
                let lastProgressUpdate = Date.now();
                let scriptRunning = true;
                let updateCount = 0;
        
                // Iniciar el temporizador de progreso que enviará actualizaciones cada 30 segundos
                // Esto evita que Telegram piense que el bot está inactivo
                const progressInterval = setInterval(async () => {
                    if (!scriptRunning) {
                        clearInterval(progressInterval);
                        return;
                    }
                    
                    updateCount++;
                    const elapsedSeconds = Math.floor((Date.now() - lastProgressUpdate) / 1000);
                    
                    try {
                        await ctx.telegram.editMessageText(
                            waitMsg.chat.id,
                            waitMsg.message_id,
                            undefined,
                            `🔄 Cálculo de estados en progreso...\n` +
                            `⏱️ Tiempo transcurrido: ${elapsedSeconds} segundos\n` +
                            `Actualización #${updateCount} - Por favor espere, esto puede tardar varios minutos.`
                        );
                        lastProgressUpdate = Date.now();
                    } catch (e) {
                        logger.error('Error al actualizar mensaje de progreso:', e);
                        // No detenemos el proceso por errores de actualización de mensajes
                    }
                }, 30000); // Actualizar cada 30 segundos
        
                // Ejecutar el script calculoEstadosDB.js como proceso separado
                const scriptPath = path.join(__dirname, '../../scripts/calculoEstadosDB.js');
                
                const executeScript = () => {
                    return new Promise((resolve, reject) => {
                        logger.info(`Ejecutando script: ${scriptPath}`);
                        
                        const childProcess = spawn('node', [scriptPath], {
                            detached: true, // Esto permite que el proceso hijo continúe incluso si el padre termina
                            stdio: ['ignore', 'pipe', 'pipe'] // Redirigir la salida para poder capturarla
                        });
                        
                        // Capturar la salida para logs
                        childProcess.stdout.on('data', (data) => {
                            const output = data.toString().trim();
                            logger.info(`calculoEstadosDB stdout: ${output}`);
                        });
                        
                        childProcess.stderr.on('data', (data) => {
                            const errorOutput = data.toString().trim();
                            logger.error(`calculoEstadosDB stderr: ${errorOutput}`);
                        });
                        
                        // Manejar la finalización del proceso
                        childProcess.on('close', (code) => {
                            scriptRunning = false;
                            if (code === 0) {
                                logger.info(`Script calculoEstadosDB completado exitosamente (código ${code})`);
                                resolve();
                            } else {
                                logger.error(`Script calculoEstadosDB falló con código de salida ${code}`);
                                reject(new Error(`Script falló con código ${code}`));
                            }
                        });
                        
                        // Manejar errores
                        childProcess.on('error', (err) => {
                            scriptRunning = false;
                            logger.error(`Error al ejecutar calculoEstadosDB: ${err.message}`);
                            reject(err);
                        });
        
                        // Aplicar un timeout más largo para este proceso
                        setTimeout(() => {
                            if (scriptRunning) {
                                logger.warn('Tiempo límite para script excedido, pero continuando ejecución');
                                // No matamos el proceso, solo notificamos y continuamos con la ejecución
                                resolve();
                            }
                        }, 420000); // 7 minutos de timeout
                    });
                };
        
                try {
                    // Ejecutar el script con un manejador de tiempo específico
                    // Incluso si el script toma demasiado tiempo, continuaremos con el flujo
                    try {
                        await executeScript();
                    } catch (scriptError) {
                        logger.error('Error o timeout en el script, continuando con consulta de pólizas:', scriptError);
                        // Seguimos el flujo incluso con error
                    }
                    
                    // Detener el intervalo de progreso
                    clearInterval(progressInterval);
                    scriptRunning = false;
                    
                    // Actualizar mensaje para indicar que estamos consultando las pólizas
                    try {
                        await ctx.telegram.editMessageText(
                            waitMsg.chat.id,
                            waitMsg.message_id,
                            undefined,
                            '✅ Proceso de cálculo completado o tiempo límite alcanzado.\n' +
                            '🔍 Consultando las pólizas prioritarias...'
                        );
                    } catch (msgError) {
                        logger.error('Error al actualizar mensaje final:', msgError);
                        // Intentar enviar un nuevo mensaje si la edición falla
                        await ctx.reply('🔍 Consultando las pólizas prioritarias...');
                    }
        
                    // Pequeña pausa para asegurar que la base de datos tenga los cambios
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Buscar el top 10 de pólizas con mejor calificación
                    const topPolicies = await Policy.find({ 
                        estado: 'ACTIVO'  // Solo pólizas activas
                    })
                    .sort({ calificacion: -1 })  // Ordenar por calificación (mayor a menor)
                    .limit(10)  // Top 10
                    .lean();
                    
                    if (!topPolicies.length) {
                        return await ctx.reply('✅ No hay pólizas prioritarias que mostrar.');
                    }
        
                    // Enviar mensaje final de éxito
                    await ctx.reply('📊 TOP 10 PÓLIZAS POR PRIORIDAD:');
                    
                    // Enviamos un mensaje por cada póliza prioritaria, con pequeñas pausas entre mensajes
                    for (const pol of topPolicies) {
                        // Obtener datos simples sin cálculos adicionales
                        const fEmision = pol.fechaEmision 
                            ? new Date(pol.fechaEmision).toISOString().split('T')[0] 
                            : 'No disponible';
                        
                        const fechaFinCobertura = pol.fechaFinCobertura 
                            ? new Date(pol.fechaFinCobertura).toISOString().split('T')[0] 
                            : 'No disponible';
                        
                        const fechaFinGracia = pol.fechaFinGracia 
                            ? new Date(pol.fechaFinGracia).toISOString().split('T')[0] 
                            : 'No disponible';
                        
                        // Contar servicios
                        const servicios = pol.servicios || [];
                        const totalServicios = servicios.length;
                        
                        // Formatear puntaje y estado
                        let alertaPrioridad = '';
                        if (pol.calificacion >= 80) {
                            alertaPrioridad = '⚠️ *ALTA PRIORIDAD*\n';
                        } else if (pol.calificacion >= 60) {
                            alertaPrioridad = '⚠️ *PRIORIDAD MEDIA*\n';
                        }
                        
                        // Construir el mensaje directamente con datos ya calculados
                        const msg = `
        ${alertaPrioridad}🏆 *Calificación: ${pol.calificacion || 0}*
        🔍 *Póliza:* ${pol.numeroPoliza}
        📅 *Emisión:* ${fEmision}
        🚗 *Vehículo:* ${pol.marca} ${pol.submarca} (${pol.año})
        📊 *Estado:* ${pol.estadoPoliza || 'No calculado'}
        🗓️ *Fin Cobertura:* ${fechaFinCobertura} (${pol.diasRestantesCobertura || 'N/A'} días)
        ⏳ *Fin Gracia:* ${fechaFinGracia} (${pol.diasRestantesGracia || 'N/A'} días)
        🔧 *Servicios:* ${totalServicios}
        💰 *Pagos:* ${pol.pagos?.length || 0}`.trim();
        
                        // Crear botones inline
                        const inlineKeyboard = [
                            [
                                Markup.button.callback(
                                    `👀 Consultar ${pol.numeroPoliza}`,
                                    `getPoliza:${pol.numeroPoliza}`
                                )
                            ]
                        ];
        
                        try {
                            // Enviar mensaje
                            await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(inlineKeyboard));
                            
                            // Pequeña pausa entre mensajes para evitar limitaciones de Telegram
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } catch (sendError) {
                            logger.error(`Error al enviar mensaje para póliza ${pol.numeroPoliza}:`, sendError);
                            // Intentar con formato más simple si hay error
                            await ctx.reply(`Error al mostrar detalles de póliza ${pol.numeroPoliza}`);
                        }
                    }
                    
                    // Mensaje final
                    await ctx.reply('✅ Se han mostrado las pólizas prioritarias según su calificación actual.');
                    
                } catch (error) {
                    // Detener el intervalo si hay error
                    clearInterval(progressInterval);
                    scriptRunning = false;
                    
                    logger.error('Error en proceso de cálculo o consulta:', error);
                    
                    // Notificar al usuario
                    try {
                        await ctx.telegram.editMessageText(
                            waitMsg.chat.id,
                            waitMsg.message_id,
                            undefined,
                            '❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...'
                        );
                    } catch (e) {
                        // Si no se puede editar el mensaje, enviar uno nuevo
                        await ctx.reply('❌ Error durante el proceso. Intentando mostrar pólizas de todas formas...');
                    }
                    
                    // Intentar obtener pólizas de todas formas
                    try {
                        const fallbackPolicies = await Policy.find({ estado: 'ACTIVO' })
                            .sort({ calificacion: -1 })
                            .limit(10)
                            .lean();
                            
                        if (fallbackPolicies.length > 0) {
                            await ctx.reply('⚠️ Mostrando pólizas disponibles (orden actual en base de datos):');
                            
                            // Mostrar versión simplificada de cada póliza
                            for (const pol of fallbackPolicies) {
                                await ctx.replyWithMarkdown(
                                    `*Póliza:* ${pol.numeroPoliza}\n` +
                                    `*Calificación:* ${pol.calificacion || 'No calculada'}\n` +
                                    `*Vehículo:* ${pol.marca} ${pol.submarca}`,
                                    Markup.inlineKeyboard([
                                        [Markup.button.callback(`👀 Consultar ${pol.numeroPoliza}`, `getPoliza:${pol.numeroPoliza}`)]
                                    ])
                                );
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        } else {
                            await ctx.reply('❌ No se pudieron obtener las pólizas.');
                        }
                    } catch (fallbackError) {
                        logger.error('Error al obtener pólizas de respaldo:', fallbackError);
                        await ctx.reply('❌ Error crítico al intentar obtener pólizas.');
                    }
                }
            } catch (error) {
                logger.error('Error general en reportUsed:', error);
                await ctx.reply('❌ Ocurrió un error al generar el reporte de pólizas. Intente nuevamente más tarde.');
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

        // Comando Help
        // Actualizar el comando help en src/comandos/commandHandler.js

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
        🗑️ /delete - Marca una póliza como eliminada (ADMIN)

        📁 *Gestión de Archivos:*
        📤 /upload - Sube fotos o PDFs para una póliza

        💼 *Gestión de Pagos y Servicios:*
        💰 /addpayment - Registra un nuevo pago
        🚗 /addservice - Registra un nuevo servicio

        📊 *Reportes:*
        ⚠️ /reportPayment - Muestra pólizas con pagos pendientes
        📈 /reportUsed - Muestra pólizas sin servicios recientes

        🔄 *Gestión de Registros: (ADMIN)*
        📋 /listdeleted - Muestra pólizas marcadas como eliminadas

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
        ↳ Luego monto y fecha

        🗑️ Para marcar como eliminada: /delete
        ↳ La póliza se conservará en la base pero no
        aparecerá en consultas ni reportes`;

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

                if (this.awaitingDeleteReason && this.awaitingDeleteReason.get(chatId)) {
                    const numeroPolizas = this.awaitingDeleteReason.get(chatId);
                    const motivo = messageText.trim() === 'ninguno' ? '' : messageText.trim();
                    
                    try {
                        let eliminadas = 0;
                        let noEncontradas = 0;
                        let errores = 0;
                        let listadoNoEncontradas = [];
                        
                        // Mostrar mensaje inicial
                        const msgInicial = await ctx.reply(
                            `🔄 Procesando ${numeroPolizas.length} póliza(s)...`
                        );
                        
                        // Procesamos cada póliza en la lista
                        for (const numeroPoliza of numeroPolizas) {
                            try {
                                // Usar markPolicyAsDeleted para cada póliza
                                const deletedPolicy = await markPolicyAsDeleted(numeroPoliza, motivo);
                                
                                if (!deletedPolicy) {
                                    noEncontradas++;
                                    listadoNoEncontradas.push(numeroPoliza);
                                } else {
                                    eliminadas++;
                                }
                                
                                // Si son muchas pólizas, actualizamos el mensaje cada 5 procesadas
                                if (numeroPolizas.length > 10 && eliminadas % 5 === 0) {
                                    await ctx.telegram.editMessageText(
                                        msgInicial.chat.id,
                                        msgInicial.message_id,
                                        undefined,
                                        `🔄 Procesando ${numeroPolizas.length} póliza(s)...\n` +
                                        `✅ Procesadas: ${eliminadas + noEncontradas + errores}/${numeroPolizas.length}\n` +
                                        `⏱️ Por favor espere...`
                                    );
                                }
                            } catch (error) {
                                logger.error(`Error al marcar póliza ${numeroPoliza} como eliminada:`, error);
                                errores++;
                            }
                        }
                        
                        // Editamos el mensaje inicial para mostrar el resultado final
                        await ctx.telegram.editMessageText(
                            msgInicial.chat.id,
                            msgInicial.message_id,
                            undefined,
                            `✅ Proceso completado`
                        );
                        
                        // Construimos el mensaje de resultados
                        let mensajeResultado = `📊 *Resultados del proceso:*\n` +
                            `✅ Pólizas eliminadas correctamente: ${eliminadas}\n`;
                        
                        if (noEncontradas > 0) {
                            mensajeResultado += `⚠️ Pólizas no encontradas o ya eliminadas: ${noEncontradas}\n`;
                            
                            // Si hay pocas no encontradas, las listamos
                            if (noEncontradas <= 10) {
                                mensajeResultado += `📋 No encontradas:\n${listadoNoEncontradas.map(p => `- ${p}`).join('\n')}\n`;
                            }
                        }
                        
                        if (errores > 0) {
                            mensajeResultado += `❌ Errores al procesar: ${errores}\n`;
                        }
                        
                        await ctx.replyWithMarkdown(mensajeResultado);
                        
                    } catch (error) {
                        logger.error('Error general al marcar pólizas como eliminadas:', error);
                        await ctx.reply('❌ Hubo un error al marcar las pólizas como eliminadas. Intenta nuevamente.');
                    } finally {
                        // Limpiamos el estado de espera
                        this.awaitingDeleteReason.delete(chatId);
                    }
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