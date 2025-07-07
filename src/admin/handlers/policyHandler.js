const { Markup } = require('telegraf');
const Policy = require('../../models/policy');
const AdminStateManager = require('../utils/adminStates');
const { AuditLogger } = require('../utils/auditLogger');
const AdminMenu = require('../menus/adminMenu');
const logger = require('../../utils/logger');
const {
    markPolicyAsDeleted,
    restorePolicy,
    getPolicyByNumber
} = require('../../controllers/policyController');

class PolicyHandler {
    /**
     * Escapa caracteres especiales de Markdown
     */
    static escapeMarkdown(text) {
        if (!text) return text;
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    /**
   * Maneja las acciones relacionadas con pólizas
   */
    static async handleAction(ctx, action) {
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

    /**
     * Inicia el flujo de edición de póliza
     */
    static async handlePolicyEdit(ctx) {
        try {
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
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

            await AuditLogger.log(ctx, 'policy_search_initiated', 'policy', {
                operation: 'search_for_edit'
            });

        } catch (error) {
            logger.error('Error al iniciar búsqueda de póliza:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }

    /**
     * Procesa la búsqueda de pólizas
     */
    static async handlePolicySearch(ctx, searchTerm) {
        try {
            // Detectar si hay múltiples términos (separados por saltos de línea)
            const terms = searchTerm.split('\n').map(t => t.trim()).filter(t => t.length > 0);

            let searchResults = [];
            const processedTerms = [];

            if (terms.length > 1) {
                // Búsqueda múltiple - NUEVA FUNCIONALIDAD MASIVA
                for (const term of terms.slice(0, 10)) { // Máximo 10 términos para eliminación masiva
                    const results = await this.searchPolicies(term);
                    searchResults.push(...results);
                    processedTerms.push(term);
                }

                // Eliminar duplicados por _id
                const uniqueResults = searchResults.filter((policy, index, self) =>
                    index === self.findIndex(p => p._id.toString() === policy._id.toString())
                );
                searchResults = uniqueResults;

                if (searchResults.length === 0) {
                    const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas con ninguno de los ${terms.length} términos buscados.

**Términos buscados:**
${terms.map((t, i) => `${i+1}. ${t}`).join('\n')}

_Intenta con términos individuales o verifica la ortografía._
                    `.trim();
                } else {
                    // Obtener estado administrativo para determinar el tipo de búsqueda
                    const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

                    if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                        // Mostrar resultados para eliminación masiva
                        await this.showMultipleResultsForDeletion(ctx, searchResults, processedTerms);
                    } else {
                        // Mostrar resultados múltiples normales
                        await this.showMultipleSearchResults(ctx, searchResults, processedTerms);
                    }
                    return;
                }
            } else {
                // Búsqueda simple
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

            // Verificar el tipo de operación para determinar qué hacer con un solo resultado
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (searchResults.length === 1) {
                if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                    // Para eliminación, mostrar los resultados como lista para selección
                    await this.showMultipleResultsForDeletion(ctx, searchResults, [searchTerm]);
                } else if (adminState && adminState.operation === 'policy_mass_search_for_restore') {
                    // Para restauración, mostrar resultados para selección
                    await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
                } else {
                    // Para edición, mostrar detalles completos
                    await this.showPolicyDetails(ctx, searchResults[0]);
                }
            } else {
                // Para múltiples resultados, usar la lógica ya existente
                if (adminState && adminState.operation === 'policy_mass_search_for_delete') {
                    await this.showMultipleResultsForDeletion(ctx, searchResults, [searchTerm]);
                } else if (adminState && adminState.operation === 'policy_mass_search_for_restore') {
                    await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
                } else {
                    await this.showSearchResults(ctx, searchResults, searchTerm);
                }
            }

            await AuditLogger.log(ctx, 'policy_search_completed', 'policy', {
                searchTerm,
                resultsCount: searchResults.length
            });

        } catch (error) {
            logger.error('Error al buscar pólizas:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }

    /**
     * Busca pólizas en la base de datos
     */
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

        const policies = await Policy.find(searchQuery)
            .select('numeroPoliza titular rfc correo contraseña calle colonia municipio estadoRegion cp agenteCotizador aseguradora fechaEmision telefono estadoPoliza fechaFinCobertura fechaFinGracia marca submarca año color serie placas calificacion totalServicios servicios registros estado fechaEliminacion motivoEliminacion')
            .sort({ fechaEmision: -1 })
            .limit(10);

        return policies;
    }

    /**
     * Muestra resultados de búsqueda múltiple
     */
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

        AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
            searchResults: results.map(p => p._id.toString()),
            searchTerms: processedTerms
        });
    }

    /**
     * Muestra múltiples resultados para eliminación masiva con información de servicios
     */
    static async showMultipleResultsForDeletion(ctx, results, processedTerms) {
        try {
            // Obtener información adicional de servicios para cada póliza
            const enrichedResults = await Promise.all(
                results.map(async (policy) => {
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

            // Actualizar estado para selección masiva
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
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

    /**
     * Obtiene el texto del estado de una póliza
     */
    static getPolicyStatusText(policy) {
        const today = new Date();

        if (policy.fechaFinCobertura) {
            const finCobertura = new Date(policy.fechaFinCobertura);
            const diffDays = Math.ceil((finCobertura - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                if (policy.fechaFinGracia) {
                    const finGracia = new Date(policy.fechaFinGracia);
                    const graceDays = Math.ceil((finGracia - today) / (1000 * 60 * 60 * 24));

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

    /**
     * Muestra interfaz de selección masiva para eliminación
     */
    static async showMassSelectionInterface(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

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
                    Markup.button.callback(
                        `${checkmark} ${policy.numeroPoliza} (${policy.serviciosCount} servicios)`,
                        `admin_toggle_selection:${policy._id}`
                    )
                ]);
            });

            // Botones de acción
            const actionButtons = [];

            if (currentSelection.length > 0) {
                actionButtons.push([
                    Markup.button.callback(`🗑️ Eliminar Seleccionadas (${currentSelection.length})`, 'admin_confirm_mass_deletion')
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

            // Actualizar estado
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                currentView: 'mass_selection'
            });

        } catch (error) {
            logger.error('Error al mostrar interfaz de selección masiva:', error);
            await ctx.reply('❌ Error al cargar la interfaz de selección.');
        }
    }

    /**
     * Toggle selección de una póliza individual
     */
    static async togglePolicySelection(ctx, policyId) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || adminState.operation !== 'policy_mass_selection') {
                await ctx.answerCbQuery('❌ Error: Estado de selección no válido', { show_alert: true });
                return;
            }

            let selectedPolicies = adminState.data.selectedPolicies || [];

            if (selectedPolicies.includes(policyId)) {
                // Deseleccionar
                selectedPolicies = selectedPolicies.filter(id => id !== policyId);
                await ctx.answerCbQuery('⬜ Póliza deseleccionada');
            } else {
                // Seleccionar
                selectedPolicies.push(policyId);
                await ctx.answerCbQuery('✅ Póliza seleccionada');
            }

            // Actualizar estado
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicies
            });

            // Refrescar interfaz
            await this.showMassSelectionInterface(ctx, '');

        } catch (error) {
            logger.error('Error al cambiar selección:', error);
            await ctx.answerCbQuery('❌ Error al cambiar selección', { show_alert: true });
        }
    }

    /**
     * Selecciona todas las pólizas
     */
    static async selectAllPolicies(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || !adminState.data.foundPolicies) {
                await ctx.answerCbQuery('❌ Error: No hay pólizas para seleccionar', { show_alert: true });
                return;
            }

            const allPolicyIds = adminState.data.foundPolicies.map(p => p._id.toString());

            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicies: allPolicyIds
            });

            await ctx.answerCbQuery(`✅ ${allPolicyIds.length} pólizas seleccionadas`);
            await this.showMassSelectionInterface(ctx, '');

        } catch (error) {
            logger.error('Error al seleccionar todas:', error);
            await ctx.answerCbQuery('❌ Error al seleccionar todas', { show_alert: true });
        }
    }

    /**
     * Deselecciona todas las pólizas
     */
    static async deselectAllPolicies(ctx) {
        try {
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicies: []
            });

            await ctx.answerCbQuery('⬜ Todas las pólizas deseleccionadas');
            await this.showMassSelectionInterface(ctx, '');

        } catch (error) {
            logger.error('Error al deseleccionar todas:', error);
            await ctx.answerCbQuery('❌ Error al deseleccionar todas', { show_alert: true });
        }
    }

    /**
     * Muestra confirmación para eliminación masiva
     */
    static async showMassDeletionConfirmation(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || !adminState.data.selectedPolicies || adminState.data.selectedPolicies.length === 0) {
                await ctx.answerCbQuery('❌ No hay pólizas seleccionadas', { show_alert: true });
                return;
            }

            const selectedPolicies = adminState.data.selectedPolicies;
            const foundPolicies = adminState.data.foundPolicies || [];

            // Obtener detalles de las pólizas seleccionadas
            const selectedPolicyDetails = foundPolicies.filter(p =>
                selectedPolicies.includes(p._id.toString())
            );

            let confirmText = `
⚠️ *CONFIRMAR ELIMINACIÓN MASIVA*
━━━━━━━━━━━━━━━━━━━━━━

**Vas a eliminar ${selectedPolicies.length} pólizas:**

`;

            let totalServicios = 0;
            selectedPolicyDetails.forEach((policy, index) => {
                confirmText += `${index + 1}. **${policy.numeroPoliza}**\n`;
                confirmText += `   👤 ${policy.titular}\n`;
                confirmText += `   🚗 ${policy.serviciosCount} servicios\n`;
                confirmText += `   📊 ${policy.estadoText}\n\n`;
                totalServicios += policy.serviciosCount;
            });

            confirmText += `📊 **Total servicios afectados:** ${totalServicios}\n\n`;
            confirmText += '**Escribe el motivo de eliminación masiva:**';

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_mass_selection:cancelled')]
            ]);

            try {
                await ctx.editMessageText(confirmText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(confirmText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            // Cambiar estado para esperar el motivo
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'policy_mass_deletion_reason',
                {
                    selectedPolicies: selectedPolicyDetails,
                    selectedPolicyIds: selectedPolicies
                }
            );

        } catch (error) {
            logger.error('Error al mostrar confirmación masiva:', error);
            await ctx.reply('❌ Error al mostrar confirmación.');
        }
    }

    /**
     * Maneja búsqueda de pólizas eliminadas para restauración masiva
     */
    static async handleDeletedPolicySearch(ctx, searchTerm) {
        try {
            // Detectar si hay múltiples términos (separados por saltos de línea)
            const terms = searchTerm.split('\n').map(t => t.trim()).filter(t => t.length > 0);

            let searchResults = [];
            const processedTerms = [];

            if (terms.length > 1) {
                // Búsqueda múltiple de pólizas eliminadas
                for (const term of terms.slice(0, 20)) { // Máximo 20 términos para restauración masiva
                    const results = await this.searchDeletedPolicies(term);
                    searchResults.push(...results);
                    processedTerms.push(term);
                }

                // Eliminar duplicados por _id
                const uniqueResults = searchResults.filter((policy, index, self) =>
                    index === self.findIndex(p => p._id.toString() === policy._id.toString())
                );
                searchResults = uniqueResults;

                if (searchResults.length === 0) {
                    const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas eliminadas con los términos buscados.

**Términos buscados:**
${terms.map((t, i) => `${i+1}. ${t}`).join('\n')}

_Verifica que las pólizas estén marcadas como ELIMINADAS._
                    `.trim();
                } else {
                    // Mostrar resultados para restauración masiva
                    await this.showMultipleResultsForRestore(ctx, searchResults, processedTerms);
                    return;
                }
            } else {
                // Búsqueda simple
                searchResults = await this.searchDeletedPolicies(searchTerm);
            }

            if (searchResults.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas eliminadas con: "${searchTerm}"

Verifica que:
• El número de póliza sea correcto
• La póliza esté marcada como ELIMINADA
• El nombre esté completo

_Intenta con otro término de búsqueda._
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_restore')],
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

            if (searchResults.length === 1) {
                // Resultado único - mostrar directamente
                await this.showSingleDeletedPolicyResult(ctx, searchResults[0], searchTerm);
            } else {
                // Múltiples resultados - mostrar para selección
                await this.showMultipleResultsForRestore(ctx, searchResults, [searchTerm]);
            }

        } catch (error) {
            logger.error('Error en búsqueda de pólizas eliminadas:', error);
            await ctx.reply('❌ Error al buscar pólizas eliminadas. Intenta nuevamente.');
        }
    }

    /**
     * Busca pólizas eliminadas por diferentes criterios
     */
    static async searchDeletedPolicies(searchTerm) {
        const trimmedTerm = searchTerm.trim();

        // Búsqueda flexible en pólizas eliminadas
        const searchConditions = [
            { numeroPoliza: { $regex: trimmedTerm, $options: 'i' } },
            { titular: { $regex: trimmedTerm, $options: 'i' } },
            { rfc: { $regex: trimmedTerm, $options: 'i' } }
        ];

        return await Policy.find({
            estado: 'ELIMINADO',
            $or: searchConditions
        })
            .select('numeroPoliza titular rfc fechaEliminacion motivoEliminacion servicios')
            .sort({ fechaEliminacion: -1 })
            .limit(20);
    }

    /**
     * Muestra múltiples resultados para restauración masiva con información detallada
     */
    static async showMultipleResultsForRestore(ctx, results, processedTerms) {
        try {
            // Obtener información adicional de servicios para cada póliza eliminada
            const enrichedResults = await Promise.all(
                results.map(async (policy) => {
                    const serviciosCount = policy.servicios ? policy.servicios.length : 0;
                    const deleteDate = new Date(policy.fechaEliminacion).toLocaleDateString('es-MX');

                    return {
                        ...policy.toObject(),
                        serviciosCount,
                        deleteDate
                    };
                })
            );

            let resultText = `
🔄 *RESTAURACIÓN MASIVA - SELECCIÓN*
━━━━━━━━━━━━━━━━━━━━━━

📊 **Encontradas:** ${results.length} pólizas eliminadas
📝 **Términos:** ${processedTerms.join(', ')}

**Información por póliza:**

`;

            enrichedResults.forEach((policy, index) => {
                resultText += `${index + 1}. **${policy.numeroPoliza}**\n`;
                resultText += `   👤 ${policy.titular}\n`;
                resultText += `   🚗 ${policy.serviciosCount} servicios\n`;
                resultText += `   📅 Eliminada: ${policy.deleteDate}\n`;
                resultText += `   📝 Motivo: ${this.escapeMarkdown(policy.motivoEliminacion) || 'No especificado'}\n`;
                resultText += '\n';
            });

            resultText += '\n⚠️ **Próximo paso:** Seleccionar pólizas a restaurar\n';
            resultText += '🚀 **Ventaja:** Confirmación única para todas las seleccionadas';

            const buttons = [
                [Markup.button.callback('☑️ Continuar Selección', 'admin_mass_restore_selection')],
                [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_restore')],
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

            // Actualizar estado para selección masiva de restauración
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'policy_mass_restore_selection',
                {
                    foundPolicies: enrichedResults,
                    searchTerms: processedTerms
                }
            );

        } catch (error) {
            logger.error('Error al mostrar resultados para restauración masiva:', error);
            await ctx.reply('❌ Error al mostrar los resultados. Intenta nuevamente.');
        }
    }

    /**
     * Muestra resultado único de póliza eliminada
     */
    static async showSingleDeletedPolicyResult(ctx, policy, searchTerm) {
        const deleteDate = new Date(policy.fechaEliminacion).toLocaleDateString('es-MX');
        const serviciosCount = policy.servicios ? policy.servicios.length : 0;

        const resultText = `
🔄 *PÓLIZA ELIMINADA ENCONTRADA*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
👤 **Titular:** ${policy.titular}
🆔 **RFC:** ${policy.rfc}
🚗 **Servicios:** ${serviciosCount}
📅 **Eliminada:** ${deleteDate}
📝 **Motivo:** ${this.escapeMarkdown(policy.motivoEliminacion) || 'No especificado'}

¿Deseas restaurar esta póliza?
        `.trim();

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Sí, Restaurar', `admin_policy_restore_execute:${policy._id}`),
                Markup.button.callback('❌ No Restaurar', 'admin_policy_restore')
            ],
            [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
        ]);

        try {
            await ctx.editMessageText(resultText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            await ctx.reply(resultText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }

    /**
     * Muestra múltiples resultados de búsqueda
     */
    static async showSearchResults(ctx, results, searchTerm) {
        let resultText = `
🔍 *RESULTADOS DE BÚSQUEDA*
━━━━━━━━━━━━━━━━━━━━━━

Búsqueda: "${searchTerm}"
Encontradas: ${results.length} pólizas

Selecciona una póliza:

`;

        const buttons = [];
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

        AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
            searchResults: results.map(p => p._id.toString()),
            searchTerm
        });
    }

    /**
     * Muestra los detalles de una póliza específica
     */
    static async showPolicyDetails(ctx, policy) {
        const formatDate = (date) => {
            if (!date) return 'No definida';
            return new Date(date).toLocaleDateString('es-MX');
        };

        const formatPhone = (phone) => {
            if (!phone) return 'No definido';
            // Formatear teléfono mexicano: 5526538255 -> (55) 2653-8255
            if (phone.length === 10) {
                return `(${phone.slice(0,2)}) ${phone.slice(2,6)}-${phone.slice(6)}`;
            }
            return phone;
        };

        // Calcular servicios y registros reales
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
📞 Teléfono: ${formatPhone(policy.telefono)}

**DIRECCIÓN**
🏠 ${policy.calle || 'N/A'}
🏘️ Col. ${policy.colonia || 'N/A'}
🏙️ ${policy.municipio || 'N/A'}, ${policy.estadoRegion || 'N/A'}
📮 CP: ${policy.cp || 'N/A'}

**VEHÍCULO**
🚗 ${policy.marca || 'N/A'} ${policy.submarca || 'N/A'} (${policy.año || 'N/A'})
🎨 Color: ${policy.color || 'No definido'}
🔢 Serie: ${policy.serie || 'No definida'}
🚙 Placas: ${policy.placas || 'No definidas'}

**PÓLIZA**
🏢 Aseguradora: ${policy.aseguradora}
👨‍💼 Agente: ${policy.agenteCotizador || 'No definido'}
📅 Emisión: ${formatDate(policy.fechaEmision)}
📊 Estado Póliza: ${policy.estadoPoliza || 'No definido'}
🗓️ Fin Cobertura: ${formatDate(policy.fechaFinCobertura)}

**SERVICIOS**
📊 Servicios: ${serviciosReales}
📋 Registros: ${registrosReales}
⭐ Calificación: ${policy.calificacion || 0}/5
📈 Estado: ${policy.estado}

¿Qué deseas hacer con esta póliza?
        `.trim();

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✏️ Editar Datos', `admin_policy_edit_categories:${policy._id}`),
                Markup.button.callback('📋 Ver Servicios', `admin_policy_view_services:${policy._id}`)
            ],
            [
                Markup.button.callback('🗑️ Eliminar', `admin_policy_delete_confirm:${policy._id}`),
                Markup.button.callback('📄 Ver Archivos', `admin_policy_view_files:${policy._id}`)
            ],
            [
                Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_edit'),
                Markup.button.callback('⬅️ Volver', 'admin_policy_menu')
            ]
        ]);

        try {
            await ctx.editMessageText(detailsText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            // Si no se puede editar, enviar mensaje nuevo
            await ctx.reply(detailsText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }

        AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
            selectedPolicy: policy._id.toString(),
            operation: 'policy_selected'
        });

        await AuditLogger.log(ctx, 'policy_viewed', 'policy', {
            policyId: policy._id.toString(),
            policyNumber: policy.numeroPoliza
        });
    }

    /**
     * Maneja la selección de una póliza específica por ID
     */
    static async handlePolicySelection(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            await this.showPolicyDetails(ctx, policy);

        } catch (error) {
            logger.error('Error al seleccionar póliza:', error);
            await ctx.reply('❌ Error al cargar la póliza.');
        }
    }

    /**
     * Procesa mensajes de texto durante la búsqueda
     */
    static async handleTextMessage(ctx) {
        const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

        if (!adminState) {
            return false;
        }

        const messageText = ctx.message.text.trim();

        // Manejar diferentes operaciones admin
        switch (adminState.operation) {
        case 'policy_search_for_edit':
        case 'policy_search_for_delete':
        case 'policy_mass_search_for_delete':
            if (messageText.length < 2) {
                await ctx.reply('❌ El término de búsqueda debe tener al menos 2 caracteres.');
                return true;
            }
            await this.handlePolicySearch(ctx, messageText);
            return true;

        case 'policy_mass_search_for_restore':
            if (messageText.length < 2) {
                await ctx.reply('❌ El término de búsqueda debe tener al menos 2 caracteres.');
                return true;
            }
            await this.handleDeletedPolicySearch(ctx, messageText);
            return true;

        case 'policy_deletion_reason':
            if (messageText.length < 3) {
                await ctx.reply('❌ El motivo debe tener al menos 3 caracteres.');
                return true;
            }
            await this.handleDeletionReason(ctx, messageText);
            return true;

        case 'policy_mass_deletion_reason':
            if (messageText.length < 3) {
                await ctx.reply('❌ El motivo debe tener al menos 3 caracteres.');
                return true;
            }
            await this.handleMassDeletionReason(ctx, messageText);
            return true;

        case 'field_editing':
            await this.processFieldEdit(ctx, messageText);
            return true;

        default:
            return false;
        }
    }

    /**
     * Ejecuta la restauración de una póliza
     */
    static async handleRestoreExecution(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            // Ejecutar restauración
            const result = await restorePolicy(policy.numeroPoliza);

            if (result) {
                const successText = `
✅ *PÓLIZA RESTAURADA*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}
**Fecha Restauración:** ${new Date().toLocaleDateString('es-MX')}

La póliza ha sido restaurada y está ACTIVA nuevamente.
                `.trim();

                await ctx.editMessageText(successText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Volver al Menú', callback_data: 'admin_policy_menu' }
                        ]]
                    }
                });

                // Log de auditoría
                await AuditLogger.log(ctx, 'policy_restored', 'policy', {
                    policyNumber: policy.numeroPoliza,
                    result: 'success'
                });

            } else {
                await ctx.reply('❌ Error: No se pudo restaurar la póliza.');
            }

        } catch (error) {
            logger.error('Error al ejecutar restauración:', error);
            await ctx.reply('❌ Error al restaurar la póliza.');
        }
    }

    /**
     * Inicia el flujo de eliminación de póliza
     */
    static async handlePolicyDelete(ctx) {
        try {
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'policy_mass_search_for_delete'
            );

            const searchText = `
🗑️ *ELIMINACIÓN MASIVA DE PÓLIZAS*
━━━━━━━━━━━━━━━━━━━━━━

🚀 *NUEVA FUNCIONALIDAD: Eliminación masiva y eficiente*

**Instrucciones:**
📝 Escribe los números de póliza separados por saltos de línea
📋 Ejemplo:
ABC123456
XYZ789012
DEF345678

✅ Se mostrarán todas las pólizas encontradas
🔍 Verás servicios y estado de cada una
☑️ Podrás seleccionar cuáles eliminar
🚀 Confirmación única para todas

_La eliminación es lógica y se puede restaurar posteriormente._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'policy_mass_delete_initiated', 'policy', {
                operation: 'mass_search_for_delete'
            });

        } catch (error) {
            logger.error('Error al iniciar eliminación masiva:', error);
            await ctx.reply('❌ Error al iniciar el proceso. Intenta nuevamente.');
        }
    }

    /**
     * Inicia el flujo de restauración MASIVA de pólizas
     */
    static async handlePolicyRestore(ctx) {
        try {
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'policy_mass_search_for_restore'
            );

            const searchText = `
🔄 *RESTAURACIÓN MASIVA DE PÓLIZAS*
━━━━━━━━━━━━━━━━━━━━━━

🚀 *NUEVA FUNCIONALIDAD: Restauración masiva y eficiente*

**Opciones disponibles:**

📝 **Búsqueda específica**: Escribe números de póliza separados por saltos de línea
📋 Ejemplo:
ILD083150000
XYZ789012
DEF345678

📅 **Ver eliminadas recientes**: Usar botón para las últimas 20 eliminadas

✅ Se mostrarán todas las pólizas encontradas
🔍 Verás fecha de eliminación y motivo
☑️ Podrás seleccionar cuáles restaurar
🚀 Confirmación única para todas

_La restauración devuelve las pólizas al estado ACTIVO._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📅 Ver Eliminadas Recientes', 'admin_show_recent_deleted')],
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'policy_mass_restore_initiated', 'policy', {
                operation: 'mass_search_for_restore'
            });

        } catch (error) {
            logger.error('Error al iniciar restauración masiva:', error);
            await ctx.reply('❌ Error al iniciar el proceso. Intenta nuevamente.');
        }
    }

    /**
     * Muestra lista de pólizas eliminadas
     */
    static async showDeletedPolicies(ctx, deletedPolicies) {
        let listText = `
🗑️ *PÓLIZAS ELIMINADAS*
━━━━━━━━━━━━━━━━━━━━━━

Total eliminadas: ${deletedPolicies.length}

Selecciona una para restaurar:

`;

        const buttons = [];
        deletedPolicies.forEach((policy, index) => {
            const deleteDate = new Date(policy.fechaEliminacion).toLocaleDateString('es-MX');
            listText += `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}\n`;
            listText += `   Eliminada: ${deleteDate}\n\n`;

            buttons.push([
                Markup.button.callback(
                    `🔄 ${index + 1}. ${policy.numeroPoliza}`,
                    `admin_policy_restore_confirm:${policy._id}`
                )
            ]);
        });

        buttons.push([
            [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
        ]);

        const keyboard = Markup.inlineKeyboard(buttons);

        await ctx.editMessageText(listText.trim(), {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    /**
     * Maneja la confirmación de eliminación de póliza
     */
    static async handleDeleteConfirmation(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const confirmText = `
⚠️ *CONFIRMAR ELIMINACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

¿Estás seguro de eliminar esta póliza?

**Póliza:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}

⚠️ Esta acción es **reversible** (eliminación lógica)
✅ Los archivos y servicios se conservarán
🔄 Se puede restaurar posteriormente

Escribe el motivo de eliminación o presiona Cancelar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Cambiar estado para esperar el motivo
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'policy_deletion_reason',
                { policyId, policyNumber: policy.numeroPoliza }
            );

        } catch (error) {
            logger.error('Error en confirmación de eliminación:', error);
            await ctx.reply('❌ Error al procesar la solicitud.');
        }
    }

    /**
     * Maneja la confirmación de restauración de póliza
     */
    static async handleRestoreConfirmation(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const confirmText = `
🔄 *CONFIRMAR RESTAURACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

¿Restaurar esta póliza?

**Póliza:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}
**Eliminada:** ${new Date(policy.fechaEliminacion).toLocaleDateString('es-MX')}
**Motivo:** ${this.escapeMarkdown(policy.motivoEliminacion) || 'No especificado'}

✅ La póliza volverá a estar ACTIVA
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Sí, Restaurar', `admin_policy_restore_execute:${policyId}`),
                    Markup.button.callback('❌ Cancelar', 'admin_policy_restore')
                ]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error en confirmación de restauración:', error);
            await ctx.reply('❌ Error al procesar la solicitud.');
        }
    }

    /**
     * Procesa el motivo de eliminación y ejecuta la eliminación
     */
    static async handleDeletionReason(ctx, reason) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || adminState.operation !== 'policy_deletion_reason') {
                return false;
            }

            const { policyNumber } = adminState.data;

            // Ejecutar eliminación lógica
            const result = await markPolicyAsDeleted(policyNumber, reason);

            if (result) {
                const successText = `
✅ *PÓLIZA ELIMINADA*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policyNumber}
**Motivo:** ${reason}
**Fecha:** ${new Date().toLocaleDateString('es-MX')}

