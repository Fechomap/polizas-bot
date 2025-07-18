// src/comandos/comandos/BaseCommand.js
const logger = require('../../utils/logger');
const { getInstance: getNavigationManager } = require('../../navigation/NavigationManager');
const {
    markNavigationHandled,
    addNavigationToResponse
} = require('../../navigation/NavigationMiddleware');

class BaseCommand {
    constructor(handler) {
        this.handler = handler;
        this.bot = handler.bot;
        this.navManager = getNavigationManager();
    }

    /**
     * Register the command with the bot
     * This method should be implemented by each command
     */
    register() {
        throw new Error('Method register() must be implemented by subclass');
    }

    /**
     * Get the command name (without the slash)
     */
    getCommandName() {
        throw new Error('Method getCommandName() must be implemented by subclass');
    }

    /**
     * Get the command description for help text
     */
    getDescription() {
        throw new Error('Method getDescription() must be implemented by subclass');
    }

    /**
     * Log an info message with the command context
     */
    logInfo(message, data = {}) {
        logger.info(`[${this.getCommandName()}] ${message}`, data);
    }

    /**
     * Log an error message with the command context
     */
    logError(message, error) {
        logger.error(`[${this.getCommandName()}] ${message}`, error);
    }

    // 🧭 MÉTODOS DE NAVEGACIÓN PERSISTENTE

    /**
     * 📤 Respuesta con navegación persistente automática
     * @param {Object} ctx - Contexto de Telegraf
     * @param {string} text - Texto del mensaje
     * @param {Object} options - Opciones adicionales
     */
    async replyWithNavigation(ctx, text, options = {}) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                return await ctx.reply(text, options);
            }

            const responseOptions = addNavigationToResponse(ctx, text, options);
            return await ctx.reply(text, responseOptions);
        } catch (error) {
            this.logError('Error en replyWithNavigation:', error);
            return await ctx.reply(text, options);
        }
    }

    /**
     * ✏️ Editar mensaje con navegación persistente
     * @param {Object} ctx - Contexto de Telegraf
     * @param {string} text - Nuevo texto del mensaje
     * @param {Object} options - Opciones adicionales
     */
    async editWithNavigation(ctx, text, options = {}) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId || !ctx.callbackQuery) {
                return await this.replyWithNavigation(ctx, text, options);
            }

            const responseOptions = addNavigationToResponse(ctx, text, options);
            return await ctx.editMessageText(text, responseOptions);
        } catch (error) {
            this.logError('Error en editWithNavigation:', error);
            // Fallback a reply si edit falla
            return await this.replyWithNavigation(ctx, text, options);
        }
    }

    /**
     * 🏠 Mostrar menú principal con navegación
     * @param {Object} ctx - Contexto de Telegraf
     */
    async showMainMenu(ctx) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                throw new Error('Usuario no identificado');
            }

            const menuData = this.navManager.getMainMenu(userId);
            markNavigationHandled(ctx);

            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
            }

            this.logInfo('Menú principal mostrado con navegación', {
                userId,
                chatId: ctx.chat?.id
            });
        } catch (error) {
            this.logError('Error mostrando menú principal:', error);
            await ctx.reply('❌ Error al mostrar el menú principal.');
        }
    }

    /**
     * 📊 Mostrar menú de reportes con navegación
     * @param {Object} ctx - Contexto de Telegraf
     */
    async showReportsMenu(ctx) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                throw new Error('Usuario no identificado');
            }

            const menuData = this.navManager.getReportsMenu(userId);
            markNavigationHandled(ctx);

            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
            }

            this.logInfo('Menú reportes mostrado con navegación', {
                userId,
                chatId: ctx.chat?.id
            });
        } catch (error) {
            this.logError('Error mostrando menú reportes:', error);
            await this.replyWithNavigation(ctx, '❌ Error al mostrar el menú de reportes.');
        }
    }

    /**
     * 🎯 Preservar navegación - marcar como manejada
     * @param {Object} ctx - Contexto de Telegraf
     */
    preserveNavigation(ctx) {
        markNavigationHandled(ctx);
    }

    /**
     * 🧹 Método helper para error con navegación
     * @param {Object} ctx - Contexto de Telegraf
     * @param {string} errorMessage - Mensaje de error
     */
    async replyError(ctx, errorMessage) {
        const fullMessage = `❌ ${errorMessage}`;
        await this.replyWithNavigation(ctx, fullMessage);
    }
}

module.exports = BaseCommand;
