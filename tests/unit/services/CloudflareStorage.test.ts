/**
 * Test completo para CloudflareStorage - TypeScript moderno
 * Servicio crítico para gestión de archivos en Cloudflare R2
 */

import { jest } from '@jest/globals';

// Mock de AWS SDK
const mockSend = jest.fn();
const mockS3Client = jest.fn().mockImplementation(() => ({
    send: mockSend
}));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: mockS3Client,
    PutObjectCommand: jest.fn().mockImplementation((params: any) => ({ ...params, command: 'PutObjectCommand' })),
    DeleteObjectCommand: jest.fn().mockImplementation((params: any) => ({ ...params, command: 'DeleteObjectCommand' })),
    GetObjectCommand: jest.fn().mockImplementation((params: any) => ({ ...params, command: 'GetObjectCommand' }))
}));

const mockGetSignedUrl = jest.fn() as any;
jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: mockGetSignedUrl
}));

// Mock del logger
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Importar después de los mocks
import CloudflareStorage, { getInstance } from '../../../src/services/CloudflareStorage';

describe('CloudflareStorage - Test Completo', () => {
    // Variables de entorno originales
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            CLOUDFLARE_R2_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
            CLOUDFLARE_R2_ACCESS_KEY: 'test-access-key',
            CLOUDFLARE_R2_SECRET_KEY: 'test-secret-key',
            CLOUDFLARE_R2_BUCKET: 'test-bucket',
            CLOUDFLARE_R2_PUBLIC_URL: 'https://test-domain.com'
        };
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.env = originalEnv;
        mockGetSignedUrl.mockClear();
    });

    describe('Configuración y Inicialización', () => {
        test('debe crear instancia correctamente con configuración válida', () => {
            const storage = new CloudflareStorage();

            expect(mockS3Client).toHaveBeenCalledWith({
                region: 'auto',
                endpoint: 'https://test-account.r2.cloudflarestorage.com',
                credentials: {
                    accessKeyId: 'test-access-key',
                    secretAccessKey: 'test-secret-key'
                }
            });
        });

        test('debe validar configuración completa', () => {
            const storage = new CloudflareStorage();
            expect(storage.isConfigured()).toBe(true);
        });

        test('debe detectar configuración incompleta', () => {
            delete process.env.CLOUDFLARE_R2_ACCESS_KEY;

            const storage = new CloudflareStorage();
            expect(storage.isConfigured()).toBe(false);
        });

        test('debe manejar configuración parcial', () => {
            delete process.env.CLOUDFLARE_R2_ENDPOINT;
            delete process.env.CLOUDFLARE_R2_BUCKET;

            const storage = new CloudflareStorage();
            expect(storage.isConfigured()).toBe(false);
        });

        test('debe inicializar correctamente sin URL pública', () => {
            delete process.env.CLOUDFLARE_R2_PUBLIC_URL;

            const storage = new CloudflareStorage();
            expect(storage.isConfigured()).toBe(true);
        });

        test('getInstance debe retornar singleton', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();

            expect(instance1).toBe(instance2);
            expect(instance1).toBeInstanceOf(CloudflareStorage);
        });

        test('getInstance debe mantener configuración entre llamadas', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();

            expect(instance1.isConfigured()).toBe(instance2.isConfigured());
        });
    });

    describe('Generación de Nombres de Archivo', () => {
        let storage: CloudflareStorage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe generar nombre único para foto', () => {
            const fileName = storage.generateFileName('POL-001', 'imagen.jpg', 'fotos');

            expect(fileName).toMatch(/^fotos\/POL-001\/\d+_[a-f0-9]{16}_imagen\.jpg$/);
            expect(fileName).toContain('fotos/POL-001/');
            expect(fileName).toContain('_imagen.jpg');
        });

        test('debe sanitizar caracteres especiales en póliza', () => {
            const fileName = storage.generateFileName(
                'POL@#$001',
                'archivo con espacios.pdf',
                'pdfs'
            );

            expect(fileName).toMatch(/^pdfs\/POL001\/\d+_[a-f0-9]{16}_archivoconespacios\.pdf$/);
            expect(fileName).not.toContain('@');
            expect(fileName).not.toContain('#');
            expect(fileName).not.toContain('$');
            expect(fileName).not.toContain(' ');
        });

        test('debe sanitizar caracteres especiales en nombre de archivo', () => {
            const fileName = storage.generateFileName(
                'POL-001',
                'archivo_con-símbolos@#$.pdf',
                'docs'
            );

            expect(fileName).toMatch(/^docs\/POL-001\/\d+_[a-f0-9]{16}_archivo_con-smbolos\.pdf$/);
        });

        test('debe manejar archivos sin extensión', () => {
            const fileName = storage.generateFileName('POL-001', 'archivo', 'docs');

            expect(fileName).toMatch(/^docs\/POL-001\/\d+_[a-f0-9]{16}_archivo$/);
            expect(fileName).toContain('docs/POL-001/');
            expect(fileName).toContain('_archivo');
            expect(fileName).not.toContain('.');
        });

        test('debe generar nombres únicos para el mismo archivo', () => {
            const fileName1 = storage.generateFileName('POL-001', 'test.jpg', 'fotos');
            // Pequeña pausa para asegurar timestamp diferente
            const fileName2 = storage.generateFileName('POL-001', 'test.jpg', 'fotos');

            expect(fileName1).not.toBe(fileName2);
            expect(fileName1).toContain('fotos/POL-001/');
            expect(fileName2).toContain('fotos/POL-001/');
        });

        test('debe manejar tipos de carpeta diferentes', () => {
            const fotoFile = storage.generateFileName('POL-001', 'foto.jpg', 'fotos');
            const pdfFile = storage.generateFileName('POL-001', 'doc.pdf', 'pdfs');
            const docFile = storage.generateFileName('POL-001', 'texto.txt', 'documentos');

            expect(fotoFile).toContain('fotos/POL-001/');
            expect(pdfFile).toContain('pdfs/POL-001/');
            expect(docFile).toContain('documentos/POL-001/');
        });

        test('debe manejar números de póliza complejos', () => {
            const fileName = storage.generateFileName('POL-2024-001-MX', 'imagen.jpg', 'fotos');

            expect(fileName).toMatch(/^fotos\/POL-2024-001-MX\/\d+_[a-f0-9]{16}_imagen\.jpg$/);
        });
    });

    describe('Operaciones de Archivo', () => {
        let storage: CloudflareStorage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe subir archivo exitosamente', async () => {
            const fileBuffer = Buffer.from('test content');
            const fileName = 'test-file.jpg';
            const contentType = 'image/jpeg';

            (mockSend as any).mockResolvedValue({ ETag: '"test-etag"' });

            const result = await storage.uploadFile(fileBuffer, fileName, contentType);

            expect(result).toMatchObject({
                key: fileName,
                url: 'https://test-domain.com/test-file.jpg',
                size: fileBuffer.length,
                contentType: 'image/jpeg'
            });
            expect(result.uploadedAt).toBeInstanceOf(Date);
            expect(result.etag).toBe('"test-etag"');
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        test('debe subir archivo con metadata opcional', async () => {
            const fileBuffer = Buffer.from('test content with metadata');
            const fileName = 'test-with-metadata.pdf';
            const contentType = 'application/pdf';
            const metadata = { policyNumber: 'POL-001', type: 'document' };

            (mockSend as any).mockResolvedValue({ ETag: '"metadata-etag"' });

            const result = await storage.uploadFile(fileBuffer, fileName, contentType, metadata);

            expect(result.key).toBe(fileName);
            expect(result.size).toBe(fileBuffer.length);
            expect(result.contentType).toBe(contentType);
        });

        test('debe manejar archivos grandes', async () => {
            const largeBuffer = Buffer.alloc(5 * 1024 * 1024, 'x'); // 5MB
            (mockSend as any).mockResolvedValue({ ETag: '"large-file-etag"' });

            const result = await storage.uploadFile(largeBuffer, 'large-file.jpg', 'image/jpeg');

            expect(result.size).toBe(5 * 1024 * 1024);
            expect(result.key).toBe('large-file.jpg');
        });

        test('debe manejar errores en upload', async () => {
            const fileBuffer = Buffer.from('test content');
            (mockSend as any).mockRejectedValue(new Error('Network error'));

            await expect(storage.uploadFile(fileBuffer, 'test.jpg', 'image/jpeg')).rejects.toThrow(
                'Error al subir archivo: Network error'
            );
        });

        test('debe manejar errores de acceso denegado', async () => {
            const fileBuffer = Buffer.from('test content');
            (mockSend as any).mockRejectedValue(new Error('AccessDenied'));

            await expect(storage.uploadFile(fileBuffer, 'test.jpg', 'image/jpeg')).rejects.toThrow(
                'Error al subir archivo: AccessDenied'
            );
        });

        test('debe eliminar archivo exitosamente', async () => {
            (mockSend as any).mockResolvedValue({});

            await expect(storage.deleteFile('test-file.jpg')).resolves.not.toThrow();
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        test('debe manejar eliminación de archivo inexistente', async () => {
            (mockSend as any).mockResolvedValue({}); // R2 no falla si el archivo no existe

            await expect(storage.deleteFile('inexistente.jpg')).resolves.not.toThrow();
        });

        test('debe manejar errores en delete', async () => {
            (mockSend as any).mockRejectedValue(new Error('File not found'));

            await expect(storage.deleteFile('test.jpg')).rejects.toThrow(
                'Error al eliminar archivo: File not found'
            );
        });

        test('debe validar parámetros de archivo antes de upload', async () => {
            const fileBuffer = Buffer.from('test');

            // Archivo vacío
            await expect(storage.uploadFile(Buffer.alloc(0), 'empty.jpg', 'image/jpeg')).rejects.toThrow();

            // Nombre de archivo vacío
            await expect(storage.uploadFile(fileBuffer, '', 'image/jpeg')).rejects.toThrow();

            // Content type vacío
            await expect(storage.uploadFile(fileBuffer, 'test.jpg', '')).rejects.toThrow();
        });
    });

    describe('URLs y Acceso', () => {
        let storage: CloudflareStorage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe generar URL pública correctamente', () => {
            const url = storage.getPublicUrl('fotos/POL-001/test.jpg');
            expect(url).toBe('https://test-domain.com/fotos/POL-001/test.jpg');
        });

        test('debe manejar URLs con caracteres especiales', () => {
            const url = storage.getPublicUrl('fotos/POL-001/archivo con espacios.jpg');
            expect(url).toBe('https://test-domain.com/fotos/POL-001/archivo con espacios.jpg');
        });

        test('debe usar fallback sin dominio personalizado', () => {
            delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
            const storage = new CloudflareStorage();

            const url = storage.getPublicUrl('test.jpg');
            expect(url).toBe('https://test-bucket.r2.cloudflarestorage.com/test.jpg');
        });

        test('debe manejar URLs con barras iniciales', () => {
            const url1 = storage.getPublicUrl('/fotos/test.jpg');
            const url2 = storage.getPublicUrl('fotos/test.jpg');

            expect(url1).toBe('https://test-domain.com//fotos/test.jpg');
            expect(url2).toBe('https://test-domain.com/fotos/test.jpg');
        });

        test('debe obtener content type correcto para imágenes', () => {
            expect(storage.getImageContentType('test.jpg')).toBe('image/jpeg');
            expect(storage.getImageContentType('test.jpeg')).toBe('image/jpeg');
            expect(storage.getImageContentType('test.JPG')).toBe('image/jpeg'); // Case insensitive
            expect(storage.getImageContentType('test.png')).toBe('image/png');
            expect(storage.getImageContentType('test.PNG')).toBe('image/png');
            expect(storage.getImageContentType('test.gif')).toBe('image/gif');
            expect(storage.getImageContentType('test.webp')).toBe('image/webp');
            expect(storage.getImageContentType('test.unknown')).toBe('image/jpeg'); // Fallback
            expect(storage.getImageContentType('archivo_sin_extension')).toBe('image/jpeg'); // Fallback
        });

        test('debe generar URLs firmadas', async () => {
            mockGetSignedUrl.mockResolvedValue('https://signed-url.com/test');
            
            const signedUrl = await storage.getSignedUrl('private/document.pdf', 3600);

            expect(signedUrl).toBe('https://signed-url.com/test');
        });

        test('debe manejar errores en URLs firmadas', async () => {
            mockGetSignedUrl.mockRejectedValueOnce(new Error('Signing error'));

            await expect(storage.getSignedUrl('test.pdf', 3600)).rejects.toThrow('Signing error');
        });
    });

    describe('Métodos Específicos de Pólizas', () => {
        let storage: CloudflareStorage;

        beforeEach(() => {
            storage = new CloudflareStorage();
            (mockSend as any).mockResolvedValue({ ETag: '"test-etag"' });
        });

        test('debe subir foto de póliza correctamente', async () => {
            const photoBuffer = Buffer.from('photo content');

            const result = await storage.uploadPolicyPhoto(photoBuffer, 'POL-001', 'foto.jpg');

            expect(result.key).toMatch(/^fotos\/POL-001\/\d+_[a-f0-9]{16}_foto\.jpg$/);
            expect(result.contentType).toBe('image/jpeg');
            expect(result.size).toBe(photoBuffer.length);
            expect(result.url).toContain('https://test-domain.com/fotos/POL-001/');
        });

        test('debe subir PDF de póliza correctamente', async () => {
            const pdfBuffer = Buffer.from('pdf content');

            const result = await storage.uploadPolicyPDF(pdfBuffer, 'POL-001', 'documento.pdf');

            expect(result.key).toMatch(/^pdfs\/POL-001\/\d+_[a-f0-9]{16}_documento\.pdf$/);
            expect(result.contentType).toBe('application/pdf');
            expect(result.size).toBe(pdfBuffer.length);
            expect(result.url).toContain('https://test-domain.com/pdfs/POL-001/');
        });

        test('debe subir fotos con diferentes formatos', async () => {
            const jpgBuffer = Buffer.from('jpg content');
            const pngBuffer = Buffer.from('png content');
            const webpBuffer = Buffer.from('webp content');

            const jpgResult = await storage.uploadPolicyPhoto(jpgBuffer, 'POL-001', 'foto.jpg');
            const pngResult = await storage.uploadPolicyPhoto(pngBuffer, 'POL-001', 'foto.png');
            const webpResult = await storage.uploadPolicyPhoto(webpBuffer, 'POL-001', 'foto.webp');

            expect(jpgResult.contentType).toBe('image/jpeg');
            expect(pngResult.contentType).toBe('image/png');
            expect(webpResult.contentType).toBe('image/webp');
        });

        test('debe subir foto aun con buffer vacío', async () => {
            const result = await storage.uploadPolicyPhoto(Buffer.alloc(0), 'POL-001', 'foto.jpg');
            expect(result.size).toBe(0);
            expect(result.contentType).toBe('image/jpeg');
        });

        test('debe subir PDF aun con buffer vacío', async () => {
            const result = await storage.uploadPolicyPDF(Buffer.alloc(0), 'POL-001', 'doc.pdf');
            expect(result.size).toBe(0);
            expect(result.contentType).toBe('application/pdf');
        });

        test('debe manejar nombres de archivo con caracteres especiales en pólizas', async () => {
            const buffer = Buffer.from('test content');

            const result = await storage.uploadPolicyPhoto(buffer, 'POL@001', 'foto con espacios.jpg');

            expect(result.key).toMatch(/^fotos\/POL001\/\d+_[a-f0-9]{16}_fotoconespacios\.jpg$/);
        });
    });

    describe('Gestión de Errores y Edge Cases', () => {
        let storage: CloudflareStorage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe manejar storage no configurado', () => {
            delete process.env.CLOUDFLARE_R2_ACCESS_KEY;
            const unconfiguredStorage = new CloudflareStorage();

            expect(unconfiguredStorage.isConfigured()).toBe(false);
        });

        test('debe manejar timeout en operaciones', async () => {
            (mockSend as any).mockImplementation(() => new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 100)
            ));

            const buffer = Buffer.from('test');
            await expect(storage.uploadFile(buffer, 'test.jpg', 'image/jpeg')).rejects.toThrow('Timeout');
        });

        test('debe limpiar recursos en caso de error', async () => {
            const buffer = Buffer.from('test content');
            (mockSend as any).mockRejectedValue(new Error('Upload failed'));

            await expect(storage.uploadFile(buffer, 'test.jpg', 'image/jpeg')).rejects.toThrow('Upload failed');
            
            // Verificar que no queden recursos colgando
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        test('debe manejar nombres de archivo muy largos', () => {
            const longName = 'a'.repeat(300) + '.jpg';
            const fileName = storage.generateFileName('POL-001', longName, 'fotos');

            expect(fileName.length).toBeLessThan(1024); // Límite razonable
            expect(fileName).toContain('fotos/POL-001/');
        });

        test('debe manejar múltiples uploads simultáneos', async () => {
            const buffer = Buffer.from('test content');
            (mockSend as any).mockResolvedValue({ ETag: '"concurrent-etag"' });

            const uploads = Array.from({ length: 5 }, (_, i) => 
                storage.uploadFile(buffer, `file${i}.jpg`, 'image/jpeg')
            );

            const results = await Promise.all(uploads);

            expect(results).toHaveLength(5);
            results.forEach((result, i) => {
                expect(result.key).toBe(`file${i}.jpg`);
                expect(result.size).toBe(buffer.length);
            });
        });
    });

    describe('Integración con Sistema de Pólizas', () => {
        let storage: CloudflareStorage;

        beforeEach(() => {
            storage = new CloudflareStorage();
            (mockSend as any).mockResolvedValue({ ETag: '"integration-etag"' });
        });

        test('debe soportar flujo completo de subida de documentos', async () => {
            const fotoBuffer = Buffer.from('foto content');
            const pdfBuffer = Buffer.from('pdf content');
            const policyNumber = 'POL-2024-001';

            // Subir foto
            const fotoResult = await storage.uploadPolicyPhoto(fotoBuffer, policyNumber, 'vehiculo.jpg');
            
            // Subir PDF
            const pdfResult = await storage.uploadPolicyPDF(pdfBuffer, policyNumber, 'poliza.pdf');

            expect(fotoResult.key).toContain(`fotos/${policyNumber}/`);
            expect(pdfResult.key).toContain(`pdfs/${policyNumber}/`);
            
            expect(fotoResult.url).toContain('test-domain.com');
            expect(pdfResult.url).toContain('test-domain.com');
        });

        test('debe organizar archivos por número de póliza', async () => {
            const buffer = Buffer.from('test content');
            
            const result1 = await storage.uploadPolicyPhoto(buffer, 'POL-001', 'foto1.jpg');
            const result2 = await storage.uploadPolicyPhoto(buffer, 'POL-002', 'foto2.jpg');

            expect(result1.key).toContain('fotos/POL-001/');
            expect(result2.key).toContain('fotos/POL-002/');
            expect(result1.key).not.toContain('POL-002');
            expect(result2.key).not.toContain('POL-001');
        });

        test('debe permitir eliminación por póliza', async () => {
            (mockSend as any).mockResolvedValue({});

            await storage.deleteFile('fotos/POL-001/12345_abcdef_foto.jpg');
            await storage.deleteFile('pdfs/POL-001/67890_ghijkl_documento.pdf');

            expect(mockSend).toHaveBeenCalledTimes(2);
        });
    });
});