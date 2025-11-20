# 🚀 ROADMAP DE REFACTORIZACIÓN Y ESCALABILIDAD
## Bot de Pólizas - Telegram

**Fecha:** 2025-11-20
**Estado del proyecto:** Producción estable, requiere refactorización para escalar
**Inversión estimada:** 15-20 semanas de desarrollo
**ROI esperado:** 200-300% en 18 meses

---

## 📊 RESUMEN EJECUTIVO

### Situación Actual
- ✅ Sistema funcionando en producción
- ✅ ~500 usuarios activos
- ❌ **NO escalable horizontalmente** (estado en memoria)
- ❌ **Deuda técnica MEDIA-ALTA**
- ❌ Límite de escalabilidad: ~1,000 usuarios

### Objetivo
- ✅ Soportar **10,000+ usuarios activos**
- ✅ Escalabilidad horizontal (2-10 instancias)
- ✅ Reducción 60% en tiempo de desarrollo
- ✅ Cobertura de tests 80%+
- ✅ Performance 70% mejorado

---

## 🎯 FASE 1: FUNDAMENTOS (4-6 semanas) - CRÍTICO

### Objetivo: Habilitar Escalabilidad Horizontal

### Semana 1-2: Infraestructura de Estado

#### 1.1 Implementar Redis State Manager
**Problema actual:**
```typescript
// Estado en memoria - NO escalable
public uploadTargets: IThreadSafeStateMap<any>;
public awaitingSaveData: IThreadSafeStateMap<any>;
// ... 12 Maps más en commandHandler.ts
```

**Solución:**
```typescript
// src/state/RedisStateManager.ts
import Redis from 'ioredis';

interface IStateManager {
  setState(key: string, value: any, ttl?: number): Promise<void>;
  getState<T>(key: string): Promise<T | null>;
  deleteState(key: string): Promise<void>;
  hasState(key: string): Promise<boolean>;
}

class RedisStateManager implements IStateManager {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  async setState(key: string, value: any, ttl = 3600) {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async getState<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteState(key: string) {
    await this.redis.del(key);
  }

  async hasState(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }
}

// Factory para elegir implementación
class StateFactory {
  static create(): IStateManager {
    if (process.env.NODE_ENV === 'production') {
      return new RedisStateManager();
    }
    return new MemoryStateManager(); // Para desarrollo
  }
}
```

**Tareas:**
- [ ] Configurar Redis en Railway/Render
- [ ] Implementar `RedisStateManager`
- [ ] Implementar `MemoryStateManager` (fallback)
- [ ] Crear `StateFactory`
- [ ] Migrar 12 Maps de `commandHandler.ts`
- [ ] Tests de concurrency
- [ ] Validar en staging

**Esfuerzo:** 60 horas
**Impacto:** CRÍTICO - Desbloquea escalabilidad horizontal

---

#### 1.2 Migrar Session a Redis

**Problema actual:**
```typescript
// Sesiones en memoria
import { session } from 'telegraf';
bot.use(session());
```

**Solución:**
```typescript
import session from 'telegraf-session-redis';

bot.use(session({
  store: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  ttl: 3600, // 1 hora
}));
```

**Tareas:**
- [ ] Instalar `telegraf-session-redis`
- [ ] Configurar sesiones en Redis
- [ ] Migrar datos de sesión existentes
- [ ] Testing

**Esfuerzo:** 8 horas
**Impacto:** ALTO

---

### Semana 3-4: Sistema de Colas

#### 2.1 Implementar Bull Queue para Notificaciones

**Problema actual:**
```typescript
// NotificationManager.ts - Timers en memoria
private activeTimers: Map<string, NodeJS.Timeout>;

const timerId = setTimeout(async () => {
  await this.sendNotification(notificationId);
}, timeToWait);

this.activeTimers.set(notificationId, timerId);
```

**Problemas:**
- ❌ Se pierden al reiniciar
- ❌ No escalable a múltiples instancias
- ❌ No hay retry automático