La póliza ha sido marcada como ELIMINADA.
Se puede restaurar desde "Restaurar Póliza".
                `.trim();

                await ctx.reply(successText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '⬅️ Volver al Menú', callback_data: 'admin_policy_menu' }
                        ]]
                    }
                });

                // Log de auditoría
                await AuditLogger.log(ctx, 'policy_deleted', 'policy', {
                    policyNumber,
                    reason,
                    result: 'success'
                });

            } else {
                await ctx.reply('❌ Error: No se pudo eliminar la póliza. Verifica que esté activa.');
            }

            // Limpiar estado
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            return true;

        } catch (error) {
            logger.error('Error al procesar eliminación:', error);
            await ctx.reply('❌ Error al eliminar la póliza.');
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            return true;
        }
    }

    /**
     * Muestra el menú de categorías para edición
     */
    static async showEditCategoriesMenu(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const menuText = `
✏️ *EDITAR PÓLIZA: ${policy.numeroPoliza}*
━━━━━━━━━━━━━━━━━━━━━━

Selecciona la categoría a editar:

📱 **Datos Personales**
   Titular, RFC, Email, Teléfono

🏠 **Domicilio**  
   Dirección completa

🚗 **Vehículo**
   Marca, modelo, placas, etc.

📄 **Datos de Póliza**
   Aseguradora, agente, fechas

