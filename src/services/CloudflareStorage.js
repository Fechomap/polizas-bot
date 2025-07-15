const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');
const crypto = require('crypto');
const path = require('path');

/**
 * Servicio para gestionar archivos en Cloudflare R2
 * Compatible con AWS S3 API
 */
class CloudflareStorage {
    constructor() {
        this.client = new S3Client({
            region: 'auto', // R2 usa 'auto'
            endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY,
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY
            }
        });
        this.bucket = process.env.CLOUDFLARE_R2_BUCKET;
        this.publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL; // Para URLs públicas
    }

    /**
     * Genera un nombre de archivo único
     * @param {string} policyNumber - Número de póliza
     * @param {string} originalName - Nombre original del archivo
     * @param {string} type - Tipo: 'foto' o 'pdf'
     * @returns {string} Nombre único del archivo
     */
    generateFileName(policyNumber, originalName, type = 'file') {
        const timestamp = Date.now();
        const randomId = crypto.randomBytes(8).toString('hex');
        const extension = path.extname(originalName);
        const baseName = path.basename(originalName, extension);

        // Sanitizar nombre de archivo
        const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '');
        const sanitizedPolicyNumber = policyNumber.replace(/[^a-zA-Z0-9-_]/g, '');

        return `${type}/${sanitizedPolicyNumber}/${timestamp}_${randomId}_${sanitizedBaseName}${extension}`;
    }

    /**
     * Sube un archivo a Cloudflare R2
     * @param {Buffer} fileBuffer - Buffer del archivo
     * @param {string} fileName - Nombre del archivo en R2
     * @param {string} contentType - MIME type del archivo
     * @param {Object} metadata - Metadatos adicionales
     * @returns {Promise<Object>} Información del archivo subido
     */
    async uploadFile(fileBuffer, fileName, contentType, metadata = {}) {
        try {
            logger.info('Subiendo archivo a R2', {
                fileName,
                contentType,
                size: fileBuffer.length
            });

            const command = new PutObjectCommand({
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

            logger.info('Archivo subido exitosamente a R2', {
                fileName,
                url: fileUrl,
                size: fileBuffer.length
            });

            return fileInfo;
        } catch (error) {
            logger.error('Error al subir archivo a R2', {
                fileName,
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Error al subir archivo: ${error.message}`);
        }
    }

    /**
     * Elimina un archivo de Cloudflare R2
     * @param {string} fileName - Nombre del archivo en R2
     * @returns {Promise<void>}
     */
    async deleteFile(fileName) {
        try {
            logger.info('Eliminando archivo de R2', { fileName });

            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });

            await this.client.send(command);

            logger.info('Archivo eliminado exitosamente de R2', { fileName });
        } catch (error) {
            logger.error('Error al eliminar archivo de R2', {
                fileName,
                error: error.message
            });
            throw new Error(`Error al eliminar archivo: ${error.message}`);
        }
    }

    /**
     * Genera URL pública para un archivo
     * @param {string} fileName - Nombre del archivo en R2
     * @returns {string} URL pública
     */
    getPublicUrl(fileName) {
        if (this.publicUrl) {
            return `${this.publicUrl}/${fileName}`;
        }
        // Fallback si no hay dominio personalizado
        return `https://${this.bucket}.r2.cloudflarestorage.com/${fileName}`;
    }

    /**
     * Genera URL firmada para acceso temporal
     * @param {string} fileName - Nombre del archivo en R2
     * @param {number} expiresIn - Tiempo de expiración en segundos (default: 1 hora)
     * @returns {Promise<string>} URL firmada
     */
    async getSignedUrl(fileName, expiresIn = 3600) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });

            const signedUrl = await getSignedUrl(this.client, command, {
                expiresIn
            });

            logger.debug('URL firmada generada', { fileName, expiresIn });
            return signedUrl;
        } catch (error) {
            logger.error('Error al generar URL firmada', {
                fileName,
                error: error.message
            });
            throw new Error(`Error al generar URL firmada: ${error.message}`);
        }
    }

    /**
     * Sube una foto de póliza
     * @param {Buffer} photoBuffer - Buffer de la foto
     * @param {string} policyNumber - Número de póliza
     * @param {string} originalName - Nombre original
     * @returns {Promise<Object>} Información del archivo
     */
    async uploadPolicyPhoto(photoBuffer, policyNumber, originalName) {
        const fileName = this.generateFileName(policyNumber, originalName, 'fotos');
        const contentType = this.getImageContentType(originalName);

        return await this.uploadFile(photoBuffer, fileName, contentType, {
            policyNumber,
            type: 'foto',
            originalName
        });
    }

    /**
     * Sube un PDF de póliza
     * @param {Buffer} pdfBuffer - Buffer del PDF
     * @param {string} policyNumber - Número de póliza
     * @param {string} originalName - Nombre original
     * @returns {Promise<Object>} Información del archivo
     */
    async uploadPolicyPDF(pdfBuffer, policyNumber, originalName) {
        const fileName = this.generateFileName(policyNumber, originalName, 'pdfs');

        return await this.uploadFile(pdfBuffer, fileName, 'application/pdf', {
            policyNumber,
            type: 'pdf',
            originalName
        });
    }

    /**
     * Obtiene el content type para imágenes
     * @param {string} fileName - Nombre del archivo
     * @returns {string} Content type
     */
    getImageContentType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    /**
     * Verifica la configuración del servicio
     * @returns {boolean} True si está configurado correctamente
     */
    isConfigured() {
        const required = [
            'CLOUDFLARE_R2_ENDPOINT',
            'CLOUDFLARE_R2_ACCESS_KEY',
            'CLOUDFLARE_R2_SECRET_KEY',
            'CLOUDFLARE_R2_BUCKET'
        ];

        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            logger.error('Configuración de R2 incompleta', { missing });
            return false;
        }

        return true;
    }
}

// Singleton pattern
let instance = null;

/**
 * Obtiene la instancia del servicio de storage
 * @returns {CloudflareStorage}
 */
function getInstance() {
    if (!instance) {
        instance = new CloudflareStorage();

        if (!instance.isConfigured()) {
            throw new Error('CloudflareStorage no está configurado correctamente');
        }
    }
    return instance;
}

module.exports = {
    CloudflareStorage,
    getInstance
};
