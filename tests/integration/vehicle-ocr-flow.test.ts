/**
 * Tests de integración para el flujo completo de registro de vehículo con OCR
 * Incluye:
 * - Tests unitarios con mocks (rápidos)
 * - Tests REALES con API de Mistral (requieren MISTRAL_API_KEY)
 *
 * Flujo: Foto tarjeta circulación → OCR → Confirmar datos → Fotos vehículo → Registro
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { VehicleOCRHandler, ESTADOS_OCR_VEHICULO, registrosOCR } from '../../src/comandos/comandos/VehicleOCRHandler';
import { getInstance as getMistralVision } from '../../src/services/MistralVisionService';
import { getInstance as getPlacasValidator } from '../../src/services/PlacasValidator';
import * as fs from 'fs';
import * as path from 'path';

// Guardar fetch original
const originalFetch = global.fetch;

// Verificar que tenemos API key para tests reales
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const SKIP_REAL_API_TESTS = !MISTRAL_API_KEY;

if (SKIP_REAL_API_TESTS) {
    console.warn('⚠️ MISTRAL_API_KEY no configurada - tests REALES serán saltados');
}

// Cargar imagen de prueba real
const TEST_IMAGE_PATH = path.join(__dirname, '../fixtures/tarjeta-circulacion-sample.jpeg');
const hasTestImage = fs.existsSync(TEST_IMAGE_PATH);

// ==========================================
// MOCK RESPONSES para tests unitarios
// ==========================================
const mockOCRResponse = {
    pages: [{
        markdown: `TARJETA DE CIRCULACIÓN
PROPIETARIO: EDGAR CARRIZALES SANCHEZ
RFC: CASE921121
MARCA: NISSAN
SUBMARCA: NP300
MODELO: 2015
SERIE: 3N6DD25X8FK038128
PLACA: LG94159
ESTADO DE MEXICO`
    }]
};

const mockPixtralResponse = {
    choices: [{
        message: {
            content: JSON.stringify({
                serie: '3N6DD25X8FK038128',
                marca: 'NISSAN',
                submarca: 'NP300',
                año: 2015,
                color: null,
                placas: 'LG94159',
                titular: 'EDGAR CARRIZALES SANCHEZ',
                rfc: 'CASE921121'
            })
        }
    }]
};

const mockPlacasDetectionResponse = {
    choices: [{
        message: {
            content: JSON.stringify({
                placas_detectadas: 'LG94159',
                confianza: 95,
                visible: true
            })
        }
    }]
};

// ==========================================
// HELPERS
// ==========================================

// Mock de Telegram bot
const createMockBot = () => {
    const sentMessages: any[] = [];
    return {
        telegram: {
            sendMessage: jest.fn().mockImplementation((chatId, text, options) => {
                sentMessages.push({ chatId, text, options, type: 'message' });
                return Promise.resolve({ message_id: Math.floor(Math.random() * 10000) });
            }),
            getFile: jest.fn().mockResolvedValue({
                file_path: 'photos/test.jpg'
            }),
            getFileLink: jest.fn().mockResolvedValue({
                href: 'https://api.telegram.org/file/bot123/photos/test.jpg'
            }),
            editMessageText: jest.fn().mockResolvedValue(true),
            deleteMessage: jest.fn().mockResolvedValue(true)
        },
        sentMessages
    };
};

// Factory para crear mensajes mock completos
const createMockPhotoMessage = (chatId: number, userId: number, threadId: number | null = null) => ({
    message_id: Math.floor(Math.random() * 10000),
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'private' as const },
    from: { id: userId, is_bot: false, first_name: 'Test' },
    message_thread_id: threadId ?? undefined,
    photo: [
        { file_id: 'photo_small', file_unique_id: 'unique1', width: 90, height: 90 },
        { file_id: 'photo_medium', file_unique_id: 'unique2', width: 320, height: 320 },
        { file_id: 'photo_large', file_unique_id: 'unique3', width: 800, height: 600, file_size: 50000 }
    ]
});

const createMockTextMessage = (chatId: number, userId: number, text: string, threadId: number | null = null) => ({
    message_id: Math.floor(Math.random() * 10000),
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'private' as const },
    from: { id: userId, is_bot: false, first_name: 'Test' },
    message_thread_id: threadId ?? undefined,
    text
});

// Datos esperados de la imagen de prueba (tarjeta de circulación real)
const DATOS_ESPERADOS = {
    serie: '3N6DD25X8FK038128',
    marca: 'NISSAN',
    submarca: 'NP300',
    año: 2015,
    placas: 'LG94159',
    titular: 'EDGAR CARRIZALES SANCHEZ',
    rfc: 'CASE921121'
};

// ==========================================
// TESTS CON MOCKS (Unitarios - Rápidos)
// ==========================================
describe('VehicleOCRHandler - Tests Unitarios', () => {
    let mockBot: ReturnType<typeof createMockBot>;
    const testChatId = 123456789;
    const testUserId = 987654321;
    const testThreadId = null;

    beforeAll(() => {
        process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'test-api-key';
    });

    beforeEach(() => {
        mockBot = createMockBot();
        registrosOCR.clear();
        jest.clearAllMocks();

        // Mock fetch para tests unitarios
        (global as any).fetch = jest.fn().mockImplementation((url: string, options?: any) => {
            // Descarga de imagen de Telegram
            if (url.includes('api.telegram.org/file')) {
                return Promise.resolve({
                    ok: true,
                    arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000))
                });
            }

            const body = options?.body ? JSON.parse(options.body) : {};

            // OCR endpoint
            if (url.includes('/ocr')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockOCRResponse)
                });
            }

            // Chat completions (Pixtral)
            if (url.includes('/chat/completions')) {
                const content = body.messages?.[0]?.content;
                const textContent = Array.isArray(content) ? content[0]?.text : content;

                // Detección de placas
                if (textContent?.includes('PLACAS VEHICULARES')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockPlacasDetectionResponse)
                    });
                }
                // Parsing de OCR
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockPixtralResponse)
                });
            }

            return Promise.reject(new Error(`Unknown endpoint: ${url}`));
        });
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('Inicio del flujo OCR', () => {
        it('debe iniciar el flujo y solicitar foto de tarjeta', async () => {
            const result = await VehicleOCRHandler.iniciarRegistroOCR(
                mockBot as any,
                testChatId,
                testUserId,
                testThreadId
            );

            expect(result).toBe(true);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalled();

            const mensaje = mockBot.sentMessages[0];
            expect(mensaje.text).toContain('REGISTRO DE AUTO CON OCR');

            expect(VehicleOCRHandler.tieneRegistroEnProceso(testUserId, testChatId, testThreadId)).toBe(true);
            const registro = VehicleOCRHandler.obtenerRegistro(String(testUserId), testChatId, testThreadId);
            expect(registro?.estado).toBe(ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA);
        });
    });

    describe('Cancelación del flujo', () => {
        it('debe permitir cancelar el registro', async () => {
            await VehicleOCRHandler.iniciarRegistroOCR(mockBot as any, testChatId, testUserId, testThreadId);
            expect(VehicleOCRHandler.tieneRegistroEnProceso(testUserId, testChatId, testThreadId)).toBe(true);

            VehicleOCRHandler.cancelarRegistro(testUserId, testChatId, testThreadId);
            expect(VehicleOCRHandler.tieneRegistroEnProceso(testUserId, testChatId, testThreadId)).toBe(false);
        });
    });
});

describe('PlacasValidator - Tests Unitarios', () => {
    it('debe normalizar placas correctamente', () => {
        const validator = getPlacasValidator();

        expect(validator.normalizar('LG-94-159')).toBe('LG94159');
        expect(validator.normalizar('lg 94 159')).toBe('LG94159');
        expect(validator.normalizar('  LG94159  ')).toBe('LG94159');
    });

    it('debe calcular similitud correctamente', () => {
        const validator = getPlacasValidator();

        // 100% similitud
        expect(validator.calcularSimilitud('LG94159', 'LG94159')).toBe(100);

        // Alta similitud (1 caracter diferente)
        const sim = validator.calcularSimilitud('LG94159', 'LG94158');
        expect(sim).toBeGreaterThan(80);

        // Baja similitud
        const lowSim = validator.calcularSimilitud('LG94159', 'XXXXXX');
        expect(lowSim).toBeLessThan(50);
    });
});

// ==========================================
// TESTS REALES CON API DE MISTRAL
// ==========================================
describe('🚀 TESTS REALES - API de Mistral OCR', () => {
    // Aumentar timeout para llamadas a API real
    jest.setTimeout(60000);

    const skipMessage = SKIP_REAL_API_TESTS
        ? '⚠️ Saltado: MISTRAL_API_KEY no configurada'
        : (hasTestImage ? '' : '⚠️ Saltado: Imagen de prueba no encontrada');

    const shouldSkip = SKIP_REAL_API_TESTS || !hasTestImage;

    beforeAll(() => {
        if (shouldSkip) {
            console.log(skipMessage);
        } else {
            console.log('✅ Ejecutando tests REALES con API de Mistral');
            console.log(`   Imagen: ${TEST_IMAGE_PATH}`);
        }
    });

    (shouldSkip ? describe.skip : describe)('MistralVisionService - Extracción REAL de datos', () => {
        it('debe extraer datos REALES de la tarjeta de circulación', async () => {
            console.log('\n📸 Cargando imagen de prueba...');
            const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
            console.log(`   Tamaño: ${imageBuffer.length} bytes`);

            const service = getMistralVision();

            if (!service.isConfigured()) {
                throw new Error('MistralVision no está configurado');
            }

            console.log('\n🔄 Llamando a API de Mistral OCR...');
            const startTime = Date.now();

            const result = await service.extraerDatosTarjetaCirculacion(imageBuffer, 'image/jpeg');

            const elapsed = Date.now() - startTime;
            console.log(`⏱️ Tiempo de respuesta: ${elapsed}ms`);

            expect(result.success).toBe(true);
            expect(result.datos).not.toBeNull();

            console.log('\n📋 DATOS EXTRAÍDOS POR OCR:');
            console.log('─'.repeat(50));
            console.log(`   Serie (NIV): ${result.datos?.serie}`);
            console.log(`   Marca: ${result.datos?.marca}`);
            console.log(`   Modelo: ${result.datos?.submarca}`);
            console.log(`   Año: ${result.datos?.año}`);
            console.log(`   Color: ${result.datos?.color || 'NO DETECTADO'}`);
            console.log(`   Placas: ${result.datos?.placas}`);
            console.log(`   Titular: ${result.datos?.titular}`);
            console.log(`   RFC: ${result.datos?.rfc}`);
            console.log(`   Confianza: ${result.datos?.confianza}%`);
            console.log('─'.repeat(50));

            // Verificar datos críticos
            const datos = result.datos!;

            // Serie/VIN debe ser correcto
            expect(datos.serie?.toUpperCase()).toContain('3N6DD25X8FK038128'.substring(0, 10));

            // Marca debe ser NISSAN
            expect(datos.marca?.toUpperCase()).toBe('NISSAN');

            // Submarca debe ser NP300 o similar
            expect(datos.submarca?.toUpperCase()).toContain('NP300');

            // Año debe ser 2015
            expect(datos.año).toBe(2015);

            // Placas deben coincidir
            expect(datos.placas?.replace(/[-\s]/g, '').toUpperCase()).toBe('LG94159');

            console.log('\n✅ VALIDACIÓN DE DATOS EXITOSA');
        });

        it('debe detectar campos faltantes correctamente', async () => {
            const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
            const service = getMistralVision();

            const result = await service.extraerDatosTarjetaCirculacion(imageBuffer, 'image/jpeg');

            expect(result.success).toBe(true);

            // El color NO viene en la tarjeta de circulación
            // Por lo tanto debe estar en datosFaltantes o ser null
            if (result.datos?.color === null) {
                expect(result.datos?.datosFaltantes).toContain('color');
            }

            console.log('\n📊 Análisis de campos:');
            console.log(`   Encontrados: ${result.datos?.datosEncontrados.join(', ')}`);
            console.log(`   Faltantes: ${result.datos?.datosFaltantes.join(', ') || 'ninguno'}`);
        });
    });

    (shouldSkip ? describe.skip : describe)('Flujo Completo E2E con API REAL', () => {
        let mockBot: ReturnType<typeof createMockBot>;
        const testChatId = 999999999;
        const testUserId = 888888888;

        beforeEach(() => {
            mockBot = createMockBot();
            registrosOCR.clear();

            // Para este test, NO mockeamos fetch de Mistral
            // Solo mockeamos las llamadas a Telegram
            const realFetch = global.fetch;
            (global as any).fetch = jest.fn().mockImplementation((url: string, options?: any) => {
                // Solo mockear Telegram
                if (url.includes('api.telegram.org')) {
                    return Promise.resolve({
                        ok: true,
                        arrayBuffer: () => Promise.resolve(fs.readFileSync(TEST_IMAGE_PATH).buffer)
                    });
                }
                // Dejar pasar las llamadas reales a Mistral
                return realFetch(url, options);
            });
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        it('debe procesar imagen REAL y extraer datos correctos', async () => {
            console.log('\n🚀 INICIANDO FLUJO REAL E2E...\n');

            // Iniciar flujo
            await VehicleOCRHandler.iniciarRegistroOCR(mockBot as any, testChatId, testUserId, null);

            let registro = VehicleOCRHandler.obtenerRegistro(String(testUserId), testChatId, null);
            expect(registro?.estado).toBe(ESTADOS_OCR_VEHICULO.ESPERANDO_TARJETA);
            console.log('1️⃣ Flujo iniciado - Estado: ESPERANDO_TARJETA');

            // Cargar imagen real y simular mensaje
            const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

            // Mock getFileLink para devolver datos de imagen real
            mockBot.telegram.getFileLink = jest.fn().mockResolvedValue({
                href: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
            });

            // Simular fetch que devuelve la imagen real para Telegram
            // pero deja pasar las llamadas a Mistral
            const realFetch = originalFetch;
            (global as any).fetch = jest.fn().mockImplementation(async (url: string, options?: any) => {
                if (url.includes('api.telegram.org') || url.startsWith('data:')) {
                    return {
                        ok: true,
                        arrayBuffer: () => Promise.resolve(imageBuffer.buffer.slice(
                            imageBuffer.byteOffset,
                            imageBuffer.byteOffset + imageBuffer.byteLength
                        ))
                    };
                }
                // Llamadas reales a Mistral
                return realFetch(url, options);
            });

            console.log('2️⃣ Procesando imagen con OCR REAL de Mistral...');
            const mensajeFoto = createMockPhotoMessage(testChatId, testUserId, null);

            const startTime = Date.now();
            const procesado = await VehicleOCRHandler.procesarImagen(
                mockBot as any,
                mensajeFoto as any,
                testUserId
            );
            const elapsed = Date.now() - startTime;

            console.log(`   ⏱️ Tiempo OCR: ${elapsed}ms`);
            expect(procesado).toBe(true);

            registro = VehicleOCRHandler.obtenerRegistro(String(testUserId), testChatId, null);

            console.log('\n📋 DATOS EXTRAÍDOS:');
            console.log('─'.repeat(50));
            console.log(`   Serie: ${registro?.datosOCR.serie}`);
            console.log(`   Marca: ${registro?.datosOCR.marca}`);
            console.log(`   Modelo: ${registro?.datosOCR.submarca}`);
            console.log(`   Año: ${registro?.datosOCR.año}`);
            console.log(`   Placas: ${registro?.datosOCR.placas}`);
            console.log(`   Color: ${registro?.datosOCR.color || 'NO DETECTADO'}`);
            console.log(`   Confianza: ${registro?.datosOCR.confianza}%`);
            console.log('─'.repeat(50));

            // Verificar estado - puede ser CONFIRMANDO_DATOS o ESPERANDO_DATO_FALTANTE si falta color
            const estadosValidos = [
                ESTADOS_OCR_VEHICULO.CONFIRMANDO_DATOS,
                ESTADOS_OCR_VEHICULO.ESPERANDO_DATO_FALTANTE
            ];
            expect(estadosValidos).toContain(registro?.estado);

            // Verificar datos extraídos
            expect(registro?.datosOCR.marca?.toUpperCase()).toBe('NISSAN');
            expect(registro?.datosOCR.año).toBe(2015);

            console.log(`\n✅ FLUJO E2E REAL COMPLETADO EXITOSAMENTE (Estado: ${registro?.estado})`);
        });
    });
});

// ==========================================
// COMPARACIÓN DE PRECISIÓN OCR
// ==========================================
describe('📊 Métricas de Precisión OCR', () => {
    jest.setTimeout(60000);

    const shouldSkip = SKIP_REAL_API_TESTS || !hasTestImage;

    (shouldSkip ? it.skip : it)('debe medir precisión vs datos esperados', async () => {
        console.log('\n📊 COMPARACIÓN CON DATOS REALES CONOCIDOS');
        console.log('═'.repeat(50));

        const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
        const service = getMistralVision();
        const result = await service.extraerDatosTarjetaCirculacion(imageBuffer, 'image/jpeg');

        if (!result.success || !result.datos) {
            throw new Error('OCR falló');
        }

        const datos = result.datos;
        let aciertos = 0;
        let total = 0;

        const comparaciones = [
            { campo: 'serie', esperado: DATOS_ESPERADOS.serie, obtenido: datos.serie },
            { campo: 'marca', esperado: DATOS_ESPERADOS.marca, obtenido: datos.marca },
            { campo: 'submarca', esperado: DATOS_ESPERADOS.submarca, obtenido: datos.submarca },
            { campo: 'año', esperado: String(DATOS_ESPERADOS.año), obtenido: String(datos.año) },
            { campo: 'placas', esperado: DATOS_ESPERADOS.placas, obtenido: datos.placas },
            { campo: 'titular', esperado: DATOS_ESPERADOS.titular, obtenido: datos.titular },
            { campo: 'rfc', esperado: DATOS_ESPERADOS.rfc, obtenido: datos.rfc }
        ];

        for (const { campo, esperado, obtenido } of comparaciones) {
            total++;
            const esperadoNorm = esperado?.toUpperCase().replace(/[-\s]/g, '') || '';
            const obtenidoNorm = obtenido?.toUpperCase().replace(/[-\s]/g, '') || '';

            const coincide = esperadoNorm === obtenidoNorm ||
                            esperadoNorm.includes(obtenidoNorm) ||
                            obtenidoNorm.includes(esperadoNorm);

            if (coincide && obtenido) {
                aciertos++;
                console.log(`✅ ${campo.padEnd(10)}: ${obtenido}`);
            } else {
                console.log(`❌ ${campo.padEnd(10)}: ${obtenido || 'NULL'} (esperado: ${esperado})`);
            }
        }

        const precision = Math.round((aciertos / total) * 100);

        console.log('═'.repeat(50));
        console.log(`📈 PRECISIÓN TOTAL: ${aciertos}/${total} (${precision}%)`);
        console.log('═'.repeat(50));

        // La precisión debe ser al menos 70%
        expect(precision).toBeGreaterThanOrEqual(70);
    });
});
