-- Eventos y reservas: etapa 2 (menús, regímenes, adicionales y presupuesto).
--
-- Lo que se busca con el presupuesto es llegar a UN precio por cubierto, y
-- que el sistema ayude a decidirlo comparándolo con lo que valdrían las
-- mismas cosas a precio de carta: si el número queda abajo es un precio
-- especial, si queda arriba es un sobreprecio. Para eso el menú tiene que
-- saber de qué productos del POS sale cada cosa y cómo rinde: no es lo mismo
-- un plato por persona que una picada para cuatro o media botella de vino
-- por cabeza.
--
--   MENÚ       una lista de ítems agrupados por paso (recepción, entrada,
--              principal, postre, bebida). Hay plantillas (la biblioteca de
--              menús fijos de la casa) y copias: al asignar un menú a un
--              evento, una reserva o un régimen se copia entero, para que
--              tocar la plantilla después no cambie lo que ya se presupuestó.
--              "Actualizar desde plantilla" es un botón, no algo que pase solo.
--   ADICIONAL  lo que se suma a mano (show de tango, DJ, copa de bienvenida):
--              por persona o monto fijo, y lo paga el titular (entra en la
--              cuenta de la reserva) o cada pasajero por su lado (sale en el
--              presupuesto como informativo y NO suma).
--   VERSIÓN    cada presupuesto que se genera queda congelado (v1, v2…) con
--              exactamente lo que se cotizó. No se modifica nunca.
--
-- Los menores comen del mismo menú: cada ítem dice si es para todos, sólo
-- adultos (el vino) o sólo menores (el plato infantil). Los liberados comen
-- como adultos; los bebés no cuentan.
--
-- Puramente aditiva: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- constraints nuevas sólo si no existen y la vista reemplazada con las mismas
-- columnas en el mismo orden (las nuevas van al final). Se puede correr dos
-- veces. Requiere manual_eventos.sql (etapa 1) y el catálogo del POS.

BEGIN;

-- 1. Configuración del presupuesto --------------------------------------------
--
-- La razón social de `clientes` no es el nombre con el que la casa se
-- presenta ("Familia Weiss", no "WALPINA S.A.C."). El pie es lo que va al
-- final de todos los presupuestos: formas de pago, qué incluye, política de
-- cancelación.

ALTER TABLE evento_configuracion ADD COLUMN IF NOT EXISTS "nombreCasa"             varchar(120);
ALTER TABLE evento_configuracion ADD COLUMN IF NOT EXISTS "presupuestoPie"         text;
ALTER TABLE evento_configuracion ADD COLUMN IF NOT EXISTS "presupuestoValidezDias" smallint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evento_configuracion_validez_check') THEN
    ALTER TABLE evento_configuracion ADD CONSTRAINT evento_configuracion_validez_check
      CHECK ("presupuestoValidezDias" IS NULL OR "presupuestoValidezDias" BETWEEN 1 AND 365);
  END IF;
END $$;

-- 2. Menús ---------------------------------------------------------------------
--
-- Plantilla y copia viven en la misma tabla: el editor es el mismo, el
-- cálculo es el mismo y "guardar como plantilla" un menú retocado para un
-- casamiento es copiar una fila. Lo que las distingue es el dueño: la copia
-- es de un evento o de una reserva (y se borra con él); la plantilla no
-- tiene dueño.

