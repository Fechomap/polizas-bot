// src/config.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
    telegram: {
        token: process.env.TELEGRAM_TOKEN,
        allowedGroups: [
            -1002291817096,
            process.env.TELEGRAM_GROUP_ID
        ].filter(Boolean)
    },
    mongodb: {
        uri: process.env.MONGO_URI
    },
    session: {
        ttl: parseInt(process.env.SESSION_TIMEOUT || '1800000')
    },
    uploads: {
        maxSize: parseInt(process.env.MAX_UPLOAD_SIZE || '20971520')
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

// Validar la configuración al importar
validateConfig();

// Usar console.log en lugar del logger
console.log('Configuración cargada:', JSON.stringify(config, null, 2));

module.exports = config;