# ✅ Setup Checklist - Worker AXP

## 1️⃣ Base de Datos (PostgreSQL + Prisma)

### Opción A: Usando Supabase (Recomendado)

```bash
# Ya tenés PostgreSQL, solo necesitás aplicar el schema

# 1. Obtener connection string de Supabase
# Dashboard → Settings → Database → Connection string
# Ejemplo: postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

# 2. Configurar Prisma
cd packages/database
echo "DATABASE_URL=\"postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres\"" > .env

# 3. Aplicar schema (crear tablas)
bun run prisma:push

# 4. Verificar
bun run prisma studio
# Debería abrir browser con todas las tablas
```

### Opción B: PostgreSQL Local

```bash
# 1. Instalar PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# 2. Crear base de datos
createdb axp

# 3. Configurar Prisma
cd packages/database
echo "DATABASE_URL=\"postgresql://localhost:5432/axp?schema=public\"" > .env

# 4. Aplicar schema
bun run prisma:push

# 5. Verificar
psql axp -c "\dt"  # Lista todas las tablas
# Deberías ver: Cliente, Usuario, Proveedor, Documento, etc.
```

### Verificación

```bash
# Deberías ver estas tablas:
✅ Cliente
✅ Usuario
✅ Proveedor
✅ Documento
✅ DocumentoItem
✅ DocumentoRevision
✅ Pago
✅ PagoMetodo
✅ PagoDocumento
✅ IngestQueue
```

---

## 2️⃣ Cloudflare R2 (Almacenamiento de PDFs)

### Paso 1: Crear Bucket

1. Ir a https://dash.cloudflare.com/
2. Click **R2** en menú lateral
3. Click **"Create bucket"**
4. Nombre: `axp-documents`
5. Click **"Create bucket"**

### Paso 2: Obtener Account ID

- Mirá la URL del dashboard:
  ```
  https://dash.cloudflare.com/[ESTE_ES_TU_ACCOUNT_ID]/r2/overview
  ```
- O en **R2 Overview** → "Account ID" (esquina superior derecha)

### Paso 3: Crear API Token

1. En R2, click **"Manage R2 API Tokens"**
2. Click **"Create API Token"**
3. Configuración:
   - Name: `axp-worker-access`
   - Permissions: **Object Read & Write**
   - Bucket scope: **Apply to specific buckets** → `axp-documents`
   - TTL: **Never expire**
4. Click **"Create API Token"**
5. **⚠️ COPIAR INMEDIATAMENTE (no se puede ver después):**
   ```
   Access Key ID: abc123...
   Secret Access Key: xyz789...
   ```

### Verificación

```bash
# Test con AWS CLI (R2 es compatible S3)
export AWS_ACCESS_KEY_ID="[TU_R2_ACCESS_KEY]"
export AWS_SECRET_ACCESS_KEY="[TU_R2_SECRET_KEY]"
export AWS_ENDPOINT_URL="https://[ACCOUNT_ID].r2.cloudflarestorage.com"

aws s3 ls --endpoint-url=$AWS_ENDPOINT_URL
# Deberías ver: axp-documents
```

---

## 3️⃣ Crear Cliente de Prueba en Base de Datos

```bash
# Conectar a tu base de datos
psql $DATABASE_URL

# Insertar cliente de prueba
INSERT INTO "Cliente" (
  id, 
  nombre, 
  cuit, 
  "razonSocial", 
  email, 
  telefono, 
  direccion, 
  ciudad, 
  provincia, 
  "codigoPostal", 
  pais, 
  activo
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Weiss Cliente Test',
  '33712152449',
  'Weiss S.A.',
  'contacto@weiss.com',
  '1145678900',
  'Av. Corrientes 1234',
  'Buenos Aires',
  'CABA',
  'C1043',
  'Argentina',
  true
);

# Verificar
SELECT id, nombre, cuit FROM "Cliente";
```

**Guardar el UUID del cliente** (lo necesitás para prefix-map.json)

---

## 4️⃣ Configurar Worker

### Archivo .env

```bash
cd apps/worker
cp .env.example .env
vim .env
```

**Completar con tus valores:**
```bash
# Database (mismo que usaste en packages/database)
DATABASE_URL="postgresql://..."

# Cloudflare R2 (del paso 2)
R2_ACCOUNT_ID="[TU_ACCOUNT_ID]"
R2_ACCESS_KEY_ID="[TU_ACCESS_KEY]"
R2_SECRET_ACCESS_KEY="[TU_SECRET_KEY]"
R2_BUCKET_NAME="axp-documents"

# Worker Mode
WORKER_MODE="watcher"

# Directories (crear después)
WEBDAV_DIR="/tmp/axp-test/data"
PROCESSED_DIR="/tmp/axp-test/processed"
FAILED_DIR="/tmp/axp-test/failed"

# Intervals
WATCHER_POLL_INTERVAL="2000"
FILE_STABLE_CHECKS="3"
MAX_CONCURRENT_JOBS="5"
PROCESSOR_POLL_INTERVAL="5000"
MAX_RETRY_ATTEMPTS="5"

# Prefix Map
PREFIX_MAP_PATH="./prefix-map.json"
```

### Archivo prefix-map.json

```bash
cd apps/worker
cp prefix-map.example.json prefix-map.json
vim prefix-map.json
```

**Completar con el UUID del cliente:**
```json
{
  "weiss": {
    "clienteId": "00000000-0000-0000-0000-000000000001",
    "cuit": "33712152449",
    "r2Prefix": "cuit=33712152449"
  }
}
```

