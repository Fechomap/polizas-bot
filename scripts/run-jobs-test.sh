#!/bin/bash

# Script para ejecutar tests de jobs automáticos
# Compila TypeScript y ejecuta el test

echo "🚀 EJECUTANDO TESTS DE JOBS AUTOMÁTICOS"
echo "====================================="

# Cambiar al directorio del proyecto
cd "$(dirname "$0")/.."

# Compilar TypeScript
echo "📦 Compilando TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error al compilar TypeScript"
    exit 1
fi

echo "✅ Compilación exitosa"

# Ejecutar el test usando ts-node
echo "🧪 Ejecutando tests..."
npx ts-node scripts/test-jobs-automaticos.ts

echo "🎉 Tests completados"