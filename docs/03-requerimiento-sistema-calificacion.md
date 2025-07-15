# 📋 REQUERIMIENTO TÉCNICO COMPLETO
## Sistema Inteligente de Calificación y Reportes de Pólizas v2.0

---

## 📌 RESUMEN EJECUTIVO

Se requiere optimizar el sistema actual de calificación de pólizas (actualmente al 90% de funcionalidad) implementando una lógica multi-factor inteligente que considere múltiples variables para la priorización, además de mejorar los reportes para exportación limpia en Excel y PDF. También se debe evaluar y potenciar el comando `/notifications` existente.

---

## 🎯 OBJETIVOS DEL PROYECTO

### Objetivo Principal
Evolucionar la lógica actual de calificación simple a un **sistema inteligente multi-factor** que maximice el aprovechamiento de pólizas antes de su vencimiento.

### Objetivos Específicos
1. **Reducir pólizas vencidas sin uso** de 15% actual a menos del 5%
2. **Optimizar la distribución de servicios** entre pólizas nuevas y maduras
3. **Generar reportes limpios** exportables directamente a Excel y PDF
4. **Automatizar decisiones** con recomendaciones inteligentes
5. **Mejorar visibilidad** de notificaciones programadas

---

## 🔍 ANÁLISIS DEL SISTEMA ACTUAL

### Componentes Existentes que Funcionan Bien ✅
1. **Script `calculoEstadosDB.js`**
   - Calcula estados: VIGENTE, PERIODO DE GRACIA, VENCIDA
   - Se ejecuta diariamente a las 6 AM
   - Actualiza campos en MongoDB

2. **Sistema de Notificaciones**
   - NotificationManager funcional
   - Programa alertas de contacto (22-39 min)
   - Programa alertas de término (tiempo ruta × 1.6)
   - Integrado con Telegram

3. **Funciones de Reportes**
   - `getSusceptiblePolicies()`: Pólizas con pagos pendientes
   - `getOldUnusedPolicies()`: Top 10 pólizas prioritarias

4. **Comando `/notifications`** (EXISTENTE)
   - ✅ Funcional pero restringido a admin
   - Muestra notificaciones pendientes
   - Opciones de listado, hoy y estadísticas

### Problemas Identificados ❌

#### 1. **Lógica de Calificación Muy Simple**
```javascript
// ACTUAL: Solo considera días para vencer
if (servicios === 0) {
    if (dias <= 1) puntaje = 100;
    else if (dias <= 3) puntaje = 80;
    // etc...
}
```

#### 2. **No Considera Factores Críticos**
- ❌ Antigüedad de la póliza (madurez)
- ❌ Tiempo transcurrido desde último servicio
- ❌ Riesgo de pérdida sin uso
- ❌ Distribución inteligente de uso
- ❌ Pólizas que requieren pago inmediato

#### 3. **Reportes No Optimizados**
- Formato no apto para Excel directo
- Sin agrupación por tipo de seguro
- Falta información para toma de decisiones

#### 4. **Comando `/notifications` Limitado**
- Solo accesible para administrador
- No permite filtrar por póliza específica
- Sin integración con reportes

---

## 🚀 SOLUCIÓN PROPUESTA

### 1. NUEVA LÓGICA DE CALIFICACIÓN MULTI-FACTOR

#### **Fórmula de Calificación (100 puntos totales)**

```javascript
function calcularCalificacionInteligente(policy, ahora) {
    // REGLA ABSOLUTA: Si tiene 2+ servicios = 0 puntos
    if (policy.servicios.length >= 2) return 0;
    
    let puntaje = 0;
    
    // 1. FACTOR URGENCIA (35 puntos máx)
    // - Días para vencer: 1-3 días = 35pts, 4-7 días = 25pts, etc.
    
    // 2. FACTOR SERVICIOS (30 puntos máx)  
    // - Sin servicios = 30pts
    // - Con 1 servicio: según días desde último (15+ días = 25pts)
    
    // 3. FACTOR MADUREZ (20 puntos máx)
    // - Óptimo: 20-45 días desde emisión = 20pts
    // - Evitar pólizas < 10 días (muy nuevas)
    
    // 4. FACTOR RIESGO (15 puntos máx)
    // - En periodo gracia sin servicios = 15pts
    // - Próxima a vencer sin 2 servicios = 10pts
    
    return Math.min(puntaje, 100);
}
```

