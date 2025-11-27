# 🔄 PLAN DE MIGRACIÓN: MongoDB → PostgreSQL
**Fecha:** 30 de Octubre de 2025
**Proyecto:** Bot de Pólizas
**Autor:** Equipo de Desarrollo

---

## 📋 RESUMEN EJECUTIVO

### Por qué migrar de MongoDB a PostgreSQL

| Razón | MongoDB (actual) | PostgreSQL (objetivo) | Beneficio |
|-------|------------------|----------------------|-----------|
| **Integridad de datos** | Schemas flexibles causan corrupción | ACID compliant, constraints estrictos | ✅ Datos consistentes |
| **Relaciones** | Referencias manuales, sin FK | Foreign Keys nativas, CASCADE | ✅ Integridad referencial |
| **Transacciones** | Limitadas en versiones antiguas | ACID desde siempre | ✅ Operaciones atómicas |
| **Queries complejas** | Aggregation pipeline complejo | SQL estándar, JOINs nativos | ✅ Queries más simples |
| **Validación** | `strict: false` permite cualquier cosa | Schema estricto en DB | ✅ Previene corrupción |
| **Costo** | Atlas MongoDB puede ser caro | Postgres gratuito, Supabase/Neon | ✅ Reducción de costos |
| **Tooling** | Limitado | pgAdmin, DBeaver, psql, etc. | ✅ Mejor ecosistema |
| **Full-text search** | Básico | Potente con tsvector | ✅ Búsquedas avanzadas |

### Resumen de cambios

- **4 colecciones MongoDB** → **9 tablas PostgreSQL** (normalización)
- **Arrays embebidos** → **Tablas relacionadas con FK**
- **Mongoose ODM** → **Prisma ORM** o **TypeORM**
- **ObjectId** → **UUID** o **SERIAL**
- **Buffers (archivos)** → **URLs de R2/S3** (ya iniciado)

---

## 📊 ESTRUCTURA ACTUAL (MongoDB)

### Colecciones identificadas

1. **policies** (pólizas) - ~XXX documentos
   - Arrays embebidos: `pagos`, `registros`, `servicios`, `archivos`
   - Relación opcional: `vehicleId` → vehicles

2. **vehicles** (vehículos) - ~XXX documentos
   - Array embebido: `archivos`
   - Relación opcional: `policyId` → policies

3. **schedulednotifications** (notificaciones) - ~XXX documentos
   - Referencia: `numeroPoliza` → policies (string, no FK)

4. **auditlogs** (auditoría) - ~XXX documentos
   - Sin relaciones formales

### Problemas identificados

