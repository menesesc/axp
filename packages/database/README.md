# Database Package - AXP

Paquete que contiene la configuración de Prisma y el modelo de datos completo para AXP.

## Modelo de Datos

Sistema multi-tenant B2B para:
- ✅ Administración de clientes y usuarios
- ✅ Gestión de proveedores (consolidación OCR)
- ✅ Documentos (Facturas, Remitos, NC) con OCR
- ✅ Pagos multi-método con aplicación parcial
- ✅ Cola de ingesta (SFTP/Drive)
- ✅ Auditoría completa de revisiones

Ver **MODELO-JUSTIFICACION.md** para decisiones de arquitectura.

## Setup Inicial

### 1. Configurar conexión a Supabase

```bash
cp .env.example .env
```

Editar `.env` con tu connection string de Supabase:
```env
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT-REF.supabase.co:5432/postgres"
```

**Obtener URL desde**: Supabase Dashboard > Project Settings > Database > Connection String

- **Development**: Modo "Session" (puerto 5432)
- **Production**: Modo "Transaction" con pooling (puerto 6543)

### 2. Generar cliente Prisma

```bash
bun run db:generate
```

### 3. Push schema a Supabase

```bash
bun run db:push
```

O crear migración:
```bash
bun run db:migrate
```

### 4. Ejecutar SQL adicional en Supabase

Abrir **Supabase Dashboard > SQL Editor** y ejecutar el contenido de:
```
prisma/supabase-extra.sql
```

Este script crea:
- ✅ Extensión `pg_trgm` para búsqueda
- ✅ Índices GIN para superbuscador
- ✅ Constraint de rol usuario-cliente
- ✅ Views útiles (deuda por proveedor, etc.)

## Scripts

- `bun run db:generate` - Generar cliente Prisma
- `bun run db:push` - Push schema a DB (dev, sin migraciones)
- `bun run db:migrate` - Crear y aplicar migración
- `bun run db:studio` - Abrir Prisma Studio UI

## Estructura del Schema

```
📦 Multi-tenant
├─ Cliente (tenant root)
├─ Usuario (SUPERADMIN/ADMIN/USER)
└─ Proveedor (consolidación OCR)

📄 Documentos
├─ Documento (Factura/Remito/NC)
├─ DocumentoItem (detalle artículos)
└─ DocumentoRevision (auditoría)

💰 Pagos
├─ Pago (por proveedor)
├─ PagoMetodo (efectivo/transf/cheque)
└─ PagoDocumento (aplicación parcial)

🔄 Ingesta
└─ IngestQueue (cola worker)
```

## Uso en App

```typescript
import { prisma } from 'database';

// Multi-tenant query
const documentos = await prisma.documento.findMany({
  where: {
    clienteId: 'uuid-del-cliente',
    estadoRevision: 'PENDIENTE'
  },
  include: {
    proveedor: true,
    items: true
  }
});

// Búsqueda con pg_trgm (tolerante a typos)
const proveedores = await prisma.$queryRaw`
  SELECT * FROM proveedores 
  WHERE cliente_id = ${clienteId}
  AND razon_social % ${searchTerm}  -- % es operador similarity
  ORDER BY similarity(razon_social, ${searchTerm}) DESC
  LIMIT 10
`;

// Deuda por proveedor (usando view)
const deudas = await prisma.$queryRaw`
  SELECT * FROM v_deuda_por_proveedor
  WHERE cliente_id = ${clienteId}
`;
```

## Idempotencia

- **Documentos**: `unique(clienteId, hashSha256)` - evita duplicados de PDFs
- **IngestQueue**: `unique(clienteId, source, sourceRef)` - evita reprocesar mismo archivo

## Auditoría

Todos los cambios humanos quedan en `documento_revisiones`:
```typescript
await prisma.documentoRevision.create({
  data: {
    documentoId: doc.id,
    usuarioId: user.id,
    accion: 'SET_FIELD',
    path: 'total',
    before: { value: 1000 },
    after: { value: 10000 }
  }
});
```

## Búsqueda (Superbuscador)

Índices GIN/trgm habilitados en:
- `proveedores.razon_social` - "acme" encuentra "ACME S.A."
- `documentos.numero_completo` - "0001-00000123"
- `documento_items.descripcion` - búsqueda en artículos

Ejemplo de búsqueda fuzzy:
```typescript
const items = await prisma.$queryRaw`
  SELECT * FROM documento_items
  WHERE descripcion % ${searchTerm}
  ORDER BY similarity(descripcion, ${searchTerm}) DESC
  LIMIT 20
`;
```

## Migraciones vs Push

- **Development**: `bun run db:push` (rápido, sin historial)
- **Production**: `bun run db:migrate` (con historial y rollback)

## Prisma Studio

Interfaz visual para explorar datos:
```bash
bun run db:studio
```

Abre en: http://localhost:5555

## Notas Importantes

- ✅ Schema ya está production-ready
- ✅ Todos los timestamps en UTC (`@db.Timestamptz`)
- ✅ Dinero en `numeric(14,2)` (precisión exacta)
- ✅ UUIDs como PKs
- ✅ Índices compuestos para performance
- ✅ Constraint manual en `supabase-extra.sql`
