# 🔍 Scripts de Investigación BD AUTOS

_Directorio: `/scripts/investigacion-bd-autos/`_

## 📋 DESCRIPCIÓN

Este directorio contiene scripts desarrollados durante la investigación y corrección del problema de archivos de 55 bytes en el sistema BD AUTOS.

## 📁 ARCHIVOS

### 🔍 **Scripts de Investigación**

- `investigacionExhaustivaBDAutos.js` - Análisis exhaustivo del sistema BD AUTOS
- `investigarPoliza12345.js` - Investigación específica de la póliza de prueba 12345
- `verificarEstadoBDAutos.js` - Verificación del estado general del sistema
- `verificarFotosBDAutos.js` - Diagnóstico específico de fotos
- `verificarPDFBDAutos.js` - Verificación específica de PDFs

### 🔧 **Scripts de Reparación**

- `repararPoliza12345.js` - Reparación de vínculos de la póliza 12345
- `repararPoliza12345Completa.js` - Reparación completa de la póliza 12345

### 🗑️ **Scripts de Limpieza**

- `eliminarPoliza12345.js` - Eliminación de la póliza de prueba 12345
- `eliminarPoliza12345Completa.js` - Eliminación completa de la póliza 12345
- `eliminarPolizasPrueba.js` - Eliminación de todas las pólizas de prueba (12345, 123456)

### 🧪 **Scripts de Prueba**

- `pruebaFlujoCompleto.js` - Prueba completa del flujo BD AUTOS

## 🚀 USO

### Scripts de Verificación

```bash
# Verificar estado general
node scripts/investigacion-bd-autos/verificarEstadoBDAutos.js

# Verificar fotos específicamente
node scripts/investigacion-bd-autos/verificarFotosBDAutos.js

# Prueba completa del flujo
node scripts/investigacion-bd-autos/pruebaFlujoCompleto.js
```

### Scripts de Limpieza

```bash
# Limpiar todas las pólizas de prueba
node scripts/investigacion-bd-autos/eliminarPolizasPrueba.js
```

## ⚠️ ADVERTENCIAS

1. **Scripts de eliminación**: Pueden eliminar datos permanentemente
2. **Scripts de reparación**: Modifican la base de datos
3. **Solo para desarrollo**: No ejecutar en producción sin supervisión
4. **Backup recomendado**: Hacer backup antes de ejecutar scripts de modificación

## 🔧 CONFIGURACIÓN REQUERIDA

- Variables de entorno configuradas (`.env`)
- Conexión a MongoDB
- Acceso a Cloudflare R2

## 📖 DOCUMENTACIÓN RELACIONADA

- `docs/05-resumen-final-bd-autos.md` - Resumen completo del sistema
- `docs/06-investigacion-correcion-archivos-bd-autos.md` - Investigación técnica

---

_Scripts de investigación BD AUTOS - Desarrollados durante la corrección del problema de archivos de 55 bytes_
