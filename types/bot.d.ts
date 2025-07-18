// types/bot.d.ts - Tipos específicos para el bot

import { Context } from 'telegraf';
import { BotContext } from './global';

// Tipos para comandos del bot
export type CommandType = 'text' | 'callback' | 'document' | 'photo' | 'video';

export interface ICommand {
    name: string;
    description: string;
    usage?: string;
    aliases?: string[];
    adminOnly?: boolean;
    groupOnly?: boolean;
    privateOnly?: boolean;
    execute(ctx: BotContext, args?: string[]): Promise<void>;
}

// Estados del flujo de conversación
export type FlowState =
    | 'IDLE'
    | 'REGISTERING_VEHICLE'
    | 'UPLOADING_DOCUMENTS'
    | 'ADDING_PAYMENT'
    | 'CREATING_POLICY'
    | 'SEARCHING_POLICY'
    | 'ADMIN_MENU'
    | 'REPORT_GENERATION';

// Tipos para navegación
export interface INavigationState {
    currentMenu?: string;
    previousMenu?: string;
    breadcrumb?: string[];
    data?: Record<string, any>;
}

// Tipos para teclados inline
export interface IKeyboardButton {
    text: string;
    callback_data?: string;
    url?: string;
    switch_inline_query?: string;
}

export interface IKeyboardRow extends Array<IKeyboardButton> {}

export interface IInlineKeyboard {
    inline_keyboard: IKeyboardRow[];
}

// Tipos para manejo de archivos
export interface IFileUpload {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
    mime_type?: string;
    file_name?: string;
}

// Tipos para reportes
export type ReportType = 'pdf' | 'excel' | 'csv';
export type ReportFormat = 'payments' | 'policies' | 'vehicles' | 'summary';

export interface IReportConfig {
    type: ReportType;
    format: ReportFormat;
    dateRange?: {
        start: Date;
        end: Date;
    };
    filters?: Record<string, any>;
    includeDetails?: boolean;
}

// Tipos para notificaciones
export interface INotificationData {
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    recipients: number[];
    scheduledFor?: Date;
    metadata?: Record<string, any>;
}

// Tipos para middleware
export interface IMiddlewareOptions {
    adminRequired?: boolean;
    groupRequired?: boolean;
    privateRequired?: boolean;
    rateLimited?: boolean;
    logActivity?: boolean;
}

// Tipos para validación
export interface IValidationResult {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
}

// Tipos para configuración del bot
export interface IBotConfig {
    token: string;
    webhookUrl?: string;
    port?: number;
    adminUserIds: number[];
    authorizedGroupIds: number[];
    rateLimits?: {
        windowMs: number;
        maxRequests: number;
    };
    features?: {
        fileUpload: boolean;
        reports: boolean;
        notifications: boolean;
        adminPanel: boolean;
    };
}
