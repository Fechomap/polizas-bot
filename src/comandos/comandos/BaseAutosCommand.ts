// src/comandos/comandos/BaseAutosCommand.ts
// Comando principal para Base de Autos - REFACTORIZADO
// Los callbacks están separados en módulos dedicados

import BaseCommand from './BaseCommand';
import { VehicleRegistrationHandler } from './VehicleRegistrationHandler';
import { VehicleVisionHandler } from './VehicleVisionHandler';
import { PolicyAssignmentHandler } from './PolicyAssignmentHandler';
import { getBaseAutosKeyboard, getMainKeyboard } from '../teclados';
import StateKeyManager from '../../utils/StateKeyManager';

// Callbacks separados
import {
    registerVehicleVisionCallbacks,
    procesarTextoVision,
    procesarFotoVision
} from './VehicleVisionCallbacks';
import {
    registerVehicleRegistrationCallbacks,
    procesarMensajeRegistroManual
} from './VehicleRegistrationCallbacks';
import {
    registerPolicyAssignmentCallbacks,
    procesarTextoOCRPoliza,
    procesarMensajeAsignacionLegacy,
    procesarDocumentoOCRPoliza,
    procesarDocumentoAsignacionLegacy
} from './PolicyAssignmentCallbacks';

import type { IBaseHandler, NavigationContext } from './BaseCommand';

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
 * Maneja el menú y delega los callbacks a módulos especializados
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
        // === MENÚ PRINCIPAL ===
        this.registerMainMenu();

        // === CALLBACKS DE REGISTRO DE VEHÍCULOS ===
        this.registerVehicleCallbacks();

        // === CALLBACKS DE ASIGNACIÓN DE PÓLIZAS ===
        this.registerPolicyCallbacks();

        // === NAVEGACIÓN GENERAL ===
        this.registerNavigationCallbacks();
    }

    /**
     * Registra el menú principal de Base de Autos
     */
    private registerMainMenu(): void {
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
    }

    /**
     * Registra todos los callbacks de vehículos
     */
    private registerVehicleCallbacks(): void {
        // Opciones de registro (OCR vs Manual)
        this.bot.action('base_autos:registrar', async (ctx: NavigationContext) => {
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

                // Verificar si ya tiene un registro en proceso
                if (
                    VehicleRegistrationHandler.tieneRegistroEnProceso(
                        userId,
                        chatId,
                        threadIdStr
                    ) ||
                    VehicleVisionHandler.tieneRegistro(userId, chatId, threadIdStr)
                ) {
                    await ctx.reply(
                        '⚠️ Ya tienes un registro en proceso. Complétalo o cancélalo primero.'
                    );
                    return;
                }

                // Mostrar opciones de registro
                const mensaje =
                    '🚗 *REGISTRAR AUTO*\n\n' +
                    'Elige cómo deseas registrar:\n\n' +
                    '📸 *Con IA* - Fotos de tarjeta y auto\n' +
                    '_Extrae datos automáticamente_\n\n' +
                    '📝 *Manual* - Ingresa datos uno por uno\n' +
                    '_Para cuando no tengas la tarjeta_';

                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '📸 Con IA (recomendado)',
                                    callback_data: 'vehiculo_registro_ocr'
                                }
                            ],
                            [{ text: '📝 Manual', callback_data: 'vehiculo_registro_manual' }],
                            [{ text: '◀️ Volver', callback_data: 'accion:base_autos' }]
                        ]
                    }
                });

                this.logInfo('Opciones de registro mostradas', { chatId, userId });
            } catch (error: any) {
                this.logError('Error mostrando opciones de registro:', error);
                await ctx.reply('❌ Error al mostrar opciones.');
            }
        });

        // Registrar callbacks de Vision (IA) de vehículos
        registerVehicleVisionCallbacks(this.bot, this.logInfo.bind(this), this.logError.bind(this));

        // Registrar callbacks de registro manual
        registerVehicleRegistrationCallbacks(
            this.bot,
            this.logInfo.bind(this),
            this.logError.bind(this)
        );
    }

    /**
     * Registra todos los callbacks de pólizas
     */
    private registerPolicyCallbacks(): void {
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

                const threadIdNum = typeof threadId === 'number' ? threadId : null;
                const userIdStr = String(userId);

                // Mostrar vehículos disponibles para asignar póliza
                await PolicyAssignmentHandler.mostrarVehiculosDisponibles(
                    this.bot,
                    chatId,
                    userIdStr,
                    threadIdNum
                );

                this.logInfo('Asignación OCR iniciada', { chatId, userId });
            } catch (error: any) {
                this.logError('Error iniciando asignación OCR:', error);
                await ctx.reply('❌ Error al iniciar.');
            }
        });

        // Registrar callbacks de asignación de pólizas
        const handlerWithRegistry = this.handler as BaseAutosHandler;
        registerPolicyAssignmentCallbacks(
            this.bot,
            this.logInfo.bind(this),
            this.logError.bind(this),
            handlerWithRegistry.registry
        );
    }

    /**
     * Registra callbacks de navegación general
     */
    private registerNavigationCallbacks(): void {
        // Volver al menú principal
        this.bot.action('accion:volver_menu', async (ctx: NavigationContext) => {
            try {
                await ctx.answerCbQuery();

                const mensaje = '👋 *MENÚ PRINCIPAL*\n\n' + 'Selecciona una opción:';

                await ctx.editMessageText(mensaje, {
                    parse_mode: 'Markdown',
                    reply_markup: getMainKeyboard().reply_markup
                });
            } catch (error: any) {
                this.logError('Error volviendo al menú:', error);
            }
        });
    }

    /**
     * Procesa mensajes de texto para flujos activos
     */
    async procesarMensajeBaseAutos(message: TelegramMessage, userId: string): Promise<boolean> {
        try {
            // 1. Flujo de registro manual de vehículos
            if (await procesarMensajeRegistroManual(this.bot, message, userId)) {
                return true;
            }

            // 2. Flujo Vision de vehículos (edición de campos)
            if (await procesarTextoVision(this.bot, message, userId)) {
                return true;
            }

            // 3. Flujo OCR de pólizas
            const handlerWithRegistry = this.handler as BaseAutosHandler;
            if (
                await procesarTextoOCRPoliza(
                    this.bot,
                    message,
                    userId,
                    handlerWithRegistry.registry
                )
            ) {
                return true;
            }

            // 4. Flujo legacy de asignación de pólizas
            if (
                await procesarMensajeAsignacionLegacy(
                    this.bot,
                    message,
                    userId,
                    handlerWithRegistry.registry
                )
            ) {
                return true;
            }

            return false;
        } catch (error: any) {
            this.logError('Error procesando mensaje en BaseAutosCommand:', error);
            return false;
        }
    }

    /**
     * Procesa documentos para flujos activos
     */
    async procesarDocumentoBaseAutos(message: TelegramMessage, userId: string): Promise<boolean> {
        try {
            // 1. Flujo OCR de pólizas
            if (await procesarDocumentoOCRPoliza(this.bot, message, userId)) {
                return true;
            }

            // 2. Flujo legacy de asignación
            if (await procesarDocumentoAsignacionLegacy(this.bot, message, userId)) {
                return true;
            }

            return false;
        } catch (error: any) {
            this.logError('Error procesando documento en BaseAutosCommand:', error);
            return false;
        }
    }

    /**
     * Procesa fotos para flujos activos
     */
    async procesarFotoBaseAutos(message: TelegramMessage, userId: string): Promise<boolean> {
        try {
            // 1. Flujo Vision de vehículos (fotos)
            if (await procesarFotoVision(this.bot, message, userId)) {
                return true;
            }

            // 2. Flujo de registro manual (fotos del vehículo)
            if (await procesarMensajeRegistroManual(this.bot, message, userId)) {
                return true;
            }

            return false;
        } catch (error: any) {
            this.logError('Error procesando foto en BaseAutosCommand:', error);
            return false;
        }
    }
}

export default BaseAutosCommand;
