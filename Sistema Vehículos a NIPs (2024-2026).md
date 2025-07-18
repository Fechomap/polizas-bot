# 📋 REQUERIMIENTO TÉCNICO COMPLETO
## Sistema de Conversión Automática de Vehículos a NIPs (2024-2026)

---

## 📌 CONTEXTO Y ANÁLISIS ACTUAL

### Sistema Actual de BD AUTOS
Basado en el análisis del Project Knowledge, el sistema actual funciona en dos etapas:

1. **Persona 1 - Registro de Vehículo**
   - Handler: `VehicleRegistrationHandler.js`
   - Captura: Serie (VIN), marca, submarca, año, color, placas, fotos
   - Estado resultante: `SIN_POLIZA`
   - Datos auto-generados: Titular mexicano con RFC válido

2. **Persona 2 - Asignación de Póliza**
   - Handler: `PolicyAssignmentHandler.js`
   - Asigna póliza a vehículo `SIN_POLIZA`
   - Requiere: PDF obligatorio, datos de aseguradora, pagos
   - Estado resultante: `CON_POLIZA`

### Reporte de Pólizas Sin Servicios Recientes
- Comando: `ReportUsedCommand.js`
- Ejecuta script `calculoEstadosDB.js`
- Muestra Top 10 pólizas prioritarias
- Calificación basada en días para vencer y servicios

---

## 🎯 OBJETIVO DEL NUEVO SISTEMA

### Requisito Principal
Implementar detección automática de vehículos con años 2024, 2025 y 2026 para convertirlos en **NIPs (Números de Identificación Vehicular)** que se integren directamente como pólizas sin proceso de aseguramiento.

### Características del Sistema NIP
1. **Detección Automática**: Al registrar vehículo con año 2024-2026
2. **Conversión Directa**: Vehículo → Póliza sin intervención de Persona 2
3. **Número de Póliza = Número de Serie (VIN)**
4. **Sin pagos ni PDF requeridos**
5. **Integración con reporte de pólizas prioritarias**
6. **Eliminación automática al usar**

---

## 📊 ANÁLISIS TÉCNICO DETALLADO

### 1. FLUJO ACTUAL vs FLUJO NIP

#### Flujo Actual (Vehículos < 2024)
```
Registro Vehículo → Estado: SIN_POLIZA → Asegurar → Estado: CON_POLIZA
```

#### Flujo NIP (Vehículos 2024-2026)
```
Registro Vehículo → Detectar Año → Crear Póliza NIP → Estado: ACTIVO (NIP)
```

### 2. CAMBIOS EN MODELOS DE DATOS

#### Policy Model - Nuevos Campos
```javascript
{
  // Campo existente que usaremos
  creadoViaOBD: true, // Ya existe, lo reutilizamos
  
  // Nuevos campos sugeridos
  esNIP: {
    type: Boolean,
    default: false
  },
  tipoPoliza: {
    type: String,
    enum: ['REGULAR', 'NIP'],
    default: 'REGULAR'
  },
  fechaConversionNIP: {
    type: Date,
    default: null
  }
}
```

#### Vehicle Model - Modificación de Estado
```javascript
estado: {
  type: String,
  enum: ['SIN_POLIZA', 'CON_POLIZA', 'ELIMINADO', 'CONVERTIDO_NIP'],
  default: 'SIN_POLIZA'
}
```

### 3. LÓGICA DE DETECCIÓN Y CONVERSIÓN

#### Ubicación: `VehicleRegistrationHandler.js` - Método `finalizarRegistro()`

