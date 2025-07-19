// src/comandos/comandos/BaseAutosCommand.ts
import BaseCommand from './BaseCommand';
import { VehicleRegistrationHandler } from './VehicleRegistrationHandler';
import { PolicyAssignmentHandler } from './PolicyAssignmentHandler';
import { getBaseAutosKeyboard, getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';
import type { IBaseHandler, NavigationContext } from './BaseCommand';
import type { Context } from 'telegraf';

interface TelegramMessage {
    chat: {
        id: number | string;
    };
    message_thread_id?: number | null;
    [key: string]: any;
}

interface RegistryWithStateManager {
    stateManager?: {
        clearUserState(userId: string, flowType: string): Promise<void>;
    };
}

interface BaseAutosHandler extends IBaseHandler {
    registry?: RegistryWithStateManager;
}

/**
 * Comando principal para Base de Autos
 * Maneja ambos flujos: registro de autos y asignación de pólizas
 */
class BaseAutosCommand extends BaseCommand {
    constructor(handler: BaseAutosHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'base_autos';
    }

    getDescription(): string {
        return 'Base de Datos de Autos - Registro y Asignación de Pólizas';
    }

    register(): void {
        // Acción principal del botón Base de Autos
        this.bot.action('accion:base_autos', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();

                const mensaje = '🚗 *BASE DE AUTOS*\n\n' + 'Selecciona tu rol:';

                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    ...getBaseAutosKeyboard()
                });

                this.logInfo('Menú Base de Autos mostrado', {
                    chatId: ctx.chat?.id,
                    userId: ctx.from?.id
                });
            } catch (error: any) {
                this.logError('Error en accion:base_autos:', error);
                await ctx.reply('❌ Error al mostrar el menú de Base de Autos.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Registrar Auto (Persona 1)
        this.bot.action('base_autos:registrar', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();
                await ctx.deleteMessage();

                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }

                // Convertir threadId a string si es necesario
                const threadIdStr = threadId ? String(threadId) : null;

                // Verificar si ya tiene un registro en proceso
                if (VehicleRegistrationHandler.tieneRegistroEnProceso(userId, chatId, threadIdStr)) {
                    await ctx.reply(
                        '⚠️ Ya tienes un registro en proceso. Completalo o cancelalo primero.'
                    );
                    return;
                }

                // Iniciar registro de vehículo
                await VehicleRegistrationHandler.iniciarRegistro(
                    this.bot,
                    chatId,
                    userId,
                    threadIdStr
                );

                this.logInfo('Registro de vehículo iniciado', {
                    chatId,
                    userId
                });
            } catch (error: any) {
                this.logError('Error iniciando registro de vehículo:', error);
                await ctx.reply('❌ Error al iniciar el registro.');
            }
        });

        // Asegurar Auto (Persona 2)
        this.bot.action('base_autos:asegurar', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();
                await ctx.deleteMessage();

                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }

                // Convertir tipos según lo que necesita cada función
                const threadIdStr = threadId ? String(threadId) : null;
                const threadIdNum = typeof threadId === 'number' ? threadId : null;
                const userIdStr = String(userId);

                // Verificar si ya tiene una asignación en proceso
                if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userIdStr, chatId, threadIdNum)) {
                    await ctx.reply(
                        '⚠️ Ya tienes una asignación en proceso. Completala o cancelala primero.'
                    );
                    return;
                }

                // Mostrar vehículos disponibles para asegurar
                await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                    this.bot,
                    chatId,
                    userIdStr,
                    threadIdNum
                );

                this.logInfo('Lista de vehículos para asegurar mostrada', {
                    chatId,
                    userId
                });
            } catch (error: any) {
                this.logError('Error mostrando vehículos para asegurar:', error);
                await ctx.reply('❌ Error al mostrar vehículos disponibles.');
            }
        });

        // Volver al menú principal
        this.bot.action('accion:volver_menu', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();

                const mensaje =
                    '🤖 **Bot de Pólizas** - Menú Principal\n\nSelecciona una categoría:';

                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    ...getMainKeyboard()
                });
            } catch (error: any) {
                this.logError('Error volviendo al menú principal:', error);
                await ctx.reply('❌ Error al volver al menú.');
                try {
                    await ctx.answerCbQuery('Error');
                } catch {}
            }
        });

        // Manejar selección de vehículo para asegurar
        this.bot.action(/^asignar_(.+)$/, async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();

                const vehicleId = ctx.match?.[1];
                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;

                if (!vehicleId || !userId || !chatId) {
                    await ctx.reply('❌ Error: Datos incompletos para la asignación.');
                    return;
                }

                await ctx.deleteMessage();

                // Iniciar asignación de póliza
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdNum = typeof threadId === 'number' ? threadId : null;
                const userIdStr = String(userId);
                
                await PolicyAssignmentHandler.iniciarAsignacion(
                    this.bot,
                    chatId,
                    userIdStr,
                    vehicleId,
                    threadIdNum
                );

                this.logInfo('Asignación de póliza iniciada', {
                    chatId,
                    userId,
                    vehicleId
                });
            } catch (error: any) {
                this.logError('Error iniciando asignación de póliza:', error);
                await ctx.reply('❌ Error al iniciar la asignación de póliza.');
            }
        });

        // Manejar paginación de vehículos
        this.bot.action(/^vehiculos_pag_(\d+)$/, async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();

                const pagina = parseInt(ctx.match?.[1] || '1');
                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;

                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }

                await ctx.deleteMessage();

                // Mostrar página específica
                const threadId = StateKeyManager.getThreadId(ctx);
                const threadIdNum = typeof threadId === 'number' ? threadId : null;
                const userIdStr = String(userId);
                
                await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                    this.bot,
                    chatId,
                    userIdStr,
                    threadIdNum,
                    pagina
                );
            } catch (error: any) {
                this.logError('Error en paginación de vehículos:', error);
                await ctx.reply('❌ Error al cargar la página.');
            }
        });

        // Manejar cancelaciones
        this.bot.action('vehiculo_cancelar', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }

                const threadIdStr = threadId ? String(threadId) : null;
                VehicleRegistrationHandler.cancelarRegistro(userId, chatId, threadIdStr);

                await ctx.editMessageText('❌ Registro de vehículo cancelado.', {
                    reply_markup: getMainKeyboard().reply_markup
                });

                this.logInfo('Registro de vehículo cancelado', { userId });
            } catch (error: any) {
                this.logError('Error cancelando registro de vehículo:', error);
                await ctx.reply('❌ Error al cancelar.');
            }
        });

        this.bot.action('vehiculo_finalizar', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                if (!userId || !chatId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario o chat.');
                    return;
                }

                // Obtener el registro en proceso usando thread-safe key
                const { vehiculosEnProceso } = require('./VehicleRegistrationHandler');
                const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
                const registro = vehiculosEnProceso?.get(stateKey);

                if (!registro) {
                    await ctx.reply('❌ No hay registro en proceso.');
                    return;
                }

                // Finalizar el registro
                const resultado = await VehicleRegistrationHandler.finalizarRegistro(
                    this.bot,
                    chatId,
                    userId,
                    registro,
                    stateKey
                );

                if (resultado) {
                    await ctx.deleteMessage();
                }

                this.logInfo('Registro de vehículo finalizado', { userId });
            } catch (error: any) {
                this.logError('Error finalizando registro de vehículo:', error);
                await ctx.reply('❌ Error al finalizar.');
            }
        });

        this.bot.action('poliza_cancelar', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();
                const userId = ctx.from?.id;

                if (!userId) {
                    await ctx.reply('❌ Error: No se pudo identificar el usuario.');
                    return;
                }

                // Limpiar asignación en proceso
                const { asignacionesEnProceso } = require('./PolicyAssignmentHandler');
                if (asignacionesEnProceso) {
                    asignacionesEnProceso.delete(userId);
                }

                await ctx.editMessageText('❌ Asignación de póliza cancelada.', {
                    reply_markup: getMainKeyboard().reply_markup
                });

                this.logInfo('Asignación de póliza cancelada', { userId });
            } catch (error: any) {
                this.logError('Error cancelando asignación de póliza:', error);
                await ctx.reply('❌ Error al cancelar.');
            }
        });

        // Handler para selección de fecha de emisión
        this.bot.action(/^fecha_emision_(.+)$/, async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();

                const fechaISO = ctx.match?.[1];
                const userId = ctx.from?.id;
                const chatId = ctx.chat?.id;
                const threadId = StateKeyManager.getThreadId(ctx);

                if (!fechaISO || !userId || !chatId) {
                    await ctx.reply('❌ Error: Datos incompletos para la fecha.');
                    return;
                }

                // Verificar que hay asignación en proceso usando thread-safe key
                const { asignacionesEnProceso } = require('./PolicyAssignmentHandler');
                const stateKey = `${userId}:${StateKeyManager.getContextKey(chatId, threadId)}`;
                const asignacion = asignacionesEnProceso.get(stateKey);

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
                    asignacion,
                    stateKey
                );

                this.logInfo('Fecha de emisión seleccionada', {
                    userId,
                    chatId,
                    fechaISO
                });
            } catch (error: any) {
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
     * @param message - Mensaje de Telegram
     * @param userId - ID del usuario
     * @returns true si el mensaje fue procesado, false si no
     */
    async procesarMensajeBaseAutos(message: TelegramMessage, userId: string): Promise<boolean> {
        try {
            const chatId = typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
            const threadId = message.message_thread_id || null;
            const threadIdStr = threadId ? String(threadId) : null;
            const threadIdNum = typeof threadId === 'number' ? threadId : null;
            const userIdNum = parseInt(userId);

            // Verificar si hay registro de vehículo en proceso
            if (VehicleRegistrationHandler.tieneRegistroEnProceso(userIdNum, chatId, threadIdStr)) {
                const procesado = await VehicleRegistrationHandler.procesarMensaje(
                    this.bot,
                    message as any,
                    userIdNum
                );
                if (procesado) return true;
            }

            // Verificar si hay asignación de póliza en proceso
            if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
                const procesado = await PolicyAssignmentHandler.procesarMensaje(
                    this.bot,
                    message,
                    userId
                );

                // Si el proceso terminó, limpiar el estado BD AUTOS
                if (
                    procesado &&
                    !PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)
                ) {
                    const handlerWithRegistry = this.handler as BaseAutosHandler;
                    if (handlerWithRegistry?.registry?.stateManager) {
                        await handlerWithRegistry.registry.stateManager.clearUserState(
                            userId,
                            'bd_autos_flow'
                        );
                    }
                }

                if (procesado) return true;
            }

            return false; // No se procesó ningún flujo
        } catch (error: any) {
            this.logError('Error procesando mensaje en BaseAutosCommand:', error);
            return false;
        }
    }

    /**
     * Procesa documentos para flujos activos de Base de Autos
     * @param message - Mensaje de Telegram con documento
     * @param userId - ID del usuario
     * @returns true si el documento fue procesado, false si no
     */
    async procesarDocumentoBaseAutos(message: TelegramMessage, userId: string): Promise<boolean> {
        try {
            const chatId = typeof message.chat.id === 'string' ? parseInt(message.chat.id) : message.chat.id;
            const threadId = message.message_thread_id || null;
            const threadIdNum = typeof threadId === 'number' ? threadId : null;

            // Solo procesar si hay asignación de póliza en proceso
            if (PolicyAssignmentHandler.tieneAsignacionEnProceso(userId, chatId, threadIdNum)) {
                const procesado = await PolicyAssignmentHandler.procesarMensaje(
                    this.bot,
                    message,
                    userId
                );
                if (procesado) return true;
            }

            return false; // No se procesó ningún flujo
        } catch (error: any) {
            this.logError('Error procesando documento en BaseAutosCommand:', error);
            return false;
        }
    }
}

export default BaseAutosCommand;
