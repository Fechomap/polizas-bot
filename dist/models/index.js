"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = exports.ScheduledNotification = exports.Vehicle = exports.Policy = void 0;
const policy_1 = __importDefault(require("./policy"));
exports.Policy = policy_1.default;
const vehicle_1 = __importDefault(require("./vehicle"));
exports.Vehicle = vehicle_1.default;
const scheduledNotification_1 = __importDefault(require("./scheduledNotification"));
exports.ScheduledNotification = scheduledNotification_1.default;
const { AuditLog } = require('../admin/utils/auditLogger');
exports.AuditLog = AuditLog;
const models = {
    Policy: policy_1.default,
    Vehicle: vehicle_1.default,
    ScheduledNotification: scheduledNotification_1.default,
    AuditLog
};
exports.default = models;
