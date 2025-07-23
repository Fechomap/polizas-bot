import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import menuBuilder from './menuBuilder';

class AdminMenu {
    /**
     * Muestra el menú principal de administración
     */
    static async showMainMenu(ctx: Context): Promise<void> {
        const menuText = `
🔧 *PANEL DE ADMINISTRACIÓN*
━━━━━━━━━━━━━━━━━━━━━━

Selecciona una opción para gestionar:

📝 *PÓLIZAS* - Editar, eliminar, restaurar
🚗 *EXPEDIENTES* - Gestionar servicios y registros
📊 *REPORTES PDF* - Estadísticas visuales en PDF
💾 *BASE DE DATOS* - Scripts y mantenimiento
📱 *NOTIFICACIONES* - Gestión de avisos programados

_Solo usuarios administradores pueden acceder a estas funciones._
    `.trim();

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 PÓLIZAS', 'admin_policy_menu'),
                Markup.button.callback('🚗 EXPEDIENTES', 'admin_service_menu')
            ],
            [
                Markup.button.callback('📊 REPORTES PDF', 'admin_reports_menu'),
                Markup.button.callback('💾 BASE DE DATOS', 'admin_database_menu')
            ],
            [Markup.button.callback('📱 NOTIFICACIONES', 'admin_notifications_menu')]
        ]);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } else {
            await ctx.reply(menuText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }

    /**
     * Muestra el submenú de gestión de pólizas con flujo unificado
     */
    static async showPolicyMenu(ctx: Context): Promise<void> {
        const menuText = `
📝 *GESTIÓN DE PÓLIZAS*
━━━━━━━━━━━━━━━━━━━━━━

Flujo intuitivo: Busca primero, luego elige la acción

🔍 *Buscar Póliza* - Encuentra por nombre, póliza o RFC
   Después podrás: Editar, Eliminar, Ver servicios

🔄 *Restaurar Póliza* - Recuperar póliza eliminada
   Búsqueda especial en pólizas eliminadas

_Primero ubica la póliza, luego decide qué hacer con ella._
    `.trim();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Buscar Póliza', 'admin_policy_search')],
            [Markup.button.callback('🔄 Restaurar Póliza', 'admin_policy_restore')],
            [Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);

        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    /**
     * Muestra el submenú de gestión de servicios
     */
    static async showServiceMenu(ctx: Context): Promise<void> {
        const menuText = `
🚗 *GESTIÓN DE SERVICIOS*
━━━━━━━━━━━━━━━━━━━━━━

Busca y edita servicios/registros directamente por expediente:

✏️ **Editar por Expediente** - Buscar servicio o registro
🔍 **Búsqueda unificada** - Servicios y registros en una sola búsqueda
📝 **Campos editables** - Expediente, costo, fechas, estados

_Funciona tanto para servicios como para registros._
    `.trim();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Editar por Expediente', 'admin_service_edit')],
            [Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);

        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    /**
     * Muestra el submenú de reportes PDF
     */
    static async showReportsMenu(ctx: Context): Promise<void> {
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

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📈 Reporte Mensual', 'admin_reports_monthly'),
                Markup.button.callback('📅 Reporte Semanal', 'admin_reports_weekly')
            ],
            [
                Markup.button.callback('📋 Reporte Personalizado', 'admin_reports_custom'),
                Markup.button.callback('🎯 Resumen Ejecutivo', 'admin_reports_executive')
            ],
            [Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);

        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    /**
     * Muestra el submenú de gestión de base de datos
     */
    static async showDatabaseMenu(ctx: Context): Promise<void> {
        const menuText = `
💾 *GESTIÓN BASE DE DATOS*
━━━━━━━━━━━━━━━━━━━━━━

Exportación y limpieza de datos:

📊 *Exportar Excel* - Descarga completa de pólizas
🧹 *Limpieza Automática* - Eliminar pólizas con ≥2 servicios
📋 *Validación Archivos* - Verificar fotos y PDFs faltantes

🤖 *Sistema automático*:
• Cálculo diario: 3:00 AM
• Limpieza pólizas: 3:30 AM
• Limpieza semanal: Domingos 4:00 AM
    `.trim();

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📊 Exportar Excel', 'admin_database_export')],
            [Markup.button.callback('🧹 Limpieza Automática', 'admin_database_autocleanup')],
            [Markup.button.callback('📋 Validación Archivos', 'admin_database_file_validation')],
            [Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);

        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    /**
     * Muestra el submenú de gestión de notificaciones
     */
    static async showNotificationsMenu(ctx: Context): Promise<void> {
        const menuText = `
📱 *GESTIÓN DE NOTIFICACIONES*
━━━━━━━━━━━━━━━━━━━━━━

Administra notificaciones programadas del sistema:

📋 *Ver Notificaciones del Día* - Lista completa de hoy
⏰ *Ver Próximas Hoy* - Pendientes para hoy
✏️ *Editar Notificaciones* - Reprogramar fechas y horas

_Gestiona todas las notificaciones de contacto y término automáticas._
        `.trim();

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📋 Ver del Día', 'admin_notifications_list'),
                Markup.button.callback('⏰ Ver Próximas', 'admin_notifications_today')
            ],
            [Markup.button.callback('✏️ Editar Notificaciones', 'admin_notifications_edit')],
            [Markup.button.callback('⬅️ Volver', 'admin_menu')]
        ]);

        await ctx.editMessageText(menuText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
}

export default AdminMenu;
