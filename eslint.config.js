const globals = require('globals');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    {
        ignores: [
            'node_modules/',
            'logs/',
            'scripts/backup/',
            '.claude/',
            'dist/',
            'coverage/',
            '*.log',
            '*.xlsx',
            '*.pdf',
            '*.jpg',
            '*.png',
            '*.jpeg'
        ]
    },
    // Configuración para archivos JavaScript
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2021
            }
        },
        rules: {
            // Errores básicos
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'no-console': 'off', // Permitir console.log para bots

            // Estilo de código
            indent: ['error', 4],
            quotes: ['error', 'single'],
            semi: ['error', 'always'],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',

            // Buenas prácticas
            'no-var': 'error',
            'prefer-const': 'warn',
            'no-unused-expressions': 'error',
            'no-duplicate-imports': 'error',

            // Específico para Node.js
            'no-process-exit': 'warn',
            'handle-callback-err': 'error'
        }
    },
    // Configuración para archivos TypeScript
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: './tsconfig.json'
            },
            globals: {
                ...globals.node,
                ...globals.es2021
            }
        },
        plugins: {
            '@typescript-eslint': typescriptPlugin,
            prettier: prettierPlugin
        },
        rules: {
            // Prettier rules
            'prettier/prettier': 'error',

            // Extender reglas de prettier
            ...prettierConfig.rules,

            // TypeScript específico
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',

            // Desactivar reglas JS para TS
            'no-unused-vars': 'off',
            'no-undef': 'off', // TypeScript lo maneja
            'no-console': 'off',

            // Buenas prácticas TypeScript
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/prefer-as-const': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error'
        }
    },
    {
        files: ['scripts/**/*.js'],
        rules: {
            'no-console': 'off', // Scripts pueden usar console
            'no-process-exit': 'off' // Scripts pueden usar process.exit
        }
    },
    {
        files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021,
                ...globals.jest
            }
        },
        rules: {
            'no-console': 'off', // Tests pueden usar console
            'no-unused-expressions': 'off' // Jest usa expect().toBe() que parece unused expression
        }
    }
];