```javascript
static async finalizarRegistro(bot, chatId, userId, registro) {
    try {
        const añoVehiculo = parseInt(registro.datos.año);
        const esVehiculoNIP = añoVehiculo >= 2024 && añoVehiculo <= 2026;
        
        if (esVehiculoNIP) {
            // NUEVO FLUJO: Conversión automática a NIP
            return await this.convertirANIP(bot, chatId, userId, registro);
        } else {
            // FLUJO EXISTENTE: Registro normal
            // ... código actual ...
        }
    } catch (error) {
        // ... manejo de errores ...
    }
}

static async convertirANIP(bot, chatId, userId, registro) {
    // 1. Crear vehículo con estado especial
    const vehiculoData = {
        ...registro.datos,
        ...registro.datosGenerados,
        creadoPor: userId,
        creadoVia: 'TELEGRAM_BOT',
        estado: 'CONVERTIDO_NIP' // Nuevo estado
    };
    
    const vehiculoCreado = await VehicleController.registrarVehiculo(
        vehiculoData, 
        userId, 
        'TELEGRAM_BOT'
    );
    
    // 2. Crear póliza NIP automáticamente
    const polizaNIP = {
        // Datos del vehículo
        numeroPoliza: registro.datos.serie, // NIP = Serie
        titular: registro.datosGenerados.titular,
        rfc: registro.datosGenerados.rfc,
        telefono: registro.datosGenerados.telefono,
        correo: registro.datosGenerados.correo,
        // ... resto de datos de dirección ...
        
        // Datos del vehículo
        marca: registro.datos.marca,
        submarca: registro.datos.submarca,
        año: registro.datos.año,
        color: registro.datos.color,
        serie: registro.datos.serie,
        placas: registro.datos.placas,
        
        // Datos de póliza NIP
        fechaEmision: new Date(),
        aseguradora: 'NIP_AUTOMATICO',
        agenteCotizador: 'SISTEMA',
        
        // Sin pagos
        pagos: [],
        
        // Marcadores especiales
        creadoViaOBD: true,
        esNIP: true,
        tipoPoliza: 'NIP',
        vehicleId: vehiculoCreado._id,
        
        // Estado activo
        estado: 'ACTIVO',
        estadoPoliza: 'VIGENTE'
    };
    
    // Guardar póliza
    const polizaCreada = await Policy.create(polizaNIP);
    
    // 3. Actualizar vehículo con referencia a póliza
    await Vehicle.findByIdAndUpdate(vehiculoCreado._id, {
        policyId: polizaCreada._id
    });
    
    // 4. Transferir fotos si existen
    if (registro.fotos && registro.fotos.length > 0) {
        // ... lógica de transferencia de fotos ...
    }
    
    // 5. Mensaje de confirmación especial
    const mensaje = 
        '✅ *VEHÍCULO NIP REGISTRADO*\n\n' +
        '🚗 *Información del Vehículo:*\n' +
        `Marca: ${registro.datos.marca} ${registro.datos.submarca}\n` +
        `Año: ${registro.datos.año} (NIP Automático)\n` +
        `Color: ${registro.datos.color}\n` +
        `NIP: ${registro.datos.serie}\n\n` +
        '⚡ *CONVERSIÓN AUTOMÁTICA APLICADA*\n' +
        'Este vehículo ha sido convertido a NIP por ser modelo 2024-2026.\n\n' +
        '📋 El NIP está disponible para uso inmediato en reportes.';
    
    await bot.telegram.sendMessage(chatId, mensaje, {
        parse_mode: 'Markdown',
        reply_markup: getMainKeyboard()
    });
    
    // Limpiar registro
    vehiculosEnProceso.delete(userId);
    
    return true;
}
```

### 4. MODIFICACIÓN DEL REPORTE DE PÓLIZAS PRIORITARIAS

#### Archivo: `controllers/policyController.js`

```javascript
exports.getOldUnusedPolicies = async () => {
    try {
        // 1. Obtener Top 10 pólizas regulares (lógica existente)
        const regularPolicies = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: { $ne: 'NIP' }, // Excluir NIPs del top regular
            $or: [
                { totalServicios: 0 },
                { totalServicios: 1 }
            ]
        })
        .sort({ calificacion: -1 })
        .limit(10);
        
        // 2. Obtener hasta 4 NIPs disponibles
        const nips = await Policy.find({
            estado: 'ACTIVO',
            tipoPoliza: 'NIP',
            totalServicios: 0 // Solo NIPs sin usar
        })
        .sort({ createdAt: -1 }) // Más recientes primero
        .limit(4);
        
        // 3. Combinar resultados
        const todasLasPolizas = [...regularPolicies, ...nips];
        
        // 4. Formatear para presentación
        return todasLasPolizas.map((policy, index) => {
            const esNIP = policy.tipoPoliza === 'NIP';
            return {
                ...policy.toObject(),
                posicion: index + 1,
                tipoReporte: esNIP ? 'NIP' : 'REGULAR',
                mensajeEspecial: esNIP ? '⚡ NIP DISPONIBLE' : null
            };
        });
    } catch (error) {
        logger.error('Error obteniendo pólizas prioritarias:', error);
        throw error;
    }
};
```

#### Modificación en `ReportUsedCommand.js`

