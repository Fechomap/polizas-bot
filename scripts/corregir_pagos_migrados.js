#!/usr/bin/env node

// Script para corregir los pagos que fueron migrados incorrectamente
// Estos pagos eran originalmente válidos pero se marcaron como PLANIFICADOS por el cambio de esquema
const mongoose = require('mongoose');
require('dotenv').config();

// Configuración de conexión a MongoDB
const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb+srv://polizasUser:polizasUser1184@polizas.avt4g.mongodb.net/polizas?retryWrites=true&w=majority&appName=polizas';

// Lista EXACTA de expedientes afectados por la migración incorrecta
const expedientesAfectados = [
    'ILD050090000',
    'ILD085450000',
    '672328069',
    'M91-1-22-101496',
    'M91-1-22-101592',
    '3401-003320-00',
    '672881968',
    '673062006',
    '673596706',
    '673680302',
    '3401-003614-00',
    'ILD088820000',
    '3401-004134-00',
    '674113865',
    '674116793',
    '674115365',
    '674252119',
    'M91-1-22-102130',
    '674687629',
    'K945011997-1',
    'M91-1-22-102346',
    'K945012079-1',
    'K945012090-1',
    'K945012166-1',
    'K945012000-1',
    '674692033'
];

// Modelo de póliza
const policySchema = new mongoose.Schema(
    {
        numeroPoliza: { type: String, required: true, unique: true, trim: true },
        titular: { type: String, required: true, trim: true },
        aseguradora: { type: String, required: true, trim: true },
        pagos: [
            {
                monto: { type: Number, required: false },
                fechaPago: { type: Date, required: false },
                fechaRegistro: { type: Date, required: false },
                estado: {
                    type: String,
                    enum: ['REALIZADO', 'PLANIFICADO', 'PENDIENTE'],
                    default: 'REALIZADO'
                },
                concepto: { type: String, required: false },
                notas: { type: String, required: false },
                numeroRecibo: { type: String, required: false },
                metodoPago: { type: String, required: false }
            }
        ]
    },
    { timestamps: true }
);

const Policy = mongoose.model('Policy', policySchema);

