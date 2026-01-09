# Gestión de Archivos en R2 - Arquitectura por Fases

## 🎯 Estrategia: Inbox → OCR → Organización por Fecha Real

### Flujo completo

```
Scanner → WebDAV → Worker → R2 inbox/ → OCR Worker → R2 por fecha real
```

---

## 📂 Fase 1: Upload a Inbox (ACTUAL)

### ¿Qué hace?

Todos los archivos se suben a una carpeta **`inbox/`** sin procesar.

### Estructura en R2

```
axp-client-33712152449/
└── inbox/                                    ← Archivos sin procesar (OCR pendiente)
    ├── weiss_20251226_231633.pdf
    ├── weiss_20260105_083000.pdf
    └── weiss_20260108_153000.pdf
```

### ¿Por qué inbox?

✅ **Separación clara**: inbox = no procesado, carpetas = procesado  
✅ **No reorganizar**: Cada archivo se mueve UNA VEZ a su ubicación final  
✅ **Reintentable**: Si OCR falla, el archivo sigue en inbox  
✅ **Auditable**: Podés ver cuántos archivos están esperando OCR  
✅ **Escalable**: Múltiples workers de OCR pueden procesar en paralelo  

### Flujo Fase 1

1. **Scanner Epson** → Sube PDF a WebDAV: `weiss_20251226_231633.pdf`
2. **Watcher** → Detecta archivo, extrae prefix, encola en `IngestQueue`
3. **Processor** → Sube a R2: `inbox/weiss_20251226_231633.pdf`
4. **IngestQueue** → Marca como `DONE`

---

## 📂 Fase 2: OCR y Organización (FUTURO)

### ¿Qué hará?

Un **OCR Worker** procesará los archivos de inbox y los organizará por **fecha real del documento**.

### Estructura final en R2

```
axp-client-33712152449/
├── inbox/                                    ← Archivos sin procesar
│   └── (vacío o con archivos pendientes)
│
├── 2025/                                     ← Archivos procesados con fecha real
│   └── 12/
│       ├── 18/
│       │   └── factura_proveedor_001.pdf    ← Fecha emisión: 18/12/2025
│       └── 20/
│           └── weiss_20251226_231633.pdf    ← Escaneado 26/12, emitido 20/12
│
├── 2026/
│   └── 01/
│       └── 03/
│           └── recibo_002.pdf
│
└── failed/                                   ← Archivos que no se pudieron procesar
    └── corrupted_file.pdf
```

### Flujo Fase 2 (a implementar)

1. **OCR Worker** lee de `inbox/weiss_20251226_231633.pdf`
2. **AWS Textract** procesa el PDF
3. **Parser** extrae:
   - `fechaEmision`: 20/12/2025 (del documento)
   - `fechaVencimiento`: 20/01/2026
   - `proveedor`, `total`, etc.
4. **Crea registro** en tabla `Documento`:
   ```typescript
   {
     clienteId: "...",
     fechaEmision: 2025-12-20,
     fechaVencimiento: 2026-01-20,
     pdfRawKey: "inbox/weiss_20251226_231633.pdf",
     pdfFinalKey: null, // Se actualiza después del move
     estadoRevision: "PENDIENTE",
     ...
   }
   ```
5. **Move en R2**: `inbox/xxx.pdf` → `2025/12/20/xxx.pdf`
6. **Actualiza Documento**:
   ```typescript
   {
     pdfFinalKey: "2025/12/20/weiss_20251226_231633.pdf",
   }
   ```
7. **Borra de inbox** (opcional, o marcar como procesado)

### Ventajas

✅ **Fecha correcta**: Organizados por `fechaEmision` real del documento  
✅ **No duplicar trabajo**: Solo se procesa OCR una vez  
✅ **Búsquedas lógicas**: "Facturas emitidas en diciembre 2025"  
✅ **Auditoría**: `pdfRawKey` mantiene trazabilidad del inbox  

---

## 🔄 Estados del archivo

| Estado | Ubicación R2 | Tabla | Status |
|--------|--------------|-------|--------|
| Recién subido | `inbox/xxx.pdf` | `IngestQueue` | `DONE` |
| Procesando OCR | `inbox/xxx.pdf` | `Documento` | `estadoRevision: PENDIENTE` |
| OCR completo | `2025/12/20/xxx.pdf` | `Documento` | `estadoRevision: PENDIENTE` |
| Revisado por humano | `2025/12/20/xxx.pdf` | `Documento` | `estadoRevision: CONFIRMADO` |
| Error OCR | `failed/xxx.pdf` | `Documento` | `estadoRevision: ERROR` |

---

## 🛠️ Implementación

### Fase 1 (Actual)

```typescript
// generateR2Key con inbox
const r2Key = generateR2Key(r2Prefix, filename, true); // true = inbox
// Resultado: "inbox/weiss_20251226_231633.pdf"
```

### Fase 2 (Futuro - OCR Worker)

```typescript
// 1. Leer de inbox
const inboxFiles = await listR2Objects(bucket, 'inbox/');

for (const file of inboxFiles) {
  // 2. Descargar y procesar con Textract
  const ocrResult = await processWithTextract(file.key);
  
  // 3. Extraer fecha real
  const fechaEmision = parseDate(ocrResult.fechaEmision); // 2025-12-20
  
  // 4. Crear documento en BD
  const documento = await prisma.documento.create({
    data: {
      clienteId,
      fechaEmision,
      pdfRawKey: file.key, // "inbox/xxx.pdf"
      estadoRevision: 'PENDIENTE',
      ...ocrResult
    }
  });
  
  // 5. Generar key final por fecha real
  const finalKey = generateR2Key(
    r2Prefix, 
    filename, 
    false, // false = organizar por fecha
    fechaEmision // usar fecha del documento
  );
  // Resultado: "2025/12/20/weiss_20251226_231633.pdf"
  
  // 6. Mover archivo en R2
  await moveR2Object(bucket, file.key, finalKey);
  
  // 7. Actualizar documento
  await prisma.documento.update({
    where: { id: documento.id },
    data: { pdfFinalKey: finalKey }
  });
}
```

---

## 📊 Monitoreo

### Queries útiles

```sql
-- Archivos en inbox (esperando OCR)
SELECT COUNT(*) FROM "ingest_queue" WHERE status = 'DONE';

-- Documentos procesados por OCR
SELECT COUNT(*) FROM "documentos" WHERE "pdfFinalKey" IS NOT NULL;

-- Documentos pendientes de revisión
SELECT COUNT(*) FROM "documentos" WHERE "estadoRevision" = 'PENDIENTE';

-- Documentos por mes de emisión (fecha real)
SELECT 
  DATE_TRUNC('month', "fechaEmision") as mes,
  COUNT(*) as total
FROM "documentos"
WHERE "fechaEmision" IS NOT NULL
GROUP BY mes
ORDER BY mes DESC;
```

---

## 🎯 Siguiente paso

Para implementar **Fase 2**, necesitarás crear el **OCR Worker**:
- Servicio separado que monitorea inbox
- Integración con AWS Textract
- Parser de resultados OCR
- Lógica de move en R2
- Actualización de tabla Documento
