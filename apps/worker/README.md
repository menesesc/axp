# AXP Worker

Sistema de procesamiento de documentos escaneados para AXP (Autogestión de Xpensas). Este worker maneja la ingesta de archivos PDF desde WebDAV y su procesamiento hacia Cloudflare R2.

## 🏗️ Arquitectura

El worker opera en **dos modos independientes**:

### 1. **Watcher Mode** (`WORKER_MODE=watcher`)
- Monitorea el directorio WebDAV donde los scanners Epson depositan PDFs
- Detecta archivos nuevos cada 2 segundos (configurable)
- Espera a que el archivo esté estable (no está siendo escrito)
- Extrae el prefijo del cliente del nombre del archivo (ej: `weiss_20251226.pdf` → `weiss`)
- Consulta la configuración del cliente desde `prefix-map.json`
- Calcula SHA256 del archivo para detección de duplicados
- Verifica duplicados en la base de datos (por `sourceRef` y por `sha256`)
- Crea registro en `IngestQueue` con status `PENDING`
- Mueve el archivo a `/srv/webdav/processed`

### 2. **Processor Mode** (`WORKER_MODE=processor`)
- Consulta registros `PENDING` en `IngestQueue` cada 5 segundos (configurable)
- Procesa hasta 5 archivos concurrentemente (configurable)
- Lee el PDF desde `/srv/webdav/processed`
- Sube el archivo a Cloudflare R2 con estructura jerárquica por fecha
- Actualiza status a `DONE` o implementa retry con exponential backoff
- Después de 5 intentos fallidos, marca como `ERROR`

## 📁 Estructura de Directorios

```
/srv/webdav/
├── data/          # Archivos entrantes (scanner deposita aquí)
├── processed/     # Archivos procesados por watcher
└── failed/        # Archivos con errores de validación
```

## 🔑 Convención de Nombres

Los archivos deben seguir el patrón: `<prefix>_<identificador>.pdf`

Ejemplos:
- `weiss_20251226.pdf` → Cliente "weiss"
- `acme_invoice_001.pdf` → Cliente "acme"
- `cualquiercosa.pdf` → Sin prefijo, se mueve a `/failed`

## ⚙️ Configuración

### Variables de Entorno

Ver `.env.example` para todas las variables disponibles.

**Esenciales:**
```bash
DATABASE_URL="postgresql://..."
WORKER_MODE="watcher"  # o "processor"

# R2 (solo para processor)
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="axp-documents"

# Prefix Map
PREFIX_MAP_PATH="/etc/axp/prefix-map.json"
```

### Prefix Map

Archivo JSON que mapea prefijos de archivos a clientes:

```json
{
  "weiss": {
    "clienteId": "uuid-del-cliente",
    "cuit": "33712152449",
    "r2Prefix": "cuit=33712152449"
  }
}
```

Este archivo debe estar:
- En producción: `/etc/axp/prefix-map.json`
- En desarrollo: `./prefix-map.json` (copia de `prefix-map.example.json`)

**¿Cómo se mantiene?**
- Se actualiza manualmente por DevOps/Admin cuando se agrega un nuevo cliente
- El watcher lo carga en memoria al iniciar
- Se puede recargar sin reiniciar usando `clearPrefixMapCache()` (TODO: endpoint API)

## 🚀 Desarrollo

### Ejecutar Watcher

```bash
cd apps/worker
cp .env.example .env
cp prefix-map.example.json prefix-map.json

# Editar .env y prefix-map.json con configuración real

bun run dev:watcher
```

### Ejecutar Processor

```bash
cd apps/worker
cp .env.example .env

# Configurar variables R2 en .env

bun run dev:processor
```

### Ambos Simultáneamente

```bash
# Terminal 1
bun run dev:watcher

# Terminal 2
bun run dev:processor
```

## 🐳 Docker

### Dockerfile (único para ambos modos)

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Copiar dependencias
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copiar código
COPY . .

# Build
RUN bun run build

