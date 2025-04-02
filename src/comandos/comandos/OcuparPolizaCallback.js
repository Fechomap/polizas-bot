// src/comandos/comandos/OcuparPolizaCallback.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber } = require('../../controllers/policyController');

class OcuparPolizaCallback extends BaseCommand {
    constructor(handler) {
        super(handler);
        this.awaitingPhoneNumber = handler.awaitingPhoneNumber;
        this.awaitingOrigenDestino = handler.awaitingOrigenDestino;
    }

    getCommandName() {
        return 'ocuparPoliza';
    }

    getDescription() {
        return 'Manejador para ocupar una póliza (asignar teléfono y origen-destino)';
    }

    register() {
        // Register the callback for "ocuparPoliza" button
        this.handler.registry.registerCallback(/ocuparPoliza:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                // Save in a Map that we're waiting for the phone number to "occupy" this policy
                this.awaitingPhoneNumber = this.awaitingPhoneNumber || new Map();
                this.awaitingPhoneNumber.set(ctx.chat.id, numeroPoliza);
        
                await ctx.reply(
                    `📱 Ingresa el *número telefónico* (10 dígitos) para la póliza *${numeroPoliza}*.\n` +
                    `⏱️ Si no respondes o ingresas comando en 1 min, se cancelará.`,
                    { parse_mode: 'Markdown' }
                );
                this.logInfo(`Esperando teléfono para póliza ${numeroPoliza}`, { chatId: ctx.chat.id });
            } catch (error) {
                this.logError('Error en callback ocuparPoliza:', error);
                await ctx.reply('❌ Error al procesar ocupación de póliza.');
            } finally {
                await ctx.answerCbQuery();
            }
        });

        // Handle phone number input in TextMessageHandler
        // Handle origin-destination input in TextMessageHandler
    }

    // Method to handle phone number input (called from TextMessageHandler)
    async handlePhoneNumber(ctx, messageText) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingPhoneNumber.get(chatId);

        // Validate that it's 10 digits
        const regexTel = /^\d{10}$/;
        if (!regexTel.test(messageText)) {
            // Invalid phone => cancel
            this.awaitingPhoneNumber.delete(chatId);
            return await ctx.reply('❌ Teléfono inválido (requiere 10 dígitos). Proceso cancelado.');
        }

        // If valid, save to the policy
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            this.awaitingPhoneNumber.delete(chatId);
            return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada. Cancelado.`);
        }

        // Save to policy.telefono
        policy.telefono = messageText;
        await policy.save();
        await ctx.reply(
            `✅ Teléfono asignado a la póliza ${numeroPoliza}.\n\n` +
            `🚗 Ahora ingresa *origen y destino* (ej: "Neza - Tecamac") en una sola línea.`,
            { parse_mode: 'Markdown' }
        );

        // Move to "awaitingOrigenDestino"
        this.awaitingPhoneNumber.delete(chatId);
        this.awaitingOrigenDestino.set(chatId, numeroPoliza);
        return true; // Indicate that we handled this message
    }

    // Method to handle origin-destination input (called from TextMessageHandler)
    async handleOrigenDestino(ctx, messageText) {
        const chatId = ctx.chat.id;
        const numeroPoliza = this.awaitingOrigenDestino.get(chatId);
        const policy = await getPolicyByNumber(numeroPoliza);
        if (!policy) {
            this.awaitingOrigenDestino.delete(chatId);
            return await ctx.reply(`❌ Póliza ${numeroPoliza} no encontrada. Cancelado.`);
        }

        // Create the legend
        const leyenda = `🚗 Pendiente servicio "${policy.aseguradora}"\n` +
        `🚙 Auto: ${policy.marca} - ${policy.submarca} - ${policy.año}\n` +
        `📍 Origen-Destino: ${messageText}`;
    
        await ctx.reply(
        `✅ Origen-destino asignado: *${messageText}*\n\n` +
        `📋 Aquí la leyenda para copiar:\n\`\`\`${leyenda}\`\`\``,
        { parse_mode: 'Markdown' }
        );

        this.awaitingOrigenDestino.delete(chatId);
        return true; // Indicate that we handled this message
    }
}

module.exports = OcuparPolizaCallback;
