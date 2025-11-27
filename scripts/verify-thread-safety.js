#!/usr/bin/env node
// scripts/verify-thread-safety.js - Script para verificar que todas las operaciones usen threadId

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'src');
const testDir = path.join(__dirname, '..', 'tests');

// Lista de mapas de estado que deben usar threadId
const stateMaps = [
    'awaitingServicePolicyNumber',
    'awaitingServiceData',
    'awaitingPaymentPolicyNumber',
    'awaitingPaymentData',
    'awaitingUploadPolicyNumber',
    'awaitingDeletePolicyNumber',
    'awaitingPhoneNumber',
    'awaitingOrigenDestino',
    'awaitingDeleteReason',
    'awaitingSaveData',
    'awaitingPolicySearch',
    'uploadTargets'
];

// Operaciones que deben incluir threadId
const operations = ['set', 'get', 'delete', 'has'];

function findJSFiles(dir) {
    const files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...findJSFiles(fullPath));
        } else if (item.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

function checkFileForThreadSafety(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i + 1;

        // Buscar operaciones con mapas de estado
        for (const mapName of stateMaps) {
            for (const operation of operations) {
                const pattern = new RegExp(`${mapName}\\.${operation}\\(([^)]+)\\)`, 'g');
                const matches = [...line.matchAll(pattern)];

                for (const match of matches) {
                    const params = match[1];

                    // Verificar si la operación tiene los parámetros correctos
                    if (operation === 'set') {
                        // set() debe tener 3 parámetros: (chatId, value, threadId)
                        const paramCount = params.split(',').length;
                        if (paramCount < 3) {
                            issues.push({
                                file: filePath,
                                line: lineNumber,
                                issue: `${mapName}.${operation}() necesita threadId como tercer parámetro`,
                                code: line,
                                severity: 'ERROR'
                            });
                        }
                    } else if (['get', 'delete', 'has'].includes(operation)) {
                        // get(), delete(), has() deben tener 2 parámetros: (chatId, threadId)
                        const paramCount = params.split(',').length;
                        if (paramCount < 2) {
                            issues.push({
                                file: filePath,
                                line: lineNumber,
                                issue: `${mapName}.${operation}() necesita threadId como segundo parámetro`,
                                code: line,
                                severity: 'ERROR'
                            });
                        }
                    }
                }
            }
        }

        // Verificar que se use StateKeyManager.getThreadId() donde sea necesario
        if (
            line.includes('message?.message_thread_id') ||
            line.includes('callbackQuery?.message?.message_thread_id')
        ) {
            issues.push({
                file: filePath,
                line: lineNumber,
                issue: 'Debería usar StateKeyManager.getThreadId(ctx) en lugar de acceso directo',
                code: line,
                severity: 'WARNING'
            });
        }

        // Verificar que clearChatState se llame con threadId
        if (
            line.includes('clearChatState(') &&
            !line.includes('clearChatState(chatId, threadId)')
        ) {
            const clearMatch = line.match(/clearChatState\(([^)]+)\)/);
            if (clearMatch) {
                const params = clearMatch[1].split(',').length;
                if (params === 1) {
                    issues.push({
                        file: filePath,
                        line: lineNumber,
                        issue: 'clearChatState() debe incluir threadId como segundo parámetro',
                        code: line,
                        severity: 'ERROR'
                    });
                }
            }
        }
    }

    return issues;
}

function main() {
    console.log('🔍 Verificando Thread Safety en el código...\n');

    const allFiles = [...findJSFiles(sourceDir), ...findJSFiles(testDir)];

    let totalIssues = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const filePath of allFiles) {
        const issues = checkFileForThreadSafety(filePath);

        if (issues.length > 0) {
            const relativePath = path.relative(process.cwd(), filePath);
            console.log(`📁 ${relativePath}:`);

            for (const issue of issues) {
                const icon = issue.severity === 'ERROR' ? '❌' : '⚠️';
                console.log(`  ${icon} Línea ${issue.line}: ${issue.issue}`);
                console.log(`     ${issue.code}`);
                console.log('');

                if (issue.severity === 'ERROR') {
                    totalErrors++;
                } else {
                    totalWarnings++;
                }
            }

            totalIssues += issues.length;
        }
    }

    console.log('📊 RESUMEN:');
    console.log(`   Total de archivos verificados: ${allFiles.length}`);
    console.log(`   Total de problemas encontrados: ${totalIssues}`);
    console.log(`   Errores críticos: ${totalErrors}`);
    console.log(`   Advertencias: ${totalWarnings}`);

    if (totalErrors === 0) {
        console.log(
            '\n✅ ¡Verificación completada! No se encontraron errores críticos de thread safety.'
        );
    } else {
        console.log('\n❌ Se encontraron errores críticos que deben ser corregidos.');
        process.exit(1);
    }

    if (totalWarnings > 0) {
        console.log('\n⚠️  Hay advertencias que podrían mejorarse pero no son críticas.');
    }
}

if (require.main === module) {
    main();
}
