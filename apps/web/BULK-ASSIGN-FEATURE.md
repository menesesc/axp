# Mejoras Implementadas

## 🎨 Interfaz de Usuario para Asignación Masiva

### Cómo Usar

1. **Seleccionar Documentos**:
   - ✅ Checkboxes en cada fila de la tabla de documentos
   - ✅ Checkbox en el encabezado para seleccionar/deseleccionar todos
   - ✅ Los documentos seleccionados permanecen marcados visualmente

2. **Barra de Acciones Flotante**:
   - Aparece automáticamente cuando se selecciona al menos un documento
   - Posición: Parte inferior central de la pantalla (fixed)
   - Muestra el contador: "N documento(s) seleccionado(s)"

3. **Asignar Proveedor**:
   - Selecciona un proveedor del dropdown
   - Click en "Asignar"
   - Los documentos se actualizan inmediatamente
   - La selección se limpia automáticamente

4. **Desasignar Proveedor**:
   - Selecciona "Sin proveedor" del dropdown
   - Click en "Asignar"
   - Los documentos quedan sin proveedor y estado PENDIENTE

5. **Cancelar**:
   - Click en el botón "×" para cancelar la selección

### Características UI

- **Responsive**: La barra flotante tiene un ancho mínimo de 500px
- **Feedback visual**: 
  - Estados de carga ("Asignando...")
  - Botones deshabilitados durante la operación
  - Hover states en todos los elementos interactivos
- **Actualización automática**: React Query invalida el cache y recarga los documentos
- **UX optimizada**: 
  - Solo proveedores activos en el dropdown
  - Opción para deseleccionar todos
  - Validación antes de enviar

---

## 1. Eliminación de Proveedores con Desasignación Automática

Cuando eliminas un proveedor que tiene facturas asociadas, ahora:
- ✅ Las facturas se desasocian automáticamente (`proveedorId = null`)
- ✅ Las facturas vuelven a estado `PENDIENTE` (porque les falta el proveedor)
- ✅ El campo `missingFields` se actualiza incluyendo 'proveedorId'
- ✅ El proveedor se elimina completamente (no soft delete)

### Endpoint modificado:
- `DELETE /api/proveedores/[id]` - Desasocia documentos antes de eliminar

### Lógica de Estado (Regla de Oro):

Un documento está **CONFIRMADO** solo cuando tiene **TODOS** estos campos:

**Campos Críticos:**
- ✅ `clienteId`
- ✅ `proveedorId`
- ✅ `fechaEmision`
- ✅ `total`

**Campos Opcionales Importantes:**
- ✅ `letra`
- ✅ `numeroCompleto`
- ✅ `subtotal`
- ✅ `iva`

**Si falta CUALQUIERA → estado `PENDIENTE`**

```
Ejemplo: Solo con cliente y proveedor NO es suficiente
┌───────────┬─────────────┬───────┬───────┬───────┬─────────┬─────────────┐
│ clienteId │ proveedorId │ fecha │ total │ letra │ número  │   Estado    │
├───────────┼─────────────┼───────┼───────┼───────┼─────────┼─────────────┤
│     ✅    │      ✅     │   ✅  │   ✅  │   ✅  │    ✅   │ CONFIRMADO  │
│     ✅    │      ✅     │   ✅  │   ✅  │   ❌  │    ✅   │ PENDIENTE   │
│     ✅    │      ✅     │   ❌  │   ✅  │   ✅  │    ✅   │ PENDIENTE   │
│     ✅    │      ❌     │   ✅  │   ✅  │   ✅  │    ✅   │ PENDIENTE   │
└───────────┴─────────────┴───────┴───────┴───────┴─────────┴─────────────┘
```

## 2. Asignación Masiva de Proveedores

### Nuevo endpoint creado:
- `POST /api/documentos/bulk-assign`

### Request body:
```json
{
  "documentoIds": ["uuid1", "uuid2", "uuid3"],
  "proveedorId": "uuid-proveedor" // o null para desasignar
}
```

