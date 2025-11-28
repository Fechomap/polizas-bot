// src/admin/handlers/serviceHandler.ts
/**
 * Handler para gestión de servicios en el módulo admin
 * REFACTORIZADO: UI delegada a AdminServiceUIService (SRP)
 */

import { Context } from 'telegraf';
import Policy from '../../models/policy';
import adminStateManager from '../utils/adminStates';
import { AuditLogger } from '../utils/auditLogger';
import AdminMenu from '../menus/adminMenu';
import logger from '../../utils/logger';
import { getAdminServiceUIService } from '../services/AdminServiceUIService';

// Service
const uiService = getAdminServiceUIService();

interface IServiceData {
    numeroExpediente: string;
    fechaServicio?: Date;
    tipoServicio?: string;
    descripcion?: string;
    costo?: number;
    estado?: string;
    proveedor?: string;
    notas?: string;
    [key: string]: any;
}

interface IRegistroData {
    numeroExpediente: string;
    fechaRegistro?: Date;
    tipoRegistro?: string;
    descripcion?: string;
    estado?: string;
    observaciones?: string;
    [key: string]: any;
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

            await ctx.editMessageText(uiService.generarMensajeBusqueda(), {
                parse_mode: 'Markdown',
                ...uiService.generarTecladoCancelarBusqueda()
            });

            await AuditLogger.log(ctx, 'service_search_initiated', {
                module: 'service',
                metadata: { operation: 'search_for_edit' }
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
            // Buscar en servicios
            const serviciosMatched =
                policy.servicios?.filter(servicio => {
                    const expedienteServicio = servicio.numeroExpediente?.trim();
                    return (
                        expedienteServicio &&
                        expedienteServicio.toLowerCase() === cleanTerm.toLowerCase()
                    );
                }) ?? [];

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

            // Buscar en registros
            const registrosMatched =
                policy.registros?.filter(registro => {
                    const expedienteRegistro = registro.numeroExpediente?.trim();
                    return (
                        expedienteRegistro &&
                        expedienteRegistro.toLowerCase() === cleanTerm.toLowerCase()
                    );
                }) ?? [];

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
                try {
                    await ctx.editMessageText(uiService.generarMensajeSinResultados(searchTerm), {
                        parse_mode: 'Markdown',
                        ...uiService.generarTecladoSinResultados()
                    });
                } catch {
                    await ctx.reply(uiService.generarMensajeSinResultados(searchTerm), {
                        parse_mode: 'Markdown',
                        ...uiService.generarTecladoSinResultados()
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
                metadata: { searchTerm, resultsCount: results.length }
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
        const message = uiService.generarMensajeListaResultados(results);
        const keyboard = uiService.generarTecladoListaResultados(results);

        try {
            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
        } catch {
            await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
        }
    }

    static async showServiceDirectEdit(ctx: Context, result: IServiceSearchResult): Promise<void> {
        const message = uiService.generarMensajeDetalleServicio(result);
        const keyboard = uiService.generarTecladoEdicionServicio(
            result.policyId,
            result.type,
            result.itemIndex
        );

        try {
            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
        } catch {
            await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
        }
    }

    static async showServiceDirectEditShort(
        ctx: Context,
        policyId: string,
        type: string,
        itemIndex: number
    ): Promise<void> {
        try {
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

            const message = uiService.generarMensajeEditarCampo(type, fieldName);
            const keyboard = uiService.generarTecladoCancelarEdicion(policyId, type, itemIndex);

            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });

            await AuditLogger.log(ctx, 'service_field_edit_started', {
                module: 'service',
                metadata: { policyId, type, itemIndex, fieldName }
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
            const policies = await Policy.find({ estado: { $ne: 'ELIMINADO' } }).select(
                '_id numeroPoliza titular servicios registros'
            );

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
            const policies = await Policy.find({ estado: { $ne: 'ELIMINADO' } }).select(
                '_id numeroPoliza titular servicios registros'
            );

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

            const policy = await Policy.findById(policyId);
            if (!policy) {
                await ctx.reply('❌ Error: Póliza no encontrada.');
                return;
            }

            // Validar y convertir valor según tipo de campo
            let convertedValue: any = value;
            if (fieldName.includes('fecha')) {
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

            // Actualizar campo
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
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);

            const message = uiService.generarMensajeCampoActualizado(
                type,
                policy.numeroPoliza,
                fieldName,
                value
            );
            const keyboard = uiService.generarTecladoPostActualizacion();

            await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });

            await AuditLogger.log(ctx, 'service_field_updated', {
                module: 'service',
                entityType: type,
                entityId: policyId,
                changes: {
                    before: { [fieldName]: 'valor anterior' },
                    after: { [fieldName]: convertedValue }
                },
                metadata: { policyId, type, itemIndex, fieldName, newValue: convertedValue }
            });
        } catch (error) {
            logger.error('Error al actualizar campo:', error);
            await ctx.reply('❌ Error al actualizar el campo. Intenta nuevamente.');
        }
    }

    // Métodos de compatibilidad de interfaz
    static async handlePolicySelection(ctx: Context, _policyId: string): Promise<void> {
        await ctx.reply('Selección de póliza para servicios en desarrollo.');
    }

    static async showServicesList(ctx: Context, _policyId: string): Promise<void> {
        await ctx.reply('Lista de servicios en desarrollo.');
    }

    static async showServiceEditMenu(
        ctx: Context,
        _policyId: string,
        _serviceIndex: string
    ): Promise<void> {
        await ctx.reply('Menú de edición de servicio en desarrollo.');
    }
}

export default ServiceHandler;
