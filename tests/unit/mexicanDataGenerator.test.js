const {
    generarNombreMexicano,
    generarRFC,
    generarTelefonoMexicano,
    generarDireccionMexicana,
    generarDatosMexicanosCompletos
} = require('../../src/utils/mexicanDataGenerator');

describe('MexicanDataGenerator', () => {
    describe('generarNombreMexicano', () => {
        test('debe generar un nombre mexicano válido', () => {
            const nombre = generarNombreMexicano();

            expect(nombre).toHaveProperty('nombre');
            expect(nombre).toHaveProperty('apellido1');
            expect(nombre).toHaveProperty('apellido2');
            expect(nombre).toHaveProperty('nombreCompleto');
            expect(nombre).toHaveProperty('genero');

            expect(typeof nombre.nombre).toBe('string');
            expect(nombre.nombre.length).toBeGreaterThan(0);
            expect(['M', 'F']).toContain(nombre.genero);
            expect(nombre.nombreCompleto).toBe(
                `${nombre.nombre} ${nombre.apellido1} ${nombre.apellido2}`
            );
        });

        test('debe generar nombre masculino cuando se especifica', () => {
            const nombre = generarNombreMexicano('M');
            expect(nombre.genero).toBe('M');
        });

        test('debe generar nombre femenino cuando se especifica', () => {
            const nombre = generarNombreMexicano('F');
            expect(nombre.genero).toBe('F');
        });

        test('debe generar apellidos diferentes', () => {
            const nombre = generarNombreMexicano();
            expect(nombre.apellido1).not.toBe(nombre.apellido2);
        });
    });

    describe('generarRFC', () => {
        test('debe generar RFC válido de 13 caracteres', () => {
            const persona = {
                nombre: 'Juan',
                apellido1: 'García',
                apellido2: 'López',
                genero: 'M'
            };

            const rfc = generarRFC(persona);

            expect(typeof rfc).toBe('string');
            expect(rfc.length).toBe(13);
            expect(rfc).toMatch(/^[A-Z]{4}\d{6}[HM][A-Z0-9]{2}$/);
            expect(rfc.startsWith('GALJ')).toBe(true); // García López Juan
        });

        test('debe usar letra H para hombres y M para mujeres', () => {
            const personaM = {
                nombre: 'Juan',
                apellido1: 'García',
                apellido2: 'López',
                genero: 'M'
            };

            const personaF = {
                nombre: 'María',
                apellido1: 'García',
                apellido2: 'López',
                genero: 'F'
            };

            const rfcM = generarRFC(personaM);
            const rfcF = generarRFC(personaF);

            expect(rfcM.charAt(10)).toBe('H');
            expect(rfcF.charAt(10)).toBe('M');
        });
    });

    describe('generarTelefonoMexicano', () => {
        test('debe retornar "Sin teléfono" como valor por defecto', () => {
            const telefono = generarTelefonoMexicano();

            expect(typeof telefono).toBe('string');
            expect(telefono).toBe('Sin teléfono');
        });

        test('debe retornar siempre el mismo valor', () => {
            const telefonos = new Set();
            for (let i = 0; i < 10; i++) {
                telefonos.add(generarTelefonoMexicano());
            }
            expect(telefonos.size).toBe(1);
            expect(Array.from(telefonos)[0]).toBe('Sin teléfono');
        });
    });

    describe('generarDireccionMexicana', () => {
        test('debe generar dirección mexicana completa', () => {
            const direccion = generarDireccionMexicana();

            expect(direccion).toHaveProperty('calle');
            expect(direccion).toHaveProperty('colonia');
            expect(direccion).toHaveProperty('municipio');
            expect(direccion).toHaveProperty('estadoRegion');
            expect(direccion).toHaveProperty('cp');

            expect(typeof direccion.calle).toBe('string');
            expect(typeof direccion.colonia).toBe('string');
            expect(typeof direccion.municipio).toBe('string');
            expect(typeof direccion.estadoRegion).toBe('string');
            expect(direccion.cp).toMatch(/^\d{5}$/);
        });

        test('debe incluir estados mexicanos válidos', () => {
            const estadosValidos = [
                'Ciudad de México',
                'Estado de México',
                'Jalisco',
                'Nuevo León',
                'Puebla',
                'Veracruz',
                'Guanajuato',
                'Chihuahua',
                'Sonora',
                'Michoacán'
            ];

            const direccion = generarDireccionMexicana();
            expect(estadosValidos).toContain(direccion.estadoRegion);
        });
    });

    describe('generarDatosMexicanosCompletos', () => {
        test('debe generar datos completos de persona mexicana', () => {
            const datos = generarDatosMexicanosCompletos();

            // Datos personales
            expect(datos).toHaveProperty('titular');
            expect(datos).toHaveProperty('nombre');
            expect(datos).toHaveProperty('apellido1');
            expect(datos).toHaveProperty('apellido2');
            expect(datos).toHaveProperty('genero');
            expect(datos).toHaveProperty('rfc');
            expect(datos).toHaveProperty('telefono');
            expect(datos).toHaveProperty('correo');
            expect(datos).toHaveProperty('contraseña');

            // Dirección
            expect(datos).toHaveProperty('calle');
            expect(datos).toHaveProperty('colonia');
            expect(datos).toHaveProperty('municipio');
            expect(datos).toHaveProperty('estadoRegion');
            expect(datos).toHaveProperty('cp');

            // Validaciones específicas
            expect(datos.rfc.length).toBe(13);
            expect(datos.telefono).toBe('Sin teléfono');
            expect(datos.correo).toMatch(/^[a-záéíóúñ]+\.[a-záéíóúñ]+\d{0,3}@[a-z]+\.(com)$/);
            expect(datos.contraseña.length).toBe(8);
        });

        test('debe generar datos diferentes en múltiples llamadas', () => {
            const datos1 = generarDatosMexicanosCompletos();
            const datos2 = generarDatosMexicanosCompletos();

            expect(datos1.titular).not.toBe(datos2.titular);
            expect(datos1.rfc).not.toBe(datos2.rfc);
            expect(datos1.telefono).toBe(datos2.telefono); // Ambos deben ser "Sin teléfono"
        });

        test('debe respetar el género especificado', () => {
            const datosM = generarDatosMexicanosCompletos('M');
            const datosF = generarDatosMexicanosCompletos('F');

            expect(datosM.genero).toBe('M');
            expect(datosF.genero).toBe('F');
            expect(datosM.rfc.charAt(10)).toBe('H');
            expect(datosF.rfc.charAt(10)).toBe('M');
        });
    });
});
