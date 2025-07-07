// scripts/debug/delete-legacy-service.js
// Script para eliminar servicios legacy (sin registros asociados)

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

async function deleteLegacyService(numeroPoliza, numeroExpediente) {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log('🔍 PASO 1: ANÁLISIS DE SERVICIO LEGACY');
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
        // Buscar el servicio específico
        const servicioToDelete = policy.servicios.find(s => s.numeroExpediente === numeroExpediente);
        if (!servicioToDelete) {
            console.log(`❌ Servicio con expediente ${numeroExpediente} no encontrado`);
            return false;
        }
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        // Verificar que NO tenga registro asociado (confirmar que es legacy)
        const registroAsociado = policy.registros.find(r => r.numeroExpediente === numeroExpediente);
        if (registroAsociado) {
            console.log(`❌ ERROR: Este servicio SÍ tiene registro asociado (#${registroAsociado.numeroRegistro})`);
            console.log('❌ Use el script delete-specific-service.js para servicios con registros');
            return false;
        }
<<<<<<< HEAD
        
=======

>>>>>>> feature/sistema-crud
        console.log('\n🎯 SERVICIO LEGACY IDENTIFICADO:');
        console.log(`🚗 Servicio: #${servicioToDelete.numeroServicio}`);
        console.log(`   - ID: ${servicioToDelete._id}`);
        console.log(`   - Expediente: ${servicioToDelete.numeroExpediente}`);
        console.log(`   - Costo: $${servicioToDelete.costo}`);
        console.log(`   - Fecha: ${servicioToDelete.fechaServicio}`);
        console.log(`   - Origen-Destino: ${servicioToDelete.origenDestino || 'No definido'}`);
        console.log(`   - Registro origen: ${servicioToDelete.numeroRegistroOrigen || 'NINGUNO (Legacy)'}`);
<<<<<<< HEAD
        console.log(`   ⭐ CONFIRMADO: Servicio legacy sin registro`);
        
=======
        console.log('   ⭐ CONFIRMADO: Servicio legacy sin registro');

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
        notifications.forEach((notif) => {
            console.log(`   - ${notif.tipoNotificacion} (${notif._id})`);
        });
<<<<<<< HEAD
        
        console.log('✅ Se eliminaría del array servicios:');
        console.log(`   - Servicio #${servicioToDelete.numeroServicio} (${servicioToDelete._id})`);
        
        console.log('✅ Se actualizarían los contadores:');
        console.log(`   - servicioCounter: ${policy.servicioCounter} → ${policy.servicioCounter - 1}`);
        console.log(`   - registroCounter: ${policy.registroCounter} (sin cambios)`);
        
        // Mostrar estado final simulado
        const serviciosRestantes = policy.servicios.filter(s => s.numeroExpediente !== numeroExpediente);
        
=======

        console.log('✅ Se eliminaría del array servicios:');
        console.log(`   - Servicio #${servicioToDelete.numeroServicio} (${servicioToDelete._id})`);

        console.log('✅ Se actualizarían los contadores:');
        console.log(`   - servicioCounter: ${policy.servicioCounter} → ${policy.servicioCounter - 1}`);
        console.log(`   - registroCounter: ${policy.registroCounter} (sin cambios)`);

        // Mostrar estado final simulado
        const serviciosRestantes = policy.servicios.filter(s => s.numeroExpediente !== numeroExpediente);

>>>>>>> feature/sistema-crud
        console.log('\n📊 ESTADO FINAL SIMULADO:');
        console.log(`📋 Registros: ${policy.registros.length} (sin cambios)`);
        console.log(`🚗 Servicios restantes: ${serviciosRestantes.length}`);
        serviciosRestantes.forEach(serv => {
            console.log(`   - Servicio #${serv.numeroServicio}: ${serv.numeroExpediente}`);
        });
<<<<<<< HEAD
        
        console.log(`🔢 servicioCounter final: ${policy.servicioCounter - 1}`);
        console.log(`🔢 registroCounter final: ${policy.registroCounter} (sin cambios)`);
        console.log(`🗑️ Notificaciones eliminadas: ${notifications.length}`);
        
        console.log('\n🧪 SIMULACIÓN COMPLETADA - NO SE HAN REALIZADO CAMBIOS');
        console.log('='.repeat(60));
        
=======

        console.log(`🔢 servicioCounter final: ${policy.servicioCounter - 1}`);
        console.log(`🔢 registroCounter final: ${policy.registroCounter} (sin cambios)`);
        console.log(`🗑️ Notificaciones eliminadas: ${notifications.length}`);

        console.log('\n🧪 SIMULACIÓN COMPLETADA - NO SE HAN REALIZADO CAMBIOS');
        console.log('='.repeat(60));

>>>>>>> feature/sistema-crud
        // PEDIR CONFIRMACIÓN
        console.log('\n⚠️  CONFIRMACIÓN REQUERIDA:');
        console.log('Esta operación eliminará PERMANENTEMENTE:');
        console.log(`- Servicio legacy #${servicioToDelete.numeroServicio} (${numeroExpediente})`);
        console.log(`- ${notifications.length} notificaciones programadas`);
        console.log('\n¿Estás COMPLETAMENTE SEGURO de continuar?');
<<<<<<< HEAD
        
        const confirmation = await askConfirmation('Escriba "SI ELIMINAR LEGACY" para confirmar (cualquier otra cosa cancela): ');
        
=======

        const confirmation = await askConfirmation('Escriba "SI ELIMINAR LEGACY" para confirmar (cualquier otra cosa cancela): ');

>>>>>>> feature/sistema-crud
        if (confirmation !== 'si eliminar legacy') {
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
        
        console.log(`🗑️ Eliminando servicio legacy de la póliza...`);
=======

        console.log('🗑️ Eliminando servicio legacy de la póliza...');
>>>>>>> feature/sistema-crud
        const updateResult = await Policy.updateOne(
            { numeroPoliza: numeroPoliza },
            {
                $pull: {
                    servicios: { numeroExpediente: numeroExpediente }
                },
                $inc: {
                    servicioCounter: -1
                    // registroCounter no se modifica porque no había registro
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
        console.log(`📋 Registros: ${updatedPolicy.registros.length} (sin cambios)`);
        console.log(`🚗 Servicios restantes: ${updatedPolicy.servicios.length}`);
        console.log(`🔢 servicioCounter final: ${updatedPolicy.servicioCounter}`);
        console.log(`🔢 registroCounter final: ${updatedPolicy.registroCounter} (sin cambios)`);
<<<<<<< HEAD
        
        console.log(`\n🎉 ELIMINACIÓN DE SERVICIO LEGACY COMPLETADA:`);
=======

        console.log('\n🎉 ELIMINACIÓN DE SERVICIO LEGACY COMPLETADA:');
>>>>>>> feature/sistema-crud
        console.log(`🗑️ Expediente ${numeroExpediente} eliminado de póliza ${numeroPoliza}`);
        console.log(`🗑️ Notificaciones eliminadas: ${notificationsResult.deletedCount}`);
        console.log(`🗑️ Servicio legacy #${servicioToDelete.numeroServicio} eliminado`);
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
        console.log('❌ Uso: node delete-legacy-service.js <numeroPoliza> <numeroExpediente>');
        console.log('📋 Ejemplo: node delete-legacy-service.js ILD095610000 25204462');
        console.log('');
        console.log('ℹ️  Este script es para servicios LEGACY (sin registros asociados)');
        console.log('ℹ️  Para servicios nuevos (con registros), use delete-specific-service.js');
        process.exit(1);
    }
<<<<<<< HEAD
    
    deleteLegacyService(numeroPoliza, numeroExpediente);
}

module.exports = { deleteLegacyService };
=======

    deleteLegacyService(numeroPoliza, numeroExpediente);
}

module.exports = { deleteLegacyService };
>>>>>>> feature/sistema-crud
