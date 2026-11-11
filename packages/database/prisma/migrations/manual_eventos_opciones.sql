-- Eventos y reservas: opciones a elección dentro de cada paso del menú.
--
-- En un menú, cada paso puede ofrecer opciones para que elija el cliente:
-- "Plato principal: bife de chorizo o sorrentinos". Los ítems de un paso son
-- fijos o parte de un grupo de opciones: los que comparten paso y
-- "opcionGrupo" son alternativas entre sí; con "opcionGrupo" NULL, el ítem es
-- fijo. Un paso puede tener varios grupos y además ítems fijos.
--
-- El valor de carta y el costo de un grupo son los de la opción MÁS CARA
-- (con la cuenta de porciones aplicada a cada opción primero): se presupuesta
-- como si todos eligieran la más cara.
--
-- Cuántos eligen cada opción se carga por reserva cuando el cliente confirma
-- (como los regímenes), en reserva_menu_opciones. Si está cargado, la cocina
-- cuenta con eso; si no, el grupo sale como "a elegir" con el total de
-- personas. Las opciones se identifican por paso y nombre, no por id: el
-- editor reemplaza los ítems cada vez que se guarda el menú.
--
-- Los pasos quedan fijos y renombrados:
--   BIENVENIDA (era RECEPCION) · ENTRADA · PRINCIPAL · POSTRE · BEBIDA ·
--   EXTRA (era OTRO)
-- Las filas existentes se pasan con un UPDATE idempotente. Los presupuestos
-- ya emitidos no se tocan: guardan el título del paso como texto.
--
-- Idempotente: se puede correr dos veces. No borra datos.

BEGIN;

-- 1. Pasos renombrados ----------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evento_menu_items_paso_check' AND conrelid = 'evento_menu_items'::regclass) THEN
    ALTER TABLE evento_menu_items DROP CONSTRAINT evento_menu_items_paso_check;
  END IF;
END
$$;

UPDATE evento_menu_items SET paso = 'BIENVENIDA' WHERE paso = 'RECEPCION';
UPDATE evento_menu_items SET paso = 'EXTRA'      WHERE paso = 'OTRO';

ALTER TABLE evento_menu_items ADD CONSTRAINT evento_menu_items_paso_check
  CHECK (paso IN ('BIENVENIDA', 'ENTRADA', 'PRINCIPAL', 'POSTRE', 'BEBIDA', 'EXTRA'));

-- 2. Grupos de opciones ---------------------------------------------------------

ALTER TABLE evento_menu_items ADD COLUMN IF NOT EXISTS "opcionGrupo" smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evento_menu_items_opcion_check' AND conrelid = 'evento_menu_items'::regclass) THEN
    ALTER TABLE evento_menu_items ADD CONSTRAINT evento_menu_items_opcion_check CHECK ("opcionGrupo" IS NULL OR "opcionGrupo" > 0);
  END IF;
END
$$;

-- 3. Cuántos eligen cada opción, por reserva --------------------------------------

CREATE TABLE IF NOT EXISTS reserva_menu_opciones (
  "reservaId"  uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  paso         varchar(12) NOT NULL,
  -- El nombre del ítem tal como está en el menú de la reserva.
  nombre       varchar(200) NOT NULL,
  cantidad     integer NOT NULL,
  "updatedAt"  timestamptz(3) NOT NULL DEFAULT now(),

  PRIMARY KEY ("reservaId", paso, nombre),
  CONSTRAINT reserva_menu_opciones_cantidad_check CHECK (cantidad >= 0)
);

ALTER TABLE reserva_menu_opciones ENABLE ROW LEVEL SECURITY;

-- 4. Comentarios ----------------------------------------------------------------

COMMENT ON COLUMN evento_menu_items.paso IS 'BIENVENIDA | ENTRADA | PRINCIPAL | POSTRE | BEBIDA | EXTRA.';
COMMENT ON COLUMN evento_menu_items."opcionGrupo" IS 'NULL = ítem fijo. Los ítems del mismo paso y grupo son opciones a elección; se costean por la más cara.';
COMMENT ON TABLE reserva_menu_opciones IS 'Cuántas personas de la reserva eligen cada opción del menú (por paso y nombre del ítem). Opcional.';

COMMIT;
