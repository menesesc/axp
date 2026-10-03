-- =====================================================================
-- Depósitos habilitados por usuario (alcance del conteo de stock)
--
-- Idempotente.
--
-- El permiso `conciliacion.stock` dice SI el usuario puede contar. Esto dice
-- CUÁLES depósitos: el de barra cuenta Barra y nada más.
--
-- Vacío = todos los depósitos, que es el comportamiento que había hasta ahora
-- y el que corresponde a un encargado. No se usa NULL para no tener que
-- distinguir "sin restricción" de "sin ninguno": sin ninguno no tendría
-- sentido, para eso se le saca el permiso de la sección.
-- =====================================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS depositos uuid[] NOT NULL DEFAULT '{}';
