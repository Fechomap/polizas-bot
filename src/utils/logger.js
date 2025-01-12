// src/utils/logger.js
const { createLogger, format, transports } = require('winston');
const path = require('path');

const logger = createLogger({
    level: 'debug',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    defaultMeta: { service: 'polizas-bot' },
    transports: []
});

// En producción (Heroku), solo usar Console transport
if (process.env.NODE_ENV === 'production') {
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple()
        )
    }));
} else {
    // En desarrollo, usar archivos y consola
    logger.add(new transports.File({ 
        filename: path.join(__dirname, '../../logs/error.log'), 
        level: 'error' 
    }));
    logger.add(new transports.File({ 
        filename: path.join(__dirname, '../../logs/combined.log') 
    }));
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple()
        )
    }));
}