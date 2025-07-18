const { NavigationManager, getInstance } = require('../../../src/navigation/NavigationManager');

describe('NavigationManager', () => {
    let navManager;

    beforeEach(() => {
        navManager = new NavigationManager();
    });

    afterEach(() => {
        // Limpiar navegación entre tests
        if (navManager) {
            navManager.navigationStack.clear();
        }
    });

    describe('Menú Principal', () => {
        test('debe generar menú principal con botones correctos', () => {
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
            expect(context.menu).toBe('main');
        });
    });

    describe('Menú de Reportes', () => {
        test('debe generar menú reportes con navegación', () => {
            const userId = 'test123';
            const menu = navManager.getReportsMenu(userId);

            expect(menu).toHaveProperty('text');
            expect(menu).toHaveProperty('markup');
            expect(menu.text).toContain('REPORTES');
            expect(menu.text).toContain('tipo de reporte');
        });

        test('debe establecer contexto parent correctamente', () => {
            const userId = 'test123';
            
            navManager.getReportsMenu(userId);
            
            const context = navManager.getCurrentContext(userId);
            expect(context.menu).toBe('reportes');
            expect(context.parent).toBe('main');
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
                parent: 'main'
            });
            
            const response = navManager.addPersistentNavigation('Test message', userId);
            
            // Verificar que se incluye navegación
            expect(response).toHaveProperty('markup');
        });
    });

    describe('Gestión de Contexto', () => {
        test('debe guardar y recuperar contexto correctamente', () => {
            const userId = 'test123';
            const context = {
                menu: 'test',
                data: 'test data'
            };
            
            navManager.pushContext(userId, context);
            
            const retrieved = navManager.getCurrentContext(userId);
            expect(retrieved.menu).toBe('test');
            expect(retrieved.data).toBe('test data');
            expect(retrieved).toHaveProperty('id');
            expect(retrieved).toHaveProperty('timestamp');
        });

        test('debe limitar stack a 10 elementos', () => {
            const userId = 'test123';
            
            // Agregar 15 contextos
            for (let i = 0; i < 15; i++) {
                navManager.pushContext(userId, { menu: `test${i}` });
            }
            
            const userStack = navManager.navigationStack.get(userId);
            expect(userStack.length).toBe(10);
            
            // Verificar que los más antiguos se eliminaron
            expect(userStack[0].menu).toBe('test5');
            expect(userStack[9].menu).toBe('test14');
        });

        test('debe remover contexto con popContext', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { menu: 'first' });
            navManager.pushContext(userId, { menu: 'second' });
            
            expect(navManager.getCurrentContext(userId).menu).toBe('second');
            
            navManager.popContext(userId);
            
            expect(navManager.getCurrentContext(userId).menu).toBe('first');
        });

        test('debe limpiar navegación de usuario', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { menu: 'test' });
            expect(navManager.getCurrentContext(userId)).toBeTruthy();
            
            navManager.clearUserNavigation(userId);
            expect(navManager.getCurrentContext(userId)).toBeNull();
        });
    });

    describe('Breadcrumbs', () => {
        test('debe generar breadcrumbs vacío para contexto único', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { menu: 'main' });
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(breadcrumbs).toBe('');
        });

        test('debe generar breadcrumbs para múltiples contextos', () => {
            const userId = 'test123';
            
            navManager.pushContext(userId, { menu: 'main' });
            navManager.pushContext(userId, { menu: 'reportes' });
            navManager.pushContext(userId, { menu: 'pdf' });
            
            const breadcrumbs = navManager.getBreadcrumbs(userId);
            expect(breadcrumbs).toContain('Inicio');
            expect(breadcrumbs).toContain('Reportes');
            expect(breadcrumbs).toContain('›');
        });
    });

    describe('Estadísticas', () => {
        test('debe retornar estadísticas correctas', () => {
            const userId1 = 'test123';
            const userId2 = 'test456';
            
            navManager.pushContext(userId1, { menu: 'main' });
            navManager.pushContext(userId2, { menu: 'reportes' });
            navManager.pushContext(userId2, { menu: 'pdf' });
            
            const stats = navManager.getNavigationStats();
            
            expect(stats.totalUsers).toBe(2);
            expect(stats.totalContexts).toBe(3);
            expect(stats.activeUsers).toBeGreaterThanOrEqual(0);
            expect(parseFloat(stats.averageStackSize)).toBe(1.5);
        });

        test('debe calcular usuarios activos correctamente', () => {
            const userId = 'test123';
            
            // Contexto actual (activo)
            navManager.pushContext(userId, { menu: 'main' });
            
            const stats = navManager.getNavigationStats();
            expect(stats.activeUsers).toBe(1);
        });
    });

    describe('Singleton getInstance', () => {
        test('debe retornar la misma instancia', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();
            
            expect(instance1).toBe(instance2);
            expect(instance1).toBeInstanceOf(NavigationManager);
        });
    });

    describe('Manejo de Errores', () => {
        test('debe manejar errores en getMainMenu', () => {
            // Forzar error corrompiendo configuración
            const originalConfig = navManager.menuConfig;
            navManager.menuConfig = null;
            
            const menu = navManager.getMainMenu('test123');
            
            expect(menu.text).toContain('Error en navegación');
            
            // Restaurar configuración
            navManager.menuConfig = originalConfig;
        });

        test('debe manejar userId inválido gracefully', () => {
            const menu = navManager.getMainMenu(null);
            expect(menu).toHaveProperty('text');
            expect(menu).toHaveProperty('markup');
        });
    });
});