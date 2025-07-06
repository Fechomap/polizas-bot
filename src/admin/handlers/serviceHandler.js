const { Markup } = require('telegraf');
const Policy = require('../../models/policy');
const AdminStateManager = require('../utils/adminStates');
const { AuditLogger } = require('../utils/auditLogger');
const AdminMenu = require('../menus/adminMenu');
const logger = require('../../utils/logger');

class ServiceHandler {
    /**
   * Maneja las acciones relacionadas con servicios
   */
    static async handleAction(ctx, action) {
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

    /**
     * Inicia el flujo de edición de servicios
     */
    static async handleEditService(ctx) {
        try {
            AdminStateManager.clearAdminState(ctx.from.id, ctx.chat.id);
            AdminStateManager.createAdminState(
                ctx.from.id,
                ctx.chat.id,
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

            await AuditLogger.log(ctx, 'service_search_initiated', 'service', {
                operation: 'search_for_edit'
            });

        } catch (error) {
            logger.error('Error al iniciar búsqueda de servicios:', error);
            await ctx.reply('❌ Error al iniciar la búsqueda. Intenta nuevamente.');
        }
    }


    /**
     * Busca servicios y registros por número de expediente EXACTO
     */
    static async searchByExpediente(expediente) {
        const cleanTerm = expediente.trim();

        // BÚSQUEDA EXACTA: usar coincidencia exacta case-insensitive
        const searchQuery = {
            estado: { $ne: 'ELIMINADO' },
            $or: [
                { 'servicios.numeroExpediente': { $regex: `^${cleanTerm}$`, $options: 'i' } },
                { 'registros.numeroExpediente': { $regex: `^${cleanTerm}$`, $options: 'i' } }
            ]
        };

        const policies = await Policy.find(searchQuery)
            .select('numeroPoliza titular rfc servicios registros estado')
            .sort({ fechaEmision: -1 })
            .limit(20);

        // Procesar resultados para encontrar servicios/registros con coincidencia EXACTA
        const results = [];

        policies.forEach(policy => {
            // Buscar en servicios - COINCIDENCIA EXACTA
            const serviciosMatched = policy.servicios?.filter(servicio => {
                const expedienteServicio = servicio.numeroExpediente?.trim();
                return expedienteServicio && expedienteServicio.toLowerCase() === cleanTerm.toLowerCase();
            }) || [];

            // Buscar en registros - COINCIDENCIA EXACTA
            const registrosMatched = policy.registros?.filter(registro => {
                const expedienteRegistro = registro.numeroExpediente?.trim();
                return expedienteRegistro && expedienteRegistro.toLowerCase() === cleanTerm.toLowerCase();
            }) || [];

            // Agregar resultados encontrados
            serviciosMatched.forEach((servicio, index) => {
                results.push({
                    policy,
                    type: 'servicio',
                    item: servicio,
                    itemIndex: policy.servicios.findIndex(s => s._id?.toString() === servicio._id?.toString()),
                    matchText: `Servicio #${servicio.numeroServicio || 'N/A'}`
                });
            });

            registrosMatched.forEach((registro, index) => {
                results.push({
                    policy,
                    type: 'registro',
                    item: registro,
                    itemIndex: policy.registros.findIndex(r => r._id?.toString() === registro._id?.toString()),
                    matchText: `Registro #${registro.numeroRegistro || 'N/A'}`
                });
            });
        });

        return results;
    }

    /**
     * Maneja la búsqueda de servicios por expediente
     */
    static async handleServiceSearch(ctx, expediente) {
        try {
            const searchResults = await this.searchByExpediente(expediente);

            if (searchResults.length === 0) {
                const noResultsText = `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron servicios/registros con expediente: "${expediente}"

Verifica que:
• El número de expediente sea correcto
• El expediente esté registrado en servicios o registros
• No tenga caracteres especiales

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

            if (searchResults.length === 1) {
                await this.showServiceDirectEdit(ctx, searchResults[0]);
            } else {
                await this.showExpedienteSearchResults(ctx, searchResults, expediente);
            }

            await AuditLogger.log(ctx, 'service_search_completed', 'service', {
                searchTerm: expediente,
                resultsCount: searchResults.length
            });

        } catch (error) {
            logger.error('Error al buscar servicios por expediente:', error);
            await ctx.reply('❌ Error en la búsqueda. Intenta nuevamente.');
        }
    }

    /**
     * Muestra resultados de búsqueda múltiple por expediente
     */
    static async showExpedienteSearchResults(ctx, results, expediente) {
        let resultText = `
🔍 *SERVICIOS ENCONTRADOS*
━━━━━━━━━━━━━━━━━━━━━━

Expediente: "${expediente}"
Encontrados: ${results.length} elementos

Selecciona el servicio/registro a editar:

`;

        const buttons = [];
        results.forEach((result, index) => {
            const { policy, type, item, matchText } = result;

            const formatDate = (date) => {
                if (!date) return 'Sin fecha';
                return new Date(date).toLocaleDateString('es-MX');
            };

            const fechaStr = type === 'servicio'
                ? formatDate(item.fechaServicio)
                : formatDate(item.fechaRegistro);

            const costoStr = item.costo ? `$${item.costo.toFixed(2)}` : 'Sin costo';
            const tipoIcon = type === 'servicio' ? '🚗' : '📋';

            resultText += `${index + 1}. ${tipoIcon} **${matchText}**\n`;
            resultText += `   🏢 Póliza: ${policy.numeroPoliza}\n`;
            resultText += `   👤 ${policy.titular}\n`;
            resultText += `   📅 ${fechaStr} | 💰 ${costoStr}\n`;
            resultText += `   📍 ${item.origenDestino || 'Sin ruta'}\n\n`;

            buttons.push([
                Markup.button.callback(
                    `${index + 1}. ${tipoIcon} ${matchText} (${costoStr})`,
                    `admin_service_direct_edit:${policy._id}:${type}:${result.itemIndex}`
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

    /**
     * Muestra edición directa de un servicio/registro específico
     */
    static async showServiceDirectEdit(ctx, result) {
        const { policy, type, item, itemIndex } = result;

        const formatDate = (date) => {
            if (!date) return 'No definida';
            return new Date(date).toLocaleDateString('es-MX');
        };

        const formatCurrency = (amount) => {
            if (!amount) return 'No definido';
            return `$${amount.toFixed(2)}`;
        };

        const typeText = type === 'servicio' ? 'SERVICIO' : 'REGISTRO';
        const itemNumber = type === 'servicio'
            ? (item.numeroServicio || itemIndex + 1)
            : (item.numeroRegistro || itemIndex + 1);

        const menuText = `
✏️ *EDITAR ${typeText}*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza} - ${policy.titular}
**${typeText}:** #${itemNumber}

**Datos actuales:**
📄 **Expediente:** ${item.numeroExpediente || 'No definido'}
💰 **Costo:** ${formatCurrency(item.costo)}
📅 **Fecha:** ${type === 'servicio' ? formatDate(item.fechaServicio) : formatDate(item.fechaRegistro)}
${type === 'servicio' ? `📞 **Contacto programado:** ${formatDate(item.fechaContactoProgramada)}
🏁 **Término programado:** ${formatDate(item.fechaTerminoProgramada)}` :
        `📊 **Estado:** ${item.estado || 'PENDIENTE'}`}

¿Qué campo deseas editar?
        `.trim();

        const buttons = [
            [
                Markup.button.callback('📄 Expediente', `admin_field:${policy._id}:${type}:${itemIndex}:expediente`),
                Markup.button.callback('💰 Costo', `admin_field:${policy._id}:${type}:${itemIndex}:costo`)
            ],
            [
                Markup.button.callback('📅 Fecha', `admin_field:${policy._id}:${type}:${itemIndex}:fecha`)
            ]
        ];

        if (type === 'servicio') {
            buttons.push([
                Markup.button.callback('📞 Contacto Prog.', `admin_field:${policy._id}:${type}:${itemIndex}:contacto`),
                Markup.button.callback('🏁 Término Prog.', `admin_field:${policy._id}:${type}:${itemIndex}:termino`)
            ]);
        } else {
            buttons.push([
                Markup.button.callback('📊 Estado', `admin_field:${policy._id}:${type}:${itemIndex}:estado`)
            ]);
        }

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_service_menu')
        ]);

        const keyboard = Markup.inlineKeyboard(buttons);

        try {
            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            await ctx.reply(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }

        // Actualizar estado
        AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
            selectedPolicy: policy._id.toString(),
            selectedItemType: type,
            selectedItemIndex: itemIndex,
            operation: 'service_direct_edit_shown'
        });
    }

    /**
     * Inicia la edición de un campo específico de servicio/registro
     */
    static async startFieldEdit(ctx, policyId, type, itemIndex, fieldName) {
        try {
            const policy = await Policy.findById(policyId);
            if (!policy) {
                await ctx.answerCbQuery('Póliza no encontrada', { show_alert: true });
                return;
            }

            const item = type === 'servicio' ? policy.servicios[itemIndex] : policy.registros[itemIndex];
            if (!item) {
                await ctx.answerCbQuery('Elemento no encontrado', { show_alert: true });
                return;
            }

            // Configurar estado para edición
            const stateData = {
                selectedPolicy: policyId,
                selectedItemType: type,
                selectedItemIndex: itemIndex,
                selectedField: fieldName
            };

            // Crear o actualizar estado con la operación específica
            const existingState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);
            if (existingState) {
                AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, stateData);
                existingState.operation = 'service_field_edit';
            } else {
                AdminStateManager.createAdminState(ctx.from.id, ctx.chat.id, 'service_field_edit', stateData);
            }

            logger.info('🔍 [SERVICE-DEBUG] Estado configurado para edición:', {
                operation: 'service_field_edit',
                data: stateData
            });

            // Obtener valor actual del campo
            const currentValue = this.getFieldValue(item, fieldName);

            // Generar instrucciones según el tipo de campo
            const instructions = this.getFieldInstructions(fieldName, type, currentValue);

            const editText = `
✏️ *EDITAR CAMPO*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**${type === 'servicio' ? 'Servicio' : 'Registro'}:** #${item.numeroServicio || item.numeroRegistro || (itemIndex + 1)}

**Campo a editar:** ${this.getFieldDisplayName(fieldName)}
**Valor actual:** ${currentValue || 'Sin definir'}

${instructions}

_Escribe el nuevo valor o usa los botones de abajo:_
            `.trim();

            const buttons = this.getFieldEditButtons(fieldName, type, policyId, itemIndex);

            await ctx.editMessageText(editText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: buttons
                }
            });

        } catch (error) {
            logger.error('Error al iniciar edición de campo:', error);
            await ctx.answerCbQuery('Error al iniciar edición', { show_alert: true });
        }
    }

    /**
     * Obtiene el valor actual de un campo
     */
    static getFieldValue(item, fieldName) {
        const formatDateTime = (date) => {
            if (!date) return null;
            return new Date(date).toLocaleString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Mexico_City'
            });
        };

        switch (fieldName) {
        case 'expediente':
            return item.numeroExpediente;
        case 'costo':
            return item.costo ? `$${item.costo.toFixed(2)}` : null;
        case 'fecha':
            return formatDateTime(item.fechaServicio || item.fechaRegistro);
        case 'contacto':
            return formatDateTime(item.fechaContactoProgramada);
        case 'termino':
            return formatDateTime(item.fechaTerminoProgramada);
        case 'estado':
            return item.estado;
        default:
            return null;
        }
    }

    /**
     * Obtiene el nombre de visualización del campo
     */
    static getFieldDisplayName(fieldName) {
        const names = {
            'expediente': 'Número de Expediente',
            'costo': 'Costo',
            'fecha': 'Fecha',
            'contacto': 'Contacto Programado',
            'termino': 'Término Programado',
            'estado': 'Estado'
        };
        return names[fieldName] || fieldName;
    }

    /**
     * Obtiene las instrucciones para editar un campo
     */
    static getFieldInstructions(fieldName, type, currentValue) {
        switch (fieldName) {
        case 'expediente':
            return '📝 **Escribe el nuevo número de expediente:**\n' +
                       '• Ejemplo: EXP-2025-001\n' +
                       '• Mínimo 3 caracteres';
        case 'costo':
            return '💰 **Escribe el nuevo costo:**\n' +
                       '• Ejemplo: 1250.00\n' +
                       '• Solo números y punto decimal';
        case 'fecha':
            return '📅 **Escribe la nueva fecha:**\n' +
                       '• Formato: DD/MM/YYYY HH:MM\n' +
                       '• Ejemplo: 15/03/2025 14:30';
        case 'contacto':
            return '📞 **Escribe la nueva fecha de contacto programado:**\n' +
                       '• Formato: DD/MM/YYYY HH:MM\n' +
                       '• Ejemplo: 20/03/2025 15:30\n' +
                       '• ⚠️ El término programado se ajustará automáticamente';
        case 'termino':
            return '🏁 **Escribe la nueva fecha de término programado:**\n' +
                       '• Formato: DD/MM/YYYY HH:MM\n' +
                       '• Ejemplo: 20/03/2025 18:30\n' +
                       '• ⚠️ El contacto programado se ajustará automáticamente';
        case 'estado':
            return '📊 **Selecciona el nuevo estado:**\n' +
                       '• Usa los botones de abajo';
        default:
            return 'Ingresa el nuevo valor:';
        }
    }

    /**
     * Obtiene los botones para editar campos específicos
     */
    static getFieldEditButtons(fieldName, type, policyId, itemIndex) {
        const buttons = [];
        const shortId = policyId.slice(-8); // Usar solo últimos 8 caracteres del ID

        if (fieldName === 'estado') {
            buttons.push([
                { text: '⏳ PENDIENTE', callback_data: `admin_val:${shortId}:${type}:${itemIndex}:estado:PENDIENTE` },
                { text: '✅ ASIGNADO', callback_data: `admin_val:${shortId}:${type}:${itemIndex}:estado:ASIGNADO` }
            ]);
            buttons.push([
                { text: '❌ NO_ASIGNADO', callback_data: `admin_val:${shortId}:${type}:${itemIndex}:estado:NO_ASIGNADO` }
            ]);
        } else if (fieldName === 'fecha' || fieldName === 'contacto' || fieldName === 'termino') {
            buttons.push([
                { text: '📅 Ahora', callback_data: `admin_val:${shortId}:${type}:${itemIndex}:${fieldName}:NOW` }
            ]);
        }

        buttons.push([
            { text: '⬅️ Volver', callback_data: `admin_service_direct_edit:${policyId}:${type}:${itemIndex}` },
            { text: '❌ Cancelar', callback_data: 'admin_service_edit' }
        ]);

        return buttons;
    }


    /**
     * Procesa un valor de campo según su tipo
     */
    static processFieldValue(fieldName, value) {
        switch (fieldName) {
        case 'expediente':
            return value.trim().length >= 3 ? value.trim() : null;
        case 'costo':
            const cost = parseFloat(value.replace(',', '.'));
            return (!isNaN(cost) && cost >= 0) ? cost : null;
        case 'fecha':
        case 'contacto':
        case 'termino':
            if (value === 'NOW') {
                return new Date();
            }
            // Validar formato DD/MM/YYYY HH:MM o DD/MM/YYYY
            const dateTimeMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
            if (dateTimeMatch) {
                const [, day, month, year, hour = '0', minute = '0'] = dateTimeMatch;
                const date = new Date(year, month - 1, day, parseInt(hour), parseInt(minute));
                if (date.getFullYear() == year && date.getMonth() == (month - 1) && date.getDate() == day) {
                    return date;
                }
            }
            return null;
        case 'estado':
            return ['PENDIENTE', 'ASIGNADO', 'NO_ASIGNADO'].includes(value) ? value : null;
        default:
            return value;
        }
    }

    /**
     * Actualiza el valor de un campo en el item
     */
    static updateFieldValue(item, fieldName, value) {
        switch (fieldName) {
        case 'expediente':
            item.numeroExpediente = value;
            break;
        case 'costo':
            item.costo = value;
            break;
        case 'fecha':
            if (item.fechaServicio !== undefined) {
                item.fechaServicio = value;
            } else {
                item.fechaRegistro = value;
            }
            break;
        case 'contacto':
            item.fechaContactoProgramada = value;
            break;
        case 'termino':
            item.fechaTerminoProgramada = value;
            break;
        case 'estado':
            item.estado = value;
            break;
        }
    }

    /**
     * Muestra el menú de servicios de una póliza específica
     */
    static async showPolicyServicesMenu(ctx, policy) {
        const serviciosCount = policy.servicios?.length || 0;
        const registrosCount = policy.registros?.length || 0;

        let menuText = `
🚗 *SERVICIOS DE PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}

📊 **Resumen:**
• Servicios: ${serviciosCount}
• Registros: ${registrosCount}

¿Qué deseas editar?
        `.trim();

        const buttons = [];

        if (serviciosCount > 0) {
            buttons.push([
                Markup.button.callback('✏️ Editar Servicios', `admin_service_list:${policy._id}`)
            ]);
        }

        if (registrosCount > 0) {
            buttons.push([
                Markup.button.callback('📋 Editar Registros', `admin_registry_list:${policy._id}`)
            ]);
        }

        if (serviciosCount === 0 && registrosCount === 0) {
            menuText += '\n\n❌ Esta póliza no tiene servicios ni registros para editar.';
        }

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_service_menu')
        ]);

        const keyboard = Markup.inlineKeyboard(buttons);

        try {
            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (error) {
            await ctx.reply(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }

        // Actualizar estado
        AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
            selectedPolicy: policy._id.toString(),
            operation: 'policy_services_selected'
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

            await this.showPolicyServicesMenu(ctx, policy);

        } catch (error) {
            logger.error('Error al seleccionar póliza para servicios:', error);
            await ctx.reply('❌ Error al cargar la póliza.');
        }
    }

    /**
     * Procesa mensajes de texto para búsqueda de servicios
     */
    static async handleTextMessage(ctx) {
        logger.info('🔍 [SERVICE-DEBUG] handleTextMessage llamado', {
            userId: ctx.from.id,
            chatId: ctx.chat.id,
            text: ctx.message.text
        });

        const adminState = AdminStateManager.getAdminState(ctx.from.id, ctx.chat.id);
        logger.info('🔍 [SERVICE-DEBUG] Estado admin obtenido:', adminState);

        if (!adminState) {
            logger.info('🔍 [SERVICE-DEBUG] No hay estado admin, retornando false');
            return false;
        }

        const messageText = ctx.message.text.trim();
        logger.info('🔍 [SERVICE-DEBUG] Operación actual:', adminState.operation);

        // Manejar diferentes operaciones de servicios
        switch (adminState.operation) {
        case 'service_search_for_edit':
            logger.info('🔍 [SERVICE-DEBUG] Procesando búsqueda de servicio');
            if (messageText.length < 2) {
                await ctx.reply('❌ El término de búsqueda debe tener al menos 2 caracteres.');
                return true;
            }
            await this.handleServiceSearch(ctx, messageText);
            return true;

        case 'service_field_edit':
            logger.info('🔍 [SERVICE-DEBUG] Procesando edición de campo');
            // Manejar edición de campos
            const { selectedPolicy, selectedItemType, selectedItemIndex, selectedField } = adminState.data || adminState;
            logger.info('🔍 [SERVICE-DEBUG] Datos del estado:', {
                selectedPolicy,
                selectedItemType,
                selectedItemIndex,
                selectedField,
                adminStateKeys: Object.keys(adminState),
                adminDataKeys: adminState.data ? Object.keys(adminState.data) : 'no data'
            });

            if (selectedPolicy && selectedItemType !== undefined && selectedItemIndex !== undefined && selectedField) {
                logger.info('🔍 [SERVICE-DEBUG] Llamando handleFieldValue');
                await this.handleFieldValue(ctx, selectedPolicy, selectedItemType, selectedItemIndex, selectedField, messageText);
                return true;
            } else {
                logger.warn('🔍 [SERVICE-DEBUG] Datos insuficientes para edición de campo');
                return false;
            }

        default:
            logger.info('🔍 [SERVICE-DEBUG] Operación no reconocida:', adminState.operation);
            return false;
        }
    }

    /**
     * Muestra la lista de servicios de una póliza para editar
     */
    static async showServicesList(ctx, policyId) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const servicios = policy.servicios || [];

            if (servicios.length === 0) {
                await ctx.editMessageText(
                    '❌ Esta póliza no tiene servicios para editar.',
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '⬅️ Volver', callback_data: `admin_service_select:${policyId}` }
                            ]]
                        }
                    }
                );
                return;
            }

            let listText = `
✏️ *SERVICIOS - ${policy.numeroPoliza}*
━━━━━━━━━━━━━━━━━━━━━━

**Titular:** ${policy.titular}
**Total servicios:** ${servicios.length}

Selecciona un servicio para editar:

`;

            const buttons = [];
            servicios.forEach((servicio, index) => {
                const formatDate = (date) => {
                    if (!date) return 'Sin fecha';
                    return new Date(date).toLocaleDateString('es-MX');
                };

                const fechaStr = formatDate(servicio.fechaServicio);
                const costoStr = servicio.costo ? `$${servicio.costo.toFixed(2)}` : 'Sin costo';
                const expediente = servicio.numeroExpediente || 'Sin expediente';

                listText += `${index + 1}. **Servicio #${servicio.numeroServicio || (index + 1)}**\n`;
                listText += `   📅 ${fechaStr} | 💰 ${costoStr}\n`;
                listText += `   📄 ${expediente}\n`;
                listText += `   📍 ${servicio.origenDestino || 'Sin ruta'}\n\n`;

                buttons.push([
                    Markup.button.callback(
                        `${index + 1}. Servicio #${servicio.numeroServicio || (index + 1)} (${costoStr})`,
                        `admin_service_edit_item:${policyId}:${index}`
                    )
                ]);
            });

            buttons.push([
                Markup.button.callback('⬅️ Volver', `admin_service_select:${policyId}`)
            ]);

            const keyboard = Markup.inlineKeyboard(buttons);

            try {
                await ctx.editMessageText(listText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(listText.trim(), {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            // Actualizar estado
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicy: policyId,
                operation: 'service_list_shown'
            });

        } catch (error) {
            logger.error('Error al mostrar lista de servicios:', error);
            await ctx.reply('❌ Error al cargar los servicios.');
        }
    }

    /**
     * Muestra opciones de edición para un servicio específico
     */
    static async showServiceEditMenu(ctx, policyId, serviceIndex) {
        try {
            const policy = await Policy.findById(policyId);

            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const servicios = policy.servicios || [];
            const servicio = servicios[serviceIndex];

            if (!servicio) {
                await ctx.reply('❌ Servicio no encontrado.');
                return;
            }

            const formatDate = (date) => {
                if (!date) return 'No definida';
                return new Date(date).toLocaleDateString('es-MX');
            };

            const formatCurrency = (amount) => {
                if (!amount) return 'No definido';
                return `$${amount.toFixed(2)}`;
            };

            const menuText = `
✏️ *EDITAR SERVICIO*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Servicio:** #${servicio.numeroServicio || (serviceIndex + 1)}

**Datos actuales:**
📄 **Expediente:** ${servicio.numeroExpediente || 'No definido'}
💰 **Costo:** ${formatCurrency(servicio.costo)}
📅 **Fecha servicio:** ${formatDate(servicio.fechaServicio)}
📍 **Origen/Destino:** ${servicio.origenDestino || 'No definido'}
📞 **Contacto programado:** ${formatDate(servicio.fechaContactoProgramada)}
🏁 **Término programado:** ${formatDate(servicio.fechaTerminoProgramada)}
📞 **Contacto real:** ${formatDate(servicio.fechaContactoReal)}
🏁 **Término real:** ${formatDate(servicio.fechaTerminoReal)}

¿Qué campo deseas editar?
            `.trim();

            const buttons = [
                [
                    Markup.button.callback('📄 Editar Expediente', `admin_service_field:${policyId}:${serviceIndex}:expediente`),
                    Markup.button.callback('💰 Editar Costo', `admin_service_field:${policyId}:${serviceIndex}:costo`)
                ],
                [
                    Markup.button.callback('📅 Editar Fecha', `admin_service_field:${policyId}:${serviceIndex}:fecha`),
                    Markup.button.callback('📍 Editar Ruta', `admin_service_field:${policyId}:${serviceIndex}:ruta`)
                ],
                [
                    Markup.button.callback('📞 Fechas Contacto', `admin_service_field:${policyId}:${serviceIndex}:contacto`)
                ],
                [
                    Markup.button.callback('⬅️ Volver a Lista', `admin_service_list:${policyId}`)
                ]
            ];

            const keyboard = Markup.inlineKeyboard(buttons);

            try {
                await ctx.editMessageText(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (error) {
                await ctx.reply(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }

            // Actualizar estado
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicy: policyId,
                selectedServiceIndex: parseInt(serviceIndex),
                operation: 'service_edit_menu_shown'
            });

        } catch (error) {
            logger.error('Error al mostrar menú de edición de servicio:', error);
            await ctx.reply('❌ Error al cargar el servicio.');
        }
    }

    /**
     * Maneja valores de campo con ID corto
     */
    static async handleFieldValueShort(ctx, shortId, type, itemIndex, fieldName, value) {
        try {
            // Buscar todas las pólizas y filtrar por los últimos 8 caracteres
            const policies = await Policy.find({});
            const matchingPolicy = policies.find(policy =>
                policy._id.toString().slice(-8) === shortId
            );

            if (!matchingPolicy) {
                await ctx.answerCbQuery('Póliza no encontrada', { show_alert: true });
                return;
            }

            await this.handleFieldValue(ctx, matchingPolicy._id.toString(), type, itemIndex, fieldName, value);
        } catch (error) {
            logger.error('Error al procesar valor con ID corto:', error);
            await ctx.answerCbQuery('Error al procesar valor', { show_alert: true });
        }
    }

    /**
     * Muestra edición directa con ID corto
     */
    static async showServiceDirectEditShort(ctx, shortId, type, itemIndex) {
        try {
            // Buscar póliza por shortId usando método correcto
            const policies = await Policy.find({});
            const matchingPolicy = policies.find(policy =>
                policy._id.toString().slice(-8) === shortId
            );

            if (!matchingPolicy) {
                await ctx.answerCbQuery('Póliza no encontrada', { show_alert: true });
                return;
            }

            const item = type === 'servicio' ? matchingPolicy.servicios[itemIndex] : matchingPolicy.registros[itemIndex];
            if (!item) {
                await ctx.answerCbQuery('Elemento no encontrado', { show_alert: true });
                return;
            }

            const result = { policy: matchingPolicy, type, item, itemIndex };
            await this.showServiceDirectEdit(ctx, result);
        } catch (error) {
            logger.error('Error al mostrar edición directa con ID corto:', error);
            await ctx.answerCbQuery('Error al cargar elemento', { show_alert: true });
        }
    }

    /**
     * Maneja la sincronización de fechas contacto/término con actualización de notificaciones
     */
    static async handleFieldValue(ctx, policyId, type, itemIndex, fieldName, value) {
        try {
            const policy = await Policy.findById(policyId);
            if (!policy) {
                await ctx.answerCbQuery('Póliza no encontrada', { show_alert: true });
                return;
            }

            const item = type === 'servicio' ? policy.servicios[itemIndex] : policy.registros[itemIndex];
            if (!item) {
                await ctx.answerCbQuery('Elemento no encontrado', { show_alert: true });
                return;
            }

            // Obtener valores actuales para calcular diferencias
            const oldContacto = item.fechaContactoProgramada;
            const oldTermino = item.fechaTerminoProgramada;

            // Procesar el valor según el tipo de campo
            const processedValue = this.processFieldValue(fieldName, value);
            if (processedValue === null) {
                await ctx.answerCbQuery('Valor inválido', { show_alert: true });
                return;
            }

            // Lógica especial para fechas de notificación
            if (type === 'servicio' && (fieldName === 'contacto' || fieldName === 'termino')) {
                await this.updateNotificationDates(item, fieldName, processedValue, oldContacto, oldTermino, policy.numeroPoliza);
            } else {
                // Actualizar campo normal
                this.updateFieldValue(item, fieldName, processedValue);
            }

            // Guardar cambios
            await policy.save();

            // Registrar en audit log
            await AuditLogger.log(ctx, 'service_field_updated', 'service', {
                policyId: policyId,
                type: type,
                itemIndex: itemIndex,
                fieldName: fieldName,
                newValue: processedValue
            });

            // Mostrar confirmación según el tipo de contexto
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('✅ Campo actualizado correctamente');
            } else {
                // Para mensajes de texto, enviar respuesta normal
                await ctx.reply('✅ Campo actualizado correctamente');
            }

            // Limpiar estado de edición de campo
            AdminStateManager.updateAdminState(ctx.from.id, ctx.chat.id, {
                selectedPolicy: policyId,
                selectedItemType: type,
                selectedItemIndex: itemIndex,
                operation: 'service_direct_edit_shown'
            });

            // Volver a mostrar el menú de edición
            const result = { policy, type, item, itemIndex };
            await this.showServiceDirectEdit(ctx, result);

        } catch (error) {
            logger.error('Error al actualizar campo:', error);
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('Error al actualizar campo', { show_alert: true });
            } else {
                await ctx.reply('❌ Error al actualizar campo');
            }
        }
    }

