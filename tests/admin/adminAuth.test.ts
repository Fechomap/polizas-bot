/**
 * Test funcional para AdminAuth - Verifica autenticación y autorización
 */

import { jest } from '@jest/globals';
import AdminAuth from '../../src/admin/middleware/adminAuth';
import { Context } from 'telegraf';
import { ChatMember } from 'telegraf/typings/core/types/typegram';

// Mock del logger para evitar logs en tests
jest.mock('../../src/utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
}));

// Mock del config
jest.mock('../../src/config', () => ({}));

describe('AdminAuth - Sistema de Autenticación', () => {
    // Mock de contexto básico
    const createMockCtx = (userId: number, chatType: 'private' | 'group' = 'private'): Partial<Context> => ({
        from: { 
            id: userId, 
            username: 'testuser',
            is_bot: false,
            first_name: 'Test'
        },
        chat: chatType === 'private' 
            ? { id: userId, type: 'private', first_name: 'Test', username: 'testuser' }
            : { id: -1000, type: 'group', title: 'Test Group' },
        getChatMember: jest.fn() as jest.MockedFunction<(userId: number) => Promise<ChatMember>>,
        reply: jest.fn() as jest.MockedFunction<(text: string) => Promise<any>>
    });

    beforeEach(() => {
        // Limpiar variables de entorno y caché antes de cada test
        delete process.env.ADMIN_USER_ID;
        AdminAuth.clearCache();
        jest.clearAllMocks();
    });

    describe('isAdmin() - Verificación de permisos', () => {
        test('Debe retornar false si no hay ADMIN_USER_ID configurado', async () => {
            const ctx = createMockCtx(123);
            
            const isAdmin = await AdminAuth.isAdmin(ctx as Context);
            
            expect(isAdmin).toBe(false);
        });

        test('Debe permitir acceso al ADMIN_USER_ID configurado', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(123456);
            
            const isAdmin = await AdminAuth.isAdmin(ctx as Context);
            
            expect(isAdmin).toBe(true);
        });

        test('En chat privado solo debe permitir al ADMIN_USER_ID', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(999999, 'private'); // Usuario diferente
            
            const isAdmin = await AdminAuth.isAdmin(ctx as Context);
            
            expect(isAdmin).toBe(false);
        });

        test('En grupos debe verificar permisos de Telegram para admin', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(999999, 'group');
            
            // Mock para getChatMember que retorna administrador
            const mockGetChatMember = ctx.getChatMember as jest.MockedFunction<(userId: number) => Promise<ChatMember>>;
            mockGetChatMember.mockResolvedValue({
                status: 'administrator',
                user: { id: 999999, is_bot: false, first_name: 'Test' }
            } as ChatMember);
            
            const isAdmin = await AdminAuth.isAdmin(ctx as Context);
            
            expect(isAdmin).toBe(true);
            expect(ctx.getChatMember).toHaveBeenCalledWith(999999);
        });

        test('En grupos debe denegar a usuarios normales', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(999999, 'group');
            
            // Mock para getChatMember que retorna usuario normal
            const mockGetChatMember = ctx.getChatMember as jest.MockedFunction<(userId: number) => Promise<ChatMember>>;
            mockGetChatMember.mockResolvedValue({
                status: 'member',
                user: { id: 999999, is_bot: false, first_name: 'Test' }
            } as ChatMember);
            
            const isAdmin = await AdminAuth.isAdmin(ctx as Context);
            
            expect(isAdmin).toBe(false);
        });

        test('Debe manejar errores de getChatMember', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(999999, 'group');
            
            // Mock que falla
            const mockGetChatMember = ctx.getChatMember as jest.MockedFunction<(userId: number) => Promise<ChatMember>>;
            mockGetChatMember.mockRejectedValue(new Error('API Error'));
            
            const isAdmin = await AdminAuth.isAdmin(ctx as Context);
            
            expect(isAdmin).toBe(false);
        });
    });

    describe('requireAdmin() - Middleware de autorización', () => {
        test('Debe llamar next() si el usuario es admin', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(123456);
            const next = jest.fn() as jest.MockedFunction<() => Promise<void>>;
            next.mockResolvedValue();
            
            await AdminAuth.requireAdmin(ctx as Context, next);
            
            expect(next).toHaveBeenCalled();
            expect(ctx.reply).not.toHaveBeenCalled();
        });

        test('Debe enviar mensaje de error si no es admin', async () => {
            process.env.ADMIN_USER_ID = '123456';
            const ctx = createMockCtx(999999, 'private');
            const next = jest.fn() as jest.MockedFunction<() => Promise<void>>;
            next.mockResolvedValue();
            
            await AdminAuth.requireAdmin(ctx as Context, next);
            
            expect(next).not.toHaveBeenCalled();
            expect(ctx.reply).toHaveBeenCalledWith(
                '⛔ No tienes permisos para usar esta función. Solo administradores.'
            );
        });
    });

    describe('middleware() - Logging de acciones admin', () => {
        test('Debe procesar callback queries admin', async () => {
            const ctx = {
                update: {
                    callback_query: {
                        data: 'admin_menu'
                    }
                },
                from: { id: 123, username: 'testuser' }
            } as any;
            const next = jest.fn() as jest.MockedFunction<() => Promise<void>>;
            next.mockResolvedValue();
            
            await AdminAuth.middleware(ctx, next);
            
            expect(next).toHaveBeenCalled();
        });

        test('Debe procesar comandos admin', async () => {
            const ctx = {
                update: {},
                message: {
                    text: '/admin'
                },
                from: { id: 123, username: 'testuser' }
            } as any;
            const next = jest.fn() as jest.MockedFunction<() => Promise<void>>;
            next.mockResolvedValue();
            
            await AdminAuth.middleware(ctx, next);
            
            expect(next).toHaveBeenCalled();
        });
    });

    describe('clearCache() - Gestión de caché', () => {
        test('Debe limpiar el caché correctamente', () => {
            // Esta función debería ejecutarse sin errores
            expect(() => AdminAuth.clearCache()).not.toThrow();
        });
    });
});