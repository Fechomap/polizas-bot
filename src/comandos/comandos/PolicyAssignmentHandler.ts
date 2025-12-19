// src/comandos/comandos/PolicyAssignmentHandler.ts
/**
 * Handler refactorizado para asignación manual de pólizas
 * Delegación a servicios especializados siguiendo SRP
 */

import { VehicleController } from '../../controllers/vehicleController';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import { prisma } from '../../database/prisma';
import { getPolicyFileService } from '../../services/PolicyFileService';
import { getPolicyCreationService } from '../../services/PolicyCreationService';
import { getPolicyValidationService } from '../../services/PolicyValidationService';
import { getPolicyUIService } from '../../services/PolicyUIService';
import {
    ESTADOS_ASIGNACION,
    type IBot,
    type IAsignacionEnProceso,
    type ISendOptions
} from '../../types/policy-assignment';
import type { IVehicle } from '../../types/database';
import logger from '../../utils/logger';
import stateCleanupService from '../../utils/StateCleanupService';

// Re-exportar para compatibilidad
export { ESTADOS_ASIGNACION };
export type { IAsignacionEnProceso };

// Almacenamiento de asignaciones (thread-safe)
export const asignacionesEnProceso =
    StateKeyManager.createThreadSafeStateMap<IAsignacionEnProceso>();