#### **Desglose Detallado de Factores**

##### 1️⃣ **FACTOR URGENCIA POR VENCIMIENTO (35%)**
```javascript
const calcularPuntajeUrgencia = (diasParaVencer) => {
    if (diasParaVencer <= 0) return 0; // Ya vencida
    if (diasParaVencer <= 3) return 35; // Crítico
    if (diasParaVencer <= 7) return 25; // Muy urgente
    if (diasParaVencer <= 15) return 15; // Urgente
    if (diasParaVencer <= 30) return 10; // Normal
    return 5; // Baja urgencia
};
```

##### 2️⃣ **FACTOR SERVICIOS PENDIENTES (30%)**
```javascript
const calcularPuntajeServicios = (numServicios, diasDesdeUltimo) => {
    if (numServicios === 0) return 30; // Máxima prioridad
    
    if (numServicios === 1) {
        // Considerar tiempo desde último servicio
        if (diasDesdeUltimo >= 20) return 25; // Tiempo óptimo
        if (diasDesdeUltimo >= 15) return 20; // Aceptable
        if (diasDesdeUltimo >= 7) return 10;  // Reciente
        return 5; // Muy reciente, baja prioridad
    }
    
    return 0; // Ya tiene 2 servicios
};
```

##### 3️⃣ **FACTOR MADUREZ DE PÓLIZA (20%)**
```javascript
const calcularPuntajeMadurez = (diasDesdeEmision) => {
    if (diasDesdeEmision < 10) return 0;   // Muy nueva - EVITAR
    if (diasDesdeEmision <= 20) return 10; // Nueva pero aceptable
    if (diasDesdeEmision <= 45) return 20; // ÓPTIMO
    if (diasDesdeEmision <= 60) return 15; // Madura
    return 10; // Muy madura pero usable
};
```

##### 4️⃣ **FACTOR RIESGO DE PÉRDIDA (15%)**
```javascript
const calcularPuntajeRiesgo = (estado, numServicios, diasParaVencer) => {
    // Póliza en periodo gracia sin uso = máximo riesgo
    if (estado === 'PERIODO DE GRACIA' && numServicios === 0) return 15;
    
    // Póliza en periodo gracia con 1 servicio
    if (estado === 'PERIODO DE GRACIA' && numServicios === 1) return 10;
    
    // Próxima a vencer sin completar servicios
    if (diasParaVencer <= 10 && numServicios < 2) return 8;
    
    return 0;
};
```

### 2. ALGORITMO DE SELECCIÓN TOP 10

```javascript
async function obtenerPolizasPrioritarias() {
    // 1. Obtener pólizas candidatas
    const candidatas = await Policy.find({ 
        estado: 'ACTIVO',
        $or: [
            { totalServicios: { $lt: 2 } },
            { 'servicios.1': { $exists: false } }
        ]
    }).lean();
    
    // 2. Calcular metadata y calificación
    const polizasEvaluadas = candidatas.map(policy => {
        const metadata = calcularMetadata(policy);
        const calificacion = calcularCalificacionInteligente(policy, ahora);
        
        return {
            ...policy,
            calificacionCalculada: calificacion,
            metadata,
            requiereAccion: determinarAccionRequerida(metadata)
        };
    });
    
    // 3. Aplicar reglas de negocio y ordenar
    return polizasEvaluadas
        .sort((a, b) => {
            // PRIORIDAD ABSOLUTA: Vence en 3 días sin servicios
            if (a.metadata.diasParaVencer <= 3 && a.servicios.length === 0) return -1;
            if (b.metadata.diasParaVencer <= 3 && b.servicios.length === 0) return 1;
            
            // Ordenar por calificación
            return b.calificacionCalculada - a.calificacionCalculada;
        })
        .slice(0, 10);
}
```