**Solución:**
```typescript
// src/queues/NotificationQueue.ts
import Queue from 'bull';

export const notificationQueue = new Queue('notifications', {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Producer (cualquier instancia puede encolar)
export async function scheduleNotification(
  notificationId: string,
  scheduledFor: Date
) {
  const delay = scheduledFor.getTime() - Date.now();

  await notificationQueue.add(
    'send-notification',
    { notificationId },
    {
      delay: delay > 0 ? delay : 0,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

// Consumer (worker dedicado o múltiples instancias)
notificationQueue.process('send-notification', async (job) => {
  const { notificationId } = job.data;

  const notification = await ScheduledNotification.findById(notificationId);
  if (!notification) {
    throw new Error('Notification not found');
  }

  await sendNotificationToTelegram(notification);

  await ScheduledNotification.findByIdAndUpdate(notificationId, {
    status: 'SENT',
    sentAt: new Date(),
  });
});

// Error handling
notificationQueue.on('failed', (job, err) => {
  logger.error(`Notification job ${job.id} failed:`, err);
});

notificationQueue.on('completed', (job) => {
  logger.info(`Notification job ${job.id} completed`);
});
```

**Tareas:**
- [ ] Instalar Bull y configurar
- [ ] Crear `NotificationQueue.ts`
- [ ] Migrar lógica de `NotificationManager`
- [ ] Implementar workers
- [ ] Configurar Bull Board (UI para monitoreo)
- [ ] Tests de reliability
- [ ] Validar recovery después de restart

**Esfuerzo:** 80 horas
**Impacto:** CRÍTICO - Fiabilidad de notificaciones

---

### Semana 5-6: Caching Layer

#### 3.1 Implementar Multi-tier Cache

**Problema actual:**
```typescript
// policyController.ts - Sin cache
export const getPolicyByNumber = async (numeroPoliza: string) => {
  // Siempre va a MongoDB
  const policy = await Policy.findOne({ numeroPoliza, estado: 'ACTIVO' });
  return policy;
}
```

**Consultas más frecuentes:**
- `getPolicyByNumber()` - 50+ veces/día por póliza
- `getOldUnusedPolicies()` - Cálculo pesado
- `getSusceptiblePolicies()` - Analiza TODAS las pólizas

**Solución:**
```typescript
// src/cache/CacheService.ts
import NodeCache from 'node-cache';
import Redis from 'ioredis';

class CacheService {
  private l1Cache: NodeCache; // In-memory (5 min TTL)
  private l2Cache: Redis; // Redis (30 min TTL)

  constructor() {
    this.l1Cache = new NodeCache({
      stdTTL: 300, // 5 minutos
      checkperiod: 60,
      useClones: false,
    });

    this.l2Cache = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    // L1 Cache (memoria)
    let value = this.l1Cache.get<T>(key);
    if (value) {
      return value;
    }

    // L2 Cache (Redis)
    const cachedData = await this.l2Cache.get(key);
    if (cachedData) {
      value = JSON.parse(cachedData);
      this.l1Cache.set(key, value);
      return value;
    }

    // Fetch from source
    value = await fetcher();

    // Store in both caches
    await this.l2Cache.setex(key, 1800, JSON.stringify(value)); // 30 min
    this.l1Cache.set(key, value);

    return value;
  }

  async invalidate(key: string) {
    this.l1Cache.del(key);
    await this.l2Cache.del(key);
  }

  async invalidatePattern(pattern: string) {
    // Invalidar por patrón (ej: "policies:*")
    const keys = await this.l2Cache.keys(pattern);
    if (keys.length > 0) {
      await this.l2Cache.del(...keys);
    }
    this.l1Cache.flushAll();
  }
}

// Uso en policyController
const cacheService = new CacheService();

export const getPolicyByNumber = async (numeroPoliza: string) => {
  return await cacheService.get(
    `policy:${numeroPoliza}`,
    async () => {
      return await Policy.findOne({ numeroPoliza, estado: 'ACTIVO' }).lean();
    }
  );
};

// Invalidación cuando se actualiza
export const updatePolicy = async (numeroPoliza: string, data: any) => {
  const updated = await Policy.findOneAndUpdate(
    { numeroPoliza },
    data,
    { new: true }
  );

  // Invalidar cache
  await cacheService.invalidate(`policy:${numeroPoliza}`);
  await cacheService.invalidatePattern(`policies:*`);

  return updated;
};
```

**Tareas:**
- [ ] Implementar `CacheService`
- [ ] Cachear `getPolicyByNumber()`
- [ ] Cachear reportes frecuentes
- [ ] Implementar invalidación event-driven
- [ ] Métricas de hit rate
- [ ] Benchmarks

**Esfuerzo:** 40 horas
**Impacto:** ALTO - Performance inmediata

---

### Impacto Esperado Fase 1:
- ✅ Escalabilidad horizontal habilitada
- ✅ 80% reducción en uso de memoria
- ✅ 60% reducción en queries DB
- ✅ 99.9% fiabilidad de notificaciones

