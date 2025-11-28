/**
 * PolicyHandler - Wrapper de compatibilidad
 *
 * Este archivo ahora re-exporta desde el módulo refactorizado:
 * src/admin/handlers/policy/
 *
 * Arquitectura modular:
 * - PolicySearchService: Búsqueda de pólizas
 * - PolicyDisplayService: Mostrar detalles
 * - PolicyEditService: Edición de campos
 * - PolicyDeleteService: Eliminación
 * - PolicyRestoreService: Restauración
 */

export { default } from './policy';
export * from './policy';
