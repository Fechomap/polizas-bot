import BaseCommand, { NavigationContext, IBaseHandler } from './BaseCommand';

class HelpCommand extends BaseCommand {
    constructor(handler: IBaseHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'help';
    }

    getDescription(): string {
        return 'Muestra la lista de comandos disponibles';
    }

    // Method to send the help message, callable from CommandHandler
    async sendHelpMessage(ctx: NavigationContext): Promise<void> {
        try {
            const helpMessage = `
🤖 **Bot de Pólizas - Guía Completa**

📱 **COMANDOS PRINCIPALES**

🏠 **MENÚ PRINCIPAL** (/start)
Inicia el bot y muestra todas las opciones disponibles

📋 **CONSULTAR PÓLIZA**
• Busca información completa de una póliza
• Muestra: datos, pagos, servicios, archivos
• Botón "Ocupar Póliza" para registro de servicios

💾 **REGISTRAR PÓLIZA**
• Crea nueva póliza con datos completos
• Requiere: número, marca, modelo, año, placas, color

💰 **AÑADIR PAGO**
• Registra pagos realizados
• Requiere: número de póliza, monto, fecha

🚗 **AÑADIR SERVICIO** (⚡ AUTOMATIZADO)
• Sistema completamente automatizado
• Solo requiere: EXPEDIENTE
• Calcula automáticamente: costo, fecha, ruta, horarios

📁 **SUBIR ARCHIVOS**
• Adjunta fotos y PDFs a pólizas
• Almacenamiento seguro en Cloudflare R2

🔧 **FUNCIONES ADMINISTRATIVAS**

📊 **REPORTES DE PAGOS** - Pólizas con pagos pendientes
📈 **REPORTES DE USO** - Pólizas sin servicios recientes  
🗑️ **ELIMINAR PÓLIZA** - Borrado lógico (solo admins)
📋 **VER ELIMINADAS** - Lista pólizas marcadas como eliminadas

⚡ **FLUJO AUTOMATIZADO "OCUPAR PÓLIZA"**

1️⃣ **TELÉFONO**: Muestra el actual, opciones CAMBIAR/MANTENER
2️⃣ **UBICACIONES**: Solo pide ORIGEN y DESTINO  
3️⃣ **AUTOMÁTICO**: Geocoding, ruta, cálculos
4️⃣ **LEYENDA**: Envío explosivo automático al grupo
5️⃣ **EXPEDIENTE**: Solo ingresa el número
6️⃣ **ASIGNACIÓN**: Botones ✅ASIGNADO / ❌NO ASIGNADO
7️⃣ **NOTIFICACIONES**: Contacto (22-39 min) y Término (ruta x1.6)

💡 **CARACTERÍSTICAS CLAVE**

✨ **Cálculos Automáticos**: distancia × $20 + $650
📍 **HERE Maps**: Geocoding y rutas precisas  
🟨 **Alertas Contacto**: Notificación amarilla automática
🟩 **Alertas Término**: Notificación verde automática
📊 **Doble Estado**: REGISTROS (intentos) + SERVICIOS (confirmados)
☁️ **Cloudflare R2**: Almacenamiento escalable de archivos

🚀 **NAVEGACIÓN**

• Usa /start para volver al menú principal
• Los botones desaparecen después de usarlos
• Todos los procesos son cancelables
• Estados separados por chat/hilo de conversación

❓ **¿NECESITAS AYUDA?**
Presiona "Volver al Menú" para ver todas las opciones disponibles.
            `.trim();

            await ctx.replyWithMarkdown(helpMessage);
            this.logInfo('Mensaje de ayuda enviado', { chatId: ctx.chat?.id });
        } catch (error: any) {
            this.logError('Error al enviar mensaje de ayuda:', error);
            // Evitar doble respuesta si se llama desde un callback que ya maneja errores
            if (!ctx.callbackQuery) {
                await ctx.reply('❌ Error al mostrar la ayuda.');
            } else {
                // Podríamos intentar responder al callback con error si es posible
                try {
                    await ctx.answerCbQuery('Error al mostrar ayuda');
                } catch {}
            }
        }
    }

    register(): void {
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
        ️ /delete - Marca una póliza como eliminada (ADMIN)

        📁 *Gestión de Archivos:*
        📤 /upload - Sube fotos o PDFs para una póliza

        💼 *Gestión de Pagos y Servicios:*
         /addpayment - Registra un nuevo pago
         /addservice - Registra un nuevo servicio

        📊 *Reportes:*
        ⚠️ /reportPayment - Muestra pólizas con pagos pendientes
         /reportUsed - Muestra pólizas sin servicios recientes

         *Gestión de Registros: (ADMIN)*
        📋 /listdeleted - Muestra pólizas marcadas como eliminadas

         *Ejemplos de Uso:*
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

export default HelpCommand;
