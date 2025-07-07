// scripts/debug/check-test-policy.js
// Script para verificar estado de póliza de testing

const mongoose = require('mongoose');
require('dotenv').config();
require('../../src/database');

const Policy = require('../../src/models/policy');
const ScheduledNotification = require('../../src/models/scheduledNotification');

async function checkTestPolicy(numeroPoliza) {
    try {
        console.log(`🔍 Verificando póliza: ${numeroPoliza}`);
<<<<<<< HEAD
        
        // Buscar la póliza
        const policy = await Policy.findOne({ 
            numeroPoliza: numeroPoliza 
        });
        
=======

        // Buscar la póliza
        const policy = await Policy.findOne({
            numeroPoliza: numeroPoliza
        });

>>>>>>> feature/sistema-crud
        if (!policy) {
            console.log('❌ Póliza no encontrada');
            return;
        }
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log('✅ PÓLIZA ENCONTRADA');
        console.log(`📋 Número: ${policy.numeroPoliza}`);
        console.log(`📞 Teléfono: ${policy.telefono}`);
        console.log(`🏢 Aseguradora: ${policy.aseguradora}`);
        console.log(`📅 Creada: ${policy.createdAt.toLocaleString('es-MX')}`);
        console.log(`🔄 Estado: ${policy.estado}`);
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log(`\n📊 REGISTROS (${policy.registros.length}):`);
        policy.registros.forEach((registro, index) => {
            console.log(`  ${index + 1}. ${registro.expediente} - ${registro.estado} - ${registro.fechaCreacion.toLocaleString('es-MX')}`);
        });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log(`\n🚗 SERVICIOS (${policy.servicios.length}):`);
        policy.servicios.forEach((servicio, index) => {
            console.log(`  ${index + 1}. ${servicio.expediente} - $${servicio.costo}`);
            console.log(`     📞 Contacto: ${servicio.fechaContacto.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
            console.log(`     🏁 Término: ${servicio.fechaTermino.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
        });
<<<<<<< HEAD
        
        // Verificar notificaciones
        const notifications = await ScheduledNotification.find({ 
            numeroPoliza: numeroPoliza 
        });
        
=======

        // Verificar notificaciones
        const notifications = await ScheduledNotification.find({
            numeroPoliza: numeroPoliza
        });

>>>>>>> feature/sistema-crud
        console.log(`\n📅 NOTIFICACIONES (${notifications.length}):`);
        const ahora = new Date();
        notifications.forEach((notif, index) => {
            const tiempoRestante = notif.scheduledTime - ahora;
            const minutosRestantes = Math.ceil(tiempoRestante / (1000 * 60));
            console.log(`  ${index + 1}. ${notif.type} - ${notif.expediente}`);
            console.log(`     ⏰ Programada: ${notif.scheduledTime.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
            console.log(`     ⏱️  ${minutosRestantes > 0 ? `En ${minutosRestantes} min` : 'Vencida'}`);
            console.log(`     ✅ Ejecutada: ${notif.executed ? 'Sí' : 'No'}`);
        });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        mongoose.connection.close();
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    const numeroPoliza = process.argv[2];
    if (!numeroPoliza) {
        console.log('❌ Uso: node check-test-policy.js <numeroPoliza>');
        process.exit(1);
    }
    checkTestPolicy(numeroPoliza);
}

<<<<<<< HEAD
module.exports = { checkTestPolicy };
=======
module.exports = { checkTestPolicy };
>>>>>>> feature/sistema-crud