🚨 **BUG CRÍTICO:** 22 scripts con `{ strict: false }` permiten corrupción de datos
- Ver documento: `docs/ANALISIS_BUGS_CRITICOS.md` (BUG #7)

---

## 🗄️ DISEÑO DE SCHEMA POSTGRESQL

### Diagrama de relaciones

```
┌─────────────────┐       ┌──────────────────┐
│    policies     │ 1   ? │    vehicles      │
│   (pólizas)     │◄──────│   (vehículos)    │
└────────┬────────┘       └──────────────────┘
         │ 1
         │
         │ N
    ┌────▼─────────────────┐
    │                      │
┌───▼────────┐  ┌──────────▼──┐  ┌─────────────▼───┐
│   pagos    │  │  registros  │  │   servicios     │
└────────────┘  └─────────────┘  └─────────────────┘
         │ 1          │ 1               │ 1
         │            │                 │
         │ N          │ N               │ N
    ┌────▼─────┐ ┌────▼──────────┐┌────▼─────────────┐
    │  N/A     │ │ coordenadas   ││  coordenadas     │
    └──────────┘ │ ruta_info     ││  ruta_info       │
                 └───────────────┘└──────────────────┘

┌────────────────────────┐
│ scheduled_notifications│
│ (notificaciones)       │
└────────────────────────┘
        │ N
        │
        │ 1
   ┌────▼─────────┐
   │   policies   │
   └──────────────┘

┌──────────────┐
│  audit_logs  │
│ (auditoría)  │
└──────────────┘
```

---

### 📋 SCHEMA DETALLADO

#### 1. Tabla: `policies`

```sql
CREATE TABLE policies (
    -- PK
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Datos del titular
    titular VARCHAR(255) NOT NULL,
    correo VARCHAR(255),
    contraseña VARCHAR(255),
    rfc VARCHAR(13) NOT NULL,

    -- Dirección
    calle VARCHAR(255) NOT NULL,
    colonia VARCHAR(255) NOT NULL,
    municipio VARCHAR(255) NOT NULL,
    estado_region VARCHAR(100),
    cp VARCHAR(10) NOT NULL,

    -- Datos del vehículo
    marca VARCHAR(100) NOT NULL,
    submarca VARCHAR(100) NOT NULL,
    año INTEGER NOT NULL CHECK (año >= 1900 AND año <= EXTRACT(YEAR FROM CURRENT_DATE) + 1),
    color VARCHAR(50) NOT NULL,
    serie VARCHAR(17) NOT NULL,
    placas VARCHAR(20) NOT NULL,

    -- Datos de la póliza
    agente_cotizador VARCHAR(255) NOT NULL,
    aseguradora VARCHAR(100) NOT NULL,
    numero_poliza VARCHAR(100) NOT NULL UNIQUE,
    fecha_emision DATE NOT NULL,
    telefono VARCHAR(20),

    -- Estado de la póliza
    estado_poliza VARCHAR(50),
    fecha_fin_cobertura DATE,
    fecha_fin_gracia DATE,
    dias_restantes_cobertura INTEGER DEFAULT 0,
    dias_restantes_gracia INTEGER DEFAULT 0,

    -- Calificación y servicios
    calificacion INTEGER DEFAULT 0 CHECK (calificacion >= 0 AND calificacion <= 5),
    total_servicios INTEGER DEFAULT 0,

    -- Contadores
    servicio_counter INTEGER DEFAULT 0,
    registro_counter INTEGER DEFAULT 0,

    -- Estado
    estado VARCHAR(20) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'ELIMINADO')),
    fecha_eliminacion TIMESTAMP,
    motivo_eliminacion TEXT,

    -- Relación con vehículos (opcional)
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    creado_via_obd BOOLEAN DEFAULT FALSE,
    asignado_por VARCHAR(255),

    -- Sistema NIV
    es_niv BOOLEAN DEFAULT FALSE,
    tipo_poliza VARCHAR(10) DEFAULT 'REGULAR' CHECK (tipo_poliza IN ('REGULAR', 'NIV')),
    fecha_conversion_niv TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_policies_rfc ON policies(rfc);
CREATE INDEX idx_policies_placas ON policies(placas);
CREATE INDEX idx_policies_estado ON policies(estado);
CREATE INDEX idx_policies_numero_poliza ON policies(numero_poliza);
CREATE INDEX idx_policies_created_at ON policies(created_at DESC);

-- Full-text search index
CREATE INDEX idx_policies_titular_fts ON policies USING GIN(to_tsvector('spanish', titular));
```

---

#### 2. Tabla: `pagos`

```sql
CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

    monto DECIMAL(10,2) NOT NULL,
    fecha_pago DATE NOT NULL,
    estado VARCHAR(20) DEFAULT 'PLANIFICADO'
        CHECK (estado IN ('PLANIFICADO', 'REALIZADO', 'VENCIDO', 'CANCELADO')),
    metodo_pago VARCHAR(50),
    referencia VARCHAR(100),
    notas TEXT,

    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pagos_policy_id ON pagos(policy_id);
CREATE INDEX idx_pagos_fecha_pago ON pagos(fecha_pago);
CREATE INDEX idx_pagos_estado ON pagos(estado);
```

---

#### 3. Tabla: `registros`

```sql
CREATE TABLE registros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

    numero_registro INTEGER,
    costo DECIMAL(10,2),
    fecha_registro DATE,
    numero_expediente VARCHAR(100),
    origen_destino TEXT,
    estado VARCHAR(20) DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'ASIGNADO', 'NO_ASIGNADO')),
    fecha_contacto_programada DATE,
    fecha_termino_programada DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_registros_policy_id ON registros(policy_id);
CREATE INDEX idx_registros_numero_expediente ON registros(numero_expediente);
CREATE INDEX idx_registros_estado ON registros(estado);
```

---

#### 4. Tabla: `registro_coordenadas`

```sql
CREATE TABLE registro_coordenadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id UUID NOT NULL UNIQUE REFERENCES registros(id) ON DELETE CASCADE,

    -- Coordenadas origen
    origen_lat DECIMAL(10,7),
    origen_lng DECIMAL(10,7),

    -- Coordenadas destino
    destino_lat DECIMAL(10,7),
    destino_lng DECIMAL(10,7),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reg_coord_registro_id ON registro_coordenadas(registro_id);
```

---

#### 5. Tabla: `registro_ruta_info`

```sql
CREATE TABLE registro_ruta_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id UUID NOT NULL UNIQUE REFERENCES registros(id) ON DELETE CASCADE,

    distancia_km DECIMAL(10,2),
    tiempo_minutos INTEGER,
    google_maps_url TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reg_ruta_registro_id ON registro_ruta_info(registro_id);
```

---

#### 6. Tabla: `servicios`

```sql
CREATE TABLE servicios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

    numero_servicio INTEGER,
    numero_registro_origen INTEGER,
    costo DECIMAL(10,2),
    fecha_servicio DATE,
    numero_expediente VARCHAR(100),
    origen_destino TEXT,
    fecha_contacto_programada DATE,
    fecha_termino_programada DATE,
    fecha_contacto_real DATE,
    fecha_termino_real DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_servicios_policy_id ON servicios(policy_id);
CREATE INDEX idx_servicios_numero_expediente ON servicios(numero_expediente);
CREATE INDEX idx_servicios_fecha_servicio ON servicios(fecha_servicio);
```

---

#### 7. Tabla: `servicio_coordenadas` (similar a registro_coordenadas)

```sql
CREATE TABLE servicio_coordenadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    servicio_id UUID NOT NULL UNIQUE REFERENCES servicios(id) ON DELETE CASCADE,

    origen_lat DECIMAL(10,7),
    origen_lng DECIMAL(10,7),
    destino_lat DECIMAL(10,7),
    destino_lng DECIMAL(10,7),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

#### 8. Tabla: `servicio_ruta_info` (similar a registro_ruta_info)

```sql
CREATE TABLE servicio_ruta_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    servicio_id UUID NOT NULL UNIQUE REFERENCES servicios(id) ON DELETE CASCADE,

    distancia_km DECIMAL(10,2),
    tiempo_minutos INTEGER,
    google_maps_url TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

#### 9. Tabla: `policy_files`

**Nota:** Archivos ya están migrando a R2/S3, así que solo guardaremos URLs

```sql
CREATE TABLE policy_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

    -- Tipo de archivo
    file_type VARCHAR(20) CHECK (file_type IN ('foto', 'pdf')),

    -- Datos del archivo (R2/S3)
    url TEXT NOT NULL,
    key VARCHAR(500) NOT NULL,
    original_name VARCHAR(255),
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    fuente_original VARCHAR(50),

    -- Timestamps
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_policy_id ON policy_files(policy_id);
CREATE INDEX idx_files_file_type ON policy_files(file_type);
```

---

#### 10. Tabla: `vehicles`

```sql
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificación del vehículo
    serie VARCHAR(17) NOT NULL UNIQUE CHECK (LENGTH(serie) = 17),

    -- Datos del vehículo
    marca VARCHAR(100) NOT NULL,
    submarca VARCHAR(100) NOT NULL,
    año INTEGER NOT NULL CHECK (año >= 1900 AND año <= EXTRACT(YEAR FROM CURRENT_DATE) + 2),
    color VARCHAR(50) NOT NULL,
    placas VARCHAR(20) NOT NULL,

    -- Datos del titular
    titular VARCHAR(255) NOT NULL,
    rfc VARCHAR(13) NOT NULL CHECK (LENGTH(rfc) = 13),
    telefono VARCHAR(20) NOT NULL,
    correo VARCHAR(255) NOT NULL,

    -- Dirección
    calle VARCHAR(255),
    colonia VARCHAR(255),
    municipio VARCHAR(255),
    estado_region VARCHAR(100),
    cp VARCHAR(10),

    -- Estado
    estado VARCHAR(20) DEFAULT 'SIN_POLIZA'
        CHECK (estado IN ('SIN_POLIZA', 'CON_POLIZA', 'ELIMINADO', 'CONVERTIDO_NIV')),

    -- Metadatos
    creado_por VARCHAR(255) NOT NULL,
    creado_via VARCHAR(20) DEFAULT 'TELEGRAM_BOT'
        CHECK (creado_via IN ('TELEGRAM_BOT', 'WEB_INTERFACE', 'API')),
    notas TEXT CHECK (LENGTH(notas) <= 500),

    -- Relación con póliza (opcional)
    policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vehicles_serie ON vehicles(serie);
CREATE INDEX idx_vehicles_placas ON vehicles(placas);
CREATE INDEX idx_vehicles_estado ON vehicles(estado);
CREATE INDEX idx_vehicles_creado_por ON vehicles(creado_por);
CREATE INDEX idx_vehicles_created_at ON vehicles(created_at DESC);
```

---

#### 11. Tabla: `vehicle_files`

```sql
CREATE TABLE vehicle_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

    -- Solo fotos para vehículos
    file_type VARCHAR(20) DEFAULT 'foto',

    -- Datos del archivo (R2/S3)
    url TEXT NOT NULL,
    key VARCHAR(500) NOT NULL,
    original_name VARCHAR(255),
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    fuente_original VARCHAR(50),

    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vehicle_files_vehicle_id ON vehicle_files(vehicle_id);
```

---

#### 12. Tabla: `scheduled_notifications`

```sql
CREATE TABLE scheduled_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relación con póliza
    policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
    numero_poliza VARCHAR(100) NOT NULL, -- Redundante pero útil

    -- Información del servicio
    expediente_num VARCHAR(100) NOT NULL,
    origen_destino TEXT,

    -- Datos adicionales
    placas VARCHAR(20),
    foto_url TEXT,
    marca_modelo VARCHAR(200),
    color_vehiculo VARCHAR(50),
    telefono VARCHAR(20),

    -- Datos de programación
    contact_time VARCHAR(50) NOT NULL,
    scheduled_date TIMESTAMP NOT NULL,
    last_scheduled_at TIMESTAMP,
    processing_started_at TIMESTAMP,

    -- Metadatos
    created_by_chat_id BIGINT,
    created_by_username VARCHAR(255),
    target_group_id BIGINT NOT NULL,

    -- Tipo y estado
    tipo_notificacion VARCHAR(20) DEFAULT 'MANUAL'
        CHECK (tipo_notificacion IN ('CONTACTO', 'TERMINO', 'MANUAL')),
    status VARCHAR(20) DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),

    -- Registro de envío
    sent_at TIMESTAMP,
    error TEXT,

    -- Control de reintentos
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,

    -- Datos adicionales (JSONB para flexibilidad)
    additional_data JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_notif_policy_id ON scheduled_notifications(policy_id);
CREATE INDEX idx_notif_numero_poliza ON scheduled_notifications(numero_poliza);
CREATE INDEX idx_notif_status ON scheduled_notifications(status);
CREATE INDEX idx_notif_scheduled_date ON scheduled_notifications(scheduled_date);
CREATE INDEX idx_notif_status_date ON scheduled_notifications(status, scheduled_date);

-- Índice único anti-duplicados (solo para notificaciones activas)
CREATE UNIQUE INDEX idx_notif_unique_active
ON scheduled_notifications(numero_poliza, expediente_num, tipo_notificacion)
WHERE status IN ('PENDING', 'SCHEDULED', 'PROCESSING');
```

---

#### 13. Tabla: `audit_logs`

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Usuario que ejecuta la acción
    user_id BIGINT NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    chat_id BIGINT NOT NULL,

    -- Acción
    action VARCHAR(255) NOT NULL,
    module VARCHAR(20) NOT NULL CHECK (module IN ('policy', 'service', 'database', 'system')),

    -- Entidad afectada
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),

    -- Cambios realizados
    changes_before JSONB,
    changes_after JSONB,

    -- Metadatos
    metadata JSONB,

    -- Resultado
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure', 'partial')),
    error_message TEXT,

    -- Timestamp
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_module ON audit_logs(module);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
```

---

## 🔄 ESTRATEGIA DE MIGRACIÓN

### Opción A: Migración "Big Bang" (Recomendada para proyecto pequeño)

**Ventajas:**
- ✅ Migración completa en un solo paso
- ✅ Sin mantener dos bases de datos
- ✅ Más simple de ejecutar

**Desventajas:**
- ❌ Requiere downtime (2-4 horas estimadas)
- ❌ Rollback más complejo

**Downtime estimado:** 2-4 horas

---

### Opción B: Migración Gradual (Dual Write)

**Ventajas:**
- ✅ Zero downtime
- ✅ Rollback más seguro
- ✅ Testing en producción

**Desventajas:**
- ❌ Complejidad alta (escribir en 2 DBs)
- ❌ Más tiempo de desarrollo
- ❌ Riesgo de inconsistencias

**Tiempo estimado:** 2-3 semanas

---

### ✅ RECOMENDACIÓN: Opción A (Big Bang)

**Razón:** El bot puede estar offline 2-4 horas sin impacto crítico al negocio

---

## 📅 PLAN DE IMPLEMENTACIÓN - FASE POR FASE

### FASE 0: PREPARACIÓN (3-5 días)

#### 0.1 Setup de infraestructura PostgreSQL
- [ ] Crear DB en Supabase/Neon/Railway/Render
- [ ] Configurar variables de entorno
- [ ] Instalar PostgreSQL localmente para desarrollo

#### 0.2 Seleccionar ORM
**Opciones:**
1. **Prisma** (Recomendado) - Type-safe, migrations automáticas
2. **TypeORM** - Más flexible, decorators

**Decisión:** Prisma por simplicidad y type-safety

```bash
npm install prisma @prisma/client
npx prisma init
```

#### 0.3 Crear schema Prisma
Ver código en sección "SCHEMA PRISMA COMPLETO" abajo

#### 0.4 Corregir scripts con `strict: false`
**CRÍTICO:** Antes de migrar, corregir BUG #7
- Ver `docs/ANALISIS_BUGS_CRITICOS.md` FASE 0

---

### FASE 1: DESARROLLO (1 semana)

#### 1.1 Implementar modelos Prisma
- [ ] Definir schema completo
- [ ] Generar tipos TypeScript
- [ ] Crear migraciones

#### 1.2 Crear capa de abstracción DAL (Data Access Layer)
```typescript
// src/dal/policyRepository.ts
export class PolicyRepository {
  async findByNumeroPoliza(numero: string) {
    return await prisma.policy.findUnique({
      where: { numeroPoliza: numero },
      include: {
        pagos: true,
        registros: {
          include: {
            coordenadas: true,
            rutaInfo: true
          }
        },
        servicios: {
          include: {
            coordenadas: true,
            rutaInfo: true
          }
        },
        archivos: true
      }
    });
  }

