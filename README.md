# Guía de Comandos Esenciales para Bot de Pólizas

## Despliegue y Gestión

### Git
```bash
# Básico
git add .                           # Agregar cambios
git commit -m "mensaje"             # Hacer commit
git push origin main                # Empujar cambios

# Ramas
git checkout -b feature             # Crear nueva rama
git merge feature                   # Fusionar rama
git branch -d feature               # Eliminar rama
```

### Heroku
```bash
# Login
heroku login                        # Login interactivo
heroku login -i                     # Login desde terminal

# Despliegue
git push heroku main                # Desplegar a Heroku
git push heroku rama:main           # Desplegar desde otra rama

# Configuración
heroku config                       # Ver variables de entorno
heroku config:set CLAVE=valor       # Establecer variable de entorno
heroku config:unset CLAVE           # Eliminar variable de entorno
heroku config:pull                  # Descargar config a .env

# Gestión de dynos
heroku ps                           # Ver estado de dynos
heroku ps:scale web=1               # Escalar dynos (activar)
heroku ps:scale web=0               # Desactivar dynos
heroku ps:restart                   # Reiniciar dynos

# Logs y monitoreo
heroku logs --tail                  # Ver logs en tiempo real
heroku maintenance:on               # Activar modo mantenimiento
heroku maintenance:off              # Desactivar modo mantenimiento
```

## Desarrollo Local

```bash
# Iniciar el Bot
npm start                           # Iniciar en modo normal
npm run dev                         # Iniciar con recarga automática (nodemon)
```

## Base de Datos

```bash
# Exportar/Importar
node scripts/export.js              # Exportar base de datos a Excel y archivos
node scripts/import.js              # Importar base de datos desde Excel y archivos

# Limpiar base de datos
node scripts/clearAll.js            # Borrar todos los documentos

# Migración
node scripts/migrateDb.js           # Ejecutar migración con respaldo automático
```

## Estructura del Bot

### Principales Archivos
- `src/bot.js`: Punto de entrada principal
- `src/comandos/commandHandler.js`: Manejo de comandos
- `src/controllers/policyController.js`: Lógica de negocio
- `src/models/policy.js`: Modelo de datos
- `src/database.js`: Conexión a MongoDB
- `src/config.js`: Configuración general

### Comandos del Bot
- `/start`: Bienvenida e introducción
- `/save`: Registrar nueva póliza
- `/get`: Consultar una póliza
- `/upload`: Subir fotos y PDFs
- `/addpayment`: Registrar un pago
- `/addservice`: Registrar un servicio
- `/reportPayment`: Mostrar pólizas con pagos pendientes
- `/reportUsed`: Mostrar pólizas sin servicios recientes
- `/delete`: Marcar póliza como eliminada (Admin)
- `/help`: Mostrar lista de comandos

## Variables de Entorno (.env)
```
# Configuración de MongoDB
MONGO_URI=mongodb+srv://[usuario]:[contraseña]@[cluster]/[database]

# Token de Telegram Bot
TELEGRAM_TOKEN=[tu_token_de_telegram]

# Grupo autorizado (ID numérico)
TELEGRAM_GROUP_ID=-1002291817096
```

## Instalación Rápida
```bash
# Clonar repositorio
git clone [repositorio]
cd polizas-bot

# Instalar dependencias
npm install

# Configurar
cp .env.example .env
# Editar el archivo .env con las credenciales correctas

# Iniciar
npm start
```

## Mantenimiento

### Respaldos
```bash
# Crear respaldo completo
node scripts/export.js
# Los datos se guardan en scripts/backup/
```

### Restauración
```bash
# Restaurar desde respaldo
node scripts/import.js
# Lee datos desde scripts/backup/
```

### Consejos
- Realiza respaldos antes de cada despliegue
- Mantén al menos 3 versiones de respaldo
- Monitorea los logs de errores periódicamente
- Escala a 0 los dynos cuando no se necesite el bot para ahorrar recursos