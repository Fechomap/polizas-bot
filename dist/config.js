"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const config = {
    telegram: {
        token: process.env.TELEGRAM_TOKEN || '',
        allowedGroups: [-1002291817096, process.env.TELEGRAM_GROUP_ID]
            .filter((id) => id !== undefined && id !== null)
            .map(id => (typeof id === 'string' ? parseInt(id) : id))
    },
    mongodb: {
        uri: process.env.MONGO_URI || ''
    },
    session: {
        ttl: parseInt(process.env.SESSION_TIMEOUT || '1800000')
    },
    uploads: {
        maxSize: parseInt(process.env.MAX_UPLOAD_SIZE || '20971520')
    },
    admin: {
        sessionTimeout: 5 * 60 * 1000,
        auditRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90'),
        features: {
            enableAudit: true,
            enableAdvancedStats: false
        }
    }
};
const validateConfig = () => {
    const required = ['telegram.token', 'mongodb.uri'];
    const missing = [];
    for (const path of required) {
        const value = path.split('.').reduce((obj, key) => obj?.[key], config);
        if (!value) {
            missing.push(path);
        }
    }
    if (missing.length > 0) {
        throw new Error(`Configuración faltante: ${missing.join(', ')}`);
    }
    if (!config.telegram.allowedGroups || config.telegram.allowedGroups.length === 0) {
        console.warn('⚠️ No hay grupos permitidos configurados');
    }
};
validateConfig();
console.log('Configuración cargada:', JSON.stringify(config, null, 2));
exports.default = config;