💰 **Información Financiera**
   Calificación, estado cobertura
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('📱 Datos Personales', `admin_edit_personal:${policyId}`),
                    Markup.button.callback('🏠 Domicilio', `admin_edit_address:${policyId}`)
                ],
                [
                    Markup.button.callback('🚗 Vehículo', `admin_edit_vehicle:${policyId}`),
                    Markup.button.callback('📄 Datos Póliza', `admin_edit_policy:${policyId}`)
                ],
                [
                    Markup.button.callback('💰 Info Financiera', `admin_edit_financial:${policyId}`)
                ],
                [
                    Markup.button.callback('⬅️ Volver a Detalles', `admin_policy_select:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Guardar el estado de edición
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                editingPolicy: policyId.toString(),
                operation: 'category_selection'
            });

        } catch (error) {
            logger.error('Error al mostrar menú de categorías:', error);
            await ctx.reply('❌ Error al cargar el menú de edición.');
        }
    }

    /**
     * Muestra los campos de Datos Personales para editar
     */
    static async showPersonalDataEdit(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const menuText = `
📱 *EDITAR DATOS PERSONALES*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}

**Valores actuales:**
👤 Titular: ${policy.titular}
🆔 RFC: ${policy.rfc}
📧 Email: ${policy.correo || 'No definido'}
📞 Teléfono: ${policy.telefono || 'No definido'}
🔑 Contraseña: ${policy.contraseña || 'No definida'}

Selecciona el campo a editar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('👤 Titular', `admin_edit_field:titular:${policyId}`),
                    Markup.button.callback('🆔 RFC', `admin_edit_field:rfc:${policyId}`)
                ],
                [
                    Markup.button.callback('📧 Email', `admin_edit_field:correo:${policyId}`),
                    Markup.button.callback('📞 Teléfono', `admin_edit_field:telefono:${policyId}`)
                ],
                [
                    Markup.button.callback('🔑 Contraseña', `admin_edit_field:contraseña:${policyId}`)
                ],
                [
                    Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error al mostrar datos personales:', error);
            await ctx.reply('❌ Error al cargar los datos personales.');
        }
    }

    /**
     * Muestra los campos de Domicilio para editar
     */
    static async showAddressEdit(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const menuText = `
🏠 *EDITAR DOMICILIO*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}

**Dirección actual:**
🏠 Calle: ${policy.calle || 'No definida'}
🏘️ Colonia: ${policy.colonia || 'No definida'}
🏙️ Municipio: ${policy.municipio || 'No definido'}
🗺️ Estado: ${policy.estadoRegion || 'No definido'}
📮 CP: ${policy.cp || 'No definido'}

Selecciona el campo a editar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('🏠 Calle', `admin_edit_field:calle:${policyId}`),
                    Markup.button.callback('🏘️ Colonia', `admin_edit_field:colonia:${policyId}`)
                ],
                [
                    Markup.button.callback('🏙️ Municipio', `admin_edit_field:municipio:${policyId}`),
                    Markup.button.callback('🗺️ Estado', `admin_edit_field:estadoRegion:${policyId}`)
                ],
                [
                    Markup.button.callback('📮 CP', `admin_edit_field:cp:${policyId}`)
                ],
                [
                    Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error al mostrar domicilio:', error);
            await ctx.reply('❌ Error al cargar el domicilio.');
        }
    }

    /**
     * Muestra los campos de Vehículo para editar
     */
    static async showVehicleEdit(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const menuText = `
🚗 *EDITAR VEHÍCULO*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}

