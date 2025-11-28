// src/comandos/comandos/PolicyOCRHandler.ts
// Handler para el flujo alternativo de registro de póliza usando OCR con Mistral AI

import { VehicleController } from '../../controllers/vehicleController';
import * as policyController from '../../controllers/policyController';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import type { IVehicle, IPolicy } from '../../types/database';
import Vehicle from '../../models/vehicle';
import Policy from '../../models/policy';
import Aseguradora, { seedAseguradoras, IAseguradora } from '../../models/aseguradora';
import {
    getInstance as getMistralOCR,
    IDatosPolizaExtraidos
} from '../../services/MistralOCRService';

/**
 * Estados del flujo OCR de asignación de pólizas
 */
export const ESTADOS_OCR = {
    SELECCION_METODO: 'seleccion_metodo',
    ESPERANDO_PDF_OCR: 'esperando_pdf_ocr',
    PROCESANDO_OCR: 'procesando_ocr',
    CONFIRMANDO_DATOS: 'confirmando_datos',
    ESPERANDO_DATO_FALTANTE: 'esperando_dato_faltante',
    // Estados del flujo manual (heredados)
    ESPERANDO_NUMERO_POLIZA: 'esperando_numero_poliza',
    ESPERANDO_ASEGURADORA: 'esperando_aseguradora',
    ESPERANDO_NOMBRE_PERSONA: 'esperando_nombre_persona',
    SELECCIONANDO_FECHA_EMISION: 'seleccionando_fecha_emision',
    ESPERANDO_PRIMER_PAGO: 'esperando_primer_pago',
    ESPERANDO_SEGUNDO_PAGO: 'esperando_segundo_pago',
    ESPERANDO_PDF_FINAL: 'esperando_pdf_final',
    COMPLETADO: 'completado'
} as const;

type EstadoOCRType = (typeof ESTADOS_OCR)[keyof typeof ESTADOS_OCR];

/**
 * Campos requeridos para el registro de póliza
 */
const CAMPOS_REQUERIDOS = [
    { key: 'numeroPoliza', label: 'Número de Póliza', pregunta: 'Ingresa el *número de póliza*:' },
    {
        key: 'aseguradora',
        label: 'Aseguradora',
        pregunta: 'Ingresa la *aseguradora*:\n📝 Ejemplo: GNP, AXA, Qualitas'
    },
    {
        key: 'nombrePersona',
        label: 'Persona que cotizó',
        pregunta: 'Ingresa el *nombre de la persona que cotizó*:'
    },
    { key: 'fechaEmision', label: 'Fecha de vigencia', pregunta: null }, // Se maneja con selector
    {
        key: 'primerPago',
        label: 'Primer pago',
        pregunta: 'Ingresa el monto del *primer pago*:\n💰 Solo números\n📝 Ejemplo: 8500'
    },
    {
        key: 'segundoPago',
        label: 'Segundo pago',
        pregunta:
            'Ingresa el monto del *segundo pago* (pagos subsecuentes):\n💰 Solo números\n📝 Ejemplo: 850'
    }
];

interface IArchivoOCR {
    type: 'pdf' | 'photo';
    file_id: string;
    file_name: string;
    file_size?: number;
    mime_type: string;
    buffer: Buffer;
}

interface IDatosPolizaOCR {
    numeroPoliza?: string;
    aseguradora?: string;
    nombrePersona?: string;
    fechaEmision?: Date;
    fechaFinCobertura?: Date;
    primerPago?: number;
    segundoPago?: number;
    archivo?: IArchivoOCR;
    datosOCR?: IDatosPolizaExtraidos; // Datos extraídos por OCR
    modoOCR: boolean; // true si se está usando OCR
    campoActual?: string; // Campo que se está pidiendo actualmente
    camposFaltantes?: string[]; // Lista de campos que faltan por completar
}

interface IAsignacionOCR {
    estado: EstadoOCRType;
    chatId: number;
    threadId: number | null;
    vehiculo: IVehicle;
    datosPoliza: IDatosPolizaOCR;
    iniciado: Date;
}

interface IBot {
    telegram: {
        sendMessage(chatId: number, text: string, options?: any): Promise<any>;
        getFileLink(fileId: string): Promise<{ href: string }>;
        editMessageText(
            chatId: number,
            messageId: number,
            text: string,
            options?: any
        ): Promise<any>;
    };
}

// Almacenamiento de asignaciones en proceso
export const asignacionesOCR = StateKeyManager.createThreadSafeStateMap<IAsignacionOCR>();

/**
 * Handler principal para el flujo OCR
 */
