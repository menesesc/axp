# 🪣 Multi-Bucket Configuration Guide

## Arquitectura: 1 Bucket por Cliente

### ✅ Ventajas

- **Aislamiento Total**: Cada cliente tiene su propio bucket R2
- **Gestión de Permisos**: Puedes dar acceso a un cliente a SU bucket sin exponer otros
- **Billing Separado**: Tracking de costos por cliente
- **Compliance**: Segregación física de datos (GDPR, regulaciones locales)
- **Fácil Eliminación**: Borrar cliente = borrar su bucket completo
- **Cuotas Independientes**: Cada bucket tiene sus propios límites

### ❌ Consideraciones

- Más buckets = más gestión administrativa
- Necesitás crear un bucket por cada cliente nuevo
- El API token debe tener permisos en TODOS los buckets (o ser Admin)

---

## 🔧 Configuración

### Paso 1: Crear Buckets en Cloudflare R2

Para cada cliente, creás un bucket con esta convención de nombres:

```
axp-client-[CUIT]
```

**Ejemplos:**
- Cliente Weiss (CUIT 33712152449): `axp-client-33712152449`
- Cliente Acme (CUIT 20123456789): `axp-client-20123456789`

**Cómo crear:**

1. Cloudflare Dashboard → R2
2. Click "Create bucket"
3. Nombre: `axp-client-33712152449`
4. Location: Automatic (o región específica)
5. Repetir para cada cliente

### Paso 2: Crear API Token con Permisos Multi-Bucket

**Opción A: Admin Token** (Recomendado para desarrollo)

1. R2 → Manage R2 API Tokens
2. Create API Token
3. Configuración:
   - Name: `axp-worker-admin`
   - Permissions: **Admin Read & Write**
   - Bucket scope: **All buckets in this account**
   - TTL: Never expire
4. Copiar Access Key ID y Secret Access Key

**Opción B: Token con Buckets Específicos** (Recomendado para producción)

1. R2 → Manage R2 API Tokens
2. Create API Token
3. Configuración:
   - Name: `axp-worker-multi`
   - Permissions: **Object Read & Write**
   - Bucket scope: **Apply to specific buckets**
   - Seleccionar todos los buckets de clientes
   - TTL: Never expire
4. Copiar Access Key ID y Secret Access Key

⚠️ **Nota**: Con la opción B, cada vez que agregues un cliente nuevo, necesitás:
- Crear el bucket nuevo
- Actualizar el token para incluir ese bucket O crear token nuevo

Con Admin token (opción A), no necesitás actualizar nada.

### Paso 3: Configurar .env

```bash
cd apps/worker
vim .env
```

```bash
# Database
DATABASE_URL="postgresql://..."

# Cloudflare R2 (credenciales globales)
R2_ACCOUNT_ID="abc123def456"
R2_ACCESS_KEY_ID="[ACCESS_KEY_DEL_TOKEN_ADMIN]"
R2_SECRET_ACCESS_KEY="[SECRET_KEY_DEL_TOKEN_ADMIN]"

# R2_BUCKET_NAME ya no es obligatorio (solo fallback)
# R2_BUCKET_NAME="axp-documents"  # OPCIONAL

# Worker Mode
WORKER_MODE="watcher"

# Directories
WEBDAV_DIR="/srv/webdav/data"
PROCESSED_DIR="/srv/webdav/processed"
FAILED_DIR="/srv/webdav/failed"

# Prefix Map (CRÍTICO para multi-bucket)
PREFIX_MAP_PATH="./prefix-map.json"
```

### Paso 4: Configurar prefix-map.json

```bash
vim prefix-map.json
```

**Estructura con buckets por cliente:**

```json
{
  "weiss": {
    "clienteId": "081c9039-9236-4f33-a29a-c63f88bc2e58",
    "cuit": "33712152449",
    "r2Bucket": "axp-client-33712152449",
    "r2Prefix": ""
  },
  "acme": {
    "clienteId": "00000000-0000-0000-0000-000000000002",
    "cuit": "20123456789",
    "r2Bucket": "axp-client-20123456789",
    "r2Prefix": ""
  },
  "globalcorp": {
    "clienteId": "00000000-0000-0000-0000-000000000003",
    "cuit": "27345678901",
    "r2Bucket": "axp-client-27345678901",
    "r2Prefix": "invoices"
  }
}
```

**Campos:**
- `clienteId`: UUID del cliente en la base de datos (debe coincidir)
- `cuit`: CUIT del cliente (para logging/auditoría)
- `r2Bucket`: Nombre del bucket específico de ese cliente
- `r2Prefix`: Prefijo dentro del bucket (opcional, puede ser vacío `""`)

