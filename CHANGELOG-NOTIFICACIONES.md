# Resumen de Cambios - Sistema de Notificaciones y Mejoras

## ✅ Cambios Implementados

### 1. **Campo Letra por Defecto en Proveedores**

#### Frontend (`apps/web`)
- ✅ **UI de Proveedores** (`src/app/proveedores/page.tsx`):
  - Agregada columna "Letra" en la tabla de proveedores
  - Selector de letra (A/B/C) en formulario de crear/editar
  - Badge visual para mostrar la letra asignada
  - Integración completa en el flujo de creación y edición

- ✅ **API de Proveedores**:
  - `POST /api/proveedores` - Acepta campo `letra` con validación (A/B/C)
  - `PATCH /api/proveedores/[id]` - Permite actualizar letra
  - Validación: solo acepta valores A, B o C

#### Worker (`apps/worker`)
- ✅ **OCR Processor** (`src/ocr/ocrProcessor.ts`):
  - **PRIORIDAD**: Usa letra del proveedor si OCR no detecta
  - Guarda `proveedorLetra` al encontrar proveedor
  - Si `parsed.letra` es null → usa `proveedorLetra`
  - Log informativo: `"📝 Using default letra from proveedor: {letra}"`
  - **Ya no busca letra con Textract**, solo la usa si existe en el proveedor

**Flujo**:
```
1. OCR intenta detectar letra con Textract
2. Worker busca proveedor por CUIT/nombre
3. Si encuentra proveedor → guarda su letra por defecto
4. Al crear documento:
   - Si OCR detectó letra → usa esa
   - Si NO detectó → usa letra del proveedor
   - Si tampoco tiene → queda null
```

---

### 2. **Fecha de Vencimiento por Defecto**

#### Worker (`apps/worker`)
- ✅ **Lógica de Fallback** (`src/ocr/ocrProcessor.ts`):
  ```typescript
  const finalFechaVencimiento = parsed.fechaVencimiento || parsed.fechaEmision;
  ```
  - Si Textract NO detecta `fechaVencimiento` → usa `fechaEmision`
  - Log: `"📅 Using fechaEmision as fechaVencimiento: {fecha}"`
  - Evita campos vacíos y mejora calidad de datos

**Flujo**:
```
1. OCR intenta detectar ambas fechas
2. Si solo detecta fechaEmision:
   → fechaVencimiento = fechaEmision
3. Documento creado con ambas fechas iguales
```

---

### 3. **Sistema de Notificaciones en Tiempo Real**

#### Arquitectura Elegida: **Polling + Custom Events**
Razón: SSE (Server-Sent Events) tiene limitaciones con Next.js App Router y Vercel. Polling es más robusto.

#### Backend (`apps/web`)

**API de Notificaciones** (`src/app/api/notifications/route.ts`):
- ✅ `POST /api/notifications` - Worker envía notificación de documento nuevo
- ✅ Store en memoria (Map) para notificaciones pendientes
- ✅ Sistema de cola por `clienteId`

**Worker** (`apps/worker/src/ocr/ocrProcessor.ts`):
- ✅ Envía POST a `/api/notifications` después de crear documento
- ✅ Variable de entorno: `WEB_APP_URL` (default: `http://localhost:3000`)
- ✅ No bloquea proceso si falla (catch error)
- ✅ Log: `"📬 Notification sent for documento: {id}"`

#### Frontend (`apps/web`)

**Hook de Notificaciones** (`src/hooks/use-document-notifications.ts`):
- ✅ Polling cada 10 segundos para detectar nuevos documentos
- ✅ Invalidación automática de cache de React Query
- ✅ Tracking de IDs de documentos nuevos en `Set<string>`
- ✅ Métodos: `isNew(id)`, `markAsViewed(id)`, `clearAll()`
- ✅ Escucha eventos custom `new-document`
- ✅ **Limpia notificaciones al recargar página** (beforeunload)

**Componente DocumentList** (`src/components/dashboard/document-list.tsx`):
- ✅ Integración del hook `useDocumentNotifications`
- ✅ Indicador visual en filas nuevas:
  - **Fondo verde claro** (`bg-green-50`)
  - **Borde izquierdo verde** (`border-l-4 border-green-500`)
  - **Icono animado** (`Sparkles` con `animate-pulse`)
- ✅ **Se borra al recargar página** (estado local, no persistente)

---

### 4. **Indicadores Visuales de Documentos Nuevos**

