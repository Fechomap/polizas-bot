/**
 * PolicySearchService - Servicio de búsqueda de pólizas
 *
 * Responsabilidad: Buscar y mostrar resultados de pólizas
 */

import { Context, Markup } from 'telegraf';
import Policy from '../../../models/policy';
import adminStateManager from '../../utils/adminStates';
import { AuditLogger } from '../../utils/auditLogger';
import AdminMenu from '../../menus/adminMenu';
import logger from '../../../utils/logger';
import type { IPolicySearchResult, IEnrichedPolicy } from './types';

class PolicySearchService {
    /**
     * Escapa caracteres especiales de Markdown
     */
    static escapeMarkdown(text: string): string {
        if (!text) return text;
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    /**
     * Inicia búsqueda unificada de pólizas
     */
    static async handleUnifiedPolicySearch(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'policy_unified_search');

            const searchText = `
🔍 *BUSCAR PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

Escribe uno de los siguientes datos para buscar:

📝 *Número de póliza* - Ejemplo: ABC123456
👤 *Nombre del titular* - Ejemplo: Juan Pérez
🆔 *RFC* - Ejemplo: JURP850101XXX

Una vez encontrada, podrás elegir:
✏️ Editar • 🗑️ Eliminar • 📊 Ver servicios

_Búsqueda inteligente en pólizas activas._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'policy_unified_search_initiated', {
                module: 'policy',
                metadata: { operation: 'unified_search' }
            });
        } catch (error) {
            logger.error('Error al iniciar búsqueda unificada de póliza:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }

    /**
     * Busca pólizas por término
     * @param searchTerm - Término de búsqueda
     * @param filter - 'all' busca todas, 'active' solo activas, 'deleted' solo eliminadas
     */
    static async searchPolicies(
        searchTerm: string,
        filter: 'all' | 'active' | 'deleted' = 'all'
    ): Promise<IPolicySearchResult[]> {
        const cleanTerm = searchTerm.trim();

        // Búsqueda exacta (case-insensitive para titular y rfc)
        const upperTerm = cleanTerm.toUpperCase();
        const searchQuery: any = {
            $or: [
                { numeroPoliza: upperTerm },
                { titular: { $regex: `^${cleanTerm}$`, $options: 'i' } },
                { rfc: { $regex: `^${cleanTerm}$`, $options: 'i' } }
            ]
        };

        // Aplicar filtro de estado según parámetro
        if (filter === 'active') {
            searchQuery.estado = { $ne: 'ELIMINADO' };
        } else if (filter === 'deleted') {
            searchQuery.estado = 'ELIMINADO';
        }
        // 'all' no agrega filtro de estado

        // Solo campos necesarios para listado (optimizado)
        const policies = await Policy.find(searchQuery)
            .select(
                'numeroPoliza titular rfc estado estadoPoliza fechaEmision fechaFinCobertura fechaFinGracia aseguradora'
            )
            .sort({ fechaEmision: -1 })
            .limit(10)
            .lean();

        return policies as unknown as IPolicySearchResult[];
    }

    /**
     * Maneja resultados de búsqueda unificada
     * Busca en todas las pólizas y muestra según estado:
     * - Activa → Menú de edición
     * - Eliminada → Opción de restaurar
     */
    static async handleUnifiedPolicySearchResults(ctx: Context, searchTerm: string): Promise<void> {
        try {
            // Buscar en TODAS las pólizas (activas y eliminadas)
            const searchResults = await this.searchPolicies(searchTerm, 'all');

            if (searchResults.length === 0) {
                await this.showNoResults(ctx, searchTerm);
                return;
            }

            if (searchResults.length === 1) {
                const policy = searchResults[0];

                // Si está eliminada → ofrecer restaurar
                if (policy.estado === 'ELIMINADO') {
                    const PolicyRestoreService = (await import('./PolicyRestoreService')).default;
                    await PolicyRestoreService.handleRestoreConfirmation(
                        ctx,
                        policy._id.toString()
                    );
                    return;
                }

                // Si está activa → mostrar detalles/edición
                const PolicyDisplayService = (await import('./PolicyDisplayService')).default;
                await PolicyDisplayService.showUnifiedPolicyDetails(ctx, policy._id.toString());
                return;
            }

            // Múltiples resultados → mostrar lista con indicador de estado
            await this.showMultipleSearchResults(ctx, searchResults, [searchTerm]);
        } catch (error) {
            logger.error('Error en búsqueda unificada:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }

    /**
     * Muestra mensaje cuando no hay resultados
     */
    static async showNoResults(ctx: Context, searchTerm: string): Promise<void> {
        const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas con: "${searchTerm}"

Verifica que:
• El término sea correcto
• La póliza esté activa (no eliminada)
        `.trim();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Buscar de nuevo', 'admin_policy_search')],
            [Markup.button.callback('⬅️ Menú Pólizas', 'admin_policy_menu')]
        ]);

        try {
            await ctx.editMessageText(noResultsText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch {
            await ctx.reply(noResultsText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }

    /**
     * Muestra resultados múltiples con indicador de estado
     */
    static async showMultipleSearchResults(
        ctx: Context,
        results: IPolicySearchResult[],
        processedTerms: string[]
    ): Promise<void> {
        let resultText = `
🔍 *RESULTADOS DE BÚSQUEDA*
━━━━━━━━━━━━━━━━━━━━━━

Encontradas: ${results.length} pólizas

`;

        const buttons: any[] = [];
        results.forEach((policy, index) => {
            const isDeleted = policy.estado === 'ELIMINADO';
            const statusIcon = isDeleted ? '🗑️' : '✅';
            const statusText = isDeleted ? ' (eliminada)' : '';

            resultText += `${index + 1}. ${statusIcon} ${policy.numeroPoliza} - ${policy.titular}${statusText}\n`;

            // Callback diferente según estado
            const callbackAction = isDeleted
                ? `admin_policy_restore_confirm:${policy._id}`
                : `admin_policy_unified_detail:${policy._id}`;

            buttons.push([
                Markup.button.callback(`${statusIcon} ${policy.numeroPoliza}`, callbackAction)
            ]);
        });

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_menu'),
            Markup.button.callback('⬅️ Menú Admin', 'admin_menu')
        ]);

        const keyboard = Markup.inlineKeyboard(buttons);

        try {
            await ctx.editMessageText(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch {
            await ctx.reply(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }

        adminStateManager.updateAdminState(ctx.from!.id, ctx.chat!.id, {
            searchResults: results.map(p => p._id.toString()),
            searchTerms: processedTerms
        });
    }

    /**
     * Búsqueda para eliminación (solo pólizas activas)
     */
    static async searchPolicyForDelete(ctx: Context, searchTerm: string): Promise<void> {
        try {
            const results = await this.searchPolicies(searchTerm, 'active');

            if (results.length === 0) {
                await this.showNoResults(ctx, searchTerm);
                return;
            }

            await this.showSearchResultsForDelete(ctx, results);
        } catch (error) {
            logger.error('Error en búsqueda para eliminación:', error);
            await ctx.reply('❌ Error en la búsqueda.');
        }
    }

    /**
     * Búsqueda para restauración (solo pólizas eliminadas)
     */
    static async searchPolicyForRestore(ctx: Context, searchTerm: string): Promise<void> {
        try {
            const results = await this.searchPolicies(searchTerm, 'deleted');

            if (results.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS*

No se encontraron pólizas eliminadas con: "${searchTerm}"
                `.trim();

                await ctx.reply(noResultsText, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                    ])
                });
                return;
            }

            await this.showSearchResultsForRestore(ctx, results);
        } catch (error) {
            logger.error('Error en búsqueda para restauración:', error);
            await ctx.reply('❌ Error en la búsqueda.');
        }
    }

    /**
     * Muestra resultados para eliminación
     */
    static async showSearchResultsForDelete(
        ctx: Context,
        results: IPolicySearchResult[]
    ): Promise<void> {
        let resultText = `
🗑️ *SELECCIONAR PÓLIZA PARA ELIMINAR*
━━━━━━━━━━━━━━━━━━━━━━

Encontradas: ${results.length} pólizas

`;

        const buttons: any[] = [];
        results.forEach((policy, index) => {
            resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}\n`;
            buttons.push([
                Markup.button.callback(
                    `🗑️ ${policy.numeroPoliza}`,
                    `admin_policy_delete_confirm:${policy._id}`
                )
            ]);
        });

        buttons.push([Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]);

        await ctx.reply(resultText.trim(), {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    }

    /**
     * Muestra resultados para restauración
     */
    static async showSearchResultsForRestore(
        ctx: Context,
        results: IPolicySearchResult[]
    ): Promise<void> {
        let resultText = `
♻️ *SELECCIONAR PÓLIZA PARA RESTAURAR*
━━━━━━━━━━━━━━━━━━━━━━

Encontradas: ${results.length} pólizas eliminadas

`;

        const buttons: any[] = [];
        results.forEach((policy, index) => {
            resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}\n`;
            buttons.push([
                Markup.button.callback(
                    `♻️ ${policy.numeroPoliza}`,
                    `admin_policy_restore_confirm:${policy._id}`
                )
            ]);
        });

        buttons.push([Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]);

        await ctx.reply(resultText.trim(), {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    }

    /**
     * Obtiene texto de estado de póliza
     */
    static getPolicyStatusText(policy: IPolicySearchResult): string {
        if (policy.estado === 'ELIMINADO') {
            return '🔴 Eliminada';
        }

        const now = new Date();
        if (policy.fechaFinGracia && new Date(policy.fechaFinGracia) < now) {
            return '🟠 Vencida (fuera de gracia)';
        }
        if (policy.fechaFinCobertura && new Date(policy.fechaFinCobertura) < now) {
            return '🟡 Vencida (en gracia)';
        }
        return '🟢 Activa';
    }
}

export default PolicySearchService;
