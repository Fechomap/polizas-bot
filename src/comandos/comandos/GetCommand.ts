// src/comandos/comandos/GetCommand.ts
import BaseCommand from './BaseCommand';
import { Markup } from 'telegraf';
import { getPolicyByNumber } from '../../controllers/policyController';
import StateKeyManager from '../../utils/StateKeyManager';
import type { IBaseHandler, NavigationContext } from './BaseCommand';
import type { IPolicy } from '../../types/database';

interface AwaitingGetPolicyNumber {
    delete(chatId: number | string, threadId?: string | null): void;
}

interface GetCommandHandler extends IBaseHandler {
    awaitingGetPolicyNumber: AwaitingGetPolicyNumber;
}

/**
 * Comando para consultar pólizas existentes
 */
class GetCommand extends BaseCommand {
    private awaitingGetPolicyNumber: AwaitingGetPolicyNumber;

    constructor(handler: GetCommandHandler) {
        super(handler);
        // Map to track users awaiting policy number input
        this.awaitingGetPolicyNumber = handler.awaitingGetPolicyNumber;
    }

    getCommandName(): string {
        return 'get';
    }

    getDescription(): string {
        return 'Consultar una póliza existente';
    }

    register(): void {
        // No longer registering the /get command directly.
        // The flow is initiated by the 'accion:consultar' button in CommandHandler.
        // The 'getPoliza:' callback is also handled centrally in CommandHandler.
        this.logInfo(
            `Comando ${this.getCommandName()} cargado, pero no registra /comando ni callback aquí.`
        );
    }

    /**
     * This method is now primarily called by TextMessageHandler when awaitingGetPolicyNumber is true.
     * It might also be called by other specific callbacks if needed.
     */
    async handleGetPolicyFlow(ctx: NavigationContext, messageText: string): Promise<void> {
        const chatId = ctx.chat?.id;
        const threadId = StateKeyManager.getThreadId(ctx);

        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            this.logInfo('Buscando póliza:', { numeroPoliza, threadId });

            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
            } else {
                // Guardar en FlowStateManager con threadId
                const flowStateManager = require('../../utils/FlowStateManager').default;
                flowStateManager.saveState(
                    chatId,
                    numeroPoliza,
                    {
                        active: true,
                        activeSince: new Date().toISOString()
                    },
                    threadId
                );

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
                        [
                            Markup.button.callback(
                                '📸 Ver Fotos',
                                `verFotos:${policy.numeroPoliza}`
                            ), // Keep existing buttons
                            Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`)
                        ],
                        [
                            Markup.button.callback(
                                '🚗 Ocupar Póliza',
                                `ocuparPoliza:${policy.numeroPoliza}`
                            )
                        ],
                    ])
                );
                this.logInfo('Información de póliza enviada', {
                    numeroPoliza,
                    threadId: threadId || 'ninguno'
                });
            }
        } catch (error: any) {
            this.logError('Error en comando get (handleGetPolicyFlow):', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
        } finally {
            if (chatId) {
                // Limpiar el estado con threadId
                const threadIdStr = threadId ? String(threadId) : '';
                this.awaitingGetPolicyNumber.delete(chatId, threadIdStr);
            }
        }
    }
}

export default GetCommand;
