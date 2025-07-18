import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import Policy from '../../models/policy';
import adminStateManager from '../utils/adminStates';
import { AuditLogger } from '../utils/auditLogger';
import AdminMenu from '../menus/adminMenu';
import logger from '../../utils/logger';

interface IServiceData {
    numeroExpediente: string;
    fechaServicio: Date;
    tipoServicio: string;
    descripcion: string;
    costo: number;
    estado: string;
    proveedor: string;
    notas: string;
}

interface IRegistroData {
    numeroExpediente: string;
    fechaRegistro: Date;
    tipoRegistro: string;
    descripcion: string;
    estado: string;
    observaciones: string;
}

interface IPolicyWithServices {
    _id: string;
    numeroPoliza: string;
    titular: string;
    rfc: string;
    servicios: IServiceData[];
    registros: IRegistroData[];
    estado: string;
}

interface IServiceSearchResult {
    policyId: string;
    numeroPoliza: string;
    titular: string;
    type: 'servicio' | 'registro';
    item: IServiceData | IRegistroData;
    itemIndex: number;
}

class ServiceHandler {
    static async handleAction(ctx: Context, action: string): Promise<void> {
        try {
            switch (action) {
                case 'menu':
                    return await AdminMenu.showServiceMenu(ctx);

                case 'edit':
                    return await this.handleEditService(ctx);

                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        } catch (error) {
            logger.error('Error en ServiceHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }

    static async handleEditService(ctx: Context): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(
                ctx.from!.id,
                ctx.chat!.id,
                'service_search_for_edit'
            );

            const searchText = `
🔍 *BUSCAR SERVICIO POR EXPEDIENTE*
━━━━━━━━━━━━━━━━━━━━━━

Escribe el **número de expediente** del servicio:

📄 *Ejemplo:* 1043992
📄 *Ejemplo:* EXP-2025-001
📄 *Ejemplo:* SRV123456

💡 **Nota:** Búsqueda directa en servicios y registros
🔍 **Alcance:** Hasta 12 expedientes por póliza

_El sistema encontrará el servicio específico para editar._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'admin_service_menu')]
            ]);

            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'service_search_initiated', {
                module: 'service',
                metadata: {
                    operation: 'search_for_edit'
                }
            });
        } catch (error) {
            logger.error('Error al iniciar búsqueda de servicios:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }

    static async searchByExpediente(expediente: string): Promise<IServiceSearchResult[]> {
        const cleanTerm = expediente.trim();

        const searchQuery = {
            estado: { $ne: 'ELIMINADO' },
            $or: [
                { 'servicios.numeroExpediente': { $regex: `^${cleanTerm}$`, $options: 'i' } },
                { 'registros.numeroExpediente': { $regex: `^${cleanTerm}$`, $options: 'i' } }
            ]
        };

        const policies = (await Policy.find(searchQuery)
            .select('numeroPoliza titular rfc servicios registros estado')
            .sort({ fechaEmision: -1 })
            .limit(20)) as unknown as IPolicyWithServices[];

        const results: IServiceSearchResult[] = [];

        policies.forEach(policy => {
            const serviciosMatched =
                policy.servicios?.filter(servicio => {
                    const expedienteServicio = servicio.numeroExpediente?.trim();
                    return (
                        expedienteServicio &&
                        expedienteServicio.toLowerCase() === cleanTerm.toLowerCase()
                    );
                }) || [];

            serviciosMatched.forEach(servicio => {
                const itemIndex = policy.servicios.findIndex(
                    s => s.numeroExpediente === servicio.numeroExpediente
                );
                results.push({
                    policyId: policy._id,
                    numeroPoliza: policy.numeroPoliza,
                    titular: policy.titular,
                    type: 'servicio',
                    item: servicio,
                    itemIndex
                });
            });

            const registrosMatched =
                policy.registros?.filter(registro => {
                    const expedienteRegistro = registro.numeroExpediente?.trim();
                    return (
                        expedienteRegistro &&
                        expedienteRegistro.toLowerCase() === cleanTerm.toLowerCase()
                    );
                }) || [];

            registrosMatched.forEach(registro => {
                const itemIndex = policy.registros.findIndex(
                    r => r.numeroExpediente === registro.numeroExpediente
                );
                results.push({
                    policyId: policy._id,
                    numeroPoliza: policy.numeroPoliza,
                    titular: policy.titular,
                    type: 'registro',
                    item: registro,
                    itemIndex
                });
            });
        });

        return results;
    }

    static async handleServiceSearch(ctx: Context, searchTerm: string): Promise<void> {
        try {
            const results = await this.searchByExpediente(searchTerm);

            if (results.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron servicios con expediente: "${searchTerm}"

Verifica que:
• El número de expediente sea correcto
• Esté escrito exactamente como aparece
• No tenga espacios adicionales

_Intenta con otro número de expediente._
                `.trim();

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit')],
                    [Markup.button.callback('⬅️ Volver', 'admin_service_menu')]
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

            if (results.length === 1) {
                await this.showServiceDirectEdit(ctx, results[0]);
            } else {
                await this.showServicesListResults(ctx, results);
            }

            await AuditLogger.log(ctx, 'service_search_completed', {
                module: 'service',
                metadata: {
                    searchTerm,
                    resultsCount: results.length
                }
            });
        } catch (error) {
            logger.error('Error al buscar servicios:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }

    static async showServicesListResults(
        ctx: Context,
        results: IServiceSearchResult[]
    ): Promise<void> {
        let resultText = `
🔍 *SERVICIOS ENCONTRADOS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Encontrados: ${results.length} servicios/registros

Selecciona el que deseas editar:

`;

        const buttons: any[] = [];
        results.forEach((result, index) => {
            const item = result.item;
            const expediente = item.numeroExpediente;
            const tipo = result.type === 'servicio' ? '🔧' : '📋';
            const fecha =
                result.type === 'servicio'
                    ? (item as IServiceData).fechaServicio
                    : (item as IRegistroData).fechaRegistro;

            resultText += `${index + 1}. ${tipo} **${expediente}**\n`;
            resultText += `   Póliza: ${result.numeroPoliza}\n`;
            resultText += `   Titular: ${result.titular}\n`;
            resultText += `   Fecha: ${fecha ? new Date(fecha).toLocaleDateString('es-ES') : 'N/A'}\n\n`;

            buttons.push([
                Markup.button.callback(
                    `${index + 1}. ${tipo} ${expediente}`,
                    `admin_service_edit_direct:${result.policyId}:${result.type}:${result.itemIndex}`
                )
            ]);
        });

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_service_menu')
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
    }

    static async showServiceDirectEdit(ctx: Context, result: IServiceSearchResult): Promise<void> {
        const item = result.item;
        const isServicio = result.type === 'servicio';
        const expediente = item.numeroExpediente;
        const tipo = isServicio ? '🔧 Servicio' : '📋 Registro';

        let detailsText = `
${tipo.split(' ')[0]} *EDITAR ${tipo.split(' ')[1].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 **Expediente:** ${expediente}
📅 **Póliza:** ${result.numeroPoliza}
👤 **Titular:** ${result.titular}

**DETALLES ACTUALES:**
`;

        if (isServicio) {
            const servicio = item as IServiceData;
            detailsText += `• Fecha: ${servicio.fechaServicio ? new Date(servicio.fechaServicio).toLocaleDateString('es-ES') : 'N/A'}\n`;
            detailsText += `• Tipo: ${servicio.tipoServicio || 'N/A'}\n`;
            detailsText += `• Descripción: ${servicio.descripcion || 'N/A'}\n`;
            detailsText += `• Costo: $${servicio.costo || 0}\n`;
            detailsText += `• Estado: ${servicio.estado || 'N/A'}\n`;
            detailsText += `• Proveedor: ${servicio.proveedor || 'N/A'}\n`;
        } else {
            const registro = item as IRegistroData;
            detailsText += `• Fecha: ${registro.fechaRegistro ? new Date(registro.fechaRegistro).toLocaleDateString('es-ES') : 'N/A'}\n`;
            detailsText += `• Tipo: ${registro.tipoRegistro || 'N/A'}\n`;
            detailsText += `• Descripción: ${registro.descripcion || 'N/A'}\n`;
            detailsText += `• Estado: ${registro.estado || 'N/A'}\n`;
        }

        detailsText += '\n¿Qué deseas editar?';

        const buttons: any[] = [];

        if (isServicio) {
            buttons.push(
                [
                    Markup.button.callback(
                        '📅 Fecha',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:fechaServicio`
                    )
                ],
                [
                    Markup.button.callback(
                        '🏷️ Tipo',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:tipoServicio`
                    )
                ],
                [
                    Markup.button.callback(
                        '📝 Descripción',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:descripcion`
                    )
                ],
                [
                    Markup.button.callback(
                        '💰 Costo',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:costo`
                    )
                ],
                [
                    Markup.button.callback(
                        '📊 Estado',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:estado`
                    )
                ],
                [
                    Markup.button.callback(
                        '🏢 Proveedor',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:proveedor`
                    )
                ]
            );
        } else {
            buttons.push(
                [
                    Markup.button.callback(
                        '📅 Fecha',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:fechaRegistro`
                    )
                ],
                [
                    Markup.button.callback(
                        '🏷️ Tipo',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:tipoRegistro`
                    )
                ],
                [
                    Markup.button.callback(
                        '📝 Descripción',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:descripcion`
                    )
                ],
                [
                    Markup.button.callback(
                        '📊 Estado',
                        `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:estado`
                    )
                ]
            );
        }

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_service_menu')
        ]);

        const keyboard = Markup.inlineKeyboard(buttons);

        try {
            await ctx.editMessageText(detailsText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            await ctx.reply(detailsText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }

    // Interface compatibility methods
    static async handlePolicySelection(ctx: Context, policyId: string): Promise<void> {
        await ctx.reply('Selección de póliza para servicios en desarrollo.');
    }

    static async showServicesList(ctx: Context, policyId: string): Promise<void> {
        await ctx.reply('Lista de servicios en desarrollo.');
    }

    static async showServiceEditMenu(
        ctx: Context,
        policyId: string,
        serviceIndex: string
    ): Promise<void> {
        await ctx.reply('Menú de edición de servicio en desarrollo.');
    }

    static async showServiceDirectEditShort(
        ctx: Context,
        shortId: string,
        type: string,
        itemIndex: number
    ): Promise<void> {
        await ctx.reply('Edición directa de servicio en desarrollo.');
    }

    static async startFieldEdit(
        ctx: Context,
        policyId: string,
        type: string,
        itemIndex: number,
        fieldName: string
    ): Promise<void> {
        try {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'service_field_edit', {
                policyId,
                type,
                itemIndex,
                fieldName
            });

            const fieldDisplayNames: { [key: string]: string } = {
                fechaServicio: 'Fecha de Servicio',
                tipoServicio: 'Tipo de Servicio',
                descripcion: 'Descripción',
                costo: 'Costo',
                estado: 'Estado',
                proveedor: 'Proveedor',
                fechaRegistro: 'Fecha de Registro',
                tipoRegistro: 'Tipo de Registro'
            };

            const fieldDisplayName = fieldDisplayNames[fieldName] || fieldName;
            const typeDisplayName = type === 'servicio' ? 'Servicio' : 'Registro';

            const editText = `
✏️ *EDITAR ${typeDisplayName.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 **Campo a editar:** ${fieldDisplayName}

Escribe el nuevo valor para este campo:

💡 **Sugerencias:**
• Para fechas: DD/MM/AAAA
• Para costos: solo números (sin $)
• Para descripciones: texto libre
• Para estados: ACTIVO, COMPLETADO, PENDIENTE, etc.

_Escribe el nuevo valor y se actualizará automáticamente._
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '❌ Cancelar',
                        `admin_service_edit_direct:${policyId}:${type}:${itemIndex}`
                    )
                ]
            ]);

            await ctx.editMessageText(editText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'service_field_edit_started', {
                module: 'service',
                metadata: {
                    policyId,
                    type,
                    itemIndex,
                    fieldName
                }
            });
        } catch (error) {
            logger.error('Error al iniciar edición de campo:', error);
            await ctx.reply('❌ Error al iniciar la edición. Intenta nuevamente.');
        }
    }

    static async handleFieldValueShort(
        ctx: Context,
        shortId: string,
        type: string,
        itemIndex: number,
        fieldName: string,
        value: string
    ): Promise<void> {
        await ctx.reply('Manejo de valor de campo en desarrollo.');
    }

    static async handleTextMessage(ctx: Context): Promise<boolean> {
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

            if (!adminState) {
                return false;
            }

            const messageText = (ctx.message as any)?.text?.trim();
            if (!messageText) {
                return false;
            }

            switch (adminState.operation) {
                case 'service_search_for_edit':
                    await this.handleServiceSearch(ctx, messageText);
                    return true;

                case 'service_field_edit':
                    await this.handleFieldEdit(ctx, messageText);
                    return true;

                default:
                    return false;
            }
        } catch (error) {
            logger.error('Error en handleTextMessage de ServiceHandler:', error);
            return false;
        }
    }

    static async handleFieldEdit(ctx: Context, value: string): Promise<void> {
        try {
            const adminState = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

            if (!adminState?.data) {
                await ctx.reply('❌ Error: Sesión expirada. Intenta nuevamente.');
                return;
            }

            const { policyId, type, itemIndex, fieldName } = adminState.data;

            // Find the policy
            const policy = await Policy.findById(policyId);
            if (!policy) {
                await ctx.reply('❌ Error: Póliza no encontrada.');
                return;
            }

            // Validate and convert value based on field type
            let convertedValue: any = value;
            if (fieldName.includes('fecha')) {
                // Try to parse date
                const dateMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (dateMatch) {
                    const [, day, month, year] = dateMatch;
                    convertedValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else {
                    await ctx.reply('❌ Error: Formato de fecha inválido. Usa DD/MM/AAAA.');
                    return;
                }
            } else if (fieldName === 'costo') {
                convertedValue = parseFloat(value);
                if (isNaN(convertedValue)) {
                    await ctx.reply('❌ Error: El costo debe ser un número válido.');
                    return;
                }
            }

            // Update the field
            if (type === 'servicio') {
                if (policy.servicios?.[itemIndex]) {
                    policy.servicios[itemIndex][fieldName] = convertedValue;
                }
            } else {
                if (policy.registros?.[itemIndex]) {
                    policy.registros[itemIndex][fieldName] = convertedValue;
                }
            }

            await policy.save();

            // Clear admin state
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);

            const fieldDisplayNames: { [key: string]: string } = {
                fechaServicio: 'Fecha de Servicio',
                tipoServicio: 'Tipo de Servicio',
                descripcion: 'Descripción',
                costo: 'Costo',
                estado: 'Estado',
                proveedor: 'Proveedor',
                fechaRegistro: 'Fecha de Registro',
                tipoRegistro: 'Tipo de Registro'
            };

            const fieldDisplayName = fieldDisplayNames[fieldName] || fieldName;
            const typeDisplayName = type === 'servicio' ? 'Servicio' : 'Registro';

            const successText = `
✅ *CAMPO ACTUALIZADO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 **${typeDisplayName}:** ${policy.numeroPoliza}
✏️ **Campo:** ${fieldDisplayName}
🔄 **Nuevo valor:** ${value}

✅ El campo se ha actualizado correctamente.

¿Deseas realizar otra acción?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔍 Buscar Otro', 'admin_service_edit')],
                [Markup.button.callback('⬅️ Menú Principal', 'admin_service_menu')]
            ]);

            await ctx.reply(successText, {
                parse_mode: 'Markdown',
                ...keyboard
            });

            await AuditLogger.log(ctx, 'service_field_updated', {
                module: 'service',
                entityType: type,
                entityId: policyId,
                changes: {
                    before: { [fieldName]: 'valor anterior' },
                    after: { [fieldName]: convertedValue }
                },
                metadata: {
                    policyId,
                    type,
                    itemIndex,
                    fieldName,
                    newValue: convertedValue
                }
            });
        } catch (error) {
            logger.error('Error al actualizar campo:', error);
            await ctx.reply('❌ Error al actualizar el campo. Intenta nuevamente.');
        }
    }
}

export default ServiceHandler;