  // ... más métodos
}
```

#### 1.3 Adaptar código existente
- [ ] Reemplazar imports de Mongoose por Prisma
- [ ] Actualizar queries
- [ ] Adaptar métodos customizados

---

### FASE 2: SCRIPT DE MIGRACIÓN DE DATOS (3-4 días)

#### 2.1 Crear script de migración

**Archivo:** `scripts/migrate-mongo-to-postgres.ts`

```typescript
import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
import Policy from '../src/models/policy';
import Vehicle from '../src/models/vehicle';
// ... imports

const prisma = new PrismaClient();

async function migrateData() {
  console.log('🚀 Iniciando migración MongoDB → PostgreSQL');

  try {
    // 1. Migrar vehículos primero (sin dependencias)
    await migrateVehicles();

    // 2. Migrar pólizas
    await migratePolicies();

    // 3. Migrar notificaciones
    await migrateNotifications();

    // 4. Migrar audit logs
    await migrateAuditLogs();

    console.log('✅ Migración completada con éxito');
  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  }
}

async function migratePolicies() {
  console.log('📄 Migrando pólizas...');

  const mongoPolicies = await Policy.find({}).lean();
  console.log(`Total pólizas en MongoDB: ${mongoPolicies.length}`);

  let migrated = 0;

  for (const mongoPolicy of mongoPolicies) {
    try {
      // Crear póliza
      const policy = await prisma.policy.create({
        data: {
          titular: mongoPolicy.titular,
          correo: mongoPolicy.correo || null,
          contraseña: mongoPolicy.contraseña || null,
          rfc: mongoPolicy.rfc,
          calle: mongoPolicy.calle,
          colonia: mongoPolicy.colonia,
          municipio: mongoPolicy.municipio,
          estadoRegion: mongoPolicy.estadoRegion || null,
          cp: mongoPolicy.cp,
          marca: mongoPolicy.marca,
          submarca: mongoPolicy.submarca,
          año: mongoPolicy.año,
          color: mongoPolicy.color,
          serie: mongoPolicy.serie,
          placas: mongoPolicy.placas,
          agenteCotizador: mongoPolicy.agenteCotizador,
          aseguradora: mongoPolicy.aseguradora,
          numeroPoliza: mongoPolicy.numeroPoliza,
          fechaEmision: mongoPolicy.fechaEmision,
          telefono: mongoPolicy.telefono || null,
          estadoPoliza: mongoPolicy.estadoPoliza || null,
          fechaFinCobertura: mongoPolicy.fechaFinCobertura || null,
          fechaFinGracia: mongoPolicy.fechaFinGracia || null,
          diasRestantesCobertura: mongoPolicy.diasRestantesCobertura || 0,
          diasRestantesGracia: mongoPolicy.diasRestantesGracia || 0,
          calificacion: mongoPolicy.calificacion || 0,
          totalServicios: mongoPolicy.totalServicios || 0,
          servicioCounter: mongoPolicy.servicioCounter || 0,
          registroCounter: mongoPolicy.registroCounter || 0,
          estado: mongoPolicy.estado || 'ACTIVO',
          fechaEliminacion: mongoPolicy.fechaEliminacion || null,
          motivoEliminacion: mongoPolicy.motivoEliminacion || '',
          creadoViaObd: mongoPolicy.creadoViaOBD || false,
          asignadoPor: mongoPolicy.asignadoPor || null,
          esNiv: mongoPolicy.esNIV || false,
          tipoPoliza: mongoPolicy.tipoPoliza || 'REGULAR',
          fechaConversionNiv: mongoPolicy.fechaConversionNIV || null,
          createdAt: mongoPolicy.createdAt || new Date(),
          updatedAt: mongoPolicy.updatedAt || new Date()
        }
      });

      // Migrar pagos
      if (mongoPolicy.pagos && mongoPolicy.pagos.length > 0) {
        await prisma.pago.createMany({
          data: mongoPolicy.pagos.map((pago: any) => ({
            policyId: policy.id,
            monto: pago.monto,
            fechaPago: pago.fechaPago,
            estado: pago.estado || 'PLANIFICADO',
            metodoPago: pago.metodoPago || null,
            referencia: pago.referencia || null,
            notas: pago.notas || null,
            fechaRegistro: pago.fechaRegistro || new Date()
          }))
        });
      }

      // Migrar registros
      if (mongoPolicy.registros && mongoPolicy.registros.length > 0) {
        for (const registro of mongoPolicy.registros) {
          const reg = await prisma.registro.create({
            data: {
              policyId: policy.id,
              numeroRegistro: registro.numeroRegistro || null,
              costo: registro.costo || null,
              fechaRegistro: registro.fechaRegistro || null,
              numeroExpediente: registro.numeroExpediente || null,
              origenDestino: registro.origenDestino || null,
              estado: registro.estado || 'PENDIENTE',
              fechaContactoProgramada: registro.fechaContactoProgramada || null,
              fechaTerminoProgramada: registro.fechaTerminoProgramada || null
            }
          });

          // Migrar coordenadas si existen
          if (registro.coordenadas) {
            await prisma.registroCoordenadas.create({
              data: {
                registroId: reg.id,
                origenLat: registro.coordenadas.origen?.lat || null,
                origenLng: registro.coordenadas.origen?.lng || null,
                destinoLat: registro.coordenadas.destino?.lat || null,
                destinoLng: registro.coordenadas.destino?.lng || null
              }
            });
          }

          // Migrar ruta info si existe
          if (registro.rutaInfo) {
            await prisma.registroRutaInfo.create({
              data: {
                registroId: reg.id,
                distanciaKm: registro.rutaInfo.distanciaKm || null,
                tiempoMinutos: registro.rutaInfo.tiempoMinutos || null,
                googleMapsUrl: registro.rutaInfo.googleMapsUrl || null
              }
            });
          }
        }
      }

      // Migrar servicios (similar a registros)
      // ... código similar

      // Migrar archivos R2
      if (mongoPolicy.archivos?.r2Files) {
        const r2Fotos = mongoPolicy.archivos.r2Files.fotos || [];
        const r2Pdfs = mongoPolicy.archivos.r2Files.pdfs || [];

        const allFiles = [
          ...r2Fotos.map((f: any) => ({ ...f, fileType: 'foto' })),
          ...r2Pdfs.map((f: any) => ({ ...f, fileType: 'pdf' }))
        ];

        if (allFiles.length > 0) {
          await prisma.policyFile.createMany({
            data: allFiles.map((file: any) => ({
              policyId: policy.id,
              fileType: file.fileType,
              url: file.url,
              key: file.key,
              originalName: file.originalName || null,
              contentType: file.contentType,
              sizeBytes: file.size,
              fuenteOriginal: file.fuenteOriginal || null,
              uploadDate: file.uploadDate || new Date()
            }))
          });
        }
      }

      migrated++;
      if (migrated % 100 === 0) {
        console.log(`  ✓ Migradas ${migrated} / ${mongoPolicies.length} pólizas`);
      }

    } catch (error) {
      console.error(`❌ Error migrando póliza ${mongoPolicy.numeroPoliza}:`, error);
      // Continuar con siguiente (o throw si queremos detener)
    }
  }

  console.log(`✅ Total pólizas migradas: ${migrated}`);
}

