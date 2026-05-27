-- Safe migration: subscripciones de informes recurrentes (ventas) por email
-- Solo cambios aditivos. No drop ni rename de nada existente.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "FrecuenciaInforme" AS ENUM ('DIARIA', 'SEMANAL', 'MENSUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusInformeRun" AS ENUM ('OK', 'FAIL', 'SKIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. sales_report_subscriptions
CREATE TABLE IF NOT EXISTS "sales_report_subscriptions" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "clienteId"   UUID NOT NULL,
  "nombre"      VARCHAR(120) NOT NULL,
  "frecuencia"  "FrecuenciaInforme" NOT NULL,
  "diaSemana"   INTEGER,
  "diaMes"      INTEGER,
  "hora"        VARCHAR(5) NOT NULL DEFAULT '07:00',
  "tz"          VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  "sucursal"    VARCHAR(100),
  "topN"        INTEGER NOT NULL DEFAULT 10,
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_report_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sales_report_subscriptions_clienteId_idx"
  ON "sales_report_subscriptions"("clienteId");
CREATE INDEX IF NOT EXISTS "sales_report_subscriptions_activo_frecuencia_idx"
  ON "sales_report_subscriptions"("activo", "frecuencia");

DO $$ BEGIN
  ALTER TABLE "sales_report_subscriptions"
    ADD CONSTRAINT "sales_report_subscriptions_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. sales_report_subscription_recipients
CREATE TABLE IF NOT EXISTS "sales_report_subscription_recipients" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId"  UUID NOT NULL,
  "email"           VARCHAR(255) NOT NULL,
  "nombre"          VARCHAR(255),
  "usuarioId"       UUID,
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_report_subscription_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_report_subscription_recipients_sub_email_key"
  ON "sales_report_subscription_recipients"("subscriptionId", "email");
CREATE INDEX IF NOT EXISTS "sales_report_subscription_recipients_subscriptionId_idx"
  ON "sales_report_subscription_recipients"("subscriptionId");

DO $$ BEGIN
  ALTER TABLE "sales_report_subscription_recipients"
    ADD CONSTRAINT "sales_report_subscription_recipients_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "sales_report_subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. sales_report_runs (auditoría e idempotencia)
CREATE TABLE IF NOT EXISTS "sales_report_runs" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId"      UUID NOT NULL,
  "fechaInformeDesde"   DATE NOT NULL,
  "fechaInformeHasta"   DATE NOT NULL,
  "ejecutadoEn"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"              "StatusInformeRun" NOT NULL,
  "destinatariosCount"  INTEGER NOT NULL DEFAULT 0,
  "resendMessageIds"    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "error"               TEXT,
  CONSTRAINT "sales_report_runs_pkey" PRIMARY KEY ("id")
);

-- Idempotencia: misma subscripción + mismo período = un solo envío.
CREATE UNIQUE INDEX IF NOT EXISTS "sales_report_runs_sub_fechaDesde_key"
  ON "sales_report_runs"("subscriptionId", "fechaInformeDesde");
CREATE INDEX IF NOT EXISTS "sales_report_runs_sub_ejecutadoEn_idx"
  ON "sales_report_runs"("subscriptionId", "ejecutadoEn" DESC);

DO $$ BEGIN
  ALTER TABLE "sales_report_runs"
    ADD CONSTRAINT "sales_report_runs_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "sales_report_subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
