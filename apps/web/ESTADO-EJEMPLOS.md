# Ejemplos Visuales: Estados de Documentos

## 🎨 Guía Visual Rápida

### ✅ CONFIRMADO (Todo Perfecto)
```
┌─────────────────────────────────────────────────┐
│  Factura B 0001-00012345                        │
│  ✅ Cliente: La Esquina                         │
│  ✅ Proveedor: Carnes del Sudoeste              │
│  ✅ Fecha: 10/01/2025                           │
│  ✅ Total: $15,000.00                           │
│  ✅ Letra: B                                    │
│  ✅ Número: 0001-00012345                       │
│  ✅ Subtotal: $12,396.69                        │
│  ✅ IVA: $2,603.31                              │
│                                                 │
│  Estado: CONFIRMADO ✅                          │
│  missingFields: []                              │
└─────────────────────────────────────────────────┘
```

### ⏳ PENDIENTE (Faltan Campos Críticos)
```
┌─────────────────────────────────────────────────┐
│  Documento sin asignar                          │
│  ❌ Cliente: NO ASIGNADO                        │
│  ✅ Proveedor: Carnes del Sudoeste              │
│  ✅ Fecha: 10/01/2025                           │
│  ✅ Total: $15,000.00                           │
│  ✅ Letra: B                                    │
│  ✅ Número: 0001-00012345                       │
│  ✅ Subtotal: $12,396.69                        │
│  ✅ IVA: $2,603.31                              │
│                                                 │
│  Estado: PENDIENTE ⏳                           │
│  missingFields: ['clienteId']                   │
│  ⚠️ Falta asignar cliente                       │
└─────────────────────────────────────────────────┘
```

### ⏳ PENDIENTE (Faltan Campos del OCR)
```
┌─────────────────────────────────────────────────┐
│  Factura detectada por OCR                      │
│  ✅ Cliente: La Esquina                         │
│  ✅ Proveedor: Carnes del Sudoeste              │
│  ✅ Fecha: 10/01/2025                           │
│  ✅ Total: $15,000.00                           │
│  ❌ Letra: NO DETECTADO                         │
│  ❌ Número: NO DETECTADO                        │
│  ❌ Subtotal: NO DETECTADO                      │
│  ❌ IVA: NO DETECTADO                           │
│                                                 │
│  Estado: PENDIENTE ⏳                           │
│  missingFields: ['letra', 'numeroCompleto',     │
│                  'subtotal', 'iva']             │
│  ⚠️ Completar campos manualmente                │
└─────────────────────────────────────────────────┘
```

### ⏳ PENDIENTE (Datos Parciales)
```
┌─────────────────────────────────────────────────┐
│  Factura B 0001-00012345                        │
│  ✅ Cliente: La Esquina                         │
│  ✅ Proveedor: Carnes del Sudoeste              │
│  ✅ Fecha: 10/01/2025                           │
│  ✅ Total: $15,000.00                           │
│  ✅ Letra: B                                    │
│  ✅ Número: 0001-00012345                       │
│  ❌ Subtotal: NO DISPONIBLE                     │
│  ❌ IVA: NO DISPONIBLE                          │
│                                                 │
│  Estado: PENDIENTE ⏳                           │
│  missingFields: ['subtotal', 'iva']             │
│  ⚠️ Faltan montos detallados                    │
└─────────────────────────────────────────────────┘
```

## 🔄 Flujo de Vida de un Documento

### Etapa 1: Llegada del Documento
```
📄 PDF subido → OCR procesa

Resultado OCR (parcial):
- fechaEmision: ✅
- total: ✅
- proveedor detectado: ✅ (creado automático)
- letra: ❌
- número: ❌
- subtotal: ❌
- iva: ❌
- cliente: ❌

→ Estado: PENDIENTE ⏳
→ missingFields: ['clienteId', 'letra', 'numeroCompleto', 'subtotal', 'iva']
```

### Etapa 2: Usuario Asigna Cliente
```
Usuario en dashboard:
- Selecciona documento
- Elige cliente "La Esquina"
- Guarda

Documento actualizado:
- clienteId: ✅ (nuevo)
- Resto igual

→ Estado: PENDIENTE ⏳ (aún faltan 4 campos)
→ missingFields: ['letra', 'numeroCompleto', 'subtotal', 'iva']
```

### Etapa 3: Usuario Completa Letra y Número
```
Usuario edita documento:
- Letra: "B"
- Número completo: "0001-00012345"

Documento actualizado:
- letra: ✅ (nuevo)
- numeroCompleto: ✅ (nuevo)
- Resto igual

→ Estado: PENDIENTE ⏳ (faltan 2 campos)
→ missingFields: ['subtotal', 'iva']
```