CREATE TABLE IF NOT EXISTS evento_menus (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"          uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre               varchar(120) NOT NULL,
  descripcion          text,
  plantilla            boolean NOT NULL DEFAULT true,
  -- De qué plantilla salió la copia. Es lo que habilita "actualizar desde
  -- plantilla"; si la plantilla se borra, la copia sigue igual.
  "plantillaId"        uuid REFERENCES evento_menus(id) ON DELETE SET NULL,
  "eventoId"           uuid REFERENCES eventos(id) ON DELETE CASCADE,
  "reservaId"          uuid REFERENCES reservas(id) ON DELETE CASCADE,
  -- Para cuántas personas se calcula el valor de carta por cubierto de una
  -- plantilla o del menú de un evento: con una picada para 4 no da lo mismo
  -- un grupo de 6 que uno de 8. En una reserva se usa el grupo real.
  "personasReferencia" smallint NOT NULL DEFAULT 10,
  activo               boolean NOT NULL DEFAULT true,
  -- Cuándo se copió (o actualizó) desde la plantilla.
  "copiadoAt"          timestamptz(3),
  "createdById"        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "updatedById"        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"          timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_menus_dueno_check CHECK (
    plantilla = ("eventoId" IS NULL AND "reservaId" IS NULL)
    AND NOT ("eventoId" IS NOT NULL AND "reservaId" IS NOT NULL)),
  CONSTRAINT evento_menus_referencia_check CHECK ("personasReferencia" BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS evento_menus_cliente_idx ON evento_menus ("clienteId", plantilla, activo, nombre);
CREATE INDEX IF NOT EXISTS evento_menus_evento_idx ON evento_menus ("eventoId") WHERE "eventoId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS evento_menus_reserva_idx ON evento_menus ("reservaId") WHERE "reservaId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS evento_menus_plantilla_idx ON evento_menus ("plantillaId") WHERE "plantillaId" IS NOT NULL;

-- Cada ítem es un producto del POS (con su precio de carta vigente) o una
-- línea a mano con un precio de carta equivalente, para los menús especiales
-- que no están en la carta.
--
-- Rendimiento:
--   PERSONA     cantidad por persona: 1 plato, 0,5 botella. Unidades =
--               redondeo hacia arriba de personas × cantidad.
--   COMPARTIDO  una unidad cada N personas: "picada para 4". Unidades =
--               techo(personas / N) × cantidad.
CREATE TABLE IF NOT EXISTS evento_menu_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "menuId"            uuid NOT NULL REFERENCES evento_menus(id) ON DELETE CASCADE,
  paso                varchar(12) NOT NULL DEFAULT 'PRINCIPAL',
  orden               integer NOT NULL DEFAULT 0,
  "productoId"        uuid REFERENCES pos_productos(id) ON DELETE SET NULL,
  -- Congelado al elegir el producto: el presupuesto dice lo que se ofreció
  -- aunque en el POS le cambien el nombre.
  nombre              varchar(200) NOT NULL,
  descripcion         varchar(300),
  modo                varchar(12) NOT NULL DEFAULT 'PERSONA',
  cantidad            numeric(8,3) NOT NULL DEFAULT 1,
  "personasPorUnidad" smallint,
  -- "botella", "copa", "picada": sólo para el texto ("½ botella por persona").
  unidad              varchar(30),
  aplica              varchar(8) NOT NULL DEFAULT 'TODOS',
  -- Precio de carta equivalente. NULL en un producto del POS = su precio
  -- vigente (lo que se compara es contra la carta de hoy); con valor, pisa.
  "precioCarta"       numeric(14,2),

  CONSTRAINT evento_menu_items_paso_check
    CHECK (paso IN ('RECEPCION', 'ENTRADA', 'PRINCIPAL', 'POSTRE', 'BEBIDA', 'OTRO')),
  CONSTRAINT evento_menu_items_modo_check CHECK (modo IN ('PERSONA', 'COMPARTIDO')),
  CONSTRAINT evento_menu_items_cantidad_check CHECK (cantidad > 0),
  CONSTRAINT evento_menu_items_compartido_check
    CHECK (modo = 'PERSONA' OR ("personasPorUnidad" IS NOT NULL AND "personasPorUnidad" >= 2)),
  CONSTRAINT evento_menu_items_aplica_check CHECK (aplica IN ('TODOS', 'ADULTOS', 'MENORES')),
  CONSTRAINT evento_menu_items_precio_check CHECK ("precioCarta" IS NULL OR "precioCarta" >= 0)
);

CREATE INDEX IF NOT EXISTS evento_menu_items_menu_idx ON evento_menu_items ("menuId", paso, orden);
CREATE INDEX IF NOT EXISTS evento_menu_items_producto_idx ON evento_menu_items ("productoId") WHERE "productoId" IS NOT NULL;

