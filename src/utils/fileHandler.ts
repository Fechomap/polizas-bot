// src/utils/fileHandler.ts
/**
 * @deprecated Este archivo usa MongoDB directamente para almacenar archivos.
 * Para nuevos desarrollos, usar PolicyFileService.ts con R2 storage.
 * Las funciones saveFileToMongo y getFilesFromMongo son LEGACY.
 */
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import logger from './logger';
import { prisma } from '../database/prisma';
import { BotContext } from '../../types';

// Tipos para el manejo de archivos
type FileType = 'foto' | 'pdf';

interface ISavedFile {
    data: Buffer;
    contentType: string;
}

interface IFileOperationResult {
    success: boolean;
    message?: string;
    filePath?: string;
}

class FileHandler {
    /**
     * Asegura que un directorio exista, creándolo si es necesario
     */
    static async ensureDirectory(directoryPath: string): Promise<void> {
        try {
            await fs.access(directoryPath);
        } catch {
            await fs.mkdir(directoryPath, { recursive: true });
            logger.info(`✅ Directorio creado: ${directoryPath}`);
        }
    }

    /**
     * @deprecated Usar PolicyFileService.subirArchivo() con R2 storage en su lugar.
     * Este método ya no guarda archivos embebidos - usa PolicyFileR2 table.
     */
    static async saveFileToMongo(
        numeroPoliza: string,
        fileType: FileType,
        fileData: Buffer,
        contentType: string
    ): Promise<boolean> {
        logger.warn(`⚠️ saveFileToMongo está DEPRECATED. Usar PolicyFileService.subirArchivo() en su lugar.`);

        try {
            const policy = await prisma.policy.findFirst({
                where: { numeroPoliza }
            });
            if (!policy) {
                throw new Error('Póliza no encontrada');
            }

            // En Prisma, los archivos van en tabla PolicyFileR2, no embebidos
            // Este método ya no puede guardar archivos de la forma legacy
            logger.warn(`Archivo ${fileType} para póliza ${numeroPoliza} NO guardado - usar PolicyFileService`);
            return false;
        } catch (error: any) {
            logger.error('❌ Error en saveFileToMongo (deprecated):', { error: error.message });
            throw error;
        }
    }

    /**
     * @deprecated Usar PolicyFileService para obtener archivos de R2 storage.
     * Este método ahora consulta la tabla PolicyFileR2.
     */
    static async getFilesFromMongo(
        numeroPoliza: string,
        fileType: FileType
    ): Promise<any[] | null> {
        logger.warn(`⚠️ getFilesFromMongo está DEPRECATED. Usar PolicyFileService en su lugar.`);

        try {
            const policy = await prisma.policy.findFirst({
                where: { numeroPoliza },
                include: { archivosR2: true }
            });

            if (!policy) {
                logger.warn(`⚠️ Póliza no encontrada: ${numeroPoliza}`);
                return null;
            }

            // Obtener archivos de la tabla PolicyFileR2
            // FileType enum en Prisma es FOTO/PDF (mayúsculas)
            const tipoArchivo = fileType === 'foto' ? 'FOTO' : 'PDF';
            const files = policy.archivosR2.filter(f => f.tipo === tipoArchivo);

            if (files.length === 0) {
                logger.info(
                    `ℹ️ No hay ${fileType === 'foto' ? 'fotos' : 'PDFs'} para la póliza: ${numeroPoliza}`
                );
                return [];
            }

            return files;
        } catch (error: any) {
            logger.error('❌ Error al obtener archivos:', { error: error.message });
            throw error;
        }
    }

    /**
     * Envía un archivo a través de Telegram
     */
    static async sendFileViaTelegram(
        ctx: BotContext,
        file: ISavedFile,
        fileType: FileType,
        numeroPoliza: string
    ): Promise<boolean> {
        try {
            if (!file.data) {
                logger.warn('⚠️ Archivo no tiene datos');
                return false;
            }

            // Convertir el Buffer a un formato que Telegram pueda manejar
            const fileBuffer = Buffer.from(file.data.buffer ?? file.data);

            logger.info('Enviando archivo:', {
                tieneData: !!file.data,
                tieneBuffer: !!(file.data && (file.data as any).buffer),
                contentType: file.contentType,
                tamaño: fileBuffer.length,
                tipo: fileType
            });

            if (fileType === 'foto') {
                await ctx.replyWithPhoto({
                    source: fileBuffer
                });
            } else if (fileType === 'pdf') {
                await ctx.replyWithDocument({
                    source: fileBuffer,
                    filename: `documento_${numeroPoliza}.pdf`
                });
            }

            return true;
        } catch (error: any) {
            logger.error('❌ Error al enviar archivo por Telegram:', { error: error.message });
            throw error;
        }
    }

    /**
     * Guarda un archivo desde una URL, tanto localmente como en MongoDB
     */
    static async saveFile(fileUrl: URL, numeroPoliza: string, fileType: FileType): Promise<string> {
        const fileDir = path.join(__dirname, '..', 'uploads', numeroPoliza);
        await this.ensureDirectory(fileDir);

        const timestamp = Date.now();
        // Para fotos, usamos extensión jpg; para pdf se conserva
        const extension = fileType === 'foto' ? 'jpg' : fileType;
        const fileName = `${timestamp}.${extension}`;
        const filePath = path.join(fileDir, fileName);

        try {
            const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, response.data);
            logger.info(`✅ Archivo guardado: ${filePath}`);

            // Determinar el contentType basado en fileType
            let contentType = '';
            if (fileType === 'foto') {
                contentType = 'image/jpeg';
            } else if (fileType === 'pdf') {
                contentType = 'application/pdf';
            }

            // También guardamos en MongoDB
            await this.saveFileToMongo(
                numeroPoliza,
                fileType,
                Buffer.from(response.data),
                contentType
            );

            return filePath;
        } catch (error: any) {
            logger.error('❌ Error al guardar archivo:', { error: error.message });
            throw error;
        }
    }

    /**
     * Elimina un archivo del sistema de archivos
     */
    static async deleteFile(filePath: string): Promise<boolean> {
        try {
            await fs.unlink(filePath);
            logger.info(`✅ Archivo eliminado: ${filePath}`);
            return true;
        } catch (error: any) {
            logger.error('❌ Error al eliminar archivo:', { error: error.message });
            return false;
        }
    }

    /**
     * Crea un stream de lectura para un archivo
     */
    static createReadStream(filePath: string): fsSync.ReadStream {
        return fsSync.createReadStream(filePath);
    }

    /**
     * Valida que un archivo tenga el tipo MIME correcto
     */
    static validateFileType(contentType: string, expectedType: FileType): boolean {
        const validTypes = {
            foto: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
            pdf: ['application/pdf']
        };

        return validTypes[expectedType].includes(contentType.toLowerCase());
    }

    /**
     * Obtiene información sobre un archivo
     */
    static async getFileInfo(filePath: string): Promise<{ size: number; exists: boolean }> {
        try {
            const stats = await fs.stat(filePath);
            return {
                size: stats.size,
                exists: true
            };
        } catch {
            return {
                size: 0,
                exists: false
            };
        }
    }
}

export default FileHandler;