// Registrar cleanup para estados huérfanos
const assignmentCleanupProvider = {
    async cleanup(cutoffTime: number): Promise<number> {
        let removed = 0;
        const internalMap = asignacionesEnProceso.getInternalMap();

        for (const [key, asignacion] of internalMap.entries()) {
            const asignacionTime = asignacion.iniciado?.getTime() ?? 0;
            if (asignacionTime < cutoffTime) {
                internalMap.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            logger.info(`PolicyAssignmentHandler: ${removed} asignaciones huérfanas limpiadas`);
        }
        return removed;
    }
};
stateCleanupService.registerStateProvider(assignmentCleanupProvider, 'PolicyAssignmentHandler');

// Servicios singleton
const fileService = getPolicyFileService();
const creationService = getPolicyCreationService();
const validationService = getPolicyValidationService();
const uiService = getPolicyUIService();

/**
 * Handler para la asignación manual de pólizas - Refactorizado
 */
export class PolicyAssignmentHandler {
    /**
     * Muestra los vehículos disponibles para asegurar
     */
    static async mostrarVehiculosDisponibles(
        bot: IBot,
        chatId: number,
        _userId: string,
        threadId: number | null = null,
        pagina = 1
    ): Promise<boolean> {
        try {
            const resultado = await VehicleController.getVehiculosSinPoliza(10, pagina);

            if (!resultado.success) {
                await this.enviarMensaje(bot, chatId, threadId, `❌ Error: ${resultado.error}`);
                return false;
            }

            if (!resultado.vehiculos || resultado.vehiculos.length === 0) {
                await this.enviarMensaje(
                    bot,
                    chatId,
                    threadId,
                    '📋 *NO HAY VEHÍCULOS DISPONIBLES*\n\n' +
                        'No se encontraron vehículos sin póliza para asegurar.\n' +
                        'Solicita al equipo OBD que registre más vehículos.',
                    { parse_mode: 'Markdown', reply_markup: getMainKeyboard() }
                );
                return true;
            }

            // Construir mensaje y botones
            const { mensaje, botones } = this.construirListaVehiculos(
                resultado.vehiculos,
                resultado.pagination,
                pagina
            );

            await this.enviarMensaje(bot, chatId, threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: botones }
            });

            return true;
        } catch (error) {
            console.error('Error mostrando vehículos disponibles:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error al consultar vehículos disponibles.'
            );
            return false;
        }
    }

    /**
     * Inicia el proceso de asignación de póliza
     */
    static async iniciarAsignacion(
        bot: IBot,
        chatId: number,
        userId: string,
        vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        try {
            // Buscar vehículo
            const vehiculo = await this.buscarVehiculo(vehicleId);
            if (!vehiculo) {
                await this.enviarMensaje(bot, chatId, threadId, '❌ Vehículo no encontrado.');
                return false;
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

            // Limpiar asignación previa
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
            asignacionesEnProceso.delete(stateKey);

            // Construir mensaje de resumen
            const mensaje = this.construirMensajeVehiculo(vehiculo);

            await this.enviarMensaje(bot, chatId, threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarBotonCancelar() }
            });

            // Inicializar estado
            asignacionesEnProceso.set(stateKey, {
                estado: ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA,
                chatId,
                threadId,
                vehiculo,
                datosPoliza: {},
                iniciado: new Date()
            });

            return true;
        } catch (error) {
            console.error('Error iniciando asignación:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error al iniciar la asignación de póliza.'
            );
            return false;
        }
    }

    /**
     * Procesa los mensajes durante el flujo
     */
    static async procesarMensaje(bot: IBot, msg: any, userId: string): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id ?? null;
        const texto: string | undefined = msg.text?.trim();

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesEnProceso.get(stateKey);

        if (!asignacion) return false;

        try {
            const handlers: Record<string, () => Promise<boolean>> = {
                [ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA]: () =>
                    this.procesarNumeroPoliza(bot, chatId, texto, asignacion, stateKey),
                [ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA]: () =>
                    this.procesarAseguradora(bot, chatId, texto, asignacion, stateKey),
                [ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA]: () =>
                    this.procesarNombrePersona(bot, chatId, texto, asignacion, stateKey),
                [ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION]: () => Promise.resolve(false),
                [ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO]: () =>
                    this.procesarPrimerPago(bot, chatId, texto, asignacion, stateKey),
                [ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO]: () =>
                    this.procesarSegundoPago(bot, chatId, texto, asignacion, stateKey),
                [ESTADOS_ASIGNACION.ESPERANDO_PDF]: () =>
                    this.procesarPDF(bot, msg, userId, asignacion, stateKey)
            };

            const handler = handlers[asignacion.estado];
            return handler ? await handler() : false;
        } catch (error) {
            console.error('Error procesando mensaje de asignación:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                threadId,
                '❌ Error en la asignación. Intenta nuevamente.'
            );
            return true;
        }
    }

    /**
     * Procesa el número de póliza
     */
    private static async procesarNumeroPoliza(
        bot: IBot,
        chatId: number,
        numeroPoliza: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarNumeroPoliza(numeroPoliza);
        if (!validacion.valido) {
            await this.enviarMensaje(bot, chatId, asignacion.threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.numeroPoliza = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA;
        asignacionesEnProceso.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            asignacion.threadId,
            `✅ Número de póliza: *${validacion.valorProcesado}*\n\n` +
                '*Paso 2/5:* Ingresa la *aseguradora*\n📝 Ejemplo: GNP, Seguros Monterrey, AXA',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa la aseguradora
     */
    private static async procesarAseguradora(
        bot: IBot,
        chatId: number,
        aseguradora: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = await validationService.validarAseguradora(aseguradora);
        if (!validacion.valido) {
            await this.enviarMensaje(bot, chatId, asignacion.threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.aseguradora = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA;
        asignacionesEnProceso.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            asignacion.threadId,
            `✅ Aseguradora: *${validacion.valorProcesado}*\n\n` +
                '*Paso 3/5:* Ingresa el *nombre de la persona* que cotizó\n📝 Ejemplo: Juan Pérez',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el nombre de la persona
     */
    private static async procesarNombrePersona(
        bot: IBot,
        chatId: number,
        nombre: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarNombrePersona(nombre);
        if (!validacion.valido) {
            await this.enviarMensaje(bot, chatId, asignacion.threadId, `❌ ${validacion.error}`);
            return true;
        }

        asignacion.datosPoliza.nombrePersona = validacion.valorProcesado;
        asignacionesEnProceso.set(stateKey, asignacion);

        await this.mostrarSelectorFechaEmision(bot, chatId, asignacion);
        return true;
    }

    /**
     * Muestra selector de fecha de emisión
     */
    private static async mostrarSelectorFechaEmision(
        bot: IBot,
        chatId: number,
        asignacion: IAsignacionEnProceso
    ): Promise<void> {
        asignacion.estado = ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION;

        await this.enviarMensaje(
            bot,
            chatId,
            asignacion.threadId,
            `✅ Persona que cotizó: *${asignacion.datosPoliza.nombrePersona}*\n\n` +
                '*Paso 4/5:* Selecciona la *fecha de emisión*\n📅 Elige el día correspondiente:',
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: uiService.generarSelectorFecha('fecha_emision') }
            }
        );
    }

    /**
     * Confirma la fecha de emisión seleccionada
     */
    static async confirmarFechaEmision(
        bot: IBot,
        chatId: number,
        fechaISO: string,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const fechaEmision = new Date(fechaISO);
        const fechaFin = creationService.calcularFechaFinCobertura(fechaEmision);

        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura = fechaFin;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO;
        asignacionesEnProceso.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            asignacion.threadId,
            `✅ Fecha de emisión: *${fechaEmision.toLocaleDateString('es-MX')}*\n` +
                `✅ Fecha de fin: *${fechaFin.toLocaleDateString('es-MX')}* (automática)\n\n` +
                '*Paso 5/5:* Ingresa el *PRIMER PAGO*\n💰 Solo el monto\n📝 Ejemplo: 8500',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el primer pago
     */
    private static async procesarPrimerPago(
        bot: IBot,
        chatId: number,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarMontoPago(texto);
        if (!validacion.valido) {
            await this.enviarMensaje(
                bot,
                chatId,
                asignacion.threadId,
                `❌ ${validacion.error}\n💰 Solo números\n📝 Ejemplo: 8500`
            );
            return true;
        }

        asignacion.datosPoliza.primerPago = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO;
        asignacionesEnProceso.set(stateKey, asignacion);

        await this.enviarMensaje(
            bot,
            chatId,
            asignacion.threadId,
            `✅ Primer pago: $${validacion.valorProcesado.toLocaleString()}\n\n` +
                'Ahora ingresa el *SEGUNDO PAGO*\n💰 Solo el monto\n📝 Ejemplo: 3500',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el segundo pago
     */
    private static async procesarSegundoPago(
        bot: IBot,
        chatId: number,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const validacion = validationService.validarMontoPago(texto);
        if (!validacion.valido) {
            await this.enviarMensaje(
                bot,
                chatId,
                asignacion.threadId,
                `❌ ${validacion.error}\n💰 Solo números\n📝 Ejemplo: 3500`
            );
            return true;
        }

        asignacion.datosPoliza.segundoPago = validacion.valorProcesado;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF;
        asignacionesEnProceso.set(stateKey, asignacion);

        const total = (asignacion.datosPoliza.primerPago ?? 0) + validacion.valorProcesado;

        await this.enviarMensaje(
            bot,
            chatId,
            asignacion.threadId,
            `✅ Segundo pago: $${validacion.valorProcesado.toLocaleString()}\n\n` +
                `💰 *Total de la póliza: $${total.toLocaleString()}*\n\n` +
                '📎 *OBLIGATORIO:* Envía el PDF o foto de la póliza\n🔗 Formatos: PDF, JPG, PNG',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el PDF o foto de la póliza
     */
    private static async procesarPDF(
        bot: IBot,
        msg: any,
        userId: string,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const chatId = msg.chat.id;

        // Si envía texto en lugar de archivo
        if (msg.text && !msg.document && !msg.photo) {
            await this.enviarMensaje(
                bot,
                chatId,
                asignacion.threadId,
                '❌ **ARCHIVO OBLIGATORIO**\n\n📎 Envía un PDF o foto de la póliza',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        const validacion = validationService.validarArchivoPoliza(msg);
        if (!validacion.valido) {
            await this.enviarMensaje(bot, chatId, asignacion.threadId, `❌ ${validacion.error}`, {
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

            await this.enviarMensaje(
                bot,
                chatId,
                asignacion.threadId,
                `✅ ${fileInfo.type === 'pdf' ? 'PDF' : 'Foto'} guardado: ${fileInfo.fileName}\n\n` +
                    '🎉 ¡Todos los datos completos!\nProcesando asignación...'
            );

            return await this.finalizarAsignacion(bot, chatId, userId, asignacion, stateKey);
        } catch (error) {
            console.error('Error procesando archivo:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                asignacion.threadId,
                '❌ Error al procesar el archivo. Intenta nuevamente.'
            );
            return true;
        }
    }

    /**
     * Finaliza la asignación de póliza
     */
    private static async finalizarAsignacion(
        bot: IBot,
        chatId: number,
        userId: string,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        try {
            // Crear póliza
            const resultado = await creationService.crearPoliza({
                vehiculo: asignacion.vehiculo,
                datosPoliza: asignacion.datosPoliza,
                userId
            });

            if (!resultado.success) {
                await this.enviarMensaje(
                    bot,
                    chatId,
                    asignacion.threadId,
                    `❌ Error al crear la póliza: ${resultado.error}`,
                    { parse_mode: 'Markdown' }
                );
                asignacionesEnProceso.delete(stateKey);
                return true;
            }

            const poliza = resultado.poliza!;

            // Marcar vehículo con póliza
            await creationService.marcarVehiculoConPoliza(
                asignacion.vehiculo.id.toString(),
                poliza.id.toString()
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
                        poliza.id.toString(),
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

            await this.enviarMensaje(bot, chatId, asignacion.threadId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            });

            asignacionesEnProceso.delete(stateKey);
            return true;
        } catch (error) {
            console.error('Error finalizando asignación:', error);
            await this.enviarMensaje(
                bot,
                chatId,
                asignacion.threadId,
                '❌ Error al finalizar la asignación de póliza.'
            );
            asignacionesEnProceso.delete(stateKey);
            return true;
        }
    }

    // ==================== MÉTODOS AUXILIARES ====================

    private static async buscarVehiculo(vehicleId: string): Promise<IVehicle | null> {
        try {
            const foundVehicle = await prisma.vehicle.findUnique({
                where: { id: vehicleId }
            });
            if (foundVehicle) return foundVehicle as unknown as IVehicle;
        } catch {
            const result = await VehicleController.buscarVehiculo(vehicleId);
            if (result.success && result.vehiculo) return result.vehiculo;
        }
        return null;
    }

    private static construirListaVehiculos(
        vehiculos: IVehicle[],
        pagination: any,
        pagina: number
    ): { mensaje: string; botones: any[][] } {
        let mensaje = '🚗 *VEHÍCULOS DISPONIBLES PARA ASEGURAR*\n\n';
        if (pagination) {
            mensaje += `📊 Página ${pagination.pagina} de ${pagination.totalPaginas}\n`;
            mensaje += `📈 Total: ${pagination.total} vehículos\n\n`;
        }

        const botones: any[][] = [];

        vehiculos.forEach((vehiculo, index) => {
            const numero = (pagina - 1) * 10 + index + 1;
            mensaje += `*${numero}.* 🚗 ${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.anio}\n`;
            mensaje += `   🎨 Color: ${vehiculo.color}\n`;
            mensaje += `   🔢 Serie: ${vehiculo.serie}\n`;
            mensaje += `   🚙 Placas: ${vehiculo.placas ?? 'Sin placas'}\n`;
            mensaje += `   👤 Titular: ${vehiculo.titular ?? 'Sin titular'}\n\n`;

            botones.push([
                {
                    text: `${numero}. ${vehiculo.marca} ${vehiculo.submarca}`,
                    callback_data: `asignar_${vehiculo.id}`
                }
            ]);
        });

        // Navegación
        const navegacion: any[] = [];
        if (pagination?.pagina > 1) {
            navegacion.push({ text: '⬅️ Anterior', callback_data: `vehiculos_pag_${pagina - 1}` });
        }
        if (pagination?.pagina < pagination?.totalPaginas) {
            navegacion.push({ text: 'Siguiente ➡️', callback_data: `vehiculos_pag_${pagina + 1}` });
        }
        if (navegacion.length > 0) botones.push(navegacion);

        botones.push([{ text: '🏠 Menú Principal', callback_data: 'accion:start' }]);

        return { mensaje, botones };
    }

    private static construirMensajeVehiculo(vehiculo: IVehicle): string {
        return (
            '🚗 *VEHÍCULO SELECCIONADO*\n\n' +
            `*${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.anio}*\n` +
            `🎨 Color: ${vehiculo.color}\n` +
            `🔢 Serie: ${vehiculo.serie}\n` +
            `🚙 Placas: ${vehiculo.placas ?? 'Sin placas'}\n\n` +
            '*Datos del titular:*\n' +
            `👤 ${vehiculo.titular}\n` +
            `🆔 RFC: ${vehiculo.rfc}\n` +
            `📧 ${vehiculo.correo ?? 'Sin correo'}\n\n` +
            '*Domicilio:*\n' +
            `🏠 ${vehiculo.calle ?? 'Sin calle'}\n` +
            `🏘️ ${vehiculo.colonia ?? 'Sin colonia'}\n` +
            `🏙️ ${vehiculo.municipio ?? ''}, ${vehiculo.estadoRegion ?? ''}\n` +
            `📮 CP: ${vehiculo.cp ?? 'Sin código postal'}\n\n` +
            '💼 *INICIAR ASIGNACIÓN DE PÓLIZA*\n\n' +
            '*Paso 1/5:* Ingresa el *número de póliza*'
        );
    }

    private static async enviarMensaje(
        bot: IBot,
        chatId: number,
        threadId: number | null,
        texto: string,
        options: ISendOptions = {}
    ): Promise<void> {
        const sendOptions = { ...options };
        if (threadId) {
            sendOptions.message_thread_id = threadId;
        }
        await bot.telegram.sendMessage(chatId, texto, sendOptions);
    }

    // ==================== MÉTODOS DE UTILIDAD ====================

    static validarFecha(fechaStr: string): Date | null {
        const validacion = validationService.validarFecha(fechaStr);
        return validacion.valido ? validacion.valorProcesado : null;
    }

    static tieneAsignacionEnProceso(
        userId: string,
        chatId: number | null = null,
        threadId: number | null = null
    ): boolean {
        if (chatId === null) return false;
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return asignacionesEnProceso.has(stateKey);
    }

    static async transferirFotosVehiculoAPoliza(vehiculo: IVehicle, poliza: any): Promise<void> {
        await fileService.transferirFotosVehiculo(vehiculo, poliza);
    }
}

export default PolicyAssignmentHandler;
