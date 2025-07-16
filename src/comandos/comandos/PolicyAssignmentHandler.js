const VehicleController = require('../../controllers/vehicleController');
const policyController = require('../../controllers/policyController');
const { getMainKeyboard } = require('../teclados');

/**
 * Estados del flujo de asignación de pólizas
 */
const ESTADOS_ASIGNACION = {
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

/**
 * Almacena temporalmente los datos de asignación en proceso
 */
const asignacionesEnProceso = new Map();

/**
 * Handler para la asignación de pólizas a vehículos
 */
class PolicyAssignmentHandler {
    /**
     * Muestra los vehículos disponibles para asegurar
     */
    static async mostrarVehiculosDisponibles(bot, chatId, userId, pagina = 1) {
        try {
            const resultado = await VehicleController.getVehiculosSinPoliza(10, pagina);

            if (!resultado.success) {
                await bot.telegram.sendMessage(chatId, `❌ Error: ${resultado.error}`);
                return false;
            }

            if (resultado.vehiculos.length === 0) {
                await bot.telegram.sendMessage(
                    chatId,
                    '📋 *NO HAY VEHÍCULOS DISPONIBLES*\n\n' +
                        'No se encontraron vehículos sin póliza para asegurar.\n' +
                        'Solicita al equipo OBD que registre más vehículos.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: getMainKeyboard()
                    }
                );
                return true;
            }

            let mensaje = '🚗 *VEHÍCULOS DISPONIBLES PARA ASEGURAR*\n\n';
            mensaje += `📊 Página ${resultado.pagination.pagina} de ${resultado.pagination.totalPaginas}\n`;
            mensaje += `📈 Total: ${resultado.pagination.total} vehículos\n\n`;

            const botones = [];

            resultado.vehiculos.forEach((vehiculo, index) => {
                const numero = (pagina - 1) * 10 + index + 1;
                mensaje += `*${numero}.* 🚗 ${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}\n`;
                mensaje += `   🎨 Color: ${vehiculo.color}\n`;
                mensaje += `   🔢 Serie: ${vehiculo.serie}\n`;
                mensaje += `   🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n`;
                mensaje += `   👤 Titular: ${vehiculo.titular || vehiculo.titularTemporal || 'Sin titular'}\n`;
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
            const navegacion = [];
            if (resultado.pagination.pagina > 1) {
                navegacion.push({
                    text: '⬅️ Anterior',
                    callback_data: `vehiculos_pag_${pagina - 1}`
                });
            }
            if (resultado.pagination.pagina < resultado.pagination.totalPaginas) {
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

            await bot.telegram.sendMessage(chatId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: botones
                }
            });

            return true;
        } catch (error) {
            console.error('Error mostrando vehículos disponibles:', error);
            await bot.telegram.sendMessage(chatId, '❌ Error al consultar vehículos disponibles.');
            return false;
        }
    }

    /**
     * Inicia el proceso de asignación de póliza a un vehículo específico
     */
    static async iniciarAsignacion(bot, chatId, userId, vehicleId) {
        try {
            // Buscar el vehículo directamente por ID
            const Vehicle = require('../../models/vehicle');
            let vehiculo;

            try {
                vehiculo = await Vehicle.findById(vehicleId);
                if (!vehiculo) {
                    await bot.telegram.sendMessage(chatId, '❌ Vehículo no encontrado.');
                    return false;
                }
            } catch (error) {
                // Si falla por ID, intentar buscar por serie o placas
                const vehicle = await VehicleController.buscarVehiculo(vehicleId);
                if (!vehicle.success || !vehicle.vehiculo) {
                    await bot.telegram.sendMessage(chatId, '❌ Vehículo no encontrado.');
                    return false;
                }
                vehiculo = vehicle.vehiculo;
            }

            if (vehiculo.estado !== 'SIN_POLIZA') {
                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Este vehículo ya tiene póliza asignada o no está disponible.\n' +
                        `Estado actual: ${vehiculo.estado}`
                );
                return false;
            }

            // Limpiar cualquier asignación previa para este usuario
            asignacionesEnProceso.delete(userId);

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
                `📱 ${vehiculo.telefono}\n\n` +
                '💼 *INICIAR ASIGNACIÓN DE PÓLIZA*\n\n' +
                '*Paso 1/5:* Ingresa el *número de póliza*\n' +
                '📝 Puedes escribir cualquier número o código';

            await bot.telegram.sendMessage(chatId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'poliza_cancelar' }]]
                }
            });

            // Inicializar el estado de asignación
            asignacionesEnProceso.set(userId, {
                estado: ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA,
                chatId: chatId,
                vehiculo: vehiculo,
                datosPoliza: {},
                iniciado: new Date()
            });

            return true;
        } catch (error) {
            console.error('Error iniciando asignación:', error);
            await bot.telegram.sendMessage(chatId, '❌ Error al iniciar la asignación de póliza.');
            return false;
        }
    }

    /**
     * Procesa los mensajes durante el flujo de asignación
     */
    static async procesarMensaje(bot, msg, userId) {
        const chatId = msg.chat.id;
        const texto = msg.text?.trim();

        const asignacion = asignacionesEnProceso.get(userId);
        if (!asignacion) {
            return false; // No hay asignación en proceso para este usuario
        }

        // La cancelación ahora se maneja via callback_data en BaseAutosCommand

        try {
            switch (asignacion.estado) {
            case ESTADOS_ASIGNACION.ESPERANDO_NUMERO_POLIZA:
                return await this.procesarNumeroPoliza(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA:
                return await this.procesarAseguradora(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA:
                return await this.procesarNombrePersona(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.SELECCIONANDO_FECHA_EMISION:
                return await this.procesarFechaEmision(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO:
                return await this.procesarPrimerPago(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO:
                return await this.procesarSegundoPago(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_PDF:
                return await this.procesarPDF(bot, msg, userId, asignacion);

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
    static async procesarNumeroPoliza(bot, chatId, userId, numeroPoliza, asignacion) {
        if (!numeroPoliza || numeroPoliza.trim().length < 1) {
            await bot.telegram.sendMessage(chatId, '❌ Ingresa un número de póliza válido:');
            return true;
        }

        // Guardar el número sin validar si existe (permitir duplicados)
        asignacion.datosPoliza.numeroPoliza = numeroPoliza.trim();
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA;

        await bot.telegram.sendMessage(
            chatId,
            `✅ Número de póliza: *${numeroPoliza}*\n\n` +
                '*Paso 2/5:* Ingresa la *aseguradora*\n' +
                '📝 Ejemplo: GNP, Seguros Monterrey, AXA',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa la aseguradora
     */
    static async procesarAseguradora(bot, chatId, userId, aseguradora, asignacion) {
        if (!aseguradora || aseguradora.trim().length < 2) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ La aseguradora debe tener al menos 2 caracteres:'
            );
            return true;
        }

        asignacion.datosPoliza.aseguradora = aseguradora.trim();
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_NOMBRE_PERSONA;

        await bot.telegram.sendMessage(
            chatId,
            `✅ Aseguradora: *${aseguradora}*\n\n` +
                '*Paso 3/5:* Ingresa el *nombre de la persona* que cotizó\n' +
                '📝 Ejemplo: Juan Pérez, María González',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el nombre de la persona que cotizó
     */
    static async procesarNombrePersona(bot, chatId, userId, nombrePersona, asignacion) {
        if (!nombrePersona || nombrePersona.trim().length < 3) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ El nombre debe tener al menos 3 caracteres:'
            );
            return true;
        }

        asignacion.datosPoliza.nombrePersona = nombrePersona.trim();

        // Generar fecha de emisión automática y mostrar selector
        await this.mostrarSelectorFechaEmision(bot, chatId, asignacion);

        return true;
    }

    /**
     * Muestra selector de fecha de emisión (últimos 7 días)
     */
    static async mostrarSelectorFechaEmision(bot, chatId, asignacion) {
        const hoy = new Date();
        const botones = [];

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

        await bot.telegram.sendMessage(chatId, mensaje, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: botones
            }
        });
    }

    /**
     * Procesa el agente cotizador (DEPRECATED - ahora es procesarNombrePersona)
     */
    static async procesarAgente(bot, chatId, userId, agente, asignacion) {
        if (!agente || agente.length < 3) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ El agente debe tener al menos 3 caracteres.\nIntenta nuevamente:'
            );
            return true;
        }

        asignacion.datosPoliza.agenteCotizador = agente;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_FECHA_EMISION;

        await bot.telegram.sendMessage(
            chatId,
            `✅ Agente: *${agente}*\n\n` +
                '*Paso 4/7:* Ingresa la *fecha de emisión*\n' +
                '📝 Formato: DD/MM/AAAA\n' +
                '📅 Ejemplo: 15/01/2024',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa la selección de fecha de emisión (via callback)
     * Esta función ya no se usa directamente, se maneja via callback en BaseAutosCommand
     */
    static async procesarFechaEmision(bot, chatId, userId, fechaISO, asignacion) {
        // Esta función se mantiene por compatibilidad pero no se usa en el nuevo flujo
        return false;
    }

    /**
     * Procesa la fecha seleccionada y calcula automáticamente la fecha de fin
     */
    static async confirmarFechaEmision(bot, chatId, fechaISO, asignacion) {
        const fechaEmision = new Date(fechaISO);

        // Calcular fecha de fin automáticamente (1 año después)
        const fechaFin = new Date(fechaEmision);
        fechaFin.setFullYear(fechaFin.getFullYear() + 1);

        asignacion.datosPoliza.fechaEmision = fechaEmision;
        asignacion.datosPoliza.fechaFinCobertura = fechaFin;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PRIMER_PAGO;

        const fechaEmisionStr = fechaEmision.toLocaleDateString('es-MX');
        const fechaFinStr = fechaFin.toLocaleDateString('es-MX');

        await bot.telegram.sendMessage(
            chatId,
            `✅ Fecha de emisión: *${fechaEmisionStr}*\n` +
                `✅ Fecha de fin: *${fechaFinStr}* (automática)\n\n` +
                '*Paso 5/5:* Ingresa el *PRIMER PAGO*\n' +
                '💰 Solo el monto\n' +
                '📝 Ejemplo: 8500',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa la fecha de fin de cobertura
     */
    static async procesarFechaFin(bot, chatId, userId, fecha, asignacion) {
        const fechaValida = this.validarFecha(fecha);
        if (!fechaValida) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ Fecha inválida. Usa el formato DD/MM/AAAA\n' +
                    '📅 Ejemplo: 15/01/2025\nIntenta nuevamente:'
            );
            return true;
        }

        asignacion.datosPoliza.fechaFinCobertura = fechaValida;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PAGOS;

        await bot.telegram.sendMessage(
            chatId,
            `✅ Fecha fin cobertura: *${fecha}*\n\n` +
                '*Paso 6/7:* Información de pagos (opcional)\n' +
                '📝 Formato: MONTO,FECHA\n' +
                '💰 Ejemplo: 5000,15/01/2024\n' +
                '📋 Para múltiples pagos, envía uno por mensaje\n' +
                '⏭️ Escribe "CONTINUAR" para saltar este paso',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el primer pago (obligatorio - solo monto)
     */
    static async procesarPrimerPago(bot, chatId, userId, texto, asignacion) {
        // Validar que sea un número válido
        const monto = parseFloat(texto.trim());
        if (isNaN(monto) || monto <= 0) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ Ingresa un monto válido\n' + '💰 Solo números\n' + '📝 Ejemplo: 8500'
            );
            return true;
        }

        asignacion.datosPoliza.primerPago = monto;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_SEGUNDO_PAGO;

        await bot.telegram.sendMessage(
            chatId,
            `✅ Primer pago: $${monto.toLocaleString()}\n\n` +
                'Ahora ingresa el *SEGUNDO PAGO*\n' +
                '💰 Solo el monto\n' +
                '📝 Ejemplo: 3500',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa el segundo pago (obligatorio - solo monto)
     */
    static async procesarSegundoPago(bot, chatId, userId, texto, asignacion) {
        // Validar que sea un número válido
        const monto = parseFloat(texto.trim());
        if (isNaN(monto) || monto <= 0) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ Ingresa un monto válido\n' + '💰 Solo números\n' + '📝 Ejemplo: 3500'
            );
            return true;
        }

        asignacion.datosPoliza.segundoPago = monto;

        // Ir directamente a PDF o finalización
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF;

        const totalPagos = asignacion.datosPoliza.primerPago + monto;

        await bot.telegram.sendMessage(
            chatId,
            `✅ Segundo pago: $${monto.toLocaleString()}\n\n` +
                `💰 *Total de la póliza: $${totalPagos.toLocaleString()}*\n\n` +
                '📎 *OBLIGATORIO:* Envía el PDF o foto de la póliza\n' +
                '🔗 Formatos aceptados: PDF, JPG, PNG',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Procesa los pagos (DEPRECATED - ahora son dos funciones separadas)
     */
    static async procesarPagos(bot, chatId, userId, texto, asignacion) {
        if (texto.toUpperCase() === 'CONTINUAR') {
            asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF;

            await bot.telegram.sendMessage(
                chatId,
                '⏭️ Pagos omitidos\n\n' +
                    '*Paso 7/7:* Envía el *PDF de la póliza*\n' +
                    '📎 Adjunta el archivo PDF\n' +
                    '⏭️ O escribe "CONTINUAR" para finalizar sin PDF',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        // Validar formato de pago
        const pago = this.validarPago(texto);
        if (!pago) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ Formato de pago inválido\n' +
                    '📝 Usa: MONTO,FECHA\n' +
                    '💰 Ejemplo: 5000,15/01/2024\n' +
                    'Intenta nuevamente:'
            );
            return true;
        }

        if (!asignacion.datosPoliza.pagos) {
            asignacion.datosPoliza.pagos = [];
        }

        asignacion.datosPoliza.pagos.push(pago);

        await bot.telegram.sendMessage(
            chatId,
            `✅ Pago agregado: $${pago.monto.toLocaleString()} - ${pago.fecha}\n\n` +
                `💰 Total pagos: ${asignacion.datosPoliza.pagos.length}\n` +
                '📋 Agrega otro pago o escribe "CONTINUAR" para el siguiente paso'
        );

        return true;
    }

    /**
     * Procesa el PDF o foto de la póliza (OBLIGATORIO)
     */
    static async procesarPDF(bot, msg, userId, asignacion) {
        const chatId = msg.chat.id;

        // Si el usuario intenta enviar texto en lugar de archivo
        if (msg.text && !msg.document && !msg.photo) {
            await bot.telegram.sendMessage(
                chatId,
                '❌ **ARCHIVO OBLIGATORIO**\n\n' +
                    '📎 Debes enviar un PDF o foto de la póliza\n' +
                    '🚫 No puedes continuar sin adjuntar el archivo\n' +
                    '🔗 Formatos aceptados: PDF, JPG, PNG',
                { parse_mode: 'Markdown' }
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

                // Intentar descargar inmediatamente para validar
                console.log('BD AUTOS - Intentando descarga inmediata del PDF...');
                try {
                    const fileLink = await bot.telegram.getFileLink(msg.document.file_id);
                    console.log('BD AUTOS - FileLink inmediato:', fileLink.href);

                    const testResponse = await require('node-fetch')(fileLink.href);
                    console.log('BD AUTOS - Test response status:', testResponse.status);
                    const testBuffer = await testResponse.buffer();
                    console.log('BD AUTOS - Test buffer size:', testBuffer.length);
                    console.log('BD AUTOS - Test primeros 50 bytes:', testBuffer.slice(0, 50).toString());
                } catch (testError) {
                    console.error('BD AUTOS - Error en descarga inmediata:', testError);
                }

                // Descargar y guardar el buffer inmediatamente
                let pdfBuffer = null;
                try {
                    const fileLink = await bot.telegram.getFileLink(msg.document.file_id);
                    const response = await require('node-fetch')(fileLink.href);
                    if (!response.ok) {
                        throw new Error(`Error descargando PDF: ${response.status}`);
                    }
                    pdfBuffer = await response.buffer();
                    console.log('BD AUTOS - PDF descargado exitosamente, tamaño:', pdfBuffer.length);
                } catch (downloadError) {
                    console.error('BD AUTOS - Error descargando PDF:', downloadError);
                    await bot.telegram.sendMessage(
                        chatId,
                        '❌ Error al procesar el PDF. Por favor, intenta enviarlo nuevamente.',
                        { parse_mode: 'Markdown' }
                    );
                    return true;
                }

                asignacion.datosPoliza.archivo = {
                    type: 'pdf',
                    file_id: msg.document.file_id,
                    file_name: msg.document.file_name || 'documento.pdf',
                    file_size: msg.document.file_size,
                    mime_type: msg.document.mime_type || 'application/pdf',
                    buffer: pdfBuffer // Guardar el buffer
                };

                await bot.telegram.sendMessage(
                    chatId,
                    `✅ PDF guardado: ${msg.document.file_name}\n\n` +
                        '🎉 ¡Todos los datos están completos!\n' +
                        'Procesando asignación de póliza...'
                );

                return await this.finalizarAsignacion(bot, chatId, userId, asignacion);
            } catch (error) {
                console.error('Error procesando PDF:', error);
                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al procesar el PDF. Intenta nuevamente.'
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
                let fotoBuffer = null;
                try {
                    const fileLink = await bot.telegram.getFileLink(foto.file_id);
                    const response = await require('node-fetch')(fileLink.href);
                    if (!response.ok) {
                        throw new Error(`Error descargando foto: ${response.status}`);
                    }
                    fotoBuffer = await response.buffer();
                    console.log('BD AUTOS - Foto descargada exitosamente, tamaño:', fotoBuffer.length);
                } catch (downloadError) {
                    console.error('BD AUTOS - Error descargando foto:', downloadError);
                    await bot.telegram.sendMessage(
                        chatId,
                        '❌ Error al procesar la foto. Por favor, intenta enviarla nuevamente.',
                        { parse_mode: 'Markdown' }
                    );
                    return true;
                }

                asignacion.datosPoliza.archivo = {
                    type: 'photo',
                    file_id: foto.file_id,
                    file_name: `poliza_foto_${Date.now()}.jpg`,
                    file_size: foto.file_size,
                    mime_type: 'image/jpeg',
                    buffer: fotoBuffer // Guardar el buffer
                };

                await bot.telegram.sendMessage(
                    chatId,
                    '✅ Foto de póliza guardada\n\n' +
                        '🎉 ¡Todos los datos están completos!\n' +
                        'Procesando asignación de póliza...'
                );

                return await this.finalizarAsignacion(bot, chatId, userId, asignacion);
            } catch (error) {
                console.error('Error procesando foto:', error);
                await bot.telegram.sendMessage(
                    chatId,
                    '❌ Error al procesar la foto. Intenta nuevamente.'
                );
                return true;
            }
        }

        // Si es otro tipo de documento que no sea PDF, rechazar
        if (msg.document && msg.document.mime_type !== 'application/pdf') {
            await bot.telegram.sendMessage(
                chatId,
                '❌ **FORMATO NO VÁLIDO**\n\n' +
                    `📄 Archivo recibido: ${msg.document.file_name}\n` +
                    `❌ Tipo: ${msg.document.mime_type}\n\n` +
                    '📎 Solo se aceptan:\n' +
                    '• PDF (documentos)\n' +
                    '• JPG/PNG (fotos)\n\n' +
                    'Por favor, envía el archivo correcto.',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        // Si no es PDF ni foto, solicitar archivo válido
        await bot.telegram.sendMessage(
            chatId,
            '❌ **ARCHIVO OBLIGATORIO**\n\n' +
                '📎 Debes enviar un archivo PDF o una foto\n' +
                '🔗 Formatos aceptados: PDF, JPG, PNG\n\n' +
                'No puedes finalizar sin adjuntar el archivo.',
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    /**
     * Finaliza la asignación de póliza
     */
    static async finalizarAsignacion(bot, chatId, userId, asignacion) {
        let polizaGuardada = null; // Declarar fuera del try para que esté disponible en catch

        try {
            const vehiculo = asignacion.vehiculo;
            const datosPoliza = asignacion.datosPoliza;

            // Crear la póliza usando los datos del vehículo + datos de la póliza
            const nuevaPoliza = {
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
                agenteCotizador: datosPoliza.nombrePersona, // Cambiado de agenteCotizador a nombrePersona
                fechaEmision: datosPoliza.fechaEmision,
                fechaFinCobertura: datosPoliza.fechaFinCobertura,

                // Pagos planificados (NO realizados - solo para referencia en reportes)
                pagos: [
                    {
                        monto: datosPoliza.primerPago,
                        fechaPago: datosPoliza.fechaEmision, // Primer pago = fecha de emisión
                        estado: 'PLANIFICADO',
                        notas: 'Pago inicial planificado al registrar póliza'
                    },
                    {
                        monto: datosPoliza.segundoPago,
                        fechaPago: (() => {
                            const fecha = new Date(datosPoliza.fechaEmision);
                            fecha.setMonth(fecha.getMonth() + 1); // Segundo pago = 1 mes después
                            return fecha;
                        })(),
                        estado: 'PLANIFICADO',
                        notas: 'Pago mensual planificado'
                    }
                ].filter(p => p.monto), // Filtrar undefined en caso de error

                // Metadatos especiales
                vehicleId: vehiculo._id, // Referencia al vehículo OBD
                creadoViaOBD: true,
                asignadoPor: userId
            };

            // Crear la póliza
            polizaGuardada = await policyController.savePolicy(nuevaPoliza);

            // Marcar el vehículo como asegurado
            await VehicleController.marcarConPoliza(vehiculo._id, polizaGuardada._id);

            // Transferir fotos del vehículo a la póliza
            await this.transferirFotosVehiculoAPoliza(vehiculo, polizaGuardada);

            // Procesar archivo (PDF o foto) si existe
            if (datosPoliza.archivo && datosPoliza.archivo.buffer) {
                try {
                    // Usar el buffer que ya descargamos
                    const buffer = datosPoliza.archivo.buffer;
                    console.log('BD AUTOS - Usando buffer pre-descargado, tamaño:', buffer.length);

                    // Validar que es un PDF válido si es tipo PDF
                    if (datosPoliza.archivo.type === 'pdf') {
                        const pdfHeader = buffer.slice(0, 4).toString();
                        if (!pdfHeader.startsWith('%PDF')) {
                            console.error('BD AUTOS - Buffer no es un PDF válido. Header:', pdfHeader);
                            console.error('BD AUTOS - Contenido completo (primeros 200 chars):', buffer.slice(0, 200).toString());
                            throw new Error('El archivo descargado no es un PDF válido');
                        }
                    }

                    // Subir a Cloudflare R2
                    const { getInstance } = require('../../services/CloudflareStorage');
                    const storage = getInstance();

                    let uploadResult;
                    if (datosPoliza.archivo.type === 'pdf') {
                        uploadResult = await storage.uploadPolicyPDF(
                            buffer,
                            datosPoliza.numeroPoliza,
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
                            uploadedAt: new Date(),
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
            const escapeMarkdown = text => {
                return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
            };

            const mensaje =
                '🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*\n\n' +
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

            await bot.telegram.sendMessage(chatId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            });

            // Limpiar el proceso de asignación
            asignacionesEnProceso.delete(userId);

            // Limpiar el estado del flujo BD AUTOS
            // Nota: El stateManager no está disponible en este contexto estático
            // El estado se limpiará desde BaseAutosCommand después de la finalización

            return true;
        } catch (error) {
            console.error('Error finalizando asignación:', error);

            // Si ya se creó la póliza, informar el ID para poder verificarla
            let mensajeError = '❌ Error al finalizar la asignación de póliza.';
            if (polizaGuardada && polizaGuardada._id) {
                mensajeError += `\n\n⚠️ La póliza se creó parcialmente:\n📋 Número: ${asignacion.datosPoliza.numeroPoliza}\n🆔 ID: ${polizaGuardada._id}`;
            }

            await bot.telegram.sendMessage(chatId, mensajeError);

            // Limpiar el estado aunque haya error
            asignacionesEnProceso.delete(userId);

            // Limpiar el estado del flujo BD AUTOS
            // Nota: El stateManager no está disponible en este contexto estático
            // El estado se limpiará desde BaseAutosCommand después de la finalización

            return true;
        }
    }

    /**
     * Valida formato de fecha DD/MM/AAAA
     */
    static validarFecha(fechaStr) {
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
     * Valida formato de pago MONTO,FECHA
     */
    static validarPago(pagoStr) {
        const partes = pagoStr.split(',');
        if (partes.length !== 2) return null;

        const monto = parseFloat(partes[0]);
        if (isNaN(monto) || monto <= 0) return null;

        const fecha = this.validarFecha(partes[1].trim());
        if (!fecha) return null;

        return {
            monto: monto,
            fecha: fecha
        };
    }

    /**
     * Verifica si un usuario tiene una asignación en proceso
     */
    static tieneAsignacionEnProceso(userId) {
        return asignacionesEnProceso.has(userId);
    }

    /**
     * Transfiere las fotos del vehículo a la póliza
     * Copia las referencias de R2 del vehículo a la póliza
     */
    static async transferirFotosVehiculoAPoliza(vehiculo, poliza) {
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
            const Policy = require('../../models/policy');
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
            const fotosTransferidas = [];
            for (const foto of vehiculo.archivos.r2Files.fotos) {
                fotosTransferidas.push({
                    url: foto.url,
                    key: foto.key,
                    size: foto.size,
                    contentType: foto.contentType || 'image/jpeg',
                    uploadedAt: foto.uploadedAt || new Date(),
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

    /**
     * Alinea las fotos del vehículo en Cloudflare con la nueva estructura de póliza
     * Crea una copia organizada de las fotos para el vehículo con póliza
     */
    static async alinearFotosConPoliza(vehiculo, polizaId) {
        try {
            // Si el vehículo tiene fotos en Cloudflare
            if (
                vehiculo.archivos &&
                vehiculo.archivos.r2Files &&
                vehiculo.archivos.r2Files.fotos.length > 0
            ) {
                const CloudflareStorage = require('../../services/CloudflareStorage');
                const fotosAlineadas = [];

                for (let i = 0; i < vehiculo.archivos.r2Files.fotos.length; i++) {
                    const fotoOriginal = vehiculo.archivos.r2Files.fotos[i];

                    try {
                        // Crear nueva estructura: polizas/{polizaId}/vehiculo_{serie}/
                        const nuevoPath = `polizas/${polizaId}/vehiculo_${vehiculo.serie}`;
                        const nuevoNombre = `foto_${i + 1}_${Date.now()}.jpg`;

                        // Copiar archivo en Cloudflare a nueva ubicación
                        // TODO: Implementar copyFile en CloudflareStorage
                        // Por ahora, solo referenciamos la foto original
                        const copyResult = {
                            url: fotoOriginal.url,
                            key: fotoOriginal.key
                        };

                        if (copyResult && copyResult.url) {
                            fotosAlineadas.push({
                                url: copyResult.url,
                                key: copyResult.key,
                                originalName: nuevoNombre,
                                contentType: 'image/jpeg',
                                size: fotoOriginal.size,
                                uploadDate: new Date(),
                                polizaId: polizaId,
                                alineadaDe: fotoOriginal.key
                            });
                        }
                    } catch (error) {
                        console.warn(`Error copiando foto ${i + 1}:`, error);
                        // Continuar con las demás fotos
                    }
                }

                // Agregar las fotos alineadas al vehículo
                if (fotosAlineadas.length > 0) {
                    vehiculo.archivos.r2Files.fotos.push(...fotosAlineadas);
                    await vehiculo.save();

                    console.log(
                        `✅ ${fotosAlineadas.length} fotos alineadas para póliza ${polizaId}`
                    );
                }
            }
        } catch (error) {
            console.error('Error alineando fotos con póliza:', error);
            // No fallar el proceso por esto
        }
    }
}

module.exports = {
    PolicyAssignmentHandler,
    ESTADOS_ASIGNACION,
    asignacionesEnProceso
};
