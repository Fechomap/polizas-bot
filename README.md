# Bot de Pólizas para Telegram

Bot para gestión de pólizas de seguros a través de Telegram. Permite registrar, consultar y dar seguimiento a pólizas, incluyendo pagos, servicios y documentación asociada.

## Características Principales

- Registro completo de pólizas de seguros
- **Sistema automatizado de registros vs servicios**: Diferenciación entre intentos y servicios confirmados
- **Cálculos automáticos**: Costo, fecha, origen/destino y horarios de contacto/término
- **Integración HERE Maps**: Geocoding reverso, cálculo de rutas y tiempos con fallback Haversine
- **Programación automática**: Notificaciones de contacto (22-39 min aleatorios) y término (ruta + 40 min)
- Gestión de pagos y servicios con seguimiento completo
- Carga de fotos y documentos PDF con almacenamiento en Cloudflare R2
- Reportes de estado y alertas automáticas
- Almacenamiento de datos en MongoDB con esquemas optimizados
- Borrado lógico de pólizas
- Exportación e importación en formato Excel

## Requisitos

- Node.js 16 o superior
- MongoDB (para almacenamiento de datos)
- Token de Bot de Telegram
- Grupo autorizado en Telegram
- **API Key de HERE Maps** (para geocoding y cálculo de rutas)
- **Cuenta Cloudflare R2** (para almacenamiento de archivos)

## Instalación

```bash
# Clonar repositorio
git clone [url-repositorio]
cd polizas-bot

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

## Configuración

Edita el archivo `.env` con las siguientes variables:

```
# MongoDB
MONGO_URI=mongodb+srv://[usuario]:[contraseña]@[cluster]/[database]

# Telegram
TELEGRAM_TOKEN=[tu_token_de_telegram]
TELEGRAM_GROUP_ID=-1002291817096

# HERE Maps API (para geocoding y rutas)
HERE_MAPS_API_KEY=[tu_api_key_de_here_maps]

# Cloudflare R2 (para almacenamiento de archivos)
CLOUDFLARE_R2_ENDPOINT=[tu_endpoint_r2]
CLOUDFLARE_R2_ACCESS_KEY=[tu_access_key]
CLOUDFLARE_R2_SECRET_KEY=[tu_secret_key]
CLOUDFLARE_R2_BUCKET=[nombre_del_bucket]

# Configuración del servidor
PORT=3000
NODE_ENV=production
SESSION_TIMEOUT=1800000
```

## Comandos y Funcionalidades

### 🎯 Comandos Principales

| Comando | Función | Descripción |
|---------|---------|-------------|
| `/start` | **Menú Principal** | Inicia el bot y muestra todas las opciones disponibles |
| **📋 Consultar Póliza** | `/get` | Busca y muestra información completa de una póliza |
| **💾 Registrar Póliza** | `/save` | Crea una nueva póliza con datos completos |
| **💰 Añadir Pago** | `/addpayment` | Registra pagos realizados para una póliza |
| **🚗 Añadir Servicio** | `/addservice` | **Sistema automatizado** de registro de servicios |
| **📁 Subir Archivos** | `/upload` | Adjunta fotos y PDFs a pólizas existentes |

### 🔧 Funciones Administrativas

| Función | Comando | Descripción |
|---------|---------|-------------|
| **📊 Reportes de Pagos** | `/reportPayment` | Pólizas con pagos pendientes |
| **📈 Reportes de Uso** | `/reportUsed` | Pólizas sin servicios recientes |
| **🗑️ Eliminar Póliza** | `/delete` | Borrado lógico (solo admins) |
| **📋 Ver Eliminadas** | `/listdeleted` | Lista pólizas marcadas como eliminadas |
| **❓ Ayuda** | Botón ayuda | Guía completa de uso |

### ⚡ Flujo Automatizado de Servicios

#### **Ocupar Póliza** - Proceso Simplificado
1. **📱 Teléfono**: Muestra el existente con opciones `CAMBIAR/MANTENER`
2. **📍 Ubicaciones**: Solo solicita `ORIGEN` y `DESTINO` (geocoding automático)
3. **✨ Cálculos Automáticos**: 
   - Costo: `distancia × $20 + $650`
   - Fecha: Automática (momento actual)
   - Ruta: HERE Maps con fallback Haversine
4. **🎯 Leyenda Explosiva**: Envío automático al grupo con formato visual
5. **📝 Registro**: Solo requiere número de expediente
6. **⏰ Notificaciones**: Programación automática de contacto y término

#### **Estados del Sistema**
- **REGISTROS**: Todos los intentos (asignados y no asignados)
- **SERVICIOS**: Solo confirmados como "Asignados"
- **NOTIFICACIONES**: Contacto (22-39 min) y Término (ruta + 1.6×)

## Estructura del Proyecto

```
polizas-bot/
├── src/
│   ├── bot.js             # Punto de entrada principal
│   ├── config.js          # Configuración general
│   ├── database.js        # Conexión a MongoDB
│   ├── comandos/
│   │   ├── commandHandler.js     # Manejo de comandos del bot
│   │   ├── handleServiceData.js  # Procesamiento automático de servicios
│   │   └── comandos/
│   │       └── OcuparPolizaCallback.js # Manejo de callbacks y automatización
│   ├── controllers/
│   │   └── policyController.js   # Lógica de negocio con registros vs servicios
│   ├── middleware/
│   │   └── groupHandler.js       # Validación de grupos
│   ├── models/
│   │   └── policy.js            # Modelo con esquemas de registros y servicios
│   ├── services/
│   │   └── HereMapsService.js   # Integración con HERE Maps API
│   └── utils/
│       ├── fileHandler.js       # Manejo de archivos
│       ├── FlowStateManager.js  # Gestión de estados de flujo
│       └── logger.js           # Sistema de logs
├── scripts/
│   ├── backup/            # Directorio para respaldos
│   ├── debug/             # Scripts de depuración para HERE Maps
│   ├── calculoEstadosDB.js # Cálculo de estados de pólizas
│   ├── clearAll.js        # Limpieza de base de datos
│   ├── deletePolicy.js    # Eliminar póliza permanentemente
│   ├── estados.js         # Coordinador de cálculo y exportación
│   ├── export.js          # Exportación completa (datos y archivos)
│   ├── exportExcel.js     # Exportación solo a Excel
│   ├── import.js          # Importación completa
│   └── importExcel.js     # Importación solo desde Excel
├── tests/                 # Tests unitarios
│   └── services/          # Tests de servicios
└── logs/                  # Directorio para logs
```

## Ejecución

```bash
# Desarrollo (con recarga automática)
npm run dev