### 3. FUNCIONES AUXILIARES NECESARIAS

```javascript
// Calcular días para vencer considerando pagos y periodo gracia
function calcularDiasParaVencer(policy, ahora) {
    const numPagos = policy.pagos?.length || 0;
    let fechaFinGracia;
    
    if (numPagos === 0) {
        // Sin pagos: 1 mes desde emisión
        fechaFinGracia = addMonths(policy.fechaEmision, 1);
    } else {
        // Con pagos: emisión + pagos + 1 mes gracia
        fechaFinGracia = addMonths(policy.fechaEmision, numPagos + 1);
    }
    
    return Math.ceil((fechaFinGracia - ahora) / (1000 * 60 * 60 * 24));
}

// Calcular días desde emisión
function calcularDiasDesdeEmision(policy, ahora) {
    return Math.floor((ahora - policy.fechaEmision) / (1000 * 60 * 60 * 24));
}

// Calcular días desde último servicio
function calcularDiasDesdeUltimoServicio(policy, ahora) {
    if (!policy.servicios?.length) return null;
    
    const ultimoServicio = policy.servicios
        .sort((a, b) => new Date(b.fechaServicio) - new Date(a.fechaServicio))[0];
    
    return Math.floor((ahora - new Date(ultimoServicio.fechaServicio)) / (1000 * 60 * 60 * 24));
}

// Determinar acción requerida
function determinarAccionRequerida(metadata) {
    if (metadata.diasParaVencer <= 3 && metadata.serviciosRestantes > 0) {
        return 'URGENTE: Usar inmediatamente';
    }
    if (metadata.requierePago) {
        return 'Realizar pago y usar';
    }
    if (metadata.serviciosRestantes === 2) {
        return 'Programar primer servicio';
    }
    if (metadata.serviciosRestantes === 1 && metadata.diasDesdeUltimoServicio >= 15) {
        return 'Programar segundo servicio';
    }
    return 'Monitorear';
}
```

### 4. ACTUALIZACIÓN DE `calculoEstadosDB.js`

```javascript
// Reemplazar función calcularPuntaje con la nueva lógica
const calcularPuntaje = (policy, estado, diasCobertura, diasGracia, servicios, ahora) => {
    // Implementar la nueva lógica multi-factor aquí
    const diasParaVencer = estado === 'PERIODO DE GRACIA' ? diasGracia : diasCobertura;
    const diasDesdeEmision = calcularDiasDesdeEmision(policy, ahora);
    const diasDesdeUltimoServicio = calcularDiasDesdeUltimoServicio(policy, ahora);
    
    // Aplicar los 4 factores
    let puntaje = 0;
    puntaje += calcularPuntajeUrgencia(diasParaVencer);
    puntaje += calcularPuntajeServicios(servicios, diasDesdeUltimoServicio);
    puntaje += calcularPuntajeMadurez(diasDesdeEmision);
    puntaje += calcularPuntajeRiesgo(estado, servicios, diasParaVencer);
    
    return Math.min(Math.round(puntaje), 100);
};
```

### 5. REPORTES MEJORADOS

#### **5.1 Reporte de Pagos (Excel/PDF)**

