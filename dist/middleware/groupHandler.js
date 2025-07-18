"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../utils/logger"));
const StateKeyManager_1 = __importDefault(require("../utils/StateKeyManager"));
const handleGroupUpdate = async (ctx, next) => {
    try {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return next();
        }
        const threadId = StateKeyManager_1.default.getThreadId(ctx);
        logger_1.default.info('Chat access:', {
            chatId,
            chatType: ctx.chat?.type,
            threadId: threadId || 'ninguno',
            messageType: ctx.updateType
        });
        if (ctx.update.my_chat_member) {
            logger_1.default.info('Actualización de estado en grupo', {
                chatId,
                threadId: threadId || 'ninguno'
            });
            return next();
        }
        return next();
    }
    catch (error) {
        logger_1.default.error('Error en middleware de grupo:', error);
        if (!error.message.includes('bot was kicked')) {
            await ctx.reply('❌ Ocurrió un error inesperado.');
        }
    }
};
exports.default = handleGroupUpdate;
