-- Eventos y reservas: etapa 1.
--
-- Dos cosas que parecen la misma y no lo son:
--
--   EVENTO  = una "función" con condiciones compartidas: la cena de fin de
--             año del 31/12 turno noche, con su cupo, sus precios por
--             categoría, su IVA y su regla de seña. No tiene estado propio:
--             muestra el agregado de sus reservas.
--   RESERVA = un grupo de personas. Puede colgar de un evento (y hereda sus
--             condiciones) o estar sola. Un casamiento o un grupo de agencia
--             es un evento con una sola reserva; una reserva a la carta es una
--             reserva sin evento ni menú (nombre, teléfono, personas, mesa).
--
-- El estado manual (presupuesto → aprobado → finalizado, o cancelado) es de
-- la reserva. El estado de cobro NO se guarda: sale de los pagos contra el
-- total, en la vista `reserva_totales`. Una columna de cobro se
-- desincronizaría en cuanto alguien anule un pago.
--
-- varchar con CHECK y no enums de Postgres, por lo de siempre: el cliente
-- Prisma desplegado no se regenera, y un valor de enum que no conoce le rompe
-- la lectura de la tabla entera.
--
-- Pensado para lo que viene sin romper nada:
--   etapa 2 (menús, adicionales, presupuesto PDF): "menuId" nullable en evento,
--     reserva y régimen; los adicionales entran como tabla hija y se suman en
--     `reserva_totales` con CREATE OR REPLACE VIEW.
--   etapa 3 (plano, personal): `reserva_mesas` ya existe; el personal será
--     otra tabla hija del evento.
--   etapa 4 (finanzas, facturación): "movimientoId" nullable en el pago.
--
-- Puramente aditiva: sólo CREATE ... IF NOT EXISTS. Se puede correr dos veces.

BEGIN;

-- 1. Configuración y catálogos ------------------------------------------------

-- Una fila por empresa. Se crea en la primera lectura desde la app.
CREATE TABLE IF NOT EXISTS evento_configuracion (
  "clienteId"            uuid PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  -- Presupuesto sin respuesta: a partir de cuántos días sin pasar a aprobado
  -- se avisa.
  "diasPresupuesto"      smallint NOT NULL DEFAULT 7,
  -- Cuántos días antes de vencer una cuota se avisa que está por vencer.
  "diasAvisoVencimiento" smallint NOT NULL DEFAULT 3,
  -- Desde qué % del cupo el evento se marca "casi lleno".
  "avisoCupoPct"         smallint NOT NULL DEFAULT 90,
  "updatedAt"            timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_configuracion_rangos CHECK (
    "diasPresupuesto" BETWEEN 1 AND 365 AND "diasAvisoVencimiento" BETWEEN 0 AND 60
    AND "avisoCupoPct" BETWEEN 1 AND 100)
);

-- Listas que cada casa arma a su gusto: de dónde llegan las reservas y qué
-- tipos de evento hace. En la reserva y el evento se guarda la `clave`, no un
-- FK: desactivar un origen no tiene que dejar huérfanas las reservas viejas.
CREATE TABLE IF NOT EXISTS evento_catalogos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId" uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  lista       varchar(20) NOT NULL,
  clave       varchar(40) NOT NULL,
  nombre      varchar(80) NOT NULL,
  color       varchar(9),
  orden       integer NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,

  CONSTRAINT evento_catalogos_lista_check CHECK (lista IN ('ORIGEN', 'TIPO_EVENTO')),
  CONSTRAINT evento_catalogos_unico UNIQUE ("clienteId", lista, clave)
);

-- 2. Clientes de eventos ------------------------------------------------------
--
-- Quien contrata: un particular o una agencia. Las facturas salen a su
-- nombre, por eso lleva CUIT y condición de IVA. No es la tabla `clientes`
-- (que es la empresa usuaria de AXP) ni el cliente de mesa del POS.

