# Lógica Inteligente de Estado de Documentos

## 🎯 Regla de Oro

Un documento está **CONFIRMADO** solo cuando tiene **TODOS** estos campos:

### Campos Críticos (Obligatorios)
- ✅ `clienteId` - Cliente asignado
- ✅ `proveedorId` - Proveedor asignado
- ✅ `fechaEmision` - Fecha de emisión
- ✅ `total` - Importe total

### Campos Opcionales Importantes
- ✅ `letra` - Letra de factura (A, B, C)
- ✅ `numeroCompleto` - Número completo (ej: 0001-00012345)
- ✅ `subtotal` - Subtotal (antes de IVA)
- ✅ `iva` - IVA

**Si falta CUALQUIERA de estos campos → estado `PENDIENTE`**

## 📊 Tabla de Estados Completa

```
┌───────────┬─────────────┬───────────┬───────┬─────────────┬──────────┬─────┬────────────────┐
│ clienteId │ proveedorId │   fecha   │ total │ letra+num.  │ sub+iva  │  →  │     Estado     │
├───────────┼─────────────┼───────────┼───────┼─────────────┼──────────┼─────┼────────────────┤
│     ✅    │      ✅     │     ✅    │   ✅  │      ✅     │    ✅    │  →  │  CONFIRMADO ✅ │
│     ✅    │      ✅     │     ✅    │   ✅  │      ❌     │    ✅    │  →  │  PENDIENTE ⏳  │
│     ✅    │      ✅     │     ✅    │   ✅  │      ✅     │    ❌    │  →  │  PENDIENTE ⏳  │
│     ✅    │      ❌     │     ✅    │   ✅  │      ✅     │    ✅    │  →  │  PENDIENTE ⏳  │
│     ❌    │      ✅     │     ✅    │   ✅  │      ✅     │    ✅    │  →  │  PENDIENTE ⏳  │
│     ✅    │      ✅     │     ❌    │   ✅  │      ✅     │    ✅    │  →  │  PENDIENTE ⏳  │
│     ✅    │      ✅     │     ✅    │   ❌  │      ✅     │    ✅    │  →  │  PENDIENTE ⏳  │
│     ❌    │      ❌     │     ❌    │   ❌  │      ❌     │    ❌    │  →  │  PENDIENTE ⏳  │
└───────────┴─────────────┴───────────┴───────┴─────────────┴──────────┴─────┴────────────────┘
```

**Resumen**: Solo la primera fila (todos ✅) resulta en CONFIRMADO

## 🔧 Implementación

### Función Centralizada: `determineEstadoRevision()`

Ubicación: `/apps/web/src/lib/documento-estado.ts`

```typescript
export function determineEstadoRevision(doc: DocumentoParaEvaluar): EstadoRevision {
  // 1. Verificar campos críticos obligatorios
  const hasCriticalFields = !!(
    doc.clienteId && 
    doc.proveedorId && 
    doc.fechaEmision && 
    doc.total
  );
  
  if (!hasCriticalFields) {
    return 'PENDIENTE'; // Falta información crítica
  }
  
  // 2. Verificar campos opcionales importantes
  const hasOptionalFields = !!(
    doc.letra && 
    doc.numeroCompleto && 
    doc.subtotal && 
    doc.iva
  );
  
  if (!hasOptionalFields) {
    return 'PENDIENTE'; // Faltan campos opcionales importantes
  }
  
  return 'CONFIRMADO'; // ✅ Tiene TODO lo necesario
}
```

### Función: `calculateMissingFields()`

Calcula qué campos específicos faltan:

```typescript
export function calculateMissingFields(doc: DocumentoParaEvaluar): string[] {
  const missing: string[] = [];
  
  // Campos críticos
  if (!doc.clienteId) missing.push('clienteId');
  if (!doc.proveedorId) missing.push('proveedorId');
  if (!doc.fechaEmision) missing.push('fechaEmision');
  if (!doc.total) missing.push('total');
  
  // Campos opcionales importantes
  if (!doc.letra) missing.push('letra');
  if (!doc.numeroCompleto) missing.push('numeroCompleto');
  if (!doc.subtotal) missing.push('subtotal');
  if (!doc.iva) missing.push('iva');
  
  return missing;
}
```

Este array se guarda en el campo `missingFields` de la BD para referencia.

### Endpoints Actualizados

#### 1. `POST /api/documentos/bulk-assign`
**Asignación Masiva de Proveedores**

Antes de actualizar, obtiene el `clienteId` de cada documento y evalúa:

