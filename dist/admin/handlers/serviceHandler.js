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
class ServiceHandler {
    static async handleAction(ctx, action) {
        try {
            switch (action) {
                case 'menu':
                    return await adminMenu_1.default.showServiceMenu(ctx);
                case 'edit':
                    return await this.handleEditService(ctx);
                default:
                    await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
            }
        }
        catch (error) {
            logger_1.default.error('Error en ServiceHandler:', error);
            await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
        }
    }
    static async handleEditService(ctx) {
        try {
            adminStates_1.default.clearAdminState(ctx.from.id, ctx.chat.id);
            adminStates_1.default.createAdminState(ctx.from.id, ctx.chat.id, 'service_search_for_edit');
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
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('❌ Cancelar', 'admin_service_menu')]
            ]);
            await ctx.editMessageText(searchText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
            await auditLogger_1.AuditLogger.log(ctx, 'service_search_initiated', {
                module: 'service',
                metadata: {
                    operation: 'search_for_edit'
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error al iniciar búsqueda de servicios:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }
    static async searchByExpediente(expediente) {
        const cleanTerm = expediente.trim();
        const searchQuery = {
            estado: { $ne: 'ELIMINADO' },
            $or: [
                { 'servicios.numeroExpediente': { $regex: `^${cleanTerm}$`, $options: 'i' } },
                { 'registros.numeroExpediente': { $regex: `^${cleanTerm}$`, $options: 'i' } }
            ]
        };
        const policies = await policy_1.default.find(searchQuery)
            .select('numeroPoliza titular rfc servicios registros estado')
            .sort({ fechaEmision: -1 })
            .limit(20);
        const results = [];
        policies.forEach(policy => {
            const serviciosMatched = policy.servicios?.filter(servicio => {
                const expedienteServicio = servicio.numeroExpediente?.trim();
                return expedienteServicio && expedienteServicio.toLowerCase() === cleanTerm.toLowerCase();
            }) || [];
            serviciosMatched.forEach(servicio => {
                const itemIndex = policy.servicios.findIndex(s => s.numeroExpediente === servicio.numeroExpediente);
                results.push({
                    policyId: policy._id,
                    numeroPoliza: policy.numeroPoliza,
                    titular: policy.titular,
                    type: 'servicio',
                    item: servicio,
                    itemIndex
                });
            });
            const registrosMatched = policy.registros?.filter(registro => {
                const expedienteRegistro = registro.numeroExpediente?.trim();
                return expedienteRegistro && expedienteRegistro.toLowerCase() === cleanTerm.toLowerCase();
            }) || [];
            registrosMatched.forEach(registro => {
                const itemIndex = policy.registros.findIndex(r => r.numeroExpediente === registro.numeroExpediente);
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
    static async handleServiceSearch(ctx, searchTerm) {
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
                const keyboard = telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit')],
                    [telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_service_menu')]
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
            if (results.length === 1) {
                await this.showServiceDirectEdit(ctx, results[0]);
            }
            else {
                await this.showServicesListResults(ctx, results);
            }
            await auditLogger_1.AuditLogger.log(ctx, 'service_search_completed', {
                module: 'service',
                metadata: {
                    searchTerm,
                    resultsCount: results.length
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error al buscar servicios:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }
    static async showServicesListResults(ctx, results) {
        let resultText = `
🔍 *SERVICIOS ENCONTRADOS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Encontrados: ${results.length} servicios/registros

Selecciona el que deseas editar:

`;
        const buttons = [];
        results.forEach((result, index) => {
            const item = result.item;
            const expediente = item.numeroExpediente;
            const tipo = result.type === 'servicio' ? '🔧' : '📋';
            const fecha = result.type === 'servicio'
                ? item.fechaServicio
                : item.fechaRegistro;
            resultText += `${index + 1}. ${tipo} **${expediente}**\n`;
            resultText += `   Póliza: ${result.numeroPoliza}\n`;
            resultText += `   Titular: ${result.titular}\n`;
            resultText += `   Fecha: ${fecha ? new Date(fecha).toLocaleDateString('es-ES') : 'N/A'}\n\n`;
            buttons.push([
                telegraf_1.Markup.button.callback(`${index + 1}. ${tipo} ${expediente}`, `admin_service_edit_direct:${result.policyId}:${result.type}:${result.itemIndex}`)
            ]);
        });
        buttons.push([
            telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_service_menu')
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
    }
    static async showServiceDirectEdit(ctx, result) {
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
            const servicio = item;
            detailsText += `• Fecha: ${servicio.fechaServicio ? new Date(servicio.fechaServicio).toLocaleDateString('es-ES') : 'N/A'}\n`;
            detailsText += `• Tipo: ${servicio.tipoServicio || 'N/A'}\n`;
            detailsText += `• Descripción: ${servicio.descripcion || 'N/A'}\n`;
            detailsText += `• Costo: $${servicio.costo || 0}\n`;
            detailsText += `• Estado: ${servicio.estado || 'N/A'}\n`;
            detailsText += `• Proveedor: ${servicio.proveedor || 'N/A'}\n`;
        }
        else {
            const registro = item;
            detailsText += `• Fecha: ${registro.fechaRegistro ? new Date(registro.fechaRegistro).toLocaleDateString('es-ES') : 'N/A'}\n`;
            detailsText += `• Tipo: ${registro.tipoRegistro || 'N/A'}\n`;
            detailsText += `• Descripción: ${registro.descripcion || 'N/A'}\n`;
            detailsText += `• Estado: ${registro.estado || 'N/A'}\n`;
        }
        detailsText += '\n¿Qué deseas editar?';
        const buttons = [];
        if (isServicio) {
            buttons.push([telegraf_1.Markup.button.callback('📅 Fecha', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:fechaServicio`)], [telegraf_1.Markup.button.callback('🏷️ Tipo', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:tipoServicio`)], [telegraf_1.Markup.button.callback('📝 Descripción', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:descripcion`)], [telegraf_1.Markup.button.callback('💰 Costo', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:costo`)], [telegraf_1.Markup.button.callback('📊 Estado', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:estado`)], [telegraf_1.Markup.button.callback('🏢 Proveedor', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:proveedor`)]);
        }
        else {
            buttons.push([telegraf_1.Markup.button.callback('📅 Fecha', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:fechaRegistro`)], [telegraf_1.Markup.button.callback('🏷️ Tipo', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:tipoRegistro`)], [telegraf_1.Markup.button.callback('📝 Descripción', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:descripcion`)], [telegraf_1.Markup.button.callback('📊 Estado', `admin_service_edit_field:${result.policyId}:${result.type}:${result.itemIndex}:estado`)]);
        }
        buttons.push([
            telegraf_1.Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_service_menu')
        ]);
        const keyboard = telegraf_1.Markup.inlineKeyboard(buttons);
        try {
            await ctx.editMessageText(detailsText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
        catch (error) {
            await ctx.reply(detailsText.trim(), {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }
    static async handlePolicySelection(ctx, policyId) {
        await ctx.reply('Selección de póliza para servicios en desarrollo.');
    }
    static async showServicesList(ctx, policyId) {
        await ctx.reply('Lista de servicios en desarrollo.');
    }
    static async showServiceEditMenu(ctx, policyId, serviceIndex) {
        await ctx.reply('Menú de edición de servicio en desarrollo.');
    }
    static async showServiceDirectEditShort(ctx, shortId, type, itemIndex) {
        await ctx.reply('Edición directa de servicio en desarrollo.');
    }
    static async startFieldEdit(ctx, policyId, type, itemIndex, fieldName) {
        try {
            adminStates_1.default.clearAdminState(ctx.from.id, ctx.chat.id);
            adminStates_1.default.createAdminState(ctx.from.id, ctx.chat.id, 'service_field_edit', {
                policyId,
                type,
                itemIndex,
                fieldName
            });
            const fieldDisplayNames = {
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
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('❌ Cancelar', `admin_service_edit_direct:${policyId}:${type}:${itemIndex}`)]
            ]);
            await ctx.editMessageText(editText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
            await auditLogger_1.AuditLogger.log(ctx, 'service_field_edit_started', {
                module: 'service',
                metadata: {
                    policyId,
                    type,
                    itemIndex,
                    fieldName
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error al iniciar edición de campo:', error);
            await ctx.reply('❌ Error al iniciar la edición. Intenta nuevamente.');
        }
    }
    static async handleFieldValueShort(ctx, shortId, type, itemIndex, fieldName, value) {
        await ctx.reply('Manejo de valor de campo en desarrollo.');
    }
    static async handleTextMessage(ctx) {
        try {
            const adminState = adminStates_1.default.getAdminState(ctx.from.id, ctx.chat.id);
            if (!adminState) {
                return false;
            }
            const messageText = ctx.message?.text?.trim();
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
        }
        catch (error) {
            logger_1.default.error('Error en handleTextMessage de ServiceHandler:', error);
            return false;
        }
    }
    static async handleFieldEdit(ctx, value) {
        try {
            const adminState = adminStates_1.default.getAdminState(ctx.from.id, ctx.chat.id);
            if (!adminState || !adminState.data) {
                await ctx.reply('❌ Error: Sesión expirada. Intenta nuevamente.');
                return;
            }
            const { policyId, type, itemIndex, fieldName } = adminState.data;
            const policy = await policy_1.default.findById(policyId);
            if (!policy) {
                await ctx.reply('❌ Error: Póliza no encontrada.');
                return;
            }
            let convertedValue = value;
            if (fieldName.includes('fecha')) {
                const dateMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (dateMatch) {
                    const [, day, month, year] = dateMatch;
                    convertedValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                }
                else {
                    await ctx.reply('❌ Error: Formato de fecha inválido. Usa DD/MM/AAAA.');
                    return;
                }
            }
            else if (fieldName === 'costo') {
                convertedValue = parseFloat(value);
                if (isNaN(convertedValue)) {
                    await ctx.reply('❌ Error: El costo debe ser un número válido.');
                    return;
                }
            }
            if (type === 'servicio') {
                if (policy.servicios && policy.servicios[itemIndex]) {
                    policy.servicios[itemIndex][fieldName] = convertedValue;
                }
            }
            else {
                if (policy.registros && policy.registros[itemIndex]) {
                    policy.registros[itemIndex][fieldName] = convertedValue;
                }
            }
            await policy.save();
            adminStates_1.default.clearAdminState(ctx.from.id, ctx.chat.id);
            const fieldDisplayNames = {
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
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('🔍 Buscar Otro', 'admin_service_edit')],
                [telegraf_1.Markup.button.callback('⬅️ Menú Principal', 'admin_service_menu')]
            ]);
            await ctx.reply(successText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
            await auditLogger_1.AuditLogger.log(ctx, 'service_field_updated', {
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
        }
        catch (error) {
            logger_1.default.error('Error al actualizar campo:', error);
            await ctx.reply('❌ Error al actualizar el campo. Intenta nuevamente.');
        }
    }
}
exports.default = ServiceHandler;
