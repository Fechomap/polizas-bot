// src/comandos/comandos/GetCommand.ts
import BaseCommand from './BaseCommand';
import { Markup } from 'telegraf';
import { getPolicyByNumber } from '../../controllers/policyController';
import { stateManager } from '../../state/StateFactory'; // Importar stateManager
import type { IBaseHandler, NavigationContext, ChatContext } from './BaseCommand'; // Importar ChatContext
import { BaseCommand as BaseCommandClass } from './BaseCommand';

/**
 * Comando para consultar pólizas existentes
 */
class GetCommand extends BaseCommand {
    constructor(handler: IBaseHandler) {
        // Usar IBaseHandler estándar
        super(handler);
    }

    private _getStateKey(
        chatId: number | string,
        stateName: string,
        threadId?: number | string | null
    ): string {
        const threadSuffix = threadId ? `:${threadId}` : '';
        return `${stateName}:${chatId}${threadSuffix}`;
    }

    getCommandName(): string {
        return 'get';
    }

    getDescription(): string {
        return 'Consultar una póliza existente';
    }

    register(): void {
        this.logInfo(
            `Comando ${this.getCommandName()} cargado, pero no registra /comando ni callback aquí.`
        );
    }

    async handleGetPolicyFlow(ctx: NavigationContext, messageText: string): Promise<void> {
        const chatId = ctx.chat?.id;
        const threadId = BaseCommandClass.getThreadId(ctx as ChatContext);

        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            this.logInfo('Buscando póliza:', { numeroPoliza, threadId });

            const policy = await getPolicyByNumber(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
            } else {
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

                const servicios = policy.servicios || [];
                const totalServicios = servicios.length;

                let serviciosInfo = '\n*Servicios:* Sin servicios registrados';
                if (totalServicios > 0) {
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

                await ctx.replyWithMarkdown(
                    mensaje,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '📸 Ver Fotos',
                                `verFotos:${policy.numeroPoliza}`
                            ),
                            Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`)
                        ],
                        [
                            Markup.button.callback(
                                '🚗 Ocupar Póliza',
                                `ocuparPoliza:${policy.numeroPoliza}`
                            )
                        ]
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
                await stateManager.deleteState(
                    this._getStateKey(chatId, 'awaitingGetPolicyNumber', threadId)
                );
            }
        }
    }
}

export default GetCommand;
