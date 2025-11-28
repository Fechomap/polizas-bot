/**
 * OcuparPolizaCallback - Wrapper para mantener compatibilidad
 *
 * Este archivo ahora delega toda la lógica al flujo refactorizado:
 * src/flows/ocupar-poliza/OcuparPolizaFlow.ts
 *
 * Arquitectura modular:
 * - PhoneStep: Manejo de teléfono
 * - LocationStep: Origen y destino
 * - ServiceRegistrationStep: Registro de servicios
 * - LegendService: Generación y envío de leyendas
 */

import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { BaseCommand, IBaseHandler } from './BaseCommand';
import type { IThreadSafeStateMap } from '../../utils/StateKeyManager';
import type ViewFilesCallbacks from './ViewFilesCallbacks';
import OcuparPolizaFlow from '../../flows/ocupar-poliza/OcuparPolizaFlow';

interface IHandler extends IBaseHandler {
    awaitingPhoneNumber: IThreadSafeStateMap<string>;
    awaitingOrigenDestino: IThreadSafeStateMap<string>;
    awaitingOrigen: IThreadSafeStateMap<string>;
    awaitingDestino: IThreadSafeStateMap<string>;
    awaitingServiceData: IThreadSafeStateMap<string>;
    awaitingServicePolicyNumber: IThreadSafeStateMap<boolean>;
    excelUploadMessages?: Map<number, number>;
    processingCallbacks?: Set<string>;
    uploadTargets: IThreadSafeStateMap<string>;
    viewFilesCallbacks?: ViewFilesCallbacks;
    registry: {
        registerCallback(pattern: RegExp, handler: (ctx: Context) => Promise<void>): void;
        getAllCommands(): Array<{
            getCommandName(): string;
            procesarDocumentoBaseAutos?(message: Message, userId: string): Promise<boolean>;
        }>;
    };
    clearChatState(chatId: number, threadId?: string | null): void;
    handleAddServicePolicyNumber?(ctx: Context, numeroPoliza: string): Promise<void>;
}

/**
 * OcuparPolizaCallback - Wrapper de compatibilidad
 *
 * Delega toda la funcionalidad al nuevo OcuparPolizaFlow refactorizado.
 * Mantiene la misma interfaz pública para compatibilidad con el código existente.
 */
class OcuparPolizaCallback extends BaseCommand {
    private flow: OcuparPolizaFlow;
    public awaitingContactTime: IThreadSafeStateMap<string>;
    public scheduledServiceInfo: IThreadSafeStateMap<any>;

    constructor(handler: IHandler) {
        super(handler);
        this.flow = new OcuparPolizaFlow(handler);
        this.awaitingContactTime = this.flow.awaitingContactTime;
        this.scheduledServiceInfo = this.flow.scheduledServiceInfo;
    }

    getCommandName(): string {
        return 'ocuparPoliza';
    }

    getDescription(): string {
        return 'Manejador para ocupar una póliza (asignar teléfono y origen-destino)';
    }

    register(): void {
        this.flow.register();
    }

    public async handleOcuparPoliza(ctx: Context, numeroPoliza: string): Promise<void> {
        return this.flow.handleOcuparPoliza(ctx, numeroPoliza);
    }

    async handlePhoneNumber(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        return this.flow.handlePhoneNumber(ctx, messageText, threadId);
    }

    async handleOrigen(ctx: Context, input: any, threadId: string | null = null): Promise<boolean> {
        return this.flow.handleOrigen(ctx, input, threadId);
    }

    async handleDestino(
        ctx: Context,
        input: any,
        threadId: string | null = null
    ): Promise<boolean> {
        return this.flow.handleDestino(ctx, input, threadId);
    }

    async handleContactTime(
        ctx: Context,
        messageText: string,
        threadId: string | null = null
    ): Promise<boolean> {
        return this.flow.handleContactTime(ctx, messageText, threadId);
    }

    public cleanupAllStates(chatId: number, threadId: string | null = null): void {
        this.flow.cleanupAllStates(chatId, threadId);
    }
}

export default OcuparPolizaCallback;
