// src/state/IStateManager.ts

/**
 * Interfaz unificada para la gestión de estado.
 * Permite implementaciones tanto en memoria como en Redis.
 */
export interface IStateManager {
    /**
     * Almacena un valor en el gestor de estado.
     * @param key - La clave única para el estado.
     * @param value - El valor a almacenar (debe ser serializable a JSON).
     * @param ttl - Tiempo de vida en segundos (opcional).
     */
    setState(key: string, value: any, ttl?: number): Promise<void>;

    /**
     * Recupera un valor del gestor de estado.
     * @param key - La clave del estado a recuperar.
     * @returns El valor deserializado o null si no se encuentra.
     */
    getState<T>(key: string): Promise<T | null>;

    /**
     * Elimina un estado del gestor.
     * @param key - La clave del estado a eliminar.
     */
    deleteState(key: string): Promise<void>;

    /**
     * Verifica si una clave existe en el gestor de estado.
     * @param key - La clave a verificar.
     * @returns true si la clave existe, false en caso contrario.
     */
    hasState(key: string): Promise<boolean>;

    /**
     * Cierra la conexión con el servicio de estado (ej. Redis).
     */
    disconnect(): Promise<void>;
}
