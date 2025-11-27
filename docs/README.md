# Documentacion del Proyecto - Bot Polizas

## Documentos Disponibles

### AUDITORIA_REFACTORIZACION.md
Resumen ejecutivo de la refactorizacion completada (Nov 2025):
- Clean Architecture implementada
- Sistema de estado persistente (Redis)
- Sistema de colas (BullMQ)
- Cache de dos niveles

### ARQUITECTURA.md
Documentacion tecnica de la arquitectura actual:
- Stack tecnologico (Node.js, TypeScript, MongoDB, Redis)
- Modelos de datos
- Flujos principales
- Servicios externos

### ROADMAP.md
Plan de desarrollo futuro:
- Fase 1: Fundamentos (Redis, BullMQ) - COMPLETADO
- Fase 2: Arquitectura limpia - EN PROGRESO
- Fase 3: Performance
- Fase 4: Produccion

### BUGS_HISTORICOS.md
Registro de bugs criticos identificados y corregidos:
- Race conditions - CORREGIDO
- Memory leaks - CORREGIDO
- Seguridad - CORREGIDO

### CODE_SMELLS.md
Analisis de deuda tecnica:
- God classes (ahora refactorizadas)
- Funciones largas (ahora separadas en handlers)
- Codigo duplicado (eliminado)

---

**Ultima actualizacion:** 2025-11-27
**Estado del proyecto:** Refactorizacion Fase 1-2 completada
