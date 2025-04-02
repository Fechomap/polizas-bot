// src/comandos/comandos/CommandRegistry.js
const logger = require('../../utils/logger');

class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.callbackHandlers = new Map();
    }

    /**
     * Register a command
     * @param {BaseCommand} commandInstance - Instance of a command
     */
    registerCommand(commandInstance) {
        const commandName = commandInstance.getCommandName();
        this.commands.set(commandName, commandInstance);
        logger.info(`Registered command: ${commandName}`);
        return this;
    }

    /**
     * Register a callback handler for inline buttons
     * @param {string} pattern - Regex pattern to match callback data
     * @param {Function} handler - Handler function
     */
    registerCallback(pattern, handler) {
        this.callbackHandlers.set(pattern, handler);
        logger.info(`Registered callback handler: ${pattern}`);
        return this;
    }

    /**
     * Get a command by name
     * @param {string} commandName - Name of the command (without slash)
     * @returns {BaseCommand|undefined} The command instance or undefined
     */
    getCommand(commandName) {
        return this.commands.get(commandName);
    }

    /**
     * Get all registered commands
     * @returns {Array} Array of command instances
     */
    getAllCommands() {
        return Array.from(this.commands.values());
    }

    /**
     * Get all callback handlers
     * @returns {Map} Map of callback patterns to handlers
     */
    getCallbackHandlers() {
        return this.callbackHandlers;
    }
}

module.exports = CommandRegistry;
