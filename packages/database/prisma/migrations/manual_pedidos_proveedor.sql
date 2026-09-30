-- Etapa 4 de stock/pedidos: pedidos de compra a proveedores.
-- Un pedido enviado cuenta como "en camino" (suma al stock proyectado del
-- central) hasta que llega una factura de ese proveedor posterior al pedido,
-- se marca recibido/cancelado, o pasan 3 días de la fecha esperada.

CREATE TABLE IF NOT EXISTS "pedidos_proveedor" (
  "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
  "clienteId"     uuid NOT NULL,
  "numero"        serial NOT NULL,
  "proveedorId"   uuid NOT NULL,
  "estado"        varchar(12) NOT NULL DEFAULT 'enviado', -- 'enviado' | 'recibido' | 'cancelado'
  "fecha"         date NOT NULL,
  "fechaEsperada" date,
  "nota"          text,
  "creadoPor"     uuid,
  "createdAt"     timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pedidos_proveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedidos_proveedor_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pedidos_proveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId")
    REFERENCES "proveedores"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "pedidos_proveedor_clienteId_estado_idx" ON "pedidos_proveedor" ("clienteId", "estado");

CREATE TABLE IF NOT EXISTS "pedido_proveedor_items" (
  "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
  "pedidoId"       uuid NOT NULL,
  "insumoId"       uuid,
  "descripcion"    varchar(255) NOT NULL,   -- cómo se pide (texto de la última factura)
  "cantidad"       numeric(14,4) NOT NULL,  -- en la unidad de la factura
  "factorBase"     numeric(14,4) NOT NULL DEFAULT 1,
  "cantidadBase"   numeric(14,4) NOT NULL,  -- en la unidadBase del insumo
  "precioUnitario" numeric(14,2),           -- último precio conocido (referencia)
  CONSTRAINT "pedido_proveedor_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedido_proveedor_items_pedidoId_fkey" FOREIGN KEY ("pedidoId")
    REFERENCES "pedidos_proveedor"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pedido_proveedor_items_insumoId_fkey" FOREIGN KEY ("insumoId")
    REFERENCES "insumos"("id") ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "pedido_proveedor_items_pedidoId_idx" ON "pedido_proveedor_items" ("pedidoId");