**r2Prefix** es útil si querés organización adicional DENTRO del bucket:
- `""` (vacío): Archivos en root del bucket → `2026/01/03/file.pdf`
- `"invoices"`: Archivos en subcarpeta → `invoices/2026/01/03/file.pdf`

### Paso 5: Verificar Estructura en R2

Después de procesar archivos, la estructura en R2 será:

```
R2 Account
├── axp-client-33712152449/          (Bucket de Weiss)
│   ├── 2026/
│   │   └── 01/
│   │       └── 03/
│   │           ├── weiss_invoice_001.pdf
│   │           └── weiss_receipt_002.pdf
│
├── axp-client-20123456789/          (Bucket de Acme)
│   ├── 2026/
│   │   └── 01/
│   │       └── 03/
│   │           └── acme_doc_123.pdf
│
└── axp-client-27345678901/          (Bucket de GlobalCorp)
    ├── invoices/                    (r2Prefix)
    │   ├── 2026/
    │   │   └── 01/
    │   │       └── 03/
    │   │           └── globalcorp_inv_456.pdf
```

---

## 🧪 Testing Multi-Bucket

### Test 1: Verificar Buckets Existen

```bash
export AWS_ACCESS_KEY_ID="[TU_R2_ACCESS_KEY]"
export AWS_SECRET_ACCESS_KEY="[TU_R2_SECRET_KEY]"
export AWS_ENDPOINT_URL="https://[ACCOUNT_ID].r2.cloudflarestorage.com"

# Listar todos los buckets
aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL

# Deberías ver:
# axp-client-33712152449
# axp-client-20123456789
# axp-client-27345678901
```

### Test 2: Upload Manual

```bash
# Test upload a bucket específico
echo "test" > test.txt
aws s3 cp test.txt s3://axp-client-33712152449/test.txt --endpoint-url=$AWS_ENDPOINT_URL

# Verificar
aws s3 ls s3://axp-client-33712152449/ --endpoint-url=$AWS_ENDPOINT_URL
```

### Test 3: Worker Completo

```bash
# Terminal 1: Watcher
bun run dev:watcher

# Terminal 2: Upload archivo
echo "test PDF" > /tmp/axp-test/data/weiss_test.pdf

# Terminal 3: Processor
bun run dev:processor

# Verificar logs:
# [PROCESSOR] 📦 R2 Bucket: axp-client-33712152449
# [PROCESSOR] ✅ Upload successful: axp-client-33712152449/2026/01/03/weiss_test.pdf

# Verificar en R2:
aws s3 ls s3://axp-client-33712152449/2026/01/03/ --endpoint-url=$AWS_ENDPOINT_URL
# Deberías ver: weiss_test.pdf
```

---

## 📋 Workflow para Agregar Nuevo Cliente

### 1. Crear Cliente en Base de Datos

```sql
INSERT INTO "Cliente" (id, nombre, cuit, ...) VALUES 
  ('uuid-nuevo-cliente', 'Nuevo Cliente S.A.', '30987654321', ...);
```

### 2. Crear Bucket en R2

- Dashboard → R2 → Create bucket
- Nombre: `axp-client-30987654321`

### 3. Actualizar prefix-map.json

```bash
vim apps/worker/prefix-map.json
```

```json
{
  "weiss": { ... },
  "acme": { ... },
  "nuevo": {
    "clienteId": "uuid-nuevo-cliente",
    "cuit": "30987654321",
    "r2Bucket": "axp-client-30987654321",
    "r2Prefix": ""
  }
}
```

### 4. Recargar Configuración (sin reiniciar worker)

**Opción A: Endpoint API** (TODO: implementar)
```bash
curl -X POST http://localhost:3001/admin/reload-prefix-map
```

**Opción B: Reiniciar worker**
```bash
docker-compose restart axp-watcher
docker-compose restart axp-processor
```

### 5. Test

```bash
echo "test" > /srv/webdav/data/nuevo_test.pdf
# Verificar que se procesa al bucket correcto
```

---

## 🔐 Seguridad y Permisos

### Permisos Recomendados por Ambiente

**Development:**
```
API Token: Admin Read & Write
Scope: All buckets
Rationale: Facilidad de desarrollo, testing rápido
```

**Staging:**
```
API Token: Object Read & Write
Scope: Buckets específicos de staging
Rationale: Aislamiento de producción
```

**Production:**
```
API Token: Object Read & Write
Scope: Buckets específicos de producción
TTL: 90 días (rotar periódicamente)
Rationale: Mínimo privilegio, auditoría
```

