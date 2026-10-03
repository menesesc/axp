-- =====================================================================
-- CUITs adicionales del cliente
--
-- Idempotente.
--
-- El grupo factura bajo más de una razón social. Hoy el validador compara el
-- CUIT receptor contra un único `clientes.cuit`, así que una factura dirigida
-- a otra entidad del mismo grupo queda PENDIENTE para siempre aunque sea
-- correcta. Vistos en producción:
--
--   30719234609  WALPINA S.A.C. DE BARILOCHE
--   30719236852  RESTAURANTE FAMILIA WEISS
--
-- `cuitsAdicionales` son los CUITs que también cuentan como "nosotros". El
-- principal sigue siendo `cuit`: este array no lo reemplaza, lo extiende.
-- =====================================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS "cuitsAdicionales" text[] NOT NULL DEFAULT '{}';
