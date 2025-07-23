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
                    policyId: policy._id.toString(),
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
                    policyId: policy._id.toString(),
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
            const tipoEmoji = result.type === 'servicio' ? '🔧' : '📋';
            const tipoTexto = result.type === 'servicio' ? 'SERVICIO' : 'REGISTRO';
            const fecha =
                result.type === 'servicio'
                    ? (item as IServiceData).fechaServicio
                    : (item as IRegistroData).fechaRegistro;

            resultText += `${index + 1}. ${tipoEmoji} **${tipoTexto}** - **${expediente}**\n`;
            resultText += `   Póliza: ${result.numeroPoliza}\n`;
            resultText += `   Titular: ${result.titular}\n`;
            resultText += `   Fecha: ${fecha ? new Date(fecha).toLocaleDateString('es-ES') : 'N/A'}\n\n`;

            const shortId = result.policyId.slice(-8);
            const typeCode = result.type === 'servicio' ? 's' : 'r';
            buttons.push([
                Markup.button.callback(
                    `${index + 1}. ${tipoEmoji} ${tipoTexto} - ${expediente}`,
                    `ase:${shortId}:${typeCode}:${result.itemIndex}`
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

        const escapedTitular = result.titular.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        const escapedPoliza = result.numeroPoliza.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        const escapedExpediente = expediente.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

        let detailsText = `
${tipo.split(' ')[0]} *EDITAR ${tipo.split(' ')[1].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 *Expediente:* ${escapedExpediente}
📅 *Póliza:* ${escapedPoliza}
👤 *Titular:* ${escapedTitular}

*DETALLES ACTUALES:*
`;

        if (isServicio) {
            const servicio = item as IServiceData;
            const fecha = servicio.fechaServicio
                ? new Date(servicio.fechaServicio).toLocaleDateString('es-ES')
                : 'N/A';
            const tipoServ = servicio.tipoServicio || 'N/A';
            const desc = servicio.descripcion || 'N/A';
            const costo = servicio.costo || 0;
            const estado = servicio.estado || 'N/A';
            const proveedor = servicio.proveedor || 'N/A';

            detailsText += `• Fecha: ${fecha}\n`;
            detailsText += `• Tipo: ${tipoServ}\n`;
            detailsText += `• Descripción: ${desc}\n`;
            detailsText += `• Costo: $${costo}\n`;
            detailsText += `• Estado: ${estado}\n`;
            detailsText += `• Proveedor: ${proveedor}\n`;
        } else {
            const registro = item as IRegistroData;
            const fecha = registro.fechaRegistro
                ? new Date(registro.fechaRegistro).toLocaleDateString('es-ES')
                : 'N/A';
            const tipoReg = registro.tipoRegistro || 'N/A';
            const desc = registro.descripcion || 'N/A';
            const estado = registro.estado || 'N/A';

            detailsText += `• Fecha: ${fecha}\n`;
            detailsText += `• Tipo: ${tipoReg}\n`;
            detailsText += `• Descripción: ${desc}\n`;
            detailsText += `• Estado: ${estado}\n`;
        }

        detailsText += '\n¿Qué deseas editar?';

        const buttons: any[] = [];

        // Create short ID for callback data
        const shortId = result.policyId.slice(-8); // Use last 8 characters

        if (isServicio) {
            buttons.push(
                [Markup.button.callback('📅 Fecha', `asf:${shortId}:s:${result.itemIndex}:fS`)],
                [Markup.button.callback('🏷️ Tipo', `asf:${shortId}:s:${result.itemIndex}:tS`)],
                [
                    Markup.button.callback(
                        '📝 Descripción',
                        `asf:${shortId}:s:${result.itemIndex}:d`
                    )
                ],
                [Markup.button.callback('💰 Costo', `asf:${shortId}:s:${result.itemIndex}:c`)],
                [Markup.button.callback('📊 Estado', `asf:${shortId}:s:${result.itemIndex}:e`)],
                [Markup.button.callback('🏢 Proveedor', `asf:${shortId}:s:${result.itemIndex}:p`)]
            );
        } else {
            buttons.push(
                [Markup.button.callback('📅 Fecha', `asf:${shortId}:r:${result.itemIndex}:fR`)],
                [Markup.button.callback('🏷️ Tipo', `asf:${shortId}:r:${result.itemIndex}:tR`)],
                [
                    Markup.button.callback(
                        '📝 Descripción',
                        `asf:${shortId}:r:${result.itemIndex}:d`
                    )
                ],
                [Markup.button.callback('📊 Estado', `asf:${shortId}:r:${result.itemIndex}:e`)]
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
        policyId: string,
        type: string,
        itemIndex: number
    ): Promise<void> {
        try {
            // Find the policy
            const policy = await Policy.findById(policyId);
            if (!policy) {
                await ctx.answerCbQuery('❌ Póliza no encontrada', { show_alert: true });
                return;
            }

            let item: IServiceData | IRegistroData | undefined;
            if (type === 'servicio') {
                item = policy.servicios?.[itemIndex];
            } else {
                item = policy.registros?.[itemIndex];
            }

            if (!item) {
                await ctx.answerCbQuery('❌ Elemento no encontrado', { show_alert: true });
                return;
            }

            const result: IServiceSearchResult = {
                policyId: policy._id.toString(),
                numeroPoliza: policy.numeroPoliza,
                titular: policy.titular,
                type: type as 'servicio' | 'registro',
                item,
                itemIndex
            };

            await this.showServiceDirectEdit(ctx, result);
        } catch (error) {
            logger.error('Error en showServiceDirectEditShort:', error);
            await ctx.answerCbQuery('❌ Error al cargar la edición', { show_alert: true });
        }
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

            const shortId = policyId.slice(-8);
            const typeCode = type === 'servicio' ? 's' : 'r';
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', `ase:${shortId}:${typeCode}:${itemIndex}`)]
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

    static async handleServiceDirectEditShort(
        ctx: Context,
        shortId: string,
        type: string,
        itemIndex: number
    ): Promise<void> {
        try {
            // Find all policies and filter by shortId using JavaScript
            const policies = await Policy.find({
                estado: { $ne: 'ELIMINADO' }
            }).select('_id numeroPoliza titular servicios registros');

            const policy = policies.find(p => p._id.toString().slice(-8) === shortId);

            if (!policy) {
                await ctx.answerCbQuery('❌ Póliza no encontrada', { show_alert: true });
                return;
            }

            await this.showServiceDirectEditShort(ctx, policy._id.toString(), type, itemIndex);
        } catch (error) {
            logger.error('Error en handleServiceDirectEditShort:', error);
            await ctx.answerCbQuery('❌ Error al cargar la edición', { show_alert: true });
        }
    }

    static async handleServiceFieldEditShort(
        ctx: Context,
        shortId: string,
        type: string,
        itemIndex: number,
        fieldName: string
    ): Promise<void> {
        try {
            // Find all policies and filter by shortId using JavaScript
            const policies = await Policy.find({
                estado: { $ne: 'ELIMINADO' }
            }).select('_id numeroPoliza titular servicios registros');

            const policy = policies.find(p => p._id.toString().slice(-8) === shortId);

            if (!policy) {
                await ctx.answerCbQuery('❌ Póliza no encontrada', { show_alert: true });
                return;
            }

            await this.startFieldEdit(ctx, policy._id.toString(), type, itemIndex, fieldName);
        } catch (error) {
            logger.error('Error en handleServiceFieldEditShort:', error);
            await ctx.answerCbQuery('❌ Error al iniciar edición', { show_alert: true });
        }
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
