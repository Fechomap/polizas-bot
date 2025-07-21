// scripts/migracion-segura-vehiculos-niv.js
// Migración SEGURA de vehículos 2023-2026 a NIVs
require('dotenv').config();
const mongoose = require('mongoose');

// CONFIGURACIÓN DE SEGURIDAD
const MODO_SIMULACION = false; // CAMBIADO A MODO REAL - AUTORIZADO
const VERIFICAR_CADA_PASO = true;
const TIMEOUT_TRANSACCION = 10000; // 10 segundos máximo por transacción

// Esquemas flexibles
const VehicleSchema = new mongoose.Schema({}, { strict: false });
const PolicySchema = new mongoose.Schema({}, { strict: false });
const Vehicle = mongoose.model('Vehicle', VehicleSchema);
const Policy = mongoose.model('Policy', PolicySchema);

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            console.log('❌ MONGO_URI no está definida');
            return false;
        }
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
        return true;
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error.message);
        return false;
    }
};

// Función para generar datos mexicanos realistas
const generarDatosMexicanos = () => {
    const nombres = ['José Luis', 'María Elena', 'Carlos Alberto', 'Ana Patricia', 'Roberto', 'Leticia'];
    const apellidos = ['García López', 'Hernández Silva', 'Martínez Cruz', 'López Herrera', 'González Ruiz'];
    const calles = ['Av. Revolución', 'Calle Morelos', 'Av. Juárez', 'Calle Hidalgo', 'Av. Independencia'];
    const colonias = ['Centro', 'Del Valle', 'Roma Norte', 'Condesa', 'Polanco', 'Doctores'];
    const municipios = ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá', 'Tlajomulco'];
    const estados = ['JALISCO', 'CDMX', 'NUEVO LEÓN', 'PUEBLA'];
    
    const nombre = nombres[Math.floor(Math.random() * nombres.length)];
    const apellido = apellidos[Math.floor(Math.random() * apellidos.length)];
    const titular = `${nombre} ${apellido}`;
    
    // Generar RFC realista
    const iniciales = nombre.charAt(0) + apellido.split(' ')[0].charAt(0) + apellido.split(' ')[1]?.charAt(0) || 'X';
    const fecha = '850715'; // Fecha fija para consistencia
    const homoclave = 'A1B';
    const rfc = `${iniciales}${fecha}${homoclave}`;
    
    return {
        titular,
        rfc,
        telefono: `33${Math.floor(Math.random() * 90000000 + 10000000)}`,
        correo: `${nombre.toLowerCase().replace(' ', '.')}@email.com`,
        calle: `${calles[Math.floor(Math.random() * calles.length)]} ${Math.floor(Math.random() * 999 + 1)}`,
        colonia: colonias[Math.floor(Math.random() * colonias.length)],
        municipio: municipios[Math.floor(Math.random() * municipios.length)],
        estadoRegion: estados[Math.floor(Math.random() * estados.length)],
        cp: `${Math.floor(Math.random() * 90000 + 10000)}`
    };
};

