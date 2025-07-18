// src/models/index.ts
// Exportar todos los modelos desde un punto central

import Policy from './policy';
import Vehicle from './vehicle';
import ScheduledNotification from './scheduledNotification';

// Nota: AuditLog se mantendrá en JS hasta migrar el módulo admin
const { AuditLog } = require('../admin/utils/auditLogger');

export { Policy, Vehicle, ScheduledNotification, AuditLog };

// Export por defecto para compatibilidad
const models = {
    Policy,
    Vehicle,
    ScheduledNotification,
    AuditLog
};

export default models;
