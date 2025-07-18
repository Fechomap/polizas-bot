"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
class HelpCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
    }
    getCommandName() {
        return 'help';
    }
    getDescription() {
        return 'Muestra la lista de comandos disponibles';
    }
    async sendHelpMessage(ctx) {
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
        }
        catch (error) {
            this.logError('Error al enviar mensaje de ayuda:', error);
            if (!ctx.callbackQuery) {
                await ctx.reply('❌ Error al mostrar la ayuda.');
            }
            else {
                try {
                    await ctx.answerCbQuery('Error al mostrar ayuda');
                }
                catch { }
            }
        }
    }
    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);
    }
}
exports.default = HelpCommand;
