// src/utils/fileHandler.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger'); // <-- IMPORTAR EL LOGGER AQUI

class FileHandler {
    static async ensureDirectory(directoryPath) {
        try {
            await fs.access(directoryPath);
        } catch {
            await fs.mkdir(directoryPath, { recursive: true });
            logger.info(`✅ Directorio creado: ${directoryPath}`);
        }
    }

    static async saveFile(fileUrl, numeroPoliza, fileType) {
        const fileDir = path.join(__dirname, '..', 'uploads', numeroPoliza);
        await this.ensureDirectory(fileDir);
        
        const timestamp = Date.now();
        const fileName = `${timestamp}.${fileType}`;
        const filePath = path.join(fileDir, fileName);
        
        try {
            const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, response.data);
            logger.info(`✅ Archivo guardado: ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error('❌ Error al guardar archivo:', { error });
            throw error;
        }
    }

    static async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            logger.info(`✅ Archivo eliminado: ${filePath}`);
            return true;
        } catch (error) {
            logger.error('❌ Error al eliminar archivo:', { error });
            return false;
        }
    }

    static createReadStream(filePath) {
        return fsSync.createReadStream(filePath);
    }
}

module.exports = FileHandler;