**Entregables:**
- [ ] Redis configurado en producción
- [ ] Sistema de colas funcionando
- [ ] Cache multi-tier operativo
- [ ] Tests de integración pasando
- [ ] Documentación actualizada

---

## 🏗️ FASE 2: ARQUITECTURA LIMPIA (6-8 semanas) - ALTA PRIORIDAD

### Objetivo: Código Mantenible y Testeable

### Semana 1-3: Domain Layer

#### Extraer Entidades de Negocio

**Problema actual:**
```typescript
// Lógica de negocio mezclada con Mongoose
const policy = await Policy.findOne({ numeroPoliza });
policy.servicioCounter += 1;
policy.servicios.push(newService);
await policy.save();
```

**Solución:**
```typescript
// src/domain/Policy/Policy.entity.ts
export class PolicyEntity {
  constructor(
    public numeroPoliza: string,
    public titular: string,
    public servicios: Service[],
    public servicioCounter: number
    // ... otros campos
  ) {}

  addService(serviceData: ServiceData): Service {
    this.servicioCounter += 1;

    const service = new Service({
      numeroServicio: this.servicioCounter,
      ...serviceData,
    });

    this.servicios.push(service);
    return service;
  }

  canAddService(): boolean {
    return this.estado === 'ACTIVO' && this.diasRestantesGracia > 0;
  }

  calculateNextPaymentDate(): Date {
    // Lógica de negocio pura
  }
}

// src/domain/Policy/Policy.service.ts
export class PolicyService {
  constructor(private policyRepo: IPolicyRepository) {}

  async addServiceToPolicy(
    numeroPoliza: string,
    serviceData: ServiceData
  ): Promise<PolicyEntity> {
    const policy = await this.policyRepo.findByNumber(numeroPoliza);

    if (!policy) {
      throw new PolicyNotFoundError(numeroPoliza);
    }

    if (!policy.canAddService()) {
      throw new PolicyInactiveError(numeroPoliza);
    }

    const service = policy.addService(serviceData);
    await this.policyRepo.save(policy);

    return policy;
  }
}
```

**Tareas:**
- [ ] Crear entidades: `PolicyEntity`, `VehicleEntity`, `ServiceEntity`
- [ ] Extraer lógica de negocio a servicios de dominio
- [ ] Implementar validadores
- [ ] Tests unitarios (80%+ cobertura)

**Esfuerzo:** 120 horas

---

### Semana 4-6: Application Layer

#### Implementar Use Cases

**Problema actual:**
```typescript
// commandHandler.ts - Todo mezclado
async handleServiceData(ctx, messageText) {
  // Parsing
  // Validación
  // Lógica de negocio
  // Persistencia
  // UI
  // Todo en 200+ líneas
}
```

**Solución:**
```typescript
// src/application/use-cases/AddServiceUseCase.ts
export class AddServiceUseCase {
  constructor(
    private policyService: PolicyService,
    private notificationService: NotificationService,
    private mapsService: MapsService
  ) {}

  async execute(input: AddServiceInput): Promise<AddServiceOutput> {
    // 1. Validar entrada
    this.validateInput(input);

    // 2. Calcular ruta si se proporcionan coordenadas
    let routeInfo;
    if (input.origen && input.destino) {
      routeInfo = await this.mapsService.calculateRoute(
        input.origen,
        input.destino
      );
    }

    // 3. Agregar servicio a póliza
    const policy = await this.policyService.addServiceToPolicy(
      input.numeroPoliza,
      {
        costo: input.costo,
        fecha: input.fecha,
        expediente: input.expediente,
        origenDestino: input.origenDestino,
        routeInfo,
      }
    );

    // 4. Programar notificaciones
    await this.notificationService.scheduleServiceNotifications(
      policy.numeroPoliza,
      input.expediente
    );

    // 5. Retornar resultado
    return {
      policy,
      service: policy.servicios[policy.servicios.length - 1],
    };
  }

  private validateInput(input: AddServiceInput) {
    if (!input.costo || input.costo <= 0) {
      throw new ValidationError('Costo inválido');
    }
    // ... más validaciones
  }
}

// Handler simplificado
async handleServiceData(ctx, messageText) {
  const input = this.parseServiceInput(messageText);

  const result = await this.addServiceUseCase.execute(input);

  await this.sendSuccessMessage(ctx, result);
}
```

**Tareas:**
- [ ] Definir use cases principales
- [ ] Implementar DTOs y mappers
- [ ] Crear interfaces de repositorios
- [ ] Integration tests

