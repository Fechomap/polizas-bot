// src/comandos/comandos/HelpCommand.js
const BaseCommand = require('./BaseCommand');

class HelpCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'help';
    }

    getDescription() {
        return 'Muestra la lista de comandos disponibles';
    }

    register() {
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const helpMessage = `
        🤖 *Bot de Pólizas - Lista de Comandos*

        📋 *Comandos Básicos:*
        🏠 /start - Inicia el bot y muestra menú principal
        ❓ /help - Muestra esta lista de comandos

        📝 *Gestión de Pólizas:*
        ➕ /save - Crea una nueva póliza
        🔍 /get - Consulta una póliza existente
        🗑️ /delete - Marca una póliza como eliminada (ADMIN)

        📁 *Gestión de Archivos:*
        📤 /upload - Sube fotos o PDFs para una póliza

        💼 *Gestión de Pagos y Servicios:*
        💰 /addpayment - Registra un nuevo pago
        🚗 /addservice - Registra un nuevo servicio

        📊 *Reportes:*
        ⚠️ /reportPayment - Muestra pólizas con pagos pendientes
        📈 /reportUsed - Muestra pólizas sin servicios recientes

        🔄 *Gestión de Registros: (ADMIN)*
        📋 /listdeleted - Muestra pólizas marcadas como eliminadas

        📱 *Ejemplos de Uso:*
        ✏️ Para crear póliza: /save
        ↳ Sigue las instrucciones para ingresar los datos

        🔎 Para consultar: /get
        ↳ Ingresa el número de póliza cuando se solicite

        📎 Para subir archivos: /upload
        ↳ Primero ingresa el número de póliza
        ↳ Luego envía las fotos o PDFs

        💵 Para registrar pago: /addpayment
        ↳ Ingresa número de póliza
        ↳ Luego monto y fecha

        🗑️ Para marcar como eliminada: /delete
        ↳ La póliza se conservará en la base pero no
        aparecerá en consultas ni reportes`;

                await ctx.replyWithMarkdown(helpMessage);
                this.logInfo('Comando help ejecutado', { chatId: ctx.chat.id });
            } catch (error) {
                this.logError('Error en comando help:', error);
                await ctx.reply('❌ Error al mostrar la ayuda. Intenta nuevamente.');
            }
        });
    }
}

module.exports = HelpCommand;
