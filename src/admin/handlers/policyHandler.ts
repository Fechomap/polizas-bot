import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import Policy from '../../models/policy';
import adminStateManager from '../utils/adminStates';
import { AuditLogger } from '../utils/auditLogger';
import AdminMenu from '../menus/adminMenu';
import logger from '../../utils/logger';
import {
    markPolicyAsDeleted,
    restorePolicy,
    getPolicyByNumber
} from '../../controllers/policyController';

interface IPolicySearchResult {
    _id: string;
    numeroPoliza: string;
    titular: string;
    rfc: string;
    correo: string;
    contraseña: string;
    calle: string;
    colonia: string;
    municipio: string;
    estadoRegion: string;
    cp: string;
    agenteCotizador: string;
    aseguradora: string;
    fechaEmision: Date;
    telefono: string;
    estadoPoliza: string;
    fechaFinCobertura: Date;
    fechaFinGracia: Date;
    marca: string;
    submarca: string;
    año: string;
    color: string;
    serie: string;
    placas: string;
    calificacion: number;
    totalServicios: number;
    servicios: any[];
    registros: any[];
    estado: string;
    fechaEliminacion: Date;
    motivoEliminacion: string;
    toObject(): any;
}

interface IEnrichedPolicy extends IPolicySearchResult {
    serviciosCount: number;
    estadoText: string;
}