CREATE TABLE IF NOT EXISTS evento_clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"     uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo            varchar(12) NOT NULL DEFAULT 'PARTICULAR',
  nombre          varchar(160) NOT NULL,
  cuit            varchar(13),
  -- CF consumidor final, RI responsable inscripto, MT monotributo, EX exento.
  "condicionIva"  varchar(4) NOT NULL DEFAULT 'CF',
  telefono        varchar(40),
  email           varchar(160),
  -- Lo que se lleva la agencia. Se guarda acá como valor por defecto; el
  -- cálculo de la comisión es de la etapa 4.
  "comisionPct"   numeric(5,2) NOT NULL DEFAULT 0,
  notas           text,
  activo          boolean NOT NULL DEFAULT true,
  "createdAt"     timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_clientes_tipo_check CHECK (tipo IN ('PARTICULAR', 'AGENCIA')),
  CONSTRAINT evento_clientes_iva_check CHECK ("condicionIva" IN ('CF', 'RI', 'MT', 'EX')),
  CONSTRAINT evento_clientes_comision_check CHECK ("comisionPct" BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS evento_clientes_cliente_idx ON evento_clientes ("clienteId", activo, nombre);

-- 3. Eventos ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS eventos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"         uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre              varchar(160) NOT NULL,
  -- Clave de evento_catalogos (lista TIPO_EVENTO).
  tipo                varchar(40) NOT NULL DEFAULT 'OTRO',
  fecha               date NOT NULL,
  "horaInicio"        time,
  "horaFin"           time,
  -- Personas. NULL = sin tope.
  cupo                integer,
  -- Precio por persona de cada categoría. Los bebés no pagan nunca; los
  -- liberados tampoco, salvo un precio preferencial que se pone a mano en la
  -- reserva.
  "precioAdulto"      numeric(14,2) NOT NULL DEFAULT 0,
  "precioMenor"       numeric(14,2) NOT NULL DEFAULT 0,
  --   FINAL     precio final, sin discriminar (consumidor final)
  --   MAS_IVA   el precio es neto y el IVA se suma encima
  --   INCLUIDO  el precio ya trae el IVA y se discrimina para adentro
  "ivaModo"           varchar(10) NOT NULL DEFAULT 'FINAL',
  "ivaAlicuota"       numeric(5,2) NOT NULL DEFAULT 21,
  --   SENA_PCT    seña de un % del total, el saldo después
  --   SENA_MONTO  seña fija por reserva, el saldo después
  --   TOTAL       todo por adelantado
  --   NINGUNA     sin regla (se cobra en el día)
  "pagoModo"          varchar(12) NOT NULL DEFAULT 'NINGUNA',
  "senaPct"           numeric(5,2),
  "senaMonto"         numeric(14,2),
  -- Hasta cuándo hay que pagar la seña (o el total, con TOTAL) y el saldo.
  -- Vencida la seña sólo se avisa: nunca se libera el lugar solo.
  "senaVence"         date,
  "saldoVence"        date,
  observaciones       text,
  -- Etapa 2: menú del evento. Sin FK todavía porque la tabla no existe.
  "menuId"            uuid,
  "createdById"       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"         timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT eventos_iva_check CHECK ("ivaModo" IN ('FINAL', 'MAS_IVA', 'INCLUIDO')),
  CONSTRAINT eventos_alicuota_check CHECK ("ivaAlicuota" BETWEEN 0 AND 100),
  CONSTRAINT eventos_pago_check CHECK ("pagoModo" IN ('SENA_PCT', 'SENA_MONTO', 'TOTAL', 'NINGUNA')),
  CONSTRAINT eventos_sena_check CHECK ("senaPct" IS NULL OR "senaPct" BETWEEN 0 AND 100),
  CONSTRAINT eventos_cupo_check CHECK (cupo IS NULL OR cupo > 0),
  CONSTRAINT eventos_precios_check CHECK ("precioAdulto" >= 0 AND "precioMenor" >= 0)
);

CREATE INDEX IF NOT EXISTS eventos_cliente_fecha_idx ON eventos ("clienteId", fecha);

