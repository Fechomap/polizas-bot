// src/utils/fileHandler.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const Policy = require('../models/policy');

class FileHandler {
    static async ensureDirectory(directoryPath) {
        try {
            await fs.access(directoryPath);
        } catch {
            await fs.mkdir(directoryPath, { recursive: true });
            logger.info(`✅ Directorio creado: ${directoryPath}`);
        }
    }

    // Método para guardar archivo en MongoDB
    static async saveFileToMongo(numeroPoliza, fileType, fileData, contentType) {
        try {
            const policy = await Policy.findOne({ numeroPoliza });
            if (!policy) {
                throw new Error('Póliza no encontrada');
            }

            // Crear el objeto de archivo
            const fileObject = {
                data: fileData,
                contentType: contentType
            };

            // Agregar el archivo al array correspondiente
            if (fileType === 'foto') {
                policy.archivos.fotos.push(fileObject);
            } else if (fileType === 'pdf') {
                policy.archivos.pdfs.push(fileObject);
            }

            // Guardar la póliza
            await policy.save();
            logger.info(`✅ Archivo ${fileType} guardado en MongoDB para póliza: ${numeroPoliza}`);
            return true;
        } catch (error) {
            logger.error('❌ Error al guardar archivo en MongoDB:', { error: error.message });
            throw error;
        }
    }

    // Método para obtener archivos de MongoDB
    static async getFilesFromMongo(numeroPoliza, fileType) {
        try {
            const policy = await Policy.findOne({ numeroPoliza });
            if (!policy) {
                logger.warn(`⚠️ Póliza no encontrada: ${numeroPoliza}`);
                return null;
            }

            // Ahora se usa "foto" (singular) para imágenes
            const files = fileType === 'foto' ? policy.archivos.fotos : policy.archivos.pdfs;

            if (!files || files.length === 0) {
                logger.info(`ℹ️ No hay ${fileType === 'foto' ? 'fotos' : 'PDFs'} para la póliza: ${numeroPoliza}`);
                return [];
            }

            return files;
        } catch (error) {
            logger.error('❌ Error al obtener archivos de MongoDB:', { error: error.message });
            throw error;
        }
    }

    // Método para enviar archivos por Telegram
    static async sendFileViaTelegram(ctx, file, fileType, numeroPoliza) {
        try {
            if (!file.data) {
                logger.warn('⚠️ Archivo no tiene datos');
                return false;
            }

            // Convertir el Buffer a un formato que Telegram pueda manejar
            const fileBuffer = Buffer.from(file.data.buffer || file.data);

            logger.info('Enviando archivo:', {
                tieneData: !!file.data,
                tieneBuffer: !!(file.data && file.data.buffer),
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
        } catch (error) {
            logger.error('❌ Error al enviar archivo por Telegram:', { error: error.message });
            throw error;
        }
    }

    // Métodos existentes para manejo de archivos locales
    static async saveFile(fileUrl, numeroPoliza, fileType) {
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
            await this.saveFileToMongo(numeroPoliza, fileType, response.data, contentType);

            return filePath;
        } catch (error) {
            logger.error('❌ Error al guardar archivo:', { error: error.message });
            throw error;
        }
    }

    static async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            logger.info(`✅ Archivo eliminado: ${filePath}`);
            return true;
        } catch (error) {
            logger.error('❌ Error al eliminar archivo:', { error: error.message });
            return false;
        }
    }

    static createReadStream(filePath) {
        return fsSync.createReadStream(filePath);
    }
}

module.exports = FileHandler;
