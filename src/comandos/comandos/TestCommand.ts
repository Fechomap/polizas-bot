import { Context } from 'telegraf';
import { BaseCommand } from './BaseCommand';

interface IHandler {
    // Add any handler interface properties if needed
}

class TestCommand extends BaseCommand {
    constructor(handler: IHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'test';
    }

    getDescription(): string {
        return 'Test command to verify the bot is working';
    }

    register(): void {
        this.bot.command(this.getCommandName(), async (ctx: Context) => {
            try {
                await ctx.reply('✅ Test command is working!');
                this.logInfo('Test command executed', { chatId: ctx.chat!.id });
            } catch (error) {
                this.logError('Error in test command:', error);
                await ctx.reply('❌ Error in test command.');
            }
        });
    }
}

export default TestCommand;