-- Salones habilitados para el evento (los salones del POS).
CREATE TABLE IF NOT EXISTS evento_salones (
  "eventoId" uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  "sectorId" uuid NOT NULL REFERENCES pos_sectores(id) ON DELETE CASCADE,
  PRIMARY KEY ("eventoId", "sectorId")
);

-- 4. Reservas -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reservas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"         uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  -- Número correlativo por empresa: "la reserva 214" se dice por teléfono.
  numero              integer NOT NULL,
  -- Un evento con reservas no se borra: primero hay que moverlas o cancelarlas.
  "eventoId"          uuid REFERENCES eventos(id) ON DELETE RESTRICT,
  -- A nombre de quién se factura. Opcional: una reserva a la carta no lo necesita.
  "titularId"         uuid REFERENCES evento_clientes(id) ON DELETE SET NULL,
  -- Cómo se la nombra en la lista ("Familia Pérez", "Agencia Patagonia x 40").
  nombre              varchar(160) NOT NULL,
  "contactoNombre"    varchar(120),
  "contactoTelefono"  varchar(40),
  "contactoEmail"     varchar(160),
  -- Fecha y hora propias. En una reserva de evento arrancan con las del evento.
  fecha               date NOT NULL,
  hora                time,
  -- Salón (POS). En un evento, uno de sus salones habilitados.
  "sectorId"          uuid REFERENCES pos_sectores(id) ON DELETE SET NULL,
  adultos             integer NOT NULL DEFAULT 0,
  menores             integer NOT NULL DEFAULT 0,
  bebes               integer NOT NULL DEFAULT 0,
  liberados           integer NOT NULL DEFAULT 0,
  -- Precios propios de esta reserva. NULL = el del evento (o 0 sin evento).
  -- El de liberados NULL = gratis.
  "precioAdulto"      numeric(14,2),
  "precioMenor"       numeric(14,2),
  "precioLiberado"    numeric(14,2),
  -- IVA propio. NULL = el del evento (o FINAL sin evento).
  "ivaModo"           varchar(10),
  "ivaAlicuota"       numeric(5,2),
  -- Descuento en pesos, sobre el neto antes de IVA.
  descuento           numeric(14,2) NOT NULL DEFAULT 0,
  "descuentoNota"     varchar(200),
  estado              varchar(12) NOT NULL DEFAULT 'PRESUPUESTO',
  -- Qué pasó con la plata al cancelar.
  "cancelacionSena"   varchar(10),
  "aprobadaAt"        timestamptz(3),
  "finalizadaAt"      timestamptz(3),
  "canceladaAt"       timestamptz(3),
  -- Clave de evento_catalogos (lista ORIGEN).
  origen              varchar(40),
  -- La mesa no se toca al reacomodar el salón (la pidió el cliente, la eligió
  -- la agencia). El plano de la etapa 3 lo respeta.
  "mesaInamovible"    boolean NOT NULL DEFAULT false,
  observaciones       text,
  -- Lo que va impreso en la hoja de servicio para el salón y la cocina.
  "notaServicio"      text,
  -- Etapa 2.
  "menuId"            uuid,
  "createdById"       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"         timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT reservas_numero_unico UNIQUE ("clienteId", numero),
  CONSTRAINT reservas_estado_check CHECK (estado IN ('PRESUPUESTO', 'APROBADO', 'FINALIZADO', 'CANCELADO')),
  CONSTRAINT reservas_cancelacion_check CHECK (
    "cancelacionSena" IS NULL OR ("cancelacionSena" IN ('DEVUELTA', 'RETENIDA') AND estado = 'CANCELADO')),
  CONSTRAINT reservas_personas_check CHECK (adultos >= 0 AND menores >= 0 AND bebes >= 0 AND liberados >= 0),
  CONSTRAINT reservas_iva_check CHECK ("ivaModo" IS NULL OR "ivaModo" IN ('FINAL', 'MAS_IVA', 'INCLUIDO')),
  CONSTRAINT reservas_alicuota_check CHECK ("ivaAlicuota" IS NULL OR "ivaAlicuota" BETWEEN 0 AND 100),
  CONSTRAINT reservas_precios_check CHECK (
    COALESCE("precioAdulto", 0) >= 0 AND COALESCE("precioMenor", 0) >= 0
    AND COALESCE("precioLiberado", 0) >= 0 AND descuento >= 0)
);

