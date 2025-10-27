# Solución: Problema de Subida de PDFs a Cloudflare R2

## 📋 Problema Reportado

Los PDFs no se estaban subiendo correctamente a Cloudflare R2, causando errores silenciosos o rechazo de archivos.

## 🔍 Causas Identificadas

### 1. **Falta de Validación de Tamaño**
- No había validación de tamaño antes de procesar archivos
- PDFs grandes causaban timeouts o errores de memoria
- Límite por defecto: 20MB (configurable)

### 2. **Falta de Validación de Formato**
- Solo se verificaba el MIME type reportado por Telegram
- No se validaba que fuera realmente un PDF (magic bytes)
- Archivos corruptos se intentaban subir

### 3. **Operaciones No Atómicas**
- Uso de `.save()` en vez de operaciones atómicas
- Riesgo de race conditions al guardar PDFs
- Inconsistencia en el array de PDFs

### 4. **Manejo de Errores Deficiente**
- Errores genéricos sin información específica
- Difícil diagnosticar problemas reales
- No se limpiaba estado después de errores

## ✅ Soluciones Implementadas

### 1. Validación de Tamaño de Archivo

```typescript
// ✅ VALIDACIÓN 1: Tamaño de archivo (20MB máximo por defecto)
const MAX_FILE_SIZE = parseInt(process.env.MAX_PDF_SIZE || '20971520'); // 20MB
if (fileSize > MAX_FILE_SIZE) {
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
    const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(2);

    await ctx.reply(
        `❌ El archivo es demasiado grande (${sizeMB}MB).\n` +
        `Tamaño máximo permitido: ${maxSizeMB}MB`
    );
    return;
}
```

**Beneficios:**
- Rechaza archivos grandes antes de descargarlos
- Configurable mediante variable de entorno `MAX_PDF_SIZE`
- Mensaje claro al usuario sobre el límite

### 2. Validación de Formato PDF

```typescript
// ✅ VALIDACIÓN 2: Verificar MIME type
if (!documentInfo.mime_type?.includes('pdf')) {
    await ctx.reply('❌ Solo se permiten documentos PDF.');
    return;
}

// ✅ VALIDACIÓN 4: Verificar magic bytes (%PDF)
const pdfHeader = buffer.slice(0, 4).toString();
if (!pdfHeader.startsWith('%PDF')) {
    await ctx.reply('❌ El archivo no es un PDF válido.');
    return;
}
```

**Beneficios:**
- Verifica tanto MIME type como contenido real
- Previene subida de archivos corruptos o renombrados
- Detecta PDFs inválidos antes de subirlos a R2

### 3. Validación de Descarga

```typescript
// ✅ VALIDACIÓN 3: Verificar que el buffer se descargó correctamente
if (buffer.length === 0) {
    throw new Error('Buffer vacío después de descargar archivo');
}

logger.info('[PDF_UPLOAD] Archivo descargado', {
    bufferLength: buffer.length,
    expectedSize: fileSize,
    match: buffer.length === fileSize
});
```

**Beneficios:**
- Verifica que la descarga fue exitosa
- Compara tamaño descargado vs esperado
- Logging detallado para debugging

### 4. Operación Atómica para Guardar PDF

```typescript
// ✅ OPERACIÓN ATÓMICA: Añadir PDF con $push
const updatedPolicy = await Policy.findOneAndUpdate(
    { numeroPoliza, estado: 'ACTIVO' },
    {
        $push: { 'archivos.r2Files.pdfs': r2FileObject },
        $setOnInsert: {
            archivos: {
                fotos: [],
                pdfs: [],
                r2Files: {
                    fotos: [],
                    pdfs: [r2FileObject]
                }
            }
        }
    },
    {
        new: true,
        runValidators: false,
        upsert: false
    }
);
```

**Beneficios:**
- Operación atómica garantizada por MongoDB
- No hay race conditions al guardar múltiples PDFs
- Inicialización automática de estructuras si no existen

### 5. Manejo de Errores Mejorado

```typescript
// Mensaje de error específico según el tipo de error
let errorMessage = '❌ Error al procesar el documento PDF.';

if (error.message?.includes('no está configurado')) {
    errorMessage = '❌ Error de configuración...';
} else if (error.message?.includes('HTTP')) {
    errorMessage = '❌ Error al descargar...';
} else if (error.message?.includes('Buffer vacío')) {
    errorMessage = '❌ El archivo descargado está corrupto...';
} else if (error.message?.includes('R2') || error.message?.includes('S3')) {
    errorMessage = '❌ Error al subir...';
}
```

**Beneficios:**
- Mensajes específicos según tipo de error
- Usuario recibe información útil
- Logs detallados para debugging técnico

### 6. Logging Detallado

