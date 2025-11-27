### **Razón de la Migración: ¿Por qué cambiar a PostgreSQL?**

*   **Estructura y Consistencia:** PostgreSQL es una base de datos relacional que impone un esquema estricto. Esto es ideal para datos como los de una póliza, que tienen una estructura bien definida, garantizando la integridad y consistencia de los datos.
*   **Transacciones ACID:** PostgreSQL ofrece transacciones robustas (Atomicidad, Consistencia, Aislamiento, Durabilidad). Esto es crucial para operaciones complejas como "Ocupar Póliza", donde múltiples registros (póliza, vehículo, servicios) deben actualizarse de forma atómica: o todo se completa con éxito, o nada cambia.
*   **Consultas Complejas y `JOINs`:** Analizar relaciones entre pólizas, servicios y pagos es mucho más eficiente y natural en PostgreSQL usando `JOINs`, en comparación con los `lookup` de agregación de MongoDB.

---

## **Plan de Migración Detallado: De MongoDB a PostgreSQL**

### **Fase 0: Preparación y Diseño del Esquema**

**Objetivo:** Definir la nueva estructura de la base de datos y preparar el entorno de desarrollo.

**1. Elección de Herramientas (ORM):**
*   **ORM Recomendado:** **TypeORM**. Es un ORM (Object-Relational Mapper) maduro para TypeScript que utiliza decoradores de una manera muy similar a como ya usas Mongoose, lo que facilitará la transición.
*   **Dependencias a Instalar:**
    ```bash
    npm install pg typeorm reflect-metadata
    ```

**2. Diseño del Nuevo Esquema Relacional:**
Esta es la parte más crítica. Debemos "traducir" tus modelos de documentos de MongoDB a tablas relacionales.

*   **Análisis del Modelo `Policy` de Mongoose:**
    Tu modelo `policy.ts` es un documento grande con arrays anidados para `servicios`, `pagos` y `archivos`. En PostgreSQL, esto se dividirá en varias tablas interconectadas.

*   **Diseño de las Tablas en PostgreSQL:**

    *   **`policies` (Tabla Principal):**
        *   `id` (PK, serial)
        *   `numeroPoliza` (varchar, unique)
        *   `titular` (varchar)
        *   `telefono` (varchar)
        *   `rfc` (varchar)
        *   `estado` (varchar, ej: 'ACTIVO', 'ELIMINADO')
        *   ... y todos los demás campos de nivel superior.
        *   `vehicleId` (FK a la tabla `vehicles`)

    *   **`vehicles` (Tabla de Vehículos):**
        *   `id` (PK, serial)
        *   `serie` (varchar, unique)
        *   `marca` (varchar)
        *   `submarca` (varchar)
        *   `año` (integer)
        *   ... etc.

    *   **`services` (Tabla de Servicios):**
        *   `id` (PK, serial)
        *   `numeroServicio` (integer)
        *   `costo` (decimal)
        *   `fechaServicio` (timestamp)
        *   `origenDestino` (varchar)
        *   `policyId` (FK a la tabla `policies`) -> **Relación Uno a Muchos**

    *   **`payments` (Tabla de Pagos):**
        *   `id` (PK, serial)
        *   `monto` (decimal)
        *   `fechaPago` (timestamp)
        *   `policyId` (FK a la tabla `policies`) -> **Relación Uno a Muchos**

    *   **`files` (Tabla de Archivos):**
        *   `id` (PK, serial)
        *   `url` (varchar)
        *   `key` (varchar)
        *   `contentType` (varchar)
        *   `tipo` ('FOTO' o 'PDF')
        *   `policyId` (FK a la tabla `policies`) -> **Relación Uno a Muchos**

---

### **Fase 1: Adaptación del Código**

**Objetivo:** Reescribir el código de acceso a datos para que use TypeORM en lugar de Mongoose.

**1. Configurar la Conexión a PostgreSQL:**
*   Crea un archivo `src/database-pg.ts` para manejar la conexión de TypeORM.
    ```typescript
    // src/database-pg.ts
    import { createConnection } from 'typeorm';
    import { Policy } from './models-pg/policy.entity'; // Nuevos modelos
    import { Vehicle } from './models-pg/vehicle.entity';
    // ... importar todas las nuevas entidades

    export const connectPostgres = async () => {
      await createConnection({
        type: 'postgres',
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT || '5432', 10),
        username: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
        entities: [Policy, Vehicle, /* ... */],
        synchronize: true, // true en dev para crear tablas automáticamente
      });
      console.log('✅ Conectado a PostgreSQL exitosamente');
    };
    ```
*   Actualiza tu archivo `src/bot.ts` para llamar a `connectPostgres()` en lugar de `connectDB()`.

**2. Convertir los Modelos de Mongoose a Entidades de TypeORM:**
*   Crea un nuevo directorio `src/models-pg/`.
*   **Ejemplo: `src/models-pg/policy.entity.ts`**
    ```typescript
    import { Entity, PrimaryGeneratedColumn, Column, OneToOne, OneToMany } from 'typeorm';
    import { Vehicle } from './vehicle.entity';
    import { Service } from './service.entity';

    @Entity({ name: 'policies' })
    export class Policy {
      @PrimaryGeneratedColumn()
      id: number;

      @Column({ unique: true })
      numeroPoliza: string;

      @Column()
      titular: string;

      // ... otros campos ...

      @OneToOne(() => Vehicle, vehicle => vehicle.policy)
      vehicle: Vehicle;

      @OneToMany(() => Service, service => service.policy)
      servicios: Service[];

      // ... otras relaciones para pagos y archivos
    }
    ```
