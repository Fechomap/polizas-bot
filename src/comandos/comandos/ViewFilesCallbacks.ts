import { Context } from 'telegraf';
import { BaseCommand, IBaseHandler } from './BaseCommand';
import { getPolicyByNumber } from '../../controllers/policyController';
import fetch from 'node-fetch';
import { getInstance } from '../../services/CloudflareStorage';
import { IPolicy, IR2FileObject } from '../../types/database';

interface IHandler extends IBaseHandler {
    registry: {
        registerCallback(pattern: RegExp, handler: (ctx: Context) => Promise<void>): void;
    };
}

class ViewFilesCallbacks extends BaseCommand {
    constructor(handler: IHandler) {
        super(handler);
    }

    getCommandName(): string {
        return 'viewFiles';
    }

    getDescription(): string {
        return 'Manejador de callbacks para ver fotos y PDFs';
    }

    register(): void {
        // Register callback for viewing photos
        this.handler.registry.registerCallback(/verFotos:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                this.logInfo(`Intentando mostrar fotos de póliza: ${numeroPoliza}`);

                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
                if (!policy) {
                    await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                    await ctx.answerCbQuery();
                    return;
                }

                // Obtener fotos de R2 y binarios legacy
                const r2Fotos = policy.archivos?.r2Files?.fotos || [];
                const legacyFotos = policy.archivos?.fotos || [];
                const totalFotos = r2Fotos.length + legacyFotos.length;

                // DEBUG: Log detalles de fotos
                this.logInfo(`DEBUG - R2 fotos: ${r2Fotos.length}, Legacy fotos: ${legacyFotos.length}, Total: ${totalFotos}`);
                if (r2Fotos.length > 0) {
                    this.logInfo(`DEBUG - Primera foto R2: key=${r2Fotos[0].key}, url=${r2Fotos[0].url ? 'existe' : 'no existe'}`);
                }

                if (totalFotos === 0) {
                    await ctx.reply('📸 No hay fotos asociadas a esta póliza.');
                    await ctx.answerCbQuery();
                    return;
                }

                await ctx.reply(`📸 Mostrando ${totalFotos} foto(s):`);

                // Mostrar fotos de R2 (nuevas) usando URLs firmadas
                if (r2Fotos.length > 0) {
                    const storage = getInstance();

                    for (const foto of r2Fotos) {
                        try {
                            // Usar la URL pública directa guardada en la base de datos
                            if (!foto.key) {
                                this.logError('Foto sin key:', foto);
                                continue;
                            }

                            // Generar URL firmada para la foto
                            const signedUrl = await storage.getSignedUrl(foto.key, 3600); // 1 hora

                            // Descargar la imagen usando la URL firmada
                            const response = await fetch(signedUrl);
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }

                            const buffer = await response.buffer();

                            // Determinar el origen de la foto
                            let origen = 'Foto de póliza';
                            if (foto.fuenteOriginal === 'vehiculo_bd_autos') {
                                origen = '🚗 Foto transferida del vehículo';
                            } else if (foto.fuenteOriginal === 'vehiculo_bd_autos_reparacion') {
                                origen = '🔧 Foto del vehículo (reparación)';
                            } else if (foto.fuenteOriginal === '🚗 Transferida del vehículo') {
                                origen = '🚗 Transferida del vehículo NIV';
                            } else if (foto.fuenteOriginal === '🆔 Foto NIV directa') {
                                origen = '🆔 Foto NIV directa';
                            }

                            await ctx.replyWithPhoto(
                                { source: buffer },
                                {
                                    caption: `📸 ${origen}\n📅 Subida: ${foto.uploadDate ? new Date(foto.uploadDate).toLocaleString('es-MX') : 'Fecha no disponible'}\n📏 Tamaño: ${(foto.size / 1024).toFixed(1)} KB`
                                }
                            );
                        } catch (error) {
                            this.logError('Error al enviar foto desde R2:', error);

                            // Si falla con URL firmada, intentar con URL pública como fallback
                            if (foto.url) {
                                try {
                                    const response = await fetch(foto.url);
                                    if (response.ok) {
                                        const buffer = await response.buffer();
                                        await ctx.replyWithPhoto(
                                            { source: buffer },
                                            { caption: '📸 Foto (recuperada con URL pública)' }
                                        );
                                        continue;
                                    }
                                } catch (fallbackError) {
                                    this.logError(
                                        'Fallback con URL pública también falló:',
                                        fallbackError
                                    );
                                }
                            }

                            await ctx.reply(
                                `❌ Error al mostrar foto: ${foto.originalName || 'sin nombre'}`
                            );
                        }
                    }
                }

                // Mostrar fotos binarias legacy
                for (const foto of legacyFotos) {
                    try {
                        if (!foto.data) {
                            this.logError('Foto legacy sin datos');
                            continue;
                        }

                        const fotoBuffer =
                            foto.data instanceof Buffer
                                ? foto.data
                                : Buffer.from(foto.data.buffer || foto.data);
                        await ctx.replyWithPhoto(
                            {
                                source: fotoBuffer
                            },
                            {
                                caption: '📸 Foto (formato anterior)'
                            }
                        );
                    } catch (error) {
                        this.logError('Error al enviar foto legacy:', error);
                    }
                }
            } catch (error) {
                this.logError('Error al mostrar fotos:', error);
                await ctx.reply('❌ Error al mostrar las fotos.');
            }
            await ctx.answerCbQuery();
        });

        // Register callback for viewing PDFs
        this.handler.registry.registerCallback(/verPDFs:(.+)/, async (ctx: Context) => {
            try {
                const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
                const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;

                if (!policy) {
                    await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
                    await ctx.answerCbQuery();
                    return;
                }

                // Obtener PDFs de R2 y binarios legacy
                const r2Pdfs = policy.archivos?.r2Files?.pdfs || [];
                const legacyPdfs = policy.archivos?.pdfs || [];
                const totalPdfs = r2Pdfs.length + legacyPdfs.length;

                if (totalPdfs === 0) {
                    await ctx.reply('📄 No hay PDFs asociados a esta póliza.');
                    await ctx.answerCbQuery();
                    return;
                }

                await ctx.reply(`📄 Mostrando ${totalPdfs} PDF(s):`);

                // Mostrar PDFs de R2 (nuevos) usando URLs firmadas
                if (r2Pdfs.length > 0) {
                    const storage = getInstance();

                    for (const pdf of r2Pdfs) {
                        try {
                            // Generar URL firmada para descargar el PDF
                            const signedUrl = await storage.getSignedUrl(pdf.key, 3600); // 1 hora

                            // Descargar el PDF desde R2 usando URL firmada
                            const response = await fetch(signedUrl);
                            if (!response.ok) {
                                throw new Error(`Error al descargar PDF: ${response.status}`);
                            }
                            const buffer = await response.buffer();

                            await ctx.replyWithDocument(
                                {
                                    source: buffer,
                                    filename: pdf.originalName || `Documento_${numeroPoliza}.pdf`
                                },
                                {
                                    caption: `📄 PDF subido: ${pdf.uploadDate ? new Date(pdf.uploadDate).toLocaleString('es-MX') : 'Fecha no disponible'}\n📏 Tamaño: ${(pdf.size / 1024).toFixed(1)} KB`
                                }
                            );
                        } catch (error) {
                            this.logError('Error al enviar PDF desde R2:', error);
                            await ctx.reply('❌ Error al mostrar un PDF.');
                        }
                    }
                }

                // Mostrar PDFs binarios legacy
                for (const pdf of legacyPdfs) {
                    try {
                        if (!pdf.data) {
                            this.logError('PDF legacy sin datos encontrado');
                            continue;
                        }

                        // Correct handling of Buffer
                        const fileBuffer =
                            pdf.data instanceof Buffer
                                ? pdf.data
                                : Buffer.from(pdf.data.buffer || pdf.data);

                        await ctx.replyWithDocument(
                            {
                                source: fileBuffer,
                                filename: `Documento_${numeroPoliza}_legacy.pdf`
                            },
                            {
                                caption: '📄 PDF (formato anterior)'
                            }
                        );
                    } catch (error) {
                        this.logError('Error al enviar PDF legacy:', error);
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

export default ViewFilesCallbacks;
