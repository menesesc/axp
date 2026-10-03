-- =====================================================================
-- Venta directa (productos 1 a 1) + signo de las notas de crédito
--
-- Idempotente: se puede correr varias veces.
--
-- 1. insumos."productMasterId": marca un insumo que ES un producto vendido,
--    sin receta de por medio. Para lo que se compra y se vende en la misma
--    unidad (un vino embotellado, una lata de gaseosa) no hace falta una
--    receta de 1 unidad: el consumo son las unidades vendidas.
--
-- 2. Dos vistas que centralizan las dos mitades de la conciliación, que hasta
--    ahora estaban repetidas en ~9 consultas cada una:
--      - insumo_consumo_linea: consumo teórico (recetas UNION venta directa)
--      - insumo_compra_linea:  ingresos de compra, con el signo correcto
--
--    La segunda arregla de paso que una NOTA DE CRÉDITO venía SUMANDO stock
--    en vez de restarlo: ninguna consulta miraba `documentos.tipo`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vínculo insumo → producto vendido
-- ---------------------------------------------------------------------

ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS "productMasterId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insumos_productMasterId_fkey'
  ) THEN
    ALTER TABLE insumos
      ADD CONSTRAINT "insumos_productMasterId_fkey"
      FOREIGN KEY ("productMasterId") REFERENCES sales_product_master(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Un producto no puede estar atado a dos insumos (los NULL no colisionan).
CREATE UNIQUE INDEX IF NOT EXISTS "insumos_productMasterId_key"
  ON insumos ("productMasterId")
  WHERE "productMasterId" IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2a. Consumo teórico por línea de cierre
--
--     Rama (a): productos con receta activa, como hasta ahora.
--     Rama (b): venta directa 1 a 1, una unidad de insumo por unidad vendida.
--
--     La rama (b) excluye los productos que tienen receta activa: si alguien
--     carga una receta sobre un producto marcado como venta directa, gana la
--     receta. Eso es lo que permite marcar un rubro entero sin romper nada —
--     un vino bag in box que se sirve por copa ya tiene receta, así que queda
--     afuera solo, sin excepción manual.
--
--     `deposito_id` va crudo (puede ser NULL = sale del central); el que
--     consulta hace el COALESCE porque el id del central es dato, no esquema.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW insumo_consumo_linea AS
  SELECT
    c."clienteId"                                                      AS cliente_id,
    c.fecha                                                            AS fecha,
    c.sucursal                                                         AS sucursal,
    pm.id                                                              AS product_master_id,
    pm."depositoId"                                                    AS deposito_id,
    ri."insumoId"                                                      AS insumo_id,
    ri.unidad                                                          AS unidad,
    (ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty,
    false                                                              AS venta_directa
  FROM sales_closure_items ci
  JOIN sales_closures       c  ON c.id = ci."closureId"
  JOIN sales_product_master pm ON pm.id = ci."productMasterId"
  JOIN sales_recipes        r  ON r."productMasterId" = pm.id AND r.activa = true
  JOIN sales_recipe_items   ri ON ri."recipeId" = r.id AND ri."insumoId" IS NOT NULL

  UNION ALL

  SELECT
    c."clienteId",
    c.fecha,
    c.sucursal,
    pm.id,
    pm."depositoId",
    i.id,
    i."unidadBase",
    ci.unidades::numeric,
    true
  FROM sales_closure_items ci
  JOIN sales_closures       c  ON c.id = ci."closureId"
  JOIN sales_product_master pm ON pm.id = ci."productMasterId"
  JOIN insumos              i  ON i."productMasterId" = pm.id
                              AND i.activo = true
                              AND i."clienteId" = c."clienteId"
  WHERE NOT EXISTS (
    SELECT 1 FROM sales_recipes r
     WHERE r."productMasterId" = pm.id AND r.activa = true
  );

-- ---------------------------------------------------------------------
-- 2b. Ingresos de compra por línea de documento
--
--     Una nota de crédito es una devolución: mercadería que sale y plata que
--     vuelve. Antes ninguna consulta miraba el tipo, así que una NC inflaba el
--     stock y abarataba el costo.
--
--     OJO con cómo se corrige. Los datos guardan el signo de forma
--     inconsistente, según cómo venga cada proveedor y cómo lo haya leído el
--     OCR: sobre 92 líneas de NC hay 62 con cantidad positiva y subtotal
--     negativo, 28 con las dos negativas y 2 con las dos positivas. Multiplicar
--     por -1 arregla unas y rompe otras — en las 28 que ya venían negativas, la
--     devolución volvería a sumar.
--
--     Por eso no se invierte el signo: se FUERZA el negativo con -abs(). Queda
--     bien venga como venga, y es idempotente si algún día se normaliza la
--     carga. `precio_unitario` va con abs(): es un precio, no un flujo, y se
--     mantiene positivo. El costo por unidad base (subtotal/qty_base) también
--     queda positivo, porque se cancelan los dos signos.
--
--     No se filtra por estadoRevision: eso lo decide cada consulta, que para
--     stock usa ESTADOS_COMPRA (CONFIRMADO, PAGADO).
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW insumo_compra_linea AS
  SELECT
    d."clienteId"                            AS cliente_id,
    d.id                                     AS documento_id,
    d."proveedorId"                          AS proveedor_id,
    d.tipo                                   AS tipo,
    d."estadoRevision"                       AS estado_revision,
    d."fechaEmision"                         AS fecha,
    di.id                                    AS documento_item_id,
    di.linea                                 AS linea,
    di.descripcion                           AS descripcion,
    di.unidad                                AS unidad_factura,
    a."insumoId"                             AS insumo_id,
    a."factorBase"                           AS factor_base,
    sg.signo                                     AS signo,
    sg.cantidad                                  AS cantidad,
    (sg.cantidad * a."factorBase")               AS qty_base,
    sg.subtotal                                  AS subtotal,
    abs(di."precioUnitario")::numeric(14,2)      AS precio_unitario
  FROM documento_items di
  JOIN documentos   d ON d.id = di."documentoId"
  JOIN insumo_alias a ON di.descripcion ILIKE '%' || a.patron || '%'
  JOIN insumos      i ON i.id = a."insumoId" AND i."clienteId" = d."clienteId"
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -1 ELSE 1 END AS signo,
      CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -abs(di.cantidad) ELSE di.cantidad END AS cantidad,
      CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -abs(di.subtotal) ELSE di.subtotal END AS subtotal
  ) sg;
