// Mock para logger global
jest.mock('./src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Mock para dotenv solo en tests unitarios, no en tests de integración
if (!process.env.JEST_INTEGRATION_TEST) {
    jest.mock('dotenv', () => ({
        config: jest.fn()
    }));
}

// Mock para mongoose (solo para evitar errores de conexión en tests)
jest.mock('mongoose', () => ({
    connect: jest.fn().mockResolvedValue({}),
    Schema: jest.fn(),
    model: jest.fn()
}));
