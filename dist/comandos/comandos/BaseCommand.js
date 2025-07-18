"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseCommand = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const NavigationManager_1 = require("../../navigation/NavigationManager");
const NavigationMiddleware_1 = require("../../navigation/NavigationMiddleware");
class BaseCommand {
    constructor(handler) {
        this.handler = handler;
        this.bot = handler.bot;
        this.navManager = (0, NavigationManager_1.getInstance)();
    }
    logInfo(message, data = {}) {
        logger_1.default.info(`[${this.getCommandName()}] ${message}`, data);
    }
    logError(message, error) {
        logger_1.default.error(`[${this.getCommandName()}] ${message}`, error);
    }
    async replyWithNavigation(ctx, text, options = {}) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                return await ctx.reply(text, options);
            }
            const responseOptions = (0, NavigationMiddleware_1.addNavigationToResponse)(ctx, text, options);
            return await ctx.reply(text, responseOptions);
        }
        catch (error) {
            this.logError('Error en replyWithNavigation:', error);
            return await ctx.reply(text, options);
        }
    }
    async editWithNavigation(ctx, text, options = {}) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId || !ctx.callbackQuery) {
                return await this.replyWithNavigation(ctx, text, options);
            }
            const responseOptions = (0, NavigationMiddleware_1.addNavigationToResponse)(ctx, text, options);
            return await ctx.editMessageText(text, responseOptions);
        }
        catch (error) {
            this.logError('Error en editWithNavigation:', error);
            return await this.replyWithNavigation(ctx, text, options);
        }
    }
    async showMainMenu(ctx) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                throw new Error('Usuario no identificado');
            }
            const menuData = this.navManager.getMainMenu(userId);
            (0, NavigationMiddleware_1.markNavigationHandled)(ctx);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
                await ctx.answerCbQuery();
            }
            else {
                await ctx.reply(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
            }
            this.logInfo('Menú principal mostrado con navegación', {
                userId,
                chatId: ctx.chat?.id
            });
        }
        catch (error) {
            this.logError('Error mostrando menú principal:', error);
            await ctx.reply('❌ Error al mostrar el menú principal.');
        }
    }
    async showReportsMenu(ctx) {
        try {
            const userId = ctx.from?.id?.toString();
            if (!userId) {
                throw new Error('Usuario no identificado');
            }
            const menuData = this.navManager.getReportsMenu(userId);
            (0, NavigationMiddleware_1.markNavigationHandled)(ctx);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
                await ctx.answerCbQuery();
            }
            else {
                await ctx.reply(menuData.text, {
                    parse_mode: menuData.parseMode,
                    ...menuData.markup
                });
            }
            this.logInfo('Menú reportes mostrado con navegación', {
                userId,
                chatId: ctx.chat?.id
            });
        }
        catch (error) {
            this.logError('Error mostrando menú reportes:', error);
            await this.replyWithNavigation(ctx, '❌ Error al mostrar el menú de reportes.');
        }
    }
    preserveNavigation(ctx) {
        (0, NavigationMiddleware_1.markNavigationHandled)(ctx);
    }
    async replyError(ctx, errorMessage) {
        const fullMessage = `❌ ${errorMessage}`;
        await this.replyWithNavigation(ctx, fullMessage);
    }
}
exports.BaseCommand = BaseCommand;
exports.default = BaseCommand;
