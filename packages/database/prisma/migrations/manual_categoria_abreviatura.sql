-- Abreviatura de las categorías de compra (badge corto en Items y documentos).
ALTER TABLE "compra_categorias" ADD COLUMN IF NOT EXISTS "abreviatura" varchar(6);

UPDATE "compra_categorias" c SET "abreviatura" = v.abrev
  FROM (VALUES
    ('Carnes', 'CAR'), ('Aves', 'AVE'), ('Pescados y mariscos', 'PES'), ('Fiambres', 'FIA'),
    ('Lácteos y quesos', 'LAC'), ('Verduras y frutas', 'VER'), ('Almacén', 'ALM'),
    ('Panificados y pastas', 'PAN'), ('Congelados', 'CONG'), ('Bebidas', 'BEB'),
    ('Vinos', 'VIN'), ('Cervezas', 'CERV'), ('Limpieza', 'LIM'), ('Descartables', 'DESC'),
    ('Mantenimiento', 'MANT'), ('Bazar y vajilla', 'BAZ'), ('Indumentaria y blanquería', 'IND'),
    ('Servicios', 'SERV'), ('Otros', 'OTR')
  ) AS v(nombre, abrev)
 WHERE c.nombre = v.nombre AND c."abreviatura" IS NULL;