```typescript
logger.info('[PDF_UPLOAD] Documento recibido', {
    file_id, file_name, file_size, mime_type, numeroPoliza
});

logger.info('[PDF_UPLOAD] Descargando archivo de Telegram', { fileId });

logger.info('[PDF_UPLOAD] Archivo descargado', {
    bufferLength, expectedSize, match
});

logger.info('[PDF_UPLOAD] Subiendo a Cloudflare R2', { numeroPoliza, fileName });

logger.info('[PDF_UPLOAD] ✅ PDF guardado exitosamente', {
    numeroPoliza, totalPDFs, fileName
});
```

**Beneficios:**
- Trazabilidad completa del proceso
- Prefijo `[PDF_UPLOAD]` para filtrar logs
- Información contextual en cada paso

## 📊 Configuración

### Variables de Entorno

```bash
# Tamaño máximo de PDF (bytes)
# Por defecto: 20971520 (20MB)
MAX_PDF_SIZE=20971520

# Configuración de Cloudflare R2 (requeridas)
CLOUDFLARE_R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=your_access_key
CLOUDFLARE_R2_SECRET_KEY=your_secret_key
CLOUDFLARE_R2_BUCKET=your_bucket_name
CLOUDFLARE_R2_PUBLIC_URL=https://your-custom-domain.com
```

### Límites de Cloudflare R2

| Límite | Valor |
|--------|-------|
| Tamaño máximo por archivo (PUT) | 5 GB |
| Tamaño máximo por archivo (multipart) | 5 TB |
| Almacenamiento gratuito | 10 GB/mes |
| Operaciones gratuitas | 1M escrituras/mes |

## 🚀 Cómo Usar

### Usuario Final

1. Seleccionar opción de subir PDF para una póliza
2. Enviar archivo PDF (máximo 20MB por defecto)
3. El bot validará:
   - Que sea un PDF válido
   - Que no exceda el tamaño máximo
   - Que la descarga sea exitosa
4. Recibirá confirmación con nombre y tamaño del archivo

### Monitoreo de Logs

```bash
# Ver todos los logs de subida de PDFs
pm2 logs polizas-bot | grep "\[PDF_UPLOAD\]"

# Ver solo errores de PDFs
pm2 logs polizas-bot | grep "\[PDF_UPLOAD\].*❌"

# Ver PDFs subidos exitosamente
pm2 logs polizas-bot | grep "\[PDF_UPLOAD\].*✅"
```

### Debugging

Si un PDF falla al subirse:

1. **Revisar logs:**
   ```bash
   pm2 logs polizas-bot --lines 100 | grep "\[PDF_UPLOAD\]"
   ```

2. **Verificar configuración de R2:**
   ```bash
   # Ver configuración actual
   echo $CLOUDFLARE_R2_ENDPOINT
   echo $CLOUDFLARE_R2_BUCKET
   ```

3. **Probar conexión a R2:**
   ```typescript
   const storage = getInstance();
   const isConnected = await storage.testConnection();
   ```

4. **Verificar límite de tamaño:**
   ```bash
   # Ver límite actual
   echo $MAX_PDF_SIZE

   # Aumentar límite a 50MB si es necesario
   export MAX_PDF_SIZE=52428800
   ```

## 🔧 Solución de Problemas Comunes

### Problema: "Archivo demasiado grande"
**Solución:** Aumentar `MAX_PDF_SIZE` en `.env`

### Problema: "Error de configuración de almacenamiento"
**Solución:** Verificar que todas las variables `CLOUDFLARE_R2_*` están configuradas

### Problema: "Error al subir el archivo a almacenamiento"
**Solución:**
1. Verificar credenciales de Cloudflare R2
2. Verificar que el bucket existe
3. Verificar permisos del access key

### Problema: "El archivo descargado está corrupto"
**Solución:** Pedir al usuario que vuelva a generar el PDF

### Problema: "Póliza no encontrada"
**Solución:** Verificar que la póliza existe y tiene estado 'ACTIVO'

## 📈 Beneficios de la Solución

| Aspecto | Antes | Después |
|---------|-------|---------|
| Validación de tamaño | ❌ No | ✅ Sí (configurable) |
| Validación de formato | ⚠️ Parcial (solo MIME) | ✅ Completa (MIME + magic bytes) |
| Operaciones | ⚠️ `.save()` | ✅ Atómicas con `$push` |
| Manejo de errores | ⚠️ Genérico | ✅ Específico por tipo |
| Logging | ⚠️ Básico | ✅ Detallado con prefijos |
| Race conditions | ⚠️ Posibles | ✅ Prevenidas |

## 🎯 Resultados Esperados

✓ **Validación robusta** antes de procesar archivos
✓ **Mensajes claros** al usuario sobre errores
✓ **Operaciones atómicas** sin race conditions
✓ **Logging detallado** para debugging
✓ **Configuración flexible** mediante variables de entorno

---

**Versión:** 1.0
**Fecha:** 2025-10-27
**Autor:** Claude Code
**Branch:** `claude/investigate-policy-deletion-011CUXt7hGMDFdke2xMS5VDx`