async function corregirPagosMigrados(ejecutar = false) {
    try {
        console.log('🔧 CORRECCIÓN DE PAGOS MIGRADOS INCORRECTAMENTE');
        console.log('='.repeat(80));
        console.log('📅 Problema originado: 16 julio 2025, 15:46:59 (commit 80c2098)');
        console.log(`🎯 Expedientes a corregir: ${expedientesAfectados.length}`);

        if (ejecutar) {
            console.log('🚀 MODO EJECUCIÓN: Se realizarán cambios en la BD');
        } else {
            console.log('🔍 MODO SIMULACIÓN: Solo se mostrarán los cambios');
        }
        console.log('='.repeat(80));

        await mongoose.connect(mongoUri);
        console.log('✅ Conectado a MongoDB\n');

        const resultados = {
            expedientesAnalizados: 0,
            expedientesCorregidos: 0,
            pagosAnalizados: 0,
            pagosCorregidos: 0,
            pagosSinProblemas: 0,
            errores: []
        };

        for (const expediente of expedientesAfectados) {
            console.log(`\n🔍 ANALIZANDO: ${expediente}`);
            console.log('-'.repeat(60));

            const poliza = await Policy.findOne({ numeroPoliza: expediente });

            if (!poliza) {
                console.log('❌ NO ENCONTRADA en la base de datos');
                resultados.errores.push(`${expediente}: No encontrada`);
                continue;
            }

            resultados.expedientesAnalizados++;
            console.log(`✅ ENCONTRADA: ${poliza.titular} (${poliza.aseguradora})`);

            const numPagos = poliza.pagos?.length || 0;
            resultados.pagosAnalizados += numPagos;

            if (numPagos === 0) {
                console.log('⚪ Sin pagos para corregir');
                continue;
            }

            console.log(`💰 Analizando ${numPagos} pago(s):`);

            let pagosCorregidosEnEstaPoliza = 0;
            let polizaNecesitaGuardado = false;

            poliza.pagos.forEach((pago, index) => {
                console.log(`\n   PAGO #${index + 1}:`);
                console.log(`   💵 Monto: $${pago.monto || 0}`);
                console.log(
                    `   📅 Fecha pago: ${pago.fechaPago?.toLocaleDateString('es-MX') || 'Sin fecha'}`
                );
                console.log(
                    `   📝 Fecha registro: ${pago.fechaRegistro ? (isNaN(pago.fechaRegistro) ? 'Invalid Date' : pago.fechaRegistro.toLocaleDateString('es-MX')) : 'Sin fecha'}`
                );
                console.log(`   🏷️  Estado actual: ${pago.estado || 'Sin estado'}`);
                console.log(`   📄 Concepto: ${pago.concepto || 'Sin concepto'}`);

                // Identificar pagos que necesitan corrección
                const necesitaCorreccion =
                    // Pagos sin concepto que están como REALIZADO pero parecen automáticos
                    !pago.concepto &&
                    pago.estado === 'REALIZADO' &&
                    (isNaN(pago.fechaRegistro) || !pago.fechaRegistro) &&
                    pago.monto > 0; // Solo pagos con montos reales

                if (necesitaCorreccion) {
                    console.log('   🚨 NECESITA CORRECCIÓN: Pago migrado incorrectamente');

                    if (ejecutar) {
                        // CORRECCIÓN 1: Limpiar fechaRegistro inválida
                        if (isNaN(pago.fechaRegistro) || !pago.fechaRegistro) {
                            pago.fechaRegistro = new Date(); // Fecha actual como registro de corrección
                        }

                        // CORRECCIÓN 2: Agregar concepto explicativo
                        if (!pago.concepto) {
                            pago.concepto =
                                'Pago registrado por usuario - corregido tras migración de esquema';
                        }

                        // CORRECCIÓN 3: Agregar nota explicativa
                        pago.notas =
                            'Pago corregido: era válido pero se migró incorrectamente en commit 80c2098';

                        // MANTENER estado REALIZADO porque el usuario confirmó que estos pagos SÍ se realizaron
                        console.log(
                            '   ✅ CORREGIDO: Fechas y metadatos reparados, estado mantenido como REALIZADO'
                        );
                    } else {
                        console.log(
                            '   ✅ SE CORREGIRÍA: Reparar fechas y metadatos, mantener como REALIZADO'
                        );
                    }

                    pagosCorregidosEnEstaPoliza++;
                    polizaNecesitaGuardado = true;
                } else {
                    console.log('   ⚪ NO NECESITA CORRECCIÓN: Pago normal');
                    resultados.pagosSinProblemas++;
                }
            });

            if (pagosCorregidosEnEstaPoliza > 0) {
                resultados.pagosCorregidos += pagosCorregidosEnEstaPoliza;

                if (ejecutar && polizaNecesitaGuardado) {
                    await poliza.save();
                    console.log(
                        `💾 GUARDADO: ${pagosCorregidosEnEstaPoliza} pago(s) corregido(s) en ${expediente}`
                    );
                    resultados.expedientesCorregidos++;
                } else {
                    console.log(
                        `🔍 SIMULAR GUARDADO: ${pagosCorregidosEnEstaPoliza} pago(s) se corregirían en ${expediente}`
                    );
                }
            } else {
                console.log(`⚪ ${expediente}: Sin pagos que requieran corrección`);
            }
        }

        // REPORTE FINAL
        console.log('\n' + '='.repeat(80));
        console.log('📊 REPORTE FINAL DE CORRECCIÓN');
        console.log('='.repeat(80));
        console.log(`📋 Expedientes analizados: ${resultados.expedientesAnalizados}`);
        console.log(`✅ Expedientes corregidos: ${resultados.expedientesCorregidos}`);
        console.log(`💰 Pagos analizados: ${resultados.pagosAnalizados}`);
        console.log(`🔧 Pagos corregidos: ${resultados.pagosCorregidos}`);
        console.log(`⚪ Pagos sin problemas: ${resultados.pagosSinProblemas}`);
        console.log(`❌ Errores: ${resultados.errores.length}`);

        if (resultados.errores.length > 0) {
            console.log('\n❌ ERRORES ENCONTRADOS:');
            resultados.errores.forEach(error => console.log(`   - ${error}`));
        }

        if (ejecutar) {
            console.log('\n🎉 CORRECCIÓN COMPLETADA EXITOSAMENTE');
            console.log('================================');
            console.log('✅ Los pagos han sido corregidos');
            console.log('✅ Las fechas de registro han sido reparadas');
            console.log('✅ Se agregaron conceptos y notas explicativas');
            console.log('✅ Los pagos mantienen su estado REALIZADO (correcto)');
            console.log('\n💡 SIGUIENTE PASO:');
            console.log(
                '🔄 Ejecutar el cálculo de estados para actualizar el status de las pólizas'
            );
            console.log('   node scripts/calculoEstadosDB.js');
        } else {
            console.log('\n💡 PARA EJECUTAR LA CORRECCIÓN REAL:');
            console.log('====================================');
            console.log('node scripts/corregir_pagos_migrados.js --ejecutar');
        }

        return resultados;
    } catch (error) {
        console.error('❌ Error en corrección de pagos migrados:', error);
        return null;
    } finally {
        console.log('\n🔒 Cerrando conexión...');
        await mongoose.disconnect();
        console.log('✅ Desconectado de MongoDB');
    }
}

// Determinar modo según parámetro
const ejecutar = process.argv[2] === '--ejecutar';
corregirPagosMigrados(ejecutar);
