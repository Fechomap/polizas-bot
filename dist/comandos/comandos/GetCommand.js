"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
const telegraf_1 = require("telegraf");
const policyController_1 = require("../../controllers/policyController");
const StateKeyManager_1 = __importDefault(require("../../utils/StateKeyManager"));
class GetCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
        this.awaitingGetPolicyNumber = handler.awaitingGetPolicyNumber;
    }
    getCommandName() {
        return 'get';
    }
    getDescription() {
        return 'Consultar una póliza existente';
    }
    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando ni callback aquí.`);
    }
    async handleGetPolicyFlow(ctx, messageText) {
        const chatId = ctx.chat?.id;
        const threadId = StateKeyManager_1.default.getThreadId(ctx);
        try {
            const numeroPoliza = messageText.trim().toUpperCase();
            this.logInfo('Buscando póliza:', { numeroPoliza, threadId });
            const policy = await (0, policyController_1.getPolicyByNumber)(numeroPoliza);
            if (!policy) {
                await ctx.reply(`❌ No se encontró ninguna póliza con el número: ${numeroPoliza}`);
            }
            else {
                const flowStateManager = require('../../utils/FlowStateManager');
                flowStateManager.saveState(chatId, numeroPoliza, {
                    active: true,
                    activeSince: new Date().toISOString()
                }, threadId);
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
                await ctx.replyWithMarkdown(mensaje, telegraf_1.Markup.inlineKeyboard([
                    [
                        telegraf_1.Markup.button.callback('📸 Ver Fotos', `verFotos:${policy.numeroPoliza}`),
                        telegraf_1.Markup.button.callback('📄 Ver PDFs', `verPDFs:${policy.numeroPoliza}`)
                    ],
                    [
                        telegraf_1.Markup.button.callback('🚗 Ocupar Póliza', `ocuparPoliza:${policy.numeroPoliza}`)
                    ],
                    [telegraf_1.Markup.button.callback('⬅️ Volver al Menú', 'accion:volver_menu')]
                ]));
                this.logInfo('Información de póliza enviada', {
                    numeroPoliza,
                    threadId: threadId || 'ninguno'
                });
            }
        }
        catch (error) {
            this.logError('Error en comando get (handleGetPolicyFlow):', error);
            await ctx.reply('❌ Error al buscar la póliza. Intenta nuevamente.');
        }
        finally {
            if (chatId) {
                this.awaitingGetPolicyNumber.delete(chatId, threadId);
            }
        }
    }
}
exports.default = GetCommand;
