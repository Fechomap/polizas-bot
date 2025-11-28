/**
 * PolicyDisplayService - Servicio para mostrar detalles de pólizas
 *
 * Responsabilidad: Formatear y mostrar información de pólizas
 */

import { Context, Markup } from 'telegraf';
import Policy from '../../../models/policy';
import adminStateManager from '../../utils/adminStates';
import { AuditLogger } from '../../utils/auditLogger';
import logger from '../../../utils/logger';
import type { IPolicySearchResult } from './types';

class PolicyDisplayService {
    /**
     * Formatea una fecha para mostrar
     */
    static formatDate(date: Date | string | null | undefined): string {
        if (!date) return 'No definida';
        return new Date(date).toLocaleDateString('es-MX');
    }

    /**
     * Formatea un teléfono para mostrar
     */
    static formatPhone(phone: string | null | undefined): string {
        if (!phone) return 'No definido';
        if (phone.length === 10) {
            return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
        }
        return phone;
    }

    /**
     * Muestra detalles completos de una póliza con opciones
     */
    static async showUnifiedPolicyDetails(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const serviciosReales = policy.servicios?.length || 0;
            const registrosReales = policy.registros?.length || 0;

            const detailsText = `
📋 *DETALLES DE PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

**INFORMACIÓN BÁSICA**
🔖 Número: ${policy.numeroPoliza}
👤 Titular: ${policy.titular}
🆔 RFC: ${policy.rfc}
📧 Email: ${policy.correo || 'No definido'}
📞 Teléfono: ${this.formatPhone(policy.telefono)}

**DOMICILIO**
🏠 ${policy.calle || 'Sin calle'}, ${policy.colonia || 'Sin colonia'}
📍 ${policy.municipio || 'Sin municipio'}, ${policy.estadoRegion || 'Sin estado'}
📮 CP: ${policy.cp || 'Sin CP'}

**VEHÍCULO**
🚗 ${policy.marca || 'Sin marca'} ${policy.submarca || 'Sin submarca'} ${policy.año || 'Sin año'}
🏷️ Placas: ${policy.placas || 'Sin placas'}
🔢 Serie: ${policy.serie || 'Sin serie'}
🎨 Color: ${policy.color || 'Sin color'}

**PÓLIZA**
📅 Emisión: ${this.formatDate(policy.fechaEmision)}
📅 Fin Cobertura: ${this.formatDate(policy.fechaFinCobertura)}
🛡️ Estado: ${policy.estadoPoliza || 'Sin definir'}
🏢 Aseguradora: ${policy.aseguradora || 'Sin aseguradora'}

**SERVICIOS Y REGISTROS**
🚗 Servicios: ${serviciosReales}
📋 Registros: ${registrosReales}

🎯 **¿Qué deseas hacer con esta póliza?**
            `.trim();

            const buttons = [
                [
                    Markup.button.callback('✏️ Editar', `admin_policy_edit_categories:${policy._id}`),
                    Markup.button.callback('🗑️ Eliminar', `admin_policy_delete_confirm:${policy._id}`)
                ],
                [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
            ];

            const keyboard = Markup.inlineKeyboard(buttons);

            try {
                await ctx.editMessageText(detailsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch {
                await ctx.reply(detailsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);

            await AuditLogger.log(ctx, 'policy_unified_view', {
                module: 'policy',
                metadata: {
                    policyId: policy._id.toString(),
                    policyNumber: policy.numeroPoliza
                }
            });
        } catch (error) {
            logger.error('Error al mostrar detalles unificados:', error);
            await ctx.reply('❌ Error al cargar los detalles de la póliza.');
        }
    }

    /**
     * Muestra detalles de una póliza (versión compacta)
     */
    static async showPolicyDetails(ctx: Context, policy: any): Promise<void> {
        try {
            const totalServicios = policy.servicios?.length || 0;

            const detailsText = `
📋 *DETALLES DE PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

📝 *Número:* ${policy.numeroPoliza}
👤 *Titular:* ${policy.titular}
🆔 *RFC:* ${policy.rfc || 'No definido'}
📞 *Teléfono:* ${this.formatPhone(policy.telefono)}
📧 *Email:* ${policy.correo || 'No definido'}

🏠 *Dirección:*
${policy.calle || ''} ${policy.colonia || ''}
${policy.municipio || ''}, ${policy.estadoRegion || ''} ${policy.cp || ''}

🚗 *Vehículo:*
${policy.marca || ''} ${policy.submarca || ''} ${policy.año || ''}
Placas: ${policy.placas || 'Sin placas'}
Serie: ${policy.serie || 'Sin serie'}
Color: ${policy.color || 'Sin color'}

🏢 *Aseguradora:* ${policy.aseguradora || 'Sin aseguradora'}
👤 *Agente:* ${policy.agenteCotizador || 'Sin agente'}
📅 *Emisión:* ${this.formatDate(policy.fechaEmision)}
📅 *Vencimiento:* ${this.formatDate(policy.fechaFinCobertura)}

📊 *Servicios:* ${totalServicios}
⭐ *Calificación:* ${policy.calificacion || 'Sin calificar'}
            `.trim();

            const buttons = [
                [
                    Markup.button.callback('✏️ Editar', `admin_policy_edit_categories:${policy._id}`),
                    Markup.button.callback('🗑️ Eliminar', `admin_policy_delete_confirm:${policy._id}`)
                ],
                [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
            ];

            await ctx.reply(detailsText, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });
        } catch (error) {
            logger.error('Error al mostrar detalles de póliza:', error);
            await ctx.reply('❌ Error al mostrar los detalles.');
        }
    }

}


export default PolicyDisplayService;
