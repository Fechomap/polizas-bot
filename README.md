# Bot de Pólizas para Telegram

Bot para gestión de pólizas de seguros a través de Telegram. Permite registrar, consultar y dar seguimiento a pólizas, incluyendo pagos, servicios y documentación asociada.

## Características Principales

- Registro completo de pólizas de seguros
- **Sistema automatizado de registros vs servicios**: Diferenciación entre intentos y servicios confirmados
- **Cálculos automáticos**: Costo, fecha, origen/destino y horarios de contacto/término
- **Integración HERE Maps**: Geocoding reverso, cálculo de rutas y tiempos con fallback Haversine
- **Programación automática**: Notificaciones de contacto (22-39 min aleatorios) y término (ruta + 40 min)
- **Sistema NIV Automático**: Conversión automática de vehículos 2023-2026 a NIVs (Números de Identificación Vehicular)
- **Base de Datos de Autos**: Registro dual de vehículos con flujos de asignación de pólizas
- Gestión de pagos y servicios con seguimiento completo
- Carga de fotos y documentos PDF con almacenamiento en Cloudflare R2
- Reportes de estado y alertas automáticas
- Almacenamiento de datos en MongoDB con esquemas optimizados
- Borrado lógico de pólizas
- Exportación e importación en formato Excel
- **Migración completa a TypeScript**: Mayor mantenibilidad y tipado estático

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
| **🚙 Base de Datos de Autos** | `/basedatos` | **Sistema dual** de registro de vehículos y asignación de pólizas |

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

### 🚙 Sistema de Base de Datos de Autos

#### **Flujo Dual de Gestión de Vehículos**
1. **Persona 1 - Registro de Vehículo**: Captura serie (VIN), marca, submarca, año, color, placas, fotos
2. **Persona 2 - Asignación de Póliza**: Asigna póliza con PDF, datos de aseguradora y pagos
3. **Sistema NIV Automático**: Vehículos 2023-2026 se convierten automáticamente en NIVs
4. **Reportes Integrados**: NIVs aparecen en reportes prioritarios con eliminación automática al usar

#### **Características del Sistema NIV**
- **Detección Automática**: Años 2023, 2024, 2025 y 2026
- **Conversión Directa**: Vehículo → Póliza NIV sin intervención manual
- **Número de Póliza = Serie del Vehículo**: Sin pagos ni PDF requeridos
- **Eliminación al Usar**: Se elimina automáticamente después del primer servicio

## Estructura del Proyecto

```
polizas-bot/
├── src/                   # **MIGRADO COMPLETAMENTE A TYPESCRIPT**
│   ├── bot.ts             # Punto de entrada principal
│   ├── config.ts          # Configuración general
│   ├── database.ts        # Conexión a MongoDB
│   ├── comandos/
│   │   ├── commandHandler.ts     # Manejo de comandos del bot
│   │   ├── handleServiceData.ts  # Procesamiento automático de servicios
│   │   └── comandos/
│   │       └── OcuparPolizaCallback.ts # Manejo de callbacks y automatización
│   ├── controllers/
│   │   ├── policyController.ts   # Lógica de negocio con registros vs servicios
│   │   └── vehicleController.ts  # **NUEVO**: Gestión completa de vehículos
│   ├── handlers/
│   │   ├── VehicleRegistrationHandler.ts # **NUEVO**: Registro de vehículos con NIV automático
│   │   └── PolicyAssignmentHandler.ts    # **NUEVO**: Asignación de pólizas a vehículos
│   ├── middleware/
│   │   └── groupHandler.ts       # Validación de grupos
│   ├── models/
│   │   ├── policy.ts            # Modelo con esquemas de registros y servicios + campos NIV
│   │   └── vehicle.ts           # **NUEVO**: Modelo completo de vehículos
│   ├── services/
│   │   └── HereMapsService.ts   # Integración con HERE Maps API
│   └── utils/
│       ├── fileHandler.ts       # Manejo de archivos
│       ├── FlowStateManager.ts  # Gestión de estados de flujo
│       └── logger.ts           # Sistema de logs
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
├── docs/                  # **NUEVA**: Documentación completa del proyecto
│   ├── 01-solucion-duplicacion-alertas.md
│   ├── 02-roadmap-sistema-crud.md
│   ├── 03-requerimiento-sistema-calificacion.md
│   ├── 04-sistema-bd-autos.md
│   ├── 05-resumen-final-bd-autos.md
│   ├── 06-investigacion-correcion-archivos-bd-autos.md
│   ├── 07-estado-actual-navegacion.md
│   ├── 08-typescript-migration-roadmap.md
│   ├── 09-navegacion-persistente-y-reportes.md
│   ├── 10-roadmap-navegacion-y-reportes.md
│   ├── 11-roadmap-visual-sistema-niv-automatico.md # **NUEVO**: Sistema NIV
│   ├── 12-sistema-vehiculos-nips-2024-2026.md      # **NUEVO**: Requerimientos NIV
│   └── README.md
├── tests/                 # Tests unitarios (migrados a TypeScript)
│   ├── services/          # Tests de servicios
│   └── handlers/          # **NUEVO**: Tests para handlers de vehículos
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
- **Sistema NIV**: Vehículos 2023-2026 se convierten automáticamente en pólizas sin intervención manual
- **Base de Datos de Autos**: Flujo dual para registro y asignación de vehículos
- **TypeScript**: Proyecto completamente migrado para mejor mantenibilidad y desarrollo

## Licencia

ISC

## Soporte

Para soporte técnico, contacta al desarrollador.