"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
const AdminStateManager = require('../../admin/utils/adminStates');
class StartCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
    }
    getCommandName() {
        return 'start';
    }
    getDescription() {
        return '¡Bienvenido al Bot de Pólizas! 🤖';
    }
    register() {
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                AdminStateManager.clearAdminState(ctx.from?.id, ctx.chat?.id);
                this.logInfo('Estados admin limpiados al ejecutar /start', {
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id
                });
                await this.showMainMenu(ctx);
                this.logInfo('Menú principal mostrado vía /start con navegación persistente', {
                    chatId: ctx.chat?.id
                });
            }
            catch (error) {
                this.logError('Error en comando start al mostrar menú:', error);
                await ctx.reply('❌ Error al mostrar el menú principal. Intenta nuevamente.');
            }
        });
    }
}
exports.default = StartCommand;
