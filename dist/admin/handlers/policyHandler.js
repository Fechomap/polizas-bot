"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const policy_1 = __importDefault(require("../../models/policy"));
const adminStates_1 = __importDefault(require("../utils/adminStates"));
const auditLogger_1 = require("../utils/auditLogger");
const adminMenu_1 = __importDefault(require("../menus/adminMenu"));
const logger_1 = __importDefault(require("../../utils/logger"));
class PolicyHandler {
    static escapeMarkdown(text) {
        if (!text)
            return text;
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }
    static async handleAction(ctx, action) {
        try {
            switch (action) {
                case 'menu':
                    return await adminMenu_1.default.showPolicyMenu(ctx);
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
        }
        catch (error) {
            logger_1.default.error('Error en PolicyHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }
    static async handlePolicyEdit(ctx) {
        try {
            adminStates_1.default.clearAdminState(ctx.from.id, ctx.chat.id);
            adminStates_1.default.createAdminState(ctx.from.id, ctx.chat.id, 'policy_search_for_edit');
            const searchText = `
🔍 *BUSCAR PÓLIZA PARA EDITAR*
━━━━━━━━━━━━━━━━━━━━━━

Escribe uno de los siguientes datos para buscar:

📝 *Número de póliza* - Ejemplo: ABC123456
👤 *Nombre del titular* - Ejemplo: Juan Pérez
🆔 *RFC* - Ejemplo: JURP850101XXX

_El sistema buscará automáticamente y mostrará las coincidencias._
            `.trim();
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);
            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
            await auditLogger_1.AuditLogger.log(ctx, 'policy_search_initiated', {
                module: 'policy',
                metadata: {
                    operation: 'search_for_edit'
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error al iniciar búsqueda de póliza:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }
    static async handlePolicySearch(ctx, searchTerm) {
        try {
            const terms = searchTerm
                .split('\n')
                .map(t => t.trim())
                .filter(t => t.length > 0);
            let searchResults = [];
            const processedTerms = [];
            if (terms.length > 1) {
                for (const term of terms.slice(0, 10)) {
                    const results = await this.searchPolicies(term);
                    searchResults.push(...results);
                    processedTerms.push(term);
                }
                const uniqueResults = searchResults.filter((policy, index, self) => index === self.findIndex(p => p._id.toString() === policy._id.toString()));
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
                }
                else {
                    const adminState = adminStates_1.default.getAdminState(ctx.from.id, ctx.chat.id);
                    if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                        await this.showMultipleResultsForDeletion(ctx, searchResults, processedTerms);
                    }
                    else {
                        await this.showMultipleSearchResults(ctx, searchResults, processedTerms);
                    }
                    return;
                }
            }
            else {
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
                const keyboard = telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_edit')],
                    [telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                ]);
                try {
                    await ctx.editMessageText(noResultsText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }
                catch (error) {
                    await ctx.reply(noResultsText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }
                return;
            }
            const adminState = adminStates_1.default.getAdminState(ctx.from.id, ctx.chat.id);
            if (searchResults.length === 1) {
                if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                    await this.showMultipleResultsForDeletion(ctx, searchResults, [searchTerm]);
                }
                else if (adminState && adminState.operation === 'policy_mass_search_for_restore') {
                    await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
                }
                else {
                    await this.showPolicyDetails(ctx, searchResults[0]);
                }
            }
            else {
                if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                    await this.showMultipleResultsForDeletion(ctx, searchResults, [searchTerm]);
                }
                else if (adminState && adminState.operation === 'policy_mass_search_for_restore') {
                    await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
                }
                else {
                    await this.showSearchResults(ctx, searchResults, searchTerm);
                }
            }
            await auditLogger_1.AuditLogger.log(ctx, 'policy_search_completed', {
                module: 'policy',
                metadata: {
                    searchTerm,
                    resultsCount: searchResults.length
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error al buscar pólizas:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }
    static async searchPolicies(searchTerm) {
        const cleanTerm = searchTerm.trim();
        const searchQuery = {
            estado: { $ne: 'ELIMINADO' },
            $or: [
                { numeroPoliza: { $regex: cleanTerm, $options: 'i' } },
                { titular: { $regex: cleanTerm, $options: 'i' } },
                { rfc: { $regex: cleanTerm, $options: 'i' } }
            ]
        };
        const policies = await policy_1.default.find(searchQuery)
            .select('numeroPoliza titular rfc correo contraseña calle colonia municipio estadoRegion cp agenteCotizador aseguradora fechaEmision telefono estadoPoliza fechaFinCobertura fechaFinGracia marca submarca año color serie placas calificacion totalServicios servicios registros estado fechaEliminacion motivoEliminacion')
            .sort({ fechaEmision: -1 })
            .limit(10);
        return policies;
    }
    static async showMultipleSearchResults(ctx, results, processedTerms) {
        let resultText = `
🔍 *RESULTADOS BÚSQUEDA MÚLTIPLE*
━━━━━━━━━━━━━━━━━━━━━━

Encontradas: ${results.length} pólizas únicas
Términos: ${processedTerms.length}

Selecciona una póliza:

`;
        const buttons = [];
        results.forEach((policy, index) => {
            const policyInfo = `${policy.numeroPoliza} - ${policy.titular}`;
            resultText += `${index + 1}. ${policyInfo}\n`;
            buttons.push([
                telegraf_1.Markup.button.callback(`${index + 1}. ${policy.numeroPoliza}`, `admin_policy_select:${policy._id}`)
            ]);
        });
        buttons.push([
            telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_edit'),
            telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_policy_menu')
        ]);
        const keyboard = telegraf_1.Markup.inlineKeyboard(buttons);
        try {
            await ctx.editMessageText(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
        catch (error) {
            await ctx.reply(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
        adminStates_1.default.updateAdminState(ctx.from.id, ctx.chat.id, {
            searchResults: results.map(p => p._id.toString()),
            searchTerms: processedTerms
        });
    }
    static async showMultipleResultsForDeletion(ctx, results, processedTerms) {
        try {
            const enrichedResults = await Promise.all(results.map(async (policy) => {
                const serviciosCount = policy.servicios ? policy.servicios.length : 0;
                const estadoText = this.getPolicyStatusText(policy);
                return {
                    ...policy.toObject(),
                    serviciosCount,
                    estadoText
                };
            }));
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
                [telegraf_1.Markup.button.callback('☑️ Continuar Selección', 'admin_mass_selection')],
                [telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_delete')],
                [telegraf_1.Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ];
            const keyboard = telegraf_1.Markup.inlineKeyboard(buttons);
            try {
                await ctx.editMessageText(resultText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            catch (error) {
                await ctx.reply(resultText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            adminStates_1.default.clearAdminState(ctx.from.id, ctx.chat.id);
            adminStates_1.default.createAdminState(ctx.from.id, ctx.chat.id, 'policy_mass_selection', {
                foundPolicies: enrichedResults,
                searchTerms: processedTerms
            });
        }
        catch (error) {
            logger_1.default.error('Error al mostrar resultados para eliminación masiva:', error);
            await ctx.reply('❌ Error al mostrar los resultados. Intenta nuevamente.');
        }
    }
    static getPolicyStatusText(policy) {
        const today = new Date();
        if (policy.fechaFinCobertura) {
            const finCobertura = new Date(policy.fechaFinCobertura);
            const diffDays = Math.ceil((finCobertura.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                if (policy.fechaFinGracia) {
                    const finGracia = new Date(policy.fechaFinGracia);
                    const graceDays = Math.ceil((finGracia.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (graceDays > 0) {
                        return `⚠️ Periodo Gracia (${graceDays}d)`;
                    }
                    else {
                        return '❌ Vencida';
                    }
                }
                else {
                    return '❌ Vencida';
                }
            }
            else if (diffDays <= 30) {
                return `⚡ Por Vencer (${diffDays}d)`;
            }
            else {
                return `✅ Activa (${diffDays}d)`;
            }
        }
        return `📋 Estado: ${policy.estadoPoliza || 'No definido'}`;
    }
    static async showMassSelectionInterface(ctx) {
        try {
            const adminState = adminStates_1.default.getAdminState(ctx.from.id, ctx.chat.id);
            if (!adminState || !adminState.data.foundPolicies) {
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
            const buttons = [];
            const currentSelection = adminState.data.selectedPolicies || [];
            foundPolicies.forEach((policy, index) => {
                const isSelected = currentSelection.includes(policy._id.toString());
                const checkmark = isSelected ? '✅' : '⬜';
                selectionText += `${checkmark} **${policy.numeroPoliza}**\n`;
                selectionText += `   👤 ${policy.titular}\n`;
                selectionText += `   🚗 ${policy.serviciosCount} servicios\n`;
                selectionText += `   📊 ${policy.estadoText}\n\n`;
                buttons.push([
                    telegraf_1.Markup.button.callback(`${checkmark} ${policy.numeroPoliza} (${policy.serviciosCount} servicios)`, `admin_toggle_selection:${policy._id}`)
                ]);
            });
            const actionButtons = [];
            if (currentSelection.length > 0) {
                actionButtons.push([
                    telegraf_1.Markup.button.callback(`🗑️ Eliminar Seleccionadas (${currentSelection.length})`, 'admin_confirm_mass_deletion')
                ]);
            }
            actionButtons.push([
                telegraf_1.Markup.button.callback('☑️ Seleccionar Todas', 'admin_select_all'),
                telegraf_1.Markup.button.callback('⬜ Deseleccionar Todas', 'admin_deselect_all')
            ]);
            actionButtons.push([
                telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_delete'),
                telegraf_1.Markup.button.callback('❌ Cancelar', 'admin_policy_menu')
            ]);
            buttons.push(...actionButtons);
            const keyboard = telegraf_1.Markup.inlineKeyboard(buttons);
            try {
                await ctx.editMessageText(selectionText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            catch (error) {
                await ctx.reply(selectionText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            adminStates_1.default.updateAdminState(ctx.from.id, ctx.chat.id, {
                operation: 'policy_mass_selection'
            });
        }
        catch (error) {
            logger_1.default.error('Error al mostrar interfaz de selección masiva:', error);
            await ctx.reply('❌ Error al mostrar la interfaz. Intenta nuevamente.');
        }
    }
    static async showMultipleResultsForRestore(ctx, results, processedTerms) {
        await ctx.reply('Funcionalidad de restauración en desarrollo');
    }
    static async showPolicyDetails(ctx, policy) {
        await ctx.reply('Vista de detalles de póliza en desarrollo');
    }
    static async showSearchResults(ctx, results, searchTerm) {
        await ctx.reply('Vista de resultados de búsqueda en desarrollo');
    }
    static async handlePolicySelection(ctx, policyId) {
        await ctx.reply('Selección de póliza en desarrollo');
    }
    static async handleDeleteConfirmation(ctx, policyId) {
        await ctx.reply('Confirmación de eliminación en desarrollo');
    }
    static async handleRestoreConfirmation(ctx, policyId) {
        await ctx.reply('Confirmación de restauración en desarrollo');
    }
    static async handleRestoreExecution(ctx, policyId) {
        await ctx.reply('Ejecución de restauración en desarrollo');
    }
    static async showEditCategoriesMenu(ctx, policyId) {
        await ctx.reply('Menú de categorías de edición en desarrollo');
    }
    static async showPersonalDataEdit(ctx, policyId) {
        await ctx.reply('Edición de datos personales en desarrollo');
    }
    static async showAddressEdit(ctx, policyId) {
        await ctx.reply('Edición de dirección en desarrollo');
    }
    static async showVehicleEdit(ctx, policyId) {
        await ctx.reply('Edición de vehículo en desarrollo');
    }
    static async showPolicyDataEdit(ctx, policyId) {
        await ctx.reply('Edición de datos de póliza en desarrollo');
    }
    static async showFinancialEdit(ctx, policyId) {
        await ctx.reply('Edición de datos financieros en desarrollo');
    }
    static async startFieldEdit(ctx, fieldName, policyId) {
        await ctx.reply('Inicio de edición de campo en desarrollo');
    }
    static async executeFieldChange(ctx, policyId, fieldName) {
        await ctx.reply('Ejecución de cambio de campo en desarrollo');
    }
    static async cancelMassDeletion(ctx) {
        await ctx.reply('Cancelación de eliminación masiva en desarrollo');
    }
    static async togglePolicySelection(ctx, policyId) {
        await ctx.reply('Alternar selección de póliza en desarrollo');
    }
    static async selectAllPolicies(ctx) {
        await ctx.reply('Seleccionar todas las pólizas en desarrollo');
    }
    static async deselectAllPolicies(ctx) {
        await ctx.reply('Deseleccionar todas las pólizas en desarrollo');
    }
    static async showMassDeletionConfirmation(ctx) {
        await ctx.reply('Confirmación de eliminación masiva en desarrollo');
    }
    static async showRecentDeletedPolicies(ctx) {
        await ctx.reply('Vista de pólizas eliminadas recientes en desarrollo');
    }
    static async showMassRestoreSelectionInterface(ctx) {
        await ctx.reply('Interfaz de selección para restauración masiva en desarrollo');
    }
    static async toggleRestoreSelection(ctx, policyId) {
        await ctx.reply('Alternar selección para restauración en desarrollo');
    }
    static async selectAllForRestore(ctx) {
        await ctx.reply('Seleccionar todas para restauración en desarrollo');
    }
    static async deselectAllForRestore(ctx) {
        await ctx.reply('Deseleccionar todas para restauración en desarrollo');
    }
    static async showMassRestoreConfirmation(ctx) {
        await ctx.reply('Confirmación de restauración masiva en desarrollo');
    }
    static async executeMassRestore(ctx) {
        await ctx.reply('Ejecución de restauración masiva en desarrollo');
    }
    static async handleTextMessage(ctx) {
        return false;
    }
    static async handlePolicyDelete(ctx) {
        await ctx.reply('Manejo de eliminación de póliza en desarrollo');
    }
    static async handlePolicyRestore(ctx) {
        await ctx.reply('Manejo de restauración de póliza en desarrollo');
    }
    static async handleStats(ctx) {
        await ctx.reply('Manejo de estadísticas en desarrollo');
    }
}
exports.default = PolicyHandler;
