// scripts/calculoEstadosDB.js
/**
 * Script para cálculo automático de estados de pólizas en MongoDB
 * Diseñado para ejecutarse programáticamente (por ejemplo, con cron a las 6 AM)
 * Este script aplica directamente a la base de datos los cálculos que en calcularEstados.js
 * se aplicaban a un archivo Excel
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Policy = require('../src/models/policy');

// Ruta para guardar un registro de ejecución
const logDir = path.join(__dirname, 'logs');
const logFilePath = path.join(logDir, `calculo_${new Date().toISOString().slice(0, 10)}.log`);

// Función para escribir en el log
const escribirLog = async mensaje => {
    const timestamp = new Date().toISOString();
    const logMensaje = `[${timestamp}] ${mensaje}\n`;

    // Asegurar que el directorio exista
    try {
        await fs.mkdir(logDir, { recursive: true });
    } catch (err) {
        // Ignorar error si el directorio ya existe
        if (err.code !== 'EEXIST') throw err;
    }

    // Agregar al archivo de log
    try {
        await fs.appendFile(logFilePath, logMensaje);
    } catch (err) {
        console.error('Error al escribir en el log:', err);
    }

    // También mostrar en consola
    console.log(mensaje);
};

// Función para conectar a MongoDB
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        await escribirLog('✅ Conectando a MongoDB para cálculo de estados...');
        await mongoose.connect(mongoURI);
        await escribirLog('✅ Conectado a MongoDB');
        return true;
    } catch (error) {
        await escribirLog(`❌ Error al conectar a MongoDB: ${error.message}`);
        return false;
    }
};

// Función para agregar meses a una fecha
const addMonths = (date, months) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
};

// Función para calcular la diferencia en días
const diffDays = (fechaObjetivo, ahora) => {
    return Math.ceil((fechaObjetivo - ahora) / (1000 * 60 * 60 * 24));
};

// Función para calcular la calificación
const calcularPuntaje = (estado, diasCobertura, diasGracia, servicios) => {
    // Si la póliza ya tiene 2 servicios, se asigna la calificación mínima
    if (servicios >= 2) return 10;
    // Si la póliza está vencida, no es prioritaria
    if (estado === 'VENCIDA') return 0;

    // Seleccionar días según el estado
    const dias = estado === 'PERIODO DE GRACIA' ? diasGracia : diasCobertura;

    let puntaje = 0;
    // Para pólizas sin servicios
    if (servicios === 0) {
        if (dias <= 1) puntaje = 100;
        else if (dias <= 3) puntaje = 80;
        else if (dias <= 7) puntaje = 60;
        else puntaje = 40;
    }
    // Para pólizas con 1 servicio
    else if (servicios === 1) {
        if (dias <= 1) puntaje = 90;
        else if (dias <= 3) puntaje = 70;
        else if (dias <= 7) puntaje = 50;
        else puntaje = 30;
    }

    // Ajuste para pólizas vigentes
    if (estado === 'VIGENTE') {
        puntaje = Math.max(puntaje - 10, 0);
    }

    return puntaje;
};

// Función principal para actualizar todas las pólizas
const actualizarEstados = async () => {
    try {
        // Conectar a MongoDB
        const connected = await connectDB();
        if (!connected) {
            await escribirLog('❌ No se pudo conectar a la base de datos. Abortando operación.');
            process.exit(1);
        }

        const ahora = new Date();
        await escribirLog(`\n🔄 Iniciando cálculo de estados de pólizas - ${ahora.toISOString()}`);

        // Obtener todas las pólizas activas
        // Usar el método lean() para evitar validaciones del modelo
        const policies = await Policy.find({ estado: 'ACTIVO' }).lean();
        await escribirLog(`📊 Procesando ${policies.length} pólizas activas...`);

        // Contadores para el resumen
        const estados = {
            VIGENTE: 0,
            'PERIODO DE GRACIA': 0,
            VENCIDA: 0
        };

        let procesadas = 0;
        let errores = 0;

        // Procesar cada póliza
        for (const policy of policies) {
            try {
                // Verificar si tiene fecha de emisión
                if (!policy.fechaEmision) {
                    await escribirLog(
                        `⚠️ Póliza ${policy.numeroPoliza} sin fecha de emisión, omitiendo.`
                    );
                    continue;
                }

                // Contabilizar solo pagos REALIZADOS (dinero real recibido)
                const pagosRealizados = policy.pagos
                    ? policy.pagos.filter(pago => pago.estado === 'REALIZADO')
                    : [];
                const numPagos = pagosRealizados.length;

                // Calcular fechas de cobertura y período de gracia
                let fechaFinCobertura, fechaFinGracia, diasCobertura, diasGracia, estado;

                if (numPagos === 0) {
                    // Sin pagos: cobertura = fecha de emisión + 1 mes
                    fechaFinCobertura = addMonths(policy.fechaEmision, 1);
                    fechaFinGracia = new Date(fechaFinCobertura);
                    diasCobertura = diffDays(fechaFinCobertura, ahora);
                    diasGracia = diasCobertura;

                    if (diasCobertura < 0) {
                        estado = 'VENCIDA';
                    } else {
                        estado = 'PERIODO DE GRACIA';
                    }
                } else {
                    // Con pagos: la cobertura se extiende
                    fechaFinCobertura = addMonths(policy.fechaEmision, numPagos);
                    fechaFinGracia = addMonths(policy.fechaEmision, numPagos + 1);
                    diasCobertura = diffDays(fechaFinCobertura, ahora);
                    diasGracia = diffDays(fechaFinGracia, ahora);

                    if (diasCobertura >= 0) {
                        // Simplemente está VIGENTE
                        estado = 'VIGENTE';
                    } else {
                        estado = diasGracia >= 0 ? 'PERIODO DE GRACIA' : 'VENCIDA';
                    }
                }

                // Contar servicios
                const servicios = policy.servicios ? policy.servicios.length : 0;

                // Calcular calificación
                const puntaje = calcularPuntaje(estado, diasCobertura, diasGracia, servicios);

                // Preparar objeto de actualización
                const updateData = {
                    estadoPoliza: estado,
                    fechaFinCobertura: fechaFinCobertura,
                    fechaFinGracia: fechaFinGracia,
                    diasRestantesCobertura: diasCobertura || 0, // Asegurar que no sea undefined
                    diasRestantesGracia: diasGracia || 0, // Asegurar que no sea undefined
                    totalServicios: servicios || 0, // Asegurar que no sea undefined
                    calificacion: puntaje || 0 // Asegurar que no sea undefined
                };

                // Actualizar documento usando findByIdAndUpdate para evitar validaciones
                await Policy.findByIdAndUpdate(policy._id, updateData);

                // Incrementar contador para el resumen
                estados[estado] = (estados[estado] || 0) + 1;
                procesadas++;

                // Mostrar progreso cada 20 pólizas
                if (procesadas % 20 === 0) {
                    await escribirLog(
                        `🔄 Procesadas ${procesadas} de ${policies.length} pólizas...`
                    );
                }
            } catch (error) {
                await escribirLog(
                    `❌ Error al procesar póliza ${policy.numeroPoliza}: ${error.message}`
                );
                errores++;
            }
        }

        // Mostrar resumen
        await escribirLog('\n📊 Resumen de estados:');
        for (const [estado, cantidad] of Object.entries(estados)) {
            await escribirLog(`   - ${estado}: ${cantidad} pólizas`);
        }

        await escribirLog(`\n📋 Total pólizas procesadas: ${procesadas}`);
        await escribirLog(`📋 Total errores: ${errores}`);
        await escribirLog(`\n✅ Cálculo de estados completado - ${new Date().toISOString()}`);
    } catch (error) {
        await escribirLog(`❌ Error general: ${error.message}`);
    } finally {
        try {
            await mongoose.connection.close();
            await escribirLog('✅ Conexión a MongoDB cerrada correctamente.');
        } catch (err) {
            await escribirLog(`❌ Error al cerrar la conexión a MongoDB: ${err.message}`);
        }
    }
};

// Verificar si se ejecuta directamente
if (require.main === module) {
    actualizarEstados()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error fatal:', err);
            process.exit(1);
        });
} else {
    // Exportar para usar en otras partes
    module.exports = { actualizarEstados };
}
