# Plan de Limpieza de Archivos JS Obsoletos

## ✅ Archivos JS con equivalentes TS migrados (LISTOS PARA ELIMINAR)

### Middleware
- `src/middleware/authMiddleware.js` → `src/middleware/authMiddleware.ts` ✅
- `src/middleware/groupHandler.js` → `src/middleware/groupHandler.ts` ✅ 
- `src/middleware/threadValidator.js` → `src/middleware/threadValidator.ts` ✅

### Admin Module
- `src/admin/index.js` → `src/admin/index.ts` ✅
- `src/admin/middleware/adminAuth.js` → `src/admin/middleware/adminAuth.ts` ✅
- `src/admin/utils/calculationScheduler.js` → `src/admin/utils/calculationScheduler.ts` ✅
- `src/admin/utils/adminStates.js` → `src/admin/utils/adminStates.ts` ✅
- `src/admin/utils/chartGenerator.js` → `src/admin/utils/chartGenerator.ts` ✅
- `src/admin/utils/auditLogger.js` → `src/admin/utils/auditLogger.ts` ✅
- `src/admin/menus/menuBuilder.js` → `src/admin/menus/menuBuilder.ts` ✅
- `src/admin/menus/adminMenu.js` → `src/admin/menus/adminMenu.ts` ✅
- `src/admin/handlers/serviceHandler.js` → `src/admin/handlers/serviceHandler.ts` ✅
- `src/admin/handlers/policyHandler.js` → `src/admin/handlers/policyHandler.ts` ✅
- `src/admin/handlers/reportsHandlerV2.js` → `src/admin/handlers/reportsHandlerV2.ts` ✅
- `src/admin/handlers/reportsHandler.js` → `src/admin/handlers/reportsHandler.ts` ✅
- `src/admin/handlers/databaseHandler.js` → `src/admin/handlers/databaseHandler.ts` ✅
- `src/admin/handlers/simpleScriptsHandler.js` → `src/admin/handlers/simpleScriptsHandler.ts` ✅

### Navigation
- `src/navigation/NavigationManager.js` → `src/navigation/NavigationManager.ts` ✅
- `src/navigation/NavigationMiddleware.js` → `src/navigation/NavigationMiddleware.ts` ✅

### Core
- `src/database.js` → `src/database.ts` ✅

## 🔄 Plan de Eliminación por Fases

### FASE 1: Middleware (MENOR RIESGO)
- Eliminar middleware JS
- Probar funcionalidad básica

### FASE 2: Navigation (RIESGO MEDIO)
- Eliminar navigation JS
- Probar navegación del bot

### FASE 3: Admin Module (RIESGO ALTO)
- Eliminar handlers admin JS
- Probar funciones administrativas

### FASE 4: Core (RIESGO CRÍTICO)
- Eliminar database.js
- Verificación completa del sistema

## ⚠️ Archivos a conservar temporalmente
- Scripts en `/scripts/` (no migrados)
- Archivos de configuración específicos