    /**
     * Actualiza fechas de notificación con sincronización automática
     */
    static async updateNotificationDates(item, fieldName, newValue, oldContacto, oldTermino, numeroPoliza) {
        const notificationManager = require('../../notifications/NotificationManager');

        if (fieldName === 'contacto') {
            // Calcular diferencia y aplicar al término
            if (oldContacto && oldTermino) {
                const timeDiff = newValue.getTime() - oldContacto.getTime();
                const newTermino = new Date(oldTermino.getTime() + timeDiff);

                // Actualizar ambas fechas
                item.fechaContactoProgramada = newValue;
                item.fechaTerminoProgramada = newTermino;

                // Actualizar notificaciones
                await this.updateNotifications(numeroPoliza, item.numeroExpediente, newValue, newTermino);
            } else {
                // Solo actualizar contacto si no hay término
                item.fechaContactoProgramada = newValue;
                await this.updateNotifications(numeroPoliza, item.numeroExpediente, newValue, null);
            }
        } else if (fieldName === 'termino') {
            // Calcular diferencia y aplicar al contacto
            if (oldContacto && oldTermino) {
                const timeDiff = newValue.getTime() - oldTermino.getTime();
                const newContacto = new Date(oldContacto.getTime() + timeDiff);

                // Actualizar ambas fechas
                item.fechaContactoProgramada = newContacto;
                item.fechaTerminoProgramada = newValue;

                // Actualizar notificaciones
                await this.updateNotifications(numeroPoliza, item.numeroExpediente, newContacto, newValue);
            } else {
                // Solo actualizar término si no hay contacto
                item.fechaTerminoProgramada = newValue;
                await this.updateNotifications(numeroPoliza, item.numeroExpediente, null, newValue);
            }
        }
    }

    /**
     * Actualiza las notificaciones programadas
     */
    static async updateNotifications(numeroPoliza, numeroExpediente, fechaContacto, fechaTermino) {
        try {
            const notificationManager = require('../../notifications/NotificationManager');

            // Eliminar notificaciones existentes para este expediente
            await notificationManager.cancelNotificationsByExpediente(numeroExpediente);

            // Crear nuevas notificaciones si las fechas están definidas
            if (fechaContacto) {
                await notificationManager.scheduleContactoNotification(numeroPoliza, numeroExpediente, fechaContacto);
            }

            if (fechaTermino) {
                await notificationManager.scheduleTerminoNotification(numeroPoliza, numeroExpediente, fechaTermino);
            }

            logger.info(`Notificaciones actualizadas para expediente ${numeroExpediente}`);
        } catch (error) {
            logger.error('Error al actualizar notificaciones:', error);
            // No fallar la operación principal por errores en notificaciones
        }
    }
}

module.exports = ServiceHandler;
