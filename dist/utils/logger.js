"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = require("winston");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const path_1 = __importDefault(require("path"));
const timezoneFormat = (0, winston_1.format)((info) => {
    info.timestamp = (0, moment_timezone_1.default)().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss z');
    return info;
});
const commonFormats = winston_1.format.combine(timezoneFormat(), winston_1.format.errors({ stack: true }), winston_1.format.splat(), winston_1.format.json());
const logger = (0, winston_1.createLogger)({
    level: 'debug',
    format: commonFormats,
    defaultMeta: { service: 'polizas-bot' },
    transports: [
        new winston_1.transports.Console({
            format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.simple())
        })
    ]
});
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston_1.transports.File({
        filename: path_1.default.join(__dirname, '../../logs/error.log'),
        level: 'error'
    }));
    logger.add(new winston_1.transports.File({
        filename: path_1.default.join(__dirname, '../../logs/combined.log')
    }));
}
const logMethods = ['error', 'warn', 'info', 'debug'];
logMethods.forEach(method => {
    if (!logger[method]) {
        logger[method] = (...args) => console[method](...args);
    }
});
exports.default = logger;
