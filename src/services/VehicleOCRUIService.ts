// src/services/VehicleOCRUIService.ts
/**
 * Servicio de UI para el flujo de registro OCR de vehículos
 * Responsabilidad única: mensajes, teclados y formateo
 */

import type { Telegraf } from 'telegraf';

interface ISendOptions {
    parse_mode?: 'Markdown' | 'HTML';
    message_thread_id?: number;
    reply_markup?: any;
}

interface IDatosVehiculoConfirmados {
    serie?: string;
    marca?: string;
    submarca?: string;
    año?: number;
    color?: string;
    placas?: string;
}

interface IDatosGenerados {
    titular: string;
    telefono: string;
}

/**
 * Nombres amigables para los campos
 */
const NOMBRES_CAMPOS: Record<string, string> = {
    serie: 'Número de Serie (VIN)',
    marca: 'Marca',
    submarca: 'Modelo',
    año: 'Año',
    color: 'Color',
    placas: 'Placas'
};

export class VehicleOCRUIService {
    /**
     * Obtiene el nombre amigable de un campo
     */
    getNombreCampo(campo: string): string {
        return NOMBRES_CAMPOS[campo] ?? campo;
    }

    /**
     * Envía mensaje al chat correcto (con soporte de threads)
     */
    async enviarMensaje(
        bot: Telegraf,
        chatId: number,
        threadId: string | null,
        texto: string,
        options: ISendOptions = {}
    ): Promise<any> {
        const sendOptions: ISendOptions = { ...options };
        if (threadId) {
            sendOptions.message_thread_id = parseInt(threadId);
        }
        return await bot.telegram.sendMessage(chatId, texto, sendOptions);
    }

    /**
     * Genera mensaje inicial de registro OCR
     */
    generarMensajeInicio(): string {
        return (
            '📸 *REGISTRO DE AUTO CON OCR*\n\n' +
            '1️⃣ Envía una *foto clara* de la *Tarjeta de Circulación*\n\n' +
            '💡 *Tips para mejor resultado:*\n' +
            '• Buena iluminación\n' +
            '• Imagen nítida y enfocada\n' +
            '• Que se lean todos los datos\n\n' +
            '_Extraeré automáticamente los datos del vehículo_'
        );
    }

