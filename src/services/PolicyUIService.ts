// src/services/PolicyUIService.ts
/**
 * Servicio de interfaz de usuario para flujos de pólizas
 * Responsabilidad única: mensajes, teclados y formateo
 */

import { getMainKeyboard } from '../comandos/teclados';
import type { IBot, IDatosPoliza } from '../types/policy-assignment';
import type { IVehicle, IPolicy } from '../types/database';

export class PolicyUIService {
    /**
     * Envía mensaje al chat correcto (con soporte de threads)
     */
    async enviarMensaje(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string,
        options: any = {}
    ): Promise<void> {
        const sendOptions = { ...options };
        if (threadId) {
            sendOptions.message_thread_id = threadId;
        }
        await bot.telegram.sendMessage(chatId, texto, sendOptions);
    }

    /**
     * Genera mensaje de resumen de vehículo seleccionado
     */
    generarMensajeVehiculoSeleccionado(vehiculo: IVehicle): string {
        return (
            '🚗 *VEHÍCULO SELECCIONADO*\n\n' +
            `*${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}*\n` +
            `🎨 Color: ${vehiculo.color}\n` +
            `🔢 Serie: ${vehiculo.serie}\n` +
            `🚙 Placas: ${vehiculo.placas ?? 'Sin placas'}\n\n` +
            '*Datos del titular:*\n' +
            `👤 ${vehiculo.titular}\n` +
            `🆔 RFC: ${vehiculo.rfc}\n` +
            `📧 ${vehiculo.correo ?? 'Sin correo'}`
        );
    }

    /**
     * Genera botones de selección de método (OCR vs Manual)
     */
    generarBotonesMetodo(vehicleId: string): any[][] {
        return [
            [
                {
                    text: '📄 Subir PDF de Póliza',
                    callback_data: `ocr_metodo_pdf_${vehicleId}`
                }
            ],
            [
                {
                    text: '✍️ Ingresar Manualmente',
                    callback_data: `ocr_metodo_manual_${vehicleId}`
                }
            ],
            [
                {
                    text: '❌ Cancelar',
                    callback_data: 'poliza_cancelar'
                }
            ]
        ];
    }

    /**
     * Genera selector de fechas (últimos 7 días)
     */
    generarSelectorFecha(prefijoCB = 'ocr_fecha'): any[][] {
        const hoy = new Date();
        const botones: any[][] = [];

        for (let i = 0; i < 7; i++) {
            const fecha = new Date(hoy);
            fecha.setDate(hoy.getDate() - i);

            const fechaStr = fecha.toLocaleDateString('es-MX', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            const fechaISO = fecha.toISOString().split('T')[0];

            botones.push([
                {
                    text: i === 0 ? `📅 HOY - ${fechaStr}` : `📅 ${fechaStr}`,
                    callback_data: `${prefijoCB}_${fechaISO}`
                }
            ]);
        }

        return botones;
    }

    /**
     * Genera mensaje de éxito al asignar póliza
     */
    generarMensajeExito(datosPoliza: IDatosPoliza, vehiculo: IVehicle, poliza: IPolicy): string {
        const total = (datosPoliza.primerPago ?? 0) + (datosPoliza.segundoPago ?? 0);
        const escapeMarkdown = (t: string) => t.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

        return (
            '🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*\n\n' +
            `📋 *Póliza:* ${escapeMarkdown(datosPoliza.numeroPoliza!)}\n` +
            `🏢 *Aseguradora:* ${escapeMarkdown(datosPoliza.aseguradora!)}\n` +
            `👨‍💼 *Persona:* ${escapeMarkdown(datosPoliza.nombrePersona!)}\n` +
            `📅 *Emisión:* ${datosPoliza.fechaEmision!.toLocaleDateString('es-MX')}\n` +
            `📅 *Vence:* ${datosPoliza.fechaFinCobertura!.toLocaleDateString('es-MX')}\n\n` +
            '💰 *Pagos:*\n' +
            `• Primer pago: $${(datosPoliza.primerPago ?? 0).toLocaleString()}\n` +
            `• Segundo pago: $${(datosPoliza.segundoPago ?? 0).toLocaleString()}\n` +
            `• Total: $${total.toLocaleString()}\n\n` +
            '🚗 *Vehículo:*\n' +
            `${escapeMarkdown(vehiculo.marca)} ${escapeMarkdown(vehiculo.submarca)} ${vehiculo.año}\n` +
            (datosPoliza.modoOCR ? '\n🤖 *Registrado con OCR*' : '') +
            `\n\n🆔 ID: ${poliza._id}`
        );
    }

    /**
     * Genera mensaje de error por póliza duplicada
     */
    generarMensajeDuplicada(numeroPoliza: string): string {
        return (
            '⚠️ *PÓLIZA DUPLICADA*\n\n' +
            `El número de póliza *${numeroPoliza}* ya existe en el sistema.\n\n` +
            '📋 No se realizaron cambios:\n' +
            '• El vehículo permanece sin póliza asignada\n' +
            '• No se creó ningún registro nuevo\n\n' +
            '💡 *Opciones:*\n' +
            '• Verifica el número de póliza correcto\n' +
            '• Consulta la póliza existente con /consultar'
        );
    }

    /**
     * Genera mensaje de datos extraídos por OCR
     */
    generarMensajeOCR(
        datos: any,
        aseguradoraNormalizada: string,
        camposFaltantes: string[]
    ): string {
        let mensaje = '✅ *DATOS EXTRAÍDOS*\n\n';
        mensaje += `📊 Confianza: ${datos.confianza}%\n\n`;

        if (datos.numeroPoliza) {
            mensaje += `📋 *Póliza:* ${datos.numeroPoliza}\n`;
        }
        if (datos.aseguradora) {
            mensaje += `🏢 *Aseguradora:* ${aseguradoraNormalizada}\n`;
        }
        if (datos.fechaInicioVigencia) {
            mensaje += `📅 *Vigencia:* ${datos.fechaInicioVigencia.toLocaleDateString('es-MX')}\n`;
        }
        if (datos.primerPago) {
            mensaje += `💰 *Primer pago:* $${datos.primerPago.toLocaleString()}\n`;
        }
        if (datos.segundoPago) {
            mensaje += `💵 *Segundo pago:* $${datos.segundoPago.toLocaleString()}\n`;
        }

        // Campos faltantes (excluyendo nombrePersona que siempre se pregunta)
        const faltantes = camposFaltantes.filter(c => c !== 'nombrePersona');
        if (faltantes.length > 0) {
            mensaje += '\n⚠️ *Datos faltantes:*\n';
            const labels: Record<string, string> = {
                numeroPoliza: 'Número de Póliza',
                aseguradora: 'Aseguradora',
                fechaEmision: 'Fecha de vigencia',
                primerPago: 'Primer pago',
                segundoPago: 'Segundo pago'
            };
            for (const campo of faltantes) {
                mensaje += `• ${labels[campo] ?? campo}\n`;
            }
        }

        mensaje += '\n━━━━━━━━━━━━━━━━━━━━━\n';
        mensaje += 'Ahora completaremos los datos faltantes.';

        return mensaje;
    }

    /**
     * Botón de cancelar
     */
    generarBotonCancelar(): any[][] {
        return [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]];
    }

    /**
     * Obtiene el teclado principal
     */
    getMainKeyboard(): any {
        return getMainKeyboard();
    }
}

// Singleton
let instance: PolicyUIService | null = null;

export function getPolicyUIService(): PolicyUIService {
    if (!instance) {
        instance = new PolicyUIService();
    }
    return instance;
}

export default PolicyUIService;