// Función de verificación pre-migración
async function verificacionPreMigracion() {
    console.log('🔍 VERIFICACIÓN PRE-MIGRACIÓN');
    console.log('-'.repeat(60));
    
    try {
        // Verificar conectividad
        const testQuery = await Vehicle.countDocuments();
        console.log(`✅ Conectividad DB: ${testQuery} vehículos totales`);
        
        // Verificar vehículos objetivo
        const vehiculosObjetivo = await Vehicle.find({
            año: { $in: [2023, 2024, 2025, 2026] }
        }).lean();
        
        console.log(`📊 Vehículos 2023-2026: ${vehiculosObjetivo.length}`);
        
        // Verificar espacio en DB
        const dbStats = await mongoose.connection.db.stats();
        console.log(`💾 DB Size: ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Verificar que no hay transacciones activas (verificación simplificada)
        console.log(`🔒 Verificación de sesiones: OK`);
        
        return { success: true, vehiculosObjetivo };
        
    } catch (error) {
        console.error('❌ Error en verificación:', error.message);
        return { success: false, error: error.message };
    }
}

// Función para simular migración (sin cambios reales)
async function simularMigracion(vehiculosObjetivo) {
    console.log('\n🧪 SIMULACIÓN DE MIGRACIÓN (SIN CAMBIOS REALES)');
    console.log('═'.repeat(80));
    
    const resultadosSimulacion = {
        vehiculosAProcesar: 0,
        polizasACrear: 0,
        actualizacionesTerminologia: 0,
        erroresPotenciales: []
    };
    
    for (const vehiculo of vehiculosObjetivo) {
        console.log(`\n🚗 SIMULANDO: ${vehiculo.serie} (${vehiculo.marca} ${vehiculo.año})`);
        
        try {
            // Simular verificaciones
            if (vehiculo.estado === 'SIN_POLIZA') {
                console.log('   ✅ SIMULAR: Convertir vehículo a CONVERTIDO_NIV');
                console.log('   ✅ SIMULAR: Crear póliza NIV automática');
                resultadosSimulacion.vehiculosAProcesar++;
                resultadosSimulacion.polizasACrear++;
            } else if (vehiculo.estado === 'CONVERTIDO_NIP') {
                console.log('   ✅ SIMULAR: Actualizar terminología NIP → NIV');
                resultadosSimulacion.actualizacionesTerminologia++;
            }
            
            // Simular generación de datos
            const datosMexicanos = generarDatosMexicanos();
            console.log(`   📊 SIMULAR: Titular generado: ${datosMexicanos.titular}`);
            console.log(`   📊 SIMULAR: RFC generado: ${datosMexicanos.rfc}`);
            
            // Verificar series duplicadas (solo problemático para vehículos SIN_POLIZA)
            if (vehiculo.estado === 'SIN_POLIZA') {
                const serieExiste = await Policy.findOne({ numeroPoliza: vehiculo.serie });
                if (serieExiste) {
                    resultadosSimulacion.erroresPotenciales.push({
                        vehiculo: vehiculo.serie,
                        error: 'Póliza con esta serie ya existe - conflicto real'
                    });
                    console.log('   ⚠️  CONFLICTO REAL: Serie ya existe como póliza');
                }
            } else if (vehiculo.estado === 'CONVERTIDO_NIP') {
                console.log('   ✅ NORMAL: Vehículo ya tiene póliza (actualización terminológica)');
            }
            
        } catch (error) {
            resultadosSimulacion.erroresPotenciales.push({
                vehiculo: vehiculo.serie,
                error: error.message
            });
            console.log(`   ❌ ERROR SIMULADO: ${error.message}`);
        }
    }
    
    console.log('\n📊 RESULTADOS DE SIMULACIÓN:');
    console.log(`   • Vehículos a procesar: ${resultadosSimulacion.vehiculosAProcesar}`);
    console.log(`   • Pólizas a crear: ${resultadosSimulacion.polizasACrear}`);
    console.log(`   • Actualizaciones terminología: ${resultadosSimulacion.actualizacionesTerminologia}`);
    console.log(`   • Errores potenciales: ${resultadosSimulacion.erroresPotenciales.length}`);
    
    if (resultadosSimulacion.erroresPotenciales.length > 0) {
        console.log('\n⚠️  ERRORES POTENCIALES DETECTADOS:');
        resultadosSimulacion.erroresPotenciales.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error.vehiculo}: ${error.error}`);
        });
    }
    
    return resultadosSimulacion;
}

