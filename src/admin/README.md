# 📋 Módulo de Administración - Bot de Pólizas

## 🚀 Estado Actual: FASE 1 Completada

### ✅ Funcionalidades Implementadas

1. **Sistema de Autenticación**
   - Middleware `adminAuth.js` que valida permisos de administrador
   - Caché de permisos para optimización
   - Solo administradores del grupo pueden acceder

2. **Estructura de Menús**
   - Menú principal de administración
   - Submenús para Pólizas, Servicios y Base de Datos
   - Sistema de navegación con breadcrumbs
   - Constructor dinámico de menús

3. **Sistema de Estados**
   - `AdminStateManager` extiende FlowStateManager
   - Timeout de 5 minutos para operaciones admin
   - Limpieza automática de estados antiguos

4. **Sistema de Auditoría**
   - Modelo MongoDB para logs de auditoría
   - Registro de todas las acciones administrativas
   - Información completa: usuario, acción, cambios, timestamp

### 📂 Estructura de Archivos

```
src/admin/
├── index.js                 # Punto de entrada
├── handlers/
│   ├── policyHandler.js     # Maneja operaciones de pólizas
│   ├── serviceHandler.js    # Maneja operaciones de servicios
│   └── databaseHandler.js   # Maneja operaciones de BD
├── menus/
│   ├── adminMenu.js         # Menús principales
│   └── menuBuilder.js       # Constructor de menús
├── middleware/
│   └── adminAuth.js         # Autenticación admin
└── utils/
    ├── adminStates.js       # Gestión de estados
    └── auditLogger.js       # Sistema de auditoría
```

### 🔧 Uso

1. **Acceder al panel admin:**
   - Desde el menú principal: ADMINISTRACIÓN → Panel Administración Completo
   - Comando directo: `/admin` (solo administradores)

2. **Navegación:**
   - Usa los botones inline para navegar
   - Siempre hay opción de "Volver"
   - Los breadcrumbs muestran tu ubicación

### 🔒 Seguridad

- Solo administradores del grupo pueden acceder
- Todas las acciones se registran en auditoría
- Timeout automático de 5 minutos
- Validación en cada acción

### 🚧 Próximas Fases

- **FASE 2:** Implementar CRUD completo de pólizas
- **FASE 3:** Gestión de servicios y registros
- **FASE 4:** Estadísticas y herramientas de BD
- **FASE 5:** Testing y despliegue

### 📝 Notas para Desarrollo

- Los handlers actualmente muestran placeholders
- La funcionalidad real se implementará en fases siguientes
- El sistema de auditoría ya está funcional
- Los estados admin tienen su propio manager