    /**
     * Genera teclado inicial con opciones
     */
    generarTecladoInicio(): any[][] {
        return [
            [{ text: '📝 Mejor registro manual', callback_data: 'vehiculo_ocr_manual' }],
            [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
        ];
    }

    /**
     * Genera mensaje de procesamiento
     */
    generarMensajeProcesando(): string {
        return '🔍 *Analizando tarjeta de circulación...*\n\n⏳ Esto puede tomar unos segundos';
    }

    /**
     * Genera mensaje de error en OCR
     */
    generarMensajeErrorOCR(): string {
        return (
            '❌ *No se pudieron extraer los datos*\n\n' +
            'Por favor, intenta con otra foto más clara o usa el registro manual.'
        );
    }

    /**
     * Genera teclado para reintentar
     */
    generarTecladoReintentar(): any[][] {
        return [
            [{ text: '📷 Enviar otra foto', callback_data: 'vehiculo_ocr_reintentar' }],
            [{ text: '📝 Registro manual', callback_data: 'vehiculo_ocr_manual' }],
            [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
        ];
    }

    /**
     * Genera resumen de datos extraídos con dato faltante
     */
    generarResumenConFaltante(datos: IDatosVehiculoConfirmados, campoFaltante: string): string {
        let resumen = '📋 *DATOS EXTRAÍDOS:*\n\n';

        if (datos.serie) resumen += `✅ Serie: \`${datos.serie}\`\n`;
        else resumen += '❌ Serie: _falta_\n';

        if (datos.marca) resumen += `✅ Marca: ${datos.marca}\n`;
        else resumen += '❌ Marca: _falta_\n';

        if (datos.submarca) resumen += `✅ Modelo: ${datos.submarca}\n`;
        else resumen += '❌ Modelo: _falta_\n';

        if (datos.año) resumen += `✅ Año: ${datos.año}\n`;
        else resumen += '❌ Año: _falta_\n';

        if (datos.color) resumen += `✅ Color: ${datos.color}\n`;
        else resumen += '❌ Color: _falta_\n';

        if (datos.placas) resumen += `✅ Placas: ${datos.placas}\n`;
        else resumen += '❌ Placas: _falta_\n';

        resumen += `\n📝 *Por favor, ingresa ${this.getNombreCampo(campoFaltante)}:*`;

        return resumen;
    }

    /**
     * Genera mensaje de confirmación de datos
     */
    generarMensajeConfirmacion(datos: IDatosVehiculoConfirmados): string {
        return (
            '✅ *DATOS COMPLETOS*\n\n' +
            `🔢 *Serie:* \`${datos.serie}\`\n` +
            `🚗 *Marca:* ${datos.marca}\n` +
            `📋 *Modelo:* ${datos.submarca}\n` +
            `📅 *Año:* ${datos.año}\n` +
            `🎨 *Color:* ${datos.color}\n` +
            `🔖 *Placas:* ${datos.placas}\n\n` +
            '¿Los datos son correctos?'
        );
    }

    /**
     * Genera teclado de confirmación
     */
    generarTecladoConfirmacion(): any[][] {
        return [
            [
                { text: '✅ Confirmar', callback_data: 'vehiculo_ocr_confirmar' },
                { text: '✏️ Corregir', callback_data: 'vehiculo_ocr_corregir' }
            ],
            [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
        ];
    }

    /**
     * Genera mensaje de datos confirmados y solicitud de fotos
     */
    generarMensajeSolicitarFotos(datosGenerados: IDatosGenerados, placas: string): string {
        return (
            '✅ *DATOS CONFIRMADOS*\n\n' +
            `👤 *Titular generado:* ${datosGenerados.titular}\n` +
            `📱 *Teléfono:* ${datosGenerados.telefono}\n\n` +
            '📸 *AHORA:* Envía fotos del vehículo\n\n' +
            `💡 *Tip:* Si la foto muestra las placas, validaré que coincidan con *${placas}*`
        );
    }

    /**
     * Genera teclado para fase de fotos
     */
    generarTecladoFotos(): any[][] {
        return [
            [{ text: '⏭️ Omitir fotos', callback_data: 'vehiculo_ocr_omitir_fotos' }],
            [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
        ];
    }

    /**
     * Genera mensaje de foto subida
     */
    generarMensajeFotoSubida(numFotos: number, mensajeValidacion = ''): string {
        return (
            `✅ *Foto ${numFotos} subida*` +
            mensajeValidacion +
            '\n\nPuedes enviar más fotos o finalizar el registro.'
        );
    }

    /**
     * Genera teclado después de foto
     */
    generarTecladoFotoSubida(numFotos: number): any[][] {
        return [
            [{ text: `✅ Finalizar (${numFotos} fotos)`, callback_data: 'vehiculo_ocr_finalizar' }],
            [{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]
        ];
    }

    /**
     * Genera mensaje de registro completado
     */
    generarMensajeExito(
        datos: IDatosVehiculoConfirmados,
        datosGenerados: IDatosGenerados,
        numFotos: number,
        placasValidadas: boolean
    ): string {
        const placasInfo = placasValidadas
            ? '✅ Placas validadas en fotos'
            : '⚠️ Placas no validadas (no visibles en fotos)';

        return (
            '🎉 *REGISTRO COMPLETADO*\n\n' +
            `🚗 *${datos.marca} ${datos.submarca} ${datos.año}*\n` +
            `🔢 Serie: \`${datos.serie}\`\n` +
            `🔖 Placas: ${datos.placas}\n` +
            `👤 ${datosGenerados.titular}\n` +
            `📷 Fotos: ${numFotos}\n\n` +
            `${placasInfo}\n\n` +
            '✅ Vehículo listo para asignar póliza'
        );
    }

    /**
     * Genera teclado final
     */
    generarTecladoFinal(): any[][] {
        return [[{ text: '🏠 Menú Principal', callback_data: 'accion:volver_menu' }]];
    }

    /**
     * Genera mensaje de error genérico
     */
    generarMensajeError(mensaje: string): string {
        return `❌ ${mensaje}`;
    }

    /**
     * Genera teclado de cancelar
     */
    generarTecladoCancelar(): any[][] {
        return [[{ text: '❌ Cancelar', callback_data: 'vehiculo_ocr_cancelar' }]];
    }

    /**
     * Genera mensaje para reintentar foto de tarjeta
     */
    generarMensajeReintentarTarjeta(): string {
        return (
            '📸 *Envía otra foto de la tarjeta de circulación*\n\n' +
            'Asegúrate de que la imagen sea clara y legible.'
        );
    }
}

// Singleton
let instance: VehicleOCRUIService | null = null;

export function getVehicleOCRUIService(): VehicleOCRUIService {
    if (!instance) {
        instance = new VehicleOCRUIService();
    }
    return instance;
}

export default VehicleOCRUIService;