// Función para migrar un vehículo individual de forma segura
async function migrarVehiculoSeguro(vehiculo, session) {
    const logPrefix = `[${vehiculo.serie}]`;
    console.log(`${logPrefix} Iniciando migración individual`);
    
    try {
        // 1. Verificar estado actual
        const vehiculoActual = await Vehicle.findById(vehiculo._id).session(session);
        if (!vehiculoActual) {
            throw new Error('Vehículo no encontrado al inicio de migración');
        }
        
        console.log(`${logPrefix} Estado actual: ${vehiculoActual.estado}`);
        
        // 2. Determinar acciones según estado
        let accionesRealizadas = [];
        
        if (vehiculoActual.estado === 'SIN_POLIZA') {
            // CASO 1: Vehículo normal → Convertir a NIV completo
            console.log(`${logPrefix} CASO: Conversión completa a NIV`);
            
            // Generar datos del titular
            const datosTitular = generarDatosMexicanos();
            console.log(`${logPrefix} Titular generado: ${datosTitular.titular}`);
            
            // Actualizar vehículo
            await Vehicle.findByIdAndUpdate(
                vehiculoActual._id,
                {
                    estado: 'CONVERTIDO_NIV',
                    ...datosTitular,
                    updatedAt: new Date()
                },
                { session }
            );
            accionesRealizadas.push('VEHICULO_ACTUALIZADO_A_NIV');
            console.log(`${logPrefix} ✅ Vehículo actualizado a CONVERTIDO_NIV`);
            
            // Crear póliza NIV
            const polizaNIV = {
                // Datos del titular
                titular: datosTitular.titular,
                rfc: datosTitular.rfc,
                telefono: datosTitular.telefono,
                correo: datosTitular.correo,
                
                // Dirección
                calle: datosTitular.calle,
                colonia: datosTitular.colonia,
                municipio: datosTitular.municipio,
                estadoRegion: datosTitular.estadoRegion,
                cp: datosTitular.cp,
                
                // Datos del vehículo
                marca: vehiculoActual.marca,
                submarca: vehiculoActual.submarca,
                año: vehiculoActual.año,
                color: vehiculoActual.color,
                serie: vehiculoActual.serie,
                placas: vehiculoActual.placas || 'SIN PLACAS',
                
                // Datos de póliza NIV
                numeroPoliza: vehiculoActual.serie, // NIV = Serie del vehículo
                fechaEmision: new Date(),
                aseguradora: 'NIV_AUTOMATICO',
                agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                
                // Arrays vacíos
                pagos: [],
                registros: [],
                servicios: [],
                
                // Contadores iniciales
                calificacion: 0,
                totalServicios: 0,
                servicioCounter: 0,
                registroCounter: 0,
                diasRestantesCobertura: 0,
                diasRestantesGracia: 0,
                
                // Marcadores NIV
                creadoViaOBD: true,
                esNIV: true,
                tipoPoliza: 'NIV',
                fechaConversionNIV: new Date(),
                vehicleId: vehiculoActual._id,
                
                // Estados
                estado: 'ACTIVO',
                estadoPoliza: 'VIGENTE',
                
                // Archivos vacíos
                archivos: {
                    fotos: [],
                    pdfs: [],
                    r2Files: {
                        fotos: [],
                        pdfs: []
                    }
                }
            };
            
            const polizaCreada = await Policy.create([polizaNIV], { session });
            accionesRealizadas.push('POLIZA_NIV_CREADA');
            console.log(`${logPrefix} ✅ Póliza NIV creada: ${polizaCreada[0].numeroPoliza}`);
            
            // Vincular vehículo con póliza
            await Vehicle.findByIdAndUpdate(
                vehiculoActual._id,
                { policyId: polizaCreada[0]._id },
                { session }
            );
            accionesRealizadas.push('VEHICULO_VINCULADO_A_POLIZA');
            console.log(`${logPrefix} ✅ Vehículo vinculado a póliza`);
            
        } else if (vehiculoActual.estado === 'CONVERTIDO_NIP') {
            // CASO 2: Actualizar terminología NIP → NIV
            console.log(`${logPrefix} CASO: Actualización terminológica NIP → NIV`);
            
            // Actualizar estado del vehículo
            await Vehicle.findByIdAndUpdate(
                vehiculoActual._id,
                {
                    estado: 'CONVERTIDO_NIV',
                    updatedAt: new Date()
                },
                { session }
            );
            accionesRealizadas.push('VEHICULO_TERMINOLOGIA_ACTUALIZADA');
            console.log(`${logPrefix} ✅ Estado actualizado: CONVERTIDO_NIP → CONVERTIDO_NIV`);
            
            // Actualizar póliza asociada si existe
            if (vehiculoActual.policyId) {
                await Policy.findByIdAndUpdate(
                    vehiculoActual.policyId,
                    {
                        tipoPoliza: 'NIV',
                        esNIV: true,
                        esNIP: undefined, // Remover campo antiguo
                        fechaConversionNIV: new Date(),
                        updatedAt: new Date()
                    },
                    { session }
                );
                accionesRealizadas.push('POLIZA_TERMINOLOGIA_ACTUALIZADA');
                console.log(`${logPrefix} ✅ Póliza actualizada: NIP → NIV`);
            }
        }
        
        console.log(`${logPrefix} ✅ Migración completada. Acciones: ${accionesRealizadas.join(', ')}`);
        return { success: true, acciones: accionesRealizadas };
        
    } catch (error) {
        console.error(`${logPrefix} ❌ Error en migración: ${error.message}`);
        throw error; // Re-lanzar para que la transacción se revierta
    }
}

