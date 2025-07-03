module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/bot.js', // Excluir el archivo principal que requiere conexión
        '!src/database.js', // Excluir conexión a DB
        '!**/node_modules/**'
    ],
    testMatch: [
        '<rootDir>/tests/**/*.test.js'
    ],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true
};