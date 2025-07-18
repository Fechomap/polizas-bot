"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const paths = {
    uploadsDir: path_1.default.join(__dirname, 'uploads'),
    logsDir: path_1.default.join(__dirname, '../logs'),
    tempDir: path_1.default.join(__dirname, 'temp'),
    configDir: path_1.default.join(__dirname, '../'),
    rootDir: __dirname
};
exports.default = paths;