```javascript
async function generarReportePagos() {
    const susceptibles = await getSusceptiblePolicies();
    
    // Estructura para Excel con formato limpio
    const reporte = {
        metadata: {
            titulo: "REPORTE DE PÓLIZAS CON PAGOS PENDIENTES",
            fecha: new Date().toLocaleDateString('es-MX'),
            totalPolizas: susceptibles.length,
            montoEstimado: susceptibles.length * 1000
        },
        columnas: [
            { header: "Núm. Póliza", key: "numeroPoliza", width: 15 },
            { header: "Titular", key: "titular", width: 30 },
            { header: "Aseguradora", key: "aseguradora", width: 20 },
            { header: "Días Impago", key: "diasImpago", width: 12 },
            { header: "Estado Actual", key: "estado", width: 15 },
            { header: "Último Pago", key: "ultimoPago", width: 12 },
            { header: "Monto Sugerido", key: "montoSugerido", width: 15 },
            { header: "Prioridad", key: "prioridad", width: 10 },
            { header: "Acción", key: "accion", width: 25 }
        ],
        datos: susceptibles.map(pol => ({
            numeroPoliza: pol.numeroPoliza,
            titular: pol.titular,
            aseguradora: pol.aseguradora,
            diasImpago: pol.diasDeImpago,
            estado: pol.estadoPoliza || 'PERIODO DE GRACIA',
            ultimoPago: formatearFecha(pol.ultimoPago),
            montoSugerido: "$1,000.00",
            prioridad: pol.diasDeImpago > 30 ? "ALTA" : 
                      pol.diasDeImpago > 15 ? "MEDIA" : "NORMAL",
            accion: pol.diasDeImpago > 30 ? 
                   "Pagar inmediatamente" : 
                   "Programar pago esta semana"
        }))
    };
    
    return reporte;
}
```

#### **5.2 Reporte de Uso Top 10 (Excel/PDF)**

```javascript
async function generarReporteUso() {
    const top10 = await obtenerPolizasPrioritarias();
    
    const reporte = {
        metadata: {
            titulo: "TOP 10 PÓLIZAS PRIORITARIAS PARA SERVICIO",
            subtitulo: "Sistema de Calificación Multi-Factor v2.0",
            fecha: new Date().toLocaleDateString('es-MX'),
            hora: new Date().toLocaleTimeString('es-MX')
        },
        resumenEjecutivo: {
            totalEvaluadas: await Policy.countDocuments({ estado: 'ACTIVO' }),
            sinServicios: top10.filter(p => p.servicios.length === 0).length,
            conUnServicio: top10.filter(p => p.servicios.length === 1).length,
            requierenPago: top10.filter(p => p.metadata.requierePago).length
        },
        columnas: [
            { header: "Rank", key: "ranking", width: 8 },
            { header: "Score", key: "calificacion", width: 10 },
            { header: "Póliza", key: "numeroPoliza", width: 15 },
            { header: "Titular", key: "titular", width: 25 },
            { header: "Vehículo", key: "vehiculo", width: 30 },
            { header: "Días Venc.", key: "diasVencimiento", width: 12 },
            { header: "Servicios", key: "servicios", width: 12 },
            { header: "Madurez", key: "madurez", width: 15 },
            { header: "Razón Principal", key: "razon", width: 30 },
            { header: "Acción Sugerida", key: "accion", width: 35 }
        ],
        datos: top10.map((pol, idx) => ({
            ranking: idx + 1,
            calificacion: pol.calificacionCalculada,
            numeroPoliza: pol.numeroPoliza,
            titular: pol.titular,
            vehiculo: `${pol.marca} ${pol.submarca} ${pol.año}`,
            diasVencimiento: pol.metadata.diasParaVencer,
            servicios: `${pol.servicios.length}/2`,
            madurez: `${pol.metadata.diasDesdeEmision} días`,
            razon: determinarRazonPrincipal(pol),
            accion: pol.requiereAccion
        })),
        recomendaciones: generarRecomendaciones(top10)
    };
    
    return reporte;
}
```

### 6. MEJORAS AL COMANDO `/notifications`

#### **Estado Actual**
- ✅ Funcional pero restringido solo a administrador (ID: 7143094298)
- Muestra listado, notificaciones de hoy y estadísticas
- Sin filtros por póliza o usuario

#### **Mejoras Propuestas**