export class PolicyOCRHandler {
    /**
     * Inicia el proceso de asignación mostrando opciones de método
     */
    static async iniciarAsignacionConOpciones(
        bot: IBot,
        chatId: number,
        userId: string,
        vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        try {
            // Buscar el vehículo
            let vehiculo: IVehicle;

            try {
                const foundVehicle = await Vehicle.findById(vehicleId);
                if (!foundVehicle) {
                    await this.enviarMensaje(bot, chatId, threadId, '❌ Vehículo no encontrado.');
                    return false;
                }
                vehiculo = foundVehicle;
            } catch {
                const vehicle = await VehicleController.buscarVehiculo(vehicleId);
                if (!vehicle.success || !vehicle.vehiculo) {
                    await this.enviarMensaje(bot, chatId, threadId, '❌ Vehículo no encontrado.');
                    return false;
                }
                vehiculo = vehicle.vehiculo;
            }

            if (vehiculo.estado !== 'SIN_POLIZA') {
                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    `❌ Este vehículo ya tiene póliza asignada.\nEstado actual: ${vehiculo.estado}`
                );
                return false;
            }

            // Asegurar que el catálogo de aseguradoras existe
            await seedAseguradoras();

            // Limpiar cualquier asignación previa
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
            asignacionesOCR.delete(stateKey);

            // Mostrar resumen del vehículo y opciones de método
            const mensaje =
                '🚗 *VEHÍCULO SELECCIONADO*\n\n' +
                `*${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}*\n` +
                `🎨 Color: ${vehiculo.color}\n` +
                `🔢 Serie: ${vehiculo.serie}\n` +
                `🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n\n` +
                '*Datos del titular:*\n' +
                `👤 ${vehiculo.titular}\n` +
                `🆔 RFC: ${vehiculo.rfc}\n` +
                `📧 ${vehiculo.correo || 'Sin correo'}\n\n` +
                '━━━━━━━━━━━━━━━━━━━━━\n' +
                '💼 *MÉTODO DE REGISTRO*\n\n' +
                'Elige cómo deseas registrar la póliza:';

            const botones = [
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

            await this.enviarMensaje(bot, chatId, threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: botones }
            });

            // Inicializar estado
            const asignacion: IAsignacionOCR = {
                estado: ESTADOS_OCR.SELECCION_METODO,
                chatId,
                threadId,
                vehiculo,
                datosPoliza: { modoOCR: false },
                iniciado: new Date()
            };

            asignacionesOCR.set(stateKey, asignacion);

