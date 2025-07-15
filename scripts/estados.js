// scripts/estados.js
/**
 * Script coordinador que ejecuta en secuencia:
 * 1. calculoEstadosDB.js - Para actualizar los estados en la base de datos
 * 2. exportExcel.js - Para exportar los datos actualizados a Excel
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Para crear un log de esta ejecución
const logDir = path.join(__dirname, 'logs');
const logFilePath = path.join(logDir, `estados_${new Date().toISOString().slice(0, 10)}.log`);

// Función para escribir logs
async function escribirLog(mensaje) {
    const timestamp = new Date().toISOString();
    const logMensaje = `[${timestamp}] ${mensaje}\n`;

    try {
        // Asegurar que el directorio de logs exista
        try {
            await fs.mkdir(logDir, { recursive: true });
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
        }

        // Agregar al archivo de log
        await fs.appendFile(logFilePath, logMensaje);

        // También mostrar en consola
        console.log(mensaje);
    } catch (err) {
        console.error('Error al escribir en el log:', err);
    }
}

// Función para ejecutar un script como proceso hijo y esperar a que termine
function ejecutarScript(scriptPath) {
    return new Promise((resolve, reject) => {
        // Obtener la ruta completa del script
        const fullPath = path.join(__dirname, scriptPath);

        escribirLog(`🚀 Ejecutando script: ${scriptPath}`);

        // Crear el proceso hijo
        const childProcess = spawn('node', [fullPath], {
            stdio: 'inherit' // Para que redireccione stdout y stderr a la consola principal
        });

        // Manejar la finalización del proceso
        childProcess.on('close', code => {
            if (code === 0) {
                escribirLog(`✅ Script ${scriptPath} completado exitosamente (código ${code})`);
                resolve();
            } else {
                escribirLog(`❌ Script ${scriptPath} falló con código de salida ${code}`);
                reject(new Error(`Script falló con código ${code}`));
            }
        });

        // Manejar errores
        childProcess.on('error', err => {
            escribirLog(`❌ Error al ejecutar ${scriptPath}: ${err.message}`);
            reject(err);
        });
    });
}

// Función principal que ejecuta los scripts en secuencia
async function ejecutarProceso() {
    try {
        await escribirLog('🔄 Iniciando proceso completo de estados y exportación');

        // Paso 1: Ejecutar calculoEstadosDB.js
        await ejecutarScript('calculoEstadosDB.js');

        // Pequeña pausa para asegurar que todas las operaciones de DB se han completado
        await escribirLog('⏱️ Esperando 2 segundos para asegurar completitud de operaciones...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Paso 2: Ejecutar exportExcel.js
        await ejecutarScript('exportExcel.js');

        await escribirLog('🎉 Proceso completo finalizado con éxito');

        // Información sobre los archivos generados
        const dateStr = new Date().toISOString().slice(0, 10);
        await escribirLog(
            `📋 Logs disponibles en: ${logDir}/calculo_${dateStr}.log y ${logFilePath}`
        );
        await escribirLog('📊 Excel exportado en: scripts/backup/');
    } catch (error) {
        await escribirLog(`❌ Error en el proceso: ${error.message}`);
        process.exit(1);
    }
}

// Ejecutar el proceso
ejecutarProceso();
