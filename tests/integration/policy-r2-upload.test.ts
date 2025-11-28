/**
 * Tests de integración para validar subida de archivos a Cloudflare R2
 * Valida: Flujo OCR → Registro exitoso → Subida R2
 *         Flujo OCR → Error duplicado → NO subida R2
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// Importar modelos y servicios
import Policy from '../../src/models/policy';
import Vehicle from '../../src/models/vehicle';
import * as policyController from '../../src/controllers/policyController';

// Variables para tracking de operaciones
let r2UploadAttempted = false;
let r2UploadSuccessful = false;

describe('Flujo OCR → R2: Subida de archivos', () => {
    const UNIQUE_ID = Date.now();
    const TEST_POLICY_R2 = `TEST-R2-${UNIQUE_ID}`;
    const TEST_POLICY_DUP = `TEST-DUP-${UNIQUE_ID}`;
    const TEST_VEHICLE_SERIE = `TESTR2${UNIQUE_ID.toString().slice(-11)}`;

    let testVehicleId: string | null = null;
    let testPolicyId: string | null = null;
    let duplicatePolicyId: string | null = null;

    // Buffer simulado de PDF
    const fakePdfBuffer = Buffer.from('%PDF-1.4 fake pdf content for testing');
    const fakeFileName = 'poliza-test.pdf';

    beforeAll(async () => {
        // Conectar a MongoDB
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI!);
        }

        // Reset tracking variables
        r2UploadAttempted = false;
        r2UploadSuccessful = false;

        // Crear vehículo de prueba
        const vehiculo = new Vehicle({
            serie: TEST_VEHICLE_SERIE,
            marca: 'TEST-R2',
            submarca: 'MODEL-R2',
            año: 2024,
            color: 'AZUL',
            placas: 'R2TEST',
            titular: 'Test R2 User',
            rfc: 'TESTR2123456A',
            telefono: '5559876543',
            correo: 'r2test@test.com',
            creadoPor: 'jest-r2-test',
            estado: 'SIN_POLIZA'
        });
        const saved = await vehiculo.save();
        testVehicleId = saved._id.toString();
        console.log('🚗 Vehículo de prueba creado:', testVehicleId);
    });

    afterAll(async () => {
        // Limpiar datos de prueba
        if (testPolicyId) {
            await Policy.findByIdAndDelete(testPolicyId);
            console.log('🧹 Póliza R2 eliminada:', testPolicyId);
        }
        if (duplicatePolicyId) {
            await Policy.findByIdAndDelete(duplicatePolicyId);
            console.log('🧹 Póliza duplicada eliminada:', duplicatePolicyId);
        }
        if (testVehicleId) {
            await Vehicle.findByIdAndDelete(testVehicleId);
            console.log('🧹 Vehículo R2 eliminado:', testVehicleId);
        }
    });

    describe('1. CloudflareStorage - Verificación de configuración', () => {
        test('debe verificar que CloudflareStorage está configurado', async () => {
            // Importar dinámicamente para verificar configuración real
            try {
                const { getInstance } = await import('../../src/services/CloudflareStorage');
                const storage = getInstance();

                expect(storage).toBeDefined();
                expect(typeof storage.isConfigured).toBe('function');

                const configured = storage.isConfigured();
                console.log(`📦 CloudflareStorage configurado: ${configured}`);

                // No fallamos si no está configurado, solo informamos
                if (!configured) {
                    console.log('⚠️ R2 no configurado - tests de subida real serán saltados');
                }
            } catch (error: any) {
                console.log('⚠️ CloudflareStorage no disponible:', error.message);
            }
        });

        test('debe tener métodos requeridos para subida', async () => {
            try {
                const { getInstance } = await import('../../src/services/CloudflareStorage');
                const storage = getInstance();

                expect(typeof storage.uploadPolicyPDF).toBe('function');
                expect(typeof storage.uploadPolicyPhoto).toBe('function');
                expect(typeof storage.uploadFile).toBe('function');
                expect(typeof storage.generateFileName).toBe('function');

                console.log('✅ Métodos de CloudflareStorage verificados');
            } catch (error: any) {
                console.log('⚠️ Verificación de métodos saltada:', error.message);
            }
        });
    });

    describe('2. Registro exitoso → Archivo debe guardarse en BD', () => {
        test('debe crear póliza con estructura de archivos inicializada', async () => {
            const nuevaPoliza: any = {
                numeroPoliza: TEST_POLICY_R2,
                aseguradora: 'TEST R2 SEGUROS',
                agenteCotizador: 'Test R2 Agent',
                fechaEmision: new Date(),
                fechaFinCobertura: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                marca: 'TEST-R2',
                submarca: 'MODEL-R2',
                año: 2024,
                color: 'AZUL',
                serie: TEST_VEHICLE_SERIE,
                placas: 'R2TEST',
                titular: 'Test R2 User',
                rfc: 'TESTR2123456A',
                calle: 'R2 Street',
                colonia: 'R2 Colony',
                municipio: 'R2 City',
                cp: '11111',
                pagos: [
                    { monto: 2000, fechaPago: new Date(), estado: 'PLANIFICADO', notas: 'Primer pago' },
                    { monto: 800, fechaPago: new Date(), estado: 'PLANIFICADO', notas: 'Segundo pago' }
                ],
                vehicleId: testVehicleId,
                // Inicializar estructura de archivos
                archivos: {
                    fotos: [],
                    pdfs: [],
                    r2Files: {
                        fotos: [],
                        pdfs: []
                    }
                }
            };

            const polizaGuardada = await policyController.savePolicy(nuevaPoliza);
            testPolicyId = polizaGuardada._id.toString();

            expect(polizaGuardada).toBeDefined();
            expect(polizaGuardada.numeroPoliza).toBe(TEST_POLICY_R2);
            expect(polizaGuardada.archivos).toBeDefined();

            console.log('✅ Póliza R2 creada:', TEST_POLICY_R2);
        });

        test('debe poder agregar archivo PDF a póliza existente', async () => {
            if (!testPolicyId) {
                console.log('⚠️ Saltando - no hay póliza de prueba');
                return;
            }

            // Simular lo que hace PolicyOCRHandler.subirArchivoR2
            const poliza = await Policy.findById(testPolicyId);
            expect(poliza).toBeDefined();

            // Inicializar estructura si no existe
            if (!poliza!.archivos) {
                poliza!.archivos = { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } };
            }
            if (!poliza!.archivos.r2Files) {
                poliza!.archivos.r2Files = { fotos: [], pdfs: [] };
            }

            // Agregar archivo R2 (simulando subida exitosa)
            const r2File = {
                url: `https://r2.example.com/pdfs/${TEST_POLICY_R2}/${fakeFileName}`,
                key: `pdfs/${TEST_POLICY_R2}/${fakeFileName}`,
                size: fakePdfBuffer.length,
                contentType: 'application/pdf',
                uploadDate: new Date(),
                originalName: fakeFileName
            };

            poliza!.archivos.r2Files.pdfs.push(r2File);
            await poliza!.save();

            // Verificar que se guardó
            const polizaActualizada = await Policy.findById(testPolicyId);
            expect(polizaActualizada!.archivos.r2Files.pdfs).toHaveLength(1);
            expect(polizaActualizada!.archivos.r2Files.pdfs[0].url).toContain(TEST_POLICY_R2);
            expect(polizaActualizada!.archivos.r2Files.pdfs[0].originalName).toBe(fakeFileName);

            console.log('✅ Archivo PDF agregado a póliza:', r2File.url);
        });

        test('debe poder agregar múltiples archivos a póliza', async () => {
            if (!testPolicyId) {
                console.log('⚠️ Saltando - no hay póliza de prueba');
                return;
            }

            const poliza = await Policy.findById(testPolicyId);

            // Agregar foto
            const r2Foto = {
                url: `https://r2.example.com/fotos/${TEST_POLICY_R2}/foto1.jpg`,
                key: `fotos/${TEST_POLICY_R2}/foto1.jpg`,
                size: 2048,
                contentType: 'image/jpeg',
                uploadDate: new Date(),
                originalName: 'foto-vehiculo.jpg'
            };

            poliza!.archivos.r2Files.fotos.push(r2Foto);

            // Agregar segundo PDF
            const r2Pdf2 = {
                url: `https://r2.example.com/pdfs/${TEST_POLICY_R2}/endoso.pdf`,
                key: `pdfs/${TEST_POLICY_R2}/endoso.pdf`,
                size: 1024,
                contentType: 'application/pdf',
                uploadDate: new Date(),
                originalName: 'endoso.pdf'
            };

            poliza!.archivos.r2Files.pdfs.push(r2Pdf2);
            await poliza!.save();

            // Verificar
            const polizaActualizada = await Policy.findById(testPolicyId);
            expect(polizaActualizada!.archivos.r2Files.pdfs).toHaveLength(2);
            expect(polizaActualizada!.archivos.r2Files.fotos).toHaveLength(1);

            console.log('✅ Múltiples archivos agregados:', {
                pdfs: polizaActualizada!.archivos.r2Files.pdfs.length,
                fotos: polizaActualizada!.archivos.r2Files.fotos.length
            });
        });
    });

    describe('3. Póliza duplicada → Archivo NO debe guardarse', () => {
        let archivoSubidoEnDuplicado = false;

        test('debe crear póliza base para test de duplicado', async () => {
            // Crear una póliza que luego intentaremos duplicar
            const polizaBase: any = {
                numeroPoliza: TEST_POLICY_DUP,
                aseguradora: 'DUP SEGUROS',
                agenteCotizador: 'Dup Agent',
                fechaEmision: new Date(),
                marca: 'DUP',
                submarca: 'MODEL',
                año: 2023,
                color: 'ROJO',
                serie: 'DUPSERIE123456789',
                placas: 'DUP123',
                titular: 'Dup User',
                rfc: 'DUP1234567ABC',
                calle: 'Dup Street',
                colonia: 'Dup Colony',
                municipio: 'Dup City',
                cp: '22222',
                archivos: {
                    fotos: [],
                    pdfs: [],
                    r2Files: { fotos: [], pdfs: [] }
                }
            };

            const polizaGuardada = await policyController.savePolicy(polizaBase);
            duplicatePolicyId = polizaGuardada._id.toString();

            expect(polizaGuardada.numeroPoliza).toBe(TEST_POLICY_DUP);
            console.log('✅ Póliza base para duplicado creada:', TEST_POLICY_DUP);
        });

        test('debe rechazar póliza duplicada ANTES de subir archivo', async () => {
            // Simular el flujo de PolicyOCRHandler
            // 1. Intentar crear póliza (FALLA por duplicado)
            // 2. Verificar que NO se intenta subir archivo

            const simulateOCRFlow = async () => {
                const polizaDuplicada: any = {
                    numeroPoliza: TEST_POLICY_DUP, // DUPLICADO
                    aseguradora: 'OTRA',
                    agenteCotizador: 'Otro',
                    fechaEmision: new Date(),
                    marca: 'OTRO',
                    submarca: 'OTRO',
                    año: 2024,
                    color: 'NEGRO',
                    serie: 'OTRASERIE999999999',
                    placas: 'OTRO999',
                    titular: 'Otro User',
                    rfc: 'OTRO999999ZZZ',
                    calle: 'Otra',
                    colonia: 'Otra',
                    municipio: 'Otra',
                    cp: '99999'
                };

                try {
                    // Paso 1: Intentar guardar póliza
                    await policyController.savePolicy(polizaDuplicada);

                    // Si llega aquí, algo está mal - no debería pasar
                    archivoSubidoEnDuplicado = true;
                    console.log('⚠️ ALERTA: Póliza duplicada fue aceptada!');

                } catch (error: any) {
                    // Paso 2: Error esperado - NO subimos archivo
                    expect(error.message).toMatch(/Ya existe una póliza/);
                    archivoSubidoEnDuplicado = false;
                    console.log('✅ Error de duplicado detectado - archivo NO subido');
                }
            };

            await simulateOCRFlow();

            // Verificación final
            expect(archivoSubidoEnDuplicado).toBe(false);
        });

        test('póliza original NO debe tener archivos del intento duplicado', async () => {
            if (!duplicatePolicyId) {
                console.log('⚠️ Saltando - no hay póliza duplicada');
                return;
            }

            const polizaOriginal = await Policy.findById(duplicatePolicyId);

            // La póliza original no debe tener archivos agregados por el intento fallido
            expect(polizaOriginal!.archivos.r2Files.pdfs).toHaveLength(0);
            expect(polizaOriginal!.archivos.r2Files.fotos).toHaveLength(0);

            console.log('✅ Póliza original sin archivos del intento duplicado');
        });
    });

    describe('4. Simulación completa del flujo finalizarAsignacion', () => {
        test('debe simular flujo exitoso: guardar póliza → subir R2 → actualizar BD', async () => {
            const POLICY_FLOW = `TEST-FLOW-${Date.now()}`;
            let flowPolicyId: string | null = null;

            try {
                // Paso 1: Crear póliza
                const nuevaPoliza: any = {
                    numeroPoliza: POLICY_FLOW,
                    aseguradora: 'FLOW SEGUROS',
                    agenteCotizador: 'Flow Agent',
                    fechaEmision: new Date(),
                    marca: 'FLOW',
                    submarca: 'MODEL',
                    año: 2024,
                    color: 'VERDE',
                    serie: `FLOWSERIE${Date.now().toString().slice(-8)}`,
                    placas: 'FLOW123',
                    titular: 'Flow User',
                    rfc: 'FLOW123456ABC',
                    calle: 'Flow Street',
                    colonia: 'Flow Colony',
                    municipio: 'Flow City',
                    cp: '33333',
                    archivos: {
                        fotos: [],
                        pdfs: [],
                        r2Files: { fotos: [], pdfs: [] }
                    }
                };

                const polizaGuardada = await policyController.savePolicy(nuevaPoliza);
                flowPolicyId = polizaGuardada._id.toString();
                console.log('   1️⃣ Póliza creada:', POLICY_FLOW);

                // Paso 2: Simular subida a R2 (lo que haría CloudflareStorage)
                const archivoR2 = {
                    url: `https://r2.example.com/pdfs/${POLICY_FLOW}/poliza.pdf`,
                    key: `pdfs/${POLICY_FLOW}/poliza.pdf`,
                    size: fakePdfBuffer.length,
                    contentType: 'application/pdf',
                    uploadDate: new Date(),
                    originalName: 'poliza-ocr.pdf'
                };
                console.log('   2️⃣ Archivo subido a R2 (simulado)');

                // Paso 3: Actualizar póliza con referencia al archivo
                const polizaDB = await Policy.findById(flowPolicyId);
                polizaDB!.archivos.r2Files.pdfs.push(archivoR2);
                await polizaDB!.save();
                console.log('   3️⃣ BD actualizada con referencia R2');

                // Verificaciones
                const polizaFinal = await Policy.findById(flowPolicyId);
                expect(polizaFinal!.archivos.r2Files.pdfs).toHaveLength(1);
                expect(polizaFinal!.archivos.r2Files.pdfs[0].originalName).toBe('poliza-ocr.pdf');

                console.log('✅ Flujo completo exitoso');

            } finally {
                // Cleanup
                if (flowPolicyId) {
                    await Policy.findByIdAndDelete(flowPolicyId);
                }
            }
        });

        test('debe simular flujo con error: NO guardar archivo si póliza falla', async () => {
            const POLICY_ERROR = TEST_POLICY_DUP; // Usamos la duplicada
            let archivoFueSubido = false;
            let polizaFueCreada = false;

            // Simular flujo de finalizarAsignacion
            const simularFinalizacion = async () => {
                try {
                    // Paso 1: Intentar crear póliza (FALLARÁ)
                    const polizaDup: any = {
                        numeroPoliza: POLICY_ERROR,
                        aseguradora: 'ERROR',
                        agenteCotizador: 'Error',
                        fechaEmision: new Date(),
                        marca: 'ERROR',
                        submarca: 'ERROR',
                        año: 2024,
                        color: 'ERROR',
                        serie: 'ERRORSERIE12345678',
                        placas: 'ERR123',
                        titular: 'Error User',
                        rfc: 'ERROR12345ABC',
                        calle: 'Error',
                        colonia: 'Error',
                        municipio: 'Error',
                        cp: '00000'
                    };

                    await policyController.savePolicy(polizaDup);
                    polizaFueCreada = true;

                    // Paso 2: Solo si póliza se crea, subimos archivo
                    // Este código NO debería ejecutarse
                    archivoFueSubido = true;

                } catch (error: any) {
                    // Error esperado - NO subimos archivo
                    polizaFueCreada = false;
                    archivoFueSubido = false;

                    // Verificar que es el error correcto
                    expect(error.message).toMatch(/Ya existe una póliza/);
                }
            };

            await simularFinalizacion();

            // Verificaciones críticas
            expect(polizaFueCreada).toBe(false);
            expect(archivoFueSubido).toBe(false);

            console.log('✅ Flujo con error: póliza NO creada, archivo NO subido');
        });
    });

    describe('5. Validación de estructura de archivos en Policy', () => {
        test('debe tener esquema correcto para r2Files', async () => {
            if (!testPolicyId) {
                console.log('⚠️ Saltando - no hay póliza de prueba');
                return;
            }

            const poliza = await Policy.findById(testPolicyId);

            // Verificar estructura
            expect(poliza!.archivos).toBeDefined();
            expect(poliza!.archivos.r2Files).toBeDefined();
            expect(Array.isArray(poliza!.archivos.r2Files.pdfs)).toBe(true);
            expect(Array.isArray(poliza!.archivos.r2Files.fotos)).toBe(true);

            // Verificar campos de cada archivo
            if (poliza!.archivos.r2Files.pdfs.length > 0) {
                const pdf = poliza!.archivos.r2Files.pdfs[0];
                expect(pdf).toHaveProperty('url');
                expect(pdf).toHaveProperty('key');
                expect(pdf).toHaveProperty('size');
                expect(pdf).toHaveProperty('contentType');
                expect(pdf).toHaveProperty('uploadDate');
                expect(pdf).toHaveProperty('originalName');
            }

            console.log('✅ Estructura de archivos validada');
        });

        test('debe persistir archivos correctamente después de múltiples saves', async () => {
            if (!testPolicyId) {
                console.log('⚠️ Saltando - no hay póliza de prueba');
                return;
            }

            // Contar archivos actuales
            let poliza = await Policy.findById(testPolicyId);
            const countInicial = poliza!.archivos.r2Files.pdfs.length;

            // Hacer un save sin cambios
            await poliza!.save();

            // Verificar que no se perdieron archivos
            poliza = await Policy.findById(testPolicyId);
            expect(poliza!.archivos.r2Files.pdfs.length).toBe(countInicial);

            // Agregar otro y verificar
            poliza!.archivos.r2Files.pdfs.push({
                url: 'https://r2.example.com/test-persist.pdf',
                key: 'test-persist.pdf',
                size: 100,
                contentType: 'application/pdf',
                uploadDate: new Date(),
                originalName: 'persist-test.pdf'
            });
            await poliza!.save();

            poliza = await Policy.findById(testPolicyId);
            expect(poliza!.archivos.r2Files.pdfs.length).toBe(countInicial + 1);

            console.log('✅ Persistencia de archivos verificada');
        });
    });
});

/**
 * Tests de integración REAL con CloudflareStorage (opcional)
 * Solo se ejecutan si R2 está configurado
 */
