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

                case 'search':
                    return await this.handleUnifiedPolicySearch(ctx);

                case 'restore':
                    return await this.handlePolicyRestore(ctx);

                case 'stats':
                    return await this.handleStats(ctx);

                // DEPRECATED - mantener por compatibilidad temporal
                case 'edit':
                    return await this.handlePolicyEdit(ctx);
                case 'delete':
                    return await this.handlePolicyDelete(ctx);

                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en PolicyHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    /**
     * Búsqueda unificada de pólizas - Nuevo flujo intuitivo
     */
    static async handleUnifiedPolicySearch(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'policy_unified_search'
            );

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
     * Maneja los resultados de la búsqueda unificada
     */
    static async handleUnifiedPolicySearchResults(ctx: Context, searchTerm: string): Promise<void> {
        try {
            // Usar la función de búsqueda existente pero solo en pólizas activas
            const searchResults = await this.searchPolicies(searchTerm, false); // false = no incluir eliminadas

            if (searchResults.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas con: "${searchTerm}"

Verifica que:
• El término sea correcto
• La póliza esté activa (no eliminada)
• No tenga espacios adicionales

_¿La póliza está eliminada? Usa "🔄 Restaurar Póliza"_
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_search')],
                    [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                ]);

                await ctx.editMessageText(noResultsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                return;
            }

            if (searchResults.length === 1) {
                // Un resultado: ir directo a detalles con abanico de opciones
                await this.showUnifiedPolicyDetails(ctx, searchResults[0]._id.toString());
            } else {
                // Múltiples resultados: mostrar lista para seleccionar
                await this.showSearchResults(ctx, searchResults, searchTerm);
            }

            await AuditLogger.log(ctx, 'policy_unified_search_completed', {
                module: 'policy',
                metadata: {
                    searchTerm,
                    resultsCount: searchResults.length
                }
            });
        } catch (error) {
            logger.error('Error en búsqueda unificada:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }

    /**
     * Muestra detalles de póliza con abanico completo de opciones (NUEVO FLUJO)
     */
    static async showUnifiedPolicyDetails(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const formatDate = (date: Date | string | null | undefined): string => {
                if (!date) return 'No definida';
                return new Date(date).toLocaleDateString('es-MX');
            };

            const formatPhone = (phone: string | null | undefined): string => {
                if (!phone) return 'No definido';
                if (phone.length === 10) {
                    return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
                }
                return phone;
            };

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
📅 Emisión: ${formatDate(policy.fechaEmision)}
📅 Fin Cobertura: ${formatDate(policy.fechaFinCobertura)}
🛡️ Estado: ${policy.estadoPoliza || 'Sin definir'}
🏢 Aseguradora: ${policy.aseguradora || 'Sin aseguradora'}

**SERVICIOS Y REGISTROS**
🚗 Servicios: ${serviciosReales}
📋 Registros: ${registrosReales}

🎯 **¿Qué deseas hacer con esta póliza?**
            `.trim();

            // ABANICO DE OPCIONES COMPLETO
            const buttons = [
                [
                    Markup.button.callback('✏️ Editar Póliza', `admin_policy_edit_categories:${policy._id}`),
                    Markup.button.callback('🗑️ Eliminar Póliza', `admin_policy_delete_confirm:${policy._id}`)
                ],
                [
                    Markup.button.callback('🚗 Ver Servicios', `admin_service_select:${policy._id}`),
                    Markup.button.callback('📊 Ver Estadísticas', `admin_policy_stats:${policy._id}`)
                ],
                [
                    Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_search'),
                    Markup.button.callback('⬅️ Volver', 'admin_policy_menu')
                ]
            ];

            const keyboard = Markup.inlineKeyboard(buttons);

            try {
                await ctx.editMessageText(detailsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(detailsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            // Limpiar estado de búsqueda
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

    static async searchPolicies(searchTerm: string, onlyDeleted: boolean = false): Promise<IPolicySearchResult[]> {
        const cleanTerm = searchTerm.trim();

        const searchQuery: any = {
            estado: onlyDeleted ? 'ELIMINADO' : { $ne: 'ELIMINADO' },
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

    static async showPolicyDetails(ctx: Context, policy: any): Promise<void> {
        const formatDate = (date: Date | string | null | undefined): string => {
            if (!date) return 'No definida';
            return new Date(date).toLocaleDateString('es-MX');
        };

        const formatPhone = (phone: string | null | undefined): string => {
            if (!phone) return 'No definido';
            // Formatear teléfono mexicano: 5526538255 -> (55) 2653-8255
            if (phone.length === 10) {
                return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
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

**DOMICILIO**
🏠 ${policy.calle || 'Sin calle'}, ${policy.colonia || 'Sin colonia'}
📍 ${policy.municipio || 'Sin municipio'}, ${policy.estadoRegion || 'Sin estado'}
📮 CP: ${policy.codigoPostal || 'Sin CP'}

**VEHÍCULO**
🚗 ${policy.marca || 'Sin marca'} ${policy.modelo || 'Sin modelo'} ${policy.año || 'Sin año'}
🏷️ Placas: ${policy.placas || 'Sin placas'}
🔢 Serie: ${policy.numeroSerie || 'Sin serie'}
🎨 Color: ${policy.color || 'Sin color'}

**PÓLIZA**
📅 Emisión: ${formatDate(policy.fechaEmision)}
📅 Vencimiento: ${formatDate(policy.fechaVencimiento)}
🛡️ Cobertura: ${policy.tipoCobertura || 'Sin definir'}
💰 Prima Total: $${policy.primaTotal || 0}

**SERVICIOS Y REGISTROS**
🚗 Servicios: ${serviciosReales}
📋 Registros: ${registrosReales}

¿Qué deseas hacer?
        `.trim();

        const buttons = [
            [
                Markup.button.callback('🚗 Ver Servicios', `admin_service_select:${policy._id}`),
                Markup.button.callback('✏️ Editar Póliza', `admin_policy_edit_categories:${policy._id}`)
            ],
            [
                Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_edit'),
                Markup.button.callback('⬅️ Volver', 'admin_policy_menu')
            ]
        ];

        const keyboard = Markup.inlineKeyboard(buttons);

        try {
            await ctx.editMessageText(detailsText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            await ctx.reply(detailsText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }

        await AuditLogger.log(ctx, 'policy_viewed', {
            module: 'policy',
            metadata: {
                policyId: policy._id.toString(),
                policyNumber: policy.numeroPoliza
            }
        });
    }

    static async showSearchResults(
        ctx: Context,
        results: IPolicySearchResult[],
        searchTerm: string
    ): Promise<void> {
        let resultText = `
🔍 *RESULTADOS DE BÚSQUEDA*
━━━━━━━━━━━━━━━━━━━━━━

Búsqueda: "${searchTerm}"
Encontradas: ${results.length} pólizas

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

        // Actualizar estado admin con resultados de búsqueda
        adminStateManager.updateAdminState(ctx.from!.id, ctx.chat!.id, {
            searchResults: results.map(p => p._id.toString()),
            searchTerm
        });
    }

    static async handlePolicySelection(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            // Verificar si viene del nuevo flujo unificado
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);
            
            if (adminState && adminState.operation === 'policy_unified_search') {
                // Nuevo flujo: mostrar abanico completo de opciones
                await this.showUnifiedPolicyDetails(ctx, policyId);
            } else {
                // Flujo legacy: mostrar detalles tradicionales
                await this.showPolicyDetails(ctx, policy);
            }
        } catch (error) {
            logger.error('Error al seleccionar póliza:', error);
            await ctx.reply('❌ Error al cargar la póliza.');
        }
    }

    static async handleDeleteConfirmation(ctx: Context, policyId: string): Promise<void> {
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
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'policy_deletion_reason', {
                policyId,
                policyNumber: policy.numeroPoliza
            });

            await AuditLogger.log(ctx, 'policy_deletion_confirmation_requested', {
                module: 'policy',
                entityType: 'policy',
                entityId: policyId,
                metadata: {
                    policyNumber: policy.numeroPoliza
                }
            });
        } catch (error) {
            logger.error('Error en confirmación de eliminación:', error);
            await ctx.reply('❌ Error al procesar la solicitud.');
        }
    }

    static async handleDeletionReason(ctx: Context, reason: string): Promise<boolean> {
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

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
                        inline_keyboard: [
                            [{ text: '⬅️ Volver al Menú', callback_data: 'admin_policy_menu' }]
                        ]
                    }
                });

                // Log de auditoría
                await AuditLogger.log(ctx, 'policy_deleted', {
                    module: 'policy',
                    entityType: 'policy',
                    entityId: policyNumber,
                    changes: {
                        before: { estado: 'ACTIVA' },
                        after: { estado: 'ELIMINADO' }
                    },
                    metadata: {
                        policyNumber,
                        reason,
                        result: 'success'
                    }
                });
            } else {
                await ctx.reply(
                    '❌ Error: No se pudo eliminar la póliza. Verifica que esté activa.'
                );
            }

            // Limpiar estado
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            return true;
        } catch (error) {
            logger.error('Error al ejecutar eliminación:', error);
            await ctx.reply('❌ Error al eliminar la póliza.');
            return false;
        }
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
                    Markup.button.callback(
                        '📱 Datos Personales',
                        `admin_edit_personal:${policyId}`
                    ),
                    Markup.button.callback('🏠 Domicilio', `admin_edit_address:${policyId}`)
                ],
                [
                    Markup.button.callback('🚗 Vehículo', `admin_edit_vehicle:${policyId}`),
                    Markup.button.callback('📄 Datos Póliza', `admin_edit_policy:${policyId}`)
                ],
                [Markup.button.callback('💰 Info Financiera', `admin_edit_financial:${policyId}`)],
                [Markup.button.callback('⬅️ Volver a Detalles', `admin_policy_select:${policyId}`)]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'policy_categories_menu_shown', {
                module: 'policy',
                metadata: {
                    policyId: policyId,
                    policyNumber: policy.numeroPoliza
                }
            });
        } catch (error) {
            logger.error('Error al mostrar menú de categorías:', error);
            await ctx.reply('❌ Error al cargar el menú de categorías.');
        }
    }

    static async showPersonalDataEdit(ctx: Context, policyId: string): Promise<void> {
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
                    Markup.button.callback(
                        '🔑 Contraseña',
                        `admin_edit_field:contraseña:${policyId}`
                    )
                ],
                [Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)]
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

    static async showAddressEdit(ctx: Context, policyId: string): Promise<void> {
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
                [Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar datos de domicilio:', error);
            await ctx.reply('❌ Error al cargar los datos de domicilio.');
        }
    }

    static async showVehicleEdit(ctx: Context, policyId: string): Promise<void> {
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
                [Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar datos del vehículo:', error);
            await ctx.reply('❌ Error al cargar los datos del vehículo.');
        }
    }

    static async showPolicyDataEdit(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const formatDate = (date: Date | string | null | undefined): string => {
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
                    Markup.button.callback(
                        '🏢 Aseguradora',
                        `admin_edit_field:aseguradora:${policyId}`
                    ),
                    Markup.button.callback(
                        '👨‍💼 Agente',
                        `admin_edit_field:agenteCotizador:${policyId}`
                    )
                ],
                [
                    Markup.button.callback(
                        '📅 Emisión',
                        `admin_edit_field:fechaEmision:${policyId}`
                    ),
                    Markup.button.callback('📊 Estado', `admin_edit_field:estadoPoliza:${policyId}`)
                ],
                [
                    Markup.button.callback(
                        '🗓️ Fin Cobertura',
                        `admin_edit_field:fechaFinCobertura:${policyId}`
                    ),
                    Markup.button.callback(
                        '🗓️ Fin Gracia',
                        `admin_edit_field:fechaFinGracia:${policyId}`
                    )
                ],
                [Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)]
            ]);

            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            logger.error('Error al mostrar datos de póliza:', error);
            await ctx.reply('❌ Error al cargar los datos de póliza.');
        }
    }

    static async showFinancialEdit(ctx: Context, policyId: string): Promise<void> {
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
🔢 Total Servicios: ${policy.totalServicios || 0}

Selecciona el campo a editar:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '⭐ Calificación',
                        `admin_edit_field:calificacion:${policyId}`
                    ),
                    Markup.button.callback('📊 Estado', `admin_edit_field:estado:${policyId}`)
                ],
                [
                    Markup.button.callback(
                        '🔢 Total Servicios',
                        `admin_edit_field:totalServicios:${policyId}`
                    )
                ],
                [Markup.button.callback('⬅️ Volver', `admin_policy_edit_categories:${policyId}`)]
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

    static async startFieldEdit(ctx: Context, fieldName: string, policyId: string): Promise<void> {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const currentValue = (policy as any)[fieldName];
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
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'policy_field_editing', {
                policyId: policyId,
                fieldName,
                currentValue,
                fieldInfo
            });

            await AuditLogger.log(ctx, 'field_edit_started', {
                module: 'policy',
                metadata: {
                    policyId,
                    fieldName,
                    currentValue
                }
            });
        } catch (error) {
            logger.error('Error al iniciar edición de campo:', error);
            await ctx.reply('❌ Error al iniciar la edición.');
        }
    }

    static async executeFieldChange(
        ctx: Context,
        policyId: string,
        fieldName: string
    ): Promise<void> {
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

            if (!adminState || adminState.operation !== 'policy_field_confirmation') {
                await ctx.reply('❌ Error: No se encontró la confirmación pendiente.');
                return;
            }

            const { oldValue, newValue, fieldInfo } = adminState.data;

            // Actualizar en la base de datos
            const updateData: any = {};
            updateData[fieldName] = newValue;

            const updatedPolicy = await Policy.findByIdAndUpdate(policyId, updateData, {
                new: true,
                runValidators: true
            });

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
                    Markup.button.callback(
                        '✏️ Editar Otro Campo',
                        `admin_policy_edit_categories:${policyId}`
                    ),
                    Markup.button.callback('👁️ Ver Detalles', `admin_policy_select:${policyId}`)
                ]
            ]);

            await ctx.editMessageText(successText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Log de auditoría
            await AuditLogger.log(ctx, 'field_updated', {
                module: 'policy',
                entityType: 'policy',
                entityId: policyId,
                changes: {
                    before: { [fieldName]: oldValue },
                    after: { [fieldName]: newValue }
                },
                metadata: {
                    policyId,
                    policyNumber: updatedPolicy.numeroPoliza,
                    fieldName,
                    oldValue,
                    newValue
                }
            });

            // Limpiar estado
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
        } catch (error) {
            logger.error('Error al ejecutar cambio:', error);
            await ctx.reply('❌ Error al guardar el cambio en la base de datos.');
        }
    }

    static getFieldInfo(fieldName: string): any {
        const fieldInfoMap: { [key: string]: any } = {
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
                type: 'string'
            },
            // Vehículo
            marca: {
                displayName: 'Marca',
                instructions: 'Escribe la marca del vehículo',
                validation: 'Texto libre (ej: NISSAN, CHEVROLET)',
                type: 'string'
            },
            submarca: {
                displayName: 'Submarca',
                instructions: 'Escribe el modelo del vehículo',
                validation: 'Texto libre (ej: SENTRA, AVEO)',
                type: 'string'
            },
            año: {
                displayName: 'Año',
                instructions: 'Escribe el año del vehículo',
                validation: 'Formato: AAAA (4 dígitos)',
                type: 'string'
            },
            color: {
                displayName: 'Color',
                instructions: 'Escribe el color del vehículo',
                validation: 'Texto libre (ej: BLANCO, AZUL)',
                type: 'string'
            },
            serie: {
                displayName: 'Serie',
                instructions: 'Escribe el número de serie del vehículo',
                validation: 'Texto libre',
                type: 'string'
            },
            placas: {
                displayName: 'Placas',
                instructions: 'Escribe las placas del vehículo',
                validation: 'Formato: ABC1234 o similar',
                type: 'string'
            },
            // Póliza
            aseguradora: {
                displayName: 'Aseguradora',
                instructions: 'Escribe el nombre de la aseguradora',
                validation: 'Texto libre',
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
                instructions: 'Escribe la fecha de emisión',
                validation: 'Formato: DD/MM/AAAA',
                type: 'date'
            },
            estadoPoliza: {
                displayName: 'Estado de Póliza',
                instructions: 'Escribe el estado de la póliza',
                validation: 'Texto libre (ej: ACTIVA, VENCIDA)',
                type: 'string'
            },
            fechaFinCobertura: {
                displayName: 'Fecha Fin Cobertura',
                instructions: 'Escribe la fecha de fin de cobertura',
                validation: 'Formato: DD/MM/AAAA',
                type: 'date'
            },
            fechaFinGracia: {
                displayName: 'Fecha Fin Gracia',
                instructions: 'Escribe la fecha de fin del período de gracia',
                validation: 'Formato: DD/MM/AAAA',
                type: 'date'
            },
            // Financiero
            calificacion: {
                displayName: 'Calificación',
                instructions: 'Escribe la calificación (0-100)',
                validation: 'Número entre 0 y 100',
                type: 'number'
            },
            estado: {
                displayName: 'Estado del Sistema',
                instructions: 'Escribe el estado del sistema',
                validation: 'Texto libre (ej: ACTIVO, INACTIVO)',
                type: 'string'
            },
            totalServicios: {
                displayName: 'Total de Servicios',
                instructions: 'Escribe el total de servicios',
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

    static async handleFieldEditInput(ctx: Context, newValue: string): Promise<void> {
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

            if (!adminState?.data) {
                await ctx.reply('❌ Error: Sesión expirada. Intenta nuevamente.');
                return;
            }

            const { policyId, fieldName, currentValue, fieldInfo } = adminState.data;

            // Validar el nuevo valor según el tipo de campo
            let validatedValue: any = newValue.trim();

            if (fieldInfo.type === 'date') {
                // Validar formato de fecha DD/MM/AAAA
                const dateMatch = newValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!dateMatch) {
                    await ctx.reply('❌ Error: Formato de fecha inválido. Usa DD/MM/AAAA.');
                    return;
                }
                const [, day, month, year] = dateMatch;
                validatedValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else if (fieldInfo.type === 'number') {
                validatedValue = parseFloat(newValue);
                if (isNaN(validatedValue)) {
                    await ctx.reply('❌ Error: El valor debe ser un número válido.');
                    return;
                }
            } else if (fieldInfo.type === 'rfc') {
                if (newValue.length !== 13) {
                    await ctx.reply('❌ Error: El RFC debe tener exactamente 13 caracteres.');
                    return;
                }
                validatedValue = newValue.toUpperCase();
            } else if (fieldInfo.type === 'phone') {
                const cleanPhone = newValue.replace(/\D/g, '');
                if (cleanPhone.length !== 10) {
                    await ctx.reply('❌ Error: El teléfono debe tener exactamente 10 dígitos.');
                    return;
                }
                validatedValue = cleanPhone;
            } else if (fieldInfo.type === 'email') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(newValue)) {
                    await ctx.reply('❌ Error: El formato del email es inválido.');
                    return;
                }
                validatedValue = newValue.toLowerCase();
            }

            // Mostrar confirmación
            const confirmText = `
🔄 *CONFIRMAR CAMBIO*
━━━━━━━━━━━━━━━━━━━━━━

**Campo:** ${fieldInfo.displayName}
**Valor anterior:** ${currentValue || 'No definido'}
**Valor nuevo:** ${validatedValue}

¿Confirmas este cambio?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Confirmar', `admin_confirm_edit:${policyId}:${fieldName}`),
                    Markup.button.callback('❌ Cancelar', `admin_policy_edit_categories:${policyId}`)
                ]
            ]);

            await ctx.reply(confirmText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            // Actualizar estado para confirmación
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'policy_field_confirmation', {
                policyId,
                fieldName,
                oldValue: currentValue,
                newValue: validatedValue,
                fieldInfo
            });

        } catch (error) {
            logger.error('Error al procesar entrada de campo:', error);
            await ctx.reply('❌ Error al procesar el valor. Intenta nuevamente.');
        }
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
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);
            
            if (!adminState) {
                return false; // No hay estado admin activo
            }

            const messageText = (ctx.message as any).text.trim();
            
            // Verificar si estamos en búsqueda unificada (NUEVO FLUJO)
            if (adminState.operation === 'policy_unified_search') {
                await this.handleUnifiedPolicySearchResults(ctx, messageText);
                return true; // Mensaje procesado
            }

            // Verificar si estamos en búsqueda de póliza para editar (LEGACY)
            if (adminState.operation === 'policy_search_for_edit') {
                await this.handlePolicySearch(ctx, messageText);
                return true; // Mensaje procesado
            }

            // Verificar si estamos en búsqueda de póliza para eliminar
            if (adminState.operation === 'policy_search_for_delete') {
                await this.searchPolicyForDelete(ctx, messageText);
                return true; // Mensaje procesado
            }

            // Verificar si estamos en búsqueda de póliza para restaurar
            if (adminState.operation === 'policy_search_for_restore') {
                await this.searchPolicyForRestore(ctx, messageText);
                return true; // Mensaje procesado
            }

            // Verificar si estamos editando un campo de póliza
            if (adminState.operation === 'policy_field_editing') {
                await this.handleFieldEditInput(ctx, messageText);
                return true; // Mensaje procesado
            }

            // Verificar si estamos esperando el motivo de eliminación
            if (adminState.operation === 'policy_deletion_reason') {
                if (messageText.length < 3) {
                    await ctx.reply('❌ El motivo debe tener al menos 3 caracteres.');
                    return true;
                }
                await this.handleDeletionReason(ctx, messageText);
                return true; // Mensaje procesado
            }

            return false; // Estado no reconocido
        } catch (error) {
            logger.error('Error en handleTextMessage de PolicyHandler:', error);
            await ctx.reply('❌ Error al procesar la búsqueda. Intenta nuevamente.');
            return false;
        }
    }

    static async searchPolicyForDelete(ctx: Context, searchTerm: string): Promise<void> {
        try {
            const searchResults = await this.searchPolicies(searchTerm);

            if (searchResults.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS PARA ELIMINAR*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas con: "${searchTerm}"

_Intenta con otro término de búsqueda._
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_delete')],
                    [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                ]);

                await ctx.editMessageText(noResultsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                return;
            }

            await this.showSearchResultsForDelete(ctx, searchResults, searchTerm);
        } catch (error) {
            logger.error('Error en searchPolicyForDelete:', error);
            await ctx.reply('❌ Error al buscar pólizas para eliminar.');
        }
    }

    static async searchPolicyForRestore(ctx: Context, searchTerm: string): Promise<void> {
        try {
            // Buscar solo pólizas eliminadas
            const searchResults = await this.searchPolicies(searchTerm, true); // true = solo eliminadas

            if (searchResults.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS PARA RESTAURAR*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron pólizas eliminadas con: "${searchTerm}"

_Intenta con otro término de búsqueda._
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_policy_restore')],
                    [Markup.button.callback('⬅️ Volver', 'admin_policy_menu')]
                ]);

                await ctx.editMessageText(noResultsText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                return;
            }

            await this.showSearchResultsForRestore(ctx, searchResults, searchTerm);
        } catch (error) {
            logger.error('Error en searchPolicyForRestore:', error);
            await ctx.reply('❌ Error al buscar pólizas para restaurar.');
        }
    }

    static async handlePolicyDelete(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'policy_search_for_delete'
            );

            const searchText = `
🗑️ *BUSCAR PÓLIZA PARA ELIMINAR*
━━━━━━━━━━━━━━━━━━━━━━

Escribe uno de los siguientes datos para buscar:

📝 *Número de póliza* - Ejemplo: ABC123456
👤 *Nombre del titular* - Ejemplo: Juan Pérez
🆔 *RFC* - Ejemplo: JURP850101XXX

⚠️ *ADVERTENCIA: Esta acción eliminará la póliza permanentemente.*
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
                metadata: { operation: 'search_for_delete' }
            });
        } catch (error) {
            logger.error('Error al iniciar búsqueda de póliza para eliminar:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }

    static async handlePolicyRestore(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'policy_search_for_restore'
            );

            const searchText = `