# Ejecutar (WORKER_MODE debe venir de env)
CMD ["bun", "run", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  axp-watcher:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      WORKER_MODE: watcher
      DATABASE_URL: ${DATABASE_URL}
      WEBDAV_DIR: /srv/webdav/data
      PROCESSED_DIR: /srv/webdav/processed
      FAILED_DIR: /srv/webdav/failed
      PREFIX_MAP_PATH: /etc/axp/prefix-map.json
    volumes:
      - /srv/webdav:/srv/webdav
      - ./prefix-map.json:/etc/axp/prefix-map.json:ro
    restart: unless-stopped

  axp-processor:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      WORKER_MODE: processor
      DATABASE_URL: ${DATABASE_URL}
      PROCESSED_DIR: /srv/webdav/processed
      R2_ACCOUNT_ID: ${R2_ACCOUNT_ID}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET_NAME: ${R2_BUCKET_NAME}
    volumes:
      - /srv/webdav/processed:/srv/webdav/processed:ro
    restart: unless-stopped
```

## 🗄️ Base de Datos

### Modelo IngestQueue

```prisma
model IngestQueue {
  id           String              @id @default(uuid()) @db.Uuid
  clienteId    String              @db.Uuid
  cliente      Cliente             @relation(fields: [clienteId], references: [id])
  source       SourceIngestQueue
  sourceRef    String              @db.VarChar(500)
  sha256       String?             @db.VarChar(64)
  status       StatusIngestQueue   @default(PENDING)
  attempts     Int                 @default(0)
  nextRetryAt  DateTime?
  lastError    String?             @db.Text
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  @@unique([clienteId, source, sourceRef])
  @@index([status, nextRetryAt])
}

enum StatusIngestQueue {
  PENDING
  PROCESSING
  DONE
  ERROR
}

enum SourceIngestQueue {
  SFTP
  DRIVE  // Usado para WebDAV (no hay enum WebDAV)
}
```

### Idempotencia

La constraint `@@unique([clienteId, source, sourceRef])` garantiza que:
- No se procese el mismo archivo dos veces
- Si el watcher se cae y reinicia, no duplica registros
- Si el scanner sube el mismo PDF varias veces, se detecta

### Retry Logic

El processor implementa exponential backoff:

```
Intento 1: inmediato
Intento 2: +2 minutos
Intento 3: +4 minutos
Intento 4: +8 minutos
Intento 5: +16 minutos
Después: marca como ERROR
```

## 📊 Flujo Completo

```
1. Scanner Epson sube PDF vía WebDAV
   → Archivo: /srv/webdav/data/weiss_20251226.pdf

2. Watcher detecta archivo
   → Espera estabilidad (3 checks de tamaño)
   → Extrae prefix "weiss"
   → Busca cliente en prefix-map.json
   → Calcula SHA256
   → Verifica duplicados
   → Crea IngestQueue (PENDING)
   → Mueve a /srv/webdav/processed/

3. Processor consulta PENDING
   → Lee PDF desde /processed/
   → Sube a R2: cuit=33712152449/2025/01/26/weiss_20251226.pdf
   → Actualiza status a DONE

4. API consulta Documento
   → Lee r2Key desde BD
   → Genera URL firmada de R2
   → Frontend muestra PDF
```

## 🔒 Seguridad

- **SHA256**: Cada archivo tiene hash único para detección de duplicados
- **R2 Keys**: Segregados por CUIT del cliente (`cuit=XXXXXXXXXX/...`)
- **Credenciales**: Solo en variables de entorno, nunca en código
- **Readonly volumes**: El processor solo lee `/processed`, no escribe

## 📈 Monitoreo

### Logs

Ambos modos usan formato estructurado:

```
[2025-01-26T12:34:56.789Z] [WATCHER] 📄 Found new file: weiss_20251226.pdf
[2025-01-26T12:34:58.123Z] [WATCHER] ✅ File enqueued: weiss_20251226.pdf
[2025-01-26T12:35:01.456Z] [PROCESSOR] 🔄 Processing queue item: abc-123-def
[2025-01-26T12:35:05.789Z] [PROCESSOR] ✅ Upload successful: cuit=33712152449/2025/01/26/weiss_20251226.pdf
```

### Métricas a Monitorear

- **Watcher**: Archivos detectados/min, errores de prefix, duplicados
- **Processor**: Items procesados/min, tasa de error, intentos de retry
- **Base de datos**: Registros en PENDING, PROCESSING, ERROR
- **R2**: Tamaño total, bandwidth, costo

### Queries Útiles

```sql
-- Ver estado de la cola
SELECT status, COUNT(*) as count 
FROM "IngestQueue" 
GROUP BY status;

-- Items en error
SELECT * 
FROM "IngestQueue" 
WHERE status = 'ERROR' 
ORDER BY "updatedAt" DESC;

-- Items pendientes hace más de 1 hora
SELECT * 
FROM "IngestQueue" 
WHERE status = 'PENDING' 
AND "createdAt" < NOW() - INTERVAL '1 hour';
```

## 🛠️ Troubleshooting

### Watcher no detecta archivos

1. Verificar permisos en `/srv/webdav/data`
2. Verificar que `prefix-map.json` existe y es válido JSON
3. Ver logs por errores de prefix

### Processor no sube a R2

1. Verificar credenciales R2 en `.env`
2. Verificar que `/srv/webdav/processed` tiene los PDFs
3. Ver `lastError` en registros con status ERROR

### Archivos duplicados

- Por diseño, el sistema detecta duplicados por SHA256
- Ver logs del watcher para mensajes "Duplicate file by SHA256"
- Los duplicados se mueven a `/processed` con prefijo `DUPLICATE_`

### Performance lento

1. Aumentar `MAX_CONCURRENT_JOBS` (processor)
2. Disminuir `WATCHER_POLL_INTERVAL` (watcher)
3. Verificar latencia de red a R2
4. Verificar performance de PostgreSQL

## 📚 Referencias

- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [AWS SDK S3 Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [Prisma Client](https://www.prisma.io/docs/concepts/components/prisma-client)
- [Bun Runtime](https://bun.sh/docs)