**Esfuerzo:** 120 horas

---

### Semana 7-8: Refactorizar Handlers

#### Simplificar Command Handlers

**Meta:** Reducir `commandHandler.ts` de 1835 líneas a 8 archivos <300 líneas

**Estructura propuesta:**
```
src/presentation/commands/
  ├── handlers/
  │   ├── PolicyQueryHandler.ts (consultas)
  │   ├── PolicyRegistrationHandler.ts (registro)
  │   ├── PaymentHandler.ts (pagos)
  │   ├── ServiceHandler.ts (servicios)
  │   ├── DeletionHandler.ts (eliminación)
  │   ├── ReportHandler.ts (reportes)
  │   ├── NotificationHandler.ts (notificaciones)
  │   └── VehicleHandler.ts (vehículos)
  ├── CommandRegistry.ts
  └── index.ts
```

**Ejemplo de handler refactorizado:**
```typescript
// PolicyQueryHandler.ts (~200 líneas)
export class PolicyQueryHandler {
  constructor(
    private getPolicyUseCase: GetPolicyUseCase,
    private stateManager: IStateManager
  ) {}

  register(bot: Telegraf) {
    bot.command('get', this.handleGetCommand.bind(this));
    bot.on('text', this.handlePolicyNumberInput.bind(this));
  }

  private async handleGetCommand(ctx: Context) {
    await this.stateManager.setState(
      `awaiting:${ctx.chat.id}`,
      'policy_number',
      300
    );
    await ctx.reply('Ingresa el número de póliza:');
  }

  private async handlePolicyNumberInput(ctx: Context) {
    const state = await this.stateManager.getState(`awaiting:${ctx.chat.id}`);

    if (state !== 'policy_number') return;

    const numeroPoliza = ctx.message.text.trim();

    try {
      const policy = await this.getPolicyUseCase.execute({ numeroPoliza });
      await this.sendPolicyInfo(ctx, policy);
    } catch (error) {
      await this.handleError(ctx, error);
    } finally {
      await this.stateManager.deleteState(`awaiting:${ctx.chat.id}`);
    }
  }
}
```

**Tareas:**
- [ ] Dividir `commandHandler.ts` en 8 handlers
- [ ] Implementar dependency injection
- [ ] Migrar a use cases
- [ ] E2E tests

**Esfuerzo:** 80 horas

---

### Impacto Esperado Fase 2:
- ✅ Código 50% más mantenible
- ✅ Cobertura de tests 80%+
- ✅ Tiempo para nueva feature: -60%
- ✅ Reducción de bugs: 40%

---

## ⚡ FASE 3: PERFORMANCE (3-4 semanas) - MEDIA PRIORIDAD

### Semana 1-2: Optimizaciones de Base de Datos

#### 3.1 Convertir Queries a Agregaciones

**Problema actual:**
```typescript
// Carga TODAS las pólizas en memoria
const allActivePolicies = await Policy.find({ estado: 'ACTIVO' }).lean();

for (const policy of allActivePolicies) {
  const totalServicios = (policy.servicios || []).length;
  // Procesamiento en memoria
}
```

**Con 10,000 pólizas = 10,000 documentos en memoria**

**Solución:**
```typescript
export const getOldUnusedPolicies = async () => {
  const results = await Policy.aggregate([
    // Stage 1: Filtrar activas
    {
      $match: {
        estado: 'ACTIVO',
        tipoPoliza: { $ne: 'NIV' },
      },
    },

    // Stage 2: Agregar campo calculado
    {
      $addFields: {
        totalServicios: { $size: { $ifNull: ['$servicios', []] } },
      },
    },

    // Stage 3: Filtrar por servicios
    {
      $match: {
        totalServicios: { $lte: 1 },
      },
    },

    // Stage 4: Ordenar
    {
      $sort: { diasRestantesGracia: 1 },
    },

    // Stage 5: Limitar
    {
      $limit: 20,
    },

    // Stage 6: Proyectar solo campos necesarios
    {
      $project: {
        numeroPoliza: 1,
        titular: 1,
        diasRestantesGracia: 1,
        calificacion: 1,
      },
    },
  ]);

  return results;
};
```

**Beneficios:**
- ✅ 90% menos memoria
- ✅ 70% más rápido
- ✅ Escalable a millones de documentos

**Tareas:**
- [ ] Identificar queries pesados
- [ ] Convertir a agregaciones
- [ ] Crear índices optimizados
- [ ] Benchmarks antes/después

