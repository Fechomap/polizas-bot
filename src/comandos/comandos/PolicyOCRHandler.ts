// src/comandos/comandos/PolicyOCRHandler.ts
/**
 * Handler refactorizado para el flujo OCR de registro de póliza
 * Delegación a servicios especializados siguiendo SRP
 */

import { VehicleController } from '../../controllers/vehicleController';
import StateKeyManager from '../../utils/StateKeyManager';
import Vehicle from '../../models/vehicle';
import { seedAseguradoras } from '../../models/aseguradora';
import { getInstance as getMistralOCR } from '../../services/MistralOCRService';
import { getPolicyFileService } from '../../services/PolicyFileService';
import { getPolicyCreationService } from '../../services/PolicyCreationService';
import { getPolicyValidationService } from '../../services/PolicyValidationService';
import { getPolicyUIService } from '../../services/PolicyUIService';
import {
    ESTADOS_ASIGNACION,
    CAMPOS_REQUERIDOS,
    type IBot,
    type IAsignacionEnProceso
} from '../../types/policy-assignment';
import type { IVehicle } from '../../types/database';

// Re-exportar estados para compatibilidad
export const ESTADOS_OCR = ESTADOS_ASIGNACION;

// Almacenamiento de asignaciones en proceso (thread-safe)
export const asignacionesOCR = StateKeyManager.createThreadSafeStateMap<IAsignacionEnProceso>();

// Servicios singleton
const fileService = getPolicyFileService();
const creationService = getPolicyCreationService();
const validationService = getPolicyValidationService();
const uiService = getPolicyUIService();

