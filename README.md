# Bot de Pólizas para Telegram

Bot para gestión de pólizas de seguros a través de Telegram. Permite registrar, consultar y dar seguimiento a pólizas, incluyendo pagos, servicios y documentación asociada.

## Características Principales

- Registro completo de pólizas de seguros
- Gestión de pagos y servicios
- Carga de fotos y documentos PDF
- Reportes de estado y alertas automáticas
- Almacenamiento de datos en MongoDB
- Borrado lógico de pólizas
- Exportación e importación en formato Excel

## Requisitos

- Node.js 16 o superior
- MongoDB
- Token de Bot de Telegram
- Grupo autorizado en Telegram

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

# Opcional
PORT=3000
NODE_ENV=production
```

## Comandos del Bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Bienvenida e introducción |
| `/help` | Mostrar todos los comandos disponibles |
| `/save` | Registrar Póliza |
| `/get` | Consultar una póliza existente |
| `/upload` | Subir fotos o PDFs para una póliza |
| `/addpayment` | Registrar un nuevo pago |
| `/addservice` | Registrar un nuevo servicio |
| `/reportPayment` | Mostrar pólizas con pagos pendientes |
| `/reportUsed` | Mostrar pólizas sin servicios recientes |
| `/delete` | Marcar póliza como eliminada (Admin) |
| `/listdeleted` | Listar pólizas eliminadas (Admin) |

## Estructura del Proyecto

```
polizas-bot/
├── src/
│   ├── bot.js             # Punto de entrada principal
│   ├── config.js          # Configuración general
│   ├── database.js        # Conexión a MongoDB
│   ├── comandos/
│   │   └── commandHandler.js  # Manejo de comandos del bot
│   ├── controllers/
│   │   └── policyController.js # Lógica de negocio
│   ├── middleware/
│   │   └── groupHandler.js   # Validación de grupos
│   ├── models/
│   │   └── policy.js       # Modelo de datos
│   └── utils/
│       ├── fileHandler.js  # Manejo de archivos
│       └── logger.js       # Sistema de logs
├── scripts/
│   ├── backup/            # Directorio para respaldos
│   ├── calculoEstadosDB.js # Cálculo de estados de pólizas
│   ├── clearAll.js        # Limpieza de base de datos
│   ├── deletePolicy.js    # Eliminar póliza permanentemente
│   ├── estados.js         # Coordinador de cálculo y exportación
│   ├── export.js          # Exportación completa (datos y archivos)
│   ├── exportExcel.js     # Exportación solo a Excel
│   ├── import.js          # Importación completa
│   └── importExcel.js     # Importación solo desde Excel
└── logs/                  # Directorio para logs
```

## Ejecución

```bash
# Desarrollo (con recarga automática)
npm run dev

# Producción
npm start

# Reinstalación de dependencias
npm run reinstall
```

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

## Licencia

ISC

## Soporte

Para soporte técnico, contacta al desarrollador.