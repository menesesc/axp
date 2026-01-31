# Campo Letra en Proveedores

## Descripción

Se agregó el campo `letra` a la tabla `proveedores` para establecer la letra de factura por defecto (A, B, C) que se debe utilizar para cada proveedor.

## Cambios Implementados

### 1. Migración de Base de Datos

**Archivo de migración**: `add_letra_to_proveedores`

```sql
ALTER TABLE proveedores 
ADD COLUMN letra VARCHAR(1) CHECK (letra IN ('A', 'B', 'C'));
```

**Características:**
- Tipo: `VARCHAR(1)` - Un solo carácter
- Nullable: `YES` - Puede ser NULL (opcional)
- Constraint: `CHECK (letra IN ('A', 'B', 'C'))` - Solo acepta valores A, B o C
- Por defecto: NULL (sin letra asignada)

### 2. Schema de Prisma Actualizado

**Archivo**: `apps/web/prisma/schema.prisma`

```prisma
model proveedores {
  id          String        @id @db.Uuid
  clienteId   String        @db.Uuid
  razonSocial String        @db.VarChar(255)
  cuit        String?       @db.VarChar(11)
  alias       Json          @default("[]")
  letra       String?       @db.VarChar(1)  // ← NUEVO CAMPO
  activo      Boolean       @default(true)
  createdAt   DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime      @db.Timestamptz(3)
  documentos  documentos[]
  pagos       pagos[]
  clientes    clientes      @relation(fields: [clienteId], references: [id], onDelete: Cascade)

  @@unique([clienteId, cuit])
  @@index([clienteId])
  @@index([clienteId, razonSocial])
}
```

### 3. Cliente Prisma Regenerado

```bash
bunx prisma generate
```

El cliente de Prisma se regeneró exitosamente para incluir el nuevo campo.

## Casos de Uso

### 1. Asignar Letra por Defecto al Crear Proveedor

```typescript
const proveedor = await prisma.proveedores.create({
  data: {
    clienteId: "...",
    razonSocial: "Proveedor S.A.",
    cuit: "20123456789",
    letra: "B", // Letra por defecto
    activo: true,
  }
});
```

### 2. Actualizar Letra de Proveedor Existente

```typescript
await prisma.proveedores.update({
  where: { id: proveedorId },
  data: { letra: "A" }
});
```

### 3. Consultar Proveedores con Letra Específica

```typescript
const proveedoresLetraB = await prisma.proveedores.findMany({
  where: {
    letra: "B",
    activo: true
  }
});
```

### 4. Usar Letra del Proveedor al Procesar Documento

```typescript
const proveedor = await prisma.proveedores.findUnique({
  where: { id: proveedorId },
  select: { letra: true }
});

// Si el documento no tiene letra, usar la del proveedor
const letraFinal = documento.letra || proveedor?.letra;
```

## Valores Permitidos

| Letra | Descripción |
|-------|-------------|
| `A` | Facturas A - Responsable Inscripto a Responsable Inscripto |
| `B` | Facturas B - Responsable Inscripto a Monotributista o Consumidor Final |
| `C` | Facturas C - Monotributista a cualquier tipo de cliente |
| `NULL` | Sin letra asignada por defecto |

## Integración con Workflow de Documentos

### Propósito

Este campo permite:

1. **Validación automática**: Verificar que los documentos procesados tienen la letra correcta según el proveedor
2. **Auto-asignación**: Si el OCR no detecta la letra, se puede usar la del proveedor
3. **Alertas**: Detectar discrepancias entre la letra del documento y la esperada del proveedor
4. **Filtrado**: Buscar documentos por letra de proveedor

### Ejemplo de Lógica de Validación

```typescript
async function validarLetraDocumento(documentoId: string) {
  const documento = await prisma.documentos.findUnique({
    where: { id: documentoId },
    include: { proveedores: { select: { letra: true } } }
  });

  if (!documento) return null;

  const letraDocumento = documento.letra;
  const letraProveedor = documento.proveedores?.letra;

  // Si el proveedor tiene letra asignada y no coincide
  if (letraProveedor && letraDocumento !== letraProveedor) {
    return {
      valid: false,
      warning: `Letra del documento (${letraDocumento}) no coincide con letra del proveedor (${letraProveedor})`
    };
  }

  // Si el documento no tiene letra pero el proveedor sí
  if (!letraDocumento && letraProveedor) {
    // Auto-asignar letra del proveedor
    await prisma.documentos.update({
      where: { id: documentoId },
      data: { letra: letraProveedor }
    });
    
    return {
      valid: true,
      info: `Letra ${letraProveedor} asignada automáticamente desde proveedor`
    };
  }

  return { valid: true };
}
```

## Próximos Pasos Sugeridos

1. **UI para Configurar Letra**: Agregar campo en el formulario de edición de proveedores
2. **Validación en Worker**: Integrar validación de letra en el proceso de OCR
3. **Reportes**: Incluir letra del proveedor en reportes y listados
4. **Migración de Datos**: Asignar letra a proveedores existentes basándose en documentos históricos

## Notas Técnicas

- ✅ Migración aplicada exitosamente
- ✅ Schema de Prisma actualizado
- ✅ Cliente de Prisma regenerado
- ✅ Constraint CHECK asegura valores válidos (A, B, C)
- ⚠️ Campo nullable - se debe validar en la aplicación si es requerido

## Verificación

Para verificar que el campo existe:

```sql
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'proveedores' AND column_name = 'letra';
```

**Resultado esperado:**
```
column_name | data_type          | character_maximum_length | is_nullable
------------+--------------------+-------------------------+-------------
letra       | character varying  | 1                       | YES
```
