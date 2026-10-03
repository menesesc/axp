-- =====================================================================
-- Subcategoría opcional del insumo
--
-- Idempotente.
--
-- `insumos.categoria` agrupa la planilla de stock (VINOS, BEBIDAS S/A…).
-- Con 117 vinos en un solo grupo eso sigue siendo mucho para recorrer
-- contando, así que se agrega un segundo nivel opcional: la bodega dentro de
-- vinos, el proveedor dentro de bebidas, la heladera dentro de cocina.
--
-- Es opcional a propósito: un insumo sin subcategoría cuelga directo de su
-- categoría, no se inventa un grupo "Sin subcategoría" que agregaría un nivel
-- vacío a todo lo que no lo necesita.
-- =====================================================================

ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS subcategoria varchar(100);

-- Para el desplegable de subcategorías ya usadas dentro de una categoría.
CREATE INDEX IF NOT EXISTS "insumos_clienteId_categoria_subcategoria_idx"
  ON insumos ("clienteId", categoria, subcategoria);