### Response:
```json
{
  "message": "3 documentos actualizados correctamente",
  "updatedCount": 3,
  "documentoIds": ["uuid1", "uuid2", "uuid3"]
}
```

### Funcionalidad:
- Asigna un proveedor a múltiples documentos simultáneamente
- **Evalúa el estado completo de cada documento**: 
  - ✅ `CONFIRMADO` si tiene TODOS los campos (cliente, proveedor, fecha, total, letra, número, subtotal, iva)
  - ⏳ `PENDIENTE` si falta CUALQUIER campo
- Actualiza el campo `missingFields` con los campos faltantes
- Valida que el proveedor existe y está activo
- También permite desasignar masivamente (proveedorId = null)

### Lógica Inteligente de Estado:
Antes de actualizar, el endpoint obtiene TODOS los campos del documento:
```typescript
const docParaEvaluar = {
  clienteId: doc.clienteId,
  proveedorId: proveedorId || null,
  fechaEmision: doc.fechaEmision,
  total: doc.total,
  letra: doc.letra,
  numeroCompleto: doc.numeroCompleto,
  subtotal: doc.subtotal,
  iva: doc.iva,
};

// Evaluar con función centralizada
const estadoRevision = determineEstadoRevision(docParaEvaluar);
const missingFields = calculateMissingFields(docParaEvaluar);
```

**Ejemplos Reales**:
- Doc con TODO completo + asignar proveedor → `CONFIRMADO` ✅
- Doc sin letra + asignar proveedor → `PENDIENTE` ⏳ (falta letra)
- Doc sin subtotal + asignar proveedor → `PENDIENTE` ⏳ (falta subtotal)
- Doc sin clienteId + asignar proveedor → `PENDIENTE` ⏳ (falta cliente)
- Doc completo + quitar proveedor → `PENDIENTE` ⏳ (falta proveedor)

## 3. Próximos pasos para la UI

Para agregar la funcionalidad de selección múltiple al dashboard, necesitarás:

1. **Agregar checkbox en cada fila** de la tabla de documentos
2. **Agregar barra de acciones** que aparece cuando hay documentos seleccionados
3. **Selector de proveedor** para asignación masiva
4. **Botón "Asignar proveedor"** que llama al endpoint bulk-assign

### Ejemplo de uso del endpoint:

```typescript
const bulkAssignMutation = useMutation({
  mutationFn: async ({ documentoIds, proveedorId }: { 
    documentoIds: string[]
    proveedorId: string | null 
  }) => {
    const res = await fetch('/api/documentos/bulk-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentoIds, proveedorId }),
    })
    if (!res.ok) throw new Error('Failed to bulk assign')
    return res.json()
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['documentos'] })
    setSelectedDocs(new Set())
    alert('Proveedores asignados correctamente')
  },
})
```

## 4. Casos de uso

### Caso 1: Eliminar proveedor con facturas
**Antes**: Error o soft delete, facturas quedan huérfanas  
**Ahora**: Facturas se marcan como PENDIENTE y puedes reasignarlas

### Caso 2: OCR detectó mal el proveedor
**Antes**: Editar una por una  
**Ahora**: 
1. Filtra facturas pendientes
2. Selecciona las del mismo proveedor
3. Asigna el proveedor correcto en un solo click

### Caso 3: Facturas sin proveedor
**Antes**: Manualmente una por una  
**Ahora**: Selección múltiple + asignación masiva

## 5. Implementación completa de UI (opcional)

Si quieres que implemente la UI completa con checkboxes y selector de proveedor, puedo:
- Agregar columna de selección con checkboxes
- Crear barra flotante de acciones masivas
- Agregar dropdown con lista de proveedores
- Implementar la lógica de selección/deselección
- Añadir confirmaciones y mensajes de éxito/error

¿Quieres que implemente la UI completa o prefieres hacerlo tú mismo?