**Esfuerzo:** 40 horas

---

#### 3.2 Implementar Batch Operations

**Problema actual:**
```typescript
// Operaciones individuales en loops
for (const numeroPoliza of numeroPolizas) {
  await markPolicyAsDeleted(numeroPoliza, motivo);
}
```

**Solución:**
```typescript
export const markPoliciesAsDeletedBatch = async (
  numeroPolizas: string[],
  motivo: string
): Promise<BatchResult> => {
  const bulkOps = numeroPolizas.map((num) => ({
    updateOne: {
      filter: { numeroPoliza: num, estado: 'ACTIVO' },
      update: {
        $set: {
          estado: 'ELIMINADO',
          fechaEliminacion: new Date(),
          motivoEliminacion: motivo,
        },
      },
    },
  }));

  const result = await Policy.bulkWrite(bulkOps, { ordered: false });

  return {
    total: numeroPolizas.length,
    successful: result.modifiedCount,
    failed: numeroPolizas.length - result.modifiedCount,
  };
};
```

**Tareas:**
- [ ] Implementar batch operations
- [ ] Migrar loops a bulkWrite
- [ ] Testing de performance

**Esfuerzo:** 20 horas

---

### Semana 3-4: Procesamiento Asíncrono

#### 4.1 Queue para Reportes Pesados

**Problema actual:**
```typescript
// Bloquea el bot 10-30 segundos
const data = await this.getComprehensiveMonthlyDataV2(startDate, endDate);
await ctx.editMessageText(summaryText);
```

**Solución:**
```typescript
// Respuesta inmediata
await ctx.reply('⏳ Generando reporte... Te notificaré cuando esté listo.');

// Encolar trabajo
await reportQueue.add('generate-report', {
  userId: ctx.from.id,
  chatId: ctx.chat.id,
  reportType: 'monthly',
  params: { startDate, endDate },
});

// Worker independiente
reportQueue.process('generate-report', async (job) => {
  const data = await generateComprehensiveData(job.data.params);
  const buffer = await renderPDFReport(data);

  await bot.telegram.sendDocument(
    job.data.chatId,
    {
      source: buffer,
      filename: `reporte-${Date.now()}.pdf`,
    },
    {
      caption: '✅ Tu reporte está listo',
    }
  );
});
```

**Tareas:**
- [ ] Crear `ReportQueue`
- [ ] Migrar generación de reportes
- [ ] Implementar workers
- [ ] Testing

**Esfuerzo:** 30 horas

---

### Impacto Esperado Fase 3:
- ✅ Queries 70% más rápidas
- ✅ Bot responde 90% más rápido
- ✅ Capacidad 5x usuarios concurrentes
- ✅ Reducción 40% en costos de BD

---

## 🔍 FASE 4: PRODUCCIÓN (2-3 semanas) - CONTINUA

### Semana 1: Observabilidad

#### 5.1 Logging Estructurado

```typescript
// src/utils/Logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'polizas-bot',
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Agregar contexto rico
logger.info('Service created', {
  numeroPoliza: 'ABC123',
  expediente: 'EXP-001',
  userId: 12345,
  duration: 150,
});
```

---

#### 5.2 Métricas con Prometheus

```typescript
// src/metrics/metrics.ts
import promClient from 'prom-client';

export const metrics = {
  httpRequestDuration: new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
  }),

  policyCreated: new promClient.Counter({
    name: 'policies_created_total',
    help: 'Total number of policies created',
  }),

  serviceCreated: new promClient.Counter({
    name: 'services_created_total',
    help: 'Total number of services created',
  }),

  notificationsSent: new promClient.Counter({
    name: 'notifications_sent_total',
    help: 'Total number of notifications sent',
    labelNames: ['type', 'status'],
  }),

  activeUsers: new promClient.Gauge({
    name: 'active_users',
    help: 'Number of active users',
  }),
};

// Endpoint de métricas
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

---

#### 5.3 Health Checks

```typescript
// routes/health.ts
app.get('/health', async (req, res) => {
  const health = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    checks: {
      mongodb: await checkMongoDB(),
      redis: await checkRedis(),
      telegram: await checkTelegramAPI(),
      queue: await checkBullQueue(),
    },
  };

  const isHealthy = Object.values(health.checks).every(
    (check) => check.status === 'UP'
  );

  res.status(isHealthy ? 200 : 503).json(health);
});

async function checkMongoDB() {
  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    return { status: 'UP', latency: Date.now() - start };
  } catch (error) {
    return { status: 'DOWN', error: error.message };
  }
}
```

---

### Semana 2: DevOps

#### 6.1 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run build
      - run: railway up
```

