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
        // Register the main command
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                // Mark that we're waiting for the policy number
                this.awaitingGetPolicyNumber.set(chatId, true);
                await ctx.reply('Por favor, ingresa el número de póliza que deseas consultar.');
                this.logInfo('Iniciando flujo de consulta', { chatId });
            } catch (error) {
                this.logError('Error al iniciar comando get:', error);
                await ctx.reply('❌ Error al iniciar la consulta. Intenta nuevamente.');
            }
        });

        // Register the callback for "getPoliza" button
        this.handler.registry.registerCallback(/getPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                this.logInfo(`Callback getPoliza para: ${numeroPoliza}`);
                await this.handleGetPolicyFlow(ctx, numeroPoliza);
                await ctx.answerCbQuery();
            } catch (error) {
                this.logError('Error en callback getPoliza:', error);
                await ctx.reply('❌ Error al consultar la póliza desde callback.');
            }
        });
    }

    // This method is called both from the command and the callback
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
                        [ Markup.button.callback('📸 Ver Fotos', `verFotos:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`) ],
                        [ Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`) ]
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