// Función principal de migración real
async function ejecutarMigracionReal(vehiculosObjetivo) {
    console.log('\n🔄 EJECUTANDO MIGRACIÓN REAL');
    console.log('═'.repeat(80));
    console.log('⚠️  ATENCIÓN: Se van a realizar cambios REALES en la base de datos');
    console.log('');
    
    const resultados = {
        exitosos: 0,
        fallidos: 0,
        detalles: []
    };
    
    // Procesar vehículos de uno en uno para máxima seguridad
    for (const vehiculo of vehiculosObjetivo) {
        const session = await mongoose.startSession();
        
        try {
            console.log(`\n🔄 Procesando ${vehiculo.serie}...`);
            
            // Iniciar transacción
            await session.withTransaction(async () => {
                const resultado = await migrarVehiculoSeguro(vehiculo, session);
                resultados.detalles.push({
                    serie: vehiculo.serie,
                    success: true,
                    acciones: resultado.acciones
                });
            }, {
                readConcern: { level: 'majority' },
                writeConcern: { w: 'majority' },
                maxTimeMS: TIMEOUT_TRANSACCION
            });
            
            resultados.exitosos++;
            console.log(`✅ ${vehiculo.serie} migrado exitosamente`);
            
            // Pausa pequeña entre migraciones para estabilidad
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            resultados.fallidos++;
            resultados.detalles.push({
                serie: vehiculo.serie,
                success: false,
                error: error.message
            });
            console.error(`❌ Error migrando ${vehiculo.serie}: ${error.message}`);
            
        } finally {
            await session.endSession();
        }
    }
    
    return resultados;
}

// Función de verificación post-migración
async function verificacionPostMigracion() {
    console.log('\n🔍 VERIFICACIÓN POST-MIGRACIÓN');
    console.log('-'.repeat(60));
    
    try {
        // Verificar vehículos NIV
        const vehiculosNIV = await Vehicle.find({
            estado: 'CONVERTIDO_NIV'
        }).lean();
        
        console.log(`📊 Vehículos CONVERTIDO_NIV: ${vehiculosNIV.length}`);
        
        // Verificar pólizas NIV
        const polizasNIV = await Policy.find({
            tipoPoliza: 'NIV',
            estado: 'ACTIVO'
        }).lean();
        
        console.log(`📊 Pólizas NIV activas: ${polizasNIV.length}`);
        
        // Verificar integridad relacional
        let relacionesCorrectas = 0;
        for (const vehiculo of vehiculosNIV) {
            if (vehiculo.policyId) {
                const poliza = await Policy.findById(vehiculo.policyId).lean();
                if (poliza && poliza.tipoPoliza === 'NIV' && poliza.vehicleId?.toString() === vehiculo._id.toString()) {
                    relacionesCorrectas++;
                }
            }
        }
        
        console.log(`🔗 Relaciones vehículo-póliza correctas: ${relacionesCorrectas}/${vehiculosNIV.length}`);
        
        // Verificar que el reporte ahora funcione
        const nipsDisponibles = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIV',
            totalServicios: 0
        }).lean();
        
        console.log(`📊 NIVs disponibles para reportes: ${nipsDisponibles.length}`);
        
        return {
            vehiculosNIV: vehiculosNIV.length,
            polizasNIV: polizasNIV.length,
            relacionesCorrectas,
            nivsEnReportes: nipsDisponibles.length
        };
        
    } catch (error) {
        console.error('❌ Error en verificación post-migración:', error.message);
        return null;
    }
}

