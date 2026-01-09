# ✅ Configuración Multi-Bucket - Checklist

## 📋 Tu configuración actual detectada:

```bash
R2_ACCOUNT_ID="5befc49c2d4e0fd9f2082331c5e7ac61"  ✅
R2_ACCESS_KEY_ID="[TIENES_TOKEN]"                ✅
R2_SECRET_ACCESS_KEY="[TIENES_SECRET]"           ✅
```

---

## 🔧 Pasos a seguir:

### 1. Completar variables en .env

Agregá estas variables a tu `.env`:

```bash
# Worker Mode
WORKER_MODE="watcher"  # o "processor"

# WebDAV Directories
WEBDAV_DIR="/srv/webdav/data"
PROCESSED_DIR="/srv/webdav/processed"
FAILED_DIR="/srv/webdav/failed"

# Watcher Config
WATCHER_POLL_INTERVAL="2000"
FILE_STABLE_CHECKS="3"

# Processor Config
MAX_CONCURRENT_JOBS="5"
PROCESSOR_POLL_INTERVAL="5000"
MAX_RETRY_ATTEMPTS="5"

# Prefix Map (CRÍTICO)
PREFIX_MAP_PATH="./prefix-map.json"
```

**Nota:** Ya NO necesitás `R2_BUCKET_NAME` porque cada cliente tendrá su bucket.

---

### 2. Crear clientes en la base de datos

Primero aplicá el schema de Prisma:

```bash
cd packages/database
bun run prisma:push
```

Luego insertá tus clientes:

```sql
-- Conectar a tu base de datos
psql $DATABASE_URL

-- Insertar cliente de ejemplo
INSERT INTO "Cliente" (
  id, 
  nombre, 
  cuit, 
  "razonSocial", 
  email, 
  telefono,
  activo
) VALUES (
  '081c9039-9236-4f33-a29a-c63f88bc2e58',  -- UUID (puede ser cualquiera)
  'Weiss Cliente',
  '33712152449',
  'Weiss S.A.',
  'contacto@weiss.com',
  '1145678900',
  true
);

-- Verificar
SELECT id, nombre, cuit FROM "Cliente";
```

**⚠️ Guardar el UUID generado** - lo necesitás para el próximo paso.

---

### 3. Configurar prefix-map.json

Este archivo mapea prefijos de archivos → clientes → buckets:

```bash
cd apps/worker
vim prefix-map.json
```

```json
{
  "weiss": {
    "clienteId": "081c9039-9236-4f33-a29a-c63f88bc2e58",
    "cuit": "33712152449",
    "r2Bucket": "axp-client-33712152449",
    "r2Prefix": ""
  }
}
```

**Explicación:**
- `"weiss"`: Prefijo del archivo (ej: `weiss_invoice.pdf` → cliente "weiss")
- `clienteId`: UUID del cliente en la base de datos (del paso 2)
- `cuit`: CUIT del cliente (para logging)
- `r2Bucket`: Nombre del bucket R2 que creaste
- `r2Prefix`: Subcarpeta dentro del bucket (vacío = root)

---

### 4. Verificar que el bucket existe en R2

```bash
# Exportar credenciales
export AWS_ACCESS_KEY_ID="[TU_R2_ACCESS_KEY]"
export AWS_SECRET_ACCESS_KEY="[TU_R2_SECRET_KEY]"
export AWS_ENDPOINT_URL="https://5befc49c2d4e0fd9f2082331c5e7ac61.r2.cloudflarestorage.com"

# Listar buckets
aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL

# Deberías ver algo como:
# 2026-01-03 10:30:00 axp-client-33712152449
```

Si NO ves el bucket, crealo:

```bash
aws s3 mb s3://axp-client-33712152449 --endpoint-url=$AWS_ENDPOINT_URL
```

---

### 5. Crear directorios WebDAV (para testing local)

```bash
mkdir -p /tmp/axp-test/data
mkdir -p /tmp/axp-test/processed
mkdir -p /tmp/axp-test/failed
```

Actualizá tu `.env` para testing:

```bash
WEBDAV_DIR="/tmp/axp-test/data"
PROCESSED_DIR="/tmp/axp-test/processed"
FAILED_DIR="/tmp/axp-test/failed"
```

---

### 6. Test completo

**Terminal 1: Watcher**
```bash
cd apps/worker
bun run dev:watcher
```

**Terminal 2: Crear archivo de prueba**
```bash
echo "PDF de prueba" > /tmp/axp-test/data/weiss_test.pdf
```

**Terminal 3: Processor**
```bash
cd apps/worker
bun run dev:processor
```

---

## ✅ Logs esperados

**Watcher:**
```
[WATCHER] 📄 Found new file: weiss_test.pdf
[WATCHER] 🏢 Detected prefix: weiss
[WATCHER] ✅ Cliente: 33712152449 (081c9039-9236-4f33-a29a-c63f88bc2e58)
[WATCHER] 🔐 SHA256: abc123...
[WATCHER] ✅ File enqueued: weiss_test.pdf
[WATCHER] 📦 File moved to processed
```

**Processor:**
```
[PROCESSOR] 🔄 Processing queue item: xyz
[PROCESSOR] 🏢 Cliente: 33712152449
[PROCESSOR] 📦 R2 Bucket: axp-client-33712152449
[PROCESSOR] 🔑 R2 key: 2026/01/03/weiss_test.pdf
[PROCESSOR] ☁️  Uploading to R2...
[PROCESSOR] ✅ Upload successful: axp-client-33712152449/2026/01/03/weiss_test.pdf
```

---

## 🎯 Resumen Visual

```
Archivo: weiss_invoice.pdf
    ↓
Prefijo: "weiss" (extraído del filename)
    ↓
prefix-map.json lookup
    ↓
Cliente ID: 081c9039-9236-4f33-a29a-c63f88bc2e58
CUIT: 33712152449
R2 Bucket: axp-client-33712152449
    ↓
Upload a: axp-client-33712152449/2026/01/03/weiss_invoice.pdf
```

---

## 📝 Próximos clientes

Para agregar más clientes:

1. **Crear bucket en R2:**
   ```bash
   aws s3 mb s3://axp-client-[NUEVO_CUIT] --endpoint-url=$AWS_ENDPOINT_URL
   ```

2. **Insertar en BD:**
   ```sql
   INSERT INTO "Cliente" (...) VALUES (...);
   ```

3. **Agregar a prefix-map.json:**
   ```json
   {
     "weiss": { ... },
     "nuevo": {
       "clienteId": "uuid-nuevo-cliente",
       "cuit": "NUEVO_CUIT",
       "r2Bucket": "axp-client-NUEVO_CUIT",
       "r2Prefix": ""
     }
   }
   ```

4. **Reiniciar workers** (o implementar hot-reload)

---

¿En qué paso necesitás ayuda?
