// src/paths.ts
import path from 'path';

/**
 * Rutas del proyecto para archivos y directorios
 */
interface IPaths {
    uploadsDir: string;
    logsDir: string;
    rootDir: string;
    tempDir: string;
    configDir: string;
}

const paths: IPaths = {
    uploadsDir: path.join(__dirname, 'uploads'),
    logsDir: path.join(__dirname, '../logs'),
    tempDir: path.join(__dirname, 'temp'),
    configDir: path.join(__dirname, '../'),
    rootDir: __dirname
};

export default paths;
