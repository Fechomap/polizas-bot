// src/comandos/comandos/StartCommand.js
const { Markup } = require('telegraf'); // Importar Markup
const BaseCommand = require('./BaseCommand');

class StartCommand extends BaseCommand {
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
        // Mantenemos el comando /start por ahora, pero mostramos el menú inline
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const mainMenu = Markup.inlineKeyboard([
                    [
                        Markup.button.callback('📋 PÓLIZAS', 'accion:polizas'),
                        Markup.button.callback('🔧 ADMINISTRACIÓN', 'accion:administracion')
                    ],
                    [
                        Markup.button.callback('📊 REPORTES', 'accion:reportes'),
                        Markup.button.callback('❓ AYUDA', 'accion:help')
                    ]
                ]);

                await ctx.reply(
                    '🤖 **Bot de Pólizas** - Menú Principal\n\nSelecciona una categoría:',
                    { parse_mode: 'Markdown', ...mainMenu }
                );
                this.logInfo('Menú principal mostrado vía /start', { chatId: ctx.chat.id });
            } catch (error) {
                this.logError('Error en comando start al mostrar menú:', error);
                await ctx.reply('❌ Error al mostrar el menú principal. Intenta nuevamente.');
            }
        });
    }

    // Método para mostrar el menú principal (reutilizable)
    async showMainMenu(ctx) {
        try {
            const mainMenu = Markup.inlineKeyboard([
                [
                    Markup.button.callback('📋 PÓLIZAS', 'accion:polizas'),
                    Markup.button.callback('🔧 ADMINISTRACIÓN', 'accion:administracion')
                ],
                [
                    Markup.button.callback('📊 REPORTES', 'accion:reportes'),
                    Markup.button.callback('❓ AYUDA', 'accion:help')
                ]
            ]);

            // Podríamos editar el mensaje anterior si existe ctx.callbackQuery
            if (ctx.callbackQuery) {
                 await ctx.editMessageText(
                    '🤖 **Bot de Pólizas** - Menú Principal\n\nSelecciona una categoría:',
                    { parse_mode: 'Markdown', ...mainMenu }
                );
                await ctx.answerCbQuery();
            } else {
                // Si no es callback, enviamos uno nuevo
                await ctx.reply(
                    '🤖 **Bot de Pólizas** - Menú Principal\n\nSelecciona una categoría:',
                    { parse_mode: 'Markdown', ...mainMenu }
                );
            }
             this.logInfo('Menú principal mostrado', { chatId: ctx.chat.id });
        } catch (error) {
            this.logError('Error al mostrar menú principal (showMainMenu):', error);
            // Evitar doble respuesta si falla la edición
            if (!ctx.callbackQuery) {
                await ctx.reply('❌ Error al mostrar el menú.');
            } else {
                 try { await ctx.answerCbQuery('Error al mostrar menú'); } catch {}
            }
        }
    }
}

module.exports = StartCommand;
