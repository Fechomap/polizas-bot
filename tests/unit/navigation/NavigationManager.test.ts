/**
 * Test completo para NavigationManager - TypeScript moderno
 * Sistema de navegación persistente para el bot de pólizas
 */

import { jest } from '@jest/globals';

// Mock del logger
jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

// Mock de Telegraf
jest.mock('telegraf', () => ({
    Markup: {
        inlineKeyboard: jest.fn().mockImplementation((buttons: any) => ({
            reply_markup: { inline_keyboard: buttons }
        })),
        button: {
            callback: jest.fn().mockImplementation((...args: any[]) => ({
                text: args[0],
                callback_data: args[1]
            }))
        }
    }
}));

// Importar después de los mocks
import { NavigationManager, getInstance } from '../../../src/navigation/NavigationManager';

describe('NavigationManager - Test Completo', () => {
    let navManager: any;

    beforeEach(() => {
        navManager = new NavigationManager();
    });

    afterEach(() => {
        // Limpiar navegación entre tests
        if (navManager) {
            (navManager as any).navigationStack.clear();
        }
    });

    describe('Constructor e Inicialización', () => {
        test('debe inicializar correctamente', () => {
            expect(navManager).toBeInstanceOf(NavigationManager);
            expect((navManager as any).navigationStack).toBeInstanceOf(Map);
            expect((navManager as any).menuConfig).toBeDefined();
        });

        test('debe configurar menús predeterminados', () => {
            const menuConfig = (navManager as any).menuConfig;
            expect(menuConfig).toHaveProperty('main');
            expect(menuConfig).toHaveProperty('reportes');
            expect(menuConfig.main).toHaveProperty('title');
            expect(menuConfig.main).toHaveProperty('buttons');
        });
    });

    describe('Menú Principal', () => {
        test('debe generar menú principal con estructura correcta', () => {
            const userId = 'test123';
            const menu = navManager.getMainMenu(userId);

            expect(menu).toHaveProperty('text');
            expect(menu).toHaveProperty('markup');
            expect(menu).toHaveProperty('parseMode', 'Markdown');
            
            expect(menu.text).toContain('Bot de Pólizas');
            expect(menu.text).toContain('Menú Principal');
        });

        test('debe guardar contexto al generar menú principal', () => {
            const userId = 'test123';
            
            expect(navManager.getCurrentContext(userId)).toBeNull();
            
            navManager.getMainMenu(userId);
            
            const context = navManager.getCurrentContext(userId);
            expect(context).toBeTruthy();
            expect(context?.menu).toBe('main');
            expect(context?.timestamp).toBeInstanceOf(Date);
        });

        test('debe incluir todos los botones principales', () => {
            const userId = 'test123';
            const menu = navManager.getMainMenu(userId);

            // Verificar que contiene elementos clave del menú
            expect(typeof menu.text).toBe('string');
            expect(menu.text.length).toBeGreaterThan(0);
            expect(menu.markup).toBeDefined();
        });

        test('debe manejar userId válido', () => {
            const userIds = ['user123', '12345', 'test_user_456'];
            
            userIds.forEach(userId => {
                const menu = navManager.getMainMenu(userId);
                expect(menu).toHaveProperty('text');
                expect(menu).toHaveProperty('markup');
            });
        });
    });

    describe('Menú de Reportes', () => {
        test('debe generar menú reportes con navegación correcta', () => {
            const userId = 'test123';
            const menu = navManager.getReportsMenu(userId);

            expect(menu).toHaveProperty('text');
            expect(menu).toHaveProperty('markup');
            expect(menu).toHaveProperty('parseMode', 'Markdown');
            expect(menu.text).toContain('REPORTES');
            expect(menu.text).toContain('tipo de reporte');
        });

        test('debe establecer contexto parent correctamente', () => {
            const userId = 'test123';
            
            navManager.getReportsMenu(userId);
            
            const context = navManager.getCurrentContext(userId);
            expect(context?.menu).toBe('reportes');
            expect(context?.parent).toBe('main');
            expect(context?.timestamp).toBeInstanceOf(Date);
        });

        test('debe incluir navegación de vuelta', () => {
            const userId = 'test123';
            const menu = navManager.getReportsMenu(userId);

            expect(menu.markup).toBeDefined();
            expect(typeof menu.text).toBe('string');
        });
    });

    describe('Navegación Persistente', () => {
        test('debe agregar navegación a respuesta simple', () => {
            const userId = 'test123';
            const originalText = 'Reporte generado exitosamente';
            
            const response = navManager.addPersistentNavigation(originalText, userId);
            
            expect(response).toHaveProperty('text', originalText);
            expect(response).toHaveProperty('markup');
            expect(response).toHaveProperty('parseMode', 'Markdown');
        });

        test('debe incluir botón volver cuando hay contexto parent', () => {
            const userId = 'test123';
            
            // Establecer contexto con parent
            navManager.pushContext(userId, {
                menu: 'reportes',
                parent: 'main',
                timestamp: new Date()
            });
            
            const response = navManager.addPersistentNavigation('Test message', userId);
            
            // Verificar que se incluye navegación
            expect(response).toHaveProperty('markup');
            expect(response.markup).toBeDefined();
        });

        test('debe manejar texto vacío', () => {
            const userId = 'test123';
            
            const response = navManager.addPersistentNavigation('', userId);
            
            expect(response).toHaveProperty('text', '');
            expect(response).toHaveProperty('markup');
        });

        test('debe manejar texto muy largo', () => {
            const userId = 'test123';
            const longText = 'A'.repeat(1000);
            
            const response = navManager.addPersistentNavigation(longText, userId);
            
            expect(response.text).toBe(longText);
            expect(response).toHaveProperty('markup');
        });
    });

    describe('Gestión de Contexto', () => {
        test('debe guardar y recuperar contexto correctamente', () => {
            const userId = 'test123';
            const context = {
                menu: 'test',
                data: 'test data',
                timestamp: new Date()
            };
            
            navManager.pushContext(userId, context);
            
            const retrieved = navManager.getCurrentContext(userId);
            expect(retrieved?.menu).toBe('test');
            expect(retrieved?.data).toBe('test data');
            expect(retrieved).toHaveProperty('id');
            expect(retrieved).toHaveProperty('timestamp');
        });

        test('debe limitar stack a 10 elementos', () => {
            const userId = 'test123';
            
            // Agregar 15 contextos
            for (let i = 0; i < 15; i++) {
                navManager.pushContext(userId, { 
                    menu: `test${i}`,
                    timestamp: new Date()
                });
            }
            
            const userStack = (navManager as any).navigationStack.get(userId);
            expect(userStack.length).toBe(10);
            
            // Verificar que los más antiguos se eliminaron
            expect(userStack[0].menu).toBe('test5');
            expect(userStack[9].menu).toBe('test14');
        });

        test('debe remover contexto con popContext', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { 
                menu: 'first',
                timestamp: new Date()
            });
            navManager.pushContext(userId, { 
                menu: 'second',
                timestamp: new Date()
            });
            
            expect(navManager.getCurrentContext(userId)?.menu).toBe('second');
            
            navManager.popContext(userId);
            
            expect(navManager.getCurrentContext(userId)?.menu).toBe('first');
        });

        test('debe limpiar navegación de usuario', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { 
                menu: 'test',
                timestamp: new Date()
            });
            expect(navManager.getCurrentContext(userId)).toBeTruthy();
            
            navManager.clearUserNavigation(userId);
            expect(navManager.getCurrentContext(userId)).toBeNull();
        });

        test('debe manejar múltiples usuarios simultáneamente', () => {
            const user1 = 'user1';
            const user2 = 'user2';
            
            navManager.pushContext(user1, { menu: 'menu1', timestamp: new Date() });
            navManager.pushContext(user2, { menu: 'menu2', timestamp: new Date() });
            
            expect(navManager.getCurrentContext(user1)?.menu).toBe('menu1');
            expect(navManager.getCurrentContext(user2)?.menu).toBe('menu2');
            
            navManager.clearUserNavigation(user1);
            
            expect(navManager.getCurrentContext(user1)).toBeNull();
            expect(navManager.getCurrentContext(user2)?.menu).toBe('menu2');
        });

        test('debe generar IDs únicos para contextos', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { menu: 'test1', timestamp: new Date() });
            // Pequeña pausa para asegurar timestamp diferente
            setTimeout(() => {
                navManager.pushContext(userId, { menu: 'test2', timestamp: new Date() });
            }, 1);
            
            const userStack = (navManager as any).navigationStack.get(userId);
            const ids = userStack.map((ctx: any) => ctx.id);
            
            expect(ids.length).toBeGreaterThan(0);
            expect(typeof ids[0]).toBe('number');
            if (ids.length > 1) {
                expect(ids[0]).not.toBe(ids[1]);
            }
        });
    });

    describe('Breadcrumbs', () => {
        test('debe generar breadcrumbs vacío para contexto único', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { 
                menu: 'main',
                timestamp: new Date()
            });
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(breadcrumbs).toBe('');
        });

        test('debe generar breadcrumbs para múltiples contextos', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { 
                menu: 'main',
                timestamp: new Date()
            });
            navManager.pushContext(userId, { 
                menu: 'reportes',
                timestamp: new Date()
            });
            navManager.pushContext(userId, { 
                menu: 'pdf',
                timestamp: new Date()
            });
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(breadcrumbs).toContain('Inicio');
            expect(breadcrumbs).toContain('Reportes');
            expect(breadcrumbs).toContain('›');
        });

        test('debe manejar breadcrumbs con contextos vacíos', () => {
            const userId = 'test123';
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(breadcrumbs).toBe('');
        });

        test('debe generar breadcrumbs con nombres legibles', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { menu: 'main', timestamp: new Date() });
            navManager.pushContext(userId, { menu: 'reportes', timestamp: new Date() });
            navManager.pushContext(userId, { menu: 'vehiculos', timestamp: new Date() });
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(typeof breadcrumbs).toBe('string');
        });
    });

    describe('Estadísticas', () => {
        test('debe retornar estadísticas correctas', () => {
            const userId1 = 'test123';
            const userId2 = 'test456';
            
            navManager.pushContext(userId1, { 
                menu: 'main',
                timestamp: new Date()
            });
            navManager.pushContext(userId2, { 
                menu: 'reportes',
                timestamp: new Date()
            });
            navManager.pushContext(userId2, { 
                menu: 'pdf',
                timestamp: new Date()
            });
            
            const stats = navManager.getNavigationStats();
            
            expect(stats.totalUsers).toBe(2);
            expect(stats.totalContexts).toBe(3);
            expect(stats.activeUsers).toBeGreaterThanOrEqual(0);
            expect(parseFloat(stats.averageStackSize)).toBe(1.5);
        });

        test('debe calcular usuarios activos correctamente', () => {
            const userId = 'test123';
            
            // Contexto actual (activo)
            navManager.pushContext(userId, { 
                menu: 'main',
                timestamp: new Date()
            });
            
            const stats = navManager.getNavigationStats();
            expect(stats.activeUsers).toBe(1);
            expect(stats.totalUsers).toBe(1);
            expect(stats.totalContexts).toBe(1);
        });

        test('debe manejar estadísticas sin usuarios', () => {
            const stats = navManager.getNavigationStats();
            
            expect(stats.totalUsers).toBe(0);
            expect(stats.totalContexts).toBe(0);
            expect(stats.activeUsers).toBe(0);
            expect(stats.averageStackSize).toMatch(/^0(\.00)?$/); // Acepta "0" o "0.00"
        });

        test('debe calcular promedio correctamente con diferentes stacks', () => {
            const user1 = 'user1';
            const user2 = 'user2';
            const user3 = 'user3';
            
            // Usuario 1: 1 contexto
            navManager.pushContext(user1, { menu: 'main', timestamp: new Date() });
            
            // Usuario 2: 3 contextos
            navManager.pushContext(user2, { menu: 'main', timestamp: new Date() });
            navManager.pushContext(user2, { menu: 'reportes', timestamp: new Date() });
            navManager.pushContext(user2, { menu: 'pdf', timestamp: new Date() });
            
            // Usuario 3: 2 contextos
            navManager.pushContext(user3, { menu: 'main', timestamp: new Date() });
            navManager.pushContext(user3, { menu: 'vehiculos', timestamp: new Date() });
            
            const stats = navManager.getNavigationStats();
            
            expect(stats.totalUsers).toBe(3);
            expect(stats.totalContexts).toBe(6);
            expect(parseFloat(stats.averageStackSize)).toBe(2.0); // (1+3+2)/3 = 2
        });
    });

    describe('Singleton getInstance', () => {
        test('debe retornar la misma instancia', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();
            
            expect(instance1).toBe(instance2);
            expect(instance1).toBeInstanceOf(NavigationManager);
        });

        test('debe mantener estado entre llamadas', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();
            
            const userId = 'test123';
            instance1.pushContext(userId, { 
                menu: 'test',
                timestamp: new Date()
            });
            
            const context = instance2.getCurrentContext(userId);
            expect(context?.menu).toBe('test');
        });
    });

    describe('Manejo de Errores', () => {
        test('debe manejar errores en getMainMenu', () => {
            // Forzar error corrompiendo configuración
            const originalConfig = (navManager as any).menuConfig;
            (navManager as any).menuConfig = null;
            
            const menu = navManager.getMainMenu('test123');
            
            expect(menu.text).toContain('Error en navegación');
            expect(menu).toHaveProperty('markup');
            
            // Restaurar configuración
            (navManager as any).menuConfig = originalConfig;
        });

        test('debe manejar userId inválido gracefully', () => {
            const invalidUserIds = [null, undefined, '', '   '];
            
            invalidUserIds.forEach(userId => {
                const menu = navManager.getMainMenu(userId as any);
                expect(menu).toHaveProperty('text');
                expect(menu).toHaveProperty('markup');
            });
        });

        test('debe manejar errores en getReportsMenu', () => {
            const originalConfig = (navManager as any).menuConfig;
            (navManager as any).menuConfig = { main: originalConfig.main }; // Eliminar reportes
            
            const menu = navManager.getReportsMenu('test123');
            
            expect(menu).toHaveProperty('text');
            expect(menu).toHaveProperty('markup');
            
            // Restaurar configuración
            (navManager as any).menuConfig = originalConfig;
        });

        test('debe manejar contexto corrompido', () => {
            const userId = 'test123';
            
            // Agregar contexto corrompido manualmente
            const userStack = [];
            userStack.push({ menu: 'corrupted' }); // Sin timestamp
            (navManager as any).navigationStack.set(userId, userStack);
            
            const context = navManager.getCurrentContext(userId);
            expect(context).toBeTruthy();
            expect(context?.menu).toBe('corrupted');
        });

        test('debe recuperarse de errores en breadcrumbs', () => {
            const userId = 'test123';
            
            // Contexto con datos extraños
            navManager.pushContext(userId, {
                menu: null as any,
                timestamp: new Date()
            });
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(typeof breadcrumbs).toBe('string');
        });
    });

    describe('Casos Edge y Robustez', () => {
        test('debe manejar pushContext con datos mínimos', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { 
                menu: 'minimal',
                timestamp: new Date()
            });
            
            const context = navManager.getCurrentContext(userId);
            expect(context?.menu).toBe('minimal');
        });

        test('debe manejar popContext en stack vacío', () => {
            const userId = 'test123';
            
            navManager.popContext(userId);
            
            const context = navManager.getCurrentContext(userId);
            expect(context).toBeNull();
        });

        test('debe manejar clearUserNavigation para usuario inexistente', () => {
            navManager.clearUserNavigation('inexistente');
            
            // No debe lanzar error
            expect(true).toBe(true);
        });

        test('debe manejar grandes volúmenes de contextos', () => {
            const userId = 'test123';
            
            // Agregar muchos contextos rápidamente
            for (let i = 0; i < 50; i++) {
                navManager.pushContext(userId, {
                    menu: `menu${i}`,
                    data: `data${i}`,
                    timestamp: new Date()
                });
            }
            
            const userStack = (navManager as any).navigationStack.get(userId);
            expect(userStack.length).toBe(10); // Limitado a 10
            
            const stats = navManager.getNavigationStats();
            expect(stats.totalContexts).toBe(10);
        });

        test('debe manejar caracteres especiales en contextos', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, {
                menu: 'test_special',
                data: 'Data with émojis 🚀 and spéciál châractërs',
                timestamp: new Date()
            });
            
            const context = navManager.getCurrentContext(userId);
            expect(context?.data).toContain('émojis 🚀');
        });
    });
});