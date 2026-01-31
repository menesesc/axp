# Resumen: Lógica Completa de Estado de Documentos

## 🎯 Concepto Principal

**ANTES (Incorrecto):**
```
CONFIRMADO = clienteId + proveedorId ❌
```

**AHORA (Correcto):**
```
CONFIRMADO = clienteId + proveedorId + fechaEmision + total + letra + numeroCompleto + subtotal + iva ✅
```

## 📋 Los 8 Campos Obligatorios

### Críticos (4)
1. `clienteId` - ¿A qué cliente pertenece?
2. `proveedorId` - ¿Quién es el proveedor?
3. `fechaEmision` - ¿Cuándo se emitió?
4. `total` - ¿Cuánto es el total?

### Opcionales Importantes (4)
5. `letra` - A, B, C, etc.
6. `numeroCompleto` - 0001-00012345
7. `subtotal` - Importe antes de IVA
8. `iva` - Impuesto

## ✅ Regla Simple

```
Si TODOS los 8 campos tienen valor → CONFIRMADO
Si FALTA CUALQUIERA → PENDIENTE
```

## 🔧 Implementación

**Archivo:** `/apps/web/src/lib/documento-estado.ts`

**Función principal:**
```typescript
determineEstadoRevision(doc) → 'CONFIRMADO' | 'PENDIENTE'
```

**Campos actualizados:**
- `estadoRevision` - El estado calculado
- `missingFields` - Array con nombres de campos faltantes

## 📍 Dónde se Aplica

1. ✅ **POST `/api/documentos/bulk-assign`** - Asignación masiva de proveedores
2. ✅ **DELETE `/api/proveedores/[id]`** - Eliminación de proveedor
3. 🔜 **PATCH `/api/documentos/[id]`** - Actualización de documento individual (TODO)
4. 🔜 **POST `/api/documentos`** - Creación de documento (TODO)

## 💡 Casos de Uso Reales

### Usuario completa un documento del OCR:

```
1. OCR detecta:
   - proveedorId: ✅
   - fechaEmision: ✅  
   - total: ✅
   - letra: ❌
   - numeroCompleto: ❌
   - subtotal: ❌
   - iva: ❌
   - clienteId: ❌
   → Estado: PENDIENTE
   → missingFields: ['clienteId', 'letra', 'numeroCompleto', 'subtotal', 'iva']

2. Usuario asigna cliente:
   - clienteId: ✅ (nuevo)
   → Estado: PENDIENTE (aún faltan 4 campos)
   → missingFields: ['letra', 'numeroCompleto', 'subtotal', 'iva']

3. Usuario completa letra y número:
   - letra: ✅ (nuevo)
   - numeroCompleto: ✅ (nuevo)
   → Estado: PENDIENTE (faltan 2 campos)
   → missingFields: ['subtotal', 'iva']

4. Usuario completa subtotal e iva:
   - subtotal: ✅ (nuevo)
   - iva: ✅ (nuevo)
   → Estado: CONFIRMADO ✅✅✅
   → missingFields: []
```

### Asignación masiva de proveedor:

```
Selecciono 3 documentos, todos sin proveedor asignado:

Doc A: Tiene cliente, fecha, total, letra, número, subtotal, iva
Doc B: Tiene cliente, fecha, total pero NO tiene letra ni número
Doc C: NO tiene cliente pero tiene el resto completo

Asigno proveedor a los 3:

Resultado:
- Doc A → CONFIRMADO ✅ (tiene TODO)
- Doc B → PENDIENTE ⏳ (faltan letra y número)
- Doc C → PENDIENTE ⏳ (falta cliente)
```

## 🔍 Ventajas del Nuevo Sistema

1. **Precisión**: No marca como confirmado documentos incompletos
2. **Trazabilidad**: Campo `missingFields` muestra exactamente qué falta
3. **Consistencia**: Misma lógica en toda la aplicación
4. **UX Mejorado**: Usuario sabe exactamente qué debe completar
5. **Datos de Calidad**: Base de datos con información completa y confiable

## ⚠️ Impacto en Documentos Existentes

Si tenías documentos marcados como CONFIRMADO con la lógica vieja:
- Muchos pasarán a PENDIENTE con la nueva lógica
- Esto es **correcto** - estaban incompletos
- Se puede ver qué les falta en el campo `missingFields`
- El usuario debe completarlos para que vuelvan a CONFIRMADO

## 📚 Documentación Completa

- **Detalles técnicos:** `ESTADO-INTELIGENTE.md`
- **Feature de bulk assign:** `BULK-ASSIGN-FEATURE.md`
- **Este resumen:** `ESTADO-RESUMEN.md`