```javascript
// En el método de formateo del reporte
const formatearMensaje = (policies) => {
    let mensaje = '📊 *PÓLIZAS PRIORITARIAS Y NIPs*\n\n';
    
    // Separar regulares y NIPs
    const regulares = policies.filter(p => p.tipoReporte !== 'NIP');
    const nips = policies.filter(p => p.tipoReporte === 'NIP');
    
    // Mostrar pólizas regulares
    if (regulares.length > 0) {
        mensaje += '📋 *TOP 10 PÓLIZAS REGULARES:*\n';
        regulares.forEach(policy => {
            mensaje += `${policy.posicion}. ${policy.numeroPoliza} - `;
            mensaje += `${policy.marca} ${policy.año} - `;
            mensaje += `Calificación: ${policy.calificacion}/100\n`;
        });
    }
    
    // Mostrar NIPs disponibles
    if (nips.length > 0) {
        mensaje += '\n⚡ *NIPs DISPONIBLES (2024-2026):*\n';
        nips.forEach(nip => {
            mensaje += `${nip.posicion}. NIP: ${nip.numeroPoliza}\n`;
            mensaje += `   ${nip.marca} ${nip.submarca} ${nip.año}\n`;
            mensaje += `   Color: ${nip.color} | Placas: ${nip.placas || 'Sin placas'}\n`;
        });
    }
    
    return mensaje;
};
```

### 5. LÓGICA DE ELIMINACIÓN AL USAR NIP

#### En `OcuparPolizaCallback.js` - Después de crear servicio

```javascript
// Detectar si es un NIP y marcarlo para eliminación
if (policy.tipoPoliza === 'NIP' && policy.totalServicios >= 1) {
    // Marcar póliza como eliminada
    policy.estado = 'ELIMINADO';
    policy.fechaEliminacion = new Date();
    policy.motivoEliminacion = 'NIP utilizado - Eliminación automática';
    await policy.save();
    
    // Marcar vehículo asociado como eliminado
    if (policy.vehicleId) {
        await Vehicle.findByIdAndUpdate(policy.vehicleId, {
            estado: 'ELIMINADO'
        });
    }
    
    // Log de auditoría
    logger.info(`NIP ${policy.numeroPoliza} marcado como eliminado tras uso`);
    
    // Mensaje adicional al usuario
    await ctx.reply(
        '⚡ *NOTA: NIP CONSUMIDO*\n' +
        'Este NIP ha sido utilizado y se ha eliminado automáticamente del sistema.',
        { parse_mode: 'Markdown' }
    );
}
```

---

## 🚀 MEJORES PRÁCTICAS IMPLEMENTADAS

### 1. VALIDACIÓN Y SEGURIDAD

```javascript
// Validación de año para NIPs
const esAñoNIP = (año) => {
    const añoNum = parseInt(año);
    return añoNum >= 2024 && añoNum <= 2026;
};

// Prevención de duplicados
const validarSerieUnicaNIP = async (serie) => {
    const existe = await Policy.findOne({ 
        numeroPoliza: serie,
        tipoPoliza: 'NIP',
        estado: 'ACTIVO'
    });
    
    if (existe) {
        throw new Error('Ya existe un NIP activo con esta serie');
    }
};
```

### 2. TRANSACCIONES Y ATOMICIDAD

```javascript
// Usar transacciones MongoDB para consistencia
const session = await mongoose.startSession();
session.startTransaction();

try {
    // Crear vehículo
    const vehiculo = await Vehicle.create([vehiculoData], { session });
    
    // Crear póliza
    const poliza = await Policy.create([polizaData], { session });
    
    // Actualizar referencias
    await Vehicle.findByIdAndUpdate(
        vehiculo[0]._id, 
        { policyId: poliza[0]._id },
        { session }
    );
    
    await session.commitTransaction();
} catch (error) {
    await session.abortTransaction();
    throw error;
} finally {
    session.endSession();
}
```

### 3. LOGGING Y AUDITORÍA

```javascript
// Crear entrada de auditoría para conversiones NIP
const crearAuditoriaNIP = async (vehiculo, poliza, usuario) => {
    await AuditLog.create({
        usuario: usuario,
        accion: 'CONVERSION_NIP_AUTOMATICA',
        entidad: 'Policy',
        entidadId: poliza._id,
        cambios: {
            vehiculoId: vehiculo._id,
            serie: vehiculo.serie,
            año: vehiculo.año,
            tipoConversion: 'AUTOMATICA'
        },
        timestamp: new Date()
    });
};
```

### 4. MANEJO DE ERRORES ROBUSTO

```javascript
class NIPConversionError extends Error {
    constructor(message, vehiculoId, detalles) {
        super(message);
        this.name = 'NIPConversionError';
        this.vehiculoId = vehiculoId;
        this.detalles = detalles;
    }
}

// Uso
try {
    await convertirANIP(datos);
} catch (error) {
    if (error instanceof NIPConversionError) {
        // Manejo específico para errores de NIP
        await notificarAdminError(error);
        await revertirCambiosParciales(error.vehiculoId);
    }
    throw error;
}
```