**Datos actuales:**
🚗 Marca: ${policy.marca || 'No definida'}
🚙 Submarca: ${policy.submarca || 'No definida'}
📅 Año: ${policy.año || 'No definido'}
🎨 Color: ${policy.color || 'No definido'}
🔢 Serie: ${policy.serie || 'No definida'}
🚙 Placas: ${policy.placas || 'No definidas'}

Selecciona el campo a editar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('🚗 Marca', `admin_edit_field:marca:${policyId}`),
                    Markup.button.callback('🚙 Submarca', `admin_edit_field:submarca:${policyId}`)
                ],
                [
                    Markup.button.callback('📅 Año', `admin_edit_field:año:${policyId}`),
                    Markup.button.callback('🎨 Color', `admin_edit_field:color:${policyId}`)
                ],
                [
                    Markup.button.callback('🔢 Serie', `admin_edit_field:serie:${policyId}`),
                    Markup.button.callback('🚙 Placas', `admin_edit_field:placas:${policyId}`)
                ],
                [
                    Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error al mostrar vehículo:', error);
            await ctx.reply('❌ Error al cargar los datos del vehículo.');
        }
    }

    /**
     * Muestra los campos de Datos de Póliza para editar
     */
    static async showPolicyDataEdit(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const formatDate = (date) => {
                if (!date) return 'No definida';
                return new Date(date).toLocaleDateString('es-MX');
            };

            const menuText = `
📄 *EDITAR DATOS DE PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}

**Datos actuales:**
🏢 Aseguradora: ${policy.aseguradora || 'No definida'}
👨‍💼 Agente: ${policy.agenteCotizador || 'No definido'}
📅 Emisión: ${formatDate(policy.fechaEmision)}
📊 Estado Póliza: ${policy.estadoPoliza || 'No definido'}
🗓️ Fin Cobertura: ${formatDate(policy.fechaFinCobertura)}
🗓️ Fin Gracia: ${formatDate(policy.fechaFinGracia)}

Selecciona el campo a editar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('🏢 Aseguradora', `admin_edit_field:aseguradora:${policyId}`),
                    Markup.button.callback('👨‍💼 Agente', `admin_edit_field:agenteCotizador:${policyId}`)
                ],
                [
                    Markup.button.callback('📅 Emisión', `admin_edit_field:fechaEmision:${policyId}`),
                    Markup.button.callback('📊 Estado', `admin_edit_field:estadoPoliza:${policyId}`)
                ],
                [
                    Markup.button.callback('🗓️ Fin Cobertura', `admin_edit_field:fechaFinCobertura:${policyId}`),
                    Markup.button.callback('🗓️ Fin Gracia', `admin_edit_field:fechaFinGracia:${policyId}`)
                ],
                [
                    Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error al mostrar datos de póliza:', error);
            await ctx.reply('❌ Error al cargar los datos de la póliza.');
        }
    }

    /**
     * Muestra los campos de Información Financiera para editar
     */
    static async showFinancialEdit(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const menuText = `
💰 *EDITAR INFORMACIÓN FINANCIERA*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}

