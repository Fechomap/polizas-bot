/**
 * PolicyEditService - Servicio para edición de pólizas
 *
 * Responsabilidad: Editar campos de pólizas
 * Migrado de Mongoose a Prisma/PostgreSQL
 */

import { Context, Markup } from 'telegraf';
import { prisma } from '../../../database/prisma';
import adminStateManager from '../../utils/adminStates';
import { AuditLogger } from '../../utils/auditLogger';
import logger from '../../../utils/logger';
import { FIELD_MAPPINGS } from './types';

class PolicyEditService {
    /**
     * Formatea fecha para mostrar
     */
    static formatDate(date: Date | string | null | undefined): string {
        if (!date) return 'No definida';
        return new Date(date).toLocaleDateString('es-MX');
    }

    /**
     * Muestra menú de edición de datos de póliza
     * (Simplificado - solo datos de póliza editables)
     */
    static async showEditCategoriesMenu(ctx: Context, policyId: string): Promise<void> {
        // Redirigir directamente a edición de datos de póliza
        return this.showPolicyDataEdit(ctx, policyId);
    }

    /**
     * Muestra edición de número de póliza
     */
    static async showPolicyDataEdit(ctx: Context, policyId: string): Promise<void> {
        try {
            const policy = await prisma.policy.findUnique({
                where: { id: policyId }
            });
            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const menuText = `
✏️ *EDITAR PÓLIZA*
━━━━━━━━━━━━━━━━━━━━━━

**Número actual:** ${policy.numeroPoliza}
**Titular:** ${policy.titular}

¿Deseas cambiar el número de póliza?
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '📝 Cambiar Número',
                        `admin_edit_field:numeroPoliza:${policyId}`
                    )
                ],
                [Markup.button.callback('⬅️ Volver', `admin_policy_unified_detail:${policyId}`)]
            ]);

            await ctx.editMessageText(menuText, { parse_mode: 'Markdown', ...keyboard });
        } catch (error) {
            logger.error('Error al mostrar datos de póliza:', error);
            await ctx.reply('❌ Error al cargar los datos de la póliza.');
        }
    }

    /**
     * Inicia edición de un campo específico
     */
    static async startFieldEdit(ctx: Context, fieldName: string, policyId: string): Promise<void> {
        try {
            const policy = await prisma.policy.findUnique({
                where: { id: policyId }
            });
            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return;
            }

            const fieldMapping = FIELD_MAPPINGS[fieldName];
            const displayName = fieldMapping?.displayName ?? fieldName;
            const currentValue = (policy as any)[fieldName] ?? 'No definido';

            adminStateManager.createAdminState(ctx.from!.id, ctx.chat!.id, 'edit_field', {
                editField: fieldName,
                editPolicyId: policyId,
                fieldDisplayName: displayName
            });

            const editText = `
✏️ *EDITAR ${displayName.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━

**Póliza:** ${policy.numeroPoliza}
**Campo:** ${displayName}
**Valor actual:** ${currentValue}

Escribe el nuevo valor:
            `.trim();

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', `admin_policy_unified_detail:${policyId}`)]
            ]);

            await ctx.editMessageText(editText, { parse_mode: 'Markdown', ...keyboard });
        } catch (error) {
            logger.error('Error al iniciar edición de campo:', error);
            await ctx.reply('❌ Error al iniciar la edición.');
        }
    }

    /**
     * Ejecuta el cambio de un campo
     */
    static async executeFieldChange(
        ctx: Context,
        policyId: string,
        fieldName: string,
        newValue: string
    ): Promise<boolean> {
        try {
            const policy = await prisma.policy.findUnique({
                where: { id: policyId }
            });
            if (!policy) {
                await ctx.reply('❌ Póliza no encontrada.');
                return false;
            }

            const oldValue = (policy as any)[fieldName];

            // Actualizar el campo con Prisma
            const updatedPolicy = await prisma.policy.update({
                where: { id: policyId },
                data: { [fieldName]: newValue }
            });

            const fieldMapping = FIELD_MAPPINGS[fieldName];
            const displayName = fieldMapping?.displayName ?? fieldName;

            await ctx.reply(
                `✅ *Campo actualizado exitosamente*\n\n` +
                    `**Póliza:** ${updatedPolicy.numeroPoliza}\n` +
                    `**Campo:** ${displayName}\n` +
                    `**Anterior:** ${oldValue ?? 'No definido'}\n` +
                    `**Nuevo:** ${newValue}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '✏️ Seguir editando',
                                `admin_edit_policy:${policyId}`
                            )
                        ],
                        [
                            Markup.button.callback(
                                '⬅️ Volver',
                                `admin_policy_unified_detail:${policyId}`
                            )
                        ]
                    ])
                }
            );

            await AuditLogger.log(ctx, 'policy_field_updated', {
                module: 'policy',
                metadata: {
                    policyId,
                    policyNumber: updatedPolicy.numeroPoliza,
                    fieldName,
                    oldValue,
                    newValue
                }
            });

            return true;
        } catch (error) {
            logger.error('Error al ejecutar cambio de campo:', error);
            await ctx.reply('❌ Error al guardar el cambio.');
            return false;
        }
    }

    /**
     * Maneja el input de texto para edición
     */
    static async handleFieldEditInput(ctx: Context, newValue: string): Promise<boolean> {
        const state = adminStateManager.getAdminState(ctx.from!.id, ctx.chat!.id);

        if (!state) return false;

        const action = state.operation ?? state.data?.action;

        if (action !== 'edit_field') {
            return false;
        }

        const editField = state.data?.editField;
        const editPolicyId = state.data?.editPolicyId;

        if (!editField || !editPolicyId) {
            await ctx.reply('❌ Error: Estado de edición inválido.');
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
            return true;
        }

        const success = await this.executeFieldChange(ctx, editPolicyId, editField, newValue);

        if (success) {
            adminStateManager.clearAdminState(ctx.from!.id, ctx.chat!.id);
        }

        return true;
    }
}

export default PolicyEditService;