```typescript
const { data: documentos } = await supabase
  .from('documentos')
  .select('id, clienteId')
  .in('id', documentoIds);

const updates = documentos?.map(async (doc) => {
  const willHaveProveedor = proveedorId || null;
  const hasCliente = !!doc.clienteId;
  
  // ⭐ Evaluación inteligente
  const estadoRevision = (hasCliente && willHaveProveedor) 
    ? 'CONFIRMADO' 
    : 'PENDIENTE';

  return supabase
    .from('documentos')
    .update({
      proveedorId: willHaveProveedor,
      estadoRevision,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', doc.id);
});
```

**Ejemplos de comportamiento:**

| Escenario | clienteId | Acción | Resultado | Estado Final |
|-----------|-----------|--------|-----------|--------------|
| Factura completa | ✅ | Asignar proveedor | proveedorId asignado | CONFIRMADO ✅ |
| Factura sin cliente | ❌ | Asignar proveedor | proveedorId asignado | PENDIENTE ⏳ |
| Factura completa | ✅ | Quitar proveedor | proveedorId = null | PENDIENTE ⏳ |
| Factura sin datos | ❌ | Quitar proveedor | proveedorId = null | PENDIENTE ⏳ |

#### 2. `DELETE /api/proveedores/[id]`
**Eliminación de Proveedor con Desasignación**

Cuando se elimina un proveedor:

```typescript
// Obtener documentos asociados
const { data: documentos } = await supabase
  .from('documentos')
  .select('id, clienteId')
  .eq('proveedorId', params.id);

// Desasociar cada documento
const updates = documentos?.map(async (doc) => {
  return supabase
    .from('documentos')
    .update({
      proveedorId: null,
      // ⚠️ Siempre PENDIENTE porque falta el proveedor
      estadoRevision: 'PENDIENTE',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', doc.id);
});
```

**Resultado:** Todos los documentos quedan `PENDIENTE` porque les falta el proveedor, **independientemente** de si tienen clienteId o no.

## 🚀 Casos de Uso

### Caso 1: OCR Identifica Solo Algunos Campos
```
Documento escaneado:
- proveedorId: ✅ "Carnes del Sudoeste"
- fechaEmision: ✅ "2025-01-10"
- total: ✅ 15000
- letra: ❌ null
- numeroCompleto: ❌ null
- subtotal: ❌ null
- iva: ❌ null
- clienteId: ❌ null
- Estado: PENDIENTE ⏳
- missingFields: ['clienteId', 'letra', 'numeroCompleto', 'subtotal', 'iva']

Usuario debe completar campos faltantes manualmente
```

### Caso 2: Usuario Completa Documento Paso a Paso
```
Paso 1 - Documento inicial (OCR):
- proveedorId: ✅
- fechaEmision: ✅
- total: ✅
- Resto: ❌
- Estado: PENDIENTE ⏳

Paso 2 - Usuario asigna cliente:
- clienteId: ✅
- proveedorId: ✅
- fechaEmision: ✅
- total: ✅
- letra, número, etc: ❌
- Estado: PENDIENTE ⏳ (faltan campos opcionales)

Paso 3 - Usuario completa letra y número:
- Todos los campos críticos: ✅
- letra: ✅
- numeroCompleto: ✅
- subtotal, iva: ❌
- Estado: PENDIENTE ⏳ (faltan subtotal e iva)

Paso 4 - Usuario completa subtotal e iva:
- TODOS los campos: ✅
- Estado: CONFIRMADO ✅✅✅
```

### Caso 3: Asignación Masiva con Documentos Mixtos
```
Selecciono 5 documentos para asignar proveedor:

Doc 1:
- clienteId: ✅, fecha: ✅, total: ✅, letra: ✅, num: ✅, sub: ✅, iva: ✅
- Asigno proveedor → CONFIRMADO ✅ (tiene TODO)

Doc 2:
- clienteId: ✅, fecha: ✅, total: ✅, letra: ❌, num: ❌, sub: ✅, iva: ✅
- Asigno proveedor → PENDIENTE ⏳ (faltan letra y número)

Doc 3:
- clienteId: ❌, fecha: ✅, total: ✅, letra: ✅, num: ✅, sub: ✅, iva: ✅
- Asigno proveedor → PENDIENTE ⏳ (falta cliente)

Doc 4:
- clienteId: ✅, fecha: ❌, total: ✅, letra: ✅, num: ✅, sub: ✅, iva: ✅
- Asigno proveedor → PENDIENTE ⏳ (falta fecha)

Doc 5:
- clienteId: ✅, fecha: ✅, total: ✅, letra: ✅, num: ✅, sub: ❌, iva: ❌
- Asigno proveedor → PENDIENTE ⏳ (faltan subtotal e iva)

Resultado: Solo 1 documento queda CONFIRMADO
```

