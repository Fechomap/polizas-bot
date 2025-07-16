// Mock de AWS SDK
const mockSend = jest.fn();
const mockS3Client = jest.fn().mockImplementation(() => ({
    send: mockSend
}));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: mockS3Client,
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn()
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.com/test')
}));

// Mock de variables de entorno
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
});

const { CloudflareStorage, getInstance } = require('../../../src/services/CloudflareStorage');

describe('CloudflareStorage', () => {
    describe('Configuración y inicialización', () => {
        test('debe crear instancia correctamente con configuración válida', () => {
            const storage = new CloudflareStorage();

            expect(storage.bucket).toBe('test-bucket');
            expect(storage.publicUrl).toBe('https://test-domain.com');
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

        test('getInstance debe retornar singleton', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();

            expect(instance1).toBe(instance2);
            expect(instance1).toBeInstanceOf(CloudflareStorage);
        });
    });

    describe('Generación de nombres de archivo', () => {
        let storage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe generar nombre único para foto', () => {
            const fileName = storage.generateFileName('POL-001', 'imagen.jpg', 'fotos');

            expect(fileName).toMatch(/^fotos\/POL-001\/\d+_[a-f0-9]{16}_imagen\.jpg$/);
        });

        test('debe sanitizar caracteres especiales', () => {
            const fileName = storage.generateFileName(
                'POL@#$001',
                'archivo con espacios.pdf',
                'pdfs'
            );

            expect(fileName).toMatch(/^pdfs\/POL001\/\d+_[a-f0-9]{16}_archivoconespacios\.pdf$/);
        });

        test('debe manejar archivos sin extensión', () => {
            const fileName = storage.generateFileName('POL-001', 'archivo', 'docs');

            expect(fileName).toMatch(/^docs\/POL-001\/\d+_[a-f0-9]{16}_archivo$/);
        });
    });

    describe('Operaciones de archivo', () => {
        let storage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe subir archivo exitosamente', async () => {
            const fileBuffer = Buffer.from('test content');
            const fileName = 'test-file.jpg';
            const contentType = 'image/jpeg';

            mockSend.mockResolvedValue({ ETag: '"test-etag"' });

            const result = await storage.uploadFile(fileBuffer, fileName, contentType);

            expect(result).toMatchObject({
                key: fileName,
                url: 'https://test-domain.com/test-file.jpg',
                size: fileBuffer.length,
                contentType: 'image/jpeg'
            });
            expect(result.uploadedAt).toBeInstanceOf(Date);
            expect(result.etag).toBe('"test-etag"');
        });

        test('debe manejar errores en upload', async () => {
            const fileBuffer = Buffer.from('test content');
            mockSend.mockRejectedValue(new Error('Network error'));

            await expect(storage.uploadFile(fileBuffer, 'test.jpg', 'image/jpeg')).rejects.toThrow(
                'Error al subir archivo: Network error'
            );
        });

        test('debe eliminar archivo exitosamente', async () => {
            mockSend.mockResolvedValue({});

            await expect(storage.deleteFile('test-file.jpg')).resolves.not.toThrow();
            expect(mockSend).toHaveBeenCalled();
        });

        test('debe manejar errores en delete', async () => {
            mockSend.mockRejectedValue(new Error('File not found'));

            await expect(storage.deleteFile('test.jpg')).rejects.toThrow(
                'Error al eliminar archivo: File not found'
            );
        });
    });

    describe('URLs y acceso', () => {
        let storage;

        beforeEach(() => {
            storage = new CloudflareStorage();
        });

        test('debe generar URL pública correctamente', () => {
            const url = storage.getPublicUrl('fotos/POL-001/test.jpg');
            expect(url).toBe('https://test-domain.com/fotos/POL-001/test.jpg');
        });

        test('debe usar fallback sin dominio personalizado', () => {
            delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
            const storage = new CloudflareStorage();

            const url = storage.getPublicUrl('test.jpg');
            expect(url).toBe('https://test-bucket.r2.cloudflarestorage.com/test.jpg');
        });

        test('debe obtener content type correcto para imágenes', () => {
            expect(storage.getImageContentType('test.jpg')).toBe('image/jpeg');
            expect(storage.getImageContentType('test.jpeg')).toBe('image/jpeg');
            expect(storage.getImageContentType('test.png')).toBe('image/png');
            expect(storage.getImageContentType('test.gif')).toBe('image/gif');
            expect(storage.getImageContentType('test.webp')).toBe('image/webp');
            expect(storage.getImageContentType('test.unknown')).toBe('image/jpeg');
        });
    });

    describe('Métodos específicos de pólizas', () => {
        let storage;

        beforeEach(() => {
            storage = new CloudflareStorage();
            mockSend.mockResolvedValue({ ETag: '"test-etag"' });
        });

        test('debe subir foto de póliza correctamente', async () => {
            const photoBuffer = Buffer.from('photo content');

            const result = await storage.uploadPolicyPhoto(photoBuffer, 'POL-001', 'foto.jpg');

            expect(result.key).toMatch(/^fotos\/POL-001\/\d+_[a-f0-9]{16}_foto\.jpg$/);
            expect(result.contentType).toBe('image/jpeg');
            expect(result.size).toBe(photoBuffer.length);
        });

        test('debe subir PDF de póliza correctamente', async () => {
            const pdfBuffer = Buffer.from('pdf content');

            const result = await storage.uploadPolicyPDF(pdfBuffer, 'POL-001', 'documento.pdf');

            expect(result.key).toMatch(/^pdfs\/POL-001\/\d+_[a-f0-9]{16}_documento\.pdf$/);
            expect(result.contentType).toBe('application/pdf');
            expect(result.size).toBe(pdfBuffer.length);
        });
    });
});
