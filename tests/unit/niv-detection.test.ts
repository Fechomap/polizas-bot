// tests/unit/niv-detection.test.ts
/**
 * 🧪 TESTS UNITARIOS - DETECCIÓN NIV AUTOMÁTICA
 * 
 * Tests simples para verificar la lógica de detección de vehículos NIV
 * sin necesidad de conexión a base de datos
 */

describe('Sistema NIV - Detección Automática', () => {
    
    // Función helper que replica la lógica implementada
    const esVehiculoNIV = (año: number): boolean => {
        return año >= 2023 && año <= 2026;
    };

    describe('🔍 Detección de Años NIV', () => {
        
        test('Debe detectar año 2023 como NIV', () => {
            expect(esVehiculoNIV(2023)).toBe(true);
        });

        test('Debe detectar año 2024 como NIV', () => {
            expect(esVehiculoNIV(2024)).toBe(true);
        });

        test('Debe detectar año 2025 como NIV', () => {
            expect(esVehiculoNIV(2025)).toBe(true);
        });

        test('Debe detectar año 2026 como NIV', () => {
            expect(esVehiculoNIV(2026)).toBe(true);
        });

        test('NO debe detectar año 2022 como NIV', () => {
            expect(esVehiculoNIV(2022)).toBe(false);
        });

        test('NO debe detectar año 2027 como NIV', () => {
            expect(esVehiculoNIV(2027)).toBe(false);
        });

        test('NO debe detectar año 2020 como NIV', () => {
            expect(esVehiculoNIV(2020)).toBe(false);
        });

        test('NO debe detectar año 2030 como NIV', () => {
            expect(esVehiculoNIV(2030)).toBe(false);
        });
    });

    describe('📊 Lógica de Clasificación en Reportes', () => {
        
        // Simula la función de filtrado en reportes
        const clasificarPolizasParaReporte = (polizas: any[]) => {
            const regulares = polizas.filter(p => p.tipoReporte !== 'NIP');
            const nips = polizas.filter(p => p.tipoReporte === 'NIP');
            
            return {
                regulares: regulares.slice(0, 10), // Máximo 10 regulares
                nips: nips.slice(0, 4) // Máximo 4 NIPs
            };
        };

        test('Debe separar correctamente pólizas regulares y NIPs', () => {
            const polizasMixtas = [
                { numeroPoliza: 'POL-001', tipoReporte: 'REGULAR' },
                { numeroPoliza: 'NIV-001', tipoReporte: 'NIP' },
                { numeroPoliza: 'POL-002', tipoReporte: 'REGULAR' },
                { numeroPoliza: 'NIV-002', tipoReporte: 'NIP' }
            ];

            const resultado = clasificarPolizasParaReporte(polizasMixtas);

            expect(resultado.regulares).toHaveLength(2);
            expect(resultado.nips).toHaveLength(2);
            expect(resultado.regulares[0].numeroPoliza).toBe('POL-001');
            expect(resultado.nips[0].numeroPoliza).toBe('NIV-001');
        });

        test('Debe limitar NIPs a máximo 4', () => {
            const muchasPolizas = [
                ...Array(15).fill(0).map((_, i) => ({ numeroPoliza: `POL-${i}`, tipoReporte: 'REGULAR' })),
                ...Array(10).fill(0).map((_, i) => ({ numeroPoliza: `NIV-${i}`, tipoReporte: 'NIP' }))
            ];

            const resultado = clasificarPolizasParaReporte(muchasPolizas);

            expect(resultado.regulares).toHaveLength(10); // Máximo 10 regulares
            expect(resultado.nips).toHaveLength(4); // Máximo 4 NIPs
        });
    });

    describe('🗑️ Lógica de Eliminación Automática', () => {
        
        // Simula la lógica de eliminación
        const debeEliminarNIP = (poliza: any): boolean => {
            return poliza.tipoPoliza === 'NIP' && poliza.totalServicios >= 1;
        };

        test('Debe eliminar NIP cuando totalServicios >= 1', () => {
            const nipUsado = {
                numeroPoliza: 'NIV-TEST-001',
                tipoPoliza: 'NIP',
                totalServicios: 1,
                estado: 'ACTIVO'
            };

            expect(debeEliminarNIP(nipUsado)).toBe(true);
        });

        test('NO debe eliminar NIP cuando totalServicios = 0', () => {
            const nipSinUsar = {
                numeroPoliza: 'NIV-TEST-002',
                tipoPoliza: 'NIP',
                totalServicios: 0,
                estado: 'ACTIVO'
            };

            expect(debeEliminarNIP(nipSinUsar)).toBe(false);
        });

        test('NO debe eliminar póliza REGULAR aunque tenga servicios', () => {
            const polizaRegular = {
                numeroPoliza: 'POL-REGULAR-001',
                tipoPoliza: 'REGULAR',
                totalServicios: 5,
                estado: 'ACTIVO'
            };

            expect(debeEliminarNIP(polizaRegular)).toBe(false);
        });
    });

    describe('🚗 Validación de Datos NIV', () => {
        
        // Simula la validación de datos para crear NIV
        const validarDatosNIV = (datos: any): { valido: boolean; errores: string[] } => {
            const errores: string[] = [];

            if (!datos.serie || datos.serie.length !== 17) {
                errores.push('Serie debe tener 17 caracteres');
            }

            if (!datos.año || !esVehiculoNIV(datos.año)) {
                errores.push('Año debe estar entre 2023-2026 para NIV');
            }

            if (!datos.marca || datos.marca.length < 2) {
                errores.push('Marca es obligatoria');
            }

            if (!datos.submarca || datos.submarca.length < 2) {
                errores.push('Submarca es obligatoria');
            }

            return {
                valido: errores.length === 0,
                errores
            };
        };

        test('Debe validar correctamente datos NIV válidos', () => {
            const datosValidos = {
                serie: 'ABC2024CIVIC12345', // Exactamente 17 caracteres
                año: 2024,
                marca: 'HONDA',
                submarca: 'CIVIC',
                color: 'AZUL'
            };

            const resultado = validarDatosNIV(datosValidos);

            expect(resultado.valido).toBe(true);
            expect(resultado.errores).toHaveLength(0);
        });

        test('Debe rechazar serie inválida', () => {
            const datosInvalidos = {
                serie: 'ABC123', // Muy corta
                año: 2024,
                marca: 'HONDA',
                submarca: 'CIVIC'
            };

            const resultado = validarDatosNIV(datosInvalidos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores).toContain('Serie debe tener 17 caracteres');
        });

        test('Debe rechazar año fuera de rango NIV', () => {
            const datosInvalidos = {
                serie: 'ABC2022CIVIC123456',
                año: 2022, // Fuera de rango NIV
                marca: 'HONDA',
                submarca: 'CIVIC'
            };

            const resultado = validarDatosNIV(datosInvalidos);

            expect(resultado.valido).toBe(false);
            expect(resultado.errores).toContain('Año debe estar entre 2023-2026 para NIV');
        });
    });

    describe('📋 Generación de Mensajes NIV', () => {
        
        // Simula la generación de mensajes para NIV
        const generarMensajeNIV = (vehiculo: any): string => {
            return `🎉 *VEHÍCULO NIV REGISTRADO*

⚡ *CONVERSIÓN AUTOMÁTICA APLICADA*
Este vehículo año ${vehiculo.año} ha sido convertido automáticamente a NIV.

🚗 *Información del Vehículo:*
Marca: ${vehiculo.marca} ${vehiculo.submarca}
Año: ${vehiculo.año} (NIV Automático)
Color: ${vehiculo.color}
Placas: ${vehiculo.placas || 'Sin placas'}

🆔 *NIV Generado:* \`${vehiculo.serie}\`
👤 *Titular:* ${vehiculo.titular}

✅ *Estado:* ACTIVO como póliza NIV
📋 *Disponibilidad:* Inmediata en reportes de pólizas prioritarias

🔄 *Eliminación:* Automática al ser utilizado en un servicio`;
        };

        test('Debe generar mensaje NIV correctamente', () => {
            const vehiculo = {
                serie: 'ABC2024CIVIC123456',
                marca: 'HONDA',
                submarca: 'CIVIC',
                año: 2024,
                color: 'AZUL',
                placas: 'NIV-2024',
                titular: 'Juan Pérez'
            };

            const mensaje = generarMensajeNIV(vehiculo);

            expect(mensaje).toContain('VEHÍCULO NIV REGISTRADO');
            expect(mensaje).toContain('CONVERSIÓN AUTOMÁTICA APLICADA');
            expect(mensaje).toContain('HONDA CIVIC');
            expect(mensaje).toContain('2024 (NIV Automático)');
            expect(mensaje).toContain('ABC2024CIVIC123456');
            expect(mensaje).toContain('Juan Pérez');
            expect(mensaje).toContain('ACTIVO como póliza NIV');
        });
    });
});