---

#### 6.2 Auto-scaling

```yaml
# railway.json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 2,
    "restartPolicyType": "ON_FAILURE",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

---

### Semana 3: Documentación

#### 7.1 API Documentation

```typescript
// Usar Swagger/OpenAPI
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Polizas Bot API',
      version: '1.0.0',
    },
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

---

#### 7.2 Architecture Diagrams

Crear diagramas con Mermaid o C4 Model:
- Component diagram
- Deployment diagram
- Sequence diagrams de flujos principales

---

### Impacto Esperado Fase 4:
- ✅ Incidentes detectados en <1 min
- ✅ Deploy time <5 min
- ✅ MTTR <15 min
- ✅ Documentación completa

---

## 📊 MÉTRICAS DE ÉXITO

### Rendimiento
- ✅ Respuesta promedio: <200ms (actual: 1-2s)
- ✅ P95 latency: <500ms (actual: 3-5s)
- ✅ Throughput: 1000+ req/min (actual: 100)

### Escalabilidad
- ✅ Soportar 10,000+ usuarios activos (actual: ~500)
- ✅ Horizontal scaling sin estado compartido
- ✅ 99.9% uptime con failover automático

### Mantenibilidad
- ✅ Cobertura de tests: 80%+ (actual: ~60%)
- ✅ Tiempo para nueva feature: -50%
- ✅ Bug resolution time: -60%

### Costos
- ✅ Reducción 40% en costos de DB
- ✅ Reducción 30% en memoria
- ✅ Reducción 50% en tiempo de desarrollo

---

## 🚨 RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Downtime durante migración Redis | Media | Alto | Blue-green deployment, feature flags |
| Pérdida de datos en migración | Baja | Crítico | Backups automáticos, rollback plan |
| Regresiones en funcionalidad | Alta | Medio | Tests exhaustivos, staged rollout |
| Aumento de complejidad | Media | Medio | Documentación detallada, training |
| Problemas de performance iniciales | Media | Alto | Load testing, gradual migration |

---

## 💰 ROI ESTIMADO

### Inversión
**15-20 semanas de desarrollo (1-2 developers)**
- Costo estimado: $60,000 - $80,000

### Retorno Esperado

**Año 1:**
- -60% tiempo en mantenimiento = ~$30k ahorrados
- -40% incidentes de producción = ~$15k ahorrados
- +50% velocidad de features = ~$40k en valor de negocio

**Año 2+:**
- Escalabilidad permite 10x usuarios sin hardware adicional
- Base de código mantenible reduce onboarding 70%
- Arquitectura permite monetización (API, SaaS)

**ROI total: ~200-300% en 18 meses**

---

## ✅ CRITERIOS DE ACEPTACIÓN

### Fase 1 (Fundamentos)
- [ ] Redis en producción
- [ ] Estado migrado a Redis
- [ ] Bull Queue procesando notificaciones
- [ ] Cache multi-tier funcionando
- [ ] Tests de concurrency pasando
- [ ] Documentación actualizada

### Fase 2 (Arquitectura)
- [ ] Domain layer implementado
- [ ] Use cases funcionando
- [ ] Handlers refactorizados
- [ ] 80%+ cobertura de tests
- [ ] CI/CD pipeline funcionando

### Fase 3 (Performance)
- [ ] Queries optimizados
- [ ] Batch operations implementadas
- [ ] Reportes asíncronos
- [ ] Benchmarks mejorados 70%+

### Fase 4 (Producción)
- [ ] Métricas en Grafana
- [ ] Logs centralizados
- [ ] Health checks funcionando
- [ ] Auto-scaling configurado
- [ ] Documentación completa

---

## 🎯 RECOMENDACIÓN FINAL

### Prioridad Inmediata (4-6 semanas):
1. **Redis State Management** - Desbloquea escalabilidad
2. **Bull Queue System** - Fiabilidad de notificaciones
3. **Multi-tier Cache** - Performance inmediata

### Enfoque Recomendado:
- ✅ **Incremental migration** con feature flags
- ✅ **Test-driven** refactoring
- ✅ **Monitored rollout** con métricas
- ✅ **Documentation-first**

**El sistema actual funciona, pero NO escalará más allá de 1,000 usuarios sin estas mejoras.**

---

**Documento generado:** 2025-11-20
**Próxima revisión:** Después de cada fase
**Responsable:** Equipo de desarrollo
