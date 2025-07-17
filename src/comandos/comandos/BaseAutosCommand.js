const BaseCommand = require('./BaseCommand');
const { VehicleRegistrationHandler } = require('./VehicleRegistrationHandler');
const { PolicyAssignmentHandler } = require('./PolicyAssignmentHandler');
const { getBaseAutosKeyboard, getMainKeyboard } = require('../teclados');

/**
 * Comando principal para Base de Autos
 * Maneja ambos flujos: registro de autos y asignación de pólizas
 */
class BaseAutosCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'base_autos';
    }

    getDescription() {
        return 'Base de Datos de Autos - Registro y Asignación de Pólizas';
    }

    register() {
        // Acción principal del botón Base de Autos
        this.bot.action('accion:base_autos', async ctx => {
            try {
                await ctx.answerCbQuery();

                const mensaje = '🚗 *BASE DE AUTOS*\n\n' + 'Selecciona tu rol:';

                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    ...getBaseAutosKeyboard()
                });

                this.logInfo('Menú Base de Autos mostrado', {
                    chatId: ctx.chat.id,
                    userId: ctx.from.id
                });
            } catch (error) {
                this.logError('Error en accion:base_autos:', error);
                await ctx.reply('❌ Error al mostrar el menú de Base de Autos.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Registrar Auto (Persona 1)
        this.bot.action('base_autos:registrar', async ctx => {
            try {
                await ctx.answerCbQuery();
                await ctx.deleteMessage();

                const userId = ctx.from.id.toString();
                const chatId = ctx.chat.id;

                // Verificar si ya tiene un registro en proceso
                if (VehicleRegistrationHandler.tieneRegistroEnProceso(userId)) {
                    await ctx.reply(
                        '⚠️ Ya tienes un registro en proceso. Completalo o cancelalo primero.'
                    );
                    return;
                }

                // Iniciar registro de vehículo
                await VehicleRegistrationHandler.iniciarRegistro(this.bot, chatId, userId);

                this.logInfo('Registro de vehículo iniciado', {
                    chatId,
                    userId
                });
            } catch (error) {
                this.logError('Error iniciando registro de vehículo:', error);
                await ctx.reply('❌ Error al iniciar el registro.');
            }
        });

        // Asegurar Auto (Persona 2)
        this.bot.action('base_autos:asegurar', async ctx => {
            try {
                await ctx.answerCbQuery();
                await ctx.deleteMessage();

                const userId = ctx.from.id.toString();
                const chatId = ctx.chat.id;

                // Verificar si ya tiene una asignación en proceso
                if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)) {
                    await ctx.reply(
                        '⚠️ Ya tienes una asignación en proceso. Completala o cancelala primero.'
                    );
                    return;
                }

                // Mostrar vehículos disponibles para asegurar
                await PolicyAssignmentHandler.mostrarVehiculosDisponibles(this.bot, chatId, userId);

                this.logInfo('Lista de vehículos para asegurar mostrada', {
                    chatId,
                    userId
                });
            } catch (error) {
                this.logError('Error mostrando vehículos para asegurar:', error);
                await ctx.reply('❌ Error al mostrar vehículos disponibles.');
            }
        });

        // Volver al menú principal
        this.bot.action('accion:volver_menu', async ctx => {
            try {
                await ctx.answerCbQuery();

                const mensaje =
                    '🤖 **Bot de Pólizas** - Menú Principal\n\nSelecciona una categoría:';

                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    ...getMainKeyboard()
                });
            } catch (error) {
                this.logError('Error volviendo al menú principal:', error);
                await ctx.reply('❌ Error al volver al menú.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Manejar selección de vehículo para asegurar
        this.bot.action(/^asignar_(.+)$/, async ctx => {
            try {
                await ctx.answerCbQuery();

                const vehicleId = ctx.match[1];
                const userId = ctx.from.id.toString();
                const chatId = ctx.chat.id;

                await ctx.deleteMessage();

                // Iniciar asignación de póliza
                await PolicyAssignmentHandler.iniciarAsignacion(
                    this.bot,
                    chatId,
                    userId,
                    vehicleId
                );

                this.logInfo('Asignación de póliza iniciada', {
                    chatId,
                    userId,
                    vehicleId
                });
            } catch (error) {
                this.logError('Error iniciando asignación de póliza:', error);
                await ctx.reply('❌ Error al iniciar la asignación de póliza.');
            }
        });

        // Manejar paginación de vehículos
        this.bot.action(/^vehiculos_pag_(\d+)$/, async ctx => {
            try {
                await ctx.answerCbQuery();

                const pagina = parseInt(ctx.match[1]);
                const userId = ctx.from.id.toString();
                const chatId = ctx.chat.id;

                await ctx.deleteMessage();

                // Mostrar página específica
                await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                    this.bot,
                    chatId,
                    userId,
                    pagina
                );
            } catch (error) {
                this.logError('Error en paginación de vehículos:', error);
                await ctx.reply('❌ Error al cargar la página.');
            }
        });

        // Manejar cancelaciones
        this.bot.action('vehiculo_cancelar', async ctx => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from.id.toString();

                VehicleRegistrationHandler.cancelarRegistro(userId);

                await ctx.editMessageText('❌ Registro de vehículo cancelado.', {
                    reply_markup: getMainKeyboard()
                });

                this.logInfo('Registro de vehículo cancelado', { userId });
            } catch (error) {
                this.logError('Error cancelando registro de vehículo:', error);
                await ctx.reply('❌ Error al cancelar.');
            }
        });

        this.bot.action('vehiculo_finalizar', async ctx => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from.id.toString();
                const chatId = ctx.chat.id;

                // Obtener el registro en proceso
                const { vehiculosEnProceso } = require('./VehicleRegistrationHandler');
                const registro = vehiculosEnProceso?.get(userId);

                if (!registro) {
                    await ctx.reply('❌ No hay registro en proceso.');
                    return;
                }

                // Finalizar el registro
                const resultado = await VehicleRegistrationHandler.finalizarRegistro(
                    this.bot,
                    chatId,
                    userId,
                    registro
                );

                if (resultado) {
                    await ctx.deleteMessage();
                }

                this.logInfo('Registro de vehículo finalizado', { userId });
            } catch (error) {
                this.logError('Error finalizando registro de vehículo:', error);
                await ctx.reply('❌ Error al finalizar.');
            }
        });

        this.bot.action('poliza_cancelar', async ctx => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from.id.toString();

                // Limpiar asignación en proceso
                const { asignacionesEnProceso } = require('./PolicyAssignmentHandler');
                if (asignacionesEnProceso) {
                    asignacionesEnProceso.delete(userId);
                }

                await ctx.editMessageText('❌ Asignación de póliza cancelada.', {
                    reply_markup: getMainKeyboard()
                });

                this.logInfo('Asignación de póliza cancelada', { userId });
            } catch (error) {
                this.logError('Error cancelando asignación de póliza:', error);
                await ctx.reply('❌ Error al cancelar.');
            }
        });

        // Handler para selección de fecha de emisión
        this.bot.action(/^fecha_emision_(.+)$/, async ctx => {
            try {
                await ctx.answerCbQuery();

                const fechaISO = ctx.match[1];
                const userId = ctx.from.id.toString();
                const chatId = ctx.chat.id;

                // Verificar que hay asignación en proceso
                const { asignacionesEnProceso } = require('./PolicyAssignmentHandler');
                const asignacion = asignacionesEnProceso.get(userId);

                if (!asignacion) {
                    await ctx.reply('❌ No hay asignación de póliza en proceso.');
                    return;
                }

                await ctx.deleteMessage();

                // Procesar la fecha seleccionada
                await PolicyAssignmentHandler.confirmarFechaEmision(
                    this.bot,
                    chatId,
                    fechaISO,
                    asignacion
                );

                this.logInfo('Fecha de emisión seleccionada', {
                    userId,
                    chatId,
                    fechaISO
                });
            } catch (error) {
                this.logError('Error procesando selección de fecha:', error);
                await ctx.reply('❌ Error al procesar la fecha.');
            }
        });

        // NO registrar handler global de message aquí
        // Los mensajes serán procesados por TextMessageHandler que ya existe

        this.logInfo('BaseAutosCommand registrado exitosamente');
    }

    /**
     * Procesa mensajes para flujos activos de Base de Autos
     * @param {Object} message - Mensaje de Telegram
     * @param {string} userId - ID del usuario
     * @returns {boolean} true si el mensaje fue procesado, false si no
     */
    async procesarMensajeBaseAutos(message, userId) {
        try {
            // Verificar si hay registro de vehículo en proceso
            if (VehicleRegistrationHandler.tieneRegistroEnProceso(userId)) {
                const procesado = await VehicleRegistrationHandler.procesarMensaje(
                    this.bot,
                    message,
                    userId
                );
                if (procesado) return true;
            }

            // Verificar si hay asignación de póliza en proceso
            if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)) {
                const procesado = await PolicyAssignmentHandler.procesarMensaje(
                    this.bot,
                    message,
                    userId
                );

                // Si el proceso terminó, limpiar el estado BD AUTOS
                if (procesado && !PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)) {
                    if (this.handler?.registry?.stateManager) {
                        await this.handler.registry.stateManager.clearUserState(
                            userId,
                            'bd_autos_flow'
                        );
                    }
                }

                if (procesado) return true;
            }

            return false; // No se procesó ningún flujo
        } catch (error) {
            this.logError('Error procesando mensaje en BaseAutosCommand:', error);
            return false;
        }
    }

    /**
     * Procesa documentos para flujos activos de Base de Autos
     * @param {Object} message - Mensaje de Telegram con documento
     * @param {string} userId - ID del usuario
     * @returns {boolean} true si el documento fue procesado, false si no
     */
    async procesarDocumentoBaseAutos(message, userId) {
        try {
            // Solo procesar si hay asignación de póliza en proceso
            if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId)) {
                const procesado = await PolicyAssignmentHandler.procesarMensaje(
                    this.bot,
                    message,
                    userId
                );
                if (procesado) return true;
            }

            return false; // No se procesó ningún flujo
        } catch (error) {
            this.logError('Error procesando documento en BaseAutosCommand:', error);
            return false;
        }
    }
}

module.exports = BaseAutosCommand;
