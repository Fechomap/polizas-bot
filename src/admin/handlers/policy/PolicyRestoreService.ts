/**
 * PolicyRestoreService - Servicio para restauración de pólizas
 *
 * Responsabilidad: Restaurar pólizas eliminadas
 */

import { Context, Markup } from 'telegraf';
import Policy from '../../../models/policy';
import adminStateManager from '../../utils/adminStates';
import { AuditLogger } from '../../utils/auditLogger';
import logger from '../../../utils/logger';
import { restorePolicy } from '../../../controllers/policyController';

class PolicyRestoreService {
    /**
     * Inicia el proceso de restauración
     */
    static async handlePolicyRestore(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'policy_search_for_restore');

            const searchText = `
♻️ *RESTAURAR PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

Escribe el *número de póliza*, *nombre del titular* o *RFC* para buscar en pólizas eliminadas:

_Solo se mostrarán pólizas que hayan sido eliminadas previamente._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📋 Ver eliminadas recientes', 'admin_policy_recent_deleted')],
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'restore_search_started', {
                module: 'policy'
            });
        } catch (error) {
            logger.error('Error al iniciar restauración:', error);
            await ctx.reply('❌ Error al iniciar la restauración.');
        }
    }

    /**
     * Muestra confirmación de restauración
     * Funciona tanto desde callbacks como desde mensajes de texto
     */
    static async handleRestoreConfirmation(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);
            const isCallback = !!ctx.callbackQuery;

            if (!policy) {
                if (isCallback) {
                    await ctx.answerCbQuery('❌ Póliza no encontrada', { show_alert: true });
                } else {
                    await ctx.reply('❌ Póliza no encontrada.');
                }
                return;
            }

            if (policy.estado !== 'ELIMINADO') {
                if (isCallback) {
                    await ctx.answerCbQuery('⚠️ Esta póliza no está eliminada', { show_alert: true });
                } else {
                    await ctx.reply('⚠️ Esta póliza no está eliminada.');
                }
                return;
            }

            const formatDate = (date: Date | string | null | undefined): string => {
                if (!date) return 'No definida';
                return new Date(date).toLocaleDateString('es-MX');
            };

            const confirmText = `
♻️ *CONFIRMAR RESTAURACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}
**RFC:** ${policy.rfc}
**Vehículo:** ${policy.marca} ${policy.submarca} ${policy.año}

📅 **Eliminada:** ${formatDate(policy.fechaEliminacion)}
📝 **Motivo:** ${policy.motivoEliminacion || 'No especificado'}

¿Deseas restaurar esta póliza?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Sí, restaurar', `admin_policy_restore_exec:${policyId}`),
                    Markup.button.callback('❌ No, cancelar', 'admin_policy_menu')
                ]
            ]);

            // Usar editMessageText solo si viene de callback, sino reply
            if (isCallback) {
                try {
                    await ctx.editMessageText(confirmText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                } catch {
                    // Si falla editar, enviar nuevo mensaje
                    await ctx.reply(confirmText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(confirmText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
        } catch (error) {
            logger.error('Error en confirmación de restauración:', error);
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('❌ Error al procesar', { show_alert: true });
            } else {
                await ctx.reply('❌ Error al procesar la solicitud.');
            }
        }
    }

    /**
     * Ejecuta la restauración
     */
    static async handleRestoreExecution(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.answerCbQuery('❌ Póliza no encontrada', { show_alert: true });
                return;
            }

            // Ejecutar restauración
            const success = await restorePolicy(policy.numeroPoliza);

            if (success) {
                await ctx.editMessageText(
                    `✅ *PÓLIZA RESTAURADA*\n\n` +
                    `**Póliza:** ${policy.numeroPoliza}\n` +
                    `**Titular:** ${policy.titular}\n\n` +
                    `_La póliza ha sido restaurada exitosamente._`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Menú Pólizas', 'admin_policy_menu')]
                        ])
                    }
                );

                await AuditLogger.log(ctx, 'policy_restored', {
                    module: 'policy',
                    metadata: {
                        policyId,
                        policyNumber: policy.numeroPoliza,
                        titular: policy.titular
                    }
                });
            } else {
                await ctx.reply('❌ Error al restaurar la póliza.');
            }

            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            await ctx.answerCbQuery();
        } catch (error) {
            logger.error('Error al ejecutar restauración:', error);
            await ctx.answerCbQuery('❌ Error al restaurar', { show_alert: true });
        }
    }

    /**
     * Muestra pólizas eliminadas recientemente
     */
    static async showRecentDeletedPolicies(ctx: Context): Promise<void> {
        try {
            const deletedPolicies = await Policy.find({ estado: 'ELIMINADO' })
                .sort({ fechaEliminacion: -1 })
                .limit(10)
                .select('numeroPoliza titular fechaEliminacion motivoEliminacion');

            if (deletedPolicies.length === 0) {
                await ctx.editMessageText(
                    '📋 No hay pólizas eliminadas recientemente.',
                    {
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('⬅️ Volver', 'admin_policy_restore')]
                        ])
                    }
                );
                return;
            }

            let resultText = `
📋 *PÓLIZAS ELIMINADAS RECIENTES*
━━━━━━━━━━━━━━━━━━━━━━

`;

            const buttons: any[] = [];

            deletedPolicies.forEach((policy, index) => {
                const fecha = policy.fechaEliminacion
                    ? new Date(policy.fechaEliminacion).toLocaleDateString('es-MX')
                    : 'Sin fecha';

                resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}\n`;
                resultText += `   📅 ${fecha}\n\n`;

                buttons.push([
                    Markup.button.callback(
                        `♻️ ${policy.numeroPoliza}`,
                        `admin_policy_restore_confirm:${policy._id}`
                    )
                ]);
            });

            buttons.push([
                Markup.button.callback('⬅️ Volver', 'admin_policy_restore')
            ]);

            await ctx.editMessageText(resultText.trim(), {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
            });
        } catch (error) {
            logger.error('Error al mostrar pólizas eliminadas:', error);
            await ctx.reply('❌ Error al cargar las pólizas eliminadas.');
        }
    }

    /**
     * Maneja texto de búsqueda para restauración
     */
    static async handleTextMessage(ctx: Context): Promise<boolean> {
        const state = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

        if (!state) return false;

        const message = ctx.message as any;
        const text = message?.text?.trim();

        if (!text) return false;

        const action = state.operation || state.data?.action;

        if (action === 'policy_search_for_restore') {
            const PolicySearchService = (await import('./PolicySearchService')).default;
            await PolicySearchService.searchPolicyForRestore(ctx, text);
            return true;
        }

        return false;
    }
}

export default PolicyRestoreService;
