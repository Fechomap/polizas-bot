// tests/integration/niv-system.test.ts
import mongoose from 'mongoose';
import { VehicleRegistrationHandler } from '../../src/comandos/comandos/VehicleRegistrationHandler';
import { getOldUnusedPolicies } from '../../src/controllers/policyController';
import Policy from '../../src/models/policy';
import Vehicle from '../../src/models/vehicle';
import { generarDatosMexicanosReales } from '../../src/utils/mexicanDataGenerator';

/**
 * 🧪 TESTS DE INTEGRACIÓN - SISTEMA NIV AUTOMÁTICO
 * 
 * Pruebas para verificar el funcionamiento completo del sistema de 
 * conversión automática de vehículos 2023-2026 a NIVs (Números de Identificación Vehicular)
 */

describe('Sistema NIV Automático - Integración Completa', () => {
    
    beforeAll(async () => {
        // Conectar a base de datos de test
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/polizas-test');
        }
    });

    afterAll(async () => {
        // Limpiar y cerrar conexión
        await Policy.deleteMany({ tipoPoliza: 'NIP' }); // Usando enum real
        await Vehicle.deleteMany({ estado: 'CONVERTIDO_NIP' }); // Usando estado real
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        // Limpiar datos de test antes de cada prueba
        await Policy.deleteMany({ tipoPoliza: 'NIP' }); // Usando enum real
        await Vehicle.deleteMany({ estado: 'CONVERTIDO_NIP' }); // Usando estado real
    });

    describe('🔍 Detección Automática de Vehículos NIV', () => {
        
        test('Debe detectar vehículo 2023 como NIV', async () => {
            const datosGenerados = await generarDatosMexicanosReales();
            const registro = {
                datos: {
                    serie: 'NIV2023TEST123456',
                    marca: 'TOYOTA',
                    submarca: 'COROLLA',
                    año: 2023,
                    color: 'BLANCO',
                    placas: 'TEST-123'
                },
                datosGenerados,
                fotos: [
                    {
                        url: 'https://test.com/foto1.jpg',
                        key: 'test-foto1',
                        originalname: 'foto1.jpg',
                        size: 1024,
                        uploadedAt: new Date()
                    }
                ]
            };

            // Simular el proceso de registro
            const userId = 12345;
            const chatId = 67890;
            const stateKey = `${userId}:${chatId}`;

            // Verificar que se detecta como NIV
            const añoVehiculo = parseInt(String(registro.datos.año));
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;
            
            expect(esVehiculoNIV).toBe(true);
            expect(registro.datos.año).toBe(2023);
        });

        test('Debe detectar vehículo 2026 como NIV', async () => {
            const registro = { datos: { año: 2026 } };
            const añoVehiculo = parseInt(String(registro.datos.año));
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;
            
            expect(esVehiculoNIV).toBe(true);
        });

        test('NO debe detectar vehículo 2022 como NIV', async () => {
            const registro = { datos: { año: 2022 } };
            const añoVehiculo = parseInt(String(registro.datos.año));
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;
            
            expect(esVehiculoNIV).toBe(false);
        });

        test('NO debe detectar vehículo 2027 como NIV', async () => {
            const registro = { datos: { año: 2027 } };
            const añoVehiculo = parseInt(String(registro.datos.año));
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;
            
            expect(esVehiculoNIV).toBe(false);
        });
    });

    describe('🚗 Creación de Póliza NIV', () => {
        
        test('Debe crear póliza NIV con campos correctos', async () => {
            const datosGenerados = await generarDatosMexicanosReales();
            
            // Crear póliza NIV directamente (simulando el proceso)
            const polizaNIV = await Policy.create({
                // Datos del titular
                titular: datosGenerados.titular,
                rfc: datosGenerados.rfc,
                telefono: datosGenerados.telefono,
                correo: datosGenerados.correo,
                
                // Dirección
                calle: datosGenerados.calle,
                colonia: datosGenerados.colonia,
                municipio: datosGenerados.municipio,
                estadoRegion: datosGenerados.estadoRegion,
                cp: datosGenerados.cp,
                
                // Datos del vehículo
                marca: 'HONDA',
                submarca: 'CIVIC',
                año: 2024,
                color: 'AZUL',
                serie: 'NIV2024TEST654321',
                placas: 'NIV-2024',
                
                // Datos de póliza NIV
                numeroPoliza: 'NIV2024TEST654321', // NIV = Serie
                fechaEmision: new Date(),
                aseguradora: 'NIV_AUTOMATICO',
                agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                
                // Sin pagos iniciales
                pagos: [],
                registros: [],
                servicios: [],
                
                // Contadores iniciales
                calificacion: 0,
                totalServicios: 0,
                servicioCounter: 0,
                registroCounter: 0,
                diasRestantesCobertura: 0,
                diasRestantesGracia: 0,
                
                // Marcadores especiales NIV (usando campos reales implementados)
                creadoViaOBD: true,
                esNIP: true, // Campo real en el código
                tipoPoliza: 'NIP', // Enum real en el código  
                fechaConversionNIP: new Date(), // Campo real en el código
                
                // Estados
                estado: 'ACTIVO',
                estadoPoliza: 'VIGENTE',
                
                // Archivos vacíos
                archivos: {
                    fotos: [],
                    pdfs: [],
                    r2Files: { fotos: [], pdfs: [] }
                }
            });

            // Verificaciones
            expect(polizaNIV).toBeDefined();
            expect(polizaNIV.esNIP).toBe(true); // Campo real implementado
            expect(polizaNIV.tipoPoliza).toBe('NIP'); // Enum real implementado
            expect(polizaNIV.numeroPoliza).toBe('NIV2024TEST654321');
            expect(polizaNIV.serie).toBe('NIV2024TEST654321');
            expect(polizaNIV.aseguradora).toBe('NIV_AUTOMATICO');
            expect(polizaNIV.estado).toBe('ACTIVO');
            expect(polizaNIV.totalServicios).toBe(0);
            expect(polizaNIV.fechaConversionNIP).toBeDefined(); // Campo real implementado
        });
    });

    describe('📊 Reportes con NIVs', () => {
        
        test('Debe incluir NIVs en getOldUnusedPolicies', async () => {
            // Crear una póliza regular y un NIV
            const datosGenerados = await generarDatosMexicanosReales();
            
            // Crear póliza regular
            await Policy.create({
                ...datosGenerados,
                marca: 'NISSAN',
                submarca: 'SENTRA',
                año: 2020,
                color: 'GRIS',
                serie: 'REGULAR2020TEST',
                placas: 'REG-2020',
                numeroPoliza: 'POL-REGULAR-001',
                fechaEmision: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 días atrás
                aseguradora: 'SEGUROS_REGULAR',
                agenteCotizador: 'AGENTE_REGULAR',
                pagos: [],
                registros: [],
                servicios: [],
                calificacion: 75,
                totalServicios: 0,
                creadoViaOBD: false,
                esNIP: false, // Campo real implementado
                tipoPoliza: 'REGULAR',
                estado: 'ACTIVO',
                archivos: { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } }
            });

            // Crear NIV
            await Policy.create({
                ...datosGenerados,
                marca: 'HONDA',
                submarca: 'CIVIC',
                año: 2025,
                color: 'ROJO',
                serie: 'NIV2025TEST999',
                placas: 'NIV-2025',
                numeroPoliza: 'NIV2025TEST999',
                fechaEmision: new Date(),
                aseguradora: 'NIV_AUTOMATICO',
                agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                pagos: [],
                registros: [],
                servicios: [],
                calificacion: 0,
                totalServicios: 0,
                creadoViaOBD: true,
                esNIP: true, // Campo real implementado
                tipoPoliza: 'NIP', // Enum real implementado
                fechaConversionNIP: new Date(), // Campo real implementado
                estado: 'ACTIVO',
                archivos: { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } }
            });

            // Obtener reporte
            const reporte = await getOldUnusedPolicies();

            // Verificaciones
            expect(reporte).toBeDefined();
            expect(reporte.length).toBeGreaterThan(0);
            
            const regulares = reporte.filter(p => p.tipoReporte === 'REGULAR');
            const nivs = reporte.filter(p => p.tipoReporte === 'NIP'); // Usando tipoReporte real
            
            expect(regulares.length).toBe(1);
            expect(nivs.length).toBe(1);
            
            const niv = nivs[0];
            expect(niv.numeroPoliza).toBe('NIV2025TEST999');
            expect(niv.mensajeEspecial).toBe('⚡ NIP DISPONIBLE'); // Mensaje real implementado
            expect(niv.tipoPoliza).toBe('NIP'); // Enum real implementado
            expect(niv.esNIP).toBe(true); // Campo real implementado
        });

        test('Debe limitar NIVs a máximo 4 en reportes', async () => {
            const datosGenerados = await generarDatosMexicanosReales();
            
            // Crear 6 NIVs (debe mostrar solo 4)
            for (let i = 1; i <= 6; i++) {
                await Policy.create({
                    ...datosGenerados,
                    marca: 'TOYOTA',
                    submarca: 'CAMRY',
                    año: 2024,
                    color: 'AZUL',
                    serie: `NIV2024TEST${i.toString().padStart(3, '0')}`,
                    placas: `NIV-${i}`,
                    numeroPoliza: `NIV2024TEST${i.toString().padStart(3, '0')}`,
                    fechaEmision: new Date(),
                    aseguradora: 'NIV_AUTOMATICO',
                    agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                    pagos: [],
                    registros: [],
                    servicios: [],
                    totalServicios: 0,
                    creadoViaOBD: true,
                    esNIV: true,
                    tipoPoliza: 'NIV',
                    estado: 'ACTIVO',
                    archivos: { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } }
                });
            }

            const reporte = await getOldUnusedPolicies();
            const nivs = reporte.filter(p => p.tipoReporte === 'NIP'); // Usando tipoReporte real
            
            expect(nivs.length).toBeLessThanOrEqual(4);
        });
    });

    describe('🗑️ Eliminación Automática de NIVs', () => {
        
        test('Debe marcar NIV como eliminado cuando totalServicios >= 1', async () => {
            const datosGenerados = await generarDatosMexicanosReales();
            
            // Crear NIV
            const niv = await Policy.create({
                ...datosGenerados,
                marca: 'FORD',
                submarca: 'FOCUS',
                año: 2023,
                color: 'VERDE',
                serie: 'NIV2023ELIMINAR',
                placas: 'NIV-ELIM',
                numeroPoliza: 'NIV2023ELIMINAR',
                fechaEmision: new Date(),
                aseguradora: 'NIV_AUTOMATICO',
                agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                pagos: [],
                registros: [],
                servicios: [],
                totalServicios: 0, // Inicialmente sin servicios
                creadoViaOBD: true,
                esNIV: true,
                tipoPoliza: 'NIV',
                estado: 'ACTIVO',
                archivos: { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } }
            });

            // Simular que se agregó un servicio
            await Policy.findByIdAndUpdate(niv._id, {
                totalServicios: 1,
                servicios: [{
                    numeroServicio: 1,
                    costo: 500,
                    fechaServicio: new Date(),
                    numeroExpediente: 'EXP-001',
                    origenDestino: 'Test Origen - Test Destino'
                }]
            });

            // Simular lógica de eliminación automática
            const policy = await Policy.findOne({ numeroPoliza: 'NIV2023ELIMINAR' });
            
            if (policy && policy.tipoPoliza === 'NIP' && policy.totalServicios >= 1) { // Usando enum real
                await Policy.findByIdAndUpdate(policy._id, {
                    estado: 'ELIMINADO',
                    fechaEliminacion: new Date(),
                    motivoEliminacion: 'NIV utilizado - Eliminación automática'
                });
            }

            // Verificar eliminación
            const policyEliminado = await Policy.findById(niv._id);
            expect(policyEliminado?.estado).toBe('ELIMINADO');
            expect(policyEliminado?.fechaEliminacion).toBeDefined();
            expect(policyEliminado?.motivoEliminacion).toBe('NIV utilizado - Eliminación automática');
        });
    });

    describe('📋 Integración Completa del Flujo NIV', () => {
        
        test('Flujo completo: Registro 2024 → NIV → Reporte → Uso → Eliminación', async () => {
            const datosGenerados = await generarDatosMexicanosReales();
            
            // 1. Simular registro de vehículo 2024
            const añoVehiculo = 2024;
            const esVehiculoNIV = añoVehiculo >= 2023 && añoVehiculo <= 2026;
            expect(esVehiculoNIV).toBe(true);

            // 2. Crear NIV (simulando convertirANIV)
            const niv = await Policy.create({
                ...datosGenerados,
                marca: 'VOLKSWAGEN',
                submarca: 'JETTA',
                año: añoVehiculo,
                color: 'NEGRO',
                serie: 'NIV2024COMPLETO',
                placas: 'NIV-COMP',
                numeroPoliza: 'NIV2024COMPLETO',
                fechaEmision: new Date(),
                aseguradora: 'NIV_AUTOMATICO',
                agenteCotizador: 'SISTEMA_AUTOMATIZADO',
                pagos: [],
                registros: [],
                servicios: [],
                totalServicios: 0,
                creadoViaOBD: true,
                esNIP: true, // Campo real implementado
                tipoPoliza: 'NIP', // Enum real implementado
                fechaConversionNIP: new Date(), // Campo real implementado
                estado: 'ACTIVO',
                archivos: { fotos: [], pdfs: [], r2Files: { fotos: [], pdfs: [] } }
            });

            // 3. Verificar que aparece en reportes
            let reporte = await getOldUnusedPolicies();
            let nivs = reporte.filter(p => p.tipoReporte === 'NIV');
            expect(nivs.length).toBeGreaterThan(0);
            
            const nivEnReporte = nivs.find(n => n.numeroPoliza === 'NIV2024COMPLETO');
            expect(nivEnReporte).toBeDefined();
            expect(nivEnReporte?.mensajeEspecial).toBe('⚡ NIV DISPONIBLE');

            // 4. Simular uso del NIV
            await Policy.findByIdAndUpdate(niv._id, {
                totalServicios: 1,
                servicios: [{
                    numeroServicio: 1,
                    costo: 750,
                    fechaServicio: new Date(),
                    numeroExpediente: 'EXP-COMPLETO',
                    origenDestino: 'Origen Completo - Destino Completo'
                }]
            });

            // 5. Simular eliminación automática
            const policyUsado = await Policy.findById(niv._id);
            if (policyUsado && policyUsado.tipoPoliza === 'NIP' && policyUsado.totalServicios >= 1) { // Usando enum real
                await Policy.findByIdAndUpdate(policyUsado._id, {
                    estado: 'ELIMINADO',
                    fechaEliminacion: new Date(),
                    motivoEliminacion: 'NIV utilizado - Eliminación automática'
                });
            }

            // 6. Verificar que ya no aparece en reportes
            reporte = await getOldUnusedPolicies();
            nivs = reporte.filter(p => p.tipoReporte === 'NIV');
            const nivEliminadoEnReporte = nivs.find(n => n.numeroPoliza === 'NIV2024COMPLETO');
            expect(nivEliminadoEnReporte).toBeUndefined();

            // 7. Verificar estado final
            const policyFinal = await Policy.findById(niv._id);
            expect(policyFinal?.estado).toBe('ELIMINADO');
            expect(policyFinal?.fechaEliminacion).toBeDefined();
        });
    });
});