CREATE INDEX IF NOT EXISTS reservas_cliente_fecha_idx ON reservas ("clienteId", fecha);
CREATE INDEX IF NOT EXISTS reservas_evento_idx ON reservas ("eventoId");
CREATE INDEX IF NOT EXISTS reservas_titular_idx ON reservas ("titularId");
CREATE INDEX IF NOT EXISTS reservas_cliente_estado_idx ON reservas ("clienteId", estado);

-- Regímenes especiales: cuántos y qué. En la etapa 2 cada uno tendrá su menú.
CREATE TABLE IF NOT EXISTS reserva_regimenes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservaId" uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  tipo        varchar(12) NOT NULL,
  cantidad    integer NOT NULL DEFAULT 1,
  -- "alergia al maní", "sin TACC estricto: cocina aparte".
  nota        varchar(300),
  "menuId"    uuid,

  CONSTRAINT reserva_regimenes_tipo_check
    CHECK (tipo IN ('CELIACO', 'VEGETARIANO', 'VEGANO', 'SIN_LACTOSA', 'ALERGIA', 'OTRO')),
  CONSTRAINT reserva_regimenes_cantidad_check CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS reserva_regimenes_reserva_idx ON reserva_regimenes ("reservaId");

-- Mesas asignadas (del POS). Una reserva grande ocupa varias.
CREATE TABLE IF NOT EXISTS reserva_mesas (
  "reservaId" uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  "mesaId"    uuid NOT NULL REFERENCES pos_mesas(id) ON DELETE CASCADE,
  PRIMARY KEY ("reservaId", "mesaId")
);

CREATE INDEX IF NOT EXISTS reserva_mesas_mesa_idx ON reserva_mesas ("mesaId");

-- 5. Plan de pagos y pagos ----------------------------------------------------
--
-- La cuota se define por monto fijo, por % del total o como "el resto"
-- (las dos en NULL). Así el plan acompaña al total cuando cambian las
-- personas, sin que nadie tenga que rehacerlo.

CREATE TABLE IF NOT EXISTS reserva_cuotas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservaId"  uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  concepto     varchar(60) NOT NULL,
  monto        numeric(14,2),
  porcentaje   numeric(5,2),
  vencimiento  date,
  orden        integer NOT NULL DEFAULT 0,

  CONSTRAINT reserva_cuotas_forma_check CHECK (monto IS NULL OR porcentaje IS NULL),
  CONSTRAINT reserva_cuotas_monto_check CHECK (monto IS NULL OR monto > 0),
  CONSTRAINT reserva_cuotas_pct_check CHECK (porcentaje IS NULL OR porcentaje BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS reserva_cuotas_reserva_idx ON reserva_cuotas ("reservaId", orden);

-- Los pagos no se borran: se anulan, y la anulación queda en la línea de
-- tiempo. Una devolución de seña es una fila DEVOLUCION, no un pago negativo.
CREATE TABLE IF NOT EXISTS reserva_pagos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"      uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  "reservaId"      uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  tipo             varchar(12) NOT NULL DEFAULT 'PAGO',
  fecha            date NOT NULL,
  monto            numeric(14,2) NOT NULL,
  medio            varchar(14) NOT NULL,
  comprobante      varchar(120),
  nota             varchar(300),
  "usuarioId"      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "usuarioNombre"  varchar(255),
  "anuladoAt"      timestamptz(3),
  "anuladoPor"     varchar(255),
  "anuladoMotivo"  varchar(300),
  -- Etapa 4: el movimiento de Finanzas que generó este cobro.
  "movimientoId"   uuid,
  "createdAt"      timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT reserva_pagos_tipo_check CHECK (tipo IN ('PAGO', 'DEVOLUCION')),
  CONSTRAINT reserva_pagos_monto_check CHECK (monto > 0),
  CONSTRAINT reserva_pagos_medio_check
    CHECK (medio IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'MERCADOPAGO', 'OTRO'))
);

