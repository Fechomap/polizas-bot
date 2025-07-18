module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/bot.ts',
    '!src/database.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tests/tsconfig.json'
    }],
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: [
    'ts',
    'js',
    'json'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.ts$))'
  ]
};