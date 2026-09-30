-- Etapa 1 de stock/pedidos:
--   1) Proveedores: 3 contactos (2 de pedidos + administración) y días de entrega.
--   2) Categorías de compra (carnes, lácteos, almacén…) y la asignación de cada
--      descripción de item de factura a una categoría (por IA o manual).
-- Solo agrega columnas/tablas. `proveedores.telefono` queda como legado y su
-- valor se copia a Pedidos 1.

-- 1) Contactos del proveedor --------------------------------------------------
ALTER TABLE "proveedores"
  ADD COLUMN IF NOT EXISTS "pedidos1Nombre"   varchar(100),
  ADD COLUMN IF NOT EXISTS "pedidos1Telefono" varchar(30),
  ADD COLUMN IF NOT EXISTS "pedidos2Nombre"   varchar(100),
  ADD COLUMN IF NOT EXISTS "pedidos2Telefono" varchar(30),
  ADD COLUMN IF NOT EXISTS "adminNombre"      varchar(100),
  ADD COLUMN IF NOT EXISTS "adminTelefono"    varchar(30),
  ADD COLUMN IF NOT EXISTS "diasEntrega"      integer;

UPDATE "proveedores"
   SET "pedidos1Telefono" = "telefono"
 WHERE "telefono" IS NOT NULL AND btrim("telefono") <> '' AND "pedidos1Telefono" IS NULL;

-- 2) Categorías de compra -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "compra_categorias" (
  "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
  "clienteId" uuid NOT NULL,
  "nombre"    varchar(60) NOT NULL,
  "orden"     integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compra_categorias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compra_categorias_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "compra_categorias_clienteId_nombre_key"
  ON "compra_categorias" ("clienteId", "nombre");

-- Una fila por descripción normalizada (lower + trim + espacios colapsados):
-- todas las líneas de factura con el mismo texto comparten categoría.
CREATE TABLE IF NOT EXISTS "compra_item_categoria" (
  "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
  "clienteId"       uuid NOT NULL,
  "descripcionNorm" varchar(500) NOT NULL,
  "categoriaId"     uuid NOT NULL,
  "fuente"          varchar(10) NOT NULL DEFAULT 'ia', -- 'ia' | 'manual'
  "createdAt"       timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compra_item_categoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compra_item_categoria_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "compra_item_categoria_categoriaId_fkey" FOREIGN KEY ("categoriaId")
    REFERENCES "compra_categorias"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "compra_item_categoria_clienteId_descripcionNorm_key"
  ON "compra_item_categoria" ("clienteId", "descripcionNorm");
CREATE INDEX IF NOT EXISTS "compra_item_categoria_categoriaId_idx"
  ON "compra_item_categoria" ("categoriaId");

-- Categorías iniciales para cada cliente existente (editables desde la UI).
INSERT INTO "compra_categorias" ("clienteId", "nombre", "orden")
SELECT c.id, v.nombre, v.orden
  FROM "clientes" c
 CROSS JOIN (VALUES
   ('Carnes', 10), ('Aves', 20), ('Pescados y mariscos', 30), ('Fiambres', 40),
   ('Lácteos y quesos', 50), ('Verduras y frutas', 60), ('Almacén', 70),
   ('Panificados y pastas', 80), ('Congelados', 90), ('Bebidas', 100),
   ('Vinos', 110), ('Cervezas', 120), ('Limpieza', 130), ('Descartables', 140),
   ('Mantenimiento', 150), ('Bazar y vajilla', 155), ('Indumentaria y blanquería', 160), ('Servicios', 170),
   ('Otros', 999)
 ) AS v(nombre, orden)
ON CONFLICT ("clienteId", "nombre") DO NOTHING;