CREATE INDEX IF NOT EXISTS reserva_pagos_reserva_idx ON reserva_pagos ("reservaId");
CREATE INDEX IF NOT EXISTS reserva_pagos_cliente_fecha_idx ON reserva_pagos ("clienteId", fecha);

-- 6. Línea de tiempo ----------------------------------------------------------
--
-- Dos cosas distintas que se muestran juntas:
--
--   auditoría  lo que hizo el sistema: cada cambio, con quién, cuándo, y el
--              antes y el después. Se escribe desde el servidor en la misma
--              transacción que el cambio, y no se modifica nunca.
--   agenda     lo que hace la gente: la visita previa, la degustación, el
--              llamado para confirmar. Tiene responsable y se tacha.

-- Sin FK a eventos/reservas a propósito: si un evento vacío se borra, el
-- rastro de que existió tiene que quedar.
CREATE TABLE IF NOT EXISTS evento_auditoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"     uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  "eventoId"      uuid,
  "reservaId"     uuid,
  -- creada, editada, estado, personas, precios, mesas, regimenes, pago,
  -- pago_anulado, cuotas, cupo_excedido, borrado…
  accion          varchar(30) NOT NULL,
  descripcion     text NOT NULL,
  antes           jsonb,
  despues         jsonb,
  "usuarioId"     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Congelado: si el usuario se va, el nombre tiene que seguir apareciendo.
  "usuarioNombre" varchar(255),
  "createdAt"     timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_auditoria_ref_check CHECK ("eventoId" IS NOT NULL OR "reservaId" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS evento_auditoria_evento_idx ON evento_auditoria ("eventoId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS evento_auditoria_reserva_idx ON evento_auditoria ("reservaId", "createdAt" DESC);

-- Inmutable: ni la app ni nadie con acceso a la base reescribe la historia.
-- El DELETE sí se deja pasar, para que el borrado en cascada de una empresa
-- no quede trabado.
CREATE OR REPLACE FUNCTION evento_auditoria_inmutable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'evento_auditoria no se modifica';
END $$;

DROP TRIGGER IF EXISTS evento_auditoria_sin_update ON evento_auditoria;
CREATE TRIGGER evento_auditoria_sin_update BEFORE UPDATE ON evento_auditoria
  FOR EACH ROW EXECUTE FUNCTION evento_auditoria_inmutable();

CREATE TABLE IF NOT EXISTS evento_agenda (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"          uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  "eventoId"           uuid REFERENCES eventos(id) ON DELETE CASCADE,
  "reservaId"          uuid REFERENCES reservas(id) ON DELETE CASCADE,
  tipo                 varchar(20) NOT NULL DEFAULT 'OTRO',
  titulo               varchar(200) NOT NULL,
  "fechaHora"          timestamptz(3) NOT NULL,
  "responsableId"      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "responsableNombre"  varchar(255),
  estado               varchar(10) NOT NULL DEFAULT 'PENDIENTE',
  resultado            text,
  "completadaAt"       timestamptz(3),
  "createdById"        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"          timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT evento_agenda_ref_check CHECK ("eventoId" IS NOT NULL OR "reservaId" IS NOT NULL),
  CONSTRAINT evento_agenda_tipo_check CHECK (tipo IN
    ('VISITA', 'DEGUSTACION', 'LLAMADO', 'RECORDATORIO_SALDO', 'REUNION', 'NOVEDAD', 'OTRO')),
  CONSTRAINT evento_agenda_estado_check CHECK (estado IN ('PENDIENTE', 'HECHA', 'CANCELADA'))
);

CREATE INDEX IF NOT EXISTS evento_agenda_cliente_fecha_idx ON evento_agenda ("clienteId", "fechaHora");
CREATE INDEX IF NOT EXISTS evento_agenda_evento_idx ON evento_agenda ("eventoId");
CREATE INDEX IF NOT EXISTS evento_agenda_reserva_idx ON evento_agenda ("reservaId");

-- 7. Totales y sigla ----------------------------------------------------------
--
-- Una sola definición de cuánto vale una reserva y cuánto se cobró, para que
-- la lista, la ficha, el calendario y las alertas no hagan cada uno su
-- cuenta. En la etapa 2 se reemplaza agregando los adicionales al neto.
--
--   neto      personas × precio de su categoría − descuento (nunca negativo)
--   iva       según el modo: encima (MAS_IVA), adentro (INCLUIDO) o nada
--   total     lo que paga el cliente
--   cobrado   pagos − devoluciones, sin los anulados
--
-- Estado de cobro: SIN (nada), PARCIAL, TOTAL. Una reserva con total cero
-- (a la carta, sin precio) no debe nada, así que cuenta como TOTAL.
--
-- Sigla: PRE, ASC, ACP, ACT, FCP, FCT, CAN. Finalizada sin ningún cobro va
-- como FCP: quedó plata por cobrar, que es lo que la sigla tiene que decir.

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
       END                      AS sigla
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
   SELECT GREATEST(r.adultos * p.pa + r.menores * p.pm + r.liberados * p.pl - r.descuento, 0)::numeric(14,2) AS neto
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

-- 8. Seguridad (igual que manual_supabase_linter_seguridad.sql) ---------------
--
-- La app entra como postgres; con RLS sin políticas, anon/authenticated no ven
-- nada por la API REST de Supabase.

ALTER TABLE evento_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_catalogos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_clientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_salones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_regimenes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_mesas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_cuotas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_pagos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_auditoria     ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_agenda        ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION evento_auditoria_inmutable() FROM PUBLIC;

-- 9. Comentarios --------------------------------------------------------------

COMMENT ON TABLE evento_configuracion IS 'Umbrales de las alertas de eventos, uno por empresa.';
COMMENT ON TABLE evento_catalogos IS 'Listas configurables: orígenes de reserva y tipos de evento.';
COMMENT ON TABLE evento_clientes IS 'Quien contrata un evento o reserva (particular o agencia); las facturas salen a su nombre.';
COMMENT ON TABLE eventos IS 'Función con condiciones compartidas (fecha, turno, cupo, precios, IVA, seña). Su estado es el agregado de sus reservas.';
COMMENT ON TABLE evento_salones IS 'Salones del POS (pos_sectores) habilitados para un evento.';
COMMENT ON TABLE reservas IS 'Grupo de personas. Cuelga de un evento (hereda condiciones) o va sola. Estado manual; el cobro se calcula en reserva_totales.';
COMMENT ON TABLE reserva_regimenes IS 'Regímenes especiales de una reserva: tipo, cantidad y nota. El menú por régimen es de la etapa 2.';
COMMENT ON TABLE reserva_mesas IS 'Mesas del POS asignadas a una reserva.';
COMMENT ON TABLE reserva_cuotas IS 'Plan de pagos: monto fijo, % del total o el resto (ambos NULL).';
COMMENT ON TABLE reserva_pagos IS 'Pagos y devoluciones registrados. No se borran: se anulan.';
COMMENT ON TABLE evento_auditoria IS 'Rastro automático e inmutable de cada cambio en eventos y reservas.';
COMMENT ON TABLE evento_agenda IS 'Seguimiento cargado por personas: visitas, degustaciones, llamados, recordatorios.';
COMMENT ON VIEW reserva_totales IS 'Neto, IVA, total, cobrado, saldo, estado de cobro y sigla de cada reserva.';
COMMENT ON COLUMN reservas."precioLiberado" IS 'Precio preferencial de los liberados. NULL = gratis.';
COMMENT ON COLUMN reservas."mesaInamovible" IS 'La mesa asignada no se mueve al reacomodar el salón.';
COMMENT ON COLUMN eventos."menuId" IS 'Etapa 2: menú del evento. Sin FK hasta que exista la tabla.';
COMMENT ON COLUMN reserva_pagos."movimientoId" IS 'Etapa 4: movimiento de Finanzas generado por este cobro.';

COMMIT;