*   **Ejemplo: `src/models-pg/service.entity.ts`**
    ```typescript
    import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
    import { Policy } from './policy.entity';

    @Entity({ name: 'services' })
    export class Service {
      @PrimaryGeneratedColumn()
      id: number;

      @Column('decimal')
      costo: number;

      // ... otros campos ...

      @ManyToOne(() => Policy, policy => policy.servicios)
      policy: Policy;
    }
    ```
*   Repite este proceso para todos tus modelos.

**3. Reescribir los Controladores y Repositorios:**
Esta es la parte más laboriosa. Debes reemplazar toda la lógica de Mongoose.

*   **Ejemplo: `getPolicyByNumber`**
    *   **Antes (Mongoose):**
        ```typescript
        // src/controllers/policyController.ts
        import Policy from '../models/policy';
        export const getPolicyByNumber = (numeroPoliza: string) => {
          return Policy.findOne({ numeroPoliza }).lean();
        };
        ```
    *   **Después (TypeORM):**
        ```typescript
        // src/controllers-pg/policyController.ts
        import { getRepository } from 'typeorm';
        import { Policy } from '../models-pg/policy.entity';

        export const getPolicyByNumber = (numeroPoliza: string) => {
          const policyRepository = getRepository(Policy);
          return policyRepository.findOne({
            where: { numeroPoliza },
            relations: ['servicios', 'pagos', 'vehicle'], // Cargar relaciones
          });
        };
        ```

---

### **Fase 2: Migración de Datos**

**Objetivo:** Mover todos los datos existentes de MongoDB a la nueva base de datos PostgreSQL.

**1. Crear un Script de Migración:**
*   Crea un archivo en `scripts/migrate-mongo-to-pg.ts`.
*   Este script se conectará a **ambas** bases de datos simultáneamente.

**2. Lógica del Script de Migración (Pseudo-código):**
    ```typescript
    import { connect as connectMongo } from 'mongoose';
    import { connectPostgres } from '../src/database-pg';
    import { getRepository } from 'typeorm';

    // Importar modelos de AMBOS sistemas
    import OldPolicyModel from '../src/models/policy'; // Mongoose
    import { Policy as NewPolicyEntity } from '../src/models-pg/policy.entity'; // TypeORM
    import { Service as NewServiceEntity } from '../src/models-pg/service.entity';

    async function migrate() {
      await connectMongo(...);
      await connectPostgres(...);

      const oldPolicies = await OldPolicyModel.find(); // Obtener todos los documentos de Mongo

      for (const oldPolicy of oldPolicies) {
        // 1. Transformar y guardar el vehículo (si existe)
        // ...

        // 2. Transformar y guardar la póliza principal
        const newPolicy = new NewPolicyEntity();
        newPolicy.numeroPoliza = oldPolicy.numeroPoliza;
        newPolicy.titular = oldPolicy.titular;
        // ... mapear todos los campos ...
        const savedPolicy = await getRepository(NewPolicyEntity).save(newPolicy);

        // 3. Iterar y guardar los datos anidados (servicios)
        if (oldPolicy.servicios) {
          for (const oldService of oldPolicy.servicios) {
            const newService = new NewServiceEntity();
            newService.costo = oldService.costo;
            newService.fechaServicio = oldService.fechaServicio;
            newService.policy = savedPolicy; // ¡Asignar la relación!
            await getRepository(NewServiceEntity).save(newService);
          }
        }

        // 4. Repetir para pagos y archivos...
      }
      console.log('🎉 Migración completada.');
    }

    migrate();
    ```

---

### **Fase 3: Pruebas y Puesta en Marcha (Cutover)**

**Objetivo:** Asegurar que la aplicación funcione correctamente con la nueva base de datos y realizar el cambio final.

**1. Pruebas Exhaustivas:**
*   **Pruebas Unitarias:** Actualiza tus tests existentes para que funcionen con los nuevos controladores de TypeORM.
*   **Pruebas de Integración:** Ejecuta todos los flujos del bot (registrar, consultar, ocupar póliza) en un entorno de pruebas con la base de datos PostgreSQL.
*   **Validación de Datos:** Ejecuta consultas en ambas bases de datos para comparar el número de registros, sumas de pagos, etc., y asegurar que la migración de datos fue exitosa.

**2. Estrategia de Puesta en Marcha (con tiempo de inactividad):**
1.  **Anunciar Mantenimiento:** Informa a los usuarios de una ventana de mantenimiento.
2.  **Detener la Aplicación:** Para el bot y cualquier otro servicio que escriba en la base de datos.
3.  **Ejecutar Migración Final:** Ejecuta el script de migración una última vez para sincronizar cualquier dato nuevo que se haya creado desde la última prueba.
4.  **Cambiar la Configuración:** Actualiza las variables de entorno en producción para que apunten a la base de datos PostgreSQL.
5.  **Reiniciar la Aplicación:** Inicia el bot. Ahora estará conectado a PostgreSQL.
6.  **Monitoreo:** Vigila de cerca los logs en busca de cualquier error relacionado con la base de datos.

---

### **Fase 4: Limpieza**

**Objetivo:** Eliminar el código y las dependencias obsoletas.

1.  **Eliminar Código Antiguo:** Una vez que la migración sea estable (después de unos días o una semana), elimina el directorio `src/models` y los antiguos controladores.
2.  **Desinstalar Dependencias:**
    ```bash
    npm uninstall mongoose
    ```
3.  **Desmantelar la Base de Datos Antigua:** Da de baja el servidor de MongoDB para ahorrar costos.

Este plan es una hoja de ruta completa. Cada paso, especialmente la reescritura de la lógica de negocio en los controladores, debe realizarse con mucho cuidado y probarse a fondo.
