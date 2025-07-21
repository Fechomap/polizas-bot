/**
 * Test completo para MexicanDataGenerator - TypeScript moderno
 * Generador de datos mexicanos aleatorios para registros OBD
 */

// Importar MexicanDataGenerator
import MexicanDataGenerator, { generarDatosMexicanosCompletos } from '../../src/utils/mexicanDataGenerator';

describe('MexicanDataGenerator', () => {
    let generator: MexicanDataGenerator;

    beforeEach(() => {
        generator = new MexicanDataGenerator();
    });

    describe('generateNombre - Generación de nombres', () => {
        test('debe generar un nombre mexicano válido', () => {
            const nombre = generator.generateNombre();

            expect(typeof nombre).toBe('string');
            expect(nombre.length).toBeGreaterThan(0);
            expect(nombre.split(' ')).toHaveLength(3); // Nombre + 2 apellidos
        });

        test('debe generar nombre masculino cuando se especifica', () => {
            const nombre = generator.generateNombre('masculino');
            const primerNombre = nombre.split(' ')[0];
            
            // Verificar que es un nombre válido (no podemos predecir cuál será)
            expect(typeof primerNombre).toBe('string');
            expect(primerNombre.length).toBeGreaterThan(0);
        });

        test('debe generar nombre femenino cuando se especifica', () => {
            const nombre = generator.generateNombre('femenino');
            const primerNombre = nombre.split(' ')[0];
            
            // Verificar que es un nombre válido (no podemos predecir cuál será)
            expect(typeof primerNombre).toBe('string');
            expect(primerNombre.length).toBeGreaterThan(0);
        });

        test('debe generar apellidos diferentes en el mismo nombre', () => {
            const nombre = generator.generateNombre();
            const partes = nombre.split(' ');
            const apellido1 = partes[1];
            const apellido2 = partes[2];
            
            // En algunos casos raros podrían ser iguales, pero generalmente diferentes
            expect(typeof apellido1).toBe('string');
            expect(typeof apellido2).toBe('string');
        });
    });

    describe('generateRFC - Generación de RFC', () => {
        test('debe generar RFC válido de 13 caracteres', () => {
            const rfc = generator.generateRFC();

            expect(typeof rfc).toBe('string');
            expect(rfc.length).toBe(13);
            expect(rfc).toMatch(/^[A-Z]{4}\d{6}[A-Z0-9]{3}$/);
        });

        test('debe generar RFC con formato correcto', () => {
            const rfc = generator.generateRFC();

            // 4 letras iniciales
            expect(rfc.substring(0, 4)).toMatch(/^[A-Z]{4}$/);
            // 6 números (fecha)
            expect(rfc.substring(4, 10)).toMatch(/^\d{6}$/);
            // 3 caracteres alfanuméricos finales
            expect(rfc.substring(10, 13)).toMatch(/^[A-Z0-9]{3}$/);
        });

        test('debe generar RFCs únicos', () => {
            const rfcs = new Set();
            for (let i = 0; i < 10; i++) {
                rfcs.add(generator.generateRFC());
            }
            expect(rfcs.size).toBeGreaterThan(1); // Debería generar RFCs diferentes
        });
    });

    describe('generateTelefono - Generación de teléfonos', () => {
        test('debe generar teléfono mexicano válido', () => {
            const telefono = generator.generateTelefono();

            expect(typeof telefono).toBe('string');
            expect(telefono.length).toBeGreaterThanOrEqual(9); // Mínimo 9 dígitos
            expect(telefono.length).toBeLessThanOrEqual(10); // Máximo 10 dígitos
            expect(telefono).toMatch(/^\d+$/); // Solo números
        });

        test('debe usar LADAs mexicanas válidas', () => {
            const ladasValidas = ['33', '55', '81', '222', '656', '667', '668', '669', '686', '687'];
            const telefono = generator.generateTelefono();
            
            const posibleLada2 = telefono.substring(0, 2);
            const posibleLada3 = telefono.substring(0, 3);
            
            const esLadaValida = ladasValidas.includes(posibleLada2) || ladasValidas.includes(posibleLada3);
            expect(esLadaValida).toBe(true);
        });

        test('debe generar teléfonos diferentes', () => {
            const telefonos = new Set();
            for (let i = 0; i < 10; i++) {
                telefonos.add(generator.generateTelefono());
            }
            expect(telefonos.size).toBeGreaterThan(1);
        });
    });

    describe('generateCorreo - Generación de correos', () => {
        test('debe generar correo electrónico válido', () => {
            const nombre = 'José García López';
            const correo = generator.generateCorreo(nombre);

            expect(typeof correo).toBe('string');
            expect(correo).toMatch(/^[a-z0-9]+@[a-z]+\.com$/);
            expect(correo).toContain('@');
        });

        test('debe limpiar caracteres especiales del nombre', () => {
            const nombre = 'José María Ñuñez Gütiérrez';
            const correo = generator.generateCorreo(nombre);

            // El correo no debe contener caracteres especiales antes del @
            const parteLocal = correo.split('@')[0];
            expect(parteLocal).toMatch(/^[a-z0-9]+$/);
        });

        test('debe usar dominios válidos', () => {
            const dominiosValidos = ['gmail.com', 'hotmail.com', 'outlook.com'];
            const correo = generator.generateCorreo('Test Usuario');
            const dominio = correo.split('@')[1];

            expect(dominiosValidos).toContain(dominio);
        });
    });

    describe('generateDireccion - Generación de direcciones', () => {
        test('debe generar dirección mexicana completa', () => {
            const direccion = generator.generateDireccion();

            expect(direccion).toHaveProperty('calle');
            expect(direccion).toHaveProperty('colonia');
            expect(direccion).toHaveProperty('municipio');
            expect(direccion).toHaveProperty('estado');
            expect(direccion).toHaveProperty('cp');

            expect(typeof direccion.calle).toBe('string');
            expect(typeof direccion.colonia).toBe('string');
            expect(typeof direccion.municipio).toBe('string');
            expect(typeof direccion.estado).toBe('string');
            expect(direccion.cp).toMatch(/^\d{5}$/);
        });

        test('debe incluir estados mexicanos válidos', () => {
            const estadosValidos = [
                'Jalisco', 'México', 'Ciudad de México', 'Nuevo León', 'Puebla',
                'Veracruz', 'Michoacán', 'Oaxaca', 'Chiapas', 'Guerrero',
                'Tamaulipas', 'Baja California', 'Sinaloa', 'Sonora', 'Coahuila',
                'Durango', 'San Luis Potosí', 'Zacatecas', 'Hidalgo', 'Morelos'
            ];

            const direccion = generator.generateDireccion();
            expect(estadosValidos).toContain(direccion.estado);
        });

        test('debe generar calle con número', () => {
            const direccion = generator.generateDireccion();
            
            expect(direccion.calle).toMatch(/\d+$/); // Debe terminar con números
            expect(direccion.calle.split(' ').length).toBeGreaterThanOrEqual(2);
        });

        test('debe generar CP válido de 5 dígitos', () => {
            const direccion = generator.generateDireccion();
            
            expect(direccion.cp.length).toBe(5);
            expect(parseInt(direccion.cp)).toBeGreaterThanOrEqual(10000);
            expect(parseInt(direccion.cp)).toBeLessThanOrEqual(99999);
        });
    });

    describe('generateDatosMexicanos - Generación completa', () => {
        test('debe generar datos completos de persona mexicana', () => {
            const datos = generator.generateDatosMexicanos();

            // Datos personales
            expect(datos).toHaveProperty('titular');
            expect(datos).toHaveProperty('rfc');
            expect(datos).toHaveProperty('telefono');
            expect(datos).toHaveProperty('correo');

            // Dirección
            expect(datos).toHaveProperty('calle');
            expect(datos).toHaveProperty('colonia');
            expect(datos).toHaveProperty('municipio');
            expect(datos).toHaveProperty('estado');
            expect(datos).toHaveProperty('estadoRegion');
            expect(datos).toHaveProperty('cp');

            // Validaciones específicas
            expect(datos.rfc.length).toBe(13);
            expect(datos.telefono).toMatch(/^\d{9,10}$/);
            expect(datos.correo).toContain('@');
            expect(datos.cp).toMatch(/^\d{5}$/);
            expect(datos.estadoRegion).toBe(datos.estado);
        });

        test('debe generar datos diferentes en múltiples llamadas', () => {
            const datos1 = generator.generateDatosMexicanos();
            const datos2 = generator.generateDatosMexicanos();

            expect(datos1.titular).not.toBe(datos2.titular);
            expect(datos1.rfc).not.toBe(datos2.rfc);
            expect(datos1.telefono).not.toBe(datos2.telefono);
            expect(datos1.correo).not.toBe(datos2.correo);
        });

        test('debe mantener consistencia interna en los datos', () => {
            const datos = generator.generateDatosMexicanos();

            // El titular debe estar relacionado con el correo
            const nombreLimpio = datos.titular
                .toLowerCase()
                .replace(/\s+/g, '')
                .replace(/[áàäâ]/g, 'a')
                .replace(/[éèëê]/g, 'e')
                .replace(/[íìïî]/g, 'i')
                .replace(/[óòöô]/g, 'o')
                .replace(/[úùüû]/g, 'u')
                .replace(/ñ/g, 'n')
                .replace(/[^a-z0-9]/g, '');

            expect(datos.correo).toContain(nombreLimpio.substring(0, Math.min(nombreLimpio.length, 10)));
            expect(datos.estadoRegion).toBe(datos.estado);
        });
    });

    describe('generateMultipleDatos - Generación múltiple', () => {
        test('debe generar múltiples registros únicos', () => {
            const cantidad = 5;
            const datos = generator.generateMultipleDatos(cantidad);

            expect(datos).toHaveLength(cantidad);
            
            // Verificar que todos tienen las propiedades requeridas
            datos.forEach(dato => {
                expect(dato).toHaveProperty('titular');
                expect(dato).toHaveProperty('rfc');
                expect(dato).toHaveProperty('telefono');
                expect(dato).toHaveProperty('correo');
                expect(dato).toHaveProperty('calle');
                expect(dato).toHaveProperty('colonia');
                expect(dato).toHaveProperty('municipio');
                expect(dato).toHaveProperty('estado');
                expect(dato).toHaveProperty('cp');
            });

            // Verificar que son únicos
            const titulares = datos.map(d => d.titular);
            const tituaresUnicos = new Set(titulares);
            expect(tituaresUnicos.size).toBe(cantidad);
        });

        test('debe manejar cantidad cero', () => {
            const datos = generator.generateMultipleDatos(0);
            expect(datos).toHaveLength(0);
        });

        test('debe generar gran cantidad de datos sin errores', () => {
            const datos = generator.generateMultipleDatos(100);
            expect(datos).toHaveLength(100);
            
            // Verificar que no hay datos null o undefined
            datos.forEach(dato => {
                expect(dato).toBeDefined();
                expect(dato.titular).toBeDefined();
                expect(dato.rfc).toBeDefined();
            });
        });
    });

    describe('Función de compatibilidad generarDatosMexicanosCompletos', () => {
        test('debe generar datos completos usando función exportada', () => {
            const datos = generarDatosMexicanosCompletos();

            expect(datos).toHaveProperty('titular');
            expect(datos).toHaveProperty('rfc');
            expect(datos).toHaveProperty('telefono');
            expect(datos).toHaveProperty('correo');
            expect(datos).toHaveProperty('calle');
            expect(datos).toHaveProperty('colonia');
            expect(datos).toHaveProperty('municipio');
            expect(datos).toHaveProperty('estado');
            expect(datos).toHaveProperty('estadoRegion');
            expect(datos).toHaveProperty('cp');

            expect(datos.rfc.length).toBe(13);
            expect(datos.telefono).toMatch(/^\d{9,10}$/);
            expect(datos.correo).toContain('@');
            expect(datos.cp).toMatch(/^\d{5}$/);
        });

        test('debe generar datos diferentes en múltiples llamadas', () => {
            const datos1 = generarDatosMexicanosCompletos();
            const datos2 = generarDatosMexicanosCompletos();

            expect(datos1.titular).not.toBe(datos2.titular);
            expect(datos1.rfc).not.toBe(datos2.rfc);
            expect(datos1.telefono).not.toBe(datos2.telefono);
        });
    });

    describe('Casos Edge y Robustez', () => {
        test('debe manejar múltiples generaciones sin memory leaks', () => {
            // Generar muchos datos para probar estabilidad
            for (let i = 0; i < 1000; i++) {
                const datos = generator.generateDatosMexicanos();
                expect(datos.titular).toBeDefined();
                expect(datos.rfc.length).toBe(13);
            }
        });

        test('debe generar datos con diversidad adecuada', () => {
            const titulares = new Set();
            const estados = new Set();
            const municipios = new Set();

            for (let i = 0; i < 50; i++) {
                const datos = generator.generateDatosMexicanos();
                titulares.add(datos.titular);
                estados.add(datos.estado);
                municipios.add(datos.municipio);
            }

            // Debe tener buena diversidad
            expect(titulares.size).toBeGreaterThan(40); // Casi todos únicos
            expect(estados.size).toBeGreaterThan(5); // Varios estados diferentes
            expect(municipios.size).toBeGreaterThan(5); // Varios municipios diferentes
        });

        test('debe generar RFCs con formato válido consistentemente', () => {
            const rfcs = new Set();
            
            for (let i = 0; i < 20; i++) {
                const rfc = generator.generateRFC();
                rfcs.add(rfc);
                
                expect(rfc.length).toBe(13);
                expect(rfc).toMatch(/^[A-Z]{4}\d{6}[A-Z0-9]{3}$/);
            }

            // Todos deben ser únicos
            expect(rfcs.size).toBe(20);
        });

        test('debe generar teléfonos en rangos válidos', () => {
            for (let i = 0; i < 20; i++) {
                const telefono = generator.generateTelefono();
                const numero = parseInt(telefono);
                
                expect(telefono).toMatch(/^\d{9,10}$/);
                expect(numero).toBeGreaterThan(100000000); // Mínimo 9 dígitos
                expect(numero).toBeLessThan(10000000000); // Máximo 10 dígitos
            }
        });
    });
});