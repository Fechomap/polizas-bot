// src/state/MemoryStateManager.ts

import { IStateManager } from './IStateManager';

/**
 * Implementación en memoria de IStateManager.
 * Usa un Map simple para almacenar el estado. No es persistente.
 * Ideal para desarrollo y pruebas unitarias.
 */
export class MemoryStateManager implements IStateManager {
    private store = new Map<string, { value: string; expiresAt?: number }>();

    async setState(key: string, value: any, ttl?: number): Promise<void> {
        const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
        this.store.set(key, { value: JSON.stringify(value), expiresAt });
    }

    async getState<T>(key: string): Promise<T | null> {
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }

        return JSON.parse(entry.value) as T;
    }

    async deleteState(key: string): Promise<void> {
        this.store.delete(key);
    }

    async hasState(key: string): Promise<boolean> {
        return this.store.has(key);
    }

    async disconnect(): Promise<void> {
        // No es necesario hacer nada para el store en memoria
        this.store.clear();
        return Promise.resolve();
    }
}
