const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/', 'logs/', 'scripts/backup/', '.claude/', '*.log', '*.xlsx', '*.pdf', '*.jpg', '*.png', '*.jpeg']
    },
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
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
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
    {
        files: ['scripts/**/*.js'],
        rules: {
            'no-console': 'off', // Scripts pueden usar console
            'no-process-exit': 'off' // Scripts pueden usar process.exit
        }
    }
];