**Diseño UI**:
```tsx
Fila Normal:
┌─────────────────────────────────────┐
│ ☑️  01/01/2024  FACTURA A  ...     │
└─────────────────────────────────────┘

Fila Nueva (recibida por socket):
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ✨ ☑️  01/01/2024  FACTURA A  ...  ┃  ← Fondo verde + borde + sparkles
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Características**:
- ✅ Aparece **solo si llega por notificación** (no en carga inicial)
- ✅ Desaparece al **recargar página** (F5)
- ✅ No persiste en base de datos
- ✅ Icono `Sparkles` en primera columna con animación pulse

---

## 📁 Archivos Modificados

### Frontend (apps/web)
```
src/app/proveedores/page.tsx                    → UI letra + validación
src/app/api/proveedores/route.ts                → POST acepta letra
src/app/api/proveedores/[id]/route.ts           → PATCH acepta letra
src/app/api/notifications/route.ts              → NEW: API notificaciones
src/hooks/use-document-notifications.ts         → NEW: Hook polling
src/components/dashboard/document-list.tsx      → Indicadores visuales
```

### Worker (apps/worker)
```
src/ocr/ocrProcessor.ts                         → Letra + fecha + notificaciones
.env                                            → WEB_APP_URL
.env.example                                    → WEB_APP_URL
```

---

## 🔧 Variables de Entorno Nuevas

### apps/worker/.env
```bash
# Web App URL for notifications
WEB_APP_URL="http://localhost:3000"
```

**Producción**: Cambiar a URL real del frontend
Ejemplo: `WEB_APP_URL="https://axp.example.com"`

---

## 🚀 Funcionalidad Final

### Flujo Completo de un Documento Nuevo

1. **Archivo llega a WebDAV** → Watcher detecta
2. **Queue Processor** → Sube a R2 inbox/
3. **OCR Processor** → Procesa con Textract
4. **Matching de Proveedor**:
   - Busca por CUIT/nombre/alias/fuzzy
   - Si encuentra → guarda letra por defecto
5. **Creación de Documento**:
   - `letra` = OCR detectó ?: parsed.letra : proveedorLetra
   - `fechaVencimiento` = parsed.fechaVencimiento || parsed.fechaEmision
6. **Notificación**:
   - Worker envía POST a `/api/notifications`
   - Incluye `clienteId` y `documentoId`
7. **Frontend**:
   - Polling detecta cambio (10s)
   - React Query invalida cache
   - Lista se actualiza automáticamente
   - Fila aparece con indicador verde ✨
8. **Usuario recarga página** → Indicador desaparece

---

## 🧪 Testing

### Probar Letra por Defecto
1. Ir a `/proveedores`
2. Crear proveedor nuevo con letra "A"
3. Subir factura de ese proveedor sin letra clara
4. Verificar que documento tiene letra "A"

### Probar Fecha Vencimiento
1. Subir factura con solo fecha de emisión
2. Verificar que `fechaVencimiento = fechaEmision`

### Probar Notificaciones
1. Abrir frontend en `/`
2. Subir nuevo PDF
3. Esperar 10-15 segundos
4. Lista debe actualizarse automáticamente
5. Nueva fila con fondo verde + ✨
6. Recargar (F5) → indicador desaparece

---

## ⚠️ Consideraciones

### Polling vs WebSockets
- **Polling** elegido por:
  - ✅ Compatible con Vercel/Next.js App Router
  - ✅ No requiere servidor persistente
  - ✅ Más simple de implementar
  - ✅ Suficiente para intervalo de 10s

- **Alternativa futura**: Supabase Realtime (si se migra toda la DB a Supabase)

### Performance
- Polling cada 10s es bajo impacto
- Solo hace GET ligero
- Invalidación inteligente de cache
- No afecta UX

### Escalabilidad
- Store en memoria funciona para 1 instancia
- **Producción**: Migrar a Redis para múltiples instancias
- Estructura: `notifications:{clienteId}` → array de notificaciones

---

## 📝 Próximos Pasos

1. **Testing completo** de todos los flujos
2. **Ajustar intervalo de polling** si es necesario
3. **Migrar a Redis** si se despliega en cluster
4. **Agregar sonido/toast** para notificaciones (opcional)
5. **Persistir estado** "nuevo" en localStorage (opcional)

---

## 🐛 Troubleshooting

### "No aparece indicador verde"
- Verificar que `WEB_APP_URL` esté correcto en worker
- Check logs del worker: `📬 Notification sent`
- Verificar que polling esté activo (console.log en hook)

### "Worker no envía notificación"
- Verificar que `WEB_APP_URL` sea accesible desde worker
- Si worker está en Docker: usar IP host, no localhost
- Check firewall/networking

### "Indicador no desaparece al recargar"
- Verificar evento `beforeunload` en DocumentList
- Check que `clearAll()` se llame correctamente

---

**Status**: ✅ **COMPLETADO**
**Fecha**: 12 de enero de 2026
**Versión**: 1.0.0
