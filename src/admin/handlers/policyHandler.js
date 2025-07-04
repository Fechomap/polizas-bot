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
            let processedTerms = [];
            
            if (terms.length > 1) {
                // Búsqueda múltiple
                for (const term of terms.slice(0, 5)) { // Máximo 5 términos
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
                    // Mostrar resultados múltiples
                    await this.showMultipleSearchResults(ctx, searchResults, processedTerms);
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

            if (searchResults.length === 1) {
                await this.showPolicyDetails(ctx, searchResults[0]);
            } else {
                await this.showSearchResults(ctx, searchResults, searchTerm);
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
                Markup.button.callback('✏️ Editar Datos', `admin_policy_edit_data:${policy._id}`),
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
            if (messageText.length < 2) {
                await ctx.reply('❌ El término de búsqueda debe tener al menos 2 caracteres.');
                return true;
            }
            await this.handlePolicySearch(ctx, messageText);
            return true;

        case 'policy_deletion_reason':
            if (messageText.length < 3) {
                await ctx.reply('❌ El motivo debe tener al menos 3 caracteres.');
                return true;
            }
            await this.handleDeletionReason(ctx, messageText);
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
                'policy_search_for_delete'
            );

            const searchText = `
🗑️ *BUSCAR PÓLIZA PARA ELIMINAR*
━━━━━━━━━━━━━━━━━━━━━━

⚠️ *ATENCIÓN: Esta operación marca la póliza como eliminada.*

Escribe el número de póliza o nombre del titular:

_La eliminación es lógica y se puede restaurar posteriormente._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_policy_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Error al iniciar eliminación:', error);
            await ctx.reply('❌ Error al iniciar el proceso. Intenta nuevamente.');
        }
    }

    /**
     * Inicia el flujo de restauración de pólizas
     */
    static async handlePolicyRestore(ctx) {
        try {
            const deletedPolicies = await Policy.find({ estado: 'ELIMINADO' })
                .select('numeroPoliza titular rfc fechaEliminacion motivoEliminacion')
                .sort({ fechaEliminacion: -1 })
                .limit(10);

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

            await this.showDeletedPolicies(ctx, deletedPolicies);

        } catch (error) {
            logger.error('Error al buscar pólizas eliminadas:', error);
            await ctx.reply('❌ Error al cargar pólizas eliminadas.');
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
**Motivo:** ${policy.motivoEliminacion || 'No especificado'}

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
