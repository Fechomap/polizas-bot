// Script para verificar el contenido real del PDF guardado en BD AUTOS
require('dotenv').config();
const { getInstance } = require('../src/services/CloudflareStorage');
const fs = require('fs').promises;
const path = require('path');

async function verificarPDF() {
    try {
        const storage = getInstance();
        console.log('🔍 VERIFICACIÓN DE PDF BD AUTOS');
        console.log('================================\n');

        // El PDF problemático según los logs
        const pdfKey = 'pdfs/123456/1752680956309_86e09f474c41a57a_F56.pdf';

        console.log(`📄 Verificando archivo: ${pdfKey}`);

        // Obtener URL firmada
        const signedUrl = await storage.getSignedUrl(pdfKey);
        console.log('🔗 URL firmada generada');

        // Descargar el archivo
        const fetch = require('node-fetch');
        const response = await fetch(signedUrl);

        console.log(`📊 Estado HTTP: ${response.status}`);
        console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
        console.log(`📊 Content-Length: ${response.headers.get('content-length')}`);

        const buffer = await response.buffer();
        console.log(`📊 Tamaño real del buffer: ${buffer.length} bytes`);

        // Analizar contenido
        console.log('\n🔬 ANÁLISIS DEL CONTENIDO:');

        // Primeros 100 bytes en hex
        console.log('Primeros 100 bytes (hex):', buffer.slice(0, 100).toString('hex'));

        // Primeros 100 bytes como texto
        console.log('\nPrimeros 100 bytes (texto):', buffer.slice(0, 100).toString('utf8'));

        // Verificar si es un PDF válido
        const pdfHeader = buffer.slice(0, 4).toString('utf8');
        console.log(`\n¿Es un PDF válido? ${pdfHeader === '%PDF' ? '✅ SÍ' : '❌ NO'}`);
        console.log(`Header encontrado: "${pdfHeader}"`);

        // Si no es PDF, mostrar todo el contenido si es pequeño
        if (buffer.length < 1000 && pdfHeader !== '%PDF') {
            console.log('\n📝 CONTENIDO COMPLETO (no es PDF):');
            console.log(buffer.toString('utf8'));
        }

        // Guardar localmente para inspección
        const localPath = path.join(__dirname, 'pdf_descargado.pdf');
        await fs.writeFile(localPath, buffer);
        console.log(`\n💾 Archivo guardado localmente en: ${localPath}`);

        // Comparar con un PDF normal
        console.log('\n🔄 COMPARANDO CON PDF NORMAL:');
        const pdfNormalKey = 'pdfs/8-252301CERT1/1752611479799_15537a18a568076d_ILD085450000ILD0854500002.pdf';

        const responseNormal = await fetch(await storage.getSignedUrl(pdfNormalKey));
        const bufferNormal = await responseNormal.buffer();

        console.log(`PDF Normal - Tamaño: ${bufferNormal.length} bytes`);
        console.log(`PDF Normal - Header: "${bufferNormal.slice(0, 4).toString('utf8')}"`);
        console.log(`PDF Normal - Primeros 50 bytes (hex): ${bufferNormal.slice(0, 50).toString('hex')}`);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Ejecutar
verificarPDF();
