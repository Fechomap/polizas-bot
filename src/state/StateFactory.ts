// src/state/StateFactory.ts

import { IStateManager } from './IStateManager';
import { RedisStateManager } from './RedisStateManager';
import { MemoryStateManager } from './MemoryStateManager';
import logger from '../utils/logger';

/**
 * Factory para crear una instancia del gestor de estado apropiado.
 * Selecciona Redis para producción y un gestor en memoria para otros entornos.
 */
class StateFactory {
    private static instance: IStateManager;

    public static create(): IStateManager {
        if (!this.instance) {
            if (process.env.NODE_ENV === 'production') {
                logger.info('Usando RedisStateManager para producción.');
                this.instance = new RedisStateManager();
            } else {
                logger.info('Usando MemoryStateManager para desarrollo.');
                this.instance = new MemoryStateManager();
            }
        }
        return this.instance;
    }
}

export const stateManager = StateFactory.create();