-- Los "menuId" que la etapa 1 dejó vacíos ahora apuntan a algo. Todos están
-- en NULL, así que la constraint entra sin revisar datos.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_menuId_fkey') THEN
    ALTER TABLE eventos ADD CONSTRAINT "eventos_menuId_fkey"
      FOREIGN KEY ("menuId") REFERENCES evento_menus(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_menuId_fkey') THEN
    ALTER TABLE reservas ADD CONSTRAINT "reservas_menuId_fkey"
      FOREIGN KEY ("menuId") REFERENCES evento_menus(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reserva_regimenes_menuId_fkey') THEN
    ALTER TABLE reserva_regimenes ADD CONSTRAINT "reserva_regimenes_menuId_fkey"
      FOREIGN KEY ("menuId") REFERENCES evento_menus(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Regímenes del evento --------------------------------------------------------
--
-- El menú alternativo (o la indicación) de cada régimen para todo el evento:
-- con cien reservas del 31/12, el menú celíaco se define una vez. La reserva
-- lo hereda y puede tener el suyo en reserva_regimenes."menuId".

CREATE TABLE IF NOT EXISTS evento_regimen_menus (
  "eventoId" uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  tipo       varchar(12) NOT NULL,
  "menuId"   uuid REFERENCES evento_menus(id) ON DELETE SET NULL,
  nota       varchar(300),
  PRIMARY KEY ("eventoId", tipo),

  CONSTRAINT evento_regimen_menus_tipo_check
    CHECK (tipo IN ('CELIACO', 'VEGETARIANO', 'VEGANO', 'SIN_LACTOSA', 'ALERGIA', 'OTRO'))
);

-- 4. Adicionales -----------------------------------------------------------------
--
-- Sin catálogo fijo: se cargan a mano y la pantalla sugiere los que ya se
-- usaron. Pueden ser del evento (los heredan todas sus reservas, como la copa
-- de bienvenida) o de una reserva.
--
-- Cantidad: en PERSONA, NULL = las personas de la reserva a las que aplica
-- (adultos, menores o ambos; los liberados y los bebés no pagan); en FIJO,
-- NULL = 1.

CREATE TABLE IF NOT EXISTS evento_adicionales (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"       uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  "eventoId"        uuid REFERENCES eventos(id) ON DELETE CASCADE,
  "reservaId"       uuid REFERENCES reservas(id) ON DELETE CASCADE,
  descripcion       varchar(160) NOT NULL,
  modalidad         varchar(8) NOT NULL DEFAULT 'PERSONA',
  aplica            varchar(8) NOT NULL DEFAULT 'TODOS',
  cantidad          numeric(10,2),
  "precioUnitario"  numeric(14,2) NOT NULL DEFAULT 0,
  --   TITULAR   entra en la cuenta de la reserva (neto, IVA, total, saldo)
  --   PASAJERO  lo paga cada uno en el momento: informativo, no suma
  paga              varchar(8) NOT NULL DEFAULT 'TITULAR',
  nota              varchar(200),
  orden             integer NOT NULL DEFAULT 0,
  "createdAt"       timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_adicionales_dueno_check CHECK (("eventoId" IS NULL) <> ("reservaId" IS NULL)),
  CONSTRAINT evento_adicionales_modalidad_check CHECK (modalidad IN ('PERSONA', 'FIJO')),
  CONSTRAINT evento_adicionales_aplica_check CHECK (aplica IN ('TODOS', 'ADULTOS', 'MENORES')),
  CONSTRAINT evento_adicionales_paga_check CHECK (paga IN ('TITULAR', 'PASAJERO')),
  CONSTRAINT evento_adicionales_cantidad_check CHECK (cantidad IS NULL OR cantidad > 0),
  CONSTRAINT evento_adicionales_precio_check CHECK ("precioUnitario" >= 0)
);

CREATE INDEX IF NOT EXISTS evento_adicionales_evento_idx ON evento_adicionales ("eventoId") WHERE "eventoId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS evento_adicionales_reserva_idx ON evento_adicionales ("reservaId") WHERE "reservaId" IS NOT NULL;
-- Para sugerir descripciones ya usadas.
CREATE INDEX IF NOT EXISTS evento_adicionales_cliente_idx ON evento_adicionales ("clienteId", descripcion);

-- 5. Versiones del presupuesto -----------------------------------------------
--
-- Una foto de lo que se mandó. `datos` es el presupuesto entero tal como se
-- mostró (menú, adicionales, precios, cuotas): ver la v1 dentro de un mes
-- tiene que mostrar la v1, no la reserva de hoy. Un presupuesto de reserva
-- guarda también su evento, para la línea de tiempo del evento.

CREATE TABLE IF NOT EXISTS evento_presupuestos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"        uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  "eventoId"         uuid REFERENCES eventos(id) ON DELETE CASCADE,
  "reservaId"        uuid REFERENCES reservas(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  datos              jsonb NOT NULL,
  total              numeric(14,2),
  "incluyeRegimenes" boolean NOT NULL DEFAULT false,
  "usuarioId"        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "usuarioNombre"    varchar(255),
  "createdAt"        timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_presupuestos_ref_check CHECK ("eventoId" IS NOT NULL OR "reservaId" IS NOT NULL),
  CONSTRAINT evento_presupuestos_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS evento_presupuestos_reserva_version
  ON evento_presupuestos ("reservaId", version) WHERE "reservaId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS evento_presupuestos_evento_version
  ON evento_presupuestos ("eventoId", version) WHERE "reservaId" IS NULL;

CREATE OR REPLACE FUNCTION evento_presupuestos_inmutable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'evento_presupuestos no se modifica';
END $$;

DROP TRIGGER IF EXISTS evento_presupuestos_sin_update ON evento_presupuestos;
CREATE TRIGGER evento_presupuestos_sin_update BEFORE UPDATE ON evento_presupuestos
  FOR EACH ROW EXECUTE FUNCTION evento_presupuestos_inmutable();

-- 6. Totales con adicionales -----------------------------------------------------
--
-- Mismas columnas y en el mismo orden que la etapa 1; al final, cuánto suman
-- los adicionales del titular y cuánto los de cada pasajero.
--
--   neto  personas × precio de su categoría + adicionales del titular
--         − descuento (nunca negativo)
--
-- Los adicionales siguen el modo de IVA de la reserva, igual que los
-- cubiertos: con MAS_IVA su precio es neto y el IVA va encima; con INCLUIDO
-- ya lo trae. Los del pasajero no tocan ni el neto ni el saldo.

CREATE OR REPLACE VIEW reserva_totales AS
SELECT r.id                     AS "reservaId",
       r."clienteId",
       r."eventoId",
       r.adultos + r.menores + r.bebes + r.liberados AS personas,
       p.pa                     AS "precioAdulto",
       p.pm                     AS "precioMenor",
       p.pl                     AS "precioLiberado",
       i.modo                   AS "ivaModo",
       i.ali                    AS "ivaAlicuota",
       n.neto,
       t.iva,
       t.total,
       c.cobrado,
       t.total - c.cobrado      AS saldo,
       k.cobro                  AS "estadoCobro",
       CASE
         WHEN r.estado = 'CANCELADO'   THEN 'CAN'
         WHEN r.estado = 'PRESUPUESTO' THEN 'PRE'
         WHEN r.estado = 'APROBADO' THEN
           CASE k.cobro WHEN 'TOTAL' THEN 'ACT' WHEN 'PARCIAL' THEN 'ACP' ELSE 'ASC' END
         ELSE
           CASE k.cobro WHEN 'TOTAL' THEN 'FCT' ELSE 'FCP' END
       END                      AS sigla,
       ad.titular               AS adicionales,
       ad.pasajero              AS "adicionalesPasajero"
  FROM reservas r
  LEFT JOIN eventos e ON e.id = r."eventoId"
 CROSS JOIN LATERAL (
   SELECT COALESCE(r."precioAdulto", e."precioAdulto", 0) AS pa,
          COALESCE(r."precioMenor", e."precioMenor", 0)   AS pm,
          COALESCE(r."precioLiberado", 0)                 AS pl
 ) p
 CROSS JOIN LATERAL (
   SELECT COALESCE(r."ivaModo", e."ivaModo", 'FINAL') AS modo,
          COALESCE(r."ivaAlicuota", e."ivaAlicuota", 21) AS ali
 ) i
 CROSS JOIN LATERAL (
   SELECT COALESCE(sum(x.importe) FILTER (WHERE x.paga = 'TITULAR'), 0)::numeric(14,2)  AS titular,
          COALESCE(sum(x.importe) FILTER (WHERE x.paga = 'PASAJERO'), 0)::numeric(14,2) AS pasajero
     FROM (
       SELECT a.paga,
              round(a."precioUnitario" * CASE a.modalidad
                WHEN 'PERSONA' THEN COALESCE(a.cantidad, CASE a.aplica
                                                           WHEN 'ADULTOS' THEN r.adultos
                                                           WHEN 'MENORES' THEN r.menores
                                                           ELSE r.adultos + r.menores END)
                ELSE COALESCE(a.cantidad, 1) END, 2) AS importe
         FROM evento_adicionales a
        WHERE a."reservaId" = r.id
           OR (r."eventoId" IS NOT NULL AND a."eventoId" = r."eventoId")
     ) x
 ) ad
 CROSS JOIN LATERAL (
   SELECT GREATEST(r.adultos * p.pa + r.menores * p.pm + r.liberados * p.pl + ad.titular - r.descuento, 0)::numeric(14,2) AS neto
 ) n
 CROSS JOIN LATERAL (
   SELECT (CASE i.modo
             WHEN 'MAS_IVA'  THEN round(n.neto * i.ali / 100, 2)
             WHEN 'INCLUIDO' THEN round(n.neto - n.neto / (1 + i.ali / 100), 2)
             ELSE 0 END)::numeric(14,2) AS iva,
          (CASE i.modo
             WHEN 'MAS_IVA' THEN round(n.neto * (1 + i.ali / 100), 2)
             ELSE n.neto END)::numeric(14,2) AS total
 ) t
 CROSS JOIN LATERAL (
   SELECT COALESCE(sum(CASE pg.tipo WHEN 'DEVOLUCION' THEN -pg.monto ELSE pg.monto END), 0)::numeric(14,2) AS cobrado
     FROM reserva_pagos pg
    WHERE pg."reservaId" = r.id AND pg."anuladoAt" IS NULL
 ) c
 CROSS JOIN LATERAL (
   SELECT CASE
            WHEN t.total <= 0 OR c.cobrado >= t.total THEN 'TOTAL'
            WHEN c.cobrado > 0 THEN 'PARCIAL'
            ELSE 'SIN'
          END AS cobro
 ) k;

ALTER VIEW reserva_totales SET (security_invoker = true);

-- 7. Seguridad -----------------------------------------------------------------

ALTER TABLE evento_menus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_menu_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_regimen_menus  ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_adicionales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_presupuestos   ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION evento_presupuestos_inmutable() FROM PUBLIC;

-- 8. Comentarios ---------------------------------------------------------------

COMMENT ON TABLE evento_menus IS 'Menús: plantillas (sin dueño) y copias asignadas a un evento, una reserva o un régimen.';
COMMENT ON TABLE evento_menu_items IS 'Ítems de un menú por paso: producto del POS o línea a mano, con su rendimiento (por persona o cada N).';
COMMENT ON TABLE evento_regimen_menus IS 'Menú alternativo o indicación de cada régimen especial para todo el evento.';
COMMENT ON TABLE evento_adicionales IS 'Adicionales cargados a mano en un evento (los heredan sus reservas) o en una reserva; los paga el titular o cada pasajero.';
COMMENT ON TABLE evento_presupuestos IS 'Versiones congeladas de cada presupuesto generado (v1, v2…). No se modifican.';
COMMENT ON COLUMN evento_menu_items."precioCarta" IS 'Precio de carta equivalente. NULL en un producto del POS = su precio vigente.';
COMMENT ON COLUMN evento_menus."personasReferencia" IS 'Grupo para calcular el valor de carta por cubierto con porciones compartidas (plantilla y evento).';
COMMENT ON COLUMN evento_adicionales.cantidad IS 'PERSONA: NULL = las personas de la reserva a las que aplica. FIJO: NULL = 1.';
COMMENT ON COLUMN eventos."menuId" IS 'Menú del evento (copia en evento_menus). Lo heredan las reservas sin menú propio.';
COMMENT ON COLUMN reservas."menuId" IS 'Menú propio de la reserva (copia). NULL = el del evento.';
COMMENT ON COLUMN reserva_regimenes."menuId" IS 'Menú alternativo del régimen en esta reserva (copia). NULL = el del evento, o sólo la nota.';
COMMENT ON VIEW reserva_totales IS 'Neto, IVA, total, cobrado, saldo, estado de cobro, sigla y adicionales de cada reserva.';

COMMIT;