### Rotación de Credenciales

```bash
# 1. Crear nuevo token en Cloudflare
# 2. Actualizar .env con nuevas credenciales
# 3. Reiniciar workers
docker-compose restart

# 4. Verificar que funciona
docker-compose logs -f | grep "Upload successful"

# 5. Revocar token viejo en Cloudflare
```

---

## 💰 Consideraciones de Costos

### Pricing Cloudflare R2 (Enero 2026)

- **Storage**: $0.015 / GB-month
- **Class A Operations** (PUT, LIST): $4.50 / million
- **Class B Operations** (GET, HEAD): $0.36 / million
- **Data Transfer**: **GRATIS** (sin egress fees)

### Estimación Multi-Bucket

**Escenario: 10 clientes, 100 PDFs/mes por cliente, 200KB promedio por PDF**

```
Storage:
- 10 clientes × 100 PDFs × 0.2 MB = 200 MB/mes
- 200 MB × $0.015/GB = $0.003/mes

Operations:
- 1,000 PUTs/mes = $0.0045/mes
- ~5,000 GETs/mes = $0.0018/mes

Total: ~$0.01/mes (menos de 1 centavo!)
```

**Multi-bucket NO aumenta costos** (R2 no cobra por cantidad de buckets)

---

## 🔍 Monitoreo Multi-Bucket

### Query: Distribución de Archivos por Cliente

```sql
SELECT 
  c."nombre" as cliente,
  c."cuit",
  COUNT(*) as total_documentos,
  COUNT(*) FILTER (WHERE iq.status = 'DONE') as exitosos,
  COUNT(*) FILTER (WHERE iq.status = 'ERROR') as errores
FROM "IngestQueue" iq
JOIN "Cliente" c ON c.id = iq."clienteId"
GROUP BY c.id, c."nombre", c."cuit"
ORDER BY total_documentos DESC;
```

### Logs a Monitorear

```
# Bucket correcto usado
[PROCESSOR] 📦 R2 Bucket: axp-client-33712152449

# Upload exitoso
[PROCESSOR] ✅ Upload successful: axp-client-33712152449/2026/01/03/file.pdf

# Error de bucket no encontrado
[PROCESSOR] ❌ R2 upload failed for axp-client-WRONG/file.pdf: NoSuchBucket
```

---

## 🆚 Comparación: Multi-Bucket vs Single-Bucket

| Feature | Multi-Bucket (1 por cliente) | Single-Bucket (compartido) |
|---------|------------------------------|----------------------------|
| **Aislamiento** | ✅ Total | ⚠️ Por prefijo |
| **Permisos por cliente** | ✅ A nivel bucket | ⚠️ Requiere políticas S3 complejas |
| **Billing separado** | ✅ Nativo | ❌ Requiere tags/tracking manual |
| **Compliance** | ✅ Segregación física | ⚠️ Segregación lógica |
| **Eliminación cliente** | ✅ Borrar bucket | ⚠️ Borrar prefijo (puede dejar residuos) |
| **Complejidad setup** | ⚠️ Crear N buckets | ✅ Crear 1 bucket |
| **Escalabilidad** | ✅ Sin límites prácticos | ✅ Sin límites |
| **Costos** | ✅ Igual | ✅ Igual |

---

## 🚀 Migración desde Single-Bucket

Si ya tenías implementación con bucket compartido:

### Script de Migración

```typescript
// migrate-to-multi-bucket.ts
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

async function migrateClientFiles(
  fromBucket: string,
  toBucket: string,
  prefix: string
) {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://[ACCOUNT_ID].r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  // Listar archivos del cliente
  const listCommand = new ListObjectsV2Command({
    Bucket: fromBucket,
    Prefix: prefix,
  });

  const { Contents } = await s3.send(listCommand);

  if (!Contents) return;

  for (const object of Contents) {
    // Copiar a nuevo bucket
    const newKey = object.Key!.replace(prefix + '/', '');
    await s3.send(new CopyObjectCommand({
      CopySource: `${fromBucket}/${object.Key}`,
      Bucket: toBucket,
      Key: newKey,
    }));

    // Borrar del bucket original
    await s3.send(new DeleteObjectCommand({
      Bucket: fromBucket,
      Key: object.Key,
    }));

    console.log(`Migrated: ${object.Key} → ${toBucket}/${newKey}`);
  }
}

// Ejecutar
migrateClientFiles('axp-documents', 'axp-client-33712152449', 'cuit=33712152449');
```

---

¿Necesitás ayuda con algún paso específico de la configuración multi-bucket?
