// src/services/PolicyFileService.ts
/**
 * Servicio para gestión de archivos de pólizas
 * Responsabilidad única: subida a R2 y transferencia de fotos
 */

import type { IVehicle, IPolicy } from '../types/database';
import type { IArchivoPoliza, IR2FileRecord, IUploadResult } from '../types/policy-assignment';
import { addFileToPolicyR2, getPolicyFilesByNumber } from '../controllers/policyController';
import { prisma } from '../database';
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
     * Guarda referencia del archivo en la póliza (Prisma)
     */
    async guardarReferenciaArchivo(
        policyId: string,
        archivo: IArchivoPoliza,
        uploadResult: IUploadResult
    ): Promise<boolean> {
        try {
            const tipo = archivo.type === 'pdf' ? 'PDF' : 'FOTO';
            await addFileToPolicyR2(policyId, tipo, {
                url: uploadResult.url!,
                key: uploadResult.key!,
                size: uploadResult.size ?? 0,
                contentType: uploadResult.contentType ?? archivo.mime_type,
                originalName: archivo.file_name
            });

            logger.info(`[PolicyFileService] Referencia guardada en póliza ${policyId}`);
            return true;
        } catch (error: any) {
            logger.error('[PolicyFileService] Error guardando referencia:', error);
            return false;
        }
    }

    /**
     * Transfiere fotos de un vehículo a una póliza (Prisma)
     */
    async transferirFotosVehiculo(vehiculo: IVehicle, poliza: IPolicy): Promise<number> {
        try {
            // Obtener fotos del vehículo desde VehicleFileR2
            const fotosVehiculo = await prisma.vehicleFileR2.findMany({
                where: { vehicleId: vehiculo.id, tipo: 'FOTO' }
            });

            if (fotosVehiculo.length === 0) {
                logger.debug('[PolicyFileService] No hay fotos del vehículo para transferir');
                return 0;
            }

            // Copiar referencias de fotos a la póliza
            let fotosTransferidas = 0;
            for (const foto of fotosVehiculo) {
                await addFileToPolicyR2(poliza.id, 'FOTO', {
                    url: foto.url,
                    key: foto.key,
                    size: foto.size,
                    contentType: foto.contentType ?? 'image/jpeg',
                    originalName: foto.originalName ?? 'foto_vehiculo.jpg',
                    fuenteOriginal: 'vehiculo_bd_autos'
                });
                fotosTransferidas++;
            }

            logger.info(
                `[PolicyFileService] ${fotosTransferidas} fotos transferidas a póliza ${poliza.numeroPoliza}`
            );
            return fotosTransferidas;
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
    instance ??= new PolicyFileService();
    return instance;
}

export default PolicyFileService;
