"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
class AdminMenu {
    static async showMainMenu(ctx) {
        const menuText = `
🔧 *PANEL DE ADMINISTRACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

Selecciona una opción para gestionar:

📝 *Pólizas* - Editar, eliminar, restaurar
🚗 *Servicios* - Gestionar servicios y registros
📊 *Reportes* - Estadísticas visuales en PDF
💾 *Base de Datos* - Scripts y mantenimiento

_Solo usuarios administradores pueden acceder a estas funciones._
    `.trim();
        const keyboard = telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('📝 Gestión de Pólizas', 'admin_policy_menu'),
                telegraf_1.Markup.button.callback('🚗 Gestión de Servicios', 'admin_service_menu')
            ],
            [
                telegraf_1.Markup.button.callback('📊 Reportes PDF', 'admin_reports_menu'),
                telegraf_1.Markup.button.callback('💾 Gestión Base de Datos', 'admin_database_menu')
            ],
            [telegraf_1.Markup.button.callback('⬅️ Volver al Menú Principal', 'accion:volver_menu')]
        ]);
        if (ctx.callbackQuery) {
            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
        else {
            await ctx.reply(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }
    static async showPolicyMenu(ctx) {
        const menuText = `
📝 *GESTIÓN DE PÓLIZAS*
━━━━━━━━━━━━━━━━━━━━━━

Selecciona la operación a realizar:

✏️ *Editar Póliza* - Modificar datos existentes
🗑️ *Eliminar Póliza* - Marcar como eliminada
🔄 *Restaurar Póliza* - Recuperar póliza eliminada
📊 *Ver Estadísticas* - Resumen de pólizas
    `.trim();
        const keyboard = telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('✏️ Editar Póliza', 'admin_policy_edit'),
                telegraf_1.Markup.button.callback('🗑️ Eliminar Póliza', 'admin_policy_delete')
            ],
            [
                telegraf_1.Markup.button.callback('🔄 Restaurar Póliza', 'admin_policy_restore'),
                telegraf_1.Markup.button.callback('📊 Ver Estadísticas', 'admin_policy_stats')
            ],
            [telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);
        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    static async showServiceMenu(ctx) {
        const menuText = `
🚗 *GESTIÓN DE SERVICIOS*
━━━━━━━━━━━━━━━━━━━━━━

Busca y edita servicios/registros directamente por expediente:

✏️ **Editar por Expediente** - Buscar servicio o registro
🔍 **Búsqueda unificada** - Servicios y registros en una sola búsqueda
📝 **Campos editables** - Expediente, costo, fechas, estados

_Funciona tanto para servicios como para registros._
    `.trim();
        const keyboard = telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('✏️ Editar por Expediente', 'admin_service_edit')],
            [telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);
        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    static async showReportsMenu(ctx) {
        const menuText = `
📊 *REPORTES PDF*
━━━━━━━━━━━━━━━━━━━━━━

Genera reportes visuales con estadísticas:

📈 *Mensual* - Contratación por aseguradora
📅 *Semanal* - Servicios y tendencias 
📋 *Personalizado* - Rango de fechas específico
🎯 *Resumen Ejecutivo* - Métricas consolidadas

_Reportes en PDF con gráficas y tablas listos para imprimir._
        `.trim();
        const keyboard = telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('📈 Reporte Mensual', 'admin_reports_monthly'),
                telegraf_1.Markup.button.callback('📅 Reporte Semanal', 'admin_reports_weekly')
            ],
            [
                telegraf_1.Markup.button.callback('📋 Reporte Personalizado', 'admin_reports_custom'),
                telegraf_1.Markup.button.callback('🎯 Resumen Ejecutivo', 'admin_reports_executive')
            ],
            [telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);
        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    static async showDatabaseMenu(ctx) {
        const menuText = `
💾 *GESTIÓN BASE DE DATOS*
━━━━━━━━━━━━━━━━━━━━━━

Exportación y limpieza de datos:

📊 *Exportar Excel* - Descarga completa de pólizas
🧹 *Limpieza Automática* - Eliminar pólizas con ≥2 servicios

🤖 *Sistema automático*:
• Cálculo diario: 3:00 AM
• Limpieza pólizas: 3:30 AM
• Limpieza semanal: Domingos 4:00 AM
    `.trim();
        const keyboard = telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('📊 Exportar Excel', 'admin_database_export')],
            [telegraf_1.Markup.button.callback('🧹 Limpieza Automática', 'admin_database_autocleanup')],
            [telegraf_1.Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);
        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
}
exports.default = AdminMenu;
