# Documento Detalle - Corrección 404 y PDF

## Problema Detectado

Al intentar acceder a `/documento/[id]`, se obtenían errores 404 y el PDF no se visualizaba correctamente.

### Causas Identificadas

1. **PDF API esperaba formato incorrecto**: 
   - La API esperaba `bucket/path/file.pdf`
   - La base de datos almacena solo `path/file.pdf` (sin bucket)
   - Ejemplo real: `inbox/weiss_20260109_112321.pdf`

2. **Faltaba configuración R2**:
   - Variables de entorno R2 no estaban en `.env.local`
   - Bucket name no estaba configurado

3. **Columnas case-sensitive**:
   - PostgreSQL requiere comillas dobles para columnas camelCase
   - Ejemplo: `"numeroCompleto"`, `"pdfRawKey"`, `"pdfFinalKey"`

## Solución Implementada

### 1. Actualización del API de PDF (`/api/pdf/route.ts`)

**ANTES:**
```typescript
// Extraía bucket del key
const parts = key.split('/');
const bucket = parts[0];
const objectKey = parts.slice(1).join('/');
```

**DESPUÉS:**
```typescript
// Usa el bucket de la variable de entorno
const command = new GetObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: key, // key completo: "inbox/file.pdf"
});
```

### 2. Variables de Entorno Agregadas

**Archivo: `apps/web/.env.local`**
```bash
# Cloudflare R2 (para PDFs)
R2_ACCOUNT_ID=5befc49c2d4e0fd9f2082331c5e7ac61
R2_ACCESS_KEY_ID=aed1fd8d0ccea4dfe5cc85bebcc2fb9c
R2_SECRET_ACCESS_KEY=3d15f57cfd02a8898398bbeb8cd0de9649c114179e3c8acb57a74e19a1478a81
R2_BUCKET_NAME=axp-client-33712152449
```

**Archivo: `apps/web/.env.example`** (documentación)
```bash
# Cloudflare R2 (para visualización de PDFs)
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-access-key-id"
R2_SECRET_ACCESS_KEY="your-secret-access-key"
R2_BUCKET_NAME="your-bucket-name"
```

### 3. Endpoint de Documento Ya Usa Prisma

El endpoint `/api/documentos/[id]/route.ts` ya estaba correctamente implementado con Prisma:

```typescript
const documento = await prisma.documentos.findUnique({
  where: { id: params.id },
  include: {
    clientes: true,
    proveedores: true,
    documento_items: true,
  },
});
```

## Verificación de Datos

### Consulta SQL Ejecutada

```sql
SELECT 
  id,
  tipo,
  letra,
  "numeroCompleto",
  "pdfRawKey",
  "pdfFinalKey",
  "createdAt"
FROM documentos 
LIMIT 3;
```

### Resultados Confirmados

| Campo | Ejemplo |
|-------|---------|
| `pdfRawKey` | `inbox/weiss_20260109_112321.pdf` |
| `pdfFinalKey` | `2025/12/27/weiss_20260109_112321.pdf` |
| `bucket` | `axp-client-33712152449` (de prefix-map.json) |

**✅ Formato confirmado**: Las rutas NO incluyen el bucket en la DB.

## Flujo Completo de Visualización de PDF

```
1. Usuario hace doble clic en documento
   ↓
2. Router navega a /documento/[id]
   ↓
3. useQuery obtiene documento:
   GET /api/documentos/[id]
   → Prisma.documentos.findUnique()
   → Retorna { documento, items }
   ↓
4. useQuery obtiene URL firmada:
   GET /api/pdf?key=inbox/file.pdf
   → GetObjectCommand(bucket, key)
   → getSignedUrl() → URL válida 1 hora
   ↓
5. iframe carga PDF:
   <iframe src={signedUrl} />
```

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `/app/api/pdf/route.ts` | ✅ Simplificado para usar bucket de env |
| `/.env.local` | ✅ Agregadas variables R2 |
| `/.env.example` | ✅ Documentadas variables R2 |

## Próximos Pasos para Probar

1. **Reiniciar el servidor de desarrollo**:
   ```bash
   # Si está corriendo, detenerlo (Ctrl+C) y reiniciar:
   bun run dev
   ```

2. **Navegar a la lista de documentos**:
   ```
   http://localhost:3000
   ```

3. **Hacer doble clic en cualquier documento**

4. **Verificar**:
   - ✅ Carga la información del documento (cliente, proveedor, fechas)
   - ✅ Muestra los items del documento en la tabla
   - ✅ El PDF se visualiza en el iframe derecho
   - ✅ La alerta de campos faltantes aparece si corresponde

## Troubleshooting

### Si el PDF no carga

**Error en consola**: `Failed to generate signed URL`

**Causas posibles**:
1. Variables R2 incorrectas en `.env.local`
2. Bucket name incorrecto
3. PDF no existe en R2

**Verificar**:
```bash
# Revisar que las variables estén cargadas
echo $R2_BUCKET_NAME
# Debe mostrar: axp-client-33712152449
```

### Si el documento muestra 404

**Error**: `Documento not found`

**Causas posibles**:
1. ID de documento inválido
2. Documento no existe en la base de datos
3. Error de conexión a Prisma

**Verificar con SQL**:
```sql
SELECT id, tipo, "numeroCompleto" 
FROM documentos 
WHERE id = 'id-del-documento';
```

## Notas Técnicas

### Multi-Bucket Architecture

El proyecto usa **multi-bucket** (un bucket por cliente):
- Configuración en: `apps/worker/prefix-map.json`
- Cliente "weiss" → Bucket: `axp-client-33712152449`

Para la **web app**, se usa un **bucket único por defecto** configurado en `.env.local`. Si en el futuro necesitas múltiples buckets, deberás:

1. Agregar `clienteId` a la tabla de documentos
2. Crear un lookup service para resolver bucket por cliente
3. Modificar `/api/pdf` para usar ese lookup

### Seguridad de URLs Firmadas

- **Expiración**: 1 hora (3600 segundos)
- **Método**: AWS Signature V4
- **Renovación**: React Query refresca automáticamente cuando expira (`staleTime: 30 min`)

### Caching

```typescript
// En page.tsx
staleTime: 1000 * 60 * 30, // 30 minutos
```

La URL firmada se cachea 30 minutos para evitar regeneraciones innecesarias.

## Referencias

- **Documentación original**: `DOCUMENTO-DETALLE.md`
- **R2 API Docs**: https://developers.cloudflare.com/r2/
- **AWS SDK S3**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/
