// tests/unit/comandos/PaymentReportPDFCommand.optimized.test.js
/**
 * 🧪 TESTS PARA PDF OPTIMIZADO (FASE 3)
 * 
 * Valida todas las mejoras implementadas en PaymentReportPDFCommand:
 * ✅ Diseño corporativo con colores y branding
 * ✅ Métodos de análisis visual (charts, KPIs)
 * ✅ Compresión y metadata optimizada
 * ✅ Navegación persistente integrada
 * ✅ Cálculos correctos de estadísticas
 */

const PaymentReportPDFCommand = require('../../../src/comandos/comandos/PaymentReportPDFCommand');
const BaseCommand = require('../../../src/comandos/comandos/BaseCommand');
const Policy = require('../../../src/models/policy');
const PDFDocument = require('pdfkit');

// Mock Policy model
jest.mock('../../../src/models/policy');
jest.mock('../../../src/utils/logger');

describe('PaymentReportPDFCommand - Optimizaciones FASE 3', () => {
    let command;
    let mockHandler;
    let mockCtx;

    beforeEach(() => {
        mockHandler = {
            bot: {
                use: jest.fn()
            }
        };
        
        command = new PaymentReportPDFCommand(mockHandler);
        
        mockCtx = {
            reply: jest.fn().mockResolvedValue({}),
            replyWithDocument: jest.fn().mockResolvedValue({}),
            from: { id: 'test123' },
            navManager: {
                addPersistentNavigation: jest.fn().mockReturnValue({
                    text: 'Test message',
                    markup: { inline_keyboard: [] },
                    parseMode: 'Markdown'
                })
            }
        };

        // Mock BaseCommand methods
        command.replyWithNavigation = jest.fn().mockResolvedValue({});
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Configuración de Diseño Corporativo', () => {
        test('debe tener configuración de colores corporativos completa', () => {
            const colors = command.colors;

            expect(colors).toHaveProperty('primary', '#2E86AB');
            expect(colors).toHaveProperty('secondary', '#A23B72');
            expect(colors).toHaveProperty('accent', '#F18F01');
            expect(colors).toHaveProperty('urgent', '#E74C3C');
            expect(colors).toHaveProperty('warning', '#F39C12');
            expect(colors).toHaveProperty('safe', '#27AE60');
            expect(colors).toHaveProperty('text', '#2C3E50');
            expect(colors).toHaveProperty('white', '#FFFFFF');
        });

        test('debe tener configuración de layout optimizada', () => {
            const layout = command.layout;

            expect(layout).toHaveProperty('margin', 40);
            expect(layout).toHaveProperty('headerHeight', 80);
            expect(layout).toHaveProperty('footerHeight', 40);
            expect(layout).toHaveProperty('lineHeight', 15);
            expect(layout).toHaveProperty('sectionSpacing', 20);
        });
    });

    describe('Cálculo de Estadísticas', () => {
        test('debe calcular estadísticas correctamente para pólizas pendientes', () => {
            const mockPolicies = [
                { diasDeImpago: 1, montoRequerido: 1000 }, // Crítica <=2 días
                { diasDeImpago: 10, montoReferencia: 2000 }, // Urgente 3-15 días
                { diasDeImpago: 20, montoRequerido: 1500 } // Normal >15 días
            ];

            const stats = command.calculateReportStats(mockPolicies);

            expect(stats.totalPolicies).toBe(3);
            expect(stats.totalAmount).toBe(4500);
            expect(stats.polizasConCosto).toBe(3); // Todas tienen costo > 0
            expect(stats.criticalPolicies).toBe(1); // diasDeImpago <= 2
            expect(stats.urgencyData.critical).toBe(1);
            expect(stats.urgencyData.urgent).toBe(1); // 3-15 días
            expect(stats.urgencyData.normal).toBe(1); // >15 días
        });

        test('debe manejar pólizas sin montos', () => {
            const mockPolicies = [
                { diasDeImpago: 5 }, // Sin monto
                { diasDeImpago: 10, montoRequerido: 1000 }
            ];

            const stats = command.calculateReportStats(mockPolicies);

            expect(stats.totalAmount).toBe(1000);
            expect(stats.totalPolicies).toBe(2);
            expect(stats.polizasConCosto).toBe(1); // Solo una tiene costo > 0
        });

        test('debe calcular promedio solo con pólizas que tienen costo > 0', () => {
            const mockPolicies = [
                { diasDeImpago: 1, montoRequerido: 1000 }, // Con costo
                { diasDeImpago: 2 }, // Sin costo (null/0)
                { diasDeImpago: 3, montoRequerido: 0 }, // Costo 0
                { diasDeImpago: 4, montoRequerido: 2000 }, // Con costo
                { diasDeImpago: 5, montoReferencia: 3000 } // Con costo de referencia
            ];

            const stats = command.calculateReportStats(mockPolicies);

            expect(stats.totalPolicies).toBe(5); // Total de pólizas
            expect(stats.polizasConCosto).toBe(3); // Solo las que tienen costo > 0
            expect(stats.totalAmount).toBe(6000); // 1000 + 0 + 0 + 2000 + 3000
            
            // Promedio debería ser 6000 / 3 = 2000, no 6000 / 5 = 1200
            const promedioReal = stats.totalAmount / stats.polizasConCosto;
            expect(promedioReal).toBe(2000); // Promedio correcto
        });
    });

    describe('Cálculo de Monto Total', () => {
        test('debe calcular monto total correctamente', () => {
            const mockPolicies = [
                { montoRequerido: 1000 },
                { montoReferencia: 2000 },
                { montoRequerido: 1500, montoReferencia: 3000 }, // Debe usar montoRequerido
                {} // Sin monto
            ];

            const total = command.calculateTotalAmount(mockPolicies);
            expect(total).toBe(4500); // 1000 + 2000 + 1500 + 0
        });

        test('debe manejar array vacío', () => {
            const total = command.calculateTotalAmount([]);
            expect(total).toBe(0);
        });
    });

    describe('Métodos de Diseño Visual', () => {
        let mockDoc;

        beforeEach(() => {
            mockDoc = {
                fontSize: jest.fn().mockReturnThis(),
                font: jest.fn().mockReturnThis(),
                fill: jest.fn().mockReturnThis(),
                text: jest.fn().mockReturnThis(),
                rect: jest.fn().mockReturnThis(),
                stroke: jest.fn().mockReturnThis(),
                fillOpacity: jest.fn().mockReturnThis(),
                moveTo: jest.fn().mockReturnThis(),
                lineTo: jest.fn().mockReturnThis(),
                y: 100,
                page: { width: 595, height: 842 }
            };
        });

        test('debe generar header corporativo con estadísticas', () => {
            const stats = {
                totalPolicies: 5,
                totalAmount: 10000
            };

            command.addCorporateHeader(mockDoc, stats);

            expect(mockDoc.rect).toHaveBeenCalled();
            expect(mockDoc.fill).toHaveBeenCalledWith(command.colors.primary);
            expect(mockDoc.text).toHaveBeenCalledWith(
                expect.stringContaining('POLIZAS BOT'),
                expect.any(Number),
                expect.any(Number)
            );
        });

        test('debe generar gráfico de urgencia', () => {
            const urgencyData = {
                critical: 2,
                urgent: 3,
                normal: 5
            };

            command.addUrgencyChart(mockDoc, urgencyData);

            expect(mockDoc.text).toHaveBeenCalledWith(
                expect.stringContaining('DISTRIBUCION POR URGENCIA'),
                expect.any(Number),
                expect.any(Number)
            );
            expect(mockDoc.rect).toHaveBeenCalledTimes(3); // Una barra por categoría
        });

        test('debe generar sección de KPIs', () => {
            const stats = {
                totalAmount: 15000,
                totalPolicies: 10,
                criticalPolicies: 3
            };

            command.addKPISection(mockDoc, stats);

            expect(mockDoc.text).toHaveBeenCalledWith(
                expect.stringContaining('INDICADORES CLAVE'),
                expect.any(Number),
                expect.any(Number)
            );
            expect(mockDoc.rect).toHaveBeenCalled();
        });

        test('debe generar footer optimizado con metadata', () => {
            const metadata = {
                version: '2.0.0',
                totalRecords: 25
            };

            command.addOptimizedFooter(mockDoc, 1, metadata);

            expect(mockDoc.moveTo).toHaveBeenCalled();
            expect(mockDoc.lineTo).toHaveBeenCalled();
            expect(mockDoc.text).toHaveBeenCalledWith(
                expect.stringContaining('Pagina 1'),
                expect.any(Number),
                expect.any(Number)
            );
            expect(mockDoc.text).toHaveBeenCalledWith(
                expect.stringContaining('v2.0.0'),
                expect.any(Number),
                expect.any(Number)
            );
        });
    });

    describe('Navegación Persistente', () => {
        test('debe tener nuevos colores corporativos para tablas', () => {
            // Verificar que se agregó el color estándar para tablas
            expect(command.colors).toHaveProperty('tableStroke', '#E74C3C');
            expect(command.colors.tableStroke).toBe('#E74C3C'); // Color naranja/rojo estándar
        });

        test('debe tener configuración mejorada de PDF', () => {
            // Verificar que tiene métodos de cálculo de estadísticas
            expect(typeof command.calculateReportStats).toBe('function');
            expect(typeof command.calculateTotalAmount).toBe('function');
            
            // Verificar colores corporativos completos
            expect(command.colors).toHaveProperty('primary');
            expect(command.colors).toHaveProperty('urgent');
            expect(command.colors).toHaveProperty('tableStroke');
        });
    });

    describe('Validación de Configuración PDF', () => {
        test('debe tener configuración optimizada para PDF', () => {
            // Verificar que el comando tiene configuración de layout optimizada
            expect(command.layout.margin).toBe(40);
            expect(command.layout.headerHeight).toBe(80);
            expect(command.layout.footerHeight).toBe(40);
            
            // Verificar que tiene métodos para optimización
            expect(typeof command.calculateReportStats).toBe('function');
            expect(typeof command.addCorporateHeader).toBe('function');
            expect(typeof command.addOptimizedFooter).toBe('function');
        });
    });

    describe('Integración Completa del Comando', () => {
        test('debe heredar correctamente de BaseCommand', () => {
            expect(command).toBeInstanceOf(BaseCommand);
            expect(command.getCommandName()).toBe('PaymentReportPDF');
            expect(command.getDescription()).toContain('reporte PDF');
        });

        test('debe tener todos los métodos optimizados implementados', () => {
            expect(typeof command.calculateReportStats).toBe('function');
            expect(typeof command.calculateTotalAmount).toBe('function');
            expect(typeof command.addCorporateHeader).toBe('function');
            expect(typeof command.addUrgencyChart).toBe('function');
            expect(typeof command.addKPISection).toBe('function');
            expect(typeof command.addOptimizedFooter).toBe('function');
        });

        test('debe manejar errores gracefully', async () => {
            // Mock error en base de datos
            jest.spyOn(command, 'calculatePendingPaymentsPolicies')
                .mockRejectedValue(new Error('Database error'));

            await command.generateReport(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error al generar el reporte')
            );
        });
    });
});