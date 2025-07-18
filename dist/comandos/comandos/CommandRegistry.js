"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.callbackHandlers = new Map();
    }
    registerCommand(commandInstance) {
        const commandName = commandInstance.getCommandName();
        this.commands.set(commandName, commandInstance);
        logger_1.default.info(`Registered command: ${commandName}`);
        return this;
    }
    registerCallback(pattern, handler) {
        this.callbackHandlers.set(pattern, handler);
        logger_1.default.info(`Registered callback handler: ${pattern}`);
        return this;
    }
    getCommand(commandName) {
        return this.commands.get(commandName);
    }
    getAllCommands() {
        return Array.from(this.commands.values());
    }
    getCallbackHandlers() {
        return this.callbackHandlers;
    }
}
exports.CommandRegistry = CommandRegistry;
exports.default = CommandRegistry;
