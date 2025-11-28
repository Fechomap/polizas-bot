/**
 * PolicyHandler - Orquestador principal del módulo de pólizas
 *
 * Este archivo coordina los diferentes servicios:
 * - PolicySearchService: Búsqueda de pólizas
 * - PolicyDisplayService: Mostrar detalles
 * - PolicyEditService: Edición de campos
 * - PolicyDeleteService: Eliminación (soft delete)
 * - PolicyRestoreService: Restauración
 */

import { Context } from 'telegraf';
import AdminMenu from '../../menus/adminMenu';
import logger from '../../../utils/logger';
import adminStateManager from '../../utils/adminStates';

// Servicios
import PolicySearchService from './PolicySearchService';
import PolicyDisplayService from './PolicyDisplayService';
import PolicyEditService from './PolicyEditService';
import PolicyDeleteService from './PolicyDeleteService';
import PolicyRestoreService from './PolicyRestoreService';

class PolicyHandler {
    /**
     * Escapa caracteres especiales de Markdown
     */
    static escapeMarkdown(text: string): string {
        if (!text) return text;
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    /**
     * Router principal de acciones
     */
    static async handleAction(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'menu':
                    return await AdminMenu.showPolicyMenu(ctx);

                case 'search':
                    return await PolicySearchService.handleUnifiedPolicySearch(ctx);

                case 'restore':
                    return await PolicyRestoreService.handlePolicyRestore(ctx);

                case 'edit':
                case 'delete':
                    return await PolicySearchService.handleUnifiedPolicySearch(ctx);

                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en PolicyHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    // ==================== Delegación a servicios ====================

    // Búsqueda
    static handleUnifiedPolicySearch = PolicySearchService.handleUnifiedPolicySearch.bind(PolicySearchService);
    static handleUnifiedPolicySearchResults = PolicySearchService.handleUnifiedPolicySearchResults.bind(PolicySearchService);
    static searchPolicies = PolicySearchService.searchPolicies.bind(PolicySearchService);
    static showMultipleSearchResults = PolicySearchService.showMultipleSearchResults.bind(PolicySearchService);
    static searchPolicyForDelete = PolicySearchService.searchPolicyForDelete.bind(PolicySearchService);
    static searchPolicyForRestore = PolicySearchService.searchPolicyForRestore.bind(PolicySearchService);
    static showSearchResultsForDelete = PolicySearchService.showSearchResultsForDelete.bind(PolicySearchService);
    static showSearchResultsForRestore = PolicySearchService.showSearchResultsForRestore.bind(PolicySearchService);
    static getPolicyStatusText = PolicySearchService.getPolicyStatusText.bind(PolicySearchService);

    // Display
    static showUnifiedPolicyDetails = PolicyDisplayService.showUnifiedPolicyDetails.bind(PolicyDisplayService);
    static showPolicyDetails = PolicyDisplayService.showPolicyDetails.bind(PolicyDisplayService);

    // Edición
    static showEditCategoriesMenu = PolicyEditService.showEditCategoriesMenu.bind(PolicyEditService);
    static showPolicyDataEdit = PolicyEditService.showPolicyDataEdit.bind(PolicyEditService);
    static startFieldEdit = PolicyEditService.startFieldEdit.bind(PolicyEditService);
    static executeFieldChange = PolicyEditService.executeFieldChange.bind(PolicyEditService);
    static handleFieldEditInput = PolicyEditService.handleFieldEditInput.bind(PolicyEditService);

    // Eliminación
    static handlePolicyDelete = PolicyDeleteService.handlePolicyDelete.bind(PolicyDeleteService);
    static handleDeleteConfirmation = PolicyDeleteService.handleDeleteConfirmation.bind(PolicyDeleteService);
    static handleDeletionReason = PolicyDeleteService.handleDeletionReason.bind(PolicyDeleteService);

    // Restauración
    static handlePolicyRestore = PolicyRestoreService.handlePolicyRestore.bind(PolicyRestoreService);
    static handleRestoreConfirmation = PolicyRestoreService.handleRestoreConfirmation.bind(PolicyRestoreService);
    static handleRestoreExecution = PolicyRestoreService.handleRestoreExecution.bind(PolicyRestoreService);
    static showRecentDeletedPolicies = PolicyRestoreService.showRecentDeletedPolicies.bind(PolicyRestoreService);

    /**
     * Maneja mensajes de texto según el estado actual
     */
    static async handleTextMessage(ctx: Context): Promise<boolean> {
        const state = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

        if (!state) return false;

        const message = ctx.message as any;
        const text = message?.text?.trim();

        if (!text) return false;

        // Delegar según el tipo de acción (operation o data.action)
        const action = state.operation || state.data?.action;

        switch (action) {
            case 'policy_unified_search':
                await PolicySearchService.handleUnifiedPolicySearchResults(ctx, text);
                return true;

            case 'policy_search_for_delete':
                await PolicySearchService.searchPolicyForDelete(ctx, text);
                return true;

            case 'policy_search_for_restore':
                await PolicySearchService.searchPolicyForRestore(ctx, text);
                return true;

            case 'edit_field':
                return await PolicyEditService.handleFieldEditInput(ctx, text);

            default:
                return false;
        }
    }

    // ==================== Métodos legacy para compatibilidad ====================

    static async handlePolicyEdit(ctx: Context): Promise<void> {
        return await PolicySearchService.handleUnifiedPolicySearch(ctx);
    }

    static async handlePolicySearch(ctx: Context, searchTerm: string): Promise<void> {
        return await PolicySearchService.handleUnifiedPolicySearchResults(ctx, searchTerm);
    }

    static async handlePolicySelection(ctx: Context, policyId: string): Promise<void> {
        return await PolicyDisplayService.showUnifiedPolicyDetails(ctx, policyId);
    }

    static async showSearchResults(
        ctx: Context,
        results: any[],
        operation: string
    ): Promise<void> {
        if (operation === 'delete') {
            await PolicySearchService.showSearchResultsForDelete(ctx, results);
        } else if (operation === 'restore') {
            await PolicySearchService.showSearchResultsForRestore(ctx, results);
        } else {
            await PolicySearchService.showMultipleSearchResults(ctx, results, []);
        }
    }

    // Métodos stub para operaciones masivas (mantener compatibilidad)
    static async cancelMassDeletion(ctx: Context): Promise<void> {
        adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
        await AdminMenu.showPolicyMenu(ctx);
    }

    static async togglePolicySelection(ctx: Context, policyId: string): Promise<void> {
        logger.info('togglePolicySelection llamado', { policyId });
    }

    static async selectAllPolicies(ctx: Context): Promise<void> {
        logger.info('selectAllPolicies llamado');
    }

    static async deselectAllPolicies(ctx: Context): Promise<void> {
        logger.info('deselectAllPolicies llamado');
    }

    static async showMassDeletionConfirmation(ctx: Context): Promise<void> {
        logger.info('showMassDeletionConfirmation llamado');
    }

    static async showMassSelectionInterface(ctx: Context): Promise<void> {
        logger.info('showMassSelectionInterface llamado');
    }

    static async showMassRestoreSelectionInterface(ctx: Context): Promise<void> {
        logger.info('showMassRestoreSelectionInterface llamado');
    }

    static async toggleRestoreSelection(ctx: Context, policyId: string): Promise<void> {
        logger.info('toggleRestoreSelection llamado', { policyId });
    }

    static async selectAllForRestore(ctx: Context): Promise<void> {
        logger.info('selectAllForRestore llamado');
    }

    static async deselectAllForRestore(ctx: Context): Promise<void> {
        logger.info('deselectAllForRestore llamado');
    }

    static async showMassRestoreConfirmation(ctx: Context): Promise<void> {
        logger.info('showMassRestoreConfirmation llamado');
    }

    static async executeMassRestore(ctx: Context): Promise<void> {
        logger.info('executeMassRestore llamado');
    }

    static async showMultipleResultsForDeletion(
        ctx: Context,
        results: any[],
        processedTerms: string[]
    ): Promise<void> {
        await PolicySearchService.showSearchResultsForDelete(ctx, results);
    }

    static async showMultipleResultsForRestore(
        ctx: Context,
        results: any[],
        processedTerms: string[]
    ): Promise<void> {
        await PolicySearchService.showSearchResultsForRestore(ctx, results);
    }
}

// Exports
export default PolicyHandler;
export { PolicySearchService, PolicyDisplayService, PolicyEditService, PolicyDeleteService, PolicyRestoreService };
export * from './types';
