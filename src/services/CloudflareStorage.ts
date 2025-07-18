// src/services/CloudflareStorage.ts
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';
import crypto from 'crypto';
import path from 'path';

// Interfaces para el servicio de storage
interface IFileInfo {
    key: string;
    url: string;
    size: number;
    contentType: string;
    uploadedAt: Date;
    etag?: string;
}

interface IUploadMetadata {
    policyNumber?: string;
    type?: string;
    originalName?: string;
    [key: string]: any;
}

interface IStorageConfig {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    publicUrl?: string;
}

/**
 * Servicio para gestionar archivos en Cloudflare R2
 * Compatible con AWS S3 API
 */
class CloudflareStorage {
    private client: S3Client;
    private bucket: string;
    private publicUrl?: string;

    constructor() {
        this.client = new S3Client({
            region: 'auto', // R2 usa 'auto'
            endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY || '',
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY || ''
            }
        });
        this.bucket = process.env.CLOUDFLARE_R2_BUCKET || '';
        this.publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    }

    /**
     * Genera un nombre de archivo único
     */
    generateFileName(policyNumber: string, originalName: string, type = 'file'): string {
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
     */
    async uploadFile(
        fileBuffer: Buffer,
        fileName: string,
        contentType: string,
        metadata: IUploadMetadata = {}
    ): Promise<IFileInfo> {
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

            const fileInfo: IFileInfo = {
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
        } catch (error: any) {
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
     */
    async deleteFile(fileName: string): Promise<void> {
        try {
            logger.info('Eliminando archivo de R2', { fileName });

            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });

            await this.client.send(command);
            logger.info('Archivo eliminado exitosamente de R2', { fileName });
        } catch (error: any) {
            logger.error('Error al eliminar archivo de R2', {
                fileName,
                error: error.message
            });
            throw new Error(`Error al eliminar archivo: ${error.message}`);
        }
    }

    /**
     * Genera URL pública para un archivo
     */
    getPublicUrl(fileName: string): string {
        if (this.publicUrl) {
            return `${this.publicUrl}/${fileName}`;
        }
        // Fallback si no hay dominio personalizado
        return `https://${this.bucket}.r2.cloudflarestorage.com/${fileName}`;
    }

    /**
     * Genera URL firmada para acceso temporal
     */
    async getSignedUrl(fileName: string, expiresIn = 3600): Promise<string> {
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
        } catch (error: any) {
            logger.error('Error al generar URL firmada', {
                fileName,
                error: error.message
            });
            throw new Error(`Error al generar URL firmada: ${error.message}`);
        }
    }

    /**
     * Sube una foto de póliza
     */
    async uploadPolicyPhoto(
        photoBuffer: Buffer,
        policyNumber: string,
        originalName: string
    ): Promise<IFileInfo> {
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
     */
    async uploadPolicyPDF(
        pdfBuffer: Buffer,
        policyNumber: string,
        originalName: string
    ): Promise<IFileInfo> {
        const fileName = this.generateFileName(policyNumber, originalName, 'pdfs');

        return await this.uploadFile(pdfBuffer, fileName, 'application/pdf', {
            policyNumber,
            type: 'pdf',
            originalName
        });
    }

    /**
     * Obtiene el content type para imágenes
     */
    getImageContentType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
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
     */
    isConfigured(): boolean {
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

    /**
     * Obtiene estadísticas de uso del servicio
     */
    getStats(): {
        isConfigured: boolean;
        bucket: string;
        hasPublicUrl: boolean;
        endpoint: string | undefined;
    } {
        return {
            isConfigured: this.isConfigured(),
            bucket: this.bucket,
            hasPublicUrl: !!this.publicUrl,
            endpoint: process.env.CLOUDFLARE_R2_ENDPOINT
        };
    }

    /**
     * Prueba la conectividad con R2
     */
    async testConnection(): Promise<boolean> {
        try {
            // Intentar listar el bucket para verificar conectividad
            const testKey = `test-connection-${Date.now()}.txt`;
            const testBuffer = Buffer.from('test connection');

            await this.uploadFile(testBuffer, testKey, 'text/plain', {
                test: 'connection'
            });

            await this.deleteFile(testKey);
            return true;
        } catch (error: any) {
            logger.error('Error en prueba de conexión R2:', error.message);
            return false;
        }
    }
}

// Singleton pattern
let instance: CloudflareStorage | null = null;

/**
 * Obtiene la instancia del servicio de storage
 */
export function getInstance(): CloudflareStorage {
    if (!instance) {
        instance = new CloudflareStorage();

        if (!instance.isConfigured()) {
            throw new Error('CloudflareStorage no está configurado correctamente');
        }
    }
    return instance;
}

export { CloudflareStorage };
export default CloudflareStorage;
