import { Markup } from 'telegraf';

/**
 * Teclados reutilizables para el bot
 */

/**
 * Teclado principal del bot
 */
function getMainKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 PÓLIZAS', 'accion:polizas'),
            Markup.button.callback('🔧 ADMINISTRACIÓN', 'accion:administracion')
        ],
        [
            Markup.button.callback('📊 REPORTES', 'accion:reportes'),
            Markup.button.callback('🚗 BASE DE AUTOS', 'accion:base_autos')
        ],
        [Markup.button.callback('❓ AYUDA', 'accion:help')]
    ]);
}

/**
 * Teclado para Base de Autos
 */
function getBaseAutosKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🚗 Registrar Auto', 'base_autos:registrar')],
        [Markup.button.callback('📄 Asegurar Auto', 'base_autos:asegurar')],
        [Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
    ]);
}

/**
 * Teclado de cancelación simple
 */
function getCancelKeyboard() {
    return {
        keyboard: [['❌ Cancelar']],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

/**
 * Teclado para finalizar registro
 */
function getFinalizarKeyboard() {
    return {
        keyboard: [['✅ Finalizar'], ['❌ Cancelar']],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

export { getMainKeyboard, getBaseAutosKeyboard, getCancelKeyboard, getFinalizarKeyboard };
