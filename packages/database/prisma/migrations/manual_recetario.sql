-- =====================================================================
-- Recetario
--
-- Idempotente.
--
-- Libro de recetas de cocina: platos, postres, tragos. NO confundir con
-- `sales_recipes`, que es la receta técnica que descuenta insumos del stock.
-- Son dos cosas distintas y conviven:
--   sales_recipes  → cuánto insumo consume un producto vendido (conciliación)
--   recetas        → cómo se hace un plato (fotos, pasos, el equipo lo lee)
--
-- Un ingrediente del recetario puede apuntar a un insumo (`insumoId`), y de
-- ahí sale el costo por porción. Es opcional: una receta sirve igual sin
-- costear, y costear 200 recetas de una no es realista.
--
-- Los textos quedan en varchar/text, no en enum: cambiar un enum en Postgres
-- es una migración; cambiar un varchar, un UPDATE.
-- =====================================================================

-- --------------------------------------------------------------------
-- Logo de la empresa (encabezado del recetario). Va a R2 como todo lo demás.
-- --------------------------------------------------------------------
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS "logoKey" varchar(500);

-- --------------------------------------------------------------------
-- Categorías y dispositivos: ambos los administra el cliente
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receta_categorias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId" uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre      varchar(80)  NOT NULL,
  emoji       varchar(16),
  color       varchar(9),
  orden       int          NOT NULL DEFAULT 0,
  activo      boolean      NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "receta_categorias_cliente_nombre_key"
  ON receta_categorias ("clienteId", nombre);

CREATE TABLE IF NOT EXISTS dispositivos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId" uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre      varchar(80) NOT NULL,
  emoji       varchar(16),
  orden       int         NOT NULL DEFAULT 0,
  activo      boolean     NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "dispositivos_cliente_nombre_key"
  ON dispositivos ("clienteId", nombre);

-- --------------------------------------------------------------------
-- Recetas
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recetas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clienteId"   uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  -- Si se borra la categoría, la receta no se pierde: queda sin clasificar.
  "categoriaId" uuid REFERENCES receta_categorias(id) ON DELETE SET NULL,
  titulo        varchar(200) NOT NULL,
  descripcion   text,
  -- 'borrador' | 'publicada'. En borrador solo la ve quien puede editar.
  estado        varchar(20)  NOT NULL DEFAULT 'borrador',
  "prepMin"     int,
  "totalMin"    int,
  porciones     int          NOT NULL DEFAULT 1,
  -- 'Fácil' | 'Media' | 'Difícil'
  dificultad    varchar(20),
  autor         varchar(80),
  "fotoKey"     varchar(500),
  "youtubeUrl"  varchar(500),
  destacada     boolean      NOT NULL DEFAULT false,
  "createdById" uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"   timestamptz(3) NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamptz(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "recetas_cliente_estado_idx" ON recetas ("clienteId", estado);
CREATE INDEX IF NOT EXISTS "recetas_categoria_idx"      ON recetas ("categoriaId");

CREATE TABLE IF NOT EXISTS receta_dispositivos (
  "recetaId"      uuid NOT NULL REFERENCES recetas(id)      ON DELETE CASCADE,
  "dispositivoId" uuid NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
  PRIMARY KEY ("recetaId", "dispositivoId")
);

-- `seccion` agrupa ("Masa", "Relleno"); NULL = sin agrupar.
-- `insumoId` opcional: con él se calcula el costo, sin él la receta igual sirve.
CREATE TABLE IF NOT EXISTS receta_ingredientes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recetaId" uuid NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  seccion    varchar(80),
  orden      int          NOT NULL DEFAULT 0,
  nombre     varchar(200) NOT NULL,
  cantidad   numeric(14,4),
  unidad     varchar(20),
  nota       varchar(200),
  "insumoId" uuid REFERENCES insumos(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "receta_ingredientes_receta_idx" ON receta_ingredientes ("recetaId", orden);
CREATE INDEX IF NOT EXISTS "receta_ingredientes_insumo_idx" ON receta_ingredientes ("insumoId");

CREATE TABLE IF NOT EXISTS receta_pasos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recetaId" uuid NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  seccion    varchar(80),
  orden      int  NOT NULL DEFAULT 0,
  texto      text NOT NULL
);
CREATE INDEX IF NOT EXISTS "receta_pasos_receta_idx" ON receta_pasos ("recetaId", orden);

CREATE TABLE IF NOT EXISTS receta_sugerencias (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recetaId" uuid NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  orden      int  NOT NULL DEFAULT 0,
  texto      text NOT NULL
);
CREATE INDEX IF NOT EXISTS "receta_sugerencias_receta_idx" ON receta_sugerencias ("recetaId", orden);

-- Nota privada: una por usuario y receta. No la ve nadie más.
CREATE TABLE IF NOT EXISTS receta_notas (
  "recetaId"  uuid NOT NULL REFERENCES recetas(id)  ON DELETE CASCADE,
  "usuarioId" uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto       text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("recetaId", "usuarioId")
);

-- Favoritas, también por usuario.
CREATE TABLE IF NOT EXISTS receta_favoritas (
  "recetaId"  uuid NOT NULL REFERENCES recetas(id)  ON DELETE CASCADE,
  "usuarioId" uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("recetaId", "usuarioId")
);

-- --------------------------------------------------------------------
-- Semilla: categorías y dispositivos iniciales por cliente.
-- Solo si el cliente todavía no tiene ninguno, para no pisar lo que edite.
-- --------------------------------------------------------------------
INSERT INTO receta_categorias ("clienteId", nombre, emoji, color, orden)
SELECT c.id, v.nombre, v.emoji, v.color, v.orden
  FROM clientes c
 CROSS JOIN (VALUES
   ('Entradas','🥗','#16a34a',10), ('Platos','🍽️','#ea580c',20),
   ('Parrilla','🔥','#dc2626',30), ('Pastas','🍝','#ca8a04',40),
   ('Salsas','🫕','#65a30d',50),   ('Guarniciones','🥔','#0d9488',60),
   ('Postres','🍰','#db2777',70),  ('Tragos','🍸','#0891b2',80)
 ) AS v(nombre, emoji, color, orden)
 WHERE NOT EXISTS (SELECT 1 FROM receta_categorias x WHERE x."clienteId" = c.id);

INSERT INTO dispositivos ("clienteId", nombre, emoji, orden)
SELECT c.id, v.nombre, v.emoji, v.orden
  FROM clientes c
 CROSS JOIN (VALUES
   ('Anafe','🔥',10), ('Horno Rational','🌡️',20), ('Horno convector','♨️',30),
   ('iVario','🍲',40), ('Abatidor','❄️',50), ('Parrilla','🪵',60),
   ('Amasadora','🌀',70), ('Sous-vide','💧',80)
 ) AS v(nombre, emoji, orden)
 WHERE NOT EXISTS (SELECT 1 FROM dispositivos x WHERE x."clienteId" = c.id);
