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
                        Markup.button.callback('Consultar Póliza', 'accion:consultar'),
                        Markup.button.callback('Registrar Póliza', 'accion:registrar')
                    ],
                    [
                        Markup.button.callback('Añadir Pago', 'accion:addpayment'),
                        Markup.button.callback('Añadir Servicio', 'accion:addservice')
                    ],
                    [
                        Markup.button.callback('Subir Archivos', 'accion:upload'),
                        Markup.button.callback('Eliminar Póliza', 'accion:delete')
                    ],
                    [
                        Markup.button.callback('Reportes', 'accion:reportes'), // Placeholder, needs submenu
                        Markup.button.callback('Ayuda', 'accion:help')
                    ]
                ]);

                await ctx.reply(
                    '¡Bienvenido al Bot de Pólizas! 🤖\n\nSelecciona una opción:',
                    mainMenu
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
                    Markup.button.callback('Consultar Póliza', 'accion:consultar'),
                    Markup.button.callback('Registrar Póliza', 'accion:registrar')
                ],
                [
                    Markup.button.callback('Añadir Pago', 'accion:addpayment'),
                    Markup.button.callback('Añadir Servicio', 'accion:addservice')
                ],
                [
                    Markup.button.callback('Subir Archivos', 'accion:upload'),
                    Markup.button.callback('Eliminar Póliza', 'accion:delete')
                ],
                [
                    Markup.button.callback('Reportes', 'accion:reportes'), // Placeholder
                    Markup.button.callback('Ayuda', 'accion:help')
                ]
            ]);

            // Podríamos editar el mensaje anterior si existe ctx.callbackQuery
            if (ctx.callbackQuery) {
                 await ctx.editMessageText(
                    'Menú Principal:',
                    mainMenu
                );
                await ctx.answerCbQuery();
            } else {
                // Si no es callback, enviamos uno nuevo
                await ctx.reply(
                    'Menú Principal:',
                    mainMenu
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