♻️ *BUSCAR PÓLIZA PARA RESTAURAR*
━━━━━━━━━━━━━━━━━━━━━━

Escribe uno de los siguientes datos para buscar:

📝 *Número de póliza* - Ejemplo: ABC123456
👤 *Nombre del titular* - Ejemplo: Juan Pérez
🆔 *RFC* - Ejemplo: JURP850101XXX

ℹ️ *Solo se mostrarán pólizas que hayan sido eliminadas.*
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
                metadata: { operation: 'search_for_restore' }
            });
        } catch (error) {
            logger.error('Error al iniciar búsqueda de póliza para restaurar:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }

    static async handleStats(ctx: Context): Promise<void> {
        // TODO: Implement stats handling
        await ctx.reply('Manejo de estadísticas en desarrollo');
    }

    static async showSearchResultsForDelete(ctx: Context, results: IPolicySearchResult[], searchTerm: string): Promise<void> {
        // Basic implementation - can be enhanced later
        await this.showSearchResults(ctx, results, searchTerm);
    }

    static async showSearchResultsForRestore(ctx: Context, results: IPolicySearchResult[], searchTerm: string): Promise<void> {
        // Basic implementation - can be enhanced later  
        await this.showSearchResults(ctx, results, searchTerm);
    }
}

export default PolicyHandler;
