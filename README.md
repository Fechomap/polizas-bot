# Guía Completa de Comandos para Desarrollo y Despliegue

## Tabla de Contenidos
- [Gestión del Bot](#gestión-del-bot)
- [Base de Datos](#base-de-datos)
- [Logs y Monitoreo](#logs-y-monitoreo)
- [Exportación de Datos](#exportación-de-datos)
- [Mantenimiento](#mantenimiento)
- [Instalación y Configuración](#instalación-y-configuración)
- [Control de Versiones](#control-de-versiones)
- [Despliegue Local](#despliegue-local)
- [Despliegue en Heroku](#despliegue-en-heroku)
- [Testing](#testing)
- [Documentación](#documentación)
- [Variables de Entorno](#variables-de-entorno)
- [Utilidades](#utilidades)

## Gestión del Bot
```bash
# Iniciar el Bot
nodemon src/bot.js                    # Modo desarrollo con recarga automática
node src/bot.js                       # Modo normal
NODE_ENV=production node src/bot.js   # Modo producción

# Gestión con PM2
pm2 start src/bot.js --name "bot"     # Iniciar con PM2
pm2 stop bot                          # Detener bot
pm2 restart bot                       # Reiniciar bot
pm2 logs bot                          # Ver logs en tiempo real
pm2 monit                            # Monitorear recursos
pm2 save                             # Guardar configuración actual
pm2 startup                          # Configurar inicio automático
```

## Base de Datos
```bash
# Operaciones básicas
node scripts/export.js                # Exportar base de datos
node scripts/import.js                # Importar base de datos
node scripts/clearAll.js              # Limpiar base de datos

# Respaldos
node scripts/backup.js                # Crear respaldo completo
node scripts/restore.js               # Restaurar desde respaldo
node scripts/validateBackup.js        # Validar respaldo

# Mantenimiento DB
node scripts/optimizeDb.js            # Optimizar base de datos
node scripts/validateDb.js            # Validar integridad
node scripts/migrateDb.js            # Ejecutar migraciones
```

## Logs y Monitoreo
```bash
# Ver logs en tiempo real
tail -f logs/combined.log             # Ver todos los logs
tail -f logs/error.log               # Ver solo errores
tail -f logs/debug.log               # Ver logs de depuración

# Análisis de logs
grep "ERROR" logs/combined.log       # Buscar errores
grep "WARNING" logs/combined.log     # Buscar advertencias
grep -r "pattern" logs/             # Buscar patrón en todos los logs

# Rotación de logs
node scripts/rotateLogs.js          # Rotar logs manualmente
node scripts/cleanOldLogs.js        # Limpiar logs antiguos
```

## Exportación de Datos
```bash
# Exportar en diferentes formatos
node scripts/exportToExcel.js         # Exportar a Excel
node scripts/exportToJson.js          # Exportar a JSON
node scripts/exportToCsv.js           # Exportar a CSV

# Exportar datos específicos
node scripts/exportUsers.js           # Exportar usuarios
node scripts/exportStats.js           # Exportar estadísticas
node scripts/exportConfig.js          # Exportar configuración
```

## Mantenimiento
```bash
# Limpieza
rm -rf node_modules/                  # Limpiar módulos
rm -f logs/*.log                     # Limpiar logs
npm cache clean --force              # Limpiar caché de npm
node scripts/cleanTemp.js            # Limpiar archivos temporales

# Actualización de dependencias
npm update                           # Actualizar dependencias
npm audit fix                       # Corregir vulnerabilidades
npm outdated                       # Ver paquetes desactualizados
```

## Instalación y Configuración
```bash
# Instalación
npm install                          # Instalación normal
npm install --include=dev            # Instalación con dependencias de desarrollo
npm ci                              # Instalación limpia (usa package-lock.json)

# Configuración
cp .env.example .env                # Crear archivo de configuración
chmod +x scripts/*.js               # Dar permisos de ejecución a scripts
node scripts/initConfig.js          # Inicializar configuración
```

## Control de Versiones
```bash
# Git básico
git status                          # Ver estado del repositorio
git add .                           # Agregar cambios
git commit -m "mensaje"             # Hacer commit
git push origin main               # Empujar cambios

# Ramas y fusiones
git checkout -b feature            # Crear nueva rama
git merge feature                 # Fusionar rama
git branch -d feature            # Eliminar rama
git pull origin main            # Actualizar desde remoto

# Tags y versiones
git tag -a v1.0.0 -m "Version 1.0.0"  # Crear tag
git push origin v1.0.0                # Empujar tag
git tag -l                            # Listar tags
```

## Despliegue Local
```bash
# Despliegue básico
git pull && npm install && pm2 restart bot  # Actualizar y reiniciar

# Despliegue con respaldo
node scripts/backup.js && git pull && npm install && pm2 restart bot

# Despliegue con verificación
npm test && git pull && npm install && pm2 restart bot

# Rollback
node scripts/rollback.js           # Revertir último despliegue
git reset --hard HEAD~1           # Revertir último commit
```

## Despliegue en Heroku
```bash
# Login en Heroku
heroku login                      # Login interactivo
heroku login -i                  # Login desde terminal

# Gestión de aplicación
heroku create                    # Crear nueva aplicación
heroku git:remote -a nombre-app  # Conectar con app existente
heroku apps                     # Listar aplicaciones

# Despliegue
git push heroku main            # Desplegar a Heroku
git push heroku rama:main      # Desplegar desde otra rama
heroku builds                  # Ver historial de builds
heroku builds:cancel          # Cancelar build en curso

# Configuración
heroku config                  # Ver variables de entorno
heroku config:set CLAVE=valor # Establecer variable de entorno
heroku config:unset CLAVE    # Eliminar variable de entorno
heroku config:pull          # Descargar config a .env

# Logs y monitoreo
heroku logs --tail           # Ver logs en tiempo real
heroku ps                   # Ver estado de dynos
heroku ps:scale web=1      # Escalar dynos
heroku ps:restart         # Reiniciar dynos

# Gestión de base de datos
heroku addons              # Ver addons instalados
heroku pg:info            # Info de base de datos PostgreSQL
heroku pg:psql           # Conectar a PostgreSQL
heroku pg:backup        # Crear backup de PostgreSQL

# Mantenimiento
heroku maintenance:on     # Activar modo mantenimiento
heroku maintenance:off   # Desactivar modo mantenimiento
heroku restart          # Reiniciar aplicación
heroku run bash        # Abrir shell en dyno

# Dominios y certificados SSL
heroku domains          # Listar dominios
heroku domains:add     # Agregar dominio personalizado
heroku certs          # Gestionar certificados SSL
heroku certs:auto    # Activar SSL automático
```

## Testing
```bash
# Ejecutar pruebas
npm test                        # Ejecutar todas las pruebas
npm run test:unit              # Ejecutar pruebas unitarias
npm run test:integration      # Ejecutar pruebas de integración
npm run test:e2e             # Ejecutar pruebas end-to-end

# Cobertura de código
npm run coverage              # Generar reporte de cobertura
npm run coverage:check       # Verificar umbral de cobertura
```

## Documentación
```bash
# Generar documentación
npm run docs                 # Generar documentación
npm run docs:serve          # Servir documentación localmente
npm run docs:publish       # Publicar documentación

# Validación
npm run lint              # Ejecutar linter
npm run lint:fix         # Corregir problemas de linting
```

## Variables de Entorno
```bash
# Configuración de ambiente
export NODE_ENV=development   # Establecer ambiente de desarrollo
export NODE_ENV=production   # Establecer ambiente de producción
export DEBUG=app:*          # Activar todos los logs de depuración

# Gestión de secretos
node scripts/generateSecrets.js  # Generar nuevos secretos
node scripts/rotateSecrets.js   # Rotar secretos
```

## Utilidades
```bash
# Verificación de salud
curl http://localhost:3000/health   # Verificar estado del servidor
node scripts/checkDependencies.js  # Verificar dependencias
node scripts/validateEnv.js       # Validar variables de entorno

# Limpieza de caché
node scripts/clearCache.js        # Limpiar caché
node scripts/optimizeDb.js       # Optimizar base de datos
node scripts/clearSessions.js    # Limpiar sesiones

# Monitoreo
node scripts/checkResources.js   # Verificar uso de recursos
node scripts/monitorAPIs.js     # Monitorear APIs externas
```

## Notas Importantes

### Respaldos
- Realizar respaldos antes de cada despliegue
- Mantener al menos 3 versiones de respaldo
- Validar los respaldos periódicamente

### Seguridad
- Rotar secretos cada 90 días
- Mantener las dependencias actualizadas
- Revisar logs de errores diariamente

### Mantenimiento
- Limpiar logs antiguos mensualmente
- Optimizar la base de datos semanalmente
- Verificar uso de recursos diariamente

### Documentación
- Mantener la documentación actualizada
- Documentar cambios importantes en commits
- Mantener un registro de cambios (CHANGELOG)