```javascript
// 1. Nuevo comando para usuarios regulares
bot.command('misnotificaciones', async (ctx) => {
    // Permitir a usuarios ver sus propias notificaciones
    const userPhone = await getUserPhoneFromContext(ctx);
    const notifications = await getNotificationsByPhone(userPhone);
    // Mostrar notificaciones del usuario
});

// 2. Agregar filtros al comando admin
// - Por póliza específica
// - Por rango de fechas
// - Por tipo (CONTACTO/TERMINO)
// - Por estado (PENDING/SENT/FAILED)

// 3. Integración con reportes
// Incluir resumen de notificaciones en reportes diarios
const notificacionesHoy = await ScheduledNotification.countDocuments({
    status: 'PENDING',
    scheduledDate: {
        $gte: startOfDay,
        $lte: endOfDay
    }
});
```

#### **Nueva Estructura del Comando**

```javascript
// Para administradores - versión mejorada
/notifications
├── 📋 Ver todas (paginado)
├── 📅 Hoy
├── 📊 Estadísticas
├── 🔍 Buscar por póliza
├── 📈 Reporte semanal
└── ⚙️ Configuración

// Para usuarios regulares
/misnotificaciones
├── 🔔 Pendientes
├── ✅ Completadas
└── 📅 Calendario
```

### 7. INTEGRACIÓN CON SISTEMA DE NOTIFICACIONES

El sistema actual de notificaciones **NO requiere cambios**, ya funciona correctamente:

#### **Notificaciones Existentes que se Mantienen:**
1. **Notificación de Contacto** (amarilla 🟨)
   - Se programa 22-39 minutos después de asignar servicio
   - Formato actual se mantiene

2. **Notificación de Término** (verde 🟩)
   - Se programa según: tiempo ruta × 1.6
   - Formato actual se mantiene

#### **Nueva Integración Propuesta:**
```javascript
// En el reporte diario, incluir notificaciones pendientes
async function incluirNotificacionesPendientes(reporte) {
    const notificaciones = await ScheduledNotification.find({
        status: 'PENDING',
        scheduledDate: { 
            $gte: new Date(),
            $lte: new Date(Date.now() + 24*60*60*1000)
        }
    });
    
    reporte.notificacionesProximas24h = notificaciones.length;
    reporte.detalleNotificaciones = {
        contacto: notificaciones.filter(n => n.tipoNotificacion === 'CONTACTO').length,
        termino: notificaciones.filter(n => n.tipoNotificacion === 'TERMINO').length
    };
    
    return reporte;
}
```

---

## 📊 EJEMPLOS DE CASOS DE USO

### Caso 1: Póliza Nueva Sin Servicios
```
Póliza: ABC123
Emisión: Hace 25 días
Servicios: 0/2
Estado: PERIODO DE GRACIA
Días para vencer: 5

CALIFICACIÓN: 90/100
- Urgencia: 25 pts (vence pronto)
- Servicios: 30 pts (sin usar)
- Madurez: 20 pts (edad óptima)
- Riesgo: 15 pts (periodo gracia sin uso)

ACCIÓN: ⚠️ USAR INMEDIATAMENTE
```

### Caso 2: Póliza con 1 Servicio
```
Póliza: XYZ789
Emisión: Hace 45 días
Servicios: 1/2
Último servicio: Hace 18 días
Estado: VIGENTE
Días para vencer: 15

CALIFICACIÓN: 60/100
- Urgencia: 15 pts
- Servicios: 20 pts (tiempo adecuado)
- Madurez: 20 pts
- Riesgo: 5 pts

ACCIÓN: ✓ Programar segundo servicio
```

---

## 🔧 CONSIDERACIONES TÉCNICAS

### Base de Datos
- **Índices necesarios**: `fechaEmision`, `estadoPoliza`, `calificacion`
- **Campos nuevos**: Ninguno (usa los existentes)
- **Migraciones**: No requeridas

### Performance
- Cálculo de calificaciones: **Batch processing** en `calculoEstadosDB.js`
- Cache de resultados: 1 hora para reportes
- Límite de procesamiento: 1000 pólizas por batch

