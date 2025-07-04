// Mock de MongoDB/Mongoose más realista
const createMockDocument = (data) => ({
    ...data,
    _id: 'mock_id_' + Math.random().toString(36).substr(2, 9),
    save: jest.fn().mockResolvedValue({ ...data, _id: 'saved_id' }),
    toObject: jest.fn().mockReturnValue(data),
    toJSON: jest.fn().mockReturnValue(data)
});

const createMockModel = (name) => {
    const MockModel = jest.fn().mockImplementation((data) => createMockDocument(data));
    
    // Métodos estáticos
    MockModel.findOne = jest.fn();
    MockModel.findById = jest.fn();
    MockModel.find = jest.fn();
    MockModel.findOneAndUpdate = jest.fn();
    MockModel.findOneAndDelete = jest.fn();
    MockModel.deleteOne = jest.fn();
    MockModel.deleteMany = jest.fn();
    MockModel.countDocuments = jest.fn();
    MockModel.create = jest.fn();
    MockModel.insertMany = jest.fn();
    
    return MockModel;
};

// Datos de prueba para pólizas
const mockPolicyData = {
    vigente: {
        numeroPoliza: 'POL-001',
        nombreAsegurado: 'Juan Pérez',
        tipoSeguro: 'AUTO',
        estado: 'VIGENTE',
        fechaCreacion: new Date('2024-01-01'),
        pagos: [],
        servicios: []
    },
    vencida: {
        numeroPoliza: 'POL-002', 
        nombreAsegurado: 'María García',
        tipoSeguro: 'VIDA',
        estado: 'VENCIDO',
        fechaCreacion: new Date('2023-01-01'),
        pagos: [],
        servicios: []
    },
    eliminada: {
        numeroPoliza: 'POL-003',
        nombreAsegurado: 'Carlos López',
        tipoSeguro: 'HOGAR',
        estado: 'ELIMINADO',
        fechaCreacion: new Date('2022-01-01'),
        pagos: [],
        servicios: []
    }
};

// Errores simulados de MongoDB
const createMongoError = (code, message, keyPattern = null) => {
    const error = new Error(message);
    error.code = code;
    if (keyPattern) {
        error.keyPattern = keyPattern;
    }
    return error;
};

module.exports = {
    createMockDocument,
    createMockModel,
    mockPolicyData,
    createMongoError,
    // Errores comunes
    DUPLICATE_KEY_ERROR: 11000,
    CONNECTION_ERROR: 'ECONNREFUSED'
};