/**
 * Handler principal para el flujo OCR - Refactorizado
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
            const vehiculo = await this.buscarVehiculo(vehicleId);
            if (!vehiculo) {
                await uiService.enviarMensaje(bot, chatId, threadId, '❌ Vehículo no encontrado.');
                return false;
            }

            if (vehiculo.estado !== 'SIN_POLIZA') {
                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    `❌ Este vehículo ya tiene póliza asignada.\nEstado actual: ${vehiculo.estado}`
                );
                return false;
            }

            // Asegurar catálogo de aseguradoras
            await seedAseguradoras();

            // Limpiar asignación previa
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
            asignacionesOCR.delete(stateKey);

            // Mostrar resumen del vehículo y opciones
            const mensaje =
                uiService.generarMensajeVehiculoSeleccionado(vehiculo) +
                '\n\n━━━━━━━━━━━━━━━━━━━━━\n' +
                '💼 *MÉTODO DE REGISTRO*\n\n' +
                'Elige cómo deseas registrar la póliza:';

            await uiService.enviarMensaje(bot, chatId, threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarBotonesMetodo(vehicleId) }
            });

            // Inicializar estado
            asignacionesOCR.set(stateKey, {
                estado: ESTADOS_ASIGNACION.SELECCION_METODO,
                chatId,
                threadId,
                vehiculo,
                datosPoliza: { modoOCR: false },
                iniciado: new Date()
            });

            return true;
        } catch (error) {
            console.error('[PolicyOCRHandler] Error iniciando asignación:', error);
            await uiService.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error al iniciar la asignación.'
            );
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
        _vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) {
            await uiService.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ No hay asignación en proceso.'
            );
            return false;
        }

        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF_OCR;
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

        await uiService.enviarMensaje(bot, chatId, threadId, mensaje, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: uiService.generarBotonCancelar() }
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
        _vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) {
            await uiService.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ No hay asignación en proceso.'
            );
            return false;
        }

        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA;
        asignacion.datosPoliza.modoOCR = false;
        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            '✍️ *REGISTRO MANUAL*\n\n*Paso 1/5:* Ingresa el *número de póliza*',
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarBotonCancelar() }
            }
        );

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

        if (!asignacion || asignacion.estado !== ESTADOS_ASIGNACION.ESPERANDO_PDF_OCR) {
            return false;
        }

        // Validar archivo
        const validacion = validationService.validarArchivoPoliza(msg);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`, {
                parse_mode: 'Markdown'
            });
            return true;
        }

        // Mostrar mensaje de procesamiento
        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            '🔄 *Procesando documento...*\n\n🤖 Extrayendo datos con IA\nEsto puede tomar unos segundos...',
            { parse_mode: 'Markdown' }
        );

        try {
            const fileInfo = validacion.valorProcesado;

            // Descargar archivo
            const descarga = await fileService.descargarArchivoTelegram(bot, fileInfo.fileId);
            if (!descarga.success) {
                throw new Error(descarga.error);
            }

            // Guardar archivo en estado
            asignacion.datosPoliza.archivo = {
                type: fileInfo.type,
                file_id: fileInfo.fileId,
                file_name: fileInfo.fileName,
                file_size: descarga.buffer.length,
                mime_type: fileInfo.mimeType,
                buffer: descarga.buffer
            };

            // Procesar con Mistral OCR
            const mistral = getMistralOCR();
            if (!mistral.isConfigured()) {
                return await this.continuarSinOCR(bot, chatId, threadId, asignacion, stateKey);
            }

            const resultado = await mistral.extraerDatosPoliza(
                descarga.buffer,
                fileInfo.mimeType,
                fileInfo.fileName
            );

            if (!resultado.success || !resultado.datos) {
                return await this.continuarSinOCR(bot, chatId, threadId, asignacion, stateKey);
            }

            // Procesar datos extraídos
            await this.procesarDatosOCR(
                bot,
                chatId,
                threadId,
                asignacion,
                stateKey,
                resultado.datos
            );
            return true;
        } catch (error) {
            console.error('[PolicyOCRHandler] Error procesando archivo:', error);
            await uiService.enviarMensaje(
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
     * Procesa una respuesta de texto durante el flujo
     */
    static async procesarRespuestaTexto(bot: IBot, msg: any, userId: string): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id || null;
        const texto: string | undefined = msg.text?.trim();
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesOCR.get(stateKey);

        if (!asignacion) return false;

        const handlers: Record<string, () => Promise<boolean>> = {
            [ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA]: () =>
                this.procesarNumeroPoliza(bot, chatId, threadId, texto, asignacion, stateKey),
            [ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA]: () =>
                this.procesarAseguradora(bot, chatId, threadId, texto, asignacion, stateKey),
            [ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA]: () =>
                this.procesarNombrePersona(bot, chatId, threadId, texto, asignacion, stateKey),
            [ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO]: () =>
                this.procesarPrimerPago(bot, chatId, threadId, texto, asignacion, stateKey),
            [ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO]: () =>
                this.procesarSegundoPago(bot, chatId, threadId, texto, asignacion, stateKey),
            [ESTADOS_ASIGNACION.ESPERANDO_DATO_FALTANTE]: () =>
                this.procesarDatoFaltante(bot, chatId, threadId, texto, asignacion, stateKey),
            [ESTADOS_ASIGNACION.ESPERANDO_PDF_FINAL]: async () => {
                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '📎 *Archivo requerido*\n\nEnvía un PDF o foto de la póliza.',
                    { parse_mode: 'Markdown' }
                );
                return true;
            }
        };

        const handler = handlers[asignacion.estado];
        return handler ? await handler() : false;
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
        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura =
            creationService.calcularFechaFinCobertura(fechaEmision);

        // Remover de faltantes si existe
        asignacion.datosPoliza.camposFaltantes = (
            asignacion.datosPoliza.camposFaltantes || []
        ).filter(c => c !== 'fechaEmision');

        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Fecha de vigencia: *${fechaEmision.toLocaleDateString('es-MX')}*`,
            { parse_mode: 'Markdown' }
        );

        await this.pedirSiguienteCampoFaltante(bot, chatId, threadId, asignacion, stateKey);
        return true;
    }

    // ==================== MÉTODOS PRIVADOS ====================

    private static async buscarVehiculo(vehicleId: string): Promise<IVehicle | null> {
        try {
            const foundVehicle = await Vehicle.findById(vehicleId);
            if (foundVehicle) return foundVehicle;
        } catch {
            const result = await VehicleController.buscarVehiculo(vehicleId);
            if (result.success && result.vehiculo) return result.vehiculo;
        }
        return null;
    }

    private static async continuarSinOCR(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            '⚠️ *OCR no disponible*\n\nContinuaremos con el registro manual.\n📄 El PDF se guardó correctamente.',
            { parse_mode: 'Markdown' }
        );

        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA;
        asignacion.datosPoliza.modoOCR = false;
        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            '*Paso 1/5:* Ingresa el *número de póliza*',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    private static async procesarDatosOCR(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionEnProceso,
        stateKey: string,
        datosOCR: any
    ): Promise<void> {
        asignacion.datosPoliza.datosOCR = datosOCR;

        // Mapear datos extraídos
        if (datosOCR.numeroPoliza) {
            asignacion.datosPoliza.numeroPoliza = datosOCR.numeroPoliza;
        }
        if (datosOCR.aseguradora) {
            const validacion = await validationService.validarAseguradora(datosOCR.aseguradora);
            asignacion.datosPoliza.aseguradora = validacion.valorProcesado;
        }
        if (datosOCR.fechaInicioVigencia) {
            asignacion.datosPoliza.fechaEmision = datosOCR.fechaInicioVigencia;
            asignacion.datosPoliza.fechaFinCobertura = creationService.calcularFechaFinCobertura(
                datosOCR.fechaInicioVigencia
            );
        }
        if (datosOCR.primerPago) {
            asignacion.datosPoliza.primerPago = datosOCR.primerPago;
        }
        if (datosOCR.segundoPago) {
            asignacion.datosPoliza.segundoPago = datosOCR.segundoPago;
        }

        // Determinar campos faltantes
        const camposFaltantes: string[] = [];
        if (!asignacion.datosPoliza.numeroPoliza) camposFaltantes.push('numeroPoliza');
        if (!asignacion.datosPoliza.aseguradora) camposFaltantes.push('aseguradora');
        camposFaltantes.push('nombrePersona'); // Siempre se pregunta
        if (!asignacion.datosPoliza.fechaEmision) camposFaltantes.push('fechaEmision');
        if (!asignacion.datosPoliza.primerPago) camposFaltantes.push('primerPago');
        if (!asignacion.datosPoliza.segundoPago) camposFaltantes.push('segundoPago');

        asignacion.datosPoliza.camposFaltantes = camposFaltantes;

        // Mostrar resumen
        const mensaje = uiService.generarMensajeOCR(
            datosOCR,
            asignacion.datosPoliza.aseguradora || datosOCR.aseguradora,
            camposFaltantes
        );
        await uiService.enviarMensaje(bot, chatId, threadId, mensaje, { parse_mode: 'Markdown' });

        // Iniciar flujo de datos faltantes
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_DATO_FALTANTE;
        asignacionesOCR.set(stateKey, asignacion);

        await this.pedirSiguienteCampoFaltante(bot, chatId, threadId, asignacion, stateKey);
    }

    private static async pedirSiguienteCampoFaltante(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<void> {
        const camposFaltantes = asignacion.datosPoliza.camposFaltantes || [];

        if (camposFaltantes.length === 0) {
            // Todos los campos completados - verificar si falta segundo pago
            if (asignacion.datosPoliza.segundoPago && asignacion.datosPoliza.segundoPago > 0) {
                // Ya tenemos segundo pago del OCR
                // Verificar si ya tenemos el PDF guardado (del OCR inicial)
                if (asignacion.datosPoliza.archivo?.buffer) {
                    // Ya tenemos el PDF, finalizar directamente
                    const total =
                        (asignacion.datosPoliza.primerPago || 0) +
                        (asignacion.datosPoliza.segundoPago || 0);
                    await uiService.enviarMensaje(
                        bot,
                        chatId,
                        threadId,
                        `✅ *Datos completos*\n\n` +
                            `💰 Primer pago: $${(asignacion.datosPoliza.primerPago || 0).toLocaleString()}\n` +
                            `💵 Segundo pago: $${asignacion.datosPoliza.segundoPago.toLocaleString()}\n` +
                            `📊 Total: $${total.toLocaleString()}\n\n` +
                            '⏳ Guardando póliza...',
                        { parse_mode: 'Markdown' }
                    );

                    // Finalizar directamente con el PDF ya guardado
                    await this.finalizarAsignacion(bot, chatId, threadId, asignacion, stateKey);
                    return;
                }

                // No tenemos PDF, pedirlo
                asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF_FINAL;
                asignacionesOCR.set(stateKey, asignacion);

                const total =
                    (asignacion.datosPoliza.primerPago || 0) +
                    (asignacion.datosPoliza.segundoPago || 0);
                await uiService.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    `✅ *Datos completos*\n\n` +
                        `💰 Primer pago: $${(asignacion.datosPoliza.primerPago || 0).toLocaleString()}\n` +
                        `💵 Segundo pago: $${asignacion.datosPoliza.segundoPago.toLocaleString()}\n` +
                        `📊 Total: $${total.toLocaleString()}\n\n` +
                        '📄 Ahora envía el *PDF de la póliza* para guardarlo',
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // No tenemos segundo pago, pedirlo
            asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO;
            asignacionesOCR.set(stateKey, asignacion);

            await uiService.enviarMensaje(
                bot,
                chatId,
                threadId,
                `✅ Primer pago: $${(asignacion.datosPoliza.primerPago || 0).toLocaleString()}\n\n` +
                    'Ahora ingresa el *SEGUNDO PAGO*\n💰 Solo el monto\n📝 Ejemplo: 3500',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const campoActual = camposFaltantes[0];
        asignacion.datosPoliza.campoActual = campoActual;
        asignacionesOCR.set(stateKey, asignacion);

        if (campoActual === 'fechaEmision') {
            await uiService.enviarMensaje(
                bot,
                chatId,
                threadId,
                '*Selecciona la fecha de inicio de vigencia:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: uiService.generarSelectorFecha() }
                }
            );
            return;
        }

        const config = CAMPOS_REQUERIDOS.find(c => c.key === campoActual);
        if (config?.pregunta) {
            await uiService.enviarMensaje(bot, chatId, threadId, config.pregunta, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarBotonCancelar() }
            });
        }
    }

    private static async procesarDatoFaltante(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        if (!texto) return true;

        const campoActual = asignacion.datosPoliza.campoActual;
        if (!campoActual) return false;

        const validacion = await validationService.validarCampo(campoActual, texto);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        // Asignar valor procesado
        (asignacion.datosPoliza as any)[campoActual] = validacion.valorProcesado;

        // Remover campo de faltantes
        asignacion.datosPoliza.camposFaltantes = (
            asignacion.datosPoliza.camposFaltantes || []
        ).filter(c => c !== campoActual);

        asignacionesOCR.set(stateKey, asignacion);
        await this.pedirSiguienteCampoFaltante(bot, chatId, threadId, asignacion, stateKey);
        return true;
    }

    static async procesarNumeroPoliza(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarNumeroPoliza(texto);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.numeroPoliza = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA;
        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Póliza: *${validacion.valorProcesado}*\n\n*Paso 2/5:* Ingresa la *aseguradora*\n📝 Ejemplo: GNP, AXA, Qualitas`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    static async procesarAseguradora(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = await validationService.validarAseguradora(texto);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.aseguradora = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA;
        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Aseguradora: *${validacion.valorProcesado}*\n\n*Paso 3/5:* Ingresa el *nombre de la persona que cotizó*`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    static async procesarNombrePersona(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarNombrePersona(texto);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.nombrePersona = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION;
        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Persona: *${validacion.valorProcesado}*\n\n*Paso 4/5:* Selecciona la *fecha de emisión*`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarSelectorFecha() }
            }
        );
        return true;
    }

    static async confirmarFechaManual(
        bot: IBot,
        chatId: number,
        userId: string,
        fechaISO: string,
        threadId: number | null = null
    ): Promise<boolean> {
        return await this.procesarFechaCallback(bot, chatId, userId, fechaISO, threadId);
    }

    static async procesarPrimerPago(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarMontoPago(texto);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.primerPago = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO;
        asignacionesOCR.set(stateKey, asignacion);

        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Primer pago: $${validacion.valorProcesado.toLocaleString()}\n\nAhora ingresa el *SEGUNDO PAGO*\n💰 Solo el monto\n📝 Ejemplo: 3500`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    static async procesarSegundoPago(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarMontoPago(texto);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.segundoPago = validacion.valorProcesado;

        // Si ya tiene archivo del OCR, finalizar
        if (asignacion.datosPoliza.archivo) {
            return await this.finalizarAsignacion(bot, chatId, threadId, asignacion, stateKey);
        }

        // Si no, pedir PDF
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF_FINAL;
        asignacionesOCR.set(stateKey, asignacion);

        const total = (asignacion.datosPoliza.primerPago || 0) + validacion.valorProcesado;
        await uiService.enviarMensaje(
            bot,
            chatId,
            threadId,
            `✅ Segundo pago: $${validacion.valorProcesado.toLocaleString()}\n\n💰 *Total: $${total.toLocaleString()}*\n\n📎 *OBLIGATORIO:* Envía el PDF o foto de la póliza`,
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

        if (!asignacion || asignacion.estado !== ESTADOS_ASIGNACION.ESPERANDO_PDF_FINAL) {
            return false;
        }

        const validacion = validationService.validarArchivoPoliza(msg);
        if (!validacion.valido) {
            await uiService.enviarMensaje(bot, chatId, threadId, `❌ ${validacion.error}`, {
                parse_mode: 'Markdown'
            });
            return true;
        }

        try {
            const fileInfo = validacion.valorProcesado;
            const descarga = await fileService.descargarArchivoTelegram(bot, fileInfo.fileId);

            if (!descarga.success) {
                throw new Error(descarga.error);
            }

            asignacion.datosPoliza.archivo = {
                type: fileInfo.type,
                file_id: fileInfo.fileId,
                file_name: fileInfo.fileName,
                file_size: descarga.buffer.length,
                mime_type: fileInfo.mimeType,
                buffer: descarga.buffer
            };

            return await this.finalizarAsignacion(bot, chatId, threadId, asignacion, stateKey);
        } catch (error) {
            console.error('[PolicyOCRHandler] Error procesando PDF final:', error);
            await uiService.enviarMensaje(
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
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        try {
            await uiService.enviarMensaje(bot, chatId, threadId, '🔄 *Procesando asignación...*', {
                parse_mode: 'Markdown'
            });

            // Crear póliza
            const resultado = await creationService.crearPoliza({
                vehiculo: asignacion.vehiculo,
                datosPoliza: asignacion.datosPoliza,
                userId: stateKey.split(':')[0],
                modoOCR: asignacion.datosPoliza.modoOCR
            });

            if (!resultado.success) {
                const mensaje = resultado.esDuplicada
                    ? uiService.generarMensajeDuplicada(asignacion.datosPoliza.numeroPoliza!)
                    : `❌ Error al crear la póliza: ${resultado.error}`;

                await uiService.enviarMensaje(bot, chatId, threadId, mensaje, {
                    parse_mode: 'Markdown'
                });
                asignacionesOCR.delete(stateKey);
                return true;
            }

            const poliza = resultado.poliza!;

            // Marcar vehículo con póliza
            await creationService.marcarVehiculoConPoliza(
                asignacion.vehiculo._id.toString(),
                poliza._id.toString()
            );

            // Transferir fotos del vehículo
            await fileService.transferirFotosVehiculo(asignacion.vehiculo, poliza);

            // Subir archivo a R2
            if (asignacion.datosPoliza.archivo?.buffer) {
                const uploadResult = await fileService.subirArchivo(
                    asignacion.datosPoliza.archivo,
                    asignacion.datosPoliza.numeroPoliza!
                );
                if (uploadResult.success) {
                    await fileService.guardarReferenciaArchivo(
                        poliza._id.toString(),
                        asignacion.datosPoliza.archivo,
                        uploadResult
                    );
                }
            }

            // Mensaje de éxito
            const mensaje = uiService.generarMensajeExito(
                asignacion.datosPoliza,
                asignacion.vehiculo,
                poliza
            );

            await uiService.enviarMensaje(bot, chatId, threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: uiService.getMainKeyboard()
            });

            asignacionesOCR.delete(stateKey);
            return true;
        } catch (error) {
            console.error('[PolicyOCRHandler] Error finalizando:', error);
            await uiService.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error al finalizar la asignación.',
                { parse_mode: 'Markdown' }
            );
            asignacionesOCR.delete(stateKey);
            return true;
        }
    }

    // ==================== MÉTODOS DE UTILIDAD ====================

    static tieneAsignacionEnProceso(
        userId: string,
        chatId: number,
        threadId: number | null = null
    ): boolean {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return asignacionesOCR.has(stateKey);
    }

    static obtenerAsignacion(
        userId: string,
        chatId: number,
        threadId: number | null = null
    ): IAsignacionEnProceso | undefined {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return asignacionesOCR.get(stateKey);
    }

    static cancelarAsignacion(
        userId: string,
        chatId: number,
        threadId: number | null = null
    ): void {
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        asignacionesOCR.delete(stateKey);
    }
}

export default PolicyOCRHandler;
