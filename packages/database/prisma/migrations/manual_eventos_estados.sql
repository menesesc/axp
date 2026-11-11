-- Eventos y reservas: estados simples y % cobrado.
--
-- Hasta acá la sigla mezclaba el estado manual con el de cobro (ASC, ACP,
-- ACT, FCP, FCT). Ahora el estado es SÓLO lo que decide una persona:
--
--   PRE  Presupuestado  se mandó el presupuesto, falta la respuesta
--   APR  Aprobado       el cliente aceptó
--   REC  Rechazado      el cliente no aceptó el presupuesto (nuevo)
--   CAN  Cancelado      estaba aprobada y se cayó
--   FIN  Finalizado     ya pasó
--
-- El cobro deja de ser un estado: se muestra como % cobrado (cobrado /
-- total), que la vista calcula en la columna nueva "porcentajeCobrado". Con
-- total cero queda NULL (en pantalla, "—"): no hay nada que cobrar.
--
-- Los valores guardados en reservas.estado no cambian (PRESUPUESTO,
-- APROBADO, FINALIZADO, CANCELADO); sólo se suma RECHAZADO. La columna
-- "estadoCobro" de la vista queda por compatibilidad (no se puede sacar una
-- columna de una vista con CREATE OR REPLACE) y "sigla" pasa a ser la del
-- estado.
--
-- Puramente aditiva e idempotente: la constraint del estado se rehace dentro
-- de un DO, la columna nueva va con IF NOT EXISTS y la vista se reemplaza
-- con las mismas columnas en el mismo orden (la nueva, al final). No borra
-- ni modifica datos. Se puede correr dos veces.

BEGIN;

-- 1. Estado RECHAZADO -----------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_estado_check' AND conrelid = 'reservas'::regclass) THEN
    ALTER TABLE reservas DROP CONSTRAINT reservas_estado_check;
  END IF;
  ALTER TABLE reservas ADD CONSTRAINT reservas_estado_check
    CHECK (estado IN ('PRESUPUESTO', 'APROBADO', 'RECHAZADO', 'CANCELADO', 'FINALIZADO'));
END
$$;

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS "rechazadaAt" timestamptz(3);

-- 2. Vista de totales -----------------------------------------------------------

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
       CASE r.estado
         WHEN 'PRESUPUESTO' THEN 'PRE'
         WHEN 'APROBADO'    THEN 'APR'
         WHEN 'RECHAZADO'   THEN 'REC'
         WHEN 'CANCELADO'   THEN 'CAN'
         ELSE 'FIN'
       END                      AS sigla,
       ad.titular               AS adicionales,
       ad.pasajero              AS "adicionalesPasajero",
       -- Nuevo, al final: Postgres no deja reordenar columnas de una vista.
       CASE WHEN t.total > 0 THEN round(c.cobrado * 100 / t.total, 1) END AS "porcentajeCobrado"
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

-- 3. Comentarios ----------------------------------------------------------------

COMMENT ON COLUMN reservas.estado IS 'PRESUPUESTO | APROBADO | RECHAZADO | CANCELADO | FINALIZADO. Lo pone una persona; el cobro no es un estado.';
COMMENT ON COLUMN reservas."rechazadaAt" IS 'Cuándo el cliente rechazó el presupuesto.';
COMMENT ON VIEW reserva_totales IS 'Neto, IVA, total, cobrado, saldo, sigla del estado (PRE, APR, REC, CAN, FIN), adicionales y % cobrado de cada reserva.';

COMMIT;
