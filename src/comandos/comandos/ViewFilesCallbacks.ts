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
        // Register callback for viewing photos (mantener para uso directo si se necesita)
        this.bot.action(/verFotos:(.+)/, async (ctx: Context) => {
            const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
            const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            if (policy) {
                await this.showPhotos(ctx, policy);
            } else {
                await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
            }
            await ctx.answerCbQuery();
        });

        // Register callback for viewing PDFs (mantener para uso directo si se necesita)
        this.bot.action(/verPDFs:(.+)/, async (ctx: Context) => {
            const numeroPoliza = (ctx.match as RegExpMatchArray)[1];
            const policy = (await getPolicyByNumber(numeroPoliza)) as IPolicy;
            if (policy) {
                await this.showPDFs(ctx, policy);
            } else {
                await ctx.reply(`❌ No se encontró la póliza ${numeroPoliza}`);
            }
            await ctx.answerCbQuery();
        });
    }

    /**
     * Muestra las fotos de una póliza
     * Método público para ser usado desde otros handlers
     */
    public async showPhotos(ctx: Context, policy: IPolicy): Promise<void> {
        try {
            const numeroPoliza = policy.numeroPoliza;
            this.logInfo(`Mostrando fotos de póliza: ${numeroPoliza}`);

            // Obtener fotos de R2 (Prisma) y binarios legacy
            const r2Fotos = (policy.archivosR2 ?? []).filter(f => f.tipo === 'FOTO');
            const legacyFotos = (policy.archivosLegacy ?? []).filter(f => f.tipo === 'FOTO');
            const totalFotos = r2Fotos.length + legacyFotos.length;

            this.logInfo(
                `Archivos encontrados: R2=${r2Fotos.length}, Legacy=${legacyFotos.length}`
            );

            if (totalFotos === 0) {
                await ctx.reply('📸 No hay fotos asociadas a esta póliza.');
                return;
            }

            await ctx.reply(`📸 Mostrando ${totalFotos} foto(s):`);

            // Mostrar fotos de R2 (nuevas) usando URLs firmadas
            if (r2Fotos.length > 0) {
                const storage = getInstance();

                for (const foto of r2Fotos) {
                    try {
                        if (!foto.key) {
                            this.logError('Foto sin key:', foto);
                            continue;
                        }

                        const signedUrl = await storage.getSignedUrl(foto.key, 3600);
                        const response = await fetch(signedUrl);
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }

                        const buffer = await response.buffer();

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
                            `❌ Error al mostrar foto: ${foto.originalName ?? 'sin nombre'}`
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
                            : Buffer.from(foto.data.buffer ?? foto.data);
                    await ctx.replyWithPhoto(
                        { source: fotoBuffer },
                        { caption: '📸 Foto (formato anterior)' }
                    );
                } catch (error) {
                    this.logError('Error al enviar foto legacy:', error);
                }
            }
        } catch (error) {
            this.logError('Error al mostrar fotos:', error);
            await ctx.reply('❌ Error al mostrar las fotos.');
        }
    }

    /**
     * Muestra los PDFs de una póliza
     * Método público para ser usado desde otros handlers
     */
    public async showPDFs(ctx: Context, policy: IPolicy): Promise<void> {
        try {
            const numeroPoliza = policy.numeroPoliza;

            // Obtener PDFs de R2 (Prisma) y binarios legacy
            const r2Pdfs = (policy.archivosR2 ?? []).filter(f => f.tipo === 'PDF');
            const legacyPdfs = (policy.archivosLegacy ?? []).filter(f => f.tipo === 'PDF');
            const totalPdfs = r2Pdfs.length + legacyPdfs.length;

            if (totalPdfs === 0) {
                await ctx.reply('📄 No hay PDFs asociados a esta póliza.');
                return;
            }

            await ctx.reply(`📄 Mostrando ${totalPdfs} PDF(s):`);

            // Mostrar PDFs de R2 (nuevos) usando URLs firmadas
            if (r2Pdfs.length > 0) {
                const storage = getInstance();

                for (const pdf of r2Pdfs) {
                    try {
                        const signedUrl = await storage.getSignedUrl(pdf.key, 3600);
                        const response = await fetch(signedUrl);
                        if (!response.ok) {
                            throw new Error(`Error al descargar PDF: ${response.status}`);
                        }
                        const buffer = await response.buffer();

                        await ctx.replyWithDocument(
                            {
                                source: buffer,
                                filename: pdf.originalName ?? `Documento_${numeroPoliza}.pdf`
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

                    const fileBuffer =
                        pdf.data instanceof Buffer
                            ? pdf.data
                            : Buffer.from(pdf.data.buffer ?? pdf.data);

                    await ctx.replyWithDocument(
                        {
                            source: fileBuffer,
                            filename: `Documento_${numeroPoliza}_legacy.pdf`
                        },
                        { caption: '📄 PDF (formato anterior)' }
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
    }
}

export default ViewFilesCallbacks;
