// src/comandos/comandos/TestCommand.js
const BaseCommand = require('./BaseCommand');

class TestCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'test';
    }

    getDescription() {
        return 'Test command to verify the bot is working';
    }

    register() {
        this.bot.command(this.getCommandName(), async ctx => {
            try {
                await ctx.reply('✅ Test command is working!');
                this.logInfo('Test command executed', { chatId: ctx.chat.id });
            } catch (error) {
                this.logError('Error in test command:', error);
                await ctx.reply('❌ Error in test command.');
            }
        });
    }
}

module.exports = TestCommand;
