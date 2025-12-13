// src/services/PolicyUIService.ts
/**
 * Servicio de interfaz de usuario para flujos de pólizas
 * Responsabilidad única: mensajes, teclados y formateo
 */

import { getMainKeyboard } from '../comandos/teclados';
import type { IBot, IDatosPoliza, CampoEditablePoliza } from '../types/policy-assignment';
import { CAMPOS_EDITABLES_POLIZA } from '../types/policy-assignment';
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
            '*Datos temporales del titular:*\n' +
            `👤 ${vehiculo.titular}\n` +
            `🆔 RFC: ${vehiculo.rfc}\n` +
            `📧 ${vehiculo.correo ?? 'Sin correo'}\n\n` +
            '*Domicilio:*\n' +
            `🏠 ${vehiculo.calle ?? 'Sin calle'}\n` +
            `🏘️ ${vehiculo.colonia ?? 'Sin colonia'}\n` +
            `🏙️ ${vehiculo.municipio ?? ''}, ${vehiculo.estadoRegion ?? ''}\n` +
            `📮 CP: ${vehiculo.cp ?? 'Sin código postal'}`
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
            `\n\n🆔 ID: ${poliza.id}`
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
     * Genera mensaje de resumen editable con todos los datos extraídos
     * Muestra el valor de cada campo y permite editar cualquiera
     */
    generarMensajeResumenEditable(datosPoliza: IDatosPoliza): string {
        const formatearValor = (valor: any, tipo: string): string => {
            if (valor === undefined || valor === null) return '❓ _Sin valor_';
            if (tipo === 'fecha' && valor instanceof Date) {
                return valor.toLocaleDateString('es-MX');
            }
            if (tipo === 'monto') {
                return `$${Number(valor).toLocaleString('es-MX')}`;
            }
            return String(valor);
        };

        let mensaje = '📋 *DATOS EXTRAÍDOS DE LA PÓLIZA*\n\n';

        for (const campo of CAMPOS_EDITABLES_POLIZA) {
            const valor = (datosPoliza as any)[campo.key];
            const valorFormateado = formatearValor(valor, campo.tipo);
            const iconoEstado = valor !== undefined && valor !== null ? '✅' : '⚠️';
            mensaje += `${iconoEstado} ${campo.icon} *${campo.label}:* ${valorFormateado}\n`;
        }

        // Mostrar confianza si viene del OCR
        if (datosPoliza.datosOCR?.confianza) {
            mensaje += `\n📊 Confianza OCR: ${datosPoliza.datosOCR.confianza}%\n`;
        }

        mensaje += '\n━━━━━━━━━━━━━━━━━━━━━\n';
        mensaje += '¿Deseas editar algún dato?\n';
        mensaje += '_Presiona un botón para modificar el campo_';

        return mensaje;
    }

    /**
     * Genera botones de edición para cada campo de la póliza
     * Dos botones por fila para mejor visualización
     */
    generarBotonesEdicion(prefijoCB = 'ocr_edit'): any[][] {
        const botones: any[][] = [];

        // Generar botones de edición en pares (2 por fila)
        for (let i = 0; i < CAMPOS_EDITABLES_POLIZA.length; i += 2) {
            const fila: any[] = [];

            // Primer botón de la fila
            const campo1 = CAMPOS_EDITABLES_POLIZA[i];
            fila.push({
                text: `${campo1.icon} ${campo1.label}`,
                callback_data: `${prefijoCB}_${campo1.key}`
            });

            // Segundo botón si existe
            if (i + 1 < CAMPOS_EDITABLES_POLIZA.length) {
                const campo2 = CAMPOS_EDITABLES_POLIZA[i + 1];
                fila.push({
                    text: `${campo2.icon} ${campo2.label}`,
                    callback_data: `${prefijoCB}_${campo2.key}`
                });
            }

            botones.push(fila);
        }

        // Separador visual y botones de acción
        botones.push([{ text: '✅ Confirmar datos', callback_data: `${prefijoCB}_confirmar` }]);
        botones.push([{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]);

        return botones;
    }

    /**
     * Genera mensaje de solicitud de edición para un campo específico
     */
    generarMensajeEdicionCampo(campo: CampoEditablePoliza, valorActual: any): string {
        const campoInfo = CAMPOS_EDITABLES_POLIZA.find(c => c.key === campo);
        if (!campoInfo) return 'Campo no encontrado';

        const formatearValor = (valor: any): string => {
            if (valor === undefined || valor === null) return '_Sin valor actual_';
            if (campoInfo.tipo === 'fecha' && valor instanceof Date) {
                return valor.toLocaleDateString('es-MX');
            }
            if (campoInfo.tipo === 'monto') {
                return `$${Number(valor).toLocaleString('es-MX')}`;
            }
            return String(valor);
        };

        let mensaje = `${campoInfo.icon} *EDITAR ${campoInfo.label.toUpperCase()}*\n\n`;
        mensaje += `Valor actual: \`${formatearValor(valorActual)}\`\n\n`;

        // Instrucciones según tipo de campo
        switch (campoInfo.tipo) {
            case 'fecha':
                mensaje += '📅 Ingresa la fecha en formato:\n';
                mensaje += '• DD/MM/YYYY (ej: 02/12/2025)\n';
                mensaje += '• DD-MM-YYYY (ej: 02-12-2025)';
                break;
            case 'monto':
                mensaje += '💰 Ingresa el monto sin símbolos:\n';
                mensaje += '• Solo números (ej: 1545.09)\n';
                mensaje += '• No uses comas ni símbolo $';
                break;
            default:
                mensaje += 'Escribe el nuevo valor:';
        }

        return mensaje;
    }

    /**
     * Botón para volver al resumen después de editar
     */
    generarBotonVolverResumen(prefijoCB = 'ocr_edit'): any[][] {
        return [
            [{ text: '🔙 Volver al resumen', callback_data: `${prefijoCB}_volver` }],
            [{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]
        ];
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
    instance ??= new PolicyUIService();
    return instance;
}

export default PolicyUIService;