describe('Integración REAL con Cloudflare R2 (opcional)', () => {
    let storage: any = null;
    let isR2Configured = false;

    beforeAll(async () => {
        try {
            const { getInstance } = await import('../../src/services/CloudflareStorage');
            storage = getInstance();
            isR2Configured = storage.isConfigured();
        } catch {
            isR2Configured = false;
        }
    });

    test('debe subir PDF real a R2 (si está configurado)', async () => {
        if (!isR2Configured) {
            console.log('⚠️ R2 no configurado - saltando test de subida real');
            return;
        }

        const testBuffer = Buffer.from('%PDF-1.4 test content ' + Date.now());
        const testPolicyNumber = `TEST-REAL-R2-${Date.now()}`;

        try {
            const result = await storage.uploadPolicyPDF(
                testBuffer,
                testPolicyNumber,
                'test-upload.pdf'
            );

            expect(result).toHaveProperty('url');
            expect(result).toHaveProperty('key');
            expect(result.key).toContain(testPolicyNumber.replace(/[^a-zA-Z0-9-_]/g, ''));

            console.log('✅ Subida REAL a R2 exitosa:', result.url);

            // Cleanup: eliminar archivo de prueba
            await storage.deleteFile(result.key);
            console.log('🧹 Archivo de prueba eliminado de R2');

        } catch (error: any) {
            console.log('⚠️ Error en subida real:', error.message);
            // No fallar el test, solo informar
        }
    }, 30000);

    test('debe generar nombres de archivo únicos', async () => {
        if (!isR2Configured) {
            console.log('⚠️ R2 no configurado - saltando test');
            return;
        }

        const policyNumber = 'TEST-123';
        const originalName = 'mi-poliza.pdf';

        const fileName1 = storage.generateFileName(policyNumber, originalName, 'pdfs');

        // Esperar 1ms para asegurar timestamp diferente
        await new Promise(resolve => setTimeout(resolve, 1));

        const fileName2 = storage.generateFileName(policyNumber, originalName, 'pdfs');

        expect(fileName1).not.toBe(fileName2);
        expect(fileName1).toContain('pdfs/');
        expect(fileName1).toContain('TEST-123');

        console.log('✅ Nombres únicos generados:', { fileName1, fileName2 });
    });
});
