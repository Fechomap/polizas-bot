"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const fs_2 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
const policy_1 = __importDefault(require("../models/policy"));
class FileHandler {
    static async ensureDirectory(directoryPath) {
        try {
            await fs_1.promises.access(directoryPath);
        }
        catch {
            await fs_1.promises.mkdir(directoryPath, { recursive: true });
            logger_1.default.info(`✅ Directorio creado: ${directoryPath}`);
        }
    }
    static async saveFileToMongo(numeroPoliza, fileType, fileData, contentType) {
        try {
            const policy = await policy_1.default.findOne({ numeroPoliza });
            if (!policy) {
                throw new Error('Póliza no encontrada');
            }
            const fileObject = {
                data: fileData,
                contentType: contentType
            };
            if (fileType === 'foto') {
                policy.archivos.fotos.push(fileObject);
            }
            else if (fileType === 'pdf') {
                policy.archivos.pdfs.push(fileObject);
            }
            await policy.save();
            logger_1.default.info(`✅ Archivo ${fileType} guardado en MongoDB para póliza: ${numeroPoliza}`);
            return true;
        }
        catch (error) {
            logger_1.default.error('❌ Error al guardar archivo en MongoDB:', { error: error.message });
            throw error;
        }
    }
    static async getFilesFromMongo(numeroPoliza, fileType) {
        try {
            const policy = await policy_1.default.findOne({ numeroPoliza });
            if (!policy) {
                logger_1.default.warn(`⚠️ Póliza no encontrada: ${numeroPoliza}`);
                return null;
            }
            const files = fileType === 'foto' ? policy.archivos.fotos : policy.archivos.pdfs;
            if (!files || files.length === 0) {
                logger_1.default.info(`ℹ️ No hay ${fileType === 'foto' ? 'fotos' : 'PDFs'} para la póliza: ${numeroPoliza}`);
                return [];
            }
            return files;
        }
        catch (error) {
            logger_1.default.error('❌ Error al obtener archivos de MongoDB:', { error: error.message });
            throw error;
        }
    }
    static async sendFileViaTelegram(ctx, file, fileType, numeroPoliza) {
        try {
            if (!file.data) {
                logger_1.default.warn('⚠️ Archivo no tiene datos');
                return false;
            }
            const fileBuffer = Buffer.from(file.data.buffer || file.data);
            logger_1.default.info('Enviando archivo:', {
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
            }
            else if (fileType === 'pdf') {
                await ctx.replyWithDocument({
                    source: fileBuffer,
                    filename: `documento_${numeroPoliza}.pdf`
                });
            }
            return true;
        }
        catch (error) {
            logger_1.default.error('❌ Error al enviar archivo por Telegram:', { error: error.message });
            throw error;
        }
    }
    static async saveFile(fileUrl, numeroPoliza, fileType) {
        const fileDir = path_1.default.join(__dirname, '..', 'uploads', numeroPoliza);
        await this.ensureDirectory(fileDir);
        const timestamp = Date.now();
        const extension = fileType === 'foto' ? 'jpg' : fileType;
        const fileName = `${timestamp}.${extension}`;
        const filePath = path_1.default.join(fileDir, fileName);
        try {
            const response = await axios_1.default.get(fileUrl.href, { responseType: 'arraybuffer' });
            await fs_1.promises.writeFile(filePath, response.data);
            logger_1.default.info(`✅ Archivo guardado: ${filePath}`);
            let contentType = '';
            if (fileType === 'foto') {
                contentType = 'image/jpeg';
            }
            else if (fileType === 'pdf') {
                contentType = 'application/pdf';
            }
            await this.saveFileToMongo(numeroPoliza, fileType, Buffer.from(response.data), contentType);
            return filePath;
        }
        catch (error) {
            logger_1.default.error('❌ Error al guardar archivo:', { error: error.message });
            throw error;
        }
    }
    static async deleteFile(filePath) {
        try {
            await fs_1.promises.unlink(filePath);
            logger_1.default.info(`✅ Archivo eliminado: ${filePath}`);
            return true;
        }
        catch (error) {
            logger_1.default.error('❌ Error al eliminar archivo:', { error: error.message });
            return false;
        }
    }
    static createReadStream(filePath) {
        return fs_2.default.createReadStream(filePath);
    }
    static validateFileType(contentType, expectedType) {
        const validTypes = {
            foto: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
            pdf: ['application/pdf']
        };
        return validTypes[expectedType].includes(contentType.toLowerCase());
    }
    static async getFileInfo(filePath) {
        try {
            const stats = await fs_1.promises.stat(filePath);
            return {
                size: stats.size,
                exists: true
            };
        }
        catch {
            return {
                size: 0,
                exists: false
            };
        }
    }
}
exports.default = FileHandler;
