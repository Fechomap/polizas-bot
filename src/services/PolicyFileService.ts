// src/services/PolicyFileService.ts
/**
 * Servicio para gestión de archivos de pólizas
 * Responsabilidad única: subida a R2 y transferencia de fotos
 */

import Policy from '../models/policy';
import type { IVehicle, IPolicy } from '../types/database';
import type { IArchivoPoliza, IR2FileRecord, IUploadResult } from '../types/policy-assignment';
import logger from '../utils/logger';

export class PolicyFileService {
    private storage: any;

    constructor() {
        // Lazy loading del storage para evitar dependencias circulares
        this.storage = null;
    }

    /**
     * Obtiene instancia del storage de Cloudflare
     */
    private getStorage(): any {
        if (!this.storage) {
            const { getInstance } = require('./CloudflareStorage');
            this.storage = getInstance();
        }
        return this.storage;
    }

    /**
     * Sube un archivo (PDF o foto) a Cloudflare R2
     */
    async subirArchivo(archivo: IArchivoPoliza, numeroPoliza: string): Promise<IUploadResult> {
        try {
            const storage = this.getStorage();

            let uploadResult: any;
            if (archivo.type === 'pdf') {
                uploadResult = await storage.uploadPolicyPDF(
                    archivo.buffer,
                    numeroPoliza,
                    archivo.file_name
                );
            } else {
                const fileName = `polizas/${numeroPoliza}/foto_${archivo.file_name}`;
                uploadResult = await storage.uploadFile(
                    archivo.buffer,
                    fileName,
                    archivo.mime_type
                );
            }

            if (uploadResult?.url) {
                logger.info(`[PolicyFileService] Archivo subido a R2: ${uploadResult.url}`);
                return {
                    success: true,
                    url: uploadResult.url,
                    key: uploadResult.key,
                    size: uploadResult.size,
                    contentType: uploadResult.contentType
                };
            }

            return { success: false, error: 'No se pudo subir el archivo' };
        } catch (error: any) {
            logger.error('[PolicyFileService] Error subiendo archivo:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Guarda referencia del archivo en la póliza
     */
    async guardarReferenciaArchivo(
        policyId: string,
        archivo: IArchivoPoliza,
        uploadResult: IUploadResult
    ): Promise<boolean> {
        try {
            const polizaDB = await Policy.findById(policyId);
            if (!polizaDB) {
                logger.error('[PolicyFileService] Póliza no encontrada:', policyId);
                return false;
            }

            // Inicializar estructura de archivos si no existe
            if (!polizaDB.archivos) {
                polizaDB.archivos = {
                    fotos: [],
                    pdfs: [],
                    r2Files: { fotos: [], pdfs: [] }
                };
            }
            if (!polizaDB.archivos.r2Files) {
                polizaDB.archivos.r2Files = { fotos: [], pdfs: [] };
            }

            const r2File: IR2FileRecord = {
                url: uploadResult.url!,
                key: uploadResult.key!,
                size: uploadResult.size || 0,
                contentType: uploadResult.contentType || archivo.mime_type,
                uploadDate: new Date(),
                originalName: archivo.file_name
            };

            if (archivo.type === 'pdf') {
                polizaDB.archivos.r2Files.pdfs.push(r2File);
            } else {
                polizaDB.archivos.r2Files.fotos.push(r2File);
            }

            await polizaDB.save();
            logger.info(`[PolicyFileService] Referencia guardada en póliza ${policyId}`);
            return true;
        } catch (error: any) {
            logger.error('[PolicyFileService] Error guardando referencia:', error);
            return false;
        }
    }

    /**
     * Transfiere fotos de un vehículo a una póliza
     */
    async transferirFotosVehiculo(vehiculo: IVehicle, poliza: IPolicy): Promise<number> {
        try {
            if (!vehiculo.archivos?.r2Files?.fotos?.length) {
                logger.debug('[PolicyFileService] No hay fotos del vehículo para transferir');
                return 0;
            }

            const polizaDB = await Policy.findById(poliza._id);
            if (!polizaDB) {
                logger.error('[PolicyFileService] Póliza no encontrada para transferir fotos');
                return 0;
            }

            // Inicializar estructura de archivos
            if (!polizaDB.archivos) {
                polizaDB.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
            }
            if (!polizaDB.archivos.r2Files) {
                polizaDB.archivos.r2Files = { fotos: [], pdfs: [] };
            }

            // Copiar referencias de fotos
            const fotosTransferidas: IR2FileRecord[] = [];
            for (const foto of vehiculo.archivos.r2Files.fotos) {
                fotosTransferidas.push({
                    url: foto.url,
                    key: foto.key,
                    size: foto.size,
                    contentType: foto.contentType || 'image/jpeg',
                    uploadDate: foto.uploadDate || new Date(),
                    originalName: foto.originalName || 'foto_vehiculo.jpg',
                    fuenteOriginal: 'vehiculo_bd_autos'
                });
            }

            polizaDB.archivos.r2Files.fotos.push(...fotosTransferidas);
            await polizaDB.save();

            logger.info(
                `[PolicyFileService] ${fotosTransferidas.length} fotos transferidas a póliza ${poliza.numeroPoliza}`
            );
            return fotosTransferidas.length;
        } catch (error: any) {
            logger.error('[PolicyFileService] Error transfiriendo fotos:', error);
            return 0;
        }
    }

    /**
     * Descarga un archivo desde Telegram
     */
    async descargarArchivoTelegram(
        bot: any,
        fileId: string
    ): Promise<{ buffer: Buffer; success: boolean; error?: string }> {
        try {
            const fileLink = await bot.telegram.getFileLink(fileId);
            const fetch = require('node-fetch');
            const response = await fetch(fileLink.href);

            if (!response.ok) {
                throw new Error(`Error descargando archivo: ${response.status}`);
            }

            const buffer = await response.buffer();
            logger.debug(`[PolicyFileService] Archivo descargado, tamaño: ${buffer.length}`);

            return { buffer, success: true };
        } catch (error: any) {
            logger.error('[PolicyFileService] Error descargando archivo:', error);
            return { buffer: Buffer.alloc(0), success: false, error: error.message };
        }
    }
}

// Singleton
let instance: PolicyFileService | null = null;

export function getPolicyFileService(): PolicyFileService {
    if (!instance) {
        instance = new PolicyFileService();
    }
    return instance;
}

export default PolicyFileService;
