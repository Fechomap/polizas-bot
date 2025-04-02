// src/comandos/comandos/GetCommand.js
const BaseCommand = require('./BaseCommand');
const { Markup } = require('telegraf');
const { getPolicyByNumber } = require('../../controllers/policyController');

class GetCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
        // Map to track users awaiting policy number input
        this.awaitingGetPolicyNumber = handler.awaitingGetPolicyNumber;
    }

    getCommandName() {
        return 'get';
    }

    getDescription() {
        return 'Consultar una póliza existente';
    }

    register() {
        // No longer registering the /get command directly.
        // The flow is initiated by the 'accion:consultar' button in CommandHandler.
        // The 'getPoliza:' callback is also handled centrally in CommandHandler.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando ni callback aquí.`);
    }

    // This method is now primarily called by TextMessageHandler when awaitingGetPolicyNumber is true.
    // It might also be called by other specific callbacks if needed.
    async handleGetPolicyFlow(ctx, messageText) {
        const chatId = ctx.chat?.id;
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            this.logInfo('Buscando póliza:', { numeroPoliza });
    
            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
            } else {
                // Determine how many services there are
                const servicios = policy.servicios || [];
                const totalServicios = servicios.length;
    
                let serviciosInfo = '\n*Servicios:* Sin servicios registrados';
                if (totalServicios > 0) {
                    // Get the latest service
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
    
                // Send the information and buttons
                await ctx.replyWithMarkdown(
                    mensaje,
                    Markup.inlineKeyboard([
                        [ Markup.button.callback('📸 Ver Fotos', `verFotos:${policy.numeroPoliza}`), // Keep existing buttons
                          Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`) ],
                        // The 'Volver al Menú' button is added in CommandHandler's action handlers
                        // or TextMessageHandler where this function is called.
                    ])
                );
                this.logInfo('Información de póliza enviada', { numeroPoliza });
            }
        } catch (error) {
            this.logError('Error en comando get (handleGetPolicyFlow):', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
        } finally {
            if (chatId) {
                this.awaitingGetPolicyNumber.delete(chatId);
            }
        }
    }
}

module.exports = GetCommand;
