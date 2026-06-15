-- Conteos físicos de stock por insumo (inventario), en la unidadBase del insumo.
-- Permite separar la variación de inventario de la merma real en la conciliación:
-- entre dos conteos consecutivos, merma_real = (stock_ini + comprado) - consumo - stock_fin.
-- Tabla nueva, no afecta datos existentes.
CREATE TABLE IF NOT EXISTS "insumo_stock" (
  "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
  "insumoId"  uuid NOT NULL,
  "fecha"     date NOT NULL,
  "cantidad"  numeric(14,4) NOT NULL,
  "nota"      text,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "insumo_stock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "insumo_stock_insumoId_fkey" FOREIGN KEY ("insumoId")
    REFERENCES "insumos"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "insumo_stock_insumoId_fecha_key" ON "insumo_stock" ("insumoId", "fecha");
CREATE INDEX IF NOT EXISTS "insumo_stock_insumoId_fecha_idx" ON "insumo_stock" ("insumoId", "fecha");
