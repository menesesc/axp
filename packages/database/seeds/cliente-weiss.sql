-- Script para crear cliente Weiss en la base de datos
-- Conectar con: psql [DATABASE_URL]

INSERT INTO "Cliente" (
  id, 
  nombre, 
  cuit, 
  "razonSocial", 
  email, 
  telefono,
  direccion,
  ciudad,
  provincia,
  "codigoPostal",
  pais,
  activo,
  "createdAt",
  "updatedAt"
) VALUES (
  '081c9039-9236-4f33-a29a-c63f88bc2e58',
  'Weiss',
  '33712152449',
  'Weiss S.A.',
  'contacto@weiss.com',
  '1145678900',
  'Av. Corrientes 1234',
  'Buenos Aires',
  'CABA',
  'C1043',
  'Argentina',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Verificar
SELECT id, nombre, cuit, activo FROM "Cliente";