// ... migrateVehicles(), migrateNotifications(), migrateAuditLogs()

async function main() {
  // Conectar a MongoDB
  await mongoose.connect(process.env.MONGO_URI!);

  // Ejecutar migración
  await migrateData();

  // Cerrar conexiones
  await prisma.$disconnect();
  await mongoose.disconnect();
}

main();
```

#### 2.2 Testing del script
- [ ] Migrar a DB de prueba
- [ ] Validar conteos
- [ ] Validar relaciones
- [ ] Validar datos

---

### FASE 3: TESTING (1 semana)

#### 3.1 Testing en ambiente de staging
- [ ] Ejecutar migración completa
- [ ] Validar funcionalidades del bot
- [ ] Testing de consultas
- [ ] Testing de creación/edición/eliminación
- [ ] Performance testing

#### 3.2 Tests automatizados
```typescript
// tests/dal/policyRepository.test.ts
describe('PolicyRepository', () => {
  it('should find policy by numero poliza', async () => {
    const policy = await policyRepo.findByNumeroPoliza('ABC123');
    expect(policy).toBeDefined();
    expect(policy.numeroPoliza).toBe('ABC123');
  });

  // ... más tests
});
```

---

### FASE 4: MIGRACIÓN EN PRODUCCIÓN (1 día)

#### Plan de ejecución (Día D)

**Hora de inicio recomendada:** Madrugada del sábado/domingo (menos usuarios)

**Timeline:**

| Hora | Acción | Duración | Responsable |
|------|--------|----------|-------------|
| 00:00 | Anunciar mantenimiento a usuarios | 10 min | PM |
| 00:10 | Detener bot en producción | 5 min | Dev |
| 00:15 | Backup completo de MongoDB | 30 min | DevOps |
| 00:45 | Ejecutar script de migración | 60-90 min | Dev |
| 02:15 | Validar datos migrados | 20 min | Dev + QA |
| 02:35 | Desplegar versión con Prisma | 15 min | DevOps |
| 02:50 | Testing smoke en producción | 20 min | Dev + QA |
| 03:10 | Iniciar bot | 5 min | Dev |
| 03:15 | Monitorear errores | 45 min | Dev |
| 04:00 | ✅ Migración completada | - | Todos |

**Total downtime:** ~3 horas

---

#### Checklist de migración

**Pre-migración:**
- [ ] Backup completo de MongoDB
- [ ] Backup de código actual
- [ ] Variables de entorno configuradas
- [ ] PostgreSQL DB creada y accesible
- [ ] Script de migración testeado en staging
- [ ] Plan de rollback listo

**Durante migración:**
- [ ] Bot detenido
- [ ] Ejecutar script de migración
- [ ] Validar conteos:
  - [ ] Políticas: XXX en Mongo = XXX en Postgres
  - [ ] Vehículos: XXX en Mongo = XXX en Postgres
  - [ ] Notificaciones: XXX en Mongo = XXX en Postgres
  - [ ] Audit logs: XXX en Mongo = XXX en Postgres
- [ ] Validar relaciones (FK constraints)
- [ ] Desplegar nuevo código

**Post-migración:**
- [ ] Smoke tests en producción
- [ ] Monitoreo de errores por 24h
- [ ] Validación de funcionalidades críticas
- [ ] Comunicar a usuarios que sistema está operativo

---

### FASE 5: POST-MIGRACIÓN (1 semana)

#### 5.1 Monitoreo intensivo
- [ ] Logs de errores
- [ ] Performance de queries
- [ ] Métricas de usuarios

#### 5.2 Optimización
- [ ] Identificar queries lentos
- [ ] Agregar índices faltantes
- [ ] Optimizar JOINs

#### 5.3 Cleanup
- [ ] Después de 1 semana sin problemas:
  - [ ] Mantener MongoDB como backup frio
  - [ ] Después de 1 mes: considerar eliminar MongoDB

---

## 🔙 PLAN DE ROLLBACK

En caso de fallo crítico durante la migración:

### Escenario A: Fallo en el script de migración
1. Detener script
2. DROP database PostgreSQL
3. Revertir código a versión con Mongoose
4. Reiniciar bot con MongoDB
5. Analizar logs, corregir script
6. Re-intentar en otra ventana de mantenimiento

### Escenario B: Bot funciona pero con errores en producción
1. Si errores críticos (>20% de operaciones fallan):
   - Revertir código a Mongoose
   - Reiniciar bot con MongoDB
   - Investigar causa
2. Si errores menores (<5% de operaciones):
   - Mantener PostgreSQL
   - Hotfix inmediato
   - Monitorear

---

## 📊 SCHEMA PRISMA COMPLETO

**Archivo:** `prisma/schema.prisma`

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Policy {
  id String @id @default(uuid())

  // Datos del titular
  titular    String
  correo     String?
  contraseña String?
  rfc        String

  // Dirección
  calle        String
  colonia      String
  municipio    String
  estadoRegion String?
  cp           String

  // Datos del vehículo
  marca    String
  submarca String
  año      Int
  color    String
  serie    String
  placas   String

  // Datos de la póliza
  agenteCotizador String
  aseguradora     String
  numeroPoliza    String   @unique
  fechaEmision    DateTime
  telefono        String?

  // Estado de la póliza
  estadoPoliza            String?
  fechaFinCobertura       DateTime?
  fechaFinGracia          DateTime?
  diasRestantesCobertura  Int       @default(0)
  diasRestantesGracia     Int       @default(0)

  // Calificación y servicios
  calificacion   Int @default(0)
  totalServicios Int @default(0)

  // Contadores
  servicioCounter Int @default(0)
  registroCounter Int @default(0)

  // Estado
  estado            String    @default("ACTIVO")
  fechaEliminacion  DateTime?
  motivoEliminacion String    @default("")

  // Relación con vehículos
  vehicleId     String?
  vehicle       Vehicle? @relation("PolicyVehicle", fields: [vehicleId], references: [id])
  creadoViaObd  Boolean  @default(false)
  asignadoPor   String?

  // Sistema NIV
  esNiv             Boolean   @default(false)
  tipoPoliza        String    @default("REGULAR")
  fechaConversionNiv DateTime?

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  pagos                  Pago[]
  registros              Registro[]
  servicios              Servicio[]
  archivos               PolicyFile[]
  scheduledNotifications ScheduledNotification[]

  @@index([rfc])
  @@index([placas])
  @@index([estado])
  @@index([numeroPoliza])
  @@index([createdAt(sort: Desc)])
  @@map("policies")
}

model Pago {
  id       String @id @default(uuid())
  policyId String
  policy   Policy @relation(fields: [policyId], references: [id], onDelete: Cascade)

  monto         Float
  fechaPago     DateTime
  estado        String   @default("PLANIFICADO")
  metodoPago    String?
  referencia    String?
  notas         String?
  fechaRegistro DateTime @default(now())

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([policyId])
  @@index([fechaPago])
  @@index([estado])
  @@map("pagos")
}

model Registro {
  id       String @id @default(uuid())
  policyId String
  policy   Policy @relation(fields: [policyId], references: [id], onDelete: Cascade)

  numeroRegistro          Int?
  costo                   Float?
  fechaRegistro           DateTime?
  numeroExpediente        String?
  origenDestino           String?
  estado                  String    @default("PENDIENTE")
  fechaContactoProgramada DateTime?
  fechaTerminoProgramada  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  coordenadas RegistroCoordenadas?
  rutaInfo    RegistroRutaInfo?

  @@index([policyId])
  @@index([numeroExpediente])
  @@index([estado])
  @@map("registros")
}

model RegistroCoordenadas {
  id         String   @id @default(uuid())
  registroId String   @unique
  registro   Registro @relation(fields: [registroId], references: [id], onDelete: Cascade)

  origenLat  Float?
  origenLng  Float?
  destinoLat Float?
  destinoLng Float?

  createdAt DateTime @default(now())

  @@index([registroId])
  @@map("registro_coordenadas")
}

model RegistroRutaInfo {
  id         String   @id @default(uuid())
  registroId String   @unique
  registro   Registro @relation(fields: [registroId], references: [id], onDelete: Cascade)

  distanciaKm    Float?
  tiempoMinutos  Int?
  googleMapsUrl  String?

  createdAt DateTime @default(now())

  @@index([registroId])
  @@map("registro_ruta_info")
}

model Servicio {
  id       String @id @default(uuid())
  policyId String
  policy   Policy @relation(fields: [policyId], references: [id], onDelete: Cascade)

  numeroServicio          Int?
  numeroRegistroOrigen    Int?
  costo                   Float?
  fechaServicio           DateTime?
  numeroExpediente        String?
  origenDestino           String?
  fechaContactoProgramada DateTime?
  fechaTerminoProgramada  DateTime?
  fechaContactoReal       DateTime?
  fechaTerminoReal        DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  coordenadas ServicioCoordenadas?
  rutaInfo    ServicioRutaInfo?

  @@index([policyId])
  @@index([numeroExpediente])
  @@index([fechaServicio])
  @@map("servicios")
}

model ServicioCoordenadas {
  id         String   @id @default(uuid())
  servicioId String   @unique
  servicio   Servicio @relation(fields: [servicioId], references: [id], onDelete: Cascade)

  origenLat  Float?
  origenLng  Float?
  destinoLat Float?
  destinoLng Float?

  createdAt DateTime @default(now())

  @@index([servicioId])
  @@map("servicio_coordenadas")
}

model ServicioRutaInfo {
  id         String   @id @default(uuid())
  servicioId String   @unique
  servicio   Servicio @relation(fields: [servicioId], references: [id], onDelete: Cascade)

  distanciaKm    Float?
  tiempoMinutos  Int?
  googleMapsUrl  String?

  createdAt DateTime @default(now())

  @@index([servicioId])
  @@map("servicio_ruta_info")
}

model PolicyFile {
  id       String @id @default(uuid())
  policyId String
  policy   Policy @relation(fields: [policyId], references: [id], onDelete: Cascade)

  fileType       String
  url            String
  key            String
  originalName   String?
  contentType    String
  sizeBytes      BigInt
  fuenteOriginal String?

  uploadDate DateTime @default(now())
  createdAt  DateTime @default(now())

  @@index([policyId])
  @@index([fileType])
  @@map("policy_files")
}

model Vehicle {
  id String @id @default(uuid())

  // Identificación
  serie String @unique

  // Datos del vehículo
  marca    String
  submarca String
  año      Int
  color    String
  placas   String

  // Datos del titular
  titular      String
  rfc          String
  telefono     String
  correo       String
  calle        String?
  colonia      String?
  municipio    String?
  estadoRegion String?
  cp           String?

  // Estado
  estado String @default("SIN_POLIZA")

  // Metadatos
  creadoPor  String
  creadoVia  String  @default("TELEGRAM_BOT")
  notas      String?

  // Relación con póliza
  policyId String?
  policy   Policy? @relation("VehiclePolicy", fields: [policyId], references: [id])

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  archivos      VehicleFile[]
  policiesOwned Policy[]      @relation("PolicyVehicle")

  @@index([serie])
  @@index([placas])
  @@index([estado])
  @@index([creadoPor])
  @@index([createdAt(sort: Desc)])
  @@map("vehicles")
}

model VehicleFile {
  id        String  @id @default(uuid())
  vehicleId String
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  fileType       String  @default("foto")
  url            String
  key            String
  originalName   String?
  contentType    String
  sizeBytes      BigInt
  fuenteOriginal String?

  uploadDate DateTime @default(now())
  createdAt  DateTime @default(now())

  @@index([vehicleId])
  @@map("vehicle_files")
}

model ScheduledNotification {
  id String @id @default(uuid())

  // Relación con póliza
  policyId     String?
  policy       Policy? @relation(fields: [policyId], references: [id], onDelete: Cascade)
  numeroPoliza String

  // Información del servicio
  expedienteNum String
  origenDestino String?

  // Datos adicionales
  placas        String?
  fotoUrl       String?
  marcaModelo   String?
  colorVehiculo String?
  telefono      String?

  // Datos de programación
  contactTime          String
  scheduledDate        DateTime
  lastScheduledAt      DateTime?
  processingStartedAt  DateTime?

  // Metadatos
  createdByChatId    BigInt?
  createdByUsername  String?
  targetGroupId      BigInt

  // Tipo y estado
  tipoNotificacion String @default("MANUAL")
  status           String @default("PENDING")

  // Registro de envío
  sentAt   DateTime?
  error    String?

  // Control de reintentos
  retryCount   Int       @default(0)
  lastRetryAt  DateTime?

  // Datos adicionales (JSONB)
  additionalData Json?

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([policyId])
  @@index([numeroPoliza])
  @@index([status])
  @@index([scheduledDate])
  @@index([status, scheduledDate])
  @@unique([numeroPoliza, expedienteNum, tipoNotificacion], name: "unique_active_notification")
  @@map("scheduled_notifications")
}

model AuditLog {
  id String @id @default(uuid())

  // Usuario
  userId    BigInt
  username  String?
  firstName String?
  chatId    BigInt

  // Acción
  action String
  module String

  // Entidad
  entityType String?
  entityId   String?

  // Cambios (JSONB)
  changesBefore Json?
  changesAfter  Json?

  // Metadatos
  metadata Json?

  // Resultado
  result       String
  errorMessage String?

  // Timestamp
  timestamp DateTime @default(now())
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([module])
  @@index([timestamp(sort: Desc)])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

---

## 📝 COMANDOS ÚTILES

### Setup inicial
```bash
# Instalar Prisma
npm install prisma @prisma/client

