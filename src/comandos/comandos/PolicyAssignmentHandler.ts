import { VehicleController } from '../../controllers/vehicleController';
import * as policyController from '../../controllers/policyController';
import { getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import { BotContext } from '../../../types';
import type { IVehicle, IPolicy } from '../../types/database';
import type { Context } from 'telegraf';
import Vehicle from '../../models/vehicle';
import Policy from '../../models/policy';

/**
 * Estados del flujo de asignación de pólizas
 */
interface IEstadosAsignacion {
    readonly SELECCIONANDO_VEHICULO: 'seleccionando_vehiculo';
    readonly ESPERANDO_NUMERO_POLIZA: 'esperando_numero_poliza';
    readonly ESPERANDO_ASEGURADORA: 'esperando_aseguradora';
    readonly ESPERANDO_NOMBRE_PERSONA: 'esperando_nombre_persona';
    readonly SELECCIONANDO_FECHA_EMISION: 'seleccionando_fecha_emision';
    readonly ESPERANDO_PRIMER_PAGO: 'esperando_primer_pago';
    readonly ESPERANDO_SEGUNDO_PAGO: 'esperando_segundo_pago';
    readonly ESPERANDO_PDF: 'esperando_pdf';
    readonly COMPLETADO: 'completado';
}

export const ESTADOS_ASIGNACION: IEstadosAsignacion = {
    SELECCIONANDO_VEHICULO: 'seleccionando_vehiculo',
    ESPERANDO_NUMERO_POLIZA: 'esperando_numero_poliza',
    ESPERANDO_ASEGURADORA: 'esperando_aseguradora',
    ESPERANDO_NOMBRE_PERSONA: 'esperando_nombre_persona',
    SELECCIONANDO_FECHA_EMISION: 'seleccionando_fecha_emision',
    ESPERANDO_PRIMER_PAGO: 'esperando_primer_pago',
    ESPERANDO_SEGUNDO_PAGO: 'esperando_segundo_pago',
    ESPERANDO_PDF: 'esperando_pdf',
    COMPLETADO: 'completado'
} as const;

type EstadoAsignacionType = (typeof ESTADOS_ASIGNACION)[keyof typeof ESTADOS_ASIGNACION];

interface IArchivoAsignacion {
    type: 'pdf' | 'photo';
    file_id: string;
    file_name: string;
    file_size?: number;
    mime_type: string;
    buffer: Buffer;
}

interface IDatosPoliza {
    numeroPoliza?: string;
    aseguradora?: string;
    nombrePersona?: string;
    fechaEmision?: Date;
    fechaFinCobertura?: Date;
    primerPago?: number;
    segundoPago?: number;
    archivo?: IArchivoAsignacion;
}

interface IAsignacionEnProceso {
    estado: EstadoAsignacionType;
    chatId: number;
    threadId: number | null;
    vehiculo: IVehicle;
    datosPoliza: IDatosPoliza;
    iniciado: Date;
}

interface IBot {
    telegram: {
        sendMessage(chatId: number, text: string, options?: any): Promise<any>;
        getFileLink(fileId: string): Promise<{ href: string }>;
    };
}

interface IPaginationResult {
    vehiculos: IVehicle[];
    pagination: {
        pagina: number;
        totalPaginas: number;
        total: number;
    };
}

interface IVehicleResult {
    success: boolean;
    vehiculos?: IVehicle[];
    pagination?: {
        pagina: number;
        totalPaginas: number;
        total: number;
    };
    error?: string;
}

interface IThreadSafeStateMap<T> {
    set: (key: string, value: T) => void;
    get: (key: string) => T | undefined;
    has: (key: string) => boolean;
    delete: (key: string) => boolean;
}

/**
 * Almacena temporalmente los datos de asignación en proceso
 * Usa StateKeyManager para thread-safety
 */
export const asignacionesEnProceso: IThreadSafeStateMap<IAsignacionEnProceso> =
    StateKeyManager.createThreadSafeStateMap<IAsignacionEnProceso>();

/**
 * Handler para la asignación de pólizas a vehículos
 */
export class PolicyAssignmentHandler {
    /**
     * Muestra los vehículos disponibles para asegurar
     */
    static async mostrarVehiculosDisponibles(
        bot: IBot,
        chatId: number,
        userId: string,
        threadId: number | null = null,
        pagina = 1
    ): Promise<boolean> {
        try {
            const resultado: IVehicleResult = await VehicleController.getVehiculosSinPoliza(
                10,
                pagina
            );

            if (!resultado.success) {
                const sendOptions: any = {};
                if (threadId) {
                    sendOptions.message_thread_id = threadId;
                }

                await bot.telegram.sendMessage(chatId, `❌ Error: ${resultado.error}`, sendOptions);
                return false;
            }

            if (!resultado.vehiculos || resultado.vehiculos.length === 0) {
                const sendOptions: any = {
                    parse_mode: 'Markdown',
                    reply_markup: getMainKeyboard()
                };
                if (threadId) {
                    sendOptions.message_thread_id = threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '📋 *NO HAY VEHÍCULOS DISPONIBLES*\n\n' +
                        'No se encontraron vehículos sin póliza para asegurar.\n' +
                        'Solicita al equipo OBD que registre más vehículos.',
                    sendOptions
                );
                return true;
            }

            let mensaje = '🚗 *VEHÍCULOS DISPONIBLES PARA ASEGURAR*\n\n';
            if (resultado.pagination) {
                mensaje += `📊 Página ${resultado.pagination.pagina} de ${resultado.pagination.totalPaginas}\n`;
                mensaje += `📈 Total: ${resultado.pagination.total} vehículos\n\n`;
            }

            const botones: any[][] = [];

            resultado.vehiculos.forEach((vehiculo: IVehicle, index: number) => {
                const numero = (pagina - 1) * 10 + index + 1;
                mensaje += `*${numero}.* 🚗 ${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}\n`;
                mensaje += `   🎨 Color: ${vehiculo.color}\n`;
                mensaje += `   🔢 Serie: ${vehiculo.serie}\n`;
                mensaje += `   🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n`;
                mensaje += `   👤 Titular: ${vehiculo.titular || 'Sin titular'}\n`;
                mensaje += `   📅 Registrado: ${new Date(vehiculo.createdAt).toLocaleDateString('es-MX')}\n\n`;

                // Botón para seleccionar este vehículo
                botones.push([
                    {
                        text: `${numero}. ${vehiculo.marca} ${vehiculo.submarca}`,
                        callback_data: `asignar_${vehiculo._id}`
                    }
                ]);
            });

            // Botones de navegación
            const navegacion: any[] = [];
            if (resultado.pagination && resultado.pagination.pagina > 1) {
                navegacion.push({
                    text: '⬅️ Anterior',
                    callback_data: `vehiculos_pag_${pagina - 1}`
                });
            }
            if (
                resultado.pagination &&
                resultado.pagination.pagina < resultado.pagination.totalPaginas
            ) {
                navegacion.push({
                    text: 'Siguiente ➡️',
                    callback_data: `vehiculos_pag_${pagina + 1}`
                });
            }
            if (navegacion.length > 0) {
                botones.push(navegacion);
            }

            // Botón de menú principal
            botones.push([{ text: '🏠 Menú Principal', callback_data: 'accion:start' }]);

            const sendOptions: any = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: botones
                }
            };
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            return true;
        } catch (error) {
            console.error('Error mostrando vehículos disponibles:', error);

            const sendOptions: any = {};
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al consultar vehículos disponibles.',
                sendOptions
            );
            return false;
        }
    }

    /**
     * Inicia el proceso de asignación de póliza a un vehículo específico
     */
    static async iniciarAsignacion(
        bot: IBot,
        chatId: number,
        userId: string,
        vehicleId: string,
        threadId: number | null = null
    ): Promise<boolean> {
        try {
            // Buscar el vehículo directamente por ID
            let vehiculo: IVehicle;

            try {
                const foundVehicle = await Vehicle.findById(vehicleId);
                if (!foundVehicle) {
                    const sendOptions: any = {};
                    if (threadId) {
                        sendOptions.message_thread_id = threadId;
                    }

                    await bot.telegram.sendMessage(
                        chatId,
                        '❌ Vehículo no encontrado.',
                        sendOptions
                    );
                    return false;
                }
                vehiculo = foundVehicle;
            } catch (error) {
                // Si falla por ID, intentar buscar por serie o placas
                const vehicle = await VehicleController.buscarVehiculo(vehicleId);
                if (!vehicle.success || !vehicle.vehiculo) {
                    const sendOptions: any = {};
                    if (threadId) {
                        sendOptions.message_thread_id = threadId;
                    }

                    await bot.telegram.sendMessage(
                        chatId,
                        '❌ Vehículo no encontrado.',
                        sendOptions
                    );
                    return false;
                }
                vehiculo = vehicle.vehiculo;
            }

            if (vehiculo.estado !== 'SIN_POLIZA') {
                const sendOptions: any = {};
                if (threadId) {
                    sendOptions.message_thread_id = threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Este vehículo ya tiene póliza asignada o no está disponible.\n' +
                        `Estado actual: ${vehiculo.estado}`,
                    sendOptions
                );
                return false;
            }

            // Limpiar cualquier asignación previa para este usuario en este contexto
            const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
            asignacionesEnProceso.delete(stateKey);

            // Mostrar resumen del vehículo seleccionado
            const mensaje =
                '🚗 *VEHÍCULO SELECCIONADO*\n\n' +
                `*${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}*\n` +
                `🎨 Color: ${vehiculo.color}\n` +
                `🔢 Serie: ${vehiculo.serie}\n` +
                `🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n\n` +
                '*Datos temporales del titular:*\n' +
                `👤 ${vehiculo.titular}\n` +
                `🆔 RFC: ${vehiculo.rfc}\n` +
                `📧 ${vehiculo.correo || 'Sin correo'}\n\n` +
                '*Domicilio:*\n' +
                `🏠 ${vehiculo.calle || 'Sin calle'}\n` +
                `🏘️ ${vehiculo.colonia || 'Sin colonia'}\n` +
                `🏙️ ${vehiculo.municipio || 'Sin municipio'}, ${vehiculo.estadoRegion || 'Sin estado'}\n` +
                `📮 CP: ${vehiculo.cp || 'Sin código postal'}\n\n` +
                '💼 *INICIAR ASIGNACIÓN DE PÓLIZA*\n\n' +
                '*Paso 1/5:* Ingresa el *número de póliza*';

            const sendOptions: any = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]]
                }
            };
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            // Inicializar el estado de asignación con thread-safety
            const asignacion: IAsignacionEnProceso = {
                estado: ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA,
                chatId: chatId,
                threadId: threadId,
                vehiculo: vehiculo,
                datosPoliza: {},
                iniciado: new Date()
            };

            asignacionesEnProceso.set(stateKey, asignacion);

            return true;
        } catch (error) {
            console.error('Error iniciando asignación:', error);

            const sendOptions: any = {};
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Error al iniciar la asignación de póliza.',
                sendOptions
            );
            return false;
        }
    }

    /**
     * Procesa los mensajes durante el flujo de asignación
     */
    static async procesarMensaje(bot: IBot, msg: any, userId: string): Promise<boolean> {
        const chatId: number = msg.chat.id;
        const threadId: number | null = msg.message_thread_id || null;
        const texto: string | undefined = msg.text?.trim();

        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        const asignacion = asignacionesEnProceso.get(stateKey);
        if (!asignacion) {
            return false; // No hay asignación en proceso para este usuario en este contexto
        }

        // La cancelación ahora se maneja via callback_data en BaseAutosCommand

        try {
            switch (asignacion.estado) {
                case ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA:
                    return await this.procesarNumeroPoliza(
                        bot,
                        chatId,
                        userId,
                        texto,
                        asignacion,
                        stateKey
                    );

                case ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA:
                    return await this.procesarAseguradora(
                        bot,
                        chatId,
                        userId,
                        texto,
                        asignacion,
                        stateKey
                    );

                case ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA:
                    return await this.procesarNombrePersona(
                        bot,
                        chatId,
                        userId,
                        texto,
                        asignacion,
                        stateKey
                    );

                case ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION:
                    return await this.procesarFechaEmision(
                        bot,
                        chatId,
                        userId,
                        texto,
                        asignacion,
                        stateKey
                    );

                case ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO:
                    return await this.procesarPrimerPago(
                        bot,
                        chatId,
                        userId,
                        texto,
                        asignacion,
                        stateKey
                    );

                case ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO:
                    return await this.procesarSegundoPago(
                        bot,
                        chatId,
                        userId,
                        texto,
                        asignacion,
                        stateKey
                    );

                case ESTADOS_ASIGNACION.ESPERANDO_PDF:
                    return await this.procesarPDF(bot, msg, userId, asignacion, stateKey);

                default:
                    return false;
            }
        } catch (error) {
            console.error('Error procesando mensaje de asignación:', error);
            await bot.telegram.sendMessage(
                chatId,
                '❌ Error en la asignación. Intenta nuevamente.'
            );
            return true;
        }
    }

    /**
     * Procesa el número de póliza (permite cualquier entrada manual)
     */
    static async procesarNumeroPoliza(
        bot: IBot,
        chatId: number,
        userId: string,
        numeroPoliza: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        if (!numeroPoliza || numeroPoliza.trim().length < 1) {
            const sendOptions: any = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Ingresa un número de póliza válido:',
                sendOptions
            );
            return true;
        }

        // Guardar el número sin validar si existe (permitir duplicados)
        asignacion.datosPoliza.numeroPoliza = numeroPoliza.trim();
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA;
        asignacionesEnProceso.set(stateKey, asignacion);

        const sendOptions: any = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Número de póliza: *${numeroPoliza}*\n\n` +
                '*Paso 2/5:* Ingresa la *aseguradora*\n' +
                '📝 Ejemplo: GNP, Seguros Monterrey, AXA',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa la aseguradora
     */
    static async procesarAseguradora(
        bot: IBot,
        chatId: number,
        userId: string,
        aseguradora: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        if (!aseguradora || aseguradora.trim().length < 2) {
            const sendOptions: any = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ La aseguradora debe tener al menos 2 caracteres:',
                sendOptions
            );
            return true;
        }

        asignacion.datosPoliza.aseguradora = aseguradora.trim();
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA;
        asignacionesEnProceso.set(stateKey, asignacion);

        const sendOptions: any = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Aseguradora: *${aseguradora}*\n\n` +
                '*Paso 3/5:* Ingresa el *nombre de la persona* que cotizó\n' +
                '📝 Ejemplo: Juan Pérez, María González',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa el nombre de la persona que cotizó
     */
    static async procesarNombrePersona(
        bot: IBot,
        chatId: number,
        userId: string,
        nombrePersona: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        if (!nombrePersona || nombrePersona.trim().length < 3) {
            const sendOptions: any = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ El nombre debe tener al menos 3 caracteres:',
                sendOptions
            );
            return true;
        }

        asignacion.datosPoliza.nombrePersona = nombrePersona.trim();
        asignacionesEnProceso.set(stateKey, asignacion);

        // Generar fecha de emisión automática y mostrar selector
        await this.mostrarSelectorFechaEmision(bot, chatId, asignacion);

        return true;
    }

    /**
     * Muestra selector de fecha de emisión (últimos 7 días)
     */
    static async mostrarSelectorFechaEmision(
        bot: IBot,
        chatId: number,
        asignacion: IAsignacionEnProceso
    ): Promise<void> {
        const hoy = new Date();
        const botones: any[][] = [];

        // Generar botones para los últimos 7 días
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
                    callback_data: `fecha_emision_${fechaISO}`
                }
            ]);
        }

        const mensaje =
            `✅ Persona que cotizó: *${asignacion.datosPoliza.nombrePersona}*\n\n` +
            '*Paso 4/5:* Selecciona la *fecha de emisión*\n' +
            '📅 Elige el día que corresponde al registro:';

        asignacion.estado = ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION;

        const sendOptions: any = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: botones
            }
        };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
    }

    /**
     * Procesa la selección de fecha de emisión (via callback)
     * Esta función ya no se usa directamente, se maneja via callback en BaseAutosCommand
     */
    static async procesarFechaEmision(
        bot: IBot,
        chatId: number,
        userId: string,
        fechaISO: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        // Esta función se mantiene por compatibilidad pero no se usa en el nuevo flujo
        return false;
    }

    /**
     * Procesa la fecha seleccionada y calcula automáticamente la fecha de fin
     */
    static async confirmarFechaEmision(
        bot: IBot,
        chatId: number,
        fechaISO: string,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const fechaEmision = new Date(fechaISO);

        // Calcular fecha de fin automáticamente (1 año después)
        const fechaFin = new Date(fechaEmision);
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);

        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura = fechaFin;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO;
        asignacionesEnProceso.set(stateKey, asignacion);

        const fechaEmisionStr = fechaEmision.toLocaleDateString('es-MX');
        const fechaFinStr = fechaFin.toLocaleDateString('es-MX');

        const sendOptions: any = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Fecha de emisión: *${fechaEmisionStr}*\n` +
                `✅ Fecha de fin: *${fechaFinStr}* (automática)\n\n` +
                '*Paso 5/5:* Ingresa el *PRIMER PAGO*\n' +
                '💰 Solo el monto\n' +
                '📝 Ejemplo: 8500',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa el primer pago (obligatorio - solo monto)
     */
    static async procesarPrimerPago(
        bot: IBot,
        chatId: number,
        userId: string,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        if (!texto) {
            return true;
        }

        // Validar que sea un número válido
        const monto = parseFloat(texto.trim());
        if (isNaN(monto) || monto <= 0) {
            const sendOptions: any = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Ingresa un monto válido\n' + '💰 Solo números\n' + '📝 Ejemplo: 8500',
                sendOptions
            );
            return true;
        }

        asignacion.datosPoliza.primerPago = monto;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO;
        asignacionesEnProceso.set(stateKey, asignacion);

        const sendOptions: any = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Primer pago: $${monto.toLocaleString()}\n\n` +
                'Ahora ingresa el *SEGUNDO PAGO*\n' +
                '💰 Solo el monto\n' +
                '📝 Ejemplo: 3500',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa el segundo pago (obligatorio - solo monto)
     */
    static async procesarSegundoPago(
        bot: IBot,
        chatId: number,
        userId: string,
        texto: string | undefined,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        if (!texto) {
            return true;
        }

        // Validar que sea un número válido
        const monto = parseFloat(texto.trim());
        if (isNaN(monto) || monto <= 0) {
            const sendOptions: any = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ Ingresa un monto válido\n' + '💰 Solo números\n' + '📝 Ejemplo: 3500',
                sendOptions
            );
            return true;
        }

        asignacion.datosPoliza.segundoPago = monto;

        // Ir directamente a PDF o finalización
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF;
        asignacionesEnProceso.set(stateKey, asignacion);

        const totalPagos = (asignacion.datosPoliza.primerPago || 0) + monto;

        const sendOptions: any = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(
            chatId,
            `✅ Segundo pago: $${monto.toLocaleString()}\n\n` +
                `💰 *Total de la póliza: $${totalPagos.toLocaleString()}*\n\n` +
                '📎 *OBLIGATORIO:* Envía el PDF o foto de la póliza\n' +
                '🔗 Formatos aceptados: PDF, JPG, PNG',
            sendOptions
        );

        return true;
    }

    /**
     * Procesa el PDF o foto de la póliza (OBLIGATORIO)
     */
    static async procesarPDF(
        bot: IBot,
        msg: any,
        userId: string,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        const chatId: number = msg.chat.id;

        // Si el usuario intenta enviar texto en lugar de archivo
        if (msg.text && !msg.document && !msg.photo) {
            const sendOptions: any = { parse_mode: 'Markdown' };
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ **ARCHIVO OBLIGATORIO**\n\n' +
                    '📎 Debes enviar un PDF o foto de la póliza\n' +
                    '🚫 No puedes continuar sin adjuntar el archivo\n' +
                    '🔗 Formatos aceptados: PDF, JPG, PNG',
                sendOptions
            );
            return true;
        }

        // Verificar si es un documento PDF
        if (msg.document && msg.document.mime_type === 'application/pdf') {
            try {
                // Procesar el PDF
                console.log('BD AUTOS - Documento recibido:', {
                    file_id: msg.document.file_id,
                    file_name: msg.document.file_name,
                    file_size: msg.document.file_size,
                    mime_type: msg.document.mime_type,
                    file_unique_id: msg.document.file_unique_id
                });

                // Validar que tenemos un file_id válido
                if (!msg.document.file_id) {
                    throw new Error('No se recibió file_id del documento');
                }

                // Descargar y guardar el buffer inmediatamente
                let pdfBuffer: Buffer;
                try {
                    const fileLink = await bot.telegram.getFileLink(msg.document.file_id);
                    const response = await require('node-fetch')(fileLink.href);
                    if (!response.ok) {
                        throw new Error(`Error descargando PDF: ${response.status}`);
                    }
                    pdfBuffer = await response.buffer();
                    console.log(
                        'BD AUTOS - PDF descargado exitosamente, tamaño:',
                        pdfBuffer.length
                    );
                } catch (downloadError) {
                    console.error('BD AUTOS - Error descargando PDF:', downloadError);

                    const sendOptions: any = { parse_mode: 'Markdown' };
                    if (asignacion.threadId) {
                        sendOptions.message_thread_id = asignacion.threadId;
                    }

                    await bot.telegram.sendMessage(
                        chatId,
                        '❌ Error al procesar el PDF. Por favor, intenta enviarlo nuevamente.',
                        sendOptions
                    );
                    return true;
                }

                asignacion.datosPoliza.archivo = {
                    type: 'pdf',
                    file_id: msg.document.file_id,
                    file_name: msg.document.file_name || 'documento.pdf',
                    file_size: msg.document.file_size,
                    mime_type: msg.document.mime_type || 'application/pdf',
                    buffer: pdfBuffer
                };

                const sendOptions: any = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    `✅ PDF guardado: ${msg.document.file_name}\n\n` +
                        '🎉 ¡Todos los datos están completos!\n' +
                        'Procesando asignación de póliza...',
                    sendOptions
                );

                return await this.finalizarAsignacion(bot, chatId, userId, asignacion, stateKey);
            } catch (error) {
                console.error('Error procesando PDF:', error);

                const sendOptions: any = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al procesar el PDF. Intenta nuevamente.',
                    sendOptions
                );
                return true;
            }
        }

        // Verificar si es una foto
        if (msg.photo && msg.photo.length > 0) {
            try {
                // Obtener la foto de mejor calidad
                const foto = msg.photo[msg.photo.length - 1];

                // Descargar y guardar el buffer inmediatamente
                let fotoBuffer: Buffer;
                try {
                    const fileLink = await bot.telegram.getFileLink(foto.file_id);
                    const response = await require('node-fetch')(fileLink.href);
                    if (!response.ok) {
                        throw new Error(`Error descargando foto: ${response.status}`);
                    }
                    fotoBuffer = await response.buffer();
                    console.log(
                        'BD AUTOS - Foto descargada exitosamente, tamaño:',
                        fotoBuffer.length
                    );
                } catch (downloadError) {
                    console.error('BD AUTOS - Error descargando foto:', downloadError);

                    const sendOptions: any = { parse_mode: 'Markdown' };
                    if (asignacion.threadId) {
                        sendOptions.message_thread_id = asignacion.threadId;
                    }

                    await bot.telegram.sendMessage(
                        chatId,
                        '❌ Error al procesar la foto. Por favor, intenta enviarla nuevamente.',
                        sendOptions
                    );
                    return true;
                }

                asignacion.datosPoliza.archivo = {
                    type: 'photo',
                    file_id: foto.file_id,
                    file_name: `poliza_foto_${Date.now()}.jpg`,
                    file_size: foto.file_size,
                    mime_type: 'image/jpeg',
                    buffer: fotoBuffer
                };

                const sendOptions: any = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '✅ Foto de póliza guardada\n\n' +
                        '🎉 ¡Todos los datos están completos!\n' +
                        'Procesando asignación de póliza...',
                    sendOptions
                );

                return await this.finalizarAsignacion(bot, chatId, userId, asignacion, stateKey);
            } catch (error) {
                console.error('Error procesando foto:', error);

                const sendOptions: any = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }

                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al procesar la foto. Intenta nuevamente.',
                    sendOptions
                );
                return true;
            }
        }

        // Si es otro tipo de documento que no sea PDF, rechazar
        if (msg.document && msg.document.mime_type !== 'application/pdf') {
            const sendOptions: any = { parse_mode: 'Markdown' };
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(
                chatId,
                '❌ **FORMATO NO VÁLIDO**\n\n' +
                    `📄 Archivo recibido: ${msg.document.file_name}\n` +
                    `❌ Tipo: ${msg.document.mime_type}\n\n` +
                    '📎 Solo se aceptan:\n' +
                    '• PDF (documentos)\n' +
                    '• JPG/PNG (fotos)\n\n' +
                    'Por favor, envía el archivo correcto.',
                sendOptions
            );
            return true;
        }

        // Si no es PDF ni foto, solicitar archivo válido
        const sendOptions: any = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }

        await bot.telegram.sendMessage(
            chatId,
            '❌ **ARCHIVO OBLIGATORIO**\n\n' +
                '📎 Debes enviar un archivo PDF o una foto\n' +
                '🔗 Formatos aceptados: PDF, JPG, PNG\n\n' +
                'No puedes finalizar sin adjuntar el archivo.',
            sendOptions
        );
        return true;
    }

    /**
     * Finaliza la asignación de póliza
     */
    static async finalizarAsignacion(
        bot: IBot,
        chatId: number,
        userId: string,
        asignacion: IAsignacionEnProceso,
        stateKey: string
    ): Promise<boolean> {
        let polizaGuardada: IPolicy | null = null;

        try {
            const vehiculo = asignacion.vehiculo;
            const datosPoliza = asignacion.datosPoliza;

            // Crear la póliza usando los datos del vehículo + datos de la póliza
            const nuevaPoliza: any = {
                // Datos del vehículo
                marca: vehiculo.marca,
                submarca: vehiculo.submarca,
                año: vehiculo.año,
                color: vehiculo.color,
                serie: vehiculo.serie,
                placas: vehiculo.placas,

                // Datos temporales del titular (se pueden modificar después)
                titular: vehiculo.titular,
                rfc: vehiculo.rfc,
                telefono: vehiculo.telefono,
                correo: vehiculo.correo,
                calle: vehiculo.calle,
                colonia: vehiculo.colonia,
                municipio: vehiculo.municipio,
                estadoRegion: vehiculo.estadoRegion,
                cp: vehiculo.cp,

                // Datos de la póliza
                numeroPoliza: datosPoliza.numeroPoliza,
                aseguradora: datosPoliza.aseguradora,
                agenteCotizador: datosPoliza.nombrePersona,
                fechaEmision: datosPoliza.fechaEmision,
                fechaFinCobertura: datosPoliza.fechaFinCobertura,

                // Pagos planificados (NO realizados - solo para referencia en reportes)
                pagos: [
                    {
                        monto: datosPoliza.primerPago,
                        fechaPago: datosPoliza.fechaEmision,
                        estado: 'PLANIFICADO',
                        notas: 'Pago inicial planificado al registrar póliza'
                    },
                    {
                        monto: datosPoliza.segundoPago,
                        fechaPago: (() => {
                            const fecha = new Date(datosPoliza.fechaEmision!);
                            fecha.setMonth(fecha.getMonth() + 1);
                            return fecha;
                        })(),
                        estado: 'PLANIFICADO',
                        notas: 'Pago mensual planificado'
                    }
                ].filter(p => p.monto),

                // Metadatos especiales
                vehicleId: vehiculo._id,
                creadoViaOBD: true,
                asignadoPor: userId
            };

            // Crear la póliza
            polizaGuardada = await policyController.savePolicy(nuevaPoliza);

            // Marcar el vehículo como asegurado
            await VehicleController.marcarConPoliza(
                vehiculo._id.toString(),
                polizaGuardada._id.toString()
            );

            // Transferir fotos del vehículo a la póliza
            await this.transferirFotosVehiculoAPoliza(vehiculo, polizaGuardada);

            // Procesar archivo (PDF o foto) si existe
            if (datosPoliza.archivo?.buffer) {
                try {
                    const buffer = datosPoliza.archivo.buffer;
                    console.log('BD AUTOS - Usando buffer pre-descargado, tamaño:', buffer.length);

                    // Validar que es un PDF válido si es tipo PDF
                    if (datosPoliza.archivo.type === 'pdf') {
                        const pdfHeader = buffer.slice(0, 4).toString();
                        if (!pdfHeader.startsWith('%PDF')) {
                            console.error(
                                'BD AUTOS - Buffer no es un PDF válido. Header:',
                                pdfHeader
                            );
                            throw new Error('El archivo descargado no es un PDF válido');
                        }
                    }

                    // Subir a Cloudflare R2
                    const { getInstance } = require('../../services/CloudflareStorage');
                    const storage = getInstance();

                    let uploadResult: any;
                    if (datosPoliza.archivo.type === 'pdf') {
                        uploadResult = await storage.uploadPolicyPDF(
                            buffer,
                            datosPoliza.numeroPoliza!,
                            datosPoliza.archivo.file_name
                        );
                    } else {
                        // Para fotos, usar uploadFile genérico
                        const fileName = `polizas/${datosPoliza.numeroPoliza}/poliza_${datosPoliza.archivo.file_name}`;
                        uploadResult = await storage.uploadFile(
                            buffer,
                            fileName,
                            datosPoliza.archivo.mime_type,
                            {
                                policyNumber: datosPoliza.numeroPoliza,
                                type: 'poliza_foto',
                                originalName: datosPoliza.archivo.file_name
                            }
                        );
                    }

                    // Actualizar la póliza con la referencia a R2
                    if (uploadResult?.url) {
                        const polizaActualizada = await Policy.findById(polizaGuardada._id);

                        if (!polizaActualizada) {
                            console.error('No se pudo encontrar la póliza para actualizar con R2');
                            return false;
                        }

                        if (!polizaActualizada.archivos) {
                            polizaActualizada.archivos = {
                                fotos: [],
                                pdfs: [],
                                r2Files: { fotos: [], pdfs: [] }
                            };
                        }
                        if (!polizaActualizada.archivos.r2Files) {
                            polizaActualizada.archivos.r2Files = { fotos: [], pdfs: [] };
                        }

                        const r2File = {
                            url: uploadResult.url,
                            key: uploadResult.key,
                            size: uploadResult.size,
                            contentType: uploadResult.contentType,
                            uploadDate: new Date(),
                            originalName: datosPoliza.archivo.file_name
                        };

                        if (datosPoliza.archivo.type === 'pdf') {
                            polizaActualizada.archivos.r2Files.pdfs.push(r2File);
                        } else {
                            polizaActualizada.archivos.r2Files.fotos.push(r2File);
                        }

                        await polizaActualizada.save();
                        console.log(
                            `✅ Archivo guardado en Cloudflare para póliza ${datosPoliza.numeroPoliza}`
                        );
                    }
                } catch (fileError) {
                    console.error('Error procesando archivo de póliza:', fileError);
                    // No fallar el proceso por esto, solo advertir
                }
            }

            const totalPagos = (datosPoliza.primerPago || 0) + (datosPoliza.segundoPago || 0);

            // Escapar caracteres especiales para Markdown
            const escapeMarkdown = (text: string): string => {
                return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
            };

            const mensaje =
                '🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*\n\n' +
                `📋 *Póliza:* ${escapeMarkdown(datosPoliza.numeroPoliza!)}\n` +
                `🏢 *Aseguradora:* ${escapeMarkdown(datosPoliza.aseguradora!)}\n` +
                `👨‍💼 *Persona:* ${escapeMarkdown(datosPoliza.nombrePersona!)}\n` +
                `📅 *Emisión:* ${datosPoliza.fechaEmision!.toLocaleDateString('es-MX')}\n` +
                `📅 *Vence:* ${datosPoliza.fechaFinCobertura!.toLocaleDateString('es-MX')}\n\n` +
                '💰 *Pagos registrados:*\n' +
                `• Primer pago: $${(datosPoliza.primerPago || 0).toLocaleString()}\n` +
                `• Segundo pago: $${(datosPoliza.segundoPago || 0).toLocaleString()}\n` +
                `• Total: $${totalPagos.toLocaleString()}\n\n` +
                '🚗 *Vehículo asegurado:*\n' +
                `${escapeMarkdown(vehiculo.marca)} ${escapeMarkdown(vehiculo.submarca)} ${vehiculo.año}\n` +
                `👤 Titular: ${escapeMarkdown(vehiculo.titular)}\n` +
                (datosPoliza.archivo
                    ? `📎 Archivo: ${escapeMarkdown(datosPoliza.archivo.file_name)} \\(${datosPoliza.archivo.type.toUpperCase()}\\)\n`
                    : '') +
                '\n✅ Estado: CON\\_POLIZA\n' +
                `🆔 ID: ${polizaGuardada._id}`;

            const sendOptions: any = {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            };
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }

            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);

            // Limpiar el proceso de asignación
            asignacionesEnProceso.delete(stateKey);

            return true;
        } catch (error) {
            console.error('Error finalizando asignación:', error);

            // Si ya se creó la póliza, informar el ID para poder verificarla
            let mensajeError = '❌ Error al finalizar la asignación de póliza.';
            if (polizaGuardada && polizaGuardada._id) {
                mensajeError += `\n\n⚠️ La póliza se creó parcialmente:\n📋 Número: ${asignacion.datosPoliza.numeroPoliza}\n🆔 ID: ${polizaGuardada._id}`;
            }

            const sendOptions: any = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, mensajeError, sendOptions);

            // Limpiar el estado aunque haya error
            asignacionesEnProceso.delete(stateKey);

            return true;
        }
    }

    /**
     * Valida formato de fecha DD/MM/AAAA
     */
    static validarFecha(fechaStr: string): Date | null {
        const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const match = fechaStr.match(regex);

        if (!match) return null;

        const dia = parseInt(match[1]);
        const mes = parseInt(match[2]);
        const año = parseInt(match[3]);

        const fecha = new Date(año, mes - 1, dia);

        if (
            fecha.getDate() !== dia ||
            fecha.getMonth() !== mes - 1 ||
            fecha.getFullYear() !== año
        ) {
            return null;
        }

        return fecha;
    }

    /**
     * Verifica si un usuario tiene una asignación en proceso
     */
    static tieneAsignacionEnProceso(
        userId: string,
        chatId: number | null = null,
        threadId: number | null = null
    ): boolean {
        // Para compatibilidad hacia atrás, si solo se pasa userId, verificar ambos formatos
        if (chatId === null) {
            // No podemos verificar formato nuevo sin chatId, así que retornar false
            return false;
        }

        // Usar formato thread-safe
        const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
        return asignacionesEnProceso.has(stateKey);
    }

    /**
     * Transfiere las fotos del vehículo a la póliza
     */
    static async transferirFotosVehiculoAPoliza(
        vehiculo: IVehicle,
        poliza: IPolicy
    ): Promise<void> {
        try {
            // Verificar si el vehículo tiene fotos en R2
            if (
                !vehiculo.archivos?.r2Files?.fotos ||
                vehiculo.archivos.r2Files.fotos.length === 0
            ) {
                console.log('No hay fotos del vehículo para transferir');
                return;
            }

            // Actualizar la póliza con las fotos del vehículo
            const polizaActualizada = await Policy.findById(poliza._id);

            if (!polizaActualizada) {
                console.error('No se pudo encontrar la póliza para actualizar');
                return;
            }

            // Inicializar estructura de archivos si no existe
            if (!polizaActualizada.archivos) {
                polizaActualizada.archivos = {
                    fotos: [],
                    pdfs: [],
                    r2Files: { fotos: [], pdfs: [] }
                };
            }
            if (!polizaActualizada.archivos.r2Files) {
                polizaActualizada.archivos.r2Files = { fotos: [], pdfs: [] };
            }

            // Copiar las referencias de las fotos del vehículo
            const fotosTransferidas: any[] = [];
            for (const foto of vehiculo.archivos.r2Files.fotos) {
                fotosTransferidas.push({
                    url: foto.url,
                    key: foto.key,
                    size: foto.size,
                    contentType: foto.contentType || 'image/jpeg',
                    uploadDate: foto.uploadDate || new Date(),
                    originalName: foto.originalName || 'foto_vehiculo.jpg',
                    fuenteOriginal: 'vehiculo_bd_autos'
                });
            }

            // Agregar las fotos a la póliza
            polizaActualizada.archivos.r2Files.fotos.push(...fotosTransferidas);

            await polizaActualizada.save();

            console.log(
                `✅ ${fotosTransferidas.length} fotos del vehículo transferidas a la póliza ${poliza.numeroPoliza}`
            );
        } catch (error) {
            console.error('Error transfiriendo fotos del vehículo a la póliza:', error);
            // No fallar el proceso principal por esto
        }
    }
}

export default PolicyAssignmentHandler;
