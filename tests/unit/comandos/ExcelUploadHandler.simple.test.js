const ExcelUploadHandler = require('../../../src/comandos/comandos/ExcelUploadHandler');

// Mock dependencies
jest.mock('node-fetch');
jest.mock('../../../src/controllers/policyController', () => ({
    savePolicy: jest.fn(),
    DuplicatePolicyError: class DuplicatePolicyError extends Error {}
}));
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
}));
jest.mock('mongoose', () => ({
    Schema: jest.fn().mockImplementation(() => ({
        index: jest.fn(),
        pre: jest.fn(),
        methods: {}
    })),
    model: jest.fn(),
    connect: jest.fn()
}));

const fetch = require('node-fetch');
const { savePolicy } = require('../../../src/controllers/policyController');

describe('ExcelUploadHandler - Simple Tests', () => {
    let handler;
    let mockCommandHandler;

    beforeEach(() => {
        mockCommandHandler = {
            bot: {},
            excelUploadMessages: new Map()
        };
        handler = new ExcelUploadHandler(mockCommandHandler);
        jest.clearAllMocks();
    });

    describe('Basic functionality', () => {
        test('should create handler instance', () => {
            expect(handler).toBeInstanceOf(ExcelUploadHandler);
            expect(handler.getCommandName()).toBe('excelUpload');
        });

        test('should detect Excel files correctly', () => {
            expect(handler.isExcelFile('application/octet-stream', 'test.xlsx')).toBe(true);
            expect(handler.isExcelFile('application/pdf', 'test.pdf')).toBe(false);
        });

        test('should validate headers correctly', () => {
            const validHeaders = [
                'TITULAR', 'RFC', 'MARCA', 'SUBMARCA', 'AÑO', 'COLOR',
                'SERIE', 'PLACAS', 'AGENTE COTIZADOR', 'ASEGURADORA',
                '# DE POLIZA', 'FECHA DE EMISION'
            ];
            expect(handler.validateHeaders(validHeaders)).toBe(true);
            expect(handler.validateHeaders(['INVALID', 'HEADERS'])).toBe(false);
        });

        test('should validate policy data and return specific errors', () => {
            const invalidData = {
                titular: '',
                rfc: '',
                año: 'not_a_number',
                fechaEmision: 'not_a_date'
            };

            const result = handler.validatePolicyData(invalidData);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Falta TITULAR');
            expect(result.errors).toContain('Falta RFC');
            expect(result.errors).toContain('AÑO debe ser un número válido');
            expect(result.errors).toContain('FECHA DE EMISION no es válida');
        });

        test('should map Excel row to policy object', () => {
            const headers = ['TITULAR', 'RFC', 'MARCA', '# DE POLIZA', 'AÑO'];
            const row = ['Juan Pérez', 'RFC123', 'TOYOTA', 'POL123', 2020];

            const result = handler.mapRowToPolicy(headers, row);
            expect(result.titular).toBe('Juan Pérez');
            expect(result.rfc).toBe('RFC123');
            expect(result.marca).toBe('TOYOTA');
            expect(result.numeroPoliza).toBe('POL123');
            expect(result.año).toBe(2020);
            expect(result.estado).toBe('ACTIVO');
        });

        test('should parse dates correctly', () => {
            expect(handler.parseDate('15/07/2023')).toBeInstanceOf(Date);
            expect(handler.parseDate('15-07-2023')).toBeInstanceOf(Date);
            expect(handler.parseDate(new Date())).toBeInstanceOf(Date);
        });
    });

    describe('State Management', () => {
        test('should manage awaiting Excel upload state', () => {
            const chatId = 12345;
            
            expect(handler.awaitingExcelUpload.has(chatId)).toBe(false);
            
            handler.setAwaitingExcelUpload(chatId, true);
            expect(handler.awaitingExcelUpload.get(chatId)).toBe(true);
            
            handler.setAwaitingExcelUpload(chatId, false);
            expect(handler.awaitingExcelUpload.has(chatId)).toBe(false);
        });
    });

    describe('Results Display', () => {
        test('should display results correctly', async () => {
            const mockContext = {
                reply: jest.fn().mockResolvedValue({})
            };

            const results = {
                total: 2,
                successful: 1,
                failed: 1,
                details: [
                    { numeroPoliza: 'POL123', status: 'SUCCESS', message: 'OK' },
                    { numeroPoliza: 'POL456', status: 'ERROR', message: 'Falta TITULAR' }
                ]
            };

            await handler.showResults(mockContext, results);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('*Resumen del Procesamiento*'),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );
            expect(mockContext.reply).toHaveBeenCalledWith(
                '✅ *Pólizas Registradas Correctamente:*',
                expect.objectContaining({ parse_mode: 'Markdown' })
            );
            expect(mockContext.reply).toHaveBeenCalledWith('POL123');
            expect(mockContext.reply).toHaveBeenCalledWith(
                '❌ *Pólizas con Errores:*',
                expect.objectContaining({ parse_mode: 'Markdown' })
            );
        });
    });
});