-- ============================================
-- MIGRACIÓN: Índices de Rendimiento
-- Fecha: 2025-12-15
-- Autor: Claude Code
-- ============================================
--
-- CONTEXTO:
-- Post-migración MongoDB → PostgreSQL, se detectaron queries lentas
-- debido a falta de índices para ordenamiento y paginación.
--
-- PROBLEMA DETECTADO:
-- 1. PolicyRepository.findMany() ordena por createdAt sin índice
-- 2. ScheduledJobsService ordena servicios por fechaServicio sin índice
--
-- QUERIES AFECTADAS:
-- - prisma.policy.findMany({ orderBy: { createdAt: 'desc' } })
-- - prisma.servicio.findMany({ orderBy: { fechaServicio: 'desc' } })
--
-- IMPACTO ESPERADO:
-- - Mejora en listados paginados del admin
-- - Mejora en job diario de cálculo de días de pólizas
-- ============================================

-- CreateIndex
-- Índice para paginación ordenada por fecha de creación en Policy
-- Usado en: PolicyRepository.findMany(), admin listados
CREATE INDEX "Policy_createdAt_idx" ON "Policy"("createdAt" DESC);

-- CreateIndex
-- Índice para ordenamiento por fecha de servicio
-- Usado en: ScheduledJobsService.limpiarNIVsUsados(), carga de servicios ordenados
CREATE INDEX "Servicio_fechaServicio_idx" ON "Servicio"("fechaServicio" DESC);