**Datos actuales:**
⭐ Calificación: ${policy.calificacion || 0}/100
📊 Estado Sistema: ${policy.estado}
🔢 Días Cobertura: ${policy.diasRestantesCobertura || 0}
🔢 Días Gracia: ${policy.diasRestantesGracia || 0}

Selecciona el campo a editar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('⭐ Calificación', `admin_edit_field:calificacion:${policyId}`),
                    Markup.button.callback('📊 Estado', `admin_edit_field:estado:${policyId}`)
                ],
                [
                    Markup.button.callback('🔢 Días Cobertura', `admin_edit_field:diasRestantesCobertura:${policyId}`),
                    Markup.button.callback('🔢 Días Gracia', `admin_edit_field:diasRestantesGracia:${policyId}`)
                ],
                [
                    Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error al mostrar información financiera:', error);
            await ctx.reply('❌ Error al cargar la información financiera.');
        }
    }

    /**
     * Inicia la edición de un campo específico
     */
    static async startFieldEdit(ctx, fieldName, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const currentValue = policy[fieldName];
            const fieldInfo = this.getFieldInfo(fieldName);

            const editText = `
✏️ *EDITAR ${fieldInfo.displayName.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}

**Valor actual:** ${currentValue || 'No definido'}

**Instrucciones:**
${fieldInfo.instructions}

${fieldInfo.validation ? `**Formato:** ${fieldInfo.validation}` : ''}

Escribe el nuevo valor o presiona Cancelar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', `admin_policy_edit_categories:${policyId}`)]
            ]);

            await ctx.editMessageText(editText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Configurar estado para edición de campo
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'field_editing',
                {
                    policyId: policyId.toString(),
                    fieldName,
                    currentValue,
                    fieldInfo
                }
            );

        } catch (error) {
            logger.error('Error al iniciar edición de campo:', error);
            await ctx.reply('❌ Error al iniciar la edición.');
        }
    }

    /**
     * Obtiene información específica del campo
     */
    static getFieldInfo(fieldName) {
        const fieldInfoMap = {
            // Datos Personales
            titular: {
                displayName: 'Titular',
                instructions: 'Escribe el nombre completo del titular',
                validation: 'Texto libre, mínimo 3 caracteres',
                type: 'string'
            },
            rfc: {
                displayName: 'RFC',
                instructions: 'Escribe el RFC de 13 caracteres',
                validation: 'Formato: XXXX######XXX (13 caracteres)',
                type: 'rfc'
            },
            correo: {
                displayName: 'Email',
                instructions: 'Escribe la dirección de correo electrónico',
                validation: 'Formato: ejemplo@dominio.com',
                type: 'email'
            },
            telefono: {
                displayName: 'Teléfono',
                instructions: 'Escribe el número de teléfono a 10 dígitos',
                validation: 'Formato: 5512345678 (10 dígitos)',
                type: 'phone'
            },
            contraseña: {
                displayName: 'Contraseña',
                instructions: 'Escribe la nueva contraseña',
                validation: 'Texto libre, mínimo 4 caracteres',
                type: 'string'
            },
            // Domicilio
            calle: {
                displayName: 'Calle',
                instructions: 'Escribe la dirección completa (calle y número)',
                validation: 'Texto libre',
                type: 'string'
            },
            colonia: {
                displayName: 'Colonia',
                instructions: 'Escribe el nombre de la colonia',
                validation: 'Texto libre',
                type: 'string'
            },
            municipio: {
                displayName: 'Municipio',
                instructions: 'Escribe el nombre del municipio',
                validation: 'Texto libre',
                type: 'string'
            },
            estadoRegion: {
                displayName: 'Estado',
                instructions: 'Escribe el nombre del estado',
                validation: 'Texto libre (ej: CDMX, EDOMEX)',
                type: 'string'
            },
            cp: {
                displayName: 'Código Postal',
                instructions: 'Escribe el código postal de 5 dígitos',
                validation: 'Formato: 12345 (5 dígitos)',
                type: 'cp'
            },
            // Vehículo
            marca: {
                displayName: 'Marca',
                instructions: 'Escribe la marca del vehículo',
                validation: 'Texto libre (ej: NISSAN, TOYOTA)',
                type: 'string'
            },
            submarca: {
                displayName: 'Submarca',
                instructions: 'Escribe el modelo del vehículo',
                validation: 'Texto libre (ej: SENTRA, COROLLA)',
                type: 'string'
            },
            año: {
                displayName: 'Año',
                instructions: 'Escribe el año del vehículo',
                validation: 'Número de 4 dígitos (1990-2025)',
                type: 'year'
            },
            color: {
                displayName: 'Color',
                instructions: 'Escribe el color del vehículo',
                validation: 'Texto libre (ej: BLANCO, AZUL)',
                type: 'string'
            },
            serie: {
                displayName: 'Número de Serie',
                instructions: 'Escribe el número de serie (VIN)',
                validation: 'Alfanumérico, 17 caracteres típicos',
                type: 'vin'
            },
            placas: {
                displayName: 'Placas',
                instructions: 'Escribe las placas del vehículo',
                validation: 'Formato: ABC1234 o 123ABC',
                type: 'plates'
            },
            // Datos Póliza
            aseguradora: {
                displayName: 'Aseguradora',
                instructions: 'Escribe el nombre de la aseguradora',
                validation: 'Texto libre (ej: ATLAS, GNP)',
                type: 'string'
            },
            agenteCotizador: {
                displayName: 'Agente Cotizador',
                instructions: 'Escribe el nombre del agente',
                validation: 'Texto libre',
                type: 'string'
            },
            fechaEmision: {
                displayName: 'Fecha de Emisión',
                instructions: 'Escribe la fecha en formato DD/MM/AAAA',
                validation: 'Formato: 15/06/2025',
                type: 'date'
            },
            estadoPoliza: {
                displayName: 'Estado de Póliza',
                instructions: 'Escribe el estado de la póliza',
                validation: 'Ej: VIGENTE, PERIODO DE GRACIA, VENCIDA',
                type: 'string'
            },
            fechaFinCobertura: {
                displayName: 'Fecha Fin Cobertura',
                instructions: 'Escribe la fecha en formato DD/MM/AAAA',
                validation: 'Formato: 15/06/2025',
                type: 'date'
            },
            fechaFinGracia: {
                displayName: 'Fecha Fin Gracia',
                instructions: 'Escribe la fecha en formato DD/MM/AAAA',
                validation: 'Formato: 15/06/2025',
                type: 'date'
            },
            // Financiera
            calificacion: {
                displayName: 'Calificación',
                instructions: 'Escribe la calificación (0-100)',
                validation: 'Número entero entre 0 y 100',
                type: 'rating'
            },
            estado: {
                displayName: 'Estado del Sistema',
                instructions: 'Escribe el estado del sistema',
                validation: 'ACTIVO, INACTIVO, ELIMINADO',
                type: 'status'
            },
            diasRestantesCobertura: {
                displayName: 'Días Restantes Cobertura',
                instructions: 'Escribe los días restantes',
                validation: 'Número entero positivo',
                type: 'number'
            },
            diasRestantesGracia: {
                displayName: 'Días Restantes Gracia',
                instructions: 'Escribe los días restantes',
                validation: 'Número entero positivo',
                type: 'number'
            }
        };

        return fieldInfoMap[fieldName] || {
            displayName: fieldName,
            instructions: 'Escribe el nuevo valor',
            validation: 'Texto libre',
            type: 'string'
        };
    }

    /**
     * Procesa la edición de un campo
     */
    static async processFieldEdit(ctx, newValue) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || adminState.operation !== 'field_editing') {
                return false;
            }

            const { policyId, fieldName, currentValue, fieldInfo } = adminState.data;

            // Rechazar comandos durante la edición
            if (newValue.startsWith('/')) {
                await ctx.reply('❌ No se pueden usar comandos durante la edición de campos.\n\nEscribe el nuevo valor o presiona "❌ Cancelar" en el menú anterior.');
                return true;
            }

            // Validar el nuevo valor
            const validation = this.validateFieldValue(newValue, fieldInfo);
            if (!validation.isValid) {
                await ctx.reply(`❌ **Error de validación:**\n${validation.error}\n\nIntenta nuevamente:`);
                return true;
            }

            const processedValue = validation.processedValue;

            // Mostrar confirmación antes de guardar
            await this.showFieldEditConfirmation(ctx, policyId, fieldName, currentValue, processedValue, fieldInfo);

            return true;

        } catch (error) {
            logger.error('Error al procesar edición de campo:', error);
            await ctx.reply('❌ Error al procesar la edición.');
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            return true;
        }
    }

    /**
     * Valida el valor de un campo según su tipo
     */
    static validateFieldValue(value, fieldInfo) {
        const trimmedValue = value.trim();

        switch (fieldInfo.type) {
        case 'string':
            if (trimmedValue.length < 3) {
                return { isValid: false, error: 'El valor debe tener al menos 3 caracteres' };
            }
            return { isValid: true, processedValue: trimmedValue };

        case 'rfc':
            if (!/^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(trimmedValue.toUpperCase())) {
                return { isValid: false, error: 'RFC inválido. Formato: XXXX######XXX' };
            }
            return { isValid: true, processedValue: trimmedValue.toUpperCase() };

        case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)) {
                return { isValid: false, error: 'Email inválido. Formato: ejemplo@dominio.com' };
            }
            return { isValid: true, processedValue: trimmedValue.toLowerCase() };

        case 'phone':
            const phoneClean = trimmedValue.replace(/\D/g, '');
            if (phoneClean.length !== 10) {
                return { isValid: false, error: 'Teléfono debe tener 10 dígitos' };
            }
            return { isValid: true, processedValue: phoneClean };

        case 'cp':
            const cpClean = trimmedValue.replace(/\D/g, '');
            if (cpClean.length !== 5) {
                return { isValid: false, error: 'Código postal debe tener 5 dígitos' };
            }
            return { isValid: true, processedValue: cpClean };

        case 'year':
            const year = parseInt(trimmedValue);
            const currentYear = new Date().getFullYear();
            if (isNaN(year) || year < 1990 || year > currentYear + 1) {
                return { isValid: false, error: `Año debe ser entre 1990 y ${currentYear + 1}` };
            }
            return { isValid: true, processedValue: year };

        case 'date':
            const dateMatch = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (!dateMatch) {
                return { isValid: false, error: 'Fecha inválida. Formato: DD/MM/AAAA' };
            }
            const [, day, month, year2] = dateMatch;
            const date = new Date(year2, month - 1, day);
            if (date.getDate() != day || date.getMonth() != month - 1 || date.getFullYear() != year2) {
                return { isValid: false, error: 'Fecha inválida. Verifica día/mes/año' };
            }
            return { isValid: true, processedValue: date };

        case 'rating':
            const rating = parseInt(trimmedValue);
            if (isNaN(rating) || rating < 0 || rating > 100) {
                return { isValid: false, error: 'Calificación debe ser un número entre 0 y 100' };
            }
            return { isValid: true, processedValue: rating };

        case 'number':
            const num = parseInt(trimmedValue);
            if (isNaN(num) || num < 0) {
                return { isValid: false, error: 'Debe ser un número positivo' };
            }
            return { isValid: true, processedValue: num };

        case 'status':
            const validStatuses = ['ACTIVO', 'INACTIVO', 'ELIMINADO'];
            const upperValue = trimmedValue.toUpperCase();
            if (!validStatuses.includes(upperValue)) {
                return { isValid: false, error: 'Estado debe ser: ACTIVO, INACTIVO o ELIMINADO' };
            }
            return { isValid: true, processedValue: upperValue };

        case 'vin':
            const vinClean = trimmedValue.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (vinClean.length !== 17) {
                return { isValid: false, error: 'VIN debe tener 17 caracteres alfanuméricos' };
            }
            // Validación básica de VIN: no contiene I, O, Q
            if (/[IOQ]/.test(vinClean)) {
                return { isValid: false, error: 'VIN no puede contener las letras I, O o Q' };
            }
            return { isValid: true, processedValue: vinClean };

        case 'plates':
            const plateClean = trimmedValue.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (plateClean.length < 6 || plateClean.length > 7) {
                return { isValid: false, error: 'Placas deben tener 6 o 7 caracteres' };
            }
            // Validar formato mexicano: ABC1234 o 123ABC
            if (!/^[A-Z]{3}[0-9]{3,4}$|^[0-9]{3}[A-Z]{3,4}$/.test(plateClean)) {
                return { isValid: false, error: 'Formato de placas inválido. Usar ABC1234 o 123ABC' };
            }
            return { isValid: true, processedValue: plateClean };

        default:
            return { isValid: true, processedValue: trimmedValue };
        }
    }

    /**
     * Muestra confirmación antes de aplicar cambios
     */
    static async showFieldEditConfirmation(ctx, policyId, fieldName, oldValue, newValue, fieldInfo) {
        try {
            const policy = await Policy.findById(policyId);

            const escapeMarkdown = (text) => {
                if (!text) return 'No definido';
                return text.toString()
                    .replace(/[_*[\]()~`>#+=|{}.!@-]/g, '\\$&');
            };

            const formatValue = (value, type) => {
                if (value === null || value === undefined || value === '') return 'No definido';
                if (type === 'date' && value instanceof Date) {
                    return escapeMarkdown(value.toLocaleDateString('es-MX'));
                }
                return escapeMarkdown(value.toString());
            };

            const confirmText = `
✅ *CONFIRMAR CAMBIO*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Campo:** ${fieldInfo.displayName}

**Valor anterior:**
${formatValue(oldValue, fieldInfo.type)}

**Nuevo valor:**
${formatValue(newValue, fieldInfo.type)}

¿Confirmas el cambio?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Confirmar', `admin_confirm_edit:${policyId}:${fieldName}`),
                    Markup.button.callback('❌ Cancelar', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            try {
                await ctx.editMessageText(confirmText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (editError) {
                // Si no se puede editar, enviar mensaje nuevo
                await ctx.reply(confirmText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            // Actualizar estado con los datos para confirmar
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
                'field_confirmation',
                {
                    policyId: policyId.toString(),
                    fieldName,
                    oldValue,
                    newValue,
                    fieldInfo
                }
            );

        } catch (error) {
            logger.error('Error al mostrar confirmación:', error);
            await ctx.reply('❌ Error al mostrar confirmación. Operación cancelada.');
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
        }
    }

    /**
     * Ejecuta el cambio confirmado
     */
    static async executeFieldChange(ctx, policyId, fieldName) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || adminState.operation !== 'field_confirmation') {
                await ctx.reply('❌ Error: No se encontró la confirmación pendiente.');
                return;
            }

            const { oldValue, newValue, fieldInfo } = adminState.data;

            // Actualizar en la base de datos
            const updateData = {};
            updateData[fieldName] = newValue;

            const updatedPolicy = await Policy.findByIdAndUpdate(
                policyId,
                updateData,
                { new: true, runValidators: true }
            );

            if (!updatedPolicy) {
                await ctx.reply('❌ Error: No se pudo actualizar la póliza.');
                return;
            }

            const successText = `