# Inicializar Prisma
npx prisma init

# Generar cliente TypeScript
npx prisma generate

# Crear migración
npx prisma migrate dev --name init

# Aplicar migración en producción
npx prisma migrate deploy
```

### Durante desarrollo
```bash
# Ver estado de DB
npx prisma studio

# Reset completo de DB
npx prisma migrate reset

# Validar schema
npx prisma validate

# Formatear schema
npx prisma format
```

### Testing
```bash
# Ejecutar script de migración
npx tsx scripts/migrate-mongo-to-postgres.ts

# Con variables de entorno específicas
DATABASE_URL="postgresql://..." MONGO_URI="mongodb://..." npx tsx scripts/migrate-mongo-to-postgres.ts
```

---

## ✅ CRITERIOS DE ÉXITO

### Métricas de validación

- [ ] **100% de datos migrados**
  - Conteos coinciden entre MongoDB y PostgreSQL
  - Sin pérdida de datos

- [ ] **0 errores en queries críticos**
  - Consulta de póliza por número
  - Creación de nueva póliza
  - Actualización de servicios
  - Eliminación lógica

- [ ] **Performance aceptable**
  - Queries <100ms para consultas simples
  - Queries <500ms para consultas complejas con JOINs

- [ ] **0 downtime no planeado**
  - Migración en ventana de mantenimiento
  - Rollback exitoso si es necesario

---

## 🎯 BENEFICIOS POST-MIGRACIÓN

### Inmediatos
- ✅ Integridad referencial garantizada (FK constraints)
- ✅ No más corrupción de datos por `strict: false`
- ✅ Transactions ACID para operaciones complejas

### Corto plazo (1 mes)
- ✅ Queries más simples y mantenibles
- ✅ Mejor tooling (pgAdmin, DBeaver)
- ✅ Full-text search potente

### Largo plazo (3-6 meses)
- ✅ Reducción de costos (vs MongoDB Atlas)
- ✅ Escalabilidad horizontal (read replicas)
- ✅ Backup/restore más confiable

---

## 📞 CONTACTOS Y RECURSOS

### Equipo
- **Dev Lead:** [Nombre]
- **DevOps:** [Nombre]
- **QA:** [Nombre]
- **PM:** [Nombre]

### Recursos
- **Prisma Docs:** https://www.prisma.io/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Supabase:** https://supabase.com
- **Neon:** https://neon.tech

---

**Documento:** Plan de Migración MongoDB → PostgreSQL
**Versión:** 1.0
**Estado:** 📋 LISTO PARA REVISIÓN
**Próximos pasos:** Revisar con equipo, aprobar, ejecutar FASE 0