### Caso 4: Eliminar Proveedor
```
Proveedor "Carnes del Sudoeste" tiene 10 facturas:
- 3 documentos CONFIRMADOS (todos los campos ✅)
- 7 documentos PENDIENTES (les faltan campos)

Usuario elimina el proveedor:

Resultado:
- Las 10 facturas → PENDIENTE ⏳ (todas pierden proveedorId)
- missingFields de todas incluye ahora 'proveedorId'
- El proveedor se elimina
```

## 🎨 Interfaz de Usuario

La barra de asignación masiva refleja esta lógica:

1. Usuario selecciona múltiples documentos
2. Elige proveedor del dropdown
3. Click en "Asignar"
4. Backend evalúa cada documento individualmente
5. Documentos se actualizan con el estado correcto
6. UI se actualiza en tiempo real

## 🧪 Testing

Para probar la lógica completa:

```bash
# 1. Crear documento con solo campos críticos
POST /api/documentos
{
  "clienteId": "uuid-cliente",
  "proveedorId": "uuid-proveedor",
  "fechaEmision": "2025-01-10",
  "total": 15000,
  "letra": null,
  "numeroCompleto": null,
  "subtotal": null,
  "iva": null
}
# Debe quedar PENDIENTE (faltan campos opcionales)
# missingFields: ['letra', 'numeroCompleto', 'subtotal', 'iva']

# 2. Actualizar para agregar letra y número
PATCH /api/documentos/[id]
{
  "letra": "B",
  "numeroCompleto": "0001-00012345"
}
# Debe seguir PENDIENTE (faltan subtotal e iva)
# missingFields: ['subtotal', 'iva']

# 3. Completar subtotal e iva
PATCH /api/documentos/[id]
{
  "subtotal": 12396.69,
  "iva": 2603.31
}
# Debe cambiar a CONFIRMADO ✅
# missingFields: []

# 4. Asignar proveedor masivamente a documentos incompletos
POST /api/documentos/bulk-assign
{
  "documentoIds": ["doc-1", "doc-2", "doc-3"],
  "proveedorId": "prov-id"
}
# Cada documento se evalúa individualmente
# Solo los que tienen TODOS los campos quedan CONFIRMADO

# 5. Eliminar proveedor
DELETE /api/proveedores/[prov-id]
# Todos los documentos vuelven a PENDIENTE
# missingFields de todos incluye 'proveedorId'
```

## 📝 Notas Importantes

1. **Consistencia Total**: La lógica es idéntica en todos los endpoints (bulk-assign, delete, update)
2. **Campo `missingFields`**: Se actualiza automáticamente con cada cambio, listando exactamente qué falta
3. **Evaluación Individual**: En operaciones masivas, cada documento se evalúa por separado
4. **8 Campos Obligatorios**: 
   - 4 críticos: clienteId, proveedorId, fechaEmision, total
   - 4 opcionales: letra, numeroCompleto, subtotal, iva
5. **Sin Atajos**: No hay "casi completo" - o tiene TODO o está PENDIENTE
6. **Auditable**: Todos los cambios registran `updatedAt` y `missingFields`
7. **Performance**: Operaciones masivas usan `Promise.all()` para paralelizar
8. **UI Helper**: Función `getMissingFieldsSummary()` genera texto legible para mostrar al usuario

## ⚠️ Casos Especiales

### Documentos del OCR
El OCR puede detectar algunos campos pero no todos. Por ejemplo:
- Detecta: proveedor, fecha, total
- No detecta: letra, número completo, subtotal, iva

→ El documento queda `PENDIENTE` hasta que el usuario complete los campos faltantes

### Documentos Históricos
Si existen documentos viejos con la lógica anterior (solo validaban clienteId + proveedorId):
- Se pueden re-evaluar ejecutando un script que llame a `determineEstadoRevision()`
- Muchos pasarán de CONFIRMADO a PENDIENTE al detectarse campos faltantes
- Esto es **correcto** - ahora el sistema es más estricto y preciso

## 🔜 Próximas Mejoras

- [ ] Agregar log de cambios de estado (audit trail)
- [ ] Notificar usuarios cuando documentos pasan a CONFIRMADO
- [ ] Dashboard con métricas de documentos PENDIENTE vs CONFIRMADO
- [ ] Reglas automáticas de asignación basadas en patrones