✅ *CAMPO ACTUALIZADO*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${updatedPolicy.numeroPoliza}
**Campo:** ${fieldInfo.displayName}
**Actualizado:** ${new Date().toLocaleString('es-MX')}

El cambio se ha guardado exitosamente.
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✏️ Editar Otro Campo', `admin_policy_edit_categories:${policyId}`),
                    Markup.button.callback('👁️ Ver Detalles', `admin_policy_select:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(successText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Log de auditoría
            await AuditLogger.logChange(ctx, 'field_updated', updatedPolicy,
                { [fieldName]: oldValue },
                { [fieldName]: newValue },
                'policy'
            );

            // Limpiar estado
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);

        } catch (error) {
            logger.error('Error al ejecutar cambio:', error);
            await ctx.reply('❌ Error al guardar el cambio en la base de datos.');
        }
    }

    /**
     * Muestra pólizas eliminadas recientes (últimas 20)
     */
    static async showRecentDeletedPolicies(ctx) {
        try {
            const deletedPolicies = await Policy.find({ estado: 'ELIMINADO' })
                .select('numeroPoliza titular rfc fechaEliminacion motivoEliminacion servicios')
                .sort({ fechaEliminacion: -1 })
                .limit(20);

            if (deletedPolicies.length === 0) {
                const noDeletedText = `
✅ *SIN PÓLIZAS ELIMINADAS*
━━━━━━━━━━━━━━━━━━━━━━

No hay pólizas marcadas como eliminadas.

Todas las pólizas están activas en el sistema.
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                ]);

                await ctx.editMessageText(noDeletedText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                return;
            }

            // Mostrar usando la función de múltiples resultados
            await this.showMultipleResultsForRestore(ctx, deletedPolicies, ['Eliminadas recientes']);

        } catch (error) {
            logger.error('Error al mostrar pólizas eliminadas recientes:', error);
            await ctx.reply('❌ Error al cargar pólizas eliminadas.');
        }
    }

    /**
     * Muestra interfaz de selección masiva para restauración
     */
    static async showMassRestoreSelectionInterface(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || !adminState.data.foundPolicies) {
                await ctx.reply('❌ Error: No se encontraron las pólizas para selección.');
                return;
            }

            const foundPolicies = adminState.data.foundPolicies;

            let selectionText = `
☑️ *SELECCIÓN MASIVA PARA RESTAURACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

**Instrucciones:**
✅ Usa los botones para seleccionar/deseleccionar
📊 Se muestra información de cada póliza eliminada
🚀 Confirmación única al final

**Pólizas eliminadas:**

`;

            const buttons = [];
            const currentSelection = adminState.data.selectedPolicies || [];

            foundPolicies.forEach((policy, index) => {
                const isSelected = currentSelection.includes(policy._id.toString());
                const checkmark = isSelected ? '✅' : '⬜';

                selectionText += `${checkmark} **${policy.numeroPoliza}**\n`;
                selectionText += `   👤 ${policy.titular}\n`;
                selectionText += `   🚗 ${policy.serviciosCount} servicios\n`;
                selectionText += `   📅 Eliminada: ${policy.deleteDate}\n`;
                selectionText += `   📝 ${this.escapeMarkdown(policy.motivoEliminacion) || 'No especificado'}\n\n`;

                buttons.push([
                    Markup.button.callback(
                        `${checkmark} ${policy.numeroPoliza} (${policy.serviciosCount} servicios)`,
                        `admin_toggle_restore:${policy._id}`
                    )
                ]);
            });

            // Botones de acción
            const actionButtons = [];

            if (currentSelection.length > 0) {
                actionButtons.push([
                    Markup.button.callback(`🔄 Restaurar Seleccionadas (${currentSelection.length})`, 'admin_confirm_mass_restore')
                ]);
            }

            actionButtons.push([
                Markup.button.callback('☑️ Seleccionar Todas', 'admin_restore_select_all'),
                Markup.button.callback('⬜ Deseleccionar Todas', 'admin_restore_deselect_all')
            ]);

            actionButtons.push([
                Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_restore'),
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

            // Actualizar estado
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                currentView: 'mass_restore_selection'
            });

        } catch (error) {
            logger.error('Error al mostrar interfaz de selección masiva para restauración:', error);
            await ctx.reply('❌ Error al cargar la interfaz de selección.');
        }
    }

    /**
     * Toggle selección de una póliza para restauración
     */
    static async toggleRestoreSelection(ctx, policyId) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || adminState.operation !== 'policy_mass_restore_selection') {
                await ctx.answerCbQuery('❌ Error: Estado de selección no válido', { show_alert: true });
                return;
            }

            let selectedPolicies = adminState.data.selectedPolicies || [];

            if (selectedPolicies.includes(policyId)) {
                // Deseleccionar
                selectedPolicies = selectedPolicies.filter(id => id !== policyId);
                await ctx.answerCbQuery('⬜ Póliza deseleccionada');
            } else {
                // Seleccionar
                selectedPolicies.push(policyId);
                await ctx.answerCbQuery('✅ Póliza seleccionada');
            }

            // Actualizar estado
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicies
            });

            // Refrescar interfaz
            await this.showMassRestoreSelectionInterface(ctx);

        } catch (error) {
            logger.error('Error al cambiar selección de restauración:', error);
            await ctx.answerCbQuery('❌ Error al cambiar selección', { show_alert: true });
        }
    }

    /**
     * Selecciona todas las pólizas para restauración
     */
    static async selectAllForRestore(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || !adminState.data.foundPolicies) {
                await ctx.answerCbQuery('❌ Error: No hay pólizas para seleccionar', { show_alert: true });
                return;
            }

            const allPolicyIds = adminState.data.foundPolicies.map(p => p._id.toString());

            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicies: allPolicyIds
            });

            await ctx.answerCbQuery(`✅ ${allPolicyIds.length} pólizas seleccionadas`);
            await this.showMassRestoreSelectionInterface(ctx);

        } catch (error) {
            logger.error('Error al seleccionar todas para restaurar:', error);
            await ctx.answerCbQuery('❌ Error al seleccionar todas', { show_alert: true });
        }
    }

    /**
     * Deselecciona todas las pólizas para restauración
     */
    static async deselectAllForRestore(ctx) {
        try {
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicies: []
            });

            await ctx.answerCbQuery('⬜ Todas las pólizas deseleccionadas');
            await this.showMassRestoreSelectionInterface(ctx);

        } catch (error) {
            logger.error('Error al deseleccionar todas para restaurar:', error);
            await ctx.answerCbQuery('❌ Error al deseleccionar todas', { show_alert: true });
        }
    }

    /**
     * Muestra confirmación para restauración masiva
     */
    static async showMassRestoreConfirmation(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || !adminState.data.selectedPolicies || adminState.data.selectedPolicies.length === 0) {
                await ctx.answerCbQuery('❌ No hay pólizas seleccionadas', { show_alert: true });
                return;
            }

            const selectedPolicies = adminState.data.selectedPolicies;
            const foundPolicies = adminState.data.foundPolicies || [];

            // Obtener detalles de las pólizas seleccionadas
            const selectedPolicyDetails = foundPolicies.filter(p =>
                selectedPolicies.includes(p._id.toString())
            );

            let confirmText = `
✅ *CONFIRMAR RESTAURACIÓN MASIVA*
━━━━━━━━━━━━━━━━━━━━━━

**Vas a restaurar ${selectedPolicies.length} pólizas:**

`;

            let totalServicios = 0;
            selectedPolicyDetails.forEach((policy, index) => {
                confirmText += `${index + 1}. **${policy.numeroPoliza}**\n`;
                confirmText += `   👤 ${policy.titular}\n`;
                confirmText += `   🚗 ${policy.serviciosCount} servicios\n`;
                confirmText += `   📅 Eliminada: ${policy.deleteDate}\n`;
                confirmText += `   📝 Motivo: ${this.escapeMarkdown(policy.motivoEliminacion) || 'No especificado'}\n\n`;
                totalServicios += policy.serviciosCount;
            });

            confirmText += `📊 **Total servicios a restaurar:** ${totalServicios}\n\n`;
            confirmText += '**¿Confirmas la restauración masiva?**';

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Sí, Restaurar Todas', 'admin_execute_mass_restore'),
                    Markup.button.callback('❌ Cancelar', 'admin_mass_restore_selection')
                ]
            ]);

            try {
                await ctx.editMessageText(confirmText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(confirmText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            // Actualizar estado para confirmación
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                confirmationPending: true,
                selectedPolicyDetails
            });

        } catch (error) {
            logger.error('Error al mostrar confirmación de restauración masiva:', error);
            await ctx.reply('❌ Error al mostrar confirmación.');
        }
    }

    /**
     * Procesa el motivo de eliminación masiva y ejecuta las eliminaciones
     */
    static async handleMassDeletionReason(ctx, reason) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || adminState.operation !== 'policy_mass_deletion_reason') {
                return false;
            }

            const { selectedPolicies, selectedPolicyIds } = adminState.data;

            // Mostrar progreso
            const progressText = `
🔄 *EJECUTANDO ELIMINACIÓN MASIVA*
━━━━━━━━━━━━━━━━━━━━━━

**Procesando ${selectedPolicies.length} pólizas...**
**Motivo:** ${reason}

⏳ Por favor espera mientras se procesan las eliminaciones...
            `.trim();

            await ctx.reply(progressText, {
                parse_mode: 'Markdown'
            });

            // Procesar eliminaciones en lote
            const results = {
                success: [],
                failed: []
            };

            for (const policy of selectedPolicies) {
                try {
                    const result = await markPolicyAsDeleted(policy.numeroPoliza, reason);

                    if (result) {
                        results.success.push({
                            numeroPoliza: policy.numeroPoliza,
                            titular: policy.titular
                        });

                        // Log de auditoría individual
                        await AuditLogger.log(ctx, 'policy_mass_deleted', 'policy', {
                            policyNumber: policy.numeroPoliza,
                            reason,
                            batchOperation: true
                        });
                    } else {
                        results.failed.push({
                            numeroPoliza: policy.numeroPoliza,
                            titular: policy.titular,
                            error: 'No se pudo eliminar'
                        });
                    }
                } catch (error) {
                    logger.error(`Error al eliminar póliza ${policy.numeroPoliza}:`, error);
                    results.failed.push({
                        numeroPoliza: policy.numeroPoliza,
                        titular: policy.titular,
                        error: error.message
                    });
                }
            }

            // Mostrar resultados
            let resultText = `
✅ *ELIMINACIÓN MASIVA COMPLETADA*
━━━━━━━━━━━━━━━━━━━━━━

**Resumen:**
✅ Exitosas: ${results.success.length}
❌ Fallidas: ${results.failed.length}
📝 Motivo: ${reason}
📅 Fecha: ${new Date().toLocaleDateString('es-MX')}

`;

            if (results.success.length > 0) {
                resultText += '**✅ Pólizas eliminadas exitosamente:**\n';
                results.success.forEach((policy, index) => {
                    resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}\n`;
                });
                resultText += '\n';
            }

            if (results.failed.length > 0) {
                resultText += '**❌ Pólizas que fallaron:**\n';
                results.failed.forEach((policy, index) => {
                    resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.error}\n`;
                });
                resultText += '\n';
            }

            resultText += '🔄 Las pólizas eliminadas se pueden restaurar desde "Restaurar Póliza".';

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Restaurar Pólizas', 'admin_policy_restore')],
                [Markup.button.callback('🗑️ Nueva Eliminación', 'admin_policy_delete')],
                [Markup.button.callback('⬅️ Volver al Menú', 'admin_policy_menu')]
            ]);

            await ctx.reply(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Log de auditoría de la operación masiva
            await AuditLogger.log(ctx, 'policy_mass_deletion_completed', 'policy', {
                totalPolicies: selectedPolicies.length,
                successful: results.success.length,
                failed: results.failed.length,
                reason,
                processedPolicies: results.success.map(p => p.numeroPoliza)
            });

            // Limpiar estado
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            return true;

        } catch (error) {
            logger.error('Error al procesar eliminación masiva:', error);
            await ctx.reply('❌ Error al procesar la eliminación masiva.');
            return false;
        }
    }

    /**
     * Cancela el proceso de eliminación masiva
     */
    static async cancelMassDeletion(ctx) {
        try {
            // Limpiar estado
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);

            const cancelText = `
❌ *ELIMINACIÓN CANCELADA*
━━━━━━━━━━━━━━━━━━━━━━

La eliminación masiva ha sido cancelada.

No se han eliminado pólizas.
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🗑️ Nueva Eliminación', 'admin_policy_delete')],
                [Markup.button.callback('⬅️ Volver al Menú', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(cancelText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'policy_mass_deletion_cancelled', 'policy', {
                operation: 'cancelled_by_user'
            });

        } catch (error) {
            logger.error('Error al cancelar eliminación masiva:', error);
            await ctx.reply('❌ Error al cancelar la operación.');
        }
    }

    /**
     * Ejecuta la restauración masiva de pólizas
     */
    static async executeMassRestore(ctx) {
        try {
            const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);

            if (!adminState || !adminState.data.selectedPolicyDetails) {
                await ctx.reply('❌ Error: No se encontraron las pólizas para restaurar.');
                return;
            }

            const selectedPolicies = adminState.data.selectedPolicyDetails;

            // Mostrar progreso
            const progressText = `
🔄 *EJECUTANDO RESTAURACIÓN MASIVA*
━━━━━━━━━━━━━━━━━━━━━━

**Procesando ${selectedPolicies.length} pólizas...**

⏳ Por favor espera mientras se procesan las restauraciones...
            `.trim();

            await ctx.reply(progressText, {
                parse_mode: 'Markdown'
            });

            // Procesar restauraciones en lote
            const results = {
                success: [],
                failed: []
            };

            for (const policy of selectedPolicies) {
                try {
                    const result = await restorePolicy(policy.numeroPoliza);

                    if (result) {
                        results.success.push({
                            numeroPoliza: policy.numeroPoliza,
                            titular: policy.titular
                        });

                        // Log de auditoría individual
                        await AuditLogger.log(ctx, 'policy_mass_restored', 'policy', {
                            policyNumber: policy.numeroPoliza,
                            batchOperation: true
                        });
                    } else {
                        results.failed.push({
                            numeroPoliza: policy.numeroPoliza,
                            titular: policy.titular,
                            error: 'No se pudo restaurar'
                        });
                    }
                } catch (error) {
                    logger.error(`Error al restaurar póliza ${policy.numeroPoliza}:`, error);
                    results.failed.push({
                        numeroPoliza: policy.numeroPoliza,
                        titular: policy.titular,
                        error: error.message
                    });
                }
            }

            // Mostrar resultados
            let resultText = `
✅ *RESTAURACIÓN MASIVA COMPLETADA*
━━━━━━━━━━━━━━━━━━━━━━

**Resumen:**
✅ Exitosas: ${results.success.length}
❌ Fallidas: ${results.failed.length}
📅 Fecha: ${new Date().toLocaleDateString('es-MX')}

`;

            if (results.success.length > 0) {
                resultText += '**✅ Pólizas restauradas exitosamente:**\n';
                results.success.forEach((policy, index) => {
                    resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.titular}\n`;
                });
                resultText += '\n';
            }

            if (results.failed.length > 0) {
                resultText += '**❌ Pólizas que fallaron:**\n';
                results.failed.forEach((policy, index) => {
                    resultText += `${index + 1}. ${policy.numeroPoliza} - ${policy.error}\n`;
                });
                resultText += '\n';
            }

            resultText += '🎉 Las pólizas restauradas están ahora ACTIVAS.';

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Más Restauraciones', 'admin_policy_restore')],
                [Markup.button.callback('🗑️ Eliminar Pólizas', 'admin_policy_delete')],
                [Markup.button.callback('⬅️ Volver al Menú', 'admin_policy_menu')]
            ]);

            await ctx.reply(resultText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Log de auditoría de la operación masiva
            await AuditLogger.log(ctx, 'policy_mass_restore_completed', 'policy', {
                totalPolicies: selectedPolicies.length,
                successful: results.success.length,
                failed: results.failed.length,
                processedPolicies: results.success.map(p => p.numeroPoliza)
            });

            // Limpiar estado
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);

        } catch (error) {
            logger.error('Error al ejecutar restauración masiva:', error);
            await ctx.reply('❌ Error al procesar la restauración masiva.');
        }
    }

    /**
   * Muestra estadísticas de pólizas
   */
    static async handleStats(ctx) {
    // Por ahora mostrar placeholder
        const statsText = `
📊 *ESTADÍSTICAS DE PÓLIZAS*
━━━━━━━━━━━━━━━━━━━━━━

📋 Total Pólizas: _Calculando..._
✅ Activas: _Calculando..._
❌ Eliminadas: _Calculando..._
📅 Registradas este mes: _Calculando..._

_Las estadísticas completas estarán disponibles en la Fase 4._
    `.trim();

        await ctx.editMessageText(statsText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '⬅️ Volver', callback_data: 'admin_policy_menu' }
                ]]
            }
        });
    }
}

module.exports = PolicyHandler;
