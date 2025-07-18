"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../utils/logger"));
const StateKeyManager_1 = __importDefault(require("../utils/StateKeyManager"));
const FlowStateManager_1 = __importDefault(require("../utils/FlowStateManager"));
const threadValidatorMiddleware = (commandHandler) => async (ctx, next) => {
    try {
        const chatId = ctx.chat?.id;
        if (!chatId)
            return next();
        const threadId = StateKeyManager_1.default.getThreadId(ctx);
        if (ctx.message?.text?.startsWith('/')) {
            logger_1.default.debug('Permitiendo comando', {
                chatId,
                threadId,
                text: ctx.message.text
            });
            return next();
        }
        if (ctx.callbackQuery) {
            logger_1.default.debug('Permitiendo callback query', {
                chatId,
                threadId,
                data: ctx.callbackQuery.data
            });
            return next();
        }
        const activeFlows = FlowStateManager_1.default.getActiveFlows(chatId);
        if (activeFlows.length > 0) {
            const conflictingFlows = activeFlows.filter(flow => {
                return flow.threadId && flow.threadId !== threadId;
            });
            if (conflictingFlows.length > 0) {
                logger_1.default.warn('Detectado posible conflicto de hilos', {
                    messageThreadId: threadId,
                    activeFlows: conflictingFlows.map(f => f.threadId)
                });
                let isInWrongThread = false;
                const stateMapNames = [
                    'awaitingGetPolicyNumber',
                    'awaitingSaveData',
                    'awaitingUploadPolicyNumber',
                    'awaitingDeletePolicyNumber',
                    'awaitingPaymentPolicyNumber',
                    'awaitingPaymentData',
                    'awaitingServicePolicyNumber',
                    'awaitingServiceData',
                    'awaitingPhoneNumber',
                    'awaitingOrigenDestino',
                    'awaitingDeleteReason'
                ];
                for (const mapName of stateMapNames) {
                    const stateMap = commandHandler[mapName];
                    if (stateMap?.has?.(chatId)) {
                        isInWrongThread = true;
                        logger_1.default.warn(`Estado ${String(mapName)} activo sin threadId pero hay hilos activos`, {
                            chatId,
                            messageThreadId: threadId,
                            conflictingThreads: conflictingFlows
                                .map(f => f.threadId)
                                .join(',')
                        });
                        break;
                    }
                }
                if (isInWrongThread) {
                    logger_1.default.info('Bloqueando mensaje de hilo incorrecto', {
                        chatId,
                        messageThreadId: threadId
                    });
                    await ctx.reply('⚠️ Hay una operación activa en otro hilo. ' +
                        'Por favor, continúa en el hilo correcto o finaliza ' +
                        'la operación actual antes de iniciar una nueva.');
                    return;
                }
            }
        }
        return next();
    }
    catch (error) {
        logger_1.default.error('Error en threadValidatorMiddleware:', error);
        return next();
    }
};
exports.default = threadValidatorMiddleware;
