// Test de conexión real a Cloudflare R2
// Este test se ejecuta contra el servicio real, no mocks

// Cargar variables de entorno desde el archivo .env
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { getInstance } = require('../../src/services/CloudflareStorage');

// Solo ejecutar si las variables de entorno están configuradas
const isConfigured = () => {
    return (
        process.env.CLOUDFLARE_R2_ENDPOINT &&
        process.env.CLOUDFLARE_R2_ACCESS_KEY &&
        process.env.CLOUDFLARE_R2_SECRET_KEY &&
        process.env.CLOUDFLARE_R2_BUCKET
    );
};

describe('Cloudflare R2 - Conexión real', () => {
    let storage;

    beforeAll(() => {
        if (!isConfigured()) {
            console.log(
                '⚠️  Variables de entorno de R2 no configuradas, saltando tests de integración'
            );
            return;
        }
        storage = getInstance();
    });

    test('debe estar configurado correctamente', () => {
        if (!isConfigured()) {
            console.log('⚠️  Saltando test: configuración no disponible');
            return;
        }

        expect(storage.isConfigured()).toBe(true);
        expect(storage.bucket).toBe('polizas-bot-storage');
    });

    test('debe subir y eliminar archivo de prueba', async () => {
        if (!isConfigured()) {
            console.log('⚠️  Saltando test: configuración no disponible');
            return;
        }

        const testBuffer = Buffer.from('Este es un archivo de prueba para R2');
        const testFileName = `test/prueba-${Date.now()}.txt`;
        const contentType = 'text/plain';

        try {
            // Subir archivo
            console.log('📤 Subiendo archivo de prueba...');
            const uploadResult = await storage.uploadFile(testBuffer, testFileName, contentType, {
                test: 'true',
                timestamp: new Date().toISOString()
            });

            // Verificar resultado de upload
            expect(uploadResult).toBeDefined();
            expect(uploadResult.key).toBe(testFileName);
            expect(uploadResult.size).toBe(testBuffer.length);
            expect(uploadResult.contentType).toBe(contentType);
            expect(uploadResult.url).toContain(testFileName);

            console.log('✅ Archivo subido exitosamente:', uploadResult.url);

            // Esperar un momento para asegurar consistencia
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Eliminar archivo
            console.log('🗑️  Eliminando archivo de prueba...');
            await storage.deleteFile(testFileName);
            console.log('✅ Archivo eliminado exitosamente');
        } catch (error) {
            console.error('❌ Error en test de conexión:', error);
            throw error;
        }
    }, 30000); // 30 segundos timeout

    test('debe subir foto de póliza de prueba', async () => {
        if (!isConfigured()) {
            console.log('⚠️  Saltando test: configuración no disponible');
            return;
        }

        // Simular imagen pequeña
        const imageBuffer = Buffer.from('fake-image-content-for-testing');
        const policyNumber = 'TEST-001';
        const originalName = 'foto-prueba.jpg';

        try {
            console.log('📸 Subiendo foto de póliza de prueba...');
            const uploadResult = await storage.uploadPolicyPhoto(
                imageBuffer,
                policyNumber,
                originalName
            );

            expect(uploadResult).toBeDefined();
            expect(uploadResult.key).toMatch(
                /^fotos\/TEST-001\/\d+_[a-f0-9]{16}_foto-prueba\.jpg$/
            );
            expect(uploadResult.contentType).toBe('image/jpeg');
            expect(uploadResult.size).toBe(imageBuffer.length);

            console.log('✅ Foto subida exitosamente:', uploadResult.url);

            // Limpiar
            await storage.deleteFile(uploadResult.key);
            console.log('✅ Foto eliminada exitosamente');
        } catch (error) {
            console.error('❌ Error en test de foto:', error);
            throw error;
        }
    }, 30000);

    test('debe subir PDF de póliza de prueba', async () => {
        if (!isConfigured()) {
            console.log('⚠️  Saltando test: configuración no disponible');
            return;
        }

        // Simular PDF pequeño
        const pdfBuffer = Buffer.from('fake-pdf-content-for-testing');
        const policyNumber = 'TEST-002';
        const originalName = 'documento-prueba.pdf';

        try {
            console.log('📄 Subiendo PDF de póliza de prueba...');
            const uploadResult = await storage.uploadPolicyPDF(
                pdfBuffer,
                policyNumber,
                originalName
            );

            expect(uploadResult).toBeDefined();
            expect(uploadResult.key).toMatch(
                /^pdfs\/TEST-002\/\d+_[a-f0-9]{16}_documento-prueba\.pdf$/
            );
            expect(uploadResult.contentType).toBe('application/pdf');
            expect(uploadResult.size).toBe(pdfBuffer.length);

            console.log('✅ PDF subido exitosamente:', uploadResult.url);

            // Limpiar
            await storage.deleteFile(uploadResult.key);
            console.log('✅ PDF eliminado exitosamente');
        } catch (error) {
            console.error('❌ Error en test de PDF:', error);
            throw error;
        }
    }, 30000);

    test('debe generar URLs correctas', async () => {
        if (!isConfigured()) {
            console.log('⚠️  Saltando test: configuración no disponible');
            return;
        }

        const testFileName = 'fotos/TEST-001/test-image.jpg';

        // URL pública (sin dominio personalizado configurado)
        const publicUrl = storage.getPublicUrl(testFileName);
        expect(publicUrl).toBe(
            `https://polizas-bot-storage.r2.cloudflarestorage.com/${testFileName}`
        );

        // URL firmada
        try {
            const signedUrl = await storage.getSignedUrl(testFileName, 3600);
            expect(signedUrl).toContain(
                'dafdefcfcce9a82b8c56c095bf7176fb.r2.cloudflarestorage.com'
            );
            expect(signedUrl).toContain(testFileName);
            expect(signedUrl).toContain('X-Amz-Signature');
            console.log('✅ URL firmada generada correctamente');
        } catch (error) {
            console.error('❌ Error generando URL firmada:', error);
            throw error;
        }
    });
});
