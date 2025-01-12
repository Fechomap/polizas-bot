// src/config.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
    telegram: {
        token: process.env.TELEGRAM_TOKEN
    },
    mongodb: {
        uri: process.env.MONGO_URI
    },
    session: {
        ttl: parseInt(process.env.SESSION_TIMEOUT || '1800000') // 30 minutos por defecto
    },
    uploads: {
        maxSize: parseInt(process.env.MAX_UPLOAD_SIZE || '20971520') // 20MB por defecto
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
};

// Validar la configuración al importar
validateConfig();
console.log('Configuración cargada:', config);

module.exports = config;