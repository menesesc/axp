# Guía de despliegue del Worker en Dokploy

## Pre-requisitos
- Dokploy instalado y corriendo
- Repositorio GitHub con acceso configurado en Dokploy
- Directorios `/srv/webdav/data`, `/srv/webdav/processed`, `/srv/webdav/failed` existentes en el servidor

## Pasos para desplegar desde Dokploy

### 1. Crear un nuevo servicio en Dokploy

1. **Login a Dokploy**: Ve a `https://tu-servidor.com:3000`
2. **Crear nuevo proyecto** (si no existe):
   - Click en "Projects" → "New Project"
   - Nombre: `AXP Worker`
   - Descripción: `Document processing worker (watcher + processor)`

### 2. Agregar servicio desde Compose

1. **Dentro del proyecto**, click en "Add Service" → "Docker Compose"
2. **Configurar el servicio**:
   - **Name**: `axp-worker`
   - **Repository**: `https://github.com/menesesc/axp` (o tu repo)
   - **Branch**: `main`
   - **Compose File Path**: `apps/worker/docker-compose.prod.yml`
   - **Build Context**: `.` (root del repo, importante para monorepo)
   - **Auto Deploy**: ✅ Activado (opcional)

### 3. Configurar variables de entorno

En la sección **Environment Variables**, agregar:

```bash
# Database
DATABASE_URL=postgresql://postgres.tlpjwwhciilocxeebnmg:H7qEhDMUg0dEus3I@aws-1-us-east-1.pooler.supabase.com:5432/postgres

# Cloudflare R2
R2_ACCOUNT_ID=5befc49c2d4e0fd9f2082331c5e7ac61
R2_ACCESS_KEY_ID=aed1fd8d0ccea4dfe5cc85bebcc2fb9c
R2_SECRET_ACCESS_KEY=3d15f57cfd02a8898398bbeb8cd0de9649c114179e3c8acb57a74e19a1478a81

# Worker Config
WATCHER_POLL_INTERVAL=2000
PROCESSOR_POLL_INTERVAL=5000
MAX_CONCURRENT_JOBS=3
MAX_RETRY_ATTEMPTS=5
FILE_STABLE_CHECKS=3
```

⚠️ **IMPORTANTE**: Marca las credenciales como "Secret" para ocultarlas en la UI.

### 4. Deploy

1. Click en **"Deploy"**
2. Dokploy hará:
   - Clone del repositorio
   - Build de las imágenes
   - Creación de los contenedores (watcher + processor)
   - Montaje de volúmenes desde `/srv/webdav/`

### 5. Verificar estado

- **Logs**: Click en cada servicio (watcher/processor) para ver logs en tiempo real
- **Status**: Verificar que ambos contenedores estén "Running"
- **Resources**: Monitorear CPU/RAM

## Estructura de volúmenes

```
Servidor (host)          →  Contenedor (docker)
/srv/webdav/data         →  /data          (watcher: lectura/escritura)
/srv/webdav/processed    →  /processed     (ambos: lectura/escritura)
/srv/webdav/failed       →  /failed        (watcher: escritura)

Monorepo completo        →  /app           (ambos: solo lectura)
  ├── apps/worker/       →  /app/apps/worker/     (working_dir)
  ├── packages/database/ →  /app/packages/database/
  └── packages/shared/   →  /app/packages/shared/
```

**Nota:** El monorepo se monta completo para que Bun pueda resolver los workspaces (`database@workspace:*` y `shared@workspace:*`).

## Comandos útiles en Dokploy

- **Restart**: Click en el botón de restart del servicio
- **Rebuild**: Click en "Redeploy" para hacer pull + rebuild
- **Logs**: Ver logs en tiempo real desde la UI
- **Shell**: Acceder a la terminal del contenedor desde Dokploy

## Troubleshooting

### Problema: Contenedores no inician
- Verificar logs en Dokploy
- Verificar que los directorios `/srv/webdav/*` existan
- Verificar permisos de los directorios

### Problema: No detecta archivos
- Verificar que el escáner sube a `/srv/webdav/data`
- Verificar logs del watcher
- Verificar permisos de lectura en `/srv/webdav/data`

### Problema: No sube a R2
- Verificar credenciales R2 en variables de entorno
- Verificar logs del processor
- Verificar conectividad a internet del servidor

## Actualizar el código

1. **Push cambios a GitHub**
2. En Dokploy, click en **"Redeploy"**
3. Dokploy hará pull y reiniciará los contenedores automáticamente

## Monitoreo

Desde Dokploy puedes ver en tiempo real:
- ✅ Estado de cada contenedor
- ✅ Logs de watcher y processor
- ✅ Uso de recursos (CPU, RAM, disco)
- ✅ Restart automático si falla algún servicio