class PolicyHandler {
    static escapeMarkdown(text: string): string {
        if (!text) return text;
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    static async handleAction(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'menu':
                    return await AdminMenu.showPolicyMenu(ctx);

                case 'edit':
                    return await this.handlePolicyEdit(ctx);

                case 'delete':
                    return await this.handlePolicyDelete(ctx);

                case 'restore':
                    return await this.handlePolicyRestore(ctx);

                case 'stats':
                    return await this.handleStats(ctx);

                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en PolicyHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    static async handlePolicyEdit(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'policy_search_for_edit'
            );

            const searchText = `
🔍 *BUSCAR PÓLIZA PARA EDITAR*
━━━━━━━━━━━━━━━━━━━━━━

Escribe uno de los siguientes datos para buscar:

📝 *Número de póliza* - Ejemplo: ABC123456
👤 *Nombre del titular* - Ejemplo: Juan Pérez
🆔 *RFC* - Ejemplo: JURP850101XXX

_El sistema buscará automáticamente y mostrará las coincidencias._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'policy_search_initiated', {
                module: 'policy',
                metadata: {
                    operation: 'search_for_edit'
                }
            });
        } catch (error) {
            logger.error('Error al iniciar búsqueda de póliza:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }

    static async handlePolicySearch(ctx: Context, searchTerm: string): Promise<void> {
        try {
            const terms = searchTerm
                .split('\n')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            let searchResults: IPolicySearchResult[] = [];
            const processedTerms: string[] = [];

            if (terms.length > 1) {
                for (const term of terms.slice(0, 10)) {
                    const results = await this.searchPolicies(term);
                    searchResults.push(...results);
                    processedTerms.push(term);
                }

                const uniqueResults = searchResults.filter(
                    (policy, index, self) =>
                        index === self.findIndex(p => p._id.toString() === policy._id.toString())
                );
                searchResults = uniqueResults;

                if (searchResults.length === 0) {
                    const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas con ninguno de los ${terms.length} términos buscados.

**Términos buscados:**
${terms.map((t, i) => `${i + 1}. ${t}`).join('\n')}

_Intenta con términos individuales o verifica la ortografía._
                    `.trim();
                } else {
                    const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

                    if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                        await this.showMultipleResultsForDeletion(
                            ctx,
                            searchResults,
                            processedTerms
                        );
                    } else {
                        await this.showMultipleSearchResults(ctx, searchResults, processedTerms);
                    }
                    return;
                }
            } else {
                searchResults = await this.searchPolicies(searchTerm);
            }

            if (searchResults.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas con: "${searchTerm}"

Verifica que:
• El número de póliza sea correcto
• El nombre esté completo
• El RFC tenga el formato correcto

_Intenta con otro término de búsqueda._
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_edit')],
                    [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                ]);

                try {
                    await ctx.editMessageText(noResultsText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                } catch (error) {
                    await ctx.reply(noResultsText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }
                return;
            }

            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

            if (searchResults.length === 1) {
                if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                    await this.showMultipleResultsForDeletion(ctx, searchResults, [searchTerm]);
                } else if (
                    adminState &&
                    adminState.operation === 'policy_mass_search_for_restore'
                ) {
                    await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
                } else {
                    await this.showPolicyDetails(ctx, searchResults[0]);
                }
            } else {
                if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                    await this.showMultipleResultsForDeletion(ctx, searchResults, [searchTerm]);
                } else if (
                    adminState &&
                    adminState.operation === 'policy_mass_search_for_restore'
                ) {
                    await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
                } else {
                    await this.showSearchResults(ctx, searchResults, searchTerm);
                }
            }

            await AuditLogger.log(ctx, 'policy_search_completed', {
                module: 'policy',
                metadata: {
                    searchTerm,
                    resultsCount: searchResults.length
                }
            });
        } catch (error) {
            logger.error('Error al buscar pólizas:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }

    static async searchPolicies(searchTerm: string): Promise<IPolicySearchResult[]> {
        const cleanTerm = searchTerm.trim();

        const searchQuery = {
            estado: { $ne: 'ELIMINADO' },
            $or: [
                { numeroPoliza: { $regex: cleanTerm, $options: 'i' } },
                { titular: { $regex: cleanTerm, $options: 'i' } },
                { rfc: { $regex: cleanTerm, $options: 'i' } }
            ]
        };

        const policies = await Policy.find(searchQuery)
            .select(
                'numeroPoliza titular rfc correo contraseña calle colonia municipio estadoRegion cp agenteCotizador aseguradora fechaEmision telefono estadoPoliza fechaFinCobertura fechaFinGracia marca submarca año color serie placas calificacion totalServicios servicios registros estado fechaEliminacion motivoEliminacion'
            )
            .sort({ fechaEmision: -1 })
            .limit(10);

        return policies as unknown as IPolicySearchResult[];
    }

    static async showMultipleSearchResults(
        ctx: Context,
        results: IPolicySearchResult[],
        processedTerms: string[]
    ): Promise<void> {
        let resultText = `
🔍 *RESULTADOS BÚSQUEDA MÚLTIPLE*
━━━━━━━━━━━━━━━━━━━━━━

Encontradas: ${results.length} pólizas únicas
Términos: ${processedTerms.length}

Selecciona una póliza:

`;

        const buttons: any[] = [];
        results.forEach((policy, index) => {
            const policyInfo = `${policy.numeroPoliza} - ${policy.titular}`;
            resultText += `${index + 1}. ${policyInfo}\n`;

            buttons.push([
                Markup.button.callback(
                    `${index + 1}. ${policy.numeroPoliza}`,
                    `admin_policy_select:${policy._id}`
                )
            ]);
        });

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_policy_menu')
        ]);

        const keyboard = Markup.inlineKeyboard(buttons);

        try {
            await ctx.editMessageText(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
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

    static async showMultipleResultsForDeletion(
        ctx: Context,
        results: IPolicySearchResult[],
        processedTerms: string[]
    ): Promise<void> {
        try {
            const enrichedResults: IEnrichedPolicy[] = await Promise.all(
                results.map(async policy => {
                    const serviciosCount = policy.servicios ? policy.servicios.length : 0;
                    const estadoText = this.getPolicyStatusText(policy);

                    return {
                        ...policy.toObject(),
                        serviciosCount,
                        estadoText
                    };
                })
            );

            let resultText = `
🗑️ *ELIMINACIÓN MASIVA - SELECCIÓN*
━━━━━━━━━━━━━━━━━━━━━━

📊 **Encontradas:** ${results.length} pólizas
📝 **Términos:** ${processedTerms.join(', ')}

**Información por póliza:**

`;

            enrichedResults.forEach((policy, index) => {
                resultText += `${index + 1}. **${policy.numeroPoliza}**\n`;
                resultText += `   👤 ${policy.titular}\n`;
                resultText += `   🚗 ${policy.serviciosCount} servicios\n`;
                resultText += `   📊 Estado: ${policy.estadoText}\n`;
                resultText += '\n';
            });

            resultText += '\n⚠️ **Próximo paso:** Seleccionar pólizas a eliminar\n';
            resultText += '🚀 **Ventaja:** Confirmación única para todas las seleccionadas';

            const buttons = [
                [Markup.button.callback('☑️ Continuar Selección', 'admin_mass_selection')],
                [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_delete')],
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ];

            const keyboard = Markup.inlineKeyboard(buttons);

            try {
                await ctx.editMessageText(resultText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(resultText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'policy_mass_selection',
                {
                    foundPolicies: enrichedResults,
                    searchTerms: processedTerms
                }
            );
        } catch (error) {
            logger.error('Error al mostrar resultados para eliminación masiva:', error);
            await ctx.reply('❌ Error al mostrar los resultados. Intenta nuevamente.');
        }
    }

    static getPolicyStatusText(policy: IPolicySearchResult): string {
        const today = new Date();

        if (policy.fechaFinCobertura) {
            const finCobertura = new Date(policy.fechaFinCobertura);
            const diffDays = Math.ceil(
                (finCobertura.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (diffDays < 0) {
                if (policy.fechaFinGracia) {
                    const finGracia = new Date(policy.fechaFinGracia);
                    const graceDays = Math.ceil(
                        (finGracia.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                    );

                    if (graceDays > 0) {
                        return `⚠️ Periodo Gracia (${graceDays}d)`;
                    } else {
                        return '❌ Vencida';
                    }
                } else {
                    return '❌ Vencida';
                }
            } else if (diffDays <= 30) {
                return `⚡ Por Vencer (${diffDays}d)`;
            } else {
                return `✅ Activa (${diffDays}d)`;
            }
        }

        return `📋 Estado: ${policy.estadoPoliza || 'No definido'}`;
    }

    static async showMassSelectionInterface(ctx: Context): Promise<void> {
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

            if (!adminState?.data.foundPolicies) {
                await ctx.reply('❌ Error: No se encontraron las pólizas para selección.');
                return;
            }

            const foundPolicies = adminState.data.foundPolicies;

            let selectionText = `
☑️ *SELECCIÓN MASIVA PARA ELIMINACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

**Instrucciones:**
✅ Usa los botones para seleccionar/deseleccionar
📊 Se muestra información crítica de cada póliza
🚀 Confirmación única al final

**Pólizas encontradas:**

`;

            const buttons: any[] = [];
            const currentSelection = adminState.data.selectedPolicies || [];

            foundPolicies.forEach((policy: IEnrichedPolicy, index: number) => {
                const isSelected = currentSelection.includes(policy._id.toString());
                const checkmark = isSelected ? '✅' : '⬜';

                selectionText += `${checkmark} **${policy.numeroPoliza}**\n`;
                selectionText += `   👤 ${policy.titular}\n`;
                selectionText += `   🚗 ${policy.serviciosCount} servicios\n`;
                selectionText += `   📊 ${policy.estadoText}\n\n`;

                buttons.push([
                    Markup.button.callback(
                        `${checkmark} ${policy.numeroPoliza} (${policy.serviciosCount} servicios)`,
                        `admin_toggle_selection:${policy._id}`
                    )
                ]);
            });

            const actionButtons: any[] = [];

            if (currentSelection.length > 0) {
                actionButtons.push([
                    Markup.button.callback(
                        `🗑️ Eliminar Seleccionadas (${currentSelection.length})`,
                        'admin_confirm_mass_deletion'
                    )
                ]);
            }

            actionButtons.push([
                Markup.button.callback('☑️ Seleccionar Todas', 'admin_select_all'),
                Markup.button.callback('⬜ Deseleccionar Todas', 'admin_deselect_all')
            ]);

            actionButtons.push([
                Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_delete'),
                Markup.button.callback('❌ Cancelar', 'admin_policy_menu')
            ]);

            buttons.push(...actionButtons);

            const keyboard = Markup.inlineKeyboard(buttons);

            try {
                await ctx.editMessageText(selectionText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(selectionText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            adminStateManager.updateAdminState(ctx.from!.id, ctx.chat!.id, {
                operation: 'policy_mass_selection'
            });
        } catch (error) {
            logger.error('Error al mostrar interfaz de selección masiva:', error);
            await ctx.reply('❌ Error al mostrar la interfaz. Intenta nuevamente.');
        }
    }

    // Placeholder methods - need to be implemented based on the full original file
    static async showMultipleResultsForRestore(
        ctx: Context,
        results: IPolicySearchResult[],
        processedTerms: string[]
    ): Promise<void> {
        // TODO: Implement restore functionality
        await ctx.reply('Funcionalidad de restauración en desarrollo');
    }

    static async showPolicyDetails(ctx: Context, policy: IPolicySearchResult): Promise<void> {
        // TODO: Implement policy details view
        await ctx.reply('Vista de detalles de póliza en desarrollo');
    }

    static async showSearchResults(
        ctx: Context,
        results: IPolicySearchResult[],
        searchTerm: string
    ): Promise<void> {
        // TODO: Implement search results view
        await ctx.reply('Vista de resultados de búsqueda en desarrollo');
    }

    static async handlePolicySelection(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement policy selection
        await ctx.reply('Selección de póliza en desarrollo');
    }

    static async handleDeleteConfirmation(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement delete confirmation
        await ctx.reply('Confirmación de eliminación en desarrollo');
    }

    static async handleRestoreConfirmation(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement restore confirmation
        await ctx.reply('Confirmación de restauración en desarrollo');
    }

    static async handleRestoreExecution(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement restore execution
        await ctx.reply('Ejecución de restauración en desarrollo');
    }

    static async showEditCategoriesMenu(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement edit categories menu
        await ctx.reply('Menú de categorías de edición en desarrollo');
    }

    static async showPersonalDataEdit(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement personal data edit
        await ctx.reply('Edición de datos personales en desarrollo');
    }

    static async showAddressEdit(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement address edit
        await ctx.reply('Edición de dirección en desarrollo');
    }

    static async showVehicleEdit(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement vehicle edit
        await ctx.reply('Edición de vehículo en desarrollo');
    }

    static async showPolicyDataEdit(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement policy data edit
        await ctx.reply('Edición de datos de póliza en desarrollo');
    }

    static async showFinancialEdit(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement financial edit
        await ctx.reply('Edición de datos financieros en desarrollo');
    }

    static async startFieldEdit(ctx: Context, fieldName: string, policyId: string): Promise<void> {
        // TODO: Implement field edit start
        await ctx.reply('Inicio de edición de campo en desarrollo');
    }

    static async executeFieldChange(
        ctx: Context,
        policyId: string,
        fieldName: string
    ): Promise<void> {
        // TODO: Implement field change execution
        await ctx.reply('Ejecución de cambio de campo en desarrollo');
    }

    static async cancelMassDeletion(ctx: Context): Promise<void> {
        // TODO: Implement mass deletion cancellation
        await ctx.reply('Cancelación de eliminación masiva en desarrollo');
    }

    static async togglePolicySelection(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement policy selection toggle
        await ctx.reply('Alternar selección de póliza en desarrollo');
    }

    static async selectAllPolicies(ctx: Context): Promise<void> {
        // TODO: Implement select all policies
        await ctx.reply('Seleccionar todas las pólizas en desarrollo');
    }

    static async deselectAllPolicies(ctx: Context): Promise<void> {
        // TODO: Implement deselect all policies
        await ctx.reply('Deseleccionar todas las pólizas en desarrollo');
    }

    static async showMassDeletionConfirmation(ctx: Context): Promise<void> {
        // TODO: Implement mass deletion confirmation
        await ctx.reply('Confirmación de eliminación masiva en desarrollo');
    }

    static async showRecentDeletedPolicies(ctx: Context): Promise<void> {
        // TODO: Implement recent deleted policies view
        await ctx.reply('Vista de pólizas eliminadas recientes en desarrollo');
    }

    static async showMassRestoreSelectionInterface(ctx: Context): Promise<void> {
        // TODO: Implement mass restore selection interface
        await ctx.reply('Interfaz de selección para restauración masiva en desarrollo');
    }

    static async toggleRestoreSelection(ctx: Context, policyId: string): Promise<void> {
        // TODO: Implement restore selection toggle
        await ctx.reply('Alternar selección para restauración en desarrollo');
    }

    static async selectAllForRestore(ctx: Context): Promise<void> {
        // TODO: Implement select all for restore
        await ctx.reply('Seleccionar todas para restauración en desarrollo');
    }

    static async deselectAllForRestore(ctx: Context): Promise<void> {
        // TODO: Implement deselect all for restore
        await ctx.reply('Deseleccionar todas para restauración en desarrollo');
    }

    static async showMassRestoreConfirmation(ctx: Context): Promise<void> {
        // TODO: Implement mass restore confirmation
        await ctx.reply('Confirmación de restauración masiva en desarrollo');
    }

    static async executeMassRestore(ctx: Context): Promise<void> {
        // TODO: Implement mass restore execution
        await ctx.reply('Ejecución de restauración masiva en desarrollo');
    }

    static async handleTextMessage(ctx: Context): Promise<boolean> {
        // TODO: Implement text message handling
        return false;
    }

    static async handlePolicyDelete(ctx: Context): Promise<void> {
        // TODO: Implement policy delete handling
        await ctx.reply('Manejo de eliminación de póliza en desarrollo');
    }

    static async handlePolicyRestore(ctx: Context): Promise<void> {
        // TODO: Implement policy restore handling
        await ctx.reply('Manejo de restauración de póliza en desarrollo');
    }

    static async handleStats(ctx: Context): Promise<void> {
        // TODO: Implement stats handling
        await ctx.reply('Manejo de estadísticas en desarrollo');
    }
}

export default PolicyHandler;