            return true;
        } catch (error) {
            console.error('[PolicyOCRHandler] Error iniciando asignación:', error);
            await this.enviarMensaje(bot, chatId, threadId, '❌ Error al iniciar la asignación.');
            return false;
        }
    }

    /**
     * Maneja la selección del método OCR (PDF)
     */
    static async seleccionarMetodoOCR(
        bot: IBot,
        chatId: number,
        userId: string,
        vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) {
            await this.enviarMensaje(bot, chatId, threadId, '❌ No hay asignación en proceso.');
            return false;
        }

        asignacion.estado = ESTADOS_OCR.ESPERANDO_PDF_OCR;
        asignacion.datosPoliza.modoOCR = true;
        asignacionesOCR.set(stateKey, asignacion);

        const mensaje =
            '📄 *REGISTRO CON PDF*\n\n' +
            '🤖 *Extracción automática con IA*\n\n' +
            'Envía el PDF o foto de la póliza.\n' +
            'El sistema extraerá automáticamente:\n\n' +
            '• Número de póliza\n' +
            '• Aseguradora\n' +
            '• Fecha de vigencia\n' +
            '• Monto del primer pago\n\n' +
            '📎 *Formatos aceptados:* PDF, JPG, PNG\n' +
            '📑 Puedes enviar una o varias páginas';

        await this.enviarMensaje(bot, chatId, threadId, mensaje, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]]
            }
        });

        return true;
    }

    /**
     * Maneja la selección del método manual
     */
    static async seleccionarMetodoManual(
        bot: IBot,
        chatId: number,
        userId: string,
        vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) {
            await this.enviarMensaje(bot, chatId, threadId, '❌ No hay asignación en proceso.');
            return false;
        }

        asignacion.estado = ESTADOS_OCR.ESPERANDO_NUMERO_POLIZA;
        asignacion.datosPoliza.modoOCR = false;
        asignacionesOCR.set(stateKey, asignacion);

        const mensaje = '✍️ *REGISTRO MANUAL*\n\n' + '*Paso 1/5:* Ingresa el *número de póliza*';

        await this.enviarMensaje(bot, chatId, threadId, mensaje, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]]
            }
        });

        return true;
    }

    /**
     * Procesa un PDF/imagen recibido para OCR
     */
    static async procesarArchivoOCR(bot: IBot, msg: any, userId: string): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id || null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion || asignacion.estado !== ESTADOS_OCR.ESPERANDO_PDF_OCR) {
            return false;
        }

        let fileId: string;
        let fileName: string;
        let mimeType: string;

        // Determinar tipo de archivo
        if (msg.document && msg.document.mime_type === 'application/pdf') {
            fileId = msg.document.file_id;
            fileName = msg.document.file_name || 'documento.pdf';
            mimeType = 'application/pdf';
        } else if (msg.photo && msg.photo.length > 0) {
            const foto = msg.photo[msg.photo.length - 1];
            fileId = foto.file_id;
            fileName = `foto_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
        } else {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Formato no válido. Envía un PDF o una foto.',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        // Mostrar mensaje de procesamiento
        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            '🔄 *Procesando documento...*\n\n' +
                '🤖 Extrayendo datos con IA\n' +
                'Esto puede tomar unos segundos...',
            { parse_mode: 'Markdown' }
        );

        try {
            // Descargar archivo
            const fileLink = await bot.telegram.getFileLink(fileId);
            const response = await require('node-fetch')(fileLink.href);
            if (!response.ok) {
                throw new Error(`Error descargando archivo: ${response.status}`);
            }
            const buffer = await response.buffer();

            console.log(
                `[PolicyOCRHandler] Archivo descargado: ${fileName}, tamaño: ${buffer.length}`
            );

            // Guardar archivo en el estado
            asignacion.datosPoliza.archivo = {
                type: mimeType === 'application/pdf' ? 'pdf' : 'photo',
                file_id: fileId,
                file_name: fileName,
                file_size: buffer.length,
                mime_type: mimeType,
                buffer
            };

            // Procesar con Mistral OCR
            const mistral = getMistralOCR();

            if (!mistral.isConfigured()) {
                // Si Mistral no está configurado, continuar con flujo manual
                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '⚠️ *OCR no disponible*\n\n' +
                        'El servicio de extracción automática no está configurado.\n' +
                        'Continuaremos con el registro manual.\n\n' +
                        '📄 El PDF se guardó correctamente.',
                    { parse_mode: 'Markdown' }
                );

                asignacion.estado = ESTADOS_OCR.ESPERANDO_NUMERO_POLIZA;
                asignacion.datosPoliza.modoOCR = false;
                asignacionesOCR.set(stateKey, asignacion);

                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '*Paso 1/5:* Ingresa el *número de póliza*',
                    { parse_mode: 'Markdown' }
                );

                return true;
            }

            // Ejecutar OCR
            const resultado = await mistral.extraerDatosPoliza(buffer, mimeType, fileName);

            if (!resultado.success || !resultado.datos) {
                console.error('[PolicyOCRHandler] Error en OCR:', resultado.error);

                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '⚠️ *No se pudieron extraer datos*\n\n' +
                        'El sistema no pudo leer el documento.\n' +
                        'Continuaremos con el registro manual.\n\n' +
                        '📄 El PDF se guardó correctamente.',
                    { parse_mode: 'Markdown' }
                );

                asignacion.estado = ESTADOS_OCR.ESPERANDO_NUMERO_POLIZA;
                asignacion.datosPoliza.modoOCR = false;
                asignacionesOCR.set(stateKey, asignacion);

                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '*Paso 1/5:* Ingresa el *número de póliza*',
                    { parse_mode: 'Markdown' }
                );

                return true;
            }

            // Guardar datos extraídos
            asignacion.datosPoliza.datosOCR = resultado.datos;

            // Mapear datos extraídos a datosPoliza
            if (resultado.datos.numeroPoliza) {
                asignacion.datosPoliza.numeroPoliza = resultado.datos.numeroPoliza;
            }
            if (resultado.datos.aseguradora) {
                // Buscar aseguradora en el catálogo
                const aseguradoraDB = await Aseguradora.buscarPorNombre(
                    resultado.datos.aseguradora
                );
                asignacion.datosPoliza.aseguradora =
                    aseguradoraDB?.nombreCorto || resultado.datos.aseguradora;
            }
            if (resultado.datos.fechaInicioVigencia) {
                asignacion.datosPoliza.fechaEmision = resultado.datos.fechaInicioVigencia;

                // Calcular fecha de fin (1 año)
                const fechaFin = new Date(resultado.datos.fechaInicioVigencia);
                fechaFin.setFullYear(fechaFin.getFullYear() + 1);
                asignacion.datosPoliza.fechaFinCobertura = fechaFin;
            }
            if (resultado.datos.primerPago) {
                asignacion.datosPoliza.primerPago = resultado.datos.primerPago;
            }
            if (resultado.datos.segundoPago) {
                asignacion.datosPoliza.segundoPago = resultado.datos.segundoPago;
            }

            // Determinar campos faltantes
            const camposFaltantes: string[] = [];
            if (!asignacion.datosPoliza.numeroPoliza) camposFaltantes.push('numeroPoliza');
            if (!asignacion.datosPoliza.aseguradora) camposFaltantes.push('aseguradora');
            // nombrePersona siempre se pregunta
            camposFaltantes.push('nombrePersona');
            if (!asignacion.datosPoliza.fechaEmision) camposFaltantes.push('fechaEmision');
            if (!asignacion.datosPoliza.primerPago) camposFaltantes.push('primerPago');
            if (!asignacion.datosPoliza.segundoPago) camposFaltantes.push('segundoPago');

            asignacion.datosPoliza.camposFaltantes = camposFaltantes;

            // Mostrar resumen de datos extraídos
            let mensajeResumen = '✅ *DATOS EXTRAÍDOS*\n\n';
            mensajeResumen += `📊 Confianza: ${resultado.datos.confianza}%\n\n`;

            if (resultado.datos.numeroPoliza) {
                mensajeResumen += `📋 *Póliza:* ${resultado.datos.numeroPoliza}\n`;
            }
            if (resultado.datos.aseguradora) {
                mensajeResumen += `🏢 *Aseguradora:* ${asignacion.datosPoliza.aseguradora}\n`;
            }
            if (resultado.datos.fechaInicioVigencia) {
                mensajeResumen += `📅 *Vigencia:* ${resultado.datos.fechaInicioVigencia.toLocaleDateString('es-MX')}\n`;
            }
            if (resultado.datos.primerPago) {
                mensajeResumen += `💰 *Primer pago:* $${resultado.datos.primerPago.toLocaleString()}\n`;
            }
            if (resultado.datos.segundoPago) {
                mensajeResumen += `💵 *Segundo pago:* $${resultado.datos.segundoPago.toLocaleString()}\n`;
            }

            if (camposFaltantes.length > 1) {
                // > 1 porque nombrePersona siempre está
                mensajeResumen += '\n⚠️ *Datos faltantes:*\n';
                for (const campo of camposFaltantes) {
                    if (campo !== 'nombrePersona') {
                        const config = CAMPOS_REQUERIDOS.find(c => c.key === campo);
                        if (config) {
                            mensajeResumen += `• ${config.label}\n`;
                        }
                    }
                }
            }

            mensajeResumen += '\n━━━━━━━━━━━━━━━━━━━━━\n';
            mensajeResumen += 'Ahora completaremos los datos faltantes.';

            await this.enviarMensaje(bot, chatId, threadId, mensajeResumen, {
                parse_mode: 'Markdown'
            });

            // Iniciar flujo de datos faltantes
            asignacion.estado = ESTADOS_OCR.ESPERANDO_DATO_FALTANTE;
            asignacionesOCR.set(stateKey, asignacion);

            await this.pedirSiguienteCampoFaltante(bot, chatId, threadId, asignacion, stateKey);

            return true;
        } catch (error) {
            console.error('[PolicyOCRHandler] Error procesando archivo:', error);

            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error procesando el archivo. Intenta nuevamente.',
                { parse_mode: 'Markdown' }
            );

            return true;
        }
    }

    /**
     * Pide el siguiente campo faltante
     */
    static async pedirSiguienteCampoFaltante(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<void> {
        const camposFaltantes = asignacion.datosPoliza.camposFaltantes || [];

        if (camposFaltantes.length === 0) {
            // Todos los campos completados, ir a segundo pago
            asignacion.estado = ESTADOS_OCR.ESPERANDO_SEGUNDO_PAGO;
            asignacionesOCR.set(stateKey, asignacion);

            const totalConPrimero = asignacion.datosPoliza.primerPago || 0;

            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                `✅ Primer pago: $${totalConPrimero.toLocaleString()}\n\n` +
                    'Ahora ingresa el *SEGUNDO PAGO*\n' +
                    '💰 Solo el monto\n' +
                    '📝 Ejemplo: 3500',
                { parse_mode: 'Markdown' }
            );

            return;
        }

        const campoActual = camposFaltantes[0];
        asignacion.datosPoliza.campoActual = campoActual;
        asignacionesOCR.set(stateKey, asignacion);

        // Si es fecha de emisión, mostrar selector
        if (campoActual === 'fechaEmision') {
            await this.mostrarSelectorFecha(bot, chatId, threadId, asignacion);
            return;
        }

        // Para otros campos, mostrar pregunta
        const config = CAMPOS_REQUERIDOS.find(c => c.key === campoActual);
        if (config && config.pregunta) {
            await this.enviarMensaje(bot, chatId, threadId, config.pregunta, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]]
                }
            });
        }
    }

    /**
     * Muestra selector de fecha de emisión
     */
    static async mostrarSelectorFecha(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionOCR
    ): Promise<void> {
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
                    callback_data: `ocr_fecha_${fechaISO}`
                }
            ]);
        }

        const mensaje = '*Selecciona la fecha de inicio de vigencia:*';

        await this.enviarMensaje(bot, chatId, threadId, mensaje, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: botones }
        });
    }

    /**
     * Procesa una respuesta de texto durante el flujo de datos faltantes
     */
    static async procesarRespuestaTexto(bot: IBot, msg: any, userId: string): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id || null;
        const texto: string | undefined = msg.text?.trim();
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) return false;

        // Manejar estados del flujo manual
        switch (asignacion.estado) {
            case ESTADOS_OCR.ESPERANDO_NUMERO_POLIZA:
                return await this.procesarNumeroPoliza(
                    bot,
                    chatId,
                    threadId,
                    texto,
                    asignacion,
                    stateKey
                );

            case ESTADOS_OCR.ESPERANDO_ASEGURADORA:
                return await this.procesarAseguradora(
                    bot,
                    chatId,
                    threadId,
                    texto,
                    asignacion,
                    stateKey
                );

            case ESTADOS_OCR.ESPERANDO_NOMBRE_PERSONA:
                return await this.procesarNombrePersona(
                    bot,
                    chatId,
                    threadId,
                    texto,
                    asignacion,
                    stateKey
                );

            case ESTADOS_OCR.ESPERANDO_PRIMER_PAGO:
                return await this.procesarPrimerPago(
                    bot,
                    chatId,
                    threadId,
                    texto,
                    asignacion,
                    stateKey
                );

            case ESTADOS_OCR.ESPERANDO_SEGUNDO_PAGO:
                return await this.procesarSegundoPago(
                    bot,
                    chatId,
                    threadId,
                    texto,
                    asignacion,
                    stateKey
                );

            case ESTADOS_OCR.ESPERANDO_DATO_FALTANTE:
                return await this.procesarDatoFaltante(
                    bot,
                    chatId,
                    threadId,
                    texto,
                    asignacion,
                    stateKey
                );

            case ESTADOS_OCR.ESPERANDO_PDF_FINAL:
                // Si envía texto en lugar de archivo
                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '📎 *Archivo requerido*\n\nEnvía un PDF o foto de la póliza.',
                    { parse_mode: 'Markdown' }
                );
                return true;

            default:
                return false;
        }
    }

    /**
     * Procesa un dato faltante en el flujo OCR
     */
    static async procesarDatoFaltante(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        if (!texto) return true;

        const campoActual = asignacion.datosPoliza.campoActual;
        if (!campoActual) return false;

        let valido = true;
        let valorProcesado: any = texto;

        // Validar según el campo
        switch (campoActual) {
            case 'numeroPoliza':
                if (texto.length < 1) {
                    await this.enviarMensaje(
                        bot,
                        chatId,
                        threadId,
                        '❌ Ingresa un número de póliza válido.'
                    );
                    return true;
                }
                asignacion.datosPoliza.numeroPoliza = texto;
                break;

            case 'aseguradora':
                if (texto.length < 2) {
                    await this.enviarMensaje(
                        bot,
                        chatId,
                        threadId,
                        '❌ La aseguradora debe tener al menos 2 caracteres.'
                    );
                    return true;
                }
                // Buscar en catálogo
                const aseguradoraDB = await Aseguradora.buscarPorNombre(texto);
                asignacion.datosPoliza.aseguradora =
                    aseguradoraDB?.nombreCorto || texto.toUpperCase();
                break;

            case 'nombrePersona':
                if (texto.length < 3) {
                    await this.enviarMensaje(
                        bot,
                        chatId,
                        threadId,
                        '❌ El nombre debe tener al menos 3 caracteres.'
                    );
                    return true;
                }
                asignacion.datosPoliza.nombrePersona = texto;
                break;

            case 'primerPago':
                const montoPrimer = parseFloat(texto.replace(/[$,]/g, ''));
                if (isNaN(montoPrimer) || montoPrimer <= 0) {
                    await this.enviarMensaje(
                        bot,
                        chatId,
                        threadId,
                        '❌ Ingresa un monto válido (solo números).'
                    );
                    return true;
                }
                asignacion.datosPoliza.primerPago = montoPrimer;
                break;

            case 'segundoPago':
                const montoSegundo = parseFloat(texto.replace(/[$,]/g, ''));
                if (isNaN(montoSegundo) || montoSegundo <= 0) {
                    await this.enviarMensaje(
                        bot,
                        chatId,
                        threadId,
                        '❌ Ingresa un monto válido (solo números).'
                    );
                    return true;
                }
                asignacion.datosPoliza.segundoPago = montoSegundo;
                break;
        }

        // Remover campo de la lista de faltantes
        asignacion.datosPoliza.camposFaltantes = (
            asignacion.datosPoliza.camposFaltantes || []
        ).filter(c => c !== campoActual);

        asignacionesOCR.set(stateKey, asignacion);

        // Continuar con el siguiente campo
        await this.pedirSiguienteCampoFaltante(bot, chatId, threadId, asignacion, stateKey);

        return true;
    }

    /**
     * Procesa la selección de fecha (callback)
     */
    static async procesarFechaCallback(
        bot: IBot,
        chatId: number,
        userId: string,
        fechaISO: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) return false;

        const fechaEmision = new Date(fechaISO);
        const fechaFin = new Date(fechaEmision);
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);

        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura = fechaFin;

        // Remover de faltantes
        asignacion.datosPoliza.camposFaltantes = (
            asignacion.datosPoliza.camposFaltantes || []
        ).filter(c => c !== 'fechaEmision');

        asignacionesOCR.set(stateKey, asignacion);

        const fechaStr = fechaEmision.toLocaleDateString('es-MX');
        await this.enviarMensaje(bot, chatId, threadId, `✅ Fecha de vigencia: *${fechaStr}*`, {
            parse_mode: 'Markdown'
        });

        // Continuar con siguiente campo
        await this.pedirSiguienteCampoFaltante(bot, chatId, threadId, asignacion, stateKey);

        return true;
    }

    // ==================== MÉTODOS DEL FLUJO MANUAL ====================

    static async procesarNumeroPoliza(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        if (!texto || texto.length < 1) {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Ingresa un número de póliza válido.'
            );
            return true;
        }

        asignacion.datosPoliza.numeroPoliza = texto;
        asignacion.estado = ESTADOS_OCR.ESPERANDO_ASEGURADORA;
        asignacionesOCR.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Póliza: *${texto}*\n\n*Paso 2/5:* Ingresa la *aseguradora*\n📝 Ejemplo: GNP, AXA, Qualitas`,
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    static async procesarAseguradora(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        if (!texto || texto.length < 2) {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ La aseguradora debe tener al menos 2 caracteres.'
            );
            return true;
        }

        // Buscar en catálogo
        const aseguradoraDB = await Aseguradora.buscarPorNombre(texto);
        asignacion.datosPoliza.aseguradora = aseguradoraDB?.nombreCorto || texto.toUpperCase();
        asignacion.estado = ESTADOS_OCR.ESPERANDO_NOMBRE_PERSONA;
        asignacionesOCR.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Aseguradora: *${asignacion.datosPoliza.aseguradora}*\n\n*Paso 3/5:* Ingresa el *nombre de la persona que cotizó*`,
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    static async procesarNombrePersona(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        if (!texto || texto.length < 3) {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ El nombre debe tener al menos 3 caracteres.'
            );
            return true;
        }

        asignacion.datosPoliza.nombrePersona = texto;
        asignacionesOCR.set(stateKey, asignacion);

        // Mostrar selector de fecha
        await this.mostrarSelectorFechaManual(bot, chatId, threadId, asignacion);

        return true;
    }

    static async mostrarSelectorFechaManual(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionOCR
    ): Promise<void> {
        asignacion.estado = ESTADOS_OCR.SELECCIONANDO_FECHA_EMISION;

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
                    callback_data: `ocr_fecha_${fechaISO}`
                }
            ]);
        }

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Persona: *${asignacion.datosPoliza.nombrePersona}*\n\n*Paso 4/5:* Selecciona la *fecha de emisión*`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: botones }
            }
        );
    }

    static async confirmarFechaManual(
        bot: IBot,
        chatId: number,
        userId: string,
        fechaISO: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) return false;

        const fechaEmision = new Date(fechaISO);
        const fechaFin = new Date(fechaEmision);
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);

        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura = fechaFin;
        asignacion.estado = ESTADOS_OCR.ESPERANDO_PRIMER_PAGO;
        asignacionesOCR.set(stateKey, asignacion);

        const fechaStr = fechaEmision.toLocaleDateString('es-MX');
        const fechaFinStr = fechaFin.toLocaleDateString('es-MX');

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Emisión: *${fechaStr}*\n✅ Fin: *${fechaFinStr}*\n\n*Paso 5/5:* Ingresa el *PRIMER PAGO*\n💰 Solo el monto\n📝 Ejemplo: 8500`,
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    static async procesarPrimerPago(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        if (!texto) return true;

        const monto = parseFloat(texto.replace(/[$,]/g, ''));
        if (isNaN(monto) || monto <= 0) {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Ingresa un monto válido (solo números).'
            );
            return true;
        }

        asignacion.datosPoliza.primerPago = monto;
        asignacion.estado = ESTADOS_OCR.ESPERANDO_SEGUNDO_PAGO;
        asignacionesOCR.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Primer pago: $${monto.toLocaleString()}\n\nAhora ingresa el *SEGUNDO PAGO*\n💰 Solo el monto\n📝 Ejemplo: 3500`,
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    static async procesarSegundoPago(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        if (!texto) return true;

        const monto = parseFloat(texto.replace(/[$,]/g, ''));
        if (isNaN(monto) || monto <= 0) {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Ingresa un monto válido (solo números).'
            );
            return true;
        }

        asignacion.datosPoliza.segundoPago = monto;

        // Si ya tiene archivo del OCR, finalizar
        if (asignacion.datosPoliza.archivo) {
            return await this.finalizarAsignacion(bot, chatId, threadId, asignacion, stateKey);
        }

        // Si no, pedir PDF
        asignacion.estado = ESTADOS_OCR.ESPERANDO_PDF_FINAL;
        asignacionesOCR.set(stateKey, asignacion);

        const total = (asignacion.datosPoliza.primerPago || 0) + monto;

        await this.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Segundo pago: $${monto.toLocaleString()}\n\n💰 *Total: $${total.toLocaleString()}*\n\n📎 *OBLIGATORIO:* Envía el PDF o foto de la póliza`,
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el PDF final (para flujo manual)
     */
    static async procesarPDFFinal(bot: IBot, msg: any, userId: string): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id || null;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion || asignacion.estado !== ESTADOS_OCR.ESPERANDO_PDF_FINAL) {
            return false;
        }

        let fileId: string;
        let fileName: string;
        let mimeType: string;

        if (msg.document && msg.document.mime_type === 'application/pdf') {
            fileId = msg.document.file_id;
            fileName = msg.document.file_name || 'documento.pdf';
            mimeType = 'application/pdf';
        } else if (msg.photo && msg.photo.length > 0) {
            const foto = msg.photo[msg.photo.length - 1];
            fileId = foto.file_id;
            fileName = `foto_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
        } else {
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Formato no válido. Envía un PDF o una foto.',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        try {
            const fileLink = await bot.telegram.getFileLink(fileId);
            const response = await require('node-fetch')(fileLink.href);
            const buffer = await response.buffer();

            asignacion.datosPoliza.archivo = {
                type: mimeType === 'application/pdf' ? 'pdf' : 'photo',
                file_id: fileId,
                file_name: fileName,
                file_size: buffer.length,
                mime_type: mimeType,
                buffer
            };

            return await this.finalizarAsignacion(bot, chatId, threadId, asignacion, stateKey);
        } catch (error) {
            console.error('[PolicyOCRHandler] Error procesando PDF final:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error procesando archivo. Intenta nuevamente.'
            );
            return true;
        }
    }

    /**
     * Finaliza la asignación de póliza
     */
    static async finalizarAsignacion(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionOCR,
        stateKey: string
    ): Promise<boolean> {
        let polizaGuardada: IPolicy | null = null;

        try {
            const vehiculo = asignacion.vehiculo;
            const datos = asignacion.datosPoliza;

            await this.enviarMensaje(bot, chatId, threadId, '🔄 *Procesando asignación...*', {
                parse_mode: 'Markdown'
            });

            // Crear póliza
            const nuevaPoliza: any = {
                marca: vehiculo.marca,
                submarca: vehiculo.submarca,
                año: vehiculo.año,
                color: vehiculo.color,
                serie: vehiculo.serie,
                placas: vehiculo.placas,
                titular: vehiculo.titular,
                rfc: vehiculo.rfc,
                telefono: vehiculo.telefono,
                correo: vehiculo.correo,
                calle: vehiculo.calle,
                colonia: vehiculo.colonia,
                municipio: vehiculo.municipio,
                estadoRegion: vehiculo.estadoRegion,
                cp: vehiculo.cp,
                numeroPoliza: datos.numeroPoliza,
                aseguradora: datos.aseguradora,
                agenteCotizador: datos.nombrePersona,
                fechaEmision: datos.fechaEmision,
                fechaFinCobertura: datos.fechaFinCobertura,
                pagos: [
                    {
                        monto: datos.primerPago,
                        fechaPago: datos.fechaEmision,
                        estado: 'PLANIFICADO',
                        notas: 'Pago inicial'
                    },
                    {
                        monto: datos.segundoPago,
                        fechaPago: (() => {
                            const f = new Date(datos.fechaEmision!);
                            f.setMonth(f.getMonth() + 1);
                            return f;
                        })(),
                        estado: 'PLANIFICADO',
                        notas: 'Pago mensual'
                    }
                ].filter(p => p.monto),
                vehicleId: vehiculo._id,
                creadoViaOBD: true,
                asignadoPor: stateKey.split(':')[0]
            };

            polizaGuardada = await policyController.savePolicy(nuevaPoliza);

            // Marcar vehículo con póliza
            await VehicleController.marcarConPoliza(
                vehiculo._id.toString(),
                polizaGuardada._id.toString()
            );

            // Transferir fotos del vehículo
            await this.transferirFotosVehiculo(vehiculo, polizaGuardada);

            // Subir archivo a R2
            if (datos.archivo?.buffer) {
                await this.subirArchivoR2(datos, polizaGuardada);
            }

            const total = (datos.primerPago || 0) + (datos.segundoPago || 0);
            const escapeMarkdown = (t: string) => t.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

            const mensaje =
                '🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*\n\n' +
                `📋 *Póliza:* ${escapeMarkdown(datos.numeroPoliza!)}\n` +
                `🏢 *Aseguradora:* ${escapeMarkdown(datos.aseguradora!)}\n` +
                `👨‍💼 *Persona:* ${escapeMarkdown(datos.nombrePersona!)}\n` +
                `📅 *Emisión:* ${datos.fechaEmision!.toLocaleDateString('es-MX')}\n` +
                `📅 *Vence:* ${datos.fechaFinCobertura!.toLocaleDateString('es-MX')}\n\n` +
                '💰 *Pagos:*\n' +
                `• Primer pago: $${(datos.primerPago || 0).toLocaleString()}\n` +
                `• Segundo pago: $${(datos.segundoPago || 0).toLocaleString()}\n` +
                `• Total: $${total.toLocaleString()}\n\n` +
                '🚗 *Vehículo:*\n' +
                `${escapeMarkdown(vehiculo.marca)} ${escapeMarkdown(vehiculo.submarca)} ${vehiculo.año}\n` +
                (datos.modoOCR ? '\n🤖 *Registrado con OCR*' : '') +
                `\n\n🆔 ID: ${polizaGuardada._id}`;

            await this.enviarMensaje(bot, chatId, threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            });

            asignacionesOCR.delete(stateKey);
            return true;
        } catch (error: any) {
            let msg = '❌ Error al finalizar la asignación.';

            // Detectar error de póliza duplicada (error esperado, no necesita stack trace)
            if (
                error?.name === 'DuplicatePolicyError' ||
                error?.message?.includes('Ya existe una póliza')
            ) {
                const numeroPoliza = asignacion.datosPoliza.numeroPoliza || 'desconocido';
                console.log(`[PolicyOCRHandler] Póliza duplicada detectada: ${numeroPoliza}`);
                msg =
                    '⚠️ *PÓLIZA DUPLICADA*\n\n' +
                    `El número de póliza *${numeroPoliza}* ya existe en el sistema.\n\n` +
                    '📋 No se realizaron cambios:\n' +
                    '• El vehículo permanece sin póliza asignada\n' +
                    '• No se creó ningún registro nuevo\n\n' +
                    '💡 *Opciones:*\n' +
                    '• Verifica el número de póliza correcto\n' +
                    '• Consulta la póliza existente con /consultar';
            } else {
                // Error inesperado, sí mostramos el stack trace
                console.error('[PolicyOCRHandler] Error finalizando:', error);
                if (polizaGuardada?._id) {
                    msg += `\n\n⚠️ Póliza creada parcialmente:\n🆔 ${polizaGuardada._id}`;
                }
            }

            await this.enviarMensaje(bot, chatId, threadId, msg, { parse_mode: 'Markdown' });
            asignacionesOCR.delete(stateKey);
            return true;
        }
    }

    /**
     * Sube archivo a Cloudflare R2
     */
    private static async subirArchivoR2(datos: IDatosPolizaOCR, poliza: IPolicy): Promise<void> {
        try {
            const { getInstance } = require('../../services/CloudflareStorage');
            const storage = getInstance();

            let uploadResult: any;
            if (datos.archivo!.type === 'pdf') {
                uploadResult = await storage.uploadPolicyPDF(
                    datos.archivo!.buffer,
                    datos.numeroPoliza!,
                    datos.archivo!.file_name
                );
            } else {
                const fileName = `polizas/${datos.numeroPoliza}/foto_${datos.archivo!.file_name}`;
                uploadResult = await storage.uploadFile(
                    datos.archivo!.buffer,
                    fileName,
                    datos.archivo!.mime_type
                );
            }

            if (uploadResult?.url) {
                const polizaDB = await Policy.findById(poliza._id);
                if (polizaDB) {
                    if (!polizaDB.archivos) {
                        polizaDB.archivos = {
                            fotos: [],
                            pdfs: [],
                            r2Files: { fotos: [], pdfs: [] }
                        };
                    }
                    if (!polizaDB.archivos.r2Files) {
                        polizaDB.archivos.r2Files = { fotos: [], pdfs: [] };
                    }

                    const r2File = {
                        url: uploadResult.url,
                        key: uploadResult.key,
                        size: uploadResult.size,
                        contentType: uploadResult.contentType,
                        uploadDate: new Date(),
                        originalName: datos.archivo!.file_name
                    };

                    if (datos.archivo!.type === 'pdf') {
                        polizaDB.archivos.r2Files.pdfs.push(r2File);
                    } else {
                        polizaDB.archivos.r2Files.fotos.push(r2File);
                    }

                    await polizaDB.save();
                    console.log(`[PolicyOCRHandler] Archivo subido a R2: ${uploadResult.url}`);
                }
            }
        } catch (error) {
            console.error('[PolicyOCRHandler] Error subiendo a R2:', error);
        }
    }

    /**
     * Transfiere fotos del vehículo a la póliza
     */
    private static async transferirFotosVehiculo(
        vehiculo: IVehicle,
        poliza: IPolicy
    ): Promise<void> {
        try {
            if (!vehiculo.archivos?.r2Files?.fotos?.length) return;

            const polizaDB = await Policy.findById(poliza._id);
            if (!polizaDB) return;

            if (!polizaDB.archivos) {
                polizaDB.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
            }
            if (!polizaDB.archivos.r2Files) {
                polizaDB.archivos.r2Files = { fotos: [], pdfs: [] };
            }

            for (const foto of vehiculo.archivos.r2Files.fotos) {
                polizaDB.archivos.r2Files.fotos.push({
                    url: foto.url,
                    key: foto.key,
                    size: foto.size,
                    contentType: foto.contentType || 'image/jpeg',
                    uploadDate: foto.uploadDate || new Date(),
                    originalName: foto.originalName || 'foto_vehiculo.jpg',
                    fuenteOriginal: 'vehiculo_bd_autos'
                });
            }

            await polizaDB.save();
            console.log(
                `[PolicyOCRHandler] ${vehiculo.archivos.r2Files.fotos.length} fotos transferidas`
            );
        } catch (error) {
            console.error('[PolicyOCRHandler] Error transfiriendo fotos:', error);
        }
    }

    /**
     * Verifica si hay asignación OCR en proceso
     */
    static tieneAsignacionEnProceso(
        userId: string,
        chatId: number,
        threadId: number | null = null
    ): boolean {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return asignacionesOCR.has(stateKey);
    }

    /**
     * Obtiene la asignación en proceso
     */
    static obtenerAsignacion(
        userId: string,
        chatId: number,
        threadId: number | null = null
    ): IAsignacionOCR | undefined {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return asignacionesOCR.get(stateKey);
    }

    /**
     * Cancela la asignación en proceso
     */
    static cancelarAsignacion(
        userId: string,
        chatId: number,
        threadId: number | null = null
    ): void {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        asignacionesOCR.delete(stateKey);
    }

    /**
     * Helper para enviar mensajes
     */
    private static async enviarMensaje(
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
}

export default PolicyOCRHandler;
