"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudflareStorage = void 0;
exports.getInstance = getInstance;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const logger_1 = __importDefault(require("../utils/logger"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
class CloudflareStorage {
    constructor() {
        this.client = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY || '',
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY || ''
            }
        });
        this.bucket = process.env.CLOUDFLARE_R2_BUCKET || '';
        this.publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    }
    generateFileName(policyNumber, originalName, type = 'file') {
        const timestamp = Date.now();
        const randomId = crypto_1.default.randomBytes(8).toString('hex');
        const extension = path_1.default.extname(originalName);
        const baseName = path_1.default.basename(originalName, extension);
        const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '');
        const sanitizedPolicyNumber = policyNumber.replace(/[^a-zA-Z0-9-_]/g, '');
        return `${type}/${sanitizedPolicyNumber}/${timestamp}_${randomId}_${sanitizedBaseName}${extension}`;
    }
    async uploadFile(fileBuffer, fileName, contentType, metadata = {}) {
        try {
            logger_1.default.info('Subiendo archivo a R2', {
                fileName,
                contentType,
                size: fileBuffer.length
            });
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: fileName,
                Body: fileBuffer,
                ContentType: contentType,
                Metadata: {
                    ...metadata,
                    uploadedAt: new Date().toISOString(),
                    service: 'polizas-bot'
                }
            });
            const result = await this.client.send(command);
            const fileUrl = this.getPublicUrl(fileName);
            const fileInfo = {
                key: fileName,
                url: fileUrl,
                size: fileBuffer.length,
                contentType,
                uploadedAt: new Date(),
                etag: result.ETag
            };
            logger_1.default.info('Archivo subido exitosamente a R2', {
                fileName,
                url: fileUrl,
                size: fileBuffer.length
            });
            return fileInfo;
        }
        catch (error) {
            logger_1.default.error('Error al subir archivo a R2', {
                fileName,
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Error al subir archivo: ${error.message}`);
        }
    }
    async deleteFile(fileName) {
        try {
            logger_1.default.info('Eliminando archivo de R2', { fileName });
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });
            await this.client.send(command);
            logger_1.default.info('Archivo eliminado exitosamente de R2', { fileName });
        }
        catch (error) {
            logger_1.default.error('Error al eliminar archivo de R2', {
                fileName,
                error: error.message
            });
            throw new Error(`Error al eliminar archivo: ${error.message}`);
        }
    }
    getPublicUrl(fileName) {
        if (this.publicUrl) {
            return `${this.publicUrl}/${fileName}`;
        }
        return `https://${this.bucket}.r2.cloudflarestorage.com/${fileName}`;
    }
    async getSignedUrl(fileName, expiresIn = 3600) {
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, {
                expiresIn
            });
            logger_1.default.debug('URL firmada generada', { fileName, expiresIn });
            return signedUrl;
        }
        catch (error) {
            logger_1.default.error('Error al generar URL firmada', {
                fileName,
                error: error.message
            });
            throw new Error(`Error al generar URL firmada: ${error.message}`);
        }
    }
    async uploadPolicyPhoto(photoBuffer, policyNumber, originalName) {
        const fileName = this.generateFileName(policyNumber, originalName, 'fotos');
        const contentType = this.getImageContentType(originalName);
        return await this.uploadFile(photoBuffer, fileName, contentType, {
            policyNumber,
            type: 'foto',
            originalName
        });
    }
    async uploadPolicyPDF(pdfBuffer, policyNumber, originalName) {
        const fileName = this.generateFileName(policyNumber, originalName, 'pdfs');
        return await this.uploadFile(pdfBuffer, fileName, 'application/pdf', {
            policyNumber,
            type: 'pdf',
            originalName
        });
    }
    getImageContentType(fileName) {
        const ext = path_1.default.extname(fileName).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        return mimeTypes[ext] || 'image/jpeg';
    }
    isConfigured() {
        const required = [
            'CLOUDFLARE_R2_ENDPOINT',
            'CLOUDFLARE_R2_ACCESS_KEY',
            'CLOUDFLARE_R2_SECRET_KEY',
            'CLOUDFLARE_R2_BUCKET'
        ];
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
            logger_1.default.error('Configuración de R2 incompleta', { missing });
            return false;
        }
        return true;
    }
    getStats() {
        return {
            isConfigured: this.isConfigured(),
            bucket: this.bucket,
            hasPublicUrl: !!this.publicUrl,
            endpoint: process.env.CLOUDFLARE_R2_ENDPOINT
        };
    }
    async testConnection() {
        try {
            const testKey = `test-connection-${Date.now()}.txt`;
            const testBuffer = Buffer.from('test connection');
            await this.uploadFile(testBuffer, testKey, 'text/plain', {
                test: 'connection'
            });
            await this.deleteFile(testKey);
            return true;
        }
        catch (error) {
            logger_1.default.error('Error en prueba de conexión R2:', error.message);
            return false;
        }
    }
}
exports.CloudflareStorage = CloudflareStorage;
let instance = null;
function getInstance() {
    if (!instance) {
        instance = new CloudflareStorage();
        if (!instance.isConfigured()) {
            throw new Error('CloudflareStorage no está configurado correctamente');
        }
    }
    return instance;
}
exports.default = CloudflareStorage;
