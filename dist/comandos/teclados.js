"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMainKeyboard = getMainKeyboard;
exports.getBaseAutosKeyboard = getBaseAutosKeyboard;
exports.getCancelKeyboard = getCancelKeyboard;
exports.getFinalizarKeyboard = getFinalizarKeyboard;
const telegraf_1 = require("telegraf");
function getMainKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('📋 PÓLIZAS', 'accion:polizas'),
            telegraf_1.Markup.button.callback('🔧 ADMINISTRACIÓN', 'accion:administracion')
        ],
        [
            telegraf_1.Markup.button.callback('📊 REPORTES', 'accion:reportes'),
            telegraf_1.Markup.button.callback('🚗 BASE DE AUTOS', 'accion:base_autos')
        ],
        [telegraf_1.Markup.button.callback('❓ AYUDA', 'accion:help')]
    ]);
}
function getBaseAutosKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('🚗 Registrar Auto', 'base_autos:registrar')],
        [telegraf_1.Markup.button.callback('📄 Asegurar Auto', 'base_autos:asegurar')],
        [telegraf_1.Markup.button.callback('⬅️ Menú Principal', 'accion:volver_menu')]
    ]);
}
function getCancelKeyboard() {
    return {
        keyboard: [['❌ Cancelar']],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}
function getFinalizarKeyboard() {
    return {
        keyboard: [['✅ Finalizar'], ['❌ Cancelar']],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}
