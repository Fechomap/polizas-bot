// types/global.d.ts - Tipos globales para POLIZAS-BOT

import { Context as TelegrafContext } from 'telegraf';

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            BOT_TOKEN: string;
            MONGODB_URI: string;
            PORT?: string;
            NODE_ENV?: 'development' | 'production' | 'test';
            R2_ENDPOINT?: string;
            R2_ACCESS_KEY_ID?: string;
            R2_SECRET_ACCESS_KEY?: string;
            R2_BUCKET_NAME?: string;
            HERE_API_KEY?: string;
            ADMIN_USER_IDS?: string;
            AUTHORIZED_GROUP_IDS?: string;
        }
    }
}

// Extensión del contexto de Telegraf
export interface BotContext extends TelegrafContext {
    session?: {
        step?: string;
        data?: Record<string, any>;
        userId?: number;
        threadId?: string;
        lastActivity?: number;
        [key: string]: any;
    };
    user?: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
    };
    chat?: {
        id: number;
        type: 'private' | 'group' | 'supergroup' | 'channel';
        title?: string;
    };
    message?: any;
    threadId?: string;
}

export {};
