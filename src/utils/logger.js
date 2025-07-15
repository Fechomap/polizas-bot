// src/utils/logger.js
const { createLogger, format, transports } = require('winston');
const moment = require('moment-timezone'); // AÑADIR ESTA LÍNEA

// Formato personalizado para incluir zona horaria
const timezoneFormat = format(info => {
    info.timestamp = moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss z');
    return info;
});
const path = require('path');

// Define los formatos comunes
const commonFormats = format.combine(
    timezoneFormat(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
);

// Crear el logger con una configuración base que incluye siempre la consola
const logger = createLogger({
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
const logMethods = ['error', 'warn', 'info', 'debug'];
logMethods.forEach(method => {
    if (!logger[method]) {
        logger[method] = (...args) => console[method](...args);
    }
});

module.exports = logger;
