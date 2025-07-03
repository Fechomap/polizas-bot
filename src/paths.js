// src/paths.js
const path = require('path');

module.exports = {
    uploadsDir: path.join(__dirname, 'uploads'),
    logsDir: path.join(__dirname, 'logs'),
    rootDir: __dirname
};
