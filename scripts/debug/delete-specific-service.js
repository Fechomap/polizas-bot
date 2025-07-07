// scripts/debug/delete-specific-service.js
// Script con simulación completa + confirmación para eliminar servicio específico

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const Policy = require('../../src/models/policy');
const ScheduledNotification = require('../../src/models/scheduledNotification');

// Función para pedir confirmación
function askConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
<<<<<<< HEAD
    
=======

>>>>>>> feature/sistema-crud
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim());
        });
    });
}

async function deleteSpecificServiceWithConfirmation(numeroPoliza, numeroExpediente) {
    try {
        // Conectar a MongoDB con timeout corto
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log('🔍 PASO 1: SIMULACIÓN COMPLETA (SIN CAMBIOS REALES)');
        console.log('='.repeat(60));
        console.log(`🔍 Analizando póliza: ${numeroPoliza}`);
        console.log(`🎯 Expediente a eliminar: ${numeroExpediente}`);
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
            return false;
        }
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log('\n📊 ESTADO ACTUAL:');
        console.log(`📋 Registros totales: ${policy.registros.length}`);
        console.log(`🚗 Servicios totales: ${policy.servicios.length}`);
        console.log(`🔢 servicioCounter: ${policy.servicioCounter}`);
        console.log(`🔢 registroCounter: ${policy.registroCounter}`);
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        // Buscar el registro específico
        const registroToDelete = policy.registros.find(r => r.numeroExpediente === numeroExpediente);
        if (!registroToDelete) {
            console.log(`❌ Registro con expediente ${numeroExpediente} no encontrado`);
            return false;
        }
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        // Buscar el servicio específico
        const servicioToDelete = policy.servicios.find(s => s.numeroExpediente === numeroExpediente);
        if (!servicioToDelete) {
            console.log(`❌ Servicio con expediente ${numeroExpediente} no encontrado`);
            return false;
        }
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log('\n🎯 ELEMENTOS IDENTIFICADOS PARA ELIMINAR:');
        console.log(`📋 Registro: #${registroToDelete.numeroRegistro}`);
        console.log(`   - ID: ${registroToDelete._id}`);
        console.log(`   - Expediente: ${registroToDelete.numeroExpediente}`);
        console.log(`   - Estado: ${registroToDelete.estado}`);
        console.log(`   - Origen-Destino: ${registroToDelete.origenDestino}`);
        console.log(`   - Fecha registro: ${registroToDelete.fechaRegistro}`);
        console.log(`   - Contacto programado: ${registroToDelete.fechaContactoProgramada}`);
        console.log(`   - Término programado: ${registroToDelete.fechaTerminoProgramada}`);
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log(`\n🚗 Servicio: #${servicioToDelete.numeroServicio}`);
        console.log(`   - ID: ${servicioToDelete._id}`);
        console.log(`   - Expediente: ${servicioToDelete.numeroExpediente}`);
        console.log(`   - Registro origen: ${servicioToDelete.numeroRegistroOrigen}`);
        console.log(`   - Costo: $${servicioToDelete.costo}`);
        console.log(`   - Fecha servicio: ${servicioToDelete.fechaServicio}`);
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        // Buscar notificaciones
        console.log('\n📅 BUSCANDO NOTIFICACIONES...');
        const notifications = await ScheduledNotification.find({
            numeroPoliza: numeroPoliza,
            expedienteNum: numeroExpediente
        });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log(`📅 Notificaciones encontradas: ${notifications.length}`);
        notifications.forEach((notif, index) => {
            console.log(`   ${index + 1}. Tipo: ${notif.tipoNotificacion}`);
            console.log(`      - ID: ${notif._id}`);
            console.log(`      - Estado: ${notif.status}`);
            console.log(`      - Fecha programada: ${notif.scheduledDate}`);
            console.log(`      - Teléfono: ${notif.telefono}`);
        });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        // Simular eliminación
        console.log('\n🧪 SIMULACIÓN DE ELIMINACIÓN:');
        console.log('✅ Se eliminarían las siguientes notificaciones:');
        notifications.forEach((notif, index) => {
            console.log(`   - ${notif.tipoNotificacion} (${notif._id})`);
        });
<<<<<<< HEAD
        
        console.log('✅ Se eliminaría del array registros:');
        console.log(`   - Registro #${registroToDelete.numeroRegistro} (${registroToDelete._id})`);
        
        console.log('✅ Se eliminaría del array servicios:');
        console.log(`   - Servicio #${servicioToDelete.numeroServicio} (${servicioToDelete._id})`);
        
        console.log('✅ Se actualizarían los contadores:');
        console.log(`   - servicioCounter: ${policy.servicioCounter} → ${policy.servicioCounter - 1}`);
        console.log(`   - registroCounter: ${policy.registroCounter} → ${policy.registroCounter - 1}`);
        
        // Mostrar estado final simulado
        const registrosRestantes = policy.registros.filter(r => r.numeroExpediente !== numeroExpediente);
        const serviciosRestantes = policy.servicios.filter(s => s.numeroExpediente !== numeroExpediente);
        
=======

        console.log('✅ Se eliminaría del array registros:');
        console.log(`   - Registro #${registroToDelete.numeroRegistro} (${registroToDelete._id})`);

        console.log('✅ Se eliminaría del array servicios:');
        console.log(`   - Servicio #${servicioToDelete.numeroServicio} (${servicioToDelete._id})`);

        console.log('✅ Se actualizarían los contadores:');
        console.log(`   - servicioCounter: ${policy.servicioCounter} → ${policy.servicioCounter - 1}`);
        console.log(`   - registroCounter: ${policy.registroCounter} → ${policy.registroCounter - 1}`);

        // Mostrar estado final simulado
        const registrosRestantes = policy.registros.filter(r => r.numeroExpediente !== numeroExpediente);
        const serviciosRestantes = policy.servicios.filter(s => s.numeroExpediente !== numeroExpediente);

>>>>>>> feature/sistema-crud
        console.log('\n📊 ESTADO FINAL SIMULADO:');
        console.log(`📋 Registros restantes: ${registrosRestantes.length}`);
        registrosRestantes.forEach(reg => {
            console.log(`   - Registro #${reg.numeroRegistro}: ${reg.numeroExpediente}`);
        });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log(`🚗 Servicios restantes: ${serviciosRestantes.length}`);
        serviciosRestantes.forEach(serv => {
            console.log(`   - Servicio #${serv.numeroServicio}: ${serv.numeroExpediente}`);
        });
<<<<<<< HEAD
        
        console.log(`🔢 servicioCounter final: ${policy.servicioCounter - 1}`);
        console.log(`🔢 registroCounter final: ${policy.registroCounter - 1}`);
        console.log(`🗑️ Notificaciones eliminadas: ${notifications.length}`);
        
        console.log('\n🧪 SIMULACIÓN COMPLETADA - NO SE HAN REALIZADO CAMBIOS');
        console.log('='.repeat(60));
        
=======

        console.log(`🔢 servicioCounter final: ${policy.servicioCounter - 1}`);
        console.log(`🔢 registroCounter final: ${policy.registroCounter - 1}`);
        console.log(`🗑️ Notificaciones eliminadas: ${notifications.length}`);

        console.log('\n🧪 SIMULACIÓN COMPLETADA - NO SE HAN REALIZADO CAMBIOS');
        console.log('='.repeat(60));

>>>>>>> feature/sistema-crud
        // PEDIR CONFIRMACIÓN
        console.log('\n⚠️  CONFIRMACIÓN REQUERIDA:');
        console.log('Esta operación eliminará PERMANENTEMENTE:');
        console.log(`- Registro #${registroToDelete.numeroRegistro} (${numeroExpediente})`);
        console.log(`- Servicio #${servicioToDelete.numeroServicio} (${numeroExpediente})`);
        console.log(`- ${notifications.length} notificaciones programadas`);
        console.log('\n¿Estás COMPLETAMENTE SEGURO de continuar?');
<<<<<<< HEAD
        
        const confirmation = await askConfirmation('Escriba "SI ELIMINAR" para confirmar (cualquier otra cosa cancela): ');
        
=======

        const confirmation = await askConfirmation('Escriba "SI ELIMINAR" para confirmar (cualquier otra cosa cancela): ');

>>>>>>> feature/sistema-crud
        if (confirmation !== 'si eliminar') {
            console.log('\n❌ OPERACIÓN CANCELADA por el usuario');
            console.log('No se realizaron cambios en la base de datos');
            return false;
        }
<<<<<<< HEAD
        
        // EJECUTAR ELIMINACIÓN REAL
        console.log('\n🔥 PASO 2: ELIMINACIÓN REAL EN PROGRESO...');
        console.log('='.repeat(60));
        
=======

        // EJECUTAR ELIMINACIÓN REAL
        console.log('\n🔥 PASO 2: ELIMINACIÓN REAL EN PROGRESO...');
        console.log('='.repeat(60));

>>>>>>> feature/sistema-crud
        console.log(`🗑️ Eliminando notificaciones del expediente ${numeroExpediente}...`);
        const notificationsResult = await ScheduledNotification.deleteMany({
            numeroPoliza: numeroPoliza,
            expedienteNum: numeroExpediente
        });
        console.log(`✅ Notificaciones eliminadas: ${notificationsResult.deletedCount}`);
<<<<<<< HEAD
        
        console.log(`🗑️ Eliminando registro y servicio de la póliza...`);
=======

        console.log('🗑️ Eliminando registro y servicio de la póliza...');
>>>>>>> feature/sistema-crud
        const updateResult = await Policy.updateOne(
            { numeroPoliza: numeroPoliza },
            {
                $pull: {
                    registros: { numeroExpediente: numeroExpediente },
                    servicios: { numeroExpediente: numeroExpediente }
                },
                $inc: {
                    servicioCounter: -1,
                    registroCounter: -1
                }
            }
        );
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        if (updateResult.modifiedCount === 0) {
            console.log('❌ Error: No se pudo actualizar la póliza');
            return false;
        }
<<<<<<< HEAD
        
        console.log('✅ Póliza actualizada exitosamente');
        
        // Verificar el resultado final
        const updatedPolicy = await Policy.findOne({ numeroPoliza: numeroPoliza });
        console.log(`\n📊 VERIFICACIÓN FINAL:`);
=======

        console.log('✅ Póliza actualizada exitosamente');

        // Verificar el resultado final
        const updatedPolicy = await Policy.findOne({ numeroPoliza: numeroPoliza });
        console.log('\n📊 VERIFICACIÓN FINAL:');
>>>>>>> feature/sistema-crud
        console.log(`📋 Registros restantes: ${updatedPolicy.registros.length}`);
        console.log(`🚗 Servicios restantes: ${updatedPolicy.servicios.length}`);
        console.log(`🔢 servicioCounter final: ${updatedPolicy.servicioCounter}`);
        console.log(`🔢 registroCounter final: ${updatedPolicy.registroCounter}`);
<<<<<<< HEAD
        
        console.log(`\n🎉 ELIMINACIÓN COMPLETADA EXITOSAMENTE:`);
=======

        console.log('\n🎉 ELIMINACIÓN COMPLETADA EXITOSAMENTE:');
>>>>>>> feature/sistema-crud
        console.log(`🗑️ Expediente ${numeroExpediente} eliminado de póliza ${numeroPoliza}`);
        console.log(`🗑️ Notificaciones eliminadas: ${notificationsResult.deletedCount}`);
        console.log(`🗑️ Registro #${registroToDelete.numeroRegistro} eliminado`);
        console.log(`🗑️ Servicio #${servicioToDelete.numeroServicio} eliminado`);
        console.log('='.repeat(60));
<<<<<<< HEAD
        
        return true;
        
=======

        return true;

>>>>>>> feature/sistema-crud
    } catch (error) {
        console.error('❌ Error durante la operación:', error.message);
        return false;
    } finally {
        mongoose.connection.close();
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    const numeroPoliza = process.argv[2];
    const numeroExpediente = process.argv[3];
<<<<<<< HEAD
    
=======

>>>>>>> feature/sistema-crud
    if (!numeroPoliza || !numeroExpediente) {
        console.log('❌ Uso: node delete-specific-service.js <numeroPoliza> <numeroExpediente>');
        console.log('📋 Ejemplo: node delete-specific-service.js K945012600-1 1184206');
        process.exit(1);
    }
<<<<<<< HEAD
    
    deleteSpecificServiceWithConfirmation(numeroPoliza, numeroExpediente);
}

module.exports = { deleteSpecificServiceWithConfirmation };
=======

    deleteSpecificServiceWithConfirmation(numeroPoliza, numeroExpediente);
}

module.exports = { deleteSpecificServiceWithConfirmation };
>>>>>>> feature/sistema-crud