### Etapa 4: Usuario Completa Montos
```
Usuario edita documento:
- Subtotal: 12396.69
- IVA: 2603.31

Documento actualizado:
- subtotal: ✅ (nuevo)
- iva: ✅ (nuevo)
- TODO completo ahora

→ Estado: CONFIRMADO ✅✅✅
→ missingFields: []
```

## 📊 Dashboard View

### Lista de Documentos
```
┌──────────────┬────────────┬─────────────┬───────────┬────────────┐
│   Fecha      │  Proveedor │   Cliente   │   Total   │   Estado   │
├──────────────┼────────────┼─────────────┼───────────┼────────────┤
│ 10/01/2025   │ Carnes...  │ La Esquina  │ $15,000   │ ✅ CONFIRM │
│ 10/01/2025   │ Del Supply │ Sin asignar │ $8,500    │ ⏳ PEND.   │
│ 09/01/2025   │ Carnes...  │ La Esquina  │ $12,000   │ ⏳ PEND.   │
│ 09/01/2025   │ Sin asig.  │ La Esquina  │ $9,200    │ ⏳ PEND.   │
│ 08/01/2025   │ Del Supply │ La Esquina  │ $11,500   │ ✅ CONFIRM │
└──────────────┴────────────┴─────────────┴───────────┴────────────┘

Resumen:
- Total documentos: 5
- Confirmados: 2 ✅
- Pendientes: 3 ⏳
```

### Detalle de Documento Pendiente
```
┌─────────────────────────────────────────────────────────────┐
│  DOCUMENTO PENDIENTE ⏳                                      │
├─────────────────────────────────────────────────────────────┤
│  Número: 0001-00012345                                      │
│  Fecha: 10/01/2025                                          │
│  Total: $15,000.00                                          │
│                                                             │
│  ⚠️ Faltan campos para confirmar:                           │
│  • Subtotal                                                 │
│  • IVA                                                      │
│                                                             │
│  [Editar Documento]                                         │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Asignación Masiva - Vista Práctica

### Antes de Asignar
```
Documentos seleccionados: 3

Doc 1: ✅ Cliente, ❌ Proveedor, ✅ Fecha, ✅ Total, ✅ Letra, ✅ Num, ✅ Sub, ✅ IVA
Doc 2: ✅ Cliente, ❌ Proveedor, ✅ Fecha, ✅ Total, ❌ Letra, ❌ Num, ✅ Sub, ✅ IVA
Doc 3: ❌ Cliente, ❌ Proveedor, ✅ Fecha, ✅ Total, ✅ Letra, ✅ Num, ✅ Sub, ✅ IVA

Todos en estado: PENDIENTE ⏳
```

### Acción: Asignar "Carnes del Sudoeste"
```
┌─────────────────────────────────────────────────────────────┐
│  3 documentos seleccionados                                 │
│                                                             │
│  Proveedor: [Carnes del Sudoeste ▼]                        │
│                                                             │
│  [Asignar]                                                  │
└─────────────────────────────────────────────────────────────┘
```

### Después de Asignar
```
Doc 1: ✅ Cliente, ✅ Proveedor, ✅ Fecha, ✅ Total, ✅ Letra, ✅ Num, ✅ Sub, ✅ IVA
       → CONFIRMADO ✅ (tiene TODO)

Doc 2: ✅ Cliente, ✅ Proveedor, ✅ Fecha, ✅ Total, ❌ Letra, ❌ Num, ✅ Sub, ✅ IVA
       → PENDIENTE ⏳ (faltan letra y número)

Doc 3: ❌ Cliente, ✅ Proveedor, ✅ Fecha, ✅ Total, ✅ Letra, ✅ Num, ✅ Sub, ✅ IVA
       → PENDIENTE ⏳ (falta cliente)

Resultado:
- 1 documento confirmado ✅
- 2 documentos aún pendientes ⏳
```

## 🔔 Notificaciones Sugeridas

```
✅ "1 documento completado"
   Factura B 0001-00012345 ahora está confirmada

⏳ "2 documentos requieren atención"
   • Doc sin letra y número
   • Doc sin cliente asignado
   
   [Ver pendientes]
```

## 📈 Métricas en Dashboard

```
┌────────────────────────────────────────────┐
│  Estado de Documentos                      │
├────────────────────────────────────────────┤
│  ✅ Confirmados:     156  (78%)            │
│  ⏳ Pendientes:       44  (22%)            │
│  ───────────────────────────────────       │
│  Total:             200                    │
└────────────────────────────────────────────┘

Campos más faltantes:
1. letra            (23 docs)
2. numeroCompleto   (23 docs)
3. subtotal         (18 docs)
4. iva              (18 docs)
5. proveedorId      (12 docs)
6. clienteId        (8 docs)
```
