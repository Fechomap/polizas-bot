const {
    createMockModel,
    mockPolicyData,
    createMongoError,
    DUPLICATE_KEY_ERROR
} = require('../../mocks/database');

// Mock del modelo Policy
const MockPolicy = createMockModel('Policy');
jest.mock('../../../src/models/policy', () => MockPolicy);

const {
    savePolicy,
    getPolicyByNumber,
    DuplicatePolicyError
} = require('../../../src/controllers/policyController');

describe('PolicyController - Tests básicos funcionando', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('savePolicy', () => {
        test('debe crear una nueva instancia de Policy', async () => {
            const policyData = { numeroPoliza: 'POL-001', nombreAsegurado: 'Test' };

            // Mock de instancia
            const mockInstance = {
                save: jest.fn().mockResolvedValue({ ...policyData, _id: 'saved_id' })
            };
            MockPolicy.mockImplementation(() => mockInstance);

            const resultado = await savePolicy(policyData);

            expect(MockPolicy).toHaveBeenCalledWith(policyData);
            expect(mockInstance.save).toHaveBeenCalled();
            expect(resultado.numeroPoliza).toBe('POL-001');
        });

        test('debe manejar error de duplicado', async () => {
            const policyData = { numeroPoliza: 'POL-001' };
            const duplicateError = createMongoError(DUPLICATE_KEY_ERROR, 'Duplicate key error', {
                numeroPoliza: 1
            });

            const mockInstance = {
                save: jest.fn().mockRejectedValue(duplicateError)
            };
            MockPolicy.mockImplementation(() => mockInstance);

            await expect(savePolicy(policyData)).rejects.toThrow(DuplicatePolicyError);
            await expect(savePolicy(policyData)).rejects.toThrow(
                'Ya existe una póliza con el número: POL-001'
            );
        });
    });

    describe('getPolicyByNumber', () => {
        test('debe buscar con parámetros correctos', async () => {
            MockPolicy.findOne.mockResolvedValue(mockPolicyData.vigente);

            const resultado = await getPolicyByNumber('POL-001');

            // La implementación real usa estado: 'ACTIVO'
            expect(MockPolicy.findOne).toHaveBeenCalledWith({
                numeroPoliza: 'POL-001',
                estado: 'ACTIVO'
            });
            expect(resultado).toEqual(mockPolicyData.vigente);
        });

        test('debe retornar null si no encuentra', async () => {
            MockPolicy.findOne.mockResolvedValue(null);

            const resultado = await getPolicyByNumber('INEXISTENTE');

            expect(resultado).toBeNull();
        });
    });

    describe('DuplicatePolicyError', () => {
        test('debe crear error correctamente', () => {
            const error = new DuplicatePolicyError('Test message');

            expect(error.message).toBe('Test message');
            expect(error.name).toBe('DuplicatePolicyError');
            expect(error).toBeInstanceOf(Error);
        });
    });
});
