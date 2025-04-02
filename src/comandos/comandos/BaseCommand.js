// src/comandos/comandos/BaseCommand.js
const logger = require('../../utils/logger');

class BaseCommand {
    constructor(handler) {
        this.handler = handler;
        this.bot = handler.bot;
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
}

module.exports = BaseCommand;
