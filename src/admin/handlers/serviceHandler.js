const adminMenu = require('../menus/adminMenu');
const logger = require('../../utils/logger');

class ServiceHandler {
  /**
   * Maneja las acciones relacionadas con servicios
   */
  static async handleAction(ctx, action) {
    try {
      switch (action) {
        case 'menu':
          return await adminMenu.showServiceMenu(ctx);
          
        case 'edit':
          return await this.handleEditService(ctx);
          
        case 'editreg':
          return await this.handleEditRegistry(ctx);
          
        case 'routes':
          return await this.handleRoutes(ctx);
          
        case 'stats':
          return await this.handleStats(ctx);
          
        default:
          await ctx.answerCbQuery('Opción no disponible', { show_alert: true });
      }
    } catch (error) {
      logger.error('Error en ServiceHandler:', error);
      await ctx.answerCbQuery('Error al procesar la solicitud', { show_alert: true });
    }
  }

  /**
   * Maneja la edición de servicios
   */
  static async handleEditService(ctx) {
    await ctx.editMessageText(
      '✏️ *EDITAR SERVICIO*\n\n' +
      'Esta función estará disponible en la Fase 3 del desarrollo.\n\n' +
      'Permitirá editar:\n' +
      '• Número de servicio y costo\n' +
      '• Fechas y horarios\n' +
      '• Origen y destino\n' +
      '• Estado del servicio\n' +
      '• Notificaciones programadas',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '⬅️ Volver', callback_data: 'admin_service_menu' }
          ]]
        }
      }
    );
  }

  /**
   * Maneja la edición de registros
   */
  static async handleEditRegistry(ctx) {
    await ctx.editMessageText(
      '📋 *EDITAR REGISTRO*\n\n' +
      'Esta función estará disponible en la Fase 3 del desarrollo.\n\n' +
      'Permitirá modificar:\n' +
      '• Número de registro\n' +
      '• Estado (PENDIENTE/ASIGNADO/NO_ASIGNADO)\n' +
      '• Información de ruta\n' +
      '• Costos asociados',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '⬅️ Volver', callback_data: 'admin_service_menu' }
          ]]
        }
      }
    );
  }

  /**
   * Maneja la gestión de rutas
   */
  static async handleRoutes(ctx) {
    await ctx.editMessageText(
      '📍 *GESTIONAR RUTAS*\n\n' +
      'Esta función estará disponible en la Fase 3 del desarrollo.\n\n' +
      'Permitirá:\n' +
      '• Actualizar información de rutas\n' +
      '• Recalcular distancias y tiempos\n' +
      '• Modificar puntos de origen/destino\n' +
      '• Sincronizar con HERE Maps',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '⬅️ Volver', callback_data: 'admin_service_menu' }
          ]]
        }
      }
    );
  }

  /**
   * Muestra estadísticas de servicios
   */
  static async handleStats(ctx) {
    const statsText = `
📊 *ESTADÍSTICAS DE SERVICIOS*
━━━━━━━━━━━━━━━━━━━━━━

🚗 Total Servicios: _Calculando..._
📅 Este mes: _Calculando..._
💰 Ingresos totales: _Calculando..._
📍 Rutas más frecuentes: _Calculando..._

_Las estadísticas completas estarán disponibles en la Fase 4._
    `.trim();

    await ctx.editMessageText(statsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '⬅️ Volver', callback_data: 'admin_service_menu' }
        ]]
      }
    });
  }
}

module.exports = ServiceHandler;