---

## 📋 ROADMAP DE IMPLEMENTACIÓN

### FASE 1: PREPARACIÓN (2 días)
- [ ] Crear branch `feature/nip-automatico`
- [ ] Actualizar modelos de datos con nuevos campos
- [ ] Crear migraciones para datos existentes
- [ ] Setup de tests unitarios

### FASE 2: DESARROLLO CORE (3 días)
- [ ] Implementar detección de años 2024-2026
- [ ] Crear método `convertirANIP()`
- [ ] Integrar con `VehicleRegistrationHandler`
- [ ] Implementar transacciones para atomicidad

### FASE 3: MODIFICACIÓN REPORTES (2 días)
- [ ] Actualizar `getOldUnusedPolicies()`
- [ ] Modificar `ReportUsedCommand`
- [ ] Agregar separación visual NIPs vs regulares
- [ ] Testing de reportes combinados

### FASE 4: ELIMINACIÓN AUTOMÁTICA (1 día)
- [ ] Modificar `OcuparPolizaCallback`
- [ ] Implementar lógica de eliminación NIP
- [ ] Agregar auditoría de eliminaciones
- [ ] Validar estados finales

### FASE 5: TESTING Y QA (2 días)
- [ ] Tests unitarios completos
- [ ] Tests de integración
- [ ] Pruebas con datos reales
- [ ] Validación de flujos completos

### FASE 6: DOCUMENTACIÓN Y DEPLOY (1 día)
- [ ] Documentar API changes
- [ ] Actualizar manual de usuario
- [ ] Preparar scripts de migración
- [ ] Deploy a producción

---

## 🎯 MÉTRICAS DE ÉXITO

### KPIs Principales
1. **Conversión automática**: 100% vehículos 2024-2026
2. **Tiempo de proceso**: <3 segundos por NIP
3. **Disponibilidad en reportes**: Inmediata
4. **Tasa de error**: <0.1%
5. **Eliminación exitosa**: 100% al usar

### Métricas Técnicas
- Sin intervención manual requerida
- Cero duplicados de NIPs
- Transacciones atómicas 100%
- Logs completos de auditoría

---

## 🚨 CONSIDERACIONES Y RIESGOS

### Riesgos Identificados
1. **Duplicación de series**: Mitigar con índices únicos
2. **Pérdida de datos**: Usar transacciones
3. **Confusión usuario**: Mensajería clara sobre NIPs
4. **Reportes mezclados**: Separación visual clara

### Mitigaciones
- Validaciones exhaustivas pre-conversión
- Rollback automático en errores
- Mensajes explicativos detallados
- UI/UX diferenciada para NIPs

---

## 📊 EJEMPLO DE FLUJO COMPLETO

### 1. Usuario registra Honda Civic 2025
```
/basedatos → Registrar Auto
Serie: ABC1234567890DEF
Marca: Honda
Submarca: Civic
Año: 2025 ← DETECTADO COMO NIP
Color: Azul
Placas: XYZ-123
[Sube 2 fotos]
```

### 2. Sistema detecta y convierte
```
✅ VEHÍCULO NIP REGISTRADO

🚗 Honda Civic 2025
NIP: ABC1234567890DEF

⚡ CONVERSIÓN AUTOMÁTICA APLICADA
```

### 3. Aparece en reporte
```
📊 PÓLIZAS PRIORITARIAS Y NIPs

TOP 10 PÓLIZAS REGULARES:
1. POL-2024-001 - Nissan 2020
...

⚡ NIPs DISPONIBLES:
11. NIP: ABC1234567890DEF
    Honda Civic 2025
    Color: Azul | Placas: XYZ-123
```

### 4. Se usa y elimina
```
[Usuario ocupa póliza NIP]

✅ Servicio registrado
⚡ NOTA: NIP CONSUMIDO
Este NIP ha sido eliminado automáticamente.
```

---

## 🎉 BENEFICIOS ESPERADOS

1. **Eficiencia Operativa**
   - Elimina proceso manual para vehículos nuevos
   - Reduce tiempo de disponibilidad a segundos

2. **Mejor Gestión de Inventario**
   - NIPs siempre visibles en reportes
   - Rotación automática garantizada

3. **Experiencia de Usuario**
   - Proceso transparente y automático
   - Sin confusión sobre estados

4. **Integridad de Datos**
   - Eliminación automática previene reutilización
   - Trazabilidad completa

---

**Fecha de elaboración**: Enero 2025  
**Versión**: 1.0  
**Estado**: Pendiente de aprobación