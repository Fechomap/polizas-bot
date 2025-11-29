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
            Markup.button.callback('🔧 ADMIN', 'accion:administracion')
        ],
        [
            Markup.button.callback('📊 REPORTES', 'accion:reportes'),
            Markup.button.callback('🚗 AUTOS', 'accion:base_autos')
        ]
    ]);
}

/**
 * Teclado para Base de Autos
 */
function getBaseAutosKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🚗 REGISTRAR AUTO', 'base_autos:registrar')],
        [Markup.button.callback('📄 ASEGURAR AUTO', 'base_autos:asegurar')],
        [Markup.button.callback('🏠 MENÚ PRINCIPAL', 'accion:volver_menu')]
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
