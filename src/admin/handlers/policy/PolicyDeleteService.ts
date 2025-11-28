/**
 * PolicyDeleteService - Servicio para eliminación de pólizas
 *
 * Responsabilidad: Eliminar pólizas (soft delete)
 */

import { Context, Markup } from 'telegraf';
import Policy from '../../../models/policy';
import adminStateManager from '../../utils/adminStates';
import { AuditLogger } from '../../utils/auditLogger';
import logger from '../../../utils/logger';
import { markPolicyAsDeleted } from '../../../controllers/policyController';
import { DELETION_REASONS_MAP, DELETION_REASON_CODES } from './types';

class PolicyDeleteService {
    /**
     * Inicia el proceso de eliminación
     */
    static async handlePolicyDelete(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'policy_search_for_delete'
            );

            const searchText = `
🗑️ *ELIMINAR PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

Escribe el *número de póliza*, *nombre del titular* o *RFC* para buscar:

⚠️ La eliminación es reversible (soft delete).
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'delete_search_started', {
                module: 'policy'
            });
        } catch (error) {
            logger.error('Error al iniciar eliminación:', error);
            await ctx.reply('❌ Error al iniciar la eliminación.');
        }
    }

    /**
     * Muestra confirmación de eliminación
     */
    static async handleDeleteConfirmation(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.answerCbQuery('❌ Póliza no encontrada', { show_alert: true });
                return;
            }

            adminStateManager.updateAdminState(ctx.from!.id, ctx.chat!.id, {
                action: 'confirm_delete',
                policyToDelete: policyId,
                policyNumber: policy.numeroPoliza
            });

            const confirmText = `
⚠️ *CONFIRMAR ELIMINACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}
**RFC:** ${policy.rfc}
**Vehículo:** ${policy.marca} ${policy.submarca} ${policy.año}
**Placas:** ${policy.placas || 'Sin placas'}

🗑️ **Selecciona el motivo de eliminación:**
            `.trim();

            // Usar códigos cortos en callbacks para evitar límite de 64 bytes
            const reasonButtons = DELETION_REASON_CODES.map(code => [
                Markup.button.callback(DELETION_REASONS_MAP[code], `adm_del:${policyId}:${code}`)
            ]);

            reasonButtons.push([Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]);

            const keyboard = Markup.inlineKeyboard(reasonButtons);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await ctx.answerCbQuery();
        } catch (error) {
            logger.error('Error en confirmación de eliminación:', error);
            await ctx.answerCbQuery('❌ Error al procesar', { show_alert: true });
        }
    }

    /**
     * Maneja el motivo de eliminación y ejecuta la eliminación
     * @param reasonCode - Código corto del motivo (pv, sc, ii, dup, otro)
     */
    static async handleDeletionReason(
        ctx: Context,
        policyId: string,
        reasonCode: string
    ): Promise<boolean> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return false;
            }

            // Mapear código a texto completo
            const reason = DELETION_REASONS_MAP[reasonCode] || reasonCode;

            // Ejecutar eliminación (soft delete)
            const success = await markPolicyAsDeleted(policy.numeroPoliza, reason);

            if (success) {
                await ctx.editMessageText(
                    `✅ *PÓLIZA ELIMINADA*\n\n` +
                        `**Póliza:** ${policy.numeroPoliza}\n` +
                        `**Titular:** ${policy.titular}\n` +
                        `**Motivo:** ${reason}\n\n` +
                        `_La póliza puede ser restaurada desde el menú de restauración._`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [
                                Markup.button.callback(
                                    '♻️ Deshacer',
                                    `admin_policy_restore_confirm:${policyId}`
                                )
                            ],
                            [Markup.button.callback('⬅️ Menú Pólizas', 'admin_policy_menu')]
                        ])
                    }
                );

                await AuditLogger.log(ctx, 'policy_deleted', {
                    module: 'policy',
                    metadata: {
                        policyId,
                        policyNumber: policy.numeroPoliza,
                        reason,
                        titular: policy.titular
                    }
                });
            } else {
                await ctx.reply('❌ Error al eliminar la póliza.');
            }

            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            return true;
        } catch (error) {
            logger.error('Error al ejecutar eliminación:', error);
            await ctx.reply('❌ Error al eliminar la póliza.');
            return false;
        }
    }

    /**
     * Maneja texto de búsqueda para eliminación
     */
    static async handleTextMessage(ctx: Context): Promise<boolean> {
        const state = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

        if (!state) return false;

        const message = ctx.message as any;
        const text = message?.text?.trim();

        if (!text) return false;

        const action = state.operation || state.data?.action;

        if (action === 'policy_search_for_delete') {
            const PolicySearchService = (await import('./PolicySearchService')).default;
            await PolicySearchService.searchPolicyForDelete(ctx, text);
            return true;
        }

        return false;
    }
}

export default PolicyDeleteService;
