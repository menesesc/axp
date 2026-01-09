# Gestión de Fechas en R2

## Estrategia de organización

El worker organiza los archivos en R2 usando **la fecha del nombre del archivo** (no la fecha de proceso).

### ¿Por qué?

Cuando el escáner Epson genera un PDF, le pone un nombre con timestamp:
```
weiss_20251226_231633.pdf
        └─ YYYYMMDD_HHMMSS
```

Esta fecha representa **cuándo se escaneó el documento**, no cuándo se procesó.

### Ventajas

1. ✅ **Consistencia**: Si reprocesas un archivo, va a la misma carpeta
2. ✅ **Búsqueda lógica**: "Buscar facturas escaneadas en diciembre 2025"
3. ✅ **No depende del delay**: Aunque se procese días después, va a la carpeta correcta
4. ✅ **Preparado para futuro**: Cuando AWS Textract detecte la fecha real del documento, podés reindexar si es diferente

### Estructura resultante en R2

```
axp-client-33712152449/
├── 2025/
│   └── 12/
│       └── 26/
│           └── weiss_20251226_231633.pdf  ← Escaneado el 26/12/2025
│
└── 2026/
    └── 01/
        └── 05/
            └── weiss_20260105_083000.pdf  ← Escaneado el 05/01/2026
```

### Casos especiales

**Archivo sin fecha en el nombre:**
- Fallback: usa fecha actual de proceso
- Ejemplo: `documento.pdf` → `2026/01/08/documento.pdf`

**Fecha inválida:**
- Fallback: usa fecha actual de proceso

### Futuro con AWS Textract

Una vez que implementes OCR con AWS Textract, el flujo será:

1. **Scan** → `weiss_20251226_231633.pdf` → R2: `2025/12/26/` (fecha de escaneo)
2. **OCR** → Textract detecta: "Fecha factura: 20/12/2025"
3. **Indexar en DB** → `Documento.fecha = 2025-12-20` (fecha real del documento)
4. **Búsqueda** → Por fecha real en BD, archivo físico sigue en `2025/12/26/`

**Si querés reorganizar por fecha real:**
- Podés correr un script que mueva archivos de `2025/12/26/` a `2025/12/20/`
- O mantener doble índice: físico (escaneo) vs lógico (fecha del documento)

### Configuración

La función que extrae la fecha está en:
```typescript
// apps/worker/src/utils/fileUtils.ts
export function extractDateFromFilename(filename: string): Date
```

Patrón reconocido: `prefix_YYYYMMDD_HHMMSS.ext`