### Seguridad
- Validación de fechas para evitar manipulación
- Logs de auditoría para cambios de calificación
- Respaldo antes de actualización masiva
- Control de acceso diferenciado para notificaciones

---

## 📅 PLAN DE IMPLEMENTACIÓN

### Fase 1: Desarrollo (5 días)
1. **Día 1-2**: Implementar nueva lógica de calificación
2. **Día 3**: Actualizar `calculoEstadosDB.js`
3. **Día 4**: Desarrollar reportes Excel/PDF
4. **Día 5**: Mejorar comando `/notifications`

### Fase 2: Testing (3 días)
1. **Día 6**: Pruebas con datos reales (subset)
2. **Día 7**: Ajustes y optimización
3. **Día 8**: Pruebas de regresión y notificaciones

### Fase 3: Despliegue (2 días)
1. **Día 9**: Despliegue en staging
2. **Día 10**: Despliegue en producción

---

## ✅ CRITERIOS DE ÉXITO

1. **Reducción de pólizas vencidas sin uso**: < 5%
2. **Distribución de servicios**: 
   - 40% pólizas 20-45 días
   - 30% pólizas 10-20 días
   - 30% casos especiales
3. **Tiempo de generación reportes**: < 5 segundos
4. **Precisión de recomendaciones**: > 85%
5. **Adopción comando notificaciones**: 50% usuarios en 2 semanas

---

## 🚨 RIESGOS Y MITIGACIÓN

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Resistencia al cambio | Alto | Mantener lógica actual como fallback |
| Performance degradado | Medio | Implementar cache y batch processing |
| Cálculos incorrectos | Alto | Suite completa de tests + validación manual |
| Sobrecarga de notificaciones | Medio | Rate limiting y agrupación inteligente |

---

## 📝 NOTAS PARA EL EQUIPO

1. **NO modificar** el sistema de notificaciones actual (solo agregar features)
2. **Mantener** compatibilidad con scripts existentes
3. **Documentar** cada factor de calificación
4. **Logs detallados** para debugging
5. **Modo debug** para ver cálculo de cada póliza
6. **Preservar** restricción admin en `/notifications` principal

---

## 🎯 ENTREGABLES FINALES

1. **Código actualizado**:
   - `calculoEstadosDB.js` con nueva lógica
   - `policyController.js` con funciones mejoradas
   - `NotificationCommand.js` con nuevas funcionalidades
   - Nuevas funciones auxiliares

2. **Reportes**:
   - Template Excel para pagos
   - Template Excel para uso
   - Exportador PDF
   - Integración con notificaciones

3. **Documentación**:
   - Manual técnico de la nueva lógica
   - Guía de interpretación de calificaciones
   - Manual de usuario para notificaciones
   - Ejemplos de casos de uso

4. **Tests**:
   - Suite de pruebas unitarias
   - Casos de prueba edge
   - Script de validación
   - Tests de integración notificaciones

---

## 🔄 RESUMEN DE CAMBIOS PRINCIPALES

### 🆕 NUEVO
- Lógica multi-factor de calificación (4 factores)
- Reportes optimizados para Excel/PDF
- Comando `/misnotificaciones` para usuarios
- Integración notificaciones en reportes
- Funciones auxiliares de cálculo

### 🔧 MEJORADO
- Algoritmo de selección Top 10
- Comando `/notifications` con filtros
- `calculoEstadosDB.js` con nueva lógica
- Metadata enriquecida por póliza

### ✅ SE MANTIENE
- Sistema de notificaciones actual
- Estructura de base de datos
- Scripts de respaldo/exportación
- Comandos existentes

---

**Fecha de inicio propuesta**: Inmediata
**Duración estimada**: 10 días hábiles
**Equipo requerido**: 2 desarrolladores backend, 1 QA

**Prioridades de implementación**:
1. Nueva lógica de calificación (crítico)
2. Reportes mejorados (alta)
3. Mejoras a notificaciones (media)
4. Documentación (continua)