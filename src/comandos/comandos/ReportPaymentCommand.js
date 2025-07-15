// src/comandos/comandos/ReportPaymentCommand.js
const BaseCommand = require('./BaseCommand');
const logger = require('../../utils/logger');
const { getSusceptiblePolicies } = require('../../controllers/policyController');

class ReportPaymentCommand extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'reportPayment'; // Matches the command in commandHandler.js
    }

    getDescription() {
        return 'Genera un reporte de pólizas con pagos pendientes.';
    }

    // Method to generate and send the report, callable if needed
    async generateReport(ctx) {
        try {
            this.logInfo(`Generando reporte ${this.getCommandName()}`);
            const susceptibles = await getSusceptiblePolicies();

            if (!susceptibles.length) {
                return await ctx.reply(
                    '✅ No hay pólizas susceptibles de falta de pago. Todas están al corriente.'
                );
            }

            // Armamos un arreglo de líneas
            const lines = [];
            lines.push('⚠️ *Pólizas con Pagos Pendientes*\n');
            susceptibles.forEach(pol => {
                // Ensure properties exist before accessing
                const numeroPoliza = pol.numeroPoliza || 'N/A';
                const diasDeImpago = pol.diasDeImpago !== undefined ? pol.diasDeImpago : 'N/A';
                lines.push(`🔴 *${numeroPoliza}* - *${diasDeImpago}* días de impago`);
            });

            // Definir el tamaño de cada bloque
            const chunkSize = 10; // 10 pólizas por mensaje
            const totalChunks = Math.ceil(lines.length / chunkSize);

            for (let i = 0; i < totalChunks; i++) {
                const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize).join('\n');

                // Esperar 1 segundo entre mensajes para evitar saturar Telegram
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Enviar el bloque
                await ctx.replyWithMarkdown(chunk);
            }
            this.logInfo(`Reporte ${this.getCommandName()} enviado.`);
        } catch (error) {
            this.logError(`Error en ${this.getCommandName()}:`, error);
            await this.replyError(ctx, 'Ocurrió un error al generar el reporte de pago.');
        }
    }

    register() {
        // No longer registering the /reportPayment command directly.
        // This could be triggered by a button in a future 'Reportes' submenu.
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);

        /* Código anterior eliminado:
         this.handler.bot.command(this.getCommandName(), async (ctx) => {
            await this.generateReport(ctx);
        });
        */
    }
}

module.exports = ReportPaymentCommand;
