// Exportar todos los modelos desde un punto central
module.exports = {
    Policy: require('./policy'),
    ScheduledNotification: require('./scheduledNotification'),
    AuditLog: require('../admin/utils/auditLogger').AuditLog
};