**⚠️ El `clienteId` debe coincidir con el UUID del cliente en la base de datos**

---

## 5️⃣ Crear Directorios WebDAV

```bash
# Para testing local
mkdir -p /tmp/axp-test/data
mkdir -p /tmp/axp-test/processed
mkdir -p /tmp/axp-test/failed

# Para producción (en servidor)
sudo mkdir -p /srv/webdav/data
sudo mkdir -p /srv/webdav/processed
sudo mkdir -p /srv/webdav/failed
sudo chown -R $USER:$USER /srv/webdav
```

---

## 6️⃣ Test Rápido

### Terminal 1: Watcher
```bash
cd apps/worker
bun run dev:watcher
```

### Terminal 2: Crear archivo de prueba
```bash
echo "PDF de prueba" > /tmp/axp-test/data/weiss_test.pdf
```

### Logs esperados en Terminal 1:
```
[WATCHER] 📄 Found new file: weiss_test.pdf
[WATCHER] ⏳ Waiting for file to be stable: weiss_test.pdf
[WATCHER] 🏢 Detected prefix: weiss
[WATCHER] ✅ Cliente: 33712152449 (00000000-0000-0000-0000-000000000001)
[WATCHER] 🔐 Calculating SHA256...
[WATCHER] 🔐 SHA256: abc123...
[WATCHER] 📝 Enqueuing file for processing...
[WATCHER] ✅ File enqueued: weiss_test.pdf (queue id: xyz)
[WATCHER] 📦 File moved to processed: /tmp/axp-test/processed/weiss_test.pdf
```

### Terminal 3: Processor
```bash
cd apps/worker
bun run dev:processor
```

### Logs esperados en Terminal 3:
```
[PROCESSOR] 🚀 Queue Processor starting...
[PROCESSOR] 📋 Found 1 pending item(s)
[PROCESSOR] 🔄 Processing queue item: xyz (weiss_test.pdf)
[PROCESSOR] 📖 Reading file: /tmp/axp-test/processed/weiss_test.pdf
[PROCESSOR] 🏢 Cliente: 33712152449
[PROCESSOR] 🔑 R2 key: cuit=33712152449/2026/01/03/weiss_test.pdf
[PROCESSOR] ☁️  Uploading to R2...
[PROCESSOR] ✅ Upload successful: cuit=33712152449/2026/01/03/weiss_test.pdf (234ms)
[PROCESSOR] ✅ Queue item processed successfully: xyz
```

### Verificar en R2:
1. Ir a Cloudflare Dashboard → R2 → axp-documents
2. Navegar a: `cuit=33712152449/2026/01/03/`
3. Deberías ver: `weiss_test.pdf`

---

## 7️⃣ Troubleshooting

### Error: "Cannot find name 'process'"
- ✅ **Esto es normal** - Los errores de TypeScript son esperados
- El código funciona perfectamente con `bun run`
- Ignorá los errores del editor

### Error: "Cannot connect to database"
```bash
# Verificar conexión
psql $DATABASE_URL -c "SELECT 1"

# Si falla, revisar:
# 1. URL correcta
# 2. PostgreSQL corriendo (brew services list)
# 3. Firewall/VPN no bloquea
```

### Error: "No client configuration found for prefix"
```bash
# Verificar prefix-map.json
cat apps/worker/prefix-map.json

# Verificar que el clienteId existe en DB
psql $DATABASE_URL -c "SELECT id, nombre FROM \"Cliente\" WHERE id = '00000000-0000-0000-0000-000000000001';"
```

### Error: "R2 upload failed"
```bash
# Test credenciales
export AWS_ACCESS_KEY_ID="[R2_ACCESS_KEY]"
export AWS_SECRET_ACCESS_KEY="[R2_SECRET_KEY]"
aws s3 ls --endpoint-url=https://[ACCOUNT_ID].r2.cloudflarestorage.com

# Si falla:
# 1. Verificar Access Key ID y Secret
# 2. Verificar Account ID
# 3. Verificar permisos del token (Object Read & Write)
```

---

## 📋 Checklist Final

Antes de ejecutar, asegurate que:

- [ ] PostgreSQL está corriendo
- [ ] Prisma schema aplicado (tablas creadas)
- [ ] Cliente de prueba insertado en DB
- [ ] Cloudflare R2 bucket creado
- [ ] API Token de R2 obtenido
- [ ] `.env` configurado con credenciales correctas
- [ ] `prefix-map.json` con clienteId correcto
- [ ] Directorios WebDAV creados
- [ ] Tests estructurales pasan: `bun run test-structure.ts`

---

## 🚀 Ejecutar en Producción

Una vez que todo funcione localmente:

```bash
# 1. Actualizar .env con paths de producción
WEBDAV_DIR="/srv/webdav/data"
PROCESSED_DIR="/srv/webdav/processed"
FAILED_DIR="/srv/webdav/failed"

# 2. Copiar prefix-map.json a producción
scp prefix-map.json server:/etc/axp/prefix-map.json

# 3. Build y deploy con Docker
docker-compose build
docker-compose up -d

# 4. Verificar logs
docker-compose logs -f
```

---

## 💡 Tips

1. **Testear siempre con archivos pequeños primero** (< 1 MB)
2. **Monitoreá los logs constantemente** durante las primeras subidas
3. **Verificá en Prisma Studio** que los registros se crean en IngestQueue
4. **Verificá en R2 Dashboard** que los archivos se suben correctamente
5. **Empezá con 1 archivo, luego escalá** a múltiples archivos

---

¿Alguno de estos pasos no está claro? ¡Preguntame!
