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

    // Method to send the help message, callable from CommandHandler
    async sendHelpMessage(ctx) {
        try {
            const helpMessage = `
        🤖 *Bot de Pólizas - Ayuda*

        Selecciona una opción del menú principal para realizar acciones.

        *Descripción de las Opciones:*

        🔹 *Consultar Póliza:* Busca y muestra la información de una póliza existente por su número.
        🔹 *Registrar Nueva Póliza:* Inicia el proceso para añadir una póliza nueva a la base de datos.
        🔹 *Añadir Pago:* Registra un pago realizado para una póliza específica.
        🔹 *Añadir Servicio:* Registra un servicio (grúa, etc.) asociado a una póliza.
        🔹 *Subir Archivos:* Permite adjuntar fotos o PDFs a una póliza existente.
        🔹 *Eliminar Póliza:* Marca una póliza como eliminada (requiere permiso). Las pólizas eliminadas no aparecen en búsquedas normales.
        🔹 *Reportes:* (En construcción) Mostrará información agregada sobre las pólizas.
        🔹 *Ayuda:* Muestra este mensaje.

        *¿Cómo usar?*
        1. Usa /start o presiona un botón "Volver al Menú" para ver las opciones principales.
        2. Selecciona la acción que deseas realizar presionando el botón correspondiente.
        3. El bot te pedirá la información necesaria (ej. número de póliza, datos de pago, etc.).
        4. Envía la información solicitada como mensaje de texto.
        5. Sigue las instrucciones hasta completar la acción.
        6. Usa los botones "Volver al Menú" o "Cancelar" cuando estén disponibles para navegar.
            `.trim(); // Trim para quitar espacios extra al inicio/final

            await ctx.replyWithMarkdown(helpMessage);
            this.logInfo('Mensaje de ayuda enviado', { chatId: ctx.chat.id });
        } catch (error) {
            this.logError('Error al enviar mensaje de ayuda:', error);
            // Evitar doble respuesta si se llama desde un callback que ya maneja errores
            if (!ctx.callbackQuery) {
                 await ctx.reply('❌ Error al mostrar la ayuda.');
            } else {
                 // Podríamos intentar responder al callback con error si es posible
                 try { await ctx.answerCbQuery('Error al mostrar ayuda'); } catch {}
            }
        }
    }


    register() {
        // No longer registering the /help command directly.
        // The flow is initiated by the 'accion:help' button in CommandHandler,
        // which calls the sendHelpMessage method.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);

        /* Código anterior eliminado:
        this.bot.command(this.getCommandName(), async (ctx) => {
            try {
                const helpMessage = \`
        🤖 *Bot de Pólizas - Lista de Comandos*

        📋 *Comandos Básicos:*
        🏠 /start - Inicia el bot y muestra menú principal
        ❓ /help - Muestra esta lista de comandos

        📝 *Gestión de Pólizas:*
        ➕ /save - Crea una nueva póliza
        🔍 /get - Consulta una póliza existente
        �️ /delete - Marca una póliza como eliminada (ADMIN)

        📁 *Gestión de Archivos:*
        📤 /upload - Sube fotos o PDFs para una póliza

        💼 *Gestión de Pagos y Servicios:*
        � /addpayment - Registra un nuevo pago
        � /addservice - Registra un nuevo servicio

        📊 *Reportes:*
        ⚠️ /reportPayment - Muestra pólizas con pagos pendientes
        � /reportUsed - Muestra pólizas sin servicios recientes

        � *Gestión de Registros: (ADMIN)*
        📋 /listdeleted - Muestra pólizas marcadas como eliminadas

        � *Ejemplos de Uso:*
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
        */
    }
}

module.exports = HelpCommand;
