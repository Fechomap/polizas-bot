"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyAssignmentHandler = exports.asignacionesEnProceso = exports.ESTADOS_ASIGNACION = void 0;
const vehicleController_1 = require("../../controllers/vehicleController");
const policyController = __importStar(require("../../controllers/policyController"));
const teclados_1 = require("../teclados");
const StateKeyManager_1 = __importDefault(require("../../utils/StateKeyManager"));
exports.ESTADOS_ASIGNACION = {
    SELECCIONANDO_VEHICULO: 'seleccionando_vehiculo',
    ESPERANDO_NUMERO_POLIZA: 'esperando_numero_poliza',
    ESPERANDO_ASEGURADORA: 'esperando_aseguradora',
    ESPERANDO_NOMBRE_PERSONA: 'esperando_nombre_persona',
    SELECCIONANDO_FECHA_EMISION: 'seleccionando_fecha_emision',
    ESPERANDO_PRIMER_PAGO: 'esperando_primer_pago',
    ESPERANDO_SEGUNDO_PAGO: 'esperando_segundo_pago',
    ESPERANDO_PDF: 'esperando_pdf',
    COMPLETADO: 'completado'
};
exports.asignacionesEnProceso = StateKeyManager_1.default.createThreadSafeStateMap();
class PolicyAssignmentHandler {
    static async mostrarVehiculosDisponibles(bot, chatId, userId, threadId = null, pagina = 1) {
        try {
            const resultado = await vehicleController_1.VehicleController.getVehiculosSinPoliza(10, pagina);
            if (!resultado.success) {
                const sendOptions = {};
                if (threadId) {
                    sendOptions.message_thread_id = threadId;
                }
                await bot.telegram.sendMessage(chatId, `❌ Error: ${resultado.error}`, sendOptions);
                return false;
            }
            if (!resultado.vehiculos || resultado.vehiculos.length === 0) {
                const sendOptions = {
                    parse_mode: 'Markdown',
                    reply_markup: (0, teclados_1.getMainKeyboard)()
                };
                if (threadId) {
                    sendOptions.message_thread_id = threadId;
                }
                await bot.telegram.sendMessage(chatId, '📋 *NO HAY VEHÍCULOS DISPONIBLES*\n\n' +
                    'No se encontraron vehículos sin póliza para asegurar.\n' +
                    'Solicita al equipo OBD que registre más vehículos.', sendOptions);
                return true;
            }
            let mensaje = '🚗 *VEHÍCULOS DISPONIBLES PARA ASEGURAR*\n\n';
            if (resultado.pagination) {
                mensaje += `📊 Página ${resultado.pagination.pagina} de ${resultado.pagination.totalPaginas}\n`;
                mensaje += `📈 Total: ${resultado.pagination.total} vehículos\n\n`;
            }
            const botones = [];
            resultado.vehiculos.forEach((vehiculo, index) => {
                const numero = (pagina - 1) * 10 + index + 1;
                mensaje += `*${numero}.* 🚗 ${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}\n`;
                mensaje += `   🎨 Color: ${vehiculo.color}\n`;
                mensaje += `   🔢 Serie: ${vehiculo.serie}\n`;
                mensaje += `   🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n`;
                mensaje += `   👤 Titular: ${vehiculo.titular || 'Sin titular'}\n`;
                mensaje += `   📅 Registrado: ${new Date(vehiculo.createdAt).toLocaleDateString('es-MX')}\n\n`;
                botones.push([
                    {
                        text: `${numero}. ${vehiculo.marca} ${vehiculo.submarca}`,
                        callback_data: `asignar_${vehiculo._id}`
                    }
                ]);
            });
            const navegacion = [];
            if (resultado.pagination && resultado.pagination.pagina > 1) {
                navegacion.push({
                    text: '⬅️ Anterior',
                    callback_data: `vehiculos_pag_${pagina - 1}`
                });
            }
            if (resultado.pagination && resultado.pagination.pagina < resultado.pagination.totalPaginas) {
                navegacion.push({
                    text: 'Siguiente ➡️',
                    callback_data: `vehiculos_pag_${pagina + 1}`
                });
            }
            if (navegacion.length > 0) {
                botones.push(navegacion);
            }
            botones.push([{ text: '🏠 Menú Principal', callback_data: 'accion:start' }]);
            const sendOptions = {
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
        }
        catch (error) {
            console.error('Error mostrando vehículos disponibles:', error);
            const sendOptions = {};
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ Error al consultar vehículos disponibles.', sendOptions);
            return false;
        }
    }
    static async iniciarAsignacion(bot, chatId, userId, vehicleId, threadId = null) {
        try {
            const Vehicle = require('../../models/vehicle');
            let vehiculo;
            try {
                vehiculo = await Vehicle.findById(vehicleId);
                if (!vehiculo) {
                    const sendOptions = {};
                    if (threadId) {
                        sendOptions.message_thread_id = threadId;
                    }
                    await bot.telegram.sendMessage(chatId, '❌ Vehículo no encontrado.', sendOptions);
                    return false;
                }
            }
            catch (error) {
                const vehicle = await vehicleController_1.VehicleController.buscarVehiculo(vehicleId);
                if (!vehicle.success || !vehicle.vehiculo) {
                    const sendOptions = {};
                    if (threadId) {
                        sendOptions.message_thread_id = threadId;
                    }
                    await bot.telegram.sendMessage(chatId, '❌ Vehículo no encontrado.', sendOptions);
                    return false;
                }
                vehiculo = vehicle.vehiculo;
            }
            if (vehiculo.estado !== 'SIN_POLIZA') {
                const sendOptions = {};
                if (threadId) {
                    sendOptions.message_thread_id = threadId;
                }
                await bot.telegram.sendMessage(chatId, '❌ Este vehículo ya tiene póliza asignada o no está disponible.\n' +
                    `Estado actual: ${vehiculo.estado}`, sendOptions);
                return false;
            }
            const stateKey = `${userId}:${StateKeyManager_1.default.getContextKey(chatId, threadId)}`;
            exports.asignacionesEnProceso.delete(stateKey);
            const mensaje = '🚗 *VEHÍCULO SELECCIONADO*\n\n' +
                `*${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}*\n` +
                `🎨 Color: ${vehiculo.color}\n` +
                `🔢 Serie: ${vehiculo.serie}\n` +
                `🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n\n` +
                '*Datos temporales del titular:*\n' +
                `👤 ${vehiculo.titular}\n` +
                `🆔 RFC: ${vehiculo.rfc}\n` +
                `📱 ${vehiculo.telefono}\n\n` +
                '💼 *INICIAR ASIGNACIÓN DE PÓLIZA*\n\n' +
                '*Paso 1/5:* Ingresa el *número de póliza*\n' +
                '📝 Puedes escribir cualquier número o código';
            const sendOptions = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]]
                }
            };
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }
            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
            const asignacion = {
                estado: exports.ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA,
                chatId: chatId,
                threadId: threadId,
                vehiculo: vehiculo,
                datosPoliza: {},
                iniciado: new Date()
            };
            exports.asignacionesEnProceso.set(stateKey, asignacion);
            return true;
        }
        catch (error) {
            console.error('Error iniciando asignación:', error);
            const sendOptions = {};
            if (threadId) {
                sendOptions.message_thread_id = threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ Error al iniciar la asignación de póliza.', sendOptions);
            return false;
        }
    }
    static async procesarMensaje(bot, msg, userId) {
        const chatId = msg.chat.id;
        const threadId = msg.message_thread_id || null;
        const texto = msg.text?.trim();
        const stateKey = `${userId}:${StateKeyManager_1.default.getContextKey(chatId, threadId)}`;
        const asignacion = exports.asignacionesEnProceso.get(stateKey);
        if (!asignacion) {
            return false;
        }
        try {
            switch (asignacion.estado) {
                case exports.ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA:
                    return await this.procesarNumeroPoliza(bot, chatId, userId, texto, asignacion, stateKey);
                case exports.ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA:
                    return await this.procesarAseguradora(bot, chatId, userId, texto, asignacion, stateKey);
                case exports.ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA:
                    return await this.procesarNombrePersona(bot, chatId, userId, texto, asignacion, stateKey);
                case exports.ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION:
                    return await this.procesarFechaEmision(bot, chatId, userId, texto, asignacion, stateKey);
                case exports.ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO:
                    return await this.procesarPrimerPago(bot, chatId, userId, texto, asignacion, stateKey);
                case exports.ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO:
                    return await this.procesarSegundoPago(bot, chatId, userId, texto, asignacion, stateKey);
                case exports.ESTADOS_ASIGNACION.ESPERANDO_PDF:
                    return await this.procesarPDF(bot, msg, userId, asignacion, stateKey);
                default:
                    return false;
            }
        }
        catch (error) {
            console.error('Error procesando mensaje de asignación:', error);
            await bot.telegram.sendMessage(chatId, '❌ Error en la asignación. Intenta nuevamente.');
            return true;
        }
    }
    static async procesarNumeroPoliza(bot, chatId, userId, numeroPoliza, asignacion, stateKey) {
        if (!numeroPoliza || numeroPoliza.trim().length < 1) {
            const sendOptions = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ Ingresa un número de póliza válido:', sendOptions);
            return true;
        }
        asignacion.datosPoliza.numeroPoliza = numeroPoliza.trim();
        asignacion.estado = exports.ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA;
        exports.asignacionesEnProceso.set(stateKey, asignacion);
        const sendOptions = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }
        await bot.telegram.sendMessage(chatId, `✅ Número de póliza: *${numeroPoliza}*\n\n` +
            '*Paso 2/5:* Ingresa la *aseguradora*\n' +
            '📝 Ejemplo: GNP, Seguros Monterrey, AXA', sendOptions);
        return true;
    }
    static async procesarAseguradora(bot, chatId, userId, aseguradora, asignacion, stateKey) {
        if (!aseguradora || aseguradora.trim().length < 2) {
            const sendOptions = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ La aseguradora debe tener al menos 2 caracteres:', sendOptions);
            return true;
        }
        asignacion.datosPoliza.aseguradora = aseguradora.trim();
        asignacion.estado = exports.ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA;
        exports.asignacionesEnProceso.set(stateKey, asignacion);
        const sendOptions = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }
        await bot.telegram.sendMessage(chatId, `✅ Aseguradora: *${aseguradora}*\n\n` +
            '*Paso 3/5:* Ingresa el *nombre de la persona* que cotizó\n' +
            '📝 Ejemplo: Juan Pérez, María González', sendOptions);
        return true;
    }
    static async procesarNombrePersona(bot, chatId, userId, nombrePersona, asignacion, stateKey) {
        if (!nombrePersona || nombrePersona.trim().length < 3) {
            const sendOptions = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ El nombre debe tener al menos 3 caracteres:', sendOptions);
            return true;
        }
        asignacion.datosPoliza.nombrePersona = nombrePersona.trim();
        exports.asignacionesEnProceso.set(stateKey, asignacion);
        await this.mostrarSelectorFechaEmision(bot, chatId, asignacion);
        return true;
    }
    static async mostrarSelectorFechaEmision(bot, chatId, asignacion) {
        const hoy = new Date();
        const botones = [];
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
        const mensaje = `✅ Persona que cotizó: *${asignacion.datosPoliza.nombrePersona}*\n\n` +
            '*Paso 4/5:* Selecciona la *fecha de emisión*\n' +
            '📅 Elige el día que corresponde al registro:';
        asignacion.estado = exports.ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION;
        const sendOptions = {
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
    static async procesarFechaEmision(bot, chatId, userId, fechaISO, asignacion, stateKey) {
        return false;
    }
    static async confirmarFechaEmision(bot, chatId, fechaISO, asignacion, stateKey) {
        const fechaEmision = new Date(fechaISO);
        const fechaFin = new Date(fechaEmision);
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);
        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura = fechaFin;
        asignacion.estado = exports.ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO;
        exports.asignacionesEnProceso.set(stateKey, asignacion);
        const fechaEmisionStr = fechaEmision.toLocaleDateString('es-MX');
        const fechaFinStr = fechaFin.toLocaleDateString('es-MX');
        const sendOptions = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }
        await bot.telegram.sendMessage(chatId, `✅ Fecha de emisión: *${fechaEmisionStr}*\n` +
            `✅ Fecha de fin: *${fechaFinStr}* (automática)\n\n` +
            '*Paso 5/5:* Ingresa el *PRIMER PAGO*\n' +
            '💰 Solo el monto\n' +
            '📝 Ejemplo: 8500', sendOptions);
        return true;
    }
    static async procesarPrimerPago(bot, chatId, userId, texto, asignacion, stateKey) {
        if (!texto) {
            return true;
        }
        const monto = parseFloat(texto.trim());
        if (isNaN(monto) || monto <= 0) {
            const sendOptions = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ Ingresa un monto válido\n' + '💰 Solo números\n' + '📝 Ejemplo: 8500', sendOptions);
            return true;
        }
        asignacion.datosPoliza.primerPago = monto;
        asignacion.estado = exports.ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO;
        exports.asignacionesEnProceso.set(stateKey, asignacion);
        const sendOptions = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }
        await bot.telegram.sendMessage(chatId, `✅ Primer pago: $${monto.toLocaleString()}\n\n` +
            'Ahora ingresa el *SEGUNDO PAGO*\n' +
            '💰 Solo el monto\n' +
            '📝 Ejemplo: 3500', sendOptions);
        return true;
    }
    static async procesarSegundoPago(bot, chatId, userId, texto, asignacion, stateKey) {
        if (!texto) {
            return true;
        }
        const monto = parseFloat(texto.trim());
        if (isNaN(monto) || monto <= 0) {
            const sendOptions = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ Ingresa un monto válido\n' + '💰 Solo números\n' + '📝 Ejemplo: 3500', sendOptions);
            return true;
        }
        asignacion.datosPoliza.segundoPago = monto;
        asignacion.estado = exports.ESTADOS_ASIGNACION.ESPERANDO_PDF;
        exports.asignacionesEnProceso.set(stateKey, asignacion);
        const totalPagos = (asignacion.datosPoliza.primerPago || 0) + monto;
        const sendOptions = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }
        await bot.telegram.sendMessage(chatId, `✅ Segundo pago: $${monto.toLocaleString()}\n\n` +
            `💰 *Total de la póliza: $${totalPagos.toLocaleString()}*\n\n` +
            '📎 *OBLIGATORIO:* Envía el PDF o foto de la póliza\n' +
            '🔗 Formatos aceptados: PDF, JPG, PNG', sendOptions);
        return true;
    }
    static async procesarPDF(bot, msg, userId, asignacion, stateKey) {
        const chatId = msg.chat.id;
        if (msg.text && !msg.document && !msg.photo) {
            const sendOptions = { parse_mode: 'Markdown' };
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ **ARCHIVO OBLIGATORIO**\n\n' +
                '📎 Debes enviar un PDF o foto de la póliza\n' +
                '🚫 No puedes continuar sin adjuntar el archivo\n' +
                '🔗 Formatos aceptados: PDF, JPG, PNG', sendOptions);
            return true;
        }
        if (msg.document && msg.document.mime_type === 'application/pdf') {
            try {
                console.log('BD AUTOS - Documento recibido:', {
                    file_id: msg.document.file_id,
                    file_name: msg.document.file_name,
                    file_size: msg.document.file_size,
                    mime_type: msg.document.mime_type,
                    file_unique_id: msg.document.file_unique_id
                });
                if (!msg.document.file_id) {
                    throw new Error('No se recibió file_id del documento');
                }
                let pdfBuffer;
                try {
                    const fileLink = await bot.telegram.getFileLink(msg.document.file_id);
                    const response = await require('node-fetch')(fileLink.href);
                    if (!response.ok) {
                        throw new Error(`Error descargando PDF: ${response.status}`);
                    }
                    pdfBuffer = await response.buffer();
                    console.log('BD AUTOS - PDF descargado exitosamente, tamaño:', pdfBuffer.length);
                }
                catch (downloadError) {
                    console.error('BD AUTOS - Error descargando PDF:', downloadError);
                    const sendOptions = { parse_mode: 'Markdown' };
                    if (asignacion.threadId) {
                        sendOptions.message_thread_id = asignacion.threadId;
                    }
                    await bot.telegram.sendMessage(chatId, '❌ Error al procesar el PDF. Por favor, intenta enviarlo nuevamente.', sendOptions);
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
                const sendOptions = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }
                await bot.telegram.sendMessage(chatId, `✅ PDF guardado: ${msg.document.file_name}\n\n` +
                    '🎉 ¡Todos los datos están completos!\n' +
                    'Procesando asignación de póliza...', sendOptions);
                return await this.finalizarAsignacion(bot, chatId, userId, asignacion, stateKey);
            }
            catch (error) {
                console.error('Error procesando PDF:', error);
                const sendOptions = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }
                await bot.telegram.sendMessage(chatId, '❌ Error al procesar el PDF. Intenta nuevamente.', sendOptions);
                return true;
            }
        }
        if (msg.photo && msg.photo.length > 0) {
            try {
                const foto = msg.photo[msg.photo.length - 1];
                let fotoBuffer;
                try {
                    const fileLink = await bot.telegram.getFileLink(foto.file_id);
                    const response = await require('node-fetch')(fileLink.href);
                    if (!response.ok) {
                        throw new Error(`Error descargando foto: ${response.status}`);
                    }
                    fotoBuffer = await response.buffer();
                    console.log('BD AUTOS - Foto descargada exitosamente, tamaño:', fotoBuffer.length);
                }
                catch (downloadError) {
                    console.error('BD AUTOS - Error descargando foto:', downloadError);
                    const sendOptions = { parse_mode: 'Markdown' };
                    if (asignacion.threadId) {
                        sendOptions.message_thread_id = asignacion.threadId;
                    }
                    await bot.telegram.sendMessage(chatId, '❌ Error al procesar la foto. Por favor, intenta enviarla nuevamente.', sendOptions);
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
                const sendOptions = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }
                await bot.telegram.sendMessage(chatId, '✅ Foto de póliza guardada\n\n' +
                    '🎉 ¡Todos los datos están completos!\n' +
                    'Procesando asignación de póliza...', sendOptions);
                return await this.finalizarAsignacion(bot, chatId, userId, asignacion, stateKey);
            }
            catch (error) {
                console.error('Error procesando foto:', error);
                const sendOptions = {};
                if (asignacion.threadId) {
                    sendOptions.message_thread_id = asignacion.threadId;
                }
                await bot.telegram.sendMessage(chatId, '❌ Error al procesar la foto. Intenta nuevamente.', sendOptions);
                return true;
            }
        }
        if (msg.document && msg.document.mime_type !== 'application/pdf') {
            const sendOptions = { parse_mode: 'Markdown' };
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, '❌ **FORMATO NO VÁLIDO**\n\n' +
                `📄 Archivo recibido: ${msg.document.file_name}\n` +
                `❌ Tipo: ${msg.document.mime_type}\n\n` +
                '📎 Solo se aceptan:\n' +
                '• PDF (documentos)\n' +
                '• JPG/PNG (fotos)\n\n' +
                'Por favor, envía el archivo correcto.', sendOptions);
            return true;
        }
        const sendOptions = { parse_mode: 'Markdown' };
        if (asignacion.threadId) {
            sendOptions.message_thread_id = asignacion.threadId;
        }
        await bot.telegram.sendMessage(chatId, '❌ **ARCHIVO OBLIGATORIO**\n\n' +
            '📎 Debes enviar un archivo PDF o una foto\n' +
            '🔗 Formatos aceptados: PDF, JPG, PNG\n\n' +
            'No puedes finalizar sin adjuntar el archivo.', sendOptions);
        return true;
    }
    static async finalizarAsignacion(bot, chatId, userId, asignacion, stateKey) {
        let polizaGuardada = null;
        try {
            const vehiculo = asignacion.vehiculo;
            const datosPoliza = asignacion.datosPoliza;
            const nuevaPoliza = {
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
                numeroPoliza: datosPoliza.numeroPoliza,
                aseguradora: datosPoliza.aseguradora,
                agenteCotizador: datosPoliza.nombrePersona,
                fechaEmision: datosPoliza.fechaEmision,
                fechaFinCobertura: datosPoliza.fechaFinCobertura,
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
                            const fecha = new Date(datosPoliza.fechaEmision);
                            fecha.setMonth(fecha.getMonth() + 1);
                            return fecha;
                        })(),
                        estado: 'PLANIFICADO',
                        notas: 'Pago mensual planificado'
                    }
                ].filter(p => p.monto),
                vehicleId: vehiculo._id,
                creadoViaOBD: true,
                asignadoPor: userId
            };
            polizaGuardada = await policyController.savePolicy(nuevaPoliza);
            await vehicleController_1.VehicleController.marcarConPoliza(vehiculo._id.toString(), polizaGuardada._id.toString());
            await this.transferirFotosVehiculoAPoliza(vehiculo, polizaGuardada);
            if (datosPoliza.archivo && datosPoliza.archivo.buffer) {
                try {
                    const buffer = datosPoliza.archivo.buffer;
                    console.log('BD AUTOS - Usando buffer pre-descargado, tamaño:', buffer.length);
                    if (datosPoliza.archivo.type === 'pdf') {
                        const pdfHeader = buffer.slice(0, 4).toString();
                        if (!pdfHeader.startsWith('%PDF')) {
                            console.error('BD AUTOS - Buffer no es un PDF válido. Header:', pdfHeader);
                            throw new Error('El archivo descargado no es un PDF válido');
                        }
                    }
                    const { getInstance } = require('../../services/CloudflareStorage');
                    const storage = getInstance();
                    let uploadResult;
                    if (datosPoliza.archivo.type === 'pdf') {
                        uploadResult = await storage.uploadPolicyPDF(buffer, datosPoliza.numeroPoliza, datosPoliza.archivo.file_name);
                    }
                    else {
                        const fileName = `polizas/${datosPoliza.numeroPoliza}/poliza_${datosPoliza.archivo.file_name}`;
                        uploadResult = await storage.uploadFile(buffer, fileName, datosPoliza.archivo.mime_type, {
                            policyNumber: datosPoliza.numeroPoliza,
                            type: 'poliza_foto',
                            originalName: datosPoliza.archivo.file_name
                        });
                    }
                    if (uploadResult && uploadResult.url) {
                        const Policy = require('../../models/policy');
                        const polizaActualizada = await Policy.findById(polizaGuardada._id);
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
                        }
                        else {
                            polizaActualizada.archivos.r2Files.fotos.push(r2File);
                        }
                        await polizaActualizada.save();
                        console.log(`✅ Archivo guardado en Cloudflare para póliza ${datosPoliza.numeroPoliza}`);
                    }
                }
                catch (fileError) {
                    console.error('Error procesando archivo de póliza:', fileError);
                }
            }
            const totalPagos = (datosPoliza.primerPago || 0) + (datosPoliza.segundoPago || 0);
            const escapeMarkdown = (text) => {
                return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
            };
            const mensaje = '🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*\n\n' +
                `📋 *Póliza:* ${escapeMarkdown(datosPoliza.numeroPoliza)}\n` +
                `🏢 *Aseguradora:* ${escapeMarkdown(datosPoliza.aseguradora)}\n` +
                `👨‍💼 *Persona:* ${escapeMarkdown(datosPoliza.nombrePersona)}\n` +
                `📅 *Emisión:* ${datosPoliza.fechaEmision.toLocaleDateString('es-MX')}\n` +
                `📅 *Vence:* ${datosPoliza.fechaFinCobertura.toLocaleDateString('es-MX')}\n\n` +
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
            const sendOptions = {
                parse_mode: 'Markdown',
                reply_markup: (0, teclados_1.getMainKeyboard)()
            };
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, mensaje, sendOptions);
            exports.asignacionesEnProceso.delete(stateKey);
            return true;
        }
        catch (error) {
            console.error('Error finalizando asignación:', error);
            let mensajeError = '❌ Error al finalizar la asignación de póliza.';
            if (polizaGuardada && polizaGuardada._id) {
                mensajeError += `\n\n⚠️ La póliza se creó parcialmente:\n📋 Número: ${asignacion.datosPoliza.numeroPoliza}\n🆔 ID: ${polizaGuardada._id}`;
            }
            const sendOptions = {};
            if (asignacion.threadId) {
                sendOptions.message_thread_id = asignacion.threadId;
            }
            await bot.telegram.sendMessage(chatId, mensajeError, sendOptions);
            exports.asignacionesEnProceso.delete(stateKey);
            return true;
        }
    }
    static validarFecha(fechaStr) {
        const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const match = fechaStr.match(regex);
        if (!match)
            return null;
        const dia = parseInt(match[1]);
        const mes = parseInt(match[2]);
        const año = parseInt(match[3]);
        const fecha = new Date(año, mes - 1, dia);
        if (fecha.getDate() !== dia ||
            fecha.getMonth() !== mes - 1 ||
            fecha.getFullYear() !== año) {
            return null;
        }
        return fecha;
    }
    static tieneAsignacionEnProceso(userId, chatId = null, threadId = null) {
        if (chatId === null) {
            return false;
        }
        const stateKey = `${userId}:${StateKeyManager_1.default.getContextKey(chatId, threadId)}`;
        return exports.asignacionesEnProceso.has(stateKey);
    }
    static async transferirFotosVehiculoAPoliza(vehiculo, poliza) {
        try {
            if (!vehiculo.archivos?.r2Files?.fotos ||
                vehiculo.archivos.r2Files.fotos.length === 0) {
                console.log('No hay fotos del vehículo para transferir');
                return;
            }
            const Policy = require('../../models/policy');
            const polizaActualizada = await Policy.findById(poliza._id);
            if (!polizaActualizada) {
                console.error('No se pudo encontrar la póliza para actualizar');
                return;
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
            const fotosTransferidas = [];
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
            polizaActualizada.archivos.r2Files.fotos.push(...fotosTransferidas);
            await polizaActualizada.save();
            console.log(`✅ ${fotosTransferidas.length} fotos del vehículo transferidas a la póliza ${poliza.numeroPoliza}`);
        }
        catch (error) {
            console.error('Error transfiriendo fotos del vehículo a la póliza:', error);
        }
    }
}
exports.PolicyAssignmentHandler = PolicyAssignmentHandler;
exports.default = PolicyAssignmentHandler;
