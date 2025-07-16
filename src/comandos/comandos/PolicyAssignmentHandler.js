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
    ESPERANDO_AGENTE: 'esperando_agente',
    ESPERANDO_FECHA_EMISION: 'esperando_fecha_emision',
    ESPERANDO_FECHA_FIN: 'esperando_fecha_fin',
    ESPERANDO_PAGOS: 'esperando_pagos',
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
                await bot.telegram.sendMessage(chatId,
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
                mensaje += `   👤 Titular: ${vehiculo.titularTemporal}\n`;
                mensaje += `   📅 Registrado: ${new Date(vehiculo.createdAt).toLocaleDateString('es-MX')}\n\n`;

                // Botón para seleccionar este vehículo
                botones.push([{
                    text: `${numero}. ${vehiculo.marca} ${vehiculo.submarca}`,
                    callback_data: `asignar_${vehiculo._id}`
                }]);
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

            // Botones adicionales
            botones.push([
                { text: '🔍 Buscar Vehículo', callback_data: 'buscar_vehiculo' },
                { text: '📊 Estadísticas', callback_data: 'stats_vehiculos' }
            ]);
            botones.push([
                { text: '🏠 Menú Principal', callback_data: 'menu_principal' }
            ]);

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
                await bot.telegram.sendMessage(chatId,
                    '❌ Este vehículo ya tiene póliza asignada o no está disponible.\n' +
          `Estado actual: ${vehiculo.estado}`
                );
                return false;
            }

            // Limpiar cualquier asignación previa para este usuario
            asignacionesEnProceso.delete(userId);

            // Mostrar resumen del vehículo seleccionado
            const mensaje = '🚗 *VEHÍCULO SELECCIONADO*\n\n' +
        `*${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}*\n` +
        `🎨 Color: ${vehiculo.color}\n` +
        `🔢 Serie: ${vehiculo.serie}\n` +
        `🚙 Placas: ${vehiculo.placas || 'Sin placas'}\n\n` +
        '*Datos temporales del titular:*\n' +
        `👤 ${vehiculo.titularTemporal}\n` +
        `🆔 RFC: ${vehiculo.rfcTemporal}\n` +
        `📱 ${vehiculo.telefonoTemporal}\n\n` +
        '💼 *INICIAR ASIGNACIÓN DE PÓLIZA*\n\n' +
        '*Paso 1/7:* Ingresa el *número de póliza*\n' +
        '📝 Ejemplo: POL-2024-001234';

            await bot.telegram.sendMessage(chatId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Cancelar', callback_data: 'poliza_cancelar' }
                    ]]
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

            case ESTADOS_ASIGNACION.ESPERANDO_AGENTE:
                return await this.procesarAgente(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_FECHA_EMISION:
                return await this.procesarFechaEmision(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_FECHA_FIN:
                return await this.procesarFechaFin(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_PAGOS:
                return await this.procesarPagos(bot, chatId, userId, texto, asignacion);

            case ESTADOS_ASIGNACION.ESPERANDO_PDF:
                return await this.procesarPDF(bot, msg, userId, asignacion);

            default:
                return false;
            }
        } catch (error) {
            console.error('Error procesando mensaje de asignación:', error);
            await bot.telegram.sendMessage(chatId, '❌ Error en la asignación. Intenta nuevamente.');
            return true;
        }
    }

    /**
   * Procesa el número de póliza
   */
    static async procesarNumeroPoliza(bot, chatId, userId, numeroPoliza, asignacion) {
        if (!numeroPoliza || numeroPoliza.length < 5) {
            await bot.telegram.sendMessage(chatId, '❌ El número de póliza debe tener al menos 5 caracteres.\nIntenta nuevamente:');
            return true;
        }

        // Verificar que no exista la póliza
        const existePoliza = await policyController.buscarPorNumeroPoliza(numeroPoliza);
        if (existePoliza) {
            await bot.telegram.sendMessage(chatId,
                `❌ Ya existe una póliza con este número: ${numeroPoliza}\n` +
        'Ingresa un número diferente:'
            );
            return true;
        }

        asignacion.datosPoliza.numeroPoliza = numeroPoliza;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_ASEGURADORA;

        await bot.telegram.sendMessage(chatId,
            `✅ Número de póliza: *${numeroPoliza}*\n\n` +
      '*Paso 2/7:* Ingresa la *aseguradora*\n' +
      '📝 Ejemplo: GNP, Seguros Monterrey, AXA, etc.',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
   * Procesa la aseguradora
   */
    static async procesarAseguradora(bot, chatId, userId, aseguradora, asignacion) {
        if (!aseguradora || aseguradora.length < 2) {
            await bot.telegram.sendMessage(chatId, '❌ La aseguradora debe tener al menos 2 caracteres.\nIntenta nuevamente:');
            return true;
        }

        asignacion.datosPoliza.aseguradora = aseguradora;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_AGENTE;

        await bot.telegram.sendMessage(chatId,
            `✅ Aseguradora: *${aseguradora}*\n\n` +
      '*Paso 3/7:* Ingresa el *agente cotizador*\n' +
      '📝 Ejemplo: Juan Pérez, María González, etc.',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
   * Procesa el agente cotizador
   */
    static async procesarAgente(bot, chatId, userId, agente, asignacion) {
        if (!agente || agente.length < 3) {
            await bot.telegram.sendMessage(chatId, '❌ El agente debe tener al menos 3 caracteres.\nIntenta nuevamente:');
            return true;
        }

        asignacion.datosPoliza.agenteCotizador = agente;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_FECHA_EMISION;

        await bot.telegram.sendMessage(chatId,
            `✅ Agente: *${agente}*\n\n` +
      '*Paso 4/7:* Ingresa la *fecha de emisión*\n' +
      '📝 Formato: DD/MM/AAAA\n' +
      '📅 Ejemplo: 15/01/2024',
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
   * Procesa la fecha de emisión
   */
    static async procesarFechaEmision(bot, chatId, userId, fecha, asignacion) {
        const fechaValida = this.validarFecha(fecha);
        if (!fechaValida) {
            await bot.telegram.sendMessage(chatId,
                '❌ Fecha inválida. Usa el formato DD/MM/AAAA\n' +
        '📅 Ejemplo: 15/01/2024\nIntenta nuevamente:'
            );
            return true;
        }

        asignacion.datosPoliza.fechaEmision = fechaValida;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_FECHA_FIN;

        await bot.telegram.sendMessage(chatId,
            `✅ Fecha de emisión: *${fecha}*\n\n` +
      '*Paso 5/7:* Ingresa la *fecha de fin de cobertura*\n' +
      '📝 Formato: DD/MM/AAAA\n' +
      '📅 Ejemplo: 15/01/2025',
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
            await bot.telegram.sendMessage(chatId,
                '❌ Fecha inválida. Usa el formato DD/MM/AAAA\n' +
        '📅 Ejemplo: 15/01/2025\nIntenta nuevamente:'
            );
            return true;
        }

        asignacion.datosPoliza.fechaFinCobertura = fechaValida;
        asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PAGOS;

        await bot.telegram.sendMessage(chatId,
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
   * Procesa los pagos (opcional)
   */
    static async procesarPagos(bot, chatId, userId, texto, asignacion) {
        if (texto.toUpperCase() === 'CONTINUAR') {
            asignacion.estado = ESTADOS_ASIGNACION.ESPERANDO_PDF;

            await bot.telegram.sendMessage(chatId,
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
            await bot.telegram.sendMessage(chatId,
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

        await bot.telegram.sendMessage(chatId,
            `✅ Pago agregado: $${pago.monto.toLocaleString()} - ${pago.fecha}\n\n` +
      `💰 Total pagos: ${asignacion.datosPoliza.pagos.length}\n` +
      '📋 Agrega otro pago o escribe "CONTINUAR" para el siguiente paso'
        );

        return true;
    }

    /**
   * Procesa el PDF de la póliza
   */
    static async procesarPDF(bot, msg, userId, asignacion) {
        const chatId = msg.chat.id;

        if (msg.text === 'CONTINUAR') {
            return await this.finalizarAsignacion(bot, chatId, userId, asignacion);
        }

        if (!msg.document || msg.document.mime_type !== 'application/pdf') {
            await bot.telegram.sendMessage(chatId,
                '📎 Por favor envía un archivo PDF o escribe "CONTINUAR" para finalizar sin PDF.'
            );
            return true;
        }

        try {
            // Procesar el PDF
            asignacion.datosPoliza.pdf = {
                file_id: msg.document.file_id,
                file_name: msg.document.file_name,
                file_size: msg.document.file_size
            };

            await bot.telegram.sendMessage(chatId,
                `✅ PDF guardado: ${msg.document.file_name}\n\n` +
        '🎉 ¡Todos los datos están completos!\n' +
        'Procesando asignación de póliza...'
            );

            return await this.finalizarAsignacion(bot, chatId, userId, asignacion);

        } catch (error) {
            console.error('Error procesando PDF:', error);
            await bot.telegram.sendMessage(chatId, '❌ Error al procesar el PDF. Intenta nuevamente.');
            return true;
        }
    }

    /**
   * Finaliza la asignación de póliza
   */
    static async finalizarAsignacion(bot, chatId, userId, asignacion) {
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
                titular: vehiculo.titularTemporal,
                rfc: vehiculo.rfcTemporal,
                telefono: vehiculo.telefonoTemporal,
                correo: vehiculo.correoTemporal,
                calle: vehiculo.calleTemporal,
                colonia: vehiculo.coloniaTemporal,
                municipio: vehiculo.municipioTemporal,
                estadoRegion: vehiculo.estadoRegionTemporal,
                cp: vehiculo.cpTemporal,

                // Datos de la póliza
                numeroPoliza: datosPoliza.numeroPoliza,
                aseguradora: datosPoliza.aseguradora,
                agenteCotizador: datosPoliza.agenteCotizador,
                fechaEmision: datosPoliza.fechaEmision,
                fechaFinCobertura: datosPoliza.fechaFinCobertura,

                // Pagos y archivos
                pagos: datosPoliza.pagos || [],

                // Metadatos especiales
                vehicleId: vehiculo._id, // Referencia al vehículo OBD
                creadoViaOBD: true,
                asignadoPor: userId
            };

            // Crear la póliza
            const resultado = await policyController.crearPoliza(nuevaPoliza);

            if (!resultado.success) {
                await bot.telegram.sendMessage(chatId, `❌ Error al crear póliza: ${resultado.error}`);
                return true;
            }

            // Marcar el vehículo como asegurado
            await VehicleController.marcarConPoliza(vehiculo._id, resultado.poliza._id);

            // Alinear fotos: reorganizar en Cloudflare con nueva estructura
            await this.alinearFotosConPoliza(vehiculo, resultado.poliza._id);

            // Procesar PDF si existe
            if (datosPoliza.pdf) {
                // Aquí se procesaría la subida del PDF
                // Por simplicidad, se omite en este mockup
            }

            const mensaje = '🎉 *PÓLIZA ASIGNADA EXITOSAMENTE*\n\n' +
        `📋 *Póliza:* ${datosPoliza.numeroPoliza}\n` +
        `🏢 *Aseguradora:* ${datosPoliza.aseguradora}\n` +
        `👨‍💼 *Agente:* ${datosPoliza.agenteCotizador}\n\n` +
        '🚗 *Vehículo asegurado:*\n' +
        `${vehiculo.marca} ${vehiculo.submarca} ${vehiculo.año}\n` +
        `👤 Titular: ${vehiculo.titularTemporal}\n\n` +
        '✅ El vehículo ahora tiene estado: CON_POLIZA\n' +
        `🆔 ID de póliza: ${resultado.poliza._id}`;

            await bot.telegram.sendMessage(chatId, mensaje, {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
            });

            // Limpiar el proceso de asignación
            asignacionesEnProceso.delete(userId);

            return true;

        } catch (error) {
            console.error('Error finalizando asignación:', error);
            await bot.telegram.sendMessage(chatId, '❌ Error al finalizar la asignación de póliza.');
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

        if (fecha.getDate() !== dia || fecha.getMonth() !== mes - 1 || fecha.getFullYear() !== año) {
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
   * Alinea las fotos del vehículo en Cloudflare con la nueva estructura de póliza
   * Crea una copia organizada de las fotos para el vehículo con póliza
   */
    static async alinearFotosConPoliza(vehiculo, polizaId) {
        try {
            // Si el vehículo tiene fotos en Cloudflare
            if (vehiculo.archivos && vehiculo.archivos.r2Files && vehiculo.archivos.r2Files.fotos.length > 0) {
                const CloudflareStorage = require('../../services/CloudflareStorage');
                const fotosAlineadas = [];

                for (let i = 0; i < vehiculo.archivos.r2Files.fotos.length; i++) {
                    const fotoOriginal = vehiculo.archivos.r2Files.fotos[i];
                    
                    try {
                        // Crear nueva estructura: polizas/{polizaId}/vehiculo_{serie}/
                        const nuevoPath = `polizas/${polizaId}/vehiculo_${vehiculo.serie}`;
                        const nuevoNombre = `foto_${i + 1}_${Date.now()}.jpg`;
                        
                        // Copiar archivo en Cloudflare a nueva ubicación
                        const copyResult = await CloudflareStorage.copyFile(
                            fotoOriginal.key, // archivo original
                            `${nuevoPath}/${nuevoNombre}` // nueva ubicación
                        );

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
                    
                    console.log(`✅ ${fotosAlineadas.length} fotos alineadas para póliza ${polizaId}`);
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