# Producción
npm start

# Verificar sintaxis y estilo de código
npm run lint

# Ejecutar tests unitarios
npm test

# Reinstalación de dependencias
npm run reinstall
```

## 🚀 Sistema Automatizado de Servicios

### Nuevo Flujo de Registro (v2.0)

El sistema ahora diferencia entre **registros** (intentos) y **servicios** (confirmados):

#### Flujo Anterior vs Nuevo
| Aspecto | ❌ Flujo Anterior | ✅ Flujo Nuevo |
|---------|------------------|----------------|
| **Entrada manual** | 4 datos (costo, fecha, expediente, origen/destino) | 1 dato (solo expediente) |
| **Cálculos** | Manuales y propensos a error | Automáticos basados en HERE Maps |
| **Persistencia** | Se perdían intentos fallidos | Todo se guarda como registro |
| **Horarios** | Entrada manual | Cálculo automático aleatorio |

#### Automatización Implementada

1. **Cálculo de Costo**: `distanciaKm × $20 + $650`
2. **Fecha**: Automática (momento del registro)
3. **Origen/Destino**: Extraído de geocoding de HERE Maps
4. **Hora de Contacto**: Aleatoria entre 22-39 minutos después de "Asignado"
5. **Hora de Término**: Contacto + tiempo de ruta + 40 minutos adicionales

#### Estados del Sistema

- **REGISTROS** (`registros[]`):
  - `PENDIENTE`: Recién creado, esperando confirmación
  - `ASIGNADO`: Convertido a servicio confirmado
  - `NO_ASIGNADO`: Intento no exitoso, pero guardado para histórico

- **SERVICIOS** (`servicios[]`):
  - Solo los confirmados como "Asignados"
  - Incluyen fechas programadas de contacto y término
  - Vinculados al registro origen para trazabilidad

#### Tecnologías Integradas

- **HERE Maps API**: Geocoding reverso, cálculo de rutas y tiempo
- **Fallback Haversine**: Cálculo de distancia cuando HERE Maps falla
- **MongoDB Optimizado**: Esquemas separados para registros y servicios
- **Cloudflare R2**: Almacenamiento escalable de archivos

## Mantenimiento

### Respaldos

```bash
# Crear respaldo completo (archivos y datos)
node scripts/export.js

# Exportar solo a Excel (más rápido)
node scripts/exportExcel.js
```

### Restauración

```bash
# Restaurar desde respaldo
node scripts/import.js

# Importar solo desde Excel
node scripts/importExcel.js scripts/backup/polizas_backup.xlsx
```

### Cálculo de Estados

```bash
# Actualizar estados de pólizas
node scripts/calculoEstadosDB.js

# Actualizar estados y exportar a Excel
node scripts/estados.js
```

### Administración

```bash
# Eliminar TODOS los datos (¡PELIGROSO!)
node scripts/clearAll.js

# Eliminar una póliza permanentemente
node scripts/deletePolicy.js
```

## Despliegue en Railway

### Configuración inicial

1. Instala Railway CLI:
```bash
npm i -g @railway/cli
```

2. Inicia sesión en Railway:
```bash
railway login
```

3. Conecta tu proyecto:
```bash
railway link
```

4. Configura las variables de entorno en Railway:
   - Ve a tu proyecto en Railway Dashboard
   - Navega a Variables > Raw Editor
   - Copia tus variables de entorno

### Despliegue

1. Para desplegar el código:
```bash
# Conectar el repositorio
railway link

# Desplegar automáticamente con GitHub
# O manualmente:
railway up
```

2. Para escalar el servicio:
   - Ve a Railway Dashboard
   - Selecciona tu servicio
   - En la pestaña Settings, ajusta la cantidad de replicas

3. Para ver logs:
```bash
railway logs
```

4. Para acceder a la base de datos:
```bash
railway connect mongodb
```

### Gestión del proyecto

- **Monitoreo**: Railway proporciona métricas automáticas en el dashboard
- **Escalado**: Ajusta los recursos desde la interfaz web
- **Backups**: Railway mantiene respaldos automáticos de la base de datos
- **Dominios**: Asigna un dominio personalizado desde el tab de Settings

## Consideraciones

- **Respaldos**: Realiza respaldos periódicos con `node scripts/export.js`
- **Monitoreo**: Revisa regularmente los logs en `/logs`
- **Seguridad**: Solo usuarios en el grupo autorizado pueden usar el bot
- **Borrado**: Las pólizas se marcan como "ELIMINADO" pero no se borran de la base
- **Escalado**: Railway maneja el escalado automático según demanda
- **HERE Maps**: La API key debe tener permisos de geocoding y routing
- **Registros vs Servicios**: Los registros persisten todos los intentos, servicios solo los confirmados
- **Automatización**: El sistema calcula horarios automáticamente, reduciendo error humano

## Licencia

ISC

## Soporte

Para soporte técnico, contacta al desarrollador.