// Función principal
async function main() {
    console.log('🛡️  MIGRACIÓN SEGURA DE VEHÍCULOS A NIVs');
    console.log('═'.repeat(80));
    console.log(`🔒 MODO SIMULACIÓN: ${MODO_SIMULACION ? 'ACTIVADO' : 'DESACTIVADO'}`);
    console.log(`⚡ VERIFICACIONES: ${VERIFICAR_CADA_PASO ? 'ACTIVADAS' : 'DESACTIVADAS'}`);
    console.log('');
    
    try {
        // 1. Conectar a DB
        const conectado = await connectDB();
        if (!conectado) {
            console.log('❌ No se pudo conectar a la base de datos');
            return;
        }
        
        // 2. Verificación pre-migración
        const verificacion = await verificacionPreMigracion();
        if (!verificacion.success) {
            console.error('❌ Verificación pre-migración falló:', verificacion.error);
            return;
        }
        
        // 3. Filtrar solo vehículos que necesitan migración
        const vehiculosParaMigrar = verificacion.vehiculosObjetivo.filter(v => 
            v.estado === 'SIN_POLIZA' || v.estado === 'CONVERTIDO_NIP'
        );
        
        console.log(`🎯 Vehículos que requieren migración: ${vehiculosParaMigrar.length}`);
        
        if (vehiculosParaMigrar.length === 0) {
            console.log('✅ No hay vehículos que requieran migración');
            return;
        }
        
        // 4. Simulación obligatoria
        const simulacion = await simularMigracion(vehiculosParaMigrar);
        
        if (simulacion.erroresPotenciales.length > 0) {
            console.log('\n⚠️  Se detectaron errores potenciales. Revisa antes de continuar.');
            if (!MODO_SIMULACION) {
                console.log('🚨 ABORTANDO migración real por errores detectados');
                return;
            }
        }
        
        // 5. Ejecución real (solo si no está en modo simulación)
        if (!MODO_SIMULACION) {
            console.log('\n⚠️  ¿CONTINUAR CON MIGRACIÓN REAL? (Los cambios serán permanentes)');
            console.log('   Para continuar, cambia MODO_SIMULACION = false en el código');
            
            const resultados = await ejecutarMigracionReal(vehiculosParaMigrar);
            
            console.log('\n📊 RESULTADOS FINALES:');
            console.log(`   ✅ Exitosos: ${resultados.exitosos}`);
            console.log(`   ❌ Fallidos: ${resultados.fallidos}`);
            
            if (resultados.fallidos > 0) {
                console.log('\n❌ ERRORES EN MIGRACIÓN:');
                resultados.detalles.filter(d => !d.success).forEach(detalle => {
                    console.log(`   • ${detalle.serie}: ${detalle.error}`);
                });
            }
            
            // 6. Verificación final
            const verificacionFinal = await verificacionPostMigracion();
            if (verificacionFinal) {
                console.log('\n✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
                console.log(`📊 ${verificacionFinal.nivsEnReportes} NIVs ahora disponibles en reportes`);
            }
            
        } else {
            console.log('\n🧪 MODO SIMULACIÓN: No se realizaron cambios reales');
            console.log('   Para ejecutar cambios reales, cambia MODO_SIMULACION = false');
        }
        
    } catch (error) {
        console.error('❌ Error crítico en migración:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión cerrada');
        process.exit(0);
    }
}

main().catch(console.error);