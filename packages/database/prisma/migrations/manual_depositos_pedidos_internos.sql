-- Etapa 3 de stock/pedidos: depósitos, stock por depósito y pedidos internos.
--   - depositos: uno central (recibe las compras) + los que piden al central.
--   - sales_product_master.depositoId: depósito de salida por defecto de cada
--     producto vendido (null = sale del central).
--   - insumo_stock pasa a ser por depósito (los conteos existentes van al central).
--   - insumo_deposito: stock seguro de cada insumo en cada depósito.
--   - pedidos_internos (+ items): pedido de un depósito al central; el central
--     registra lo enviado, que mueve stock central → destino.
--   - pedido_plantillas (+ items): pedidos tipo para lo que no sale de recetas.

CREATE TABLE IF NOT EXISTS "depositos" (
  "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
  "clienteId" uuid NOT NULL,
  "nombre"    varchar(60) NOT NULL,
  "esCentral" boolean NOT NULL DEFAULT false,
  "orden"     integer NOT NULL DEFAULT 0,
  "activo"    boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "depositos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "depositos_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "depositos_clienteId_nombre_key" ON "depositos" ("clienteId", "nombre");
-- Un solo central por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS "depositos_un_central" ON "depositos" ("clienteId") WHERE "esCentral";

INSERT INTO "depositos" ("clienteId", "nombre", "esCentral", "orden")
SELECT c.id, v.nombre, v.central, v.orden
  FROM "clientes" c
 CROSS JOIN (VALUES ('Depósito', true, 10), ('Cocina', false, 20), ('Barra', false, 30), ('Salón', false, 40))
   AS v(nombre, central, orden)
ON CONFLICT ("clienteId", "nombre") DO NOTHING;

-- Depósito de salida por producto vendido.
ALTER TABLE "sales_product_master" ADD COLUMN IF NOT EXISTS "depositoId" uuid;
DO $$ BEGIN
  ALTER TABLE "sales_product_master" ADD CONSTRAINT "sales_product_master_depositoId_fkey"
    FOREIGN KEY ("depositoId") REFERENCES "depositos"("id") ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Conteos por depósito: los existentes pasan al central.
ALTER TABLE "insumo_stock" ADD COLUMN IF NOT EXISTS "depositoId" uuid;
UPDATE "insumo_stock" s
   SET "depositoId" = d.id
  FROM "insumos" i, "depositos" d
 WHERE i.id = s."insumoId" AND d."clienteId" = i."clienteId" AND d."esCentral" AND s."depositoId" IS NULL;
ALTER TABLE "insumo_stock" ALTER COLUMN "depositoId" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "insumo_stock" ADD CONSTRAINT "insumo_stock_depositoId_fkey"
    FOREIGN KEY ("depositoId") REFERENCES "depositos"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP INDEX IF EXISTS "insumo_stock_insumoId_fecha_key";
CREATE UNIQUE INDEX IF NOT EXISTS "insumo_stock_insumoId_depositoId_fecha_key"
  ON "insumo_stock" ("insumoId", "depositoId", "fecha");

-- Stock seguro por insumo y depósito.
CREATE TABLE IF NOT EXISTS "insumo_deposito" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "insumoId"    uuid NOT NULL,
  "depositoId"  uuid NOT NULL,
  "stockSeguro" numeric(14,4),
  CONSTRAINT "insumo_deposito_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "insumo_deposito_insumoId_fkey" FOREIGN KEY ("insumoId")
    REFERENCES "insumos"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "insumo_deposito_depositoId_fkey" FOREIGN KEY ("depositoId")
    REFERENCES "depositos"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "insumo_deposito_insumoId_depositoId_key"
  ON "insumo_deposito" ("insumoId", "depositoId");

-- Pedidos internos.
CREATE TABLE IF NOT EXISTS "pedidos_internos" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "clienteId"   uuid NOT NULL,
  "numero"      serial NOT NULL,
  "origenId"    uuid NOT NULL,              -- depósito que despacha (central)
  "destinoId"   uuid NOT NULL,              -- depósito que pide
  "fechaVentas" date,                       -- día de ventas que cubre (si aplica)
  "origen"      varchar(10) NOT NULL,       -- 'ventas' | 'manual'
  "estado"      varchar(12) NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'enviado' | 'cancelado'
  "nota"        text,
  "creadoPor"   uuid,
  "enviadoPor"  uuid,
  "fechaEnvio"  date,                       -- día en que el stock sale del central
  "enviadoAt"   timestamptz(3),
  "createdAt"   timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pedidos_internos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedidos_internos_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pedidos_internos_origenId_fkey" FOREIGN KEY ("origenId")
    REFERENCES "depositos"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "pedidos_internos_destinoId_fkey" FOREIGN KEY ("destinoId")
    REFERENCES "depositos"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "pedidos_internos_clienteId_estado_idx" ON "pedidos_internos" ("clienteId", "estado");
CREATE INDEX IF NOT EXISTS "pedidos_internos_origenId_fechaEnvio_idx" ON "pedidos_internos" ("origenId", "fechaEnvio");
CREATE INDEX IF NOT EXISTS "pedidos_internos_destinoId_fechaEnvio_idx" ON "pedidos_internos" ("destinoId", "fechaEnvio");
-- Un único pedido automático por depósito y día de ventas.
CREATE UNIQUE INDEX IF NOT EXISTS "pedidos_internos_ventas_key"
  ON "pedidos_internos" ("destinoId", "fechaVentas") WHERE "origen" = 'ventas';

CREATE TABLE IF NOT EXISTS "pedido_interno_items" (
  "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
  "pedidoId"         uuid NOT NULL,
  "insumoId"         uuid NOT NULL,
  "cantidadVendida"  numeric(14,4),           -- consumo por ventas del día (referencia)
  "cantidadPedida"   numeric(14,4) NOT NULL,
  "cantidadEnviada"  numeric(14,4),           -- lo que efectivamente despachó el central
  "manual"           boolean NOT NULL DEFAULT false, -- editada/agregada a mano: la sync de ventas no la pisa
  CONSTRAINT "pedido_interno_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedido_interno_items_pedidoId_fkey" FOREIGN KEY ("pedidoId")
    REFERENCES "pedidos_internos"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pedido_interno_items_insumoId_fkey" FOREIGN KEY ("insumoId")
    REFERENCES "insumos"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "pedido_interno_items_pedidoId_insumoId_key"
  ON "pedido_interno_items" ("pedidoId", "insumoId");

-- Plantillas de pedido.
CREATE TABLE IF NOT EXISTS "pedido_plantillas" (
  "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
  "clienteId" uuid NOT NULL,
  "nombre"    varchar(80) NOT NULL,
  "destinoId" uuid,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pedido_plantillas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedido_plantillas_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pedido_plantillas_destinoId_fkey" FOREIGN KEY ("destinoId")
    REFERENCES "depositos"("id") ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pedido_plantillas_clienteId_nombre_key" ON "pedido_plantillas" ("clienteId", "nombre");

CREATE TABLE IF NOT EXISTS "pedido_plantilla_items" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "plantillaId" uuid NOT NULL,
  "insumoId"    uuid NOT NULL,
  "cantidad"    numeric(14,4) NOT NULL,
  CONSTRAINT "pedido_plantilla_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedido_plantilla_items_plantillaId_fkey" FOREIGN KEY ("plantillaId")
    REFERENCES "pedido_plantillas"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pedido_plantilla_items_insumoId_fkey" FOREIGN KEY ("insumoId")
    REFERENCES "insumos"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "pedido_plantilla_items_plantillaId_insumoId_key"
  ON "pedido_plantilla_items" ("plantillaId", "insumoId");
