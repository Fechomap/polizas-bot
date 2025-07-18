// src/utils/logger.ts
import { createLogger, format, transports, Logger } from 'winston';
import moment from 'moment-timezone';
import path from 'path';

// Interfaz para métodos de logging
interface ILoggerMethods {
    error: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    info: (message: string, meta?: any) => void;
    debug: (message: string, meta?: any) => void;
}

// Formato personalizado para incluir zona horaria
const timezoneFormat = format((info: any) => {
    info.timestamp = moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss z');
    return info;
});

// Define los formatos comunes
const commonFormats = format.combine(
    timezoneFormat(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
);

// Crear el logger con una configuración base que incluye siempre la consola
const logger: Logger = createLogger({
    level: 'debug',
    format: commonFormats,
    defaultMeta: { service: 'polizas-bot' },
    transports: [
        new transports.Console({
            format: format.combine(format.colorize(), format.simple())
        })
    ]
});

// Solo agregar los transportes de archivo en desarrollo
if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new transports.File({
            filename: path.join(__dirname, '../../logs/error.log'),
            level: 'error'
        })
    );
    logger.add(
        new transports.File({
            filename: path.join(__dirname, '../../logs/combined.log')
        })
    );
}

// Asegurarse de que todos los métodos de logging estén disponibles
const logMethods: Array<keyof ILoggerMethods> = ['error', 'warn', 'info', 'debug'];
logMethods.forEach(method => {
    if (!(logger as any)[method]) {
        (logger as any)[method] = (...args: any[]) => (console as any)[method](...args);
    }
});

export default logger;
