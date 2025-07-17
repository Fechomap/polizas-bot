// Script para probar la descarga de archivos desde Telegram
require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

async function testFileDownload() {
    try {
        const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

        // File ID del PDF problemático de la póliza 123456
        const problemFileId =
            process.env.TEST_FILE_ID ||
            'BQACAgUAAxkCAAIq0mdgtC7r-GhLc3VHIU-SZOUJBGvGAAINHAACw_l5Vzx4yf3LBXQTNgQ';

        console.log('🔍 Probando descarga de archivo desde Telegram');
        console.log('File ID:', problemFileId);

        try {
            // Intentar obtener información del archivo
            const fileInfo = await bot.telegram.getFile(problemFileId);
            console.log('\n✅ Información del archivo obtenida:');
            console.log(JSON.stringify(fileInfo, null, 2));

            // Obtener el link de descarga
            const fileLink = await bot.telegram.getFileLink(problemFileId);
            console.log('\n🔗 Link de descarga:', fileLink.href);

            // Descargar el archivo
            console.log('\n📥 Descargando archivo...');
            const response = await fetch(fileLink.href);
            console.log('Status HTTP:', response.status);
            console.log('Headers:', response.headers.raw());

            const buffer = await response.buffer();
            console.log('\n📊 Análisis del contenido:');
            console.log('Tamaño:', buffer.length, 'bytes');
            console.log('Primeros 100 bytes (hex):', buffer.slice(0, 100).toString('hex'));
            console.log('Primeros 100 bytes (texto):', buffer.slice(0, 100).toString());

            // Verificar si es un PDF válido
            const header = buffer.slice(0, 4).toString();
            console.log('\n🔍 Verificación de tipo:');
            console.log('Header encontrado:', header);
            console.log('¿Es PDF válido?', header.startsWith('%PDF') ? '✅ SÍ' : '❌ NO');

            if (!header.startsWith('%PDF') && buffer.length < 1000) {
                console.log('\n⚠️ CONTENIDO COMPLETO (probablemente error):');
                console.log(buffer.toString());
            }
        } catch (error) {
            console.error('\n❌ Error al obtener archivo:', error.message);
            if (error.response) {
                console.error('Respuesta de error:', error.response);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error general:', error);
        process.exit(1);
    }
}

testFileDownload();
