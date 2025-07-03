// src/comandos/comandos/ViewFilesCallbacks.js
const BaseCommand = require('./BaseCommand');
const { getPolicyByNumber } = require('../../controllers/policyController');

class ViewFilesCallbacks extends BaseCommand {
    constructor(handler) {
        super(handler);
    }

    getCommandName() {
        return 'viewFiles';
    }

    getDescription() {
        return 'Manejador de callbacks para ver fotos y PDFs';
    }

    register() {
        // Register callback for viewing photos
        this.handler.registry.registerCallback(/verFotos:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                this.logInfo(`Intentando mostrar fotos de póliza: ${numeroPoliza}`);

                const policy = await getPolicyByNumber(numeroPoliza);
                if (!policy) {
                    await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                    await ctx.answerCbQuery();
                    return;
                }

                const fotos = policy.archivos?.fotos || [];
                if (fotos.length === 0) {
                    await ctx.reply('📸 No hay fotos asociadas a esta póliza.');
                    await ctx.answerCbQuery();
                    return;
                }

                await ctx.reply(`📸 Mostrando ${fotos.length} foto(s):`);

                for (const foto of fotos) {
                    try {
                        if (!foto.data) {
                            this.logError('Foto sin datos');
                            continue;
                        }

                        const fotoBuffer = foto.data instanceof Buffer ?
                            foto.data :
                            Buffer.from(foto.data.buffer || foto.data);
                        await ctx.replyWithPhoto({
                            source: fotoBuffer
                        });
                        await ctx.answerCbQuery();
                    } catch (error) {
                        this.logError('Error al enviar foto:', error);
                    }
                }
            } catch (error) {
                this.logError('Error al mostrar fotos:', error);
                await ctx.reply('❌ Error al mostrar las fotos.');
            }
            await ctx.answerCbQuery();
        });

        // Register callback for viewing PDFs
        this.handler.registry.registerCallback(/verPDFs:(.+)/, async (ctx) => {
            try {
                const numeroPoliza = ctx.match[1];
                const policy = await getPolicyByNumber(numeroPoliza);

                if (!policy) {
                    return await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                }

                const pdfs = policy.archivos?.pdfs || [];
                if (pdfs.length === 0) {
                    return await ctx.reply('📄 No hay PDFs asociados a esta póliza.');
                }

                await ctx.reply(`📄 Mostrando ${pdfs.length} PDF(s):`);

                for (const pdf of pdfs) {
                    try {
                        if (!pdf.data) {
                            this.logError('PDF sin datos encontrado');
                            continue;
                        }

                        // Correct handling of Buffer
                        const fileBuffer = pdf.data instanceof Buffer ?
                            pdf.data :
                            Buffer.from(pdf.data.buffer || pdf.data);

                        await ctx.replyWithDocument({
                            source: fileBuffer,
                            filename: `Documento_${numeroPoliza}.pdf`
                        });
                    } catch (error) {
                        this.logError('Error al enviar PDF individual:', error);
                        await ctx.reply('❌ Error al enviar un PDF');
                    }
                }
            } catch (error) {
                this.logError('Error al mostrar PDFs:', error);
                await ctx.reply('❌ Error al mostrar los PDFs.');
            }
            await ctx.answerCbQuery();
        });
    }
}

module.exports = ViewFilesCallbacks;
