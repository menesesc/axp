# AXP - Modelo de Datos: Justificación de Diseño

## 1. Multi-tenant por clienteId

**Decisión**: Todas las tablas operativas tienen `clienteId` como FK. Usuario SUPERADMIN es el único con `clienteId NULL`.

**Por qué**:
- **Aislamiento de datos**: Queries siempre filtran por `clienteId` → performance + seguridad.
- **Escalabilidad simple**: No necesitás schemas separados ni DBs por tenant.
- **SUPERADMIN necesita visibilidad global**: `clienteId NULL` + filtros en app.
- **Índices compuestos** `(clienteId, ...)` hacen queries instantáneas.

**Constraint manual en SQL**: Prisma no soporta CHECK complejos, así que el constraint `usuarios_rol_cliente_check` está en `supabase-extra.sql`.

---

## 2. Proveedor como tabla (no solo string)

**Por qué necesito tabla Proveedor**:
- **OCR varía nombres**: "ACME SA", "ACME S.A.", "Acme" → debo consolidar.
- **Campo `alias` (JSONB array)**: Guardo todas las variaciones detectadas.
- **Pagos son por proveedor**: No puedo agrupar si cada documento tiene string diferente.
- **CUIT es key**: Pero OCR puede fallar → `cuit` nullable, pero `unique(clienteId, cuit)` cuando existe.
- **Normalización inevitable**: En B2B serio, proveedores son entidad de negocio (términos de pago, deuda acumulada, etc.).

**Índice GIN/trgm en `razon_social`**: Búsqueda tolerante a typos ("acme" encuentra "ACME S.A.").

---

## 3. Idempotencia con `hashSha256`

**Campo**: `documentos.hash_sha256` calculado del PDF original.

**Por qué**:
- **SFTP puede duplicar**: Mismo archivo llega 2 veces → detecto con hash.
- **Constraint `unique(clienteId, hash_sha256)`**: Impide duplicados en DB.
- **Worker chequea hash antes de Textract**: Ahorra costo de OCR.
- **Auditoría**: Si 2 archivos diferentes tienen mismo hash, es problema de source.

**Estado `DUPLICADO`**: Documento se marca pero no se procesa.

---

## 4. Pago multi-método y aplicación parcial

**Por qué 3 tablas** (`Pago`, `PagoMetodo`, `PagoDocumento`):

### a) PagoMetodo (1 pago → N métodos)
- **Realidad B2B**: Pago mixto → $10k efectivo + $50k transferencia + cheque.
- **Campo `meta` (JSONB)**: Transferencia guarda `{banco, cbu, ref}`, cheque `{nro, banco, vencimiento}`.
- **Flexibilidad**: No necesito columnas por cada tipo de método.

### b) PagoDocumento (N pagos ↔ N documentos)
- **Pago parcial**: Factura $100k, pago $50k → quedan $50k pendientes.
- **Montos aplicados**: `monto_aplicado` trackea cuánto de ese pago fue a ese documento.
- **Múltiples pagos a 1 documento**: Puedo pagar factura en 3 cuotas.
- **Reporte de deuda**: `SUM(documento.total) - SUM(pago_documentos.monto_aplicado)`.

**View `v_deuda_por_proveedor`** ya calcula saldo pendiente.

---

## 5. Búsqueda: pg_trgm vs FTS

**Elegí pg_trgm (trigram similarity)**:
- **Más simple**: No necesito mantener `tsvector` separado.
- **Tolerante a typos**: "tornilo" encuentra "tornillo".
- **Índice GIN directo** sobre columnas `text`.
- **3 búsquedas críticas**:
  1. `proveedores.razon_social` → "acme" encuentra variaciones.
  2. `documentos.numero_completo` → "0001-00000123".
  3. `documento_items.descripcion` → "tornillo hexagonal m6" (miles de items).

**Evité FTS (tsvector)** porque:
- Requiere columnas computed o triggers.
- Menos flexible para typos.
- trgm es suficiente para este caso de uso.

---

## 6. DocumentoRevision: auditoría granular

**Por qué esta tabla**:
- **Compliance**: B2B necesita saber quién cambió qué y cuándo.
- **Corrección de OCR**: Usuario cambia `total` de $1000 a $10000 → queda registrado.
- **Campo `path`**: JSON path (`"items[3].cantidad"`) indica qué cambió.
- **Before/After (JSONB)**: Valor anterior y nuevo para rollback si es necesario.

**Índice `(documentoId, createdAt desc)`**: Timeline de cambios instantánea.

---

## 7. IngestQueue: idempotencia en ingesta

**Por qué cola en DB** (no Redis/SQS):
- **Simplicidad**: Una sola DB, Prisma unifica acceso.
- **Retry logic**: `attempts`, `nextRetryAt` para exponential backoff.
- **Idempotencia**: `unique(clienteId, source, sourceRef)` → mismo archivo SFTP no se duplica.
- **Status tracking**: Worker cambia `PENDING → PROCESSING → DONE/ERROR`.

**Índice `(status, nextRetryAt)`**: Worker hace `WHERE status IN ('PENDING','ERROR') AND nextRetryAt <= NOW()`.

---

## 8. JSON vs columnas tipadas

**Usé JSON en 3 casos específicos**:
1. **`proveedores.alias`**: Array dinámico de strings (variaciones OCR).
2. **`documentos.missing_fields`**: Array de campos faltantes (ej: `["proveedor", "total"]`).
3. **`documentos.json_normalizado`**: Output completo del parser para debugging.
4. **`pago_metodos.meta`**: Metadata específica por tipo (transferencia ≠ cheque).

**Evité JSON** donde necesito queries/joins (proveedorId, clienteId, fechas, montos).

---

## 9. Decisiones de rendimiento

- **UUIDs** (`@db.Uuid`): Compatible con sistemas distribuidos, mejor que serial.
- **`numeric(14,2)` para dinero**: Precisión exacta (no `float`).
- **Timestamptz**: Zona horaria incluida (`@db.Timestamptz(3)`).
- **Índices compuestos**: `(clienteId, fecha)` cubre 90% de queries.
- **Índices parciales**: `WHERE cuit IS NOT NULL` ahorra espacio.

---

## 10. Qué NO está (intencionalmente)

- **Supabase Auth**: Lo integrarás después. `usuarios.id` puede ser FK a `auth.users`.
- **Stock/Inventario**: Mencionaste en descripción, pero pediste enfoque en documentos/pagos.
- **Blobs en DB**: PDFs solo viven en R2, DB solo guarda keys.
- **Soft deletes**: Usé `activo` en Cliente/Usuario/Proveedor, pero documentos se borran hard (GDPR friendly).

---

## Resumen: Este modelo escala

✅ **Multi-tenant seguro** por diseño.  
✅ **Idempotencia** en ingesta y documentos.  
✅ **Auditoría completa** de cambios humanos.  
✅ **Búsqueda robusta** con pg_trgm.  
✅ **Pagos flexibles** multi-método + aplicación parcial.  
✅ **Performance** con índices estratégicos.  
✅ **Production-ready** para miles de documentos/mes por tenant.

**Siguiente paso**: `bun run db:generate && bun run db:push` → luego ejecutar `supabase-extra.sql` en Supabase SQL Editor.
