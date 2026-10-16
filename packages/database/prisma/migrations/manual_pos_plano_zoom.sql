-- Zoom del plano de cada sector del salón.
-- 1 = el lienzo lógico de 1000 x 700. Menos de 1 aleja (entra más salón en la
-- pantalla, para salones grandes); más de 1 acerca. Es del plano, no de quien
-- lo mira: la caja, el mozo y el diseñador ven el mismo salón completo.
ALTER TABLE pos_sectores
  ADD COLUMN IF NOT EXISTS "planoZoom" real NOT NULL DEFAULT 1;

ALTER TABLE pos_sectores
  DROP CONSTRAINT IF EXISTS pos_sectores_plano_zoom_rango;
ALTER TABLE pos_sectores
  ADD CONSTRAINT pos_sectores_plano_zoom_rango CHECK ("planoZoom" BETWEEN 0.3 AND 1.5);
