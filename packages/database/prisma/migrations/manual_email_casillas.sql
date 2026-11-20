-- Casilla de email por empresa + registro de emails recibidos.
-- Solo cambios aditivos. No drop ni rename de nada existente.
--
-- El MX de axp.com.ar apunta a Resend inbound: cualquier <algo>@axp.com.ar
-- llega al webhook /api/email/inbound. Con "casillaEmail" el webhook sabe de
-- qué empresa es el mail mirando el destinatario (walpina@axp.com.ar), sin
-- depender de que el remitente sea un usuario dado de alta.

BEGIN;

-- 1. clientes."casillaEmail": slug en minúsculas, la parte antes de @axp.com.ar.
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "casillaEmail" VARCHAR(40);

CREATE UNIQUE INDEX IF NOT EXISTS "clientes_casillaEmail_key"
  ON "clientes"("casillaEmail");

DO $$ BEGIN
  ALTER TABLE "clientes"
    ADD CONSTRAINT "clientes_casillaEmail_formato_chk"
    CHECK (
      "casillaEmail" IS NULL OR (
        "casillaEmail" ~ '^[a-z0-9]([a-z0-9.-]{0,38}[a-z0-9])?$'
        AND "casillaEmail" <> 'inbox'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- WALPINA S.A.S. → walpina@axp.com.ar (solo si todavía no tiene casilla).
UPDATE "clientes"
   SET "casillaEmail" = 'walpina'
 WHERE "cuit" = '30719238692'
   AND "casillaEmail" IS NULL;

-- 2. email_recibidos: un registro por email que entra al webhook, para ver en
--    Canales qué llegó y qué pasó (procesado, sin adjunto, no resuelto, etc.).
CREATE TABLE IF NOT EXISTS "email_recibidos" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clienteId"     UUID,
  "fecha"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remitente"     VARCHAR(320) NOT NULL DEFAULT '',
  "destinatario"  TEXT NOT NULL DEFAULT '',
  "asunto"        TEXT NOT NULL DEFAULT '',
  "emailId"       VARCHAR(100),
  "resultado"     VARCHAR(30) NOT NULL,
  "detalle"       TEXT,
  "adjuntos"      INTEGER NOT NULL DEFAULT 0,
  -- Datos estructurados (código y link de confirmación de Gmail, nombres de
  -- adjuntos, etc.).
  "extra"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_recibidos_pkey" PRIMARY KEY ("id")
);

-- varchar + CHECK en vez de enum: agregar un valor después es un ALTER simple.
DO $$ BEGIN
  ALTER TABLE "email_recibidos"
    ADD CONSTRAINT "email_recibidos_resultado_chk"
    CHECK ("resultado" IN (
      'PROCESADO', 'SIN_ADJUNTO', 'DUPLICADO', 'NO_RESUELTO',
      'MAXIREST', 'CONFIRMACION_GMAIL', 'ERROR'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Un registro por email de Resend: si el webhook se reintenta, se actualiza.
CREATE UNIQUE INDEX IF NOT EXISTS "email_recibidos_emailId_key"
  ON "email_recibidos"("emailId") WHERE "emailId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "email_recibidos_clienteId_fecha_idx"
  ON "email_recibidos"("clienteId", "fecha" DESC);

DO $$ BEGIN
  ALTER TABLE "email_recibidos"
    ADD CONSTRAINT "email_recibidos_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Igual que el resto de las tablas (ver manual_supabase_linter_seguridad.sql):
-- RLS sin políticas, la app entra como postgres/service_role.
ALTER TABLE "email_recibidos" ENABLE ROW LEVEL SECURITY;

COMMIT;
