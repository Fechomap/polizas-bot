import logger from '../../utils/logger';
import type { BaseCommand } from './BaseCommand';
import type { Context } from 'telegraf';

type CallbackHandler = (ctx: Context) => Promise<void> | void;

class CommandRegistry {
    private commands: Map<string, BaseCommand>;
    private callbackHandlers: Map<string, CallbackHandler>;

    constructor() {
        this.commands = new Map();
        this.callbackHandlers = new Map();
    }

    /**
     * Register a command
     * @param commandInstance - Instance of a command
     */
    registerCommand(commandInstance: BaseCommand): CommandRegistry {
        const commandName = commandInstance.getCommandName();
        this.commands.set(commandName, commandInstance);
        logger.info(`Registered command: ${commandName}`);
        return this;
    }

    /**
     * Register a callback handler for inline buttons
     * @param pattern - Regex pattern to match callback data
     * @param handler - Handler function
     */
    registerCallback(pattern: string | RegExp, handler: CallbackHandler): CommandRegistry {
        // Store pattern as string if it's a RegExp (using source) or keep as string
        // Note: The actual matching logic in TextMessageHandler/CommandHandler needs to handle this.
        // For now, we just allow the type.
        const key = pattern instanceof RegExp ? pattern.source : pattern;
        this.callbackHandlers.set(key, handler);
        logger.info(`Registered callback handler: ${pattern}`);
        return this;
    }

    /**
     * Get a command by name
     * @param commandName - Name of the command (without slash)
     * @returns The command instance or undefined
     */
    getCommand(commandName: string): BaseCommand | undefined {
        return this.commands.get(commandName);
    }

    /**
     * Get all registered commands
     * @returns Array of command instances
     */
    getAllCommands(): BaseCommand[] {
        return Array.from(this.commands.values());
    }

    /**
     * Get all callback handlers
     * @returns Map of callback patterns to handlers
     */
    getCallbackHandlers(): Map<string, CallbackHandler> {
        return this.callbackHandlers;
    }
}

export { CommandRegistry, CallbackHandler };
export